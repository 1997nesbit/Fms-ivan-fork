"""
Management command: seed_showroom

Wipes all Sales, Reservations, ShowroomItems (and their images) and the
global CatalogueProduct table, then re-creates a real-life furniture
lineup — standalone pieces and multi-piece sets — as showroom stock at
every active branch, plus a matching CatalogueProduct entry per item.

Usage
-----
    py manage.py seed_showroom
"""

import urllib.request
from urllib.error import URLError

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand

from branches.models import Branch
from shop.models import Category, CatalogueProduct, Reservation, Sale, ShowroomItem, ShowroomItemImage
from shop.services import _generate_sku

USER_AGENT = "Mozilla/5.0 (StyleMySpace showroom seeder)"

# (name, room_code, type_code, category, description, price, quantity, image_url)
# type_code is None for sets (is_set=True) — SKU flag "S" / type "SET" is applied automatically.
STANDALONE_ITEMS = [
    ("3-Seater Sofa", "LR", "SFA", "Sofas",
     "Comfortable 3-seater fabric sofa, ideal for living rooms.",
     4_200_000, 4,
     "https://images.unsplash.com/photo-1484101403633-562f891dc89a?fm=jpg&q=80&w=1200"),
    ("King Bed Frame", "BD", "BED", "Beds",
     "Solid wood king-size bed frame with headboard.",
     3_200_000, 3,
     "https://images.unsplash.com/photo-1615651586679-c40132c57ba3?fm=jpg&q=80&w=1200"),
    ("4-Door Wardrobe", "BD", "WRD", "Storage",
     "Spacious 4-door wardrobe with shelving and hanging rail.",
     5_800_000, 2,
     "https://images.unsplash.com/photo-1672137233327-37b0c1049e77?fm=jpg&q=80&w=1200"),
    ("TV Stand 1.8m", "LR", "TVU", "Living Room",
     "Modern 1.8m TV stand with storage cabinets.",
     1_200_000, 5,
     "https://images.unsplash.com/photo-1567690187548-f07b1d7bf5a9?fm=jpg&q=80&w=1200"),
    ("Office Desk 140x70", "OF", "DSK", "Office",
     "Sturdy wooden office desk, 140x70cm work surface.",
     2_100_000, 4,
     "https://images.unsplash.com/photo-1519219788971-8d9797e0928e?fm=jpg&q=80&w=1200"),
    ("5-Tier Bookshelf", "ST", "SHL", "Storage",
     "Freestanding 5-tier wooden bookshelf.",
     950_000, 6,
     "https://images.unsplash.com/photo-1614620026694-f5f38182ab9f?fm=jpg&q=80&w=1200"),
    ("Coffee Table Glass Top", "LR", "CFF", "Living Room",
     "Wood-framed coffee table with tempered glass top.",
     1_600_000, 5,
     "https://images.unsplash.com/photo-1600623050499-84929aad17c9?fm=jpg&q=80&w=1200"),
    ("Single Sofa Armchair", "LR", "CHR", "Sofas",
     "Upholstered single-seat armchair.",
     1_900_000, 4,
     "https://images.unsplash.com/photo-1634712282287-14ed57b9cc89?fm=jpg&q=80&w=1200"),
    ("Bedside Nightstand", "BD", "NGT", "Bedroom",
     "Compact wooden nightstand with drawer and shelf.",
     480_000, 8,
     "https://images.unsplash.com/photo-1617873228868-f64a54e91a01?fm=jpg&q=80&w=1200"),
    ("6-Seater Dining Table", "DR", "TBL", "Dining",
     "Solid wood dining table, seats six.",
     3_400_000, 3,
     "https://images.unsplash.com/photo-1758977403341-0104135995af?fm=jpg&q=80&w=1200"),
    ("Corner Sofa Left-Hand", "LR", "SFA", "Sofas",
     "L-shaped corner sofa, left-hand orientation.",
     7_200_000, 2,
     "https://images.unsplash.com/photo-1770306924351-763b847ffc80?fm=jpg&q=80&w=1200"),
    ("Dressing Table w/ Mirror", "BD", "DRS", "Bedroom",
     "Bedroom dressing table with attached mirror and drawers.",
     2_800_000, 3,
     "https://images.unsplash.com/photo-1520783077-5c05dd1fdc99?fm=jpg&q=80&w=1200"),
]

