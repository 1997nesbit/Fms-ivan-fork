import { BranchProvider } from "@/components/shop/branch-store"
import { ShowroomProvider } from "@/components/shop/showroom-store"
import { CatalogueProvider } from "@/components/shop/catalogue-store"
import { ManageShopScreen } from "@/components/shop/manage-shop-screen"

export default function FrontDeskManagePage() {
  return (
    <BranchProvider>
      <ShowroomProvider>
        <CatalogueProvider>
          <ManageShopScreen />
        </CatalogueProvider>
      </ShowroomProvider>
    </BranchProvider>
  )
}
