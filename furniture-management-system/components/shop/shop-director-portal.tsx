"use client"

import { useState } from "react"
import { Store } from "lucide-react"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ShopReportsScreen } from "@/components/shop/shop-reports-screen"
import { CatalogueScreen } from "@/components/shop/catalogue-screen"
import { ShowroomSettingsScreen } from "@/components/shop/showroom-settings-screen"

type DirectorShopTab = "catalogue" | "settings" | "reports"

export function ShopDirectorPortal() {
  const [mainTab, setMainTab] = useState<DirectorShopTab>("catalogue")

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Store className="size-5" />
        </span>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            Showroom — Director
          </h1>
          <p className="max-w-2xl text-pretty text-muted-foreground">
            Browse the showroom catalogue, manage catalogue settings, and view sales reports.
          </p>
        </div>
      </div>

      {/* Main tab nav */}
      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as DirectorShopTab)}>
        <TabsList>
          <TabsTrigger value="catalogue">Catalogue</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>
      </Tabs>

      {mainTab === "catalogue" && <CatalogueScreen />}
      {mainTab === "settings"  && <ShowroomSettingsScreen />}
      {mainTab === "reports"   && <ShopReportsScreen />}
    </div>
  )
}