SET_ITEMS = [
    ("5-Piece Dining Set", "DR", "Dining",
     "Dining table with 4 matching chairs.",
     6_500_000, 2,
     "https://images.unsplash.com/photo-1758977403341-0104135995af?fm=jpg&q=80&w=1200"),
    ("Living Room Set", "LR", "Living Room",
     "3-seater sofa, armchair and coffee table bundle.",
     12_000_000, 2,
     "https://images.unsplash.com/photo-1633505899118-4ca6bd143043?fm=jpg&q=80&w=1200"),
    ("Bedroom Furniture Set", "BD", "Bedroom",
     "Bed frame, 4-door wardrobe and nightstand bundle.",
     9_500_000, 2,
     "https://images.unsplash.com/photo-1632829401795-2745c905ac77?fm=jpg&q=80&w=1200"),
]


class Command(BaseCommand):
    help = "Wipe showroom inventory + catalogue and reseed real furniture across all branches."

    def handle(self, *args, **options):
        branches = list(Branch.objects.filter(is_active=True))
        if not branches:
            self.stderr.write(self.style.ERROR("No active branches found."))
            return

        self._flush()

        self._image_cache = {}

        for name, room, category_name, description, price, qty, image_url in SET_ITEMS:
            self._create_catalogue_product(name, category_name, description, price, price, image_url)
        for name, room, type_code, category_name, description, price, qty, image_url in STANDALONE_ITEMS:
            self._create_catalogue_product(name, category_name, description,
                                            int(price * 0.9), int(price * 1.15), image_url)
        self.stdout.write(self.style.SUCCESS(
            f"  CatalogueProduct: {len(SET_ITEMS) + len(STANDALONE_ITEMS)} created (global)"
        ))

        for branch in branches:
            self.stdout.write(f"Seeding branch {branch.name} ({branch.code})")
            for name, room, type_code, category_name, description, price, qty, image_url in STANDALONE_ITEMS:
                self._create_showroom_item(
                    branch=branch, name=name, room_code=room, type_code=type_code,
                    category_name=category_name, description=description,
                    price=price, quantity=qty, image_url=image_url, is_set=False,
                )
            for name, room, category_name, description, price, qty, image_url in SET_ITEMS:
                self._create_showroom_item(
                    branch=branch, name=name, room_code=room, type_code=None,
                    category_name=category_name, description=description,
                    price=price, quantity=qty, image_url=image_url, is_set=True,
                )

        total = len(STANDALONE_ITEMS) + len(SET_ITEMS)
        self.stdout.write(self.style.SUCCESS(
            f"  ShowroomItem: {total * len(branches)} created across {len(branches)} branch(es)"
        ))
        self.stdout.write(self.style.SUCCESS("Showroom + catalogue reseed complete."))

    # ---------------------------------------------------------------- #

    def _flush(self):
        sales, _ = Sale.objects.all().delete()
        reservations, _ = Reservation.objects.all().delete()
        items, _ = ShowroomItem.objects.all().delete()
        products, _ = CatalogueProduct.objects.all().delete()
        self.stdout.write(self.style.WARNING(
            f"Flushed: sales={sales} reservations={reservations} "
            f"showroom_items~{items} catalogue_products~{products}"
        ))

    def _create_catalogue_product(self, name, category_name, description, min_price, max_price, image_url):
        category, _ = Category.objects.get_or_create(name=category_name)
        product = CatalogueProduct(
            name=name, category=category, description=description,
            min_price=min_price, max_price=max_price,
        )
        content = self._download(image_url)
        if content:
            filename = f"{name.lower().replace(' ', '-').replace('/', '-')}.jpg"
            product.photo.save(filename, ContentFile(content), save=False)
        product.save()
        self.stdout.write(f"  Catalogue: {name}")

    def _create_showroom_item(self, *, branch, name, room_code, type_code, category_name,
                               description, price, quantity, image_url, is_set):
        category, _ = Category.objects.get_or_create(name=category_name)
        effective_type = "SET" if is_set else type_code
        sku = _generate_sku(branch, room_code, effective_type, "S" if is_set else "X")

        item = ShowroomItem.objects.create(
            sku=sku, name=name, branch=branch, category=category,
            description=description, price=price, quantity=quantity,
            is_set=is_set, status=ShowroomItem.Status.AVAILABLE,
        )
        content = self._download(image_url)
        if content:
            filename = f"{sku.lower()}.jpg"
            image = ShowroomItemImage(item=item, display_order=0)
            image.image.save(filename, ContentFile(content), save=True)
        self.stdout.write(f"  {sku} — {name} ({branch.code})")

    def _download(self, url):
        if url in self._image_cache:
            return self._image_cache[url]
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                content = resp.read()
        except URLError as exc:
            self.stderr.write(self.style.ERROR(f"  Download failed for {url}: {exc}"))
            content = None
        self._image_cache[url] = content
        return content
