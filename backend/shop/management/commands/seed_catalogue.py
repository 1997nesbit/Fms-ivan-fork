"""
Management command: seed_catalogue

Wipes all existing CatalogueProduct rows (and their photos) and re-creates a
real-life furniture catalogue with a photo attached to every item.

Usage
-----
    py manage.py seed_catalogue
"""

import urllib.request
from urllib.error import URLError

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand

from shop.models import Category, CatalogueProduct

USER_AGENT = "Mozilla/5.0 (StyleMySpace catalogue seeder)"

# (name, category, description, min_price, max_price, image_url)
CATALOGUE_ITEMS = [
    (
        "3-Seater Sofa",
        "Sofas",
        "Comfortable 3-seater fabric sofa, ideal for living rooms.",
        1_800_000, 4_500_000,
        "https://images.unsplash.com/photo-1484101403633-562f891dc89a?fm=jpg&q=80&w=1200",
    ),
    (
        "King Bed Frame",
        "Beds",
        "Solid wood king-size bed frame with headboard.",
        1_500_000, 3_200_000,
        "https://images.unsplash.com/photo-1615651586679-c40132c57ba3?fm=jpg&q=80&w=1200",
    ),
    (
        "4-Door Wardrobe",
        "Storage",
        "Spacious 4-door wardrobe with shelving and hanging rail.",
        2_200_000, 5_800_000,
        "https://images.unsplash.com/photo-1672137233327-37b0c1049e77?fm=jpg&q=80&w=1200",
    ),
    (
        "TV Stand 1.8m",
        "Living Room",
        "Modern 1.8m TV stand with storage cabinets.",
        600_000, 1_200_000,
        "https://images.unsplash.com/photo-1567690187548-f07b1d7bf5a9?fm=jpg&q=80&w=1200",
    ),
    (
        "Office Desk 140x70",
        "Office",
        "Sturdy wooden office desk, 140x70cm work surface.",
        900_000, 2_100_000,
        "https://images.unsplash.com/photo-1519219788971-8d9797e0928e?fm=jpg&q=80&w=1200",
    ),
    (
        "5-Tier Bookshelf",
        "Storage",
        "Freestanding 5-tier wooden bookshelf.",
        450_000, 950_000,
        "https://images.unsplash.com/photo-1614620026694-f5f38182ab9f?fm=jpg&q=80&w=1200",
    ),
    (
        "Dining Table Set (6-Seater)",
        "Dining",
        "6-seater dining table with matching chairs.",
        2_500_000, 6_000_000,
        "https://images.unsplash.com/photo-1758977403341-0104135995af?fm=jpg&q=80&w=1200",
    ),
    (
        "Corner Sofa Left-Hand",
        "Sofas",
        "L-shaped corner sofa, left-hand orientation.",
        3_500_000, 7_200_000,
        "https://images.unsplash.com/photo-1770306924351-763b847ffc80?fm=jpg&q=80&w=1200",
    ),
    (
        "Dressing Table w/ Mirror",
        "Bedroom",
        "Bedroom dressing table with attached mirror and drawers.",
        1_100_000, 2_800_000,
        "https://images.unsplash.com/photo-1520783077-5c05dd1fdc99?fm=jpg&q=80&w=1200",
    ),
    (
        "Coffee Table Glass Top",
        "Living Room",
        "Wood-framed coffee table with tempered glass top.",
        700_000, 1_600_000,
        "https://images.unsplash.com/photo-1600623050499-84929aad17c9?fm=jpg&q=80&w=1200",
    ),
    (
        "Single Sofa Armchair",
        "Sofas",
        "Upholstered single-seat armchair.",
        900_000, 1_900_000,
        "https://images.unsplash.com/photo-1634712282287-14ed57b9cc89?fm=jpg&q=80&w=1200",
    ),
    (
        "Bedside Nightstand",
        "Bedroom",
        "Compact wooden nightstand with drawer and shelf.",
        250_000, 600_000,
        "https://images.unsplash.com/photo-1617873228868-f64a54e91a01?fm=jpg&q=80&w=1200",
    ),
]


class Command(BaseCommand):
    help = "Delete all catalogue products and seed a real furniture catalogue with photos."

    def handle(self, *args, **options):
        deleted, _ = CatalogueProduct.objects.all().delete()
        self.stdout.write(self.style.WARNING(f"Deleted {deleted} existing catalogue product row(s)."))

        created = 0
        for name, category_name, description, min_price, max_price, image_url in CATALOGUE_ITEMS:
            category, _ = Category.objects.get_or_create(name=category_name)

            product = CatalogueProduct(
                name=name,
                category=category,
                description=description,
                min_price=min_price,
                max_price=max_price,
            )

            image_content = self._download(image_url)
            if image_content:
                filename = f"{name.lower().replace(' ', '-').replace('/', '-')}.jpg"
                product.photo.save(filename, ContentFile(image_content), save=False)
            else:
                self.stderr.write(self.style.WARNING(f"  Could not download image for {name}"))

            product.save()
            created += 1
            self.stdout.write(f"  Created {product.name} ({category_name})")

        self.stdout.write(self.style.SUCCESS(f"Catalogue seed complete: {created} product(s) created."))

    def _download(self, url):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                return resp.read()
        except URLError as exc:
            self.stderr.write(self.style.ERROR(f"  Download failed for {url}: {exc}"))
            return None
