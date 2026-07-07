import { QuotesProvider } from "@/components/shop/quotes-store"
import { BranchProvider } from "@/components/shop/branch-store"
import { CatalogueProvider } from "@/components/shop/catalogue-store"
import { QuotesScreen } from "@/components/shop/quotes-screen"

export default function FrontDeskQuotesPage() {
  return (
    <QuotesProvider>
      <BranchProvider>
        <CatalogueProvider>
          <QuotesScreen />
        </CatalogueProvider>
      </BranchProvider>
    </QuotesProvider>
  )
}
