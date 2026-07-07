export default function StockKeeperLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // StockProvider is mounted globally in the AppShell so inventory, issuances
  // and reorders stay in sync with the Operations and Director portals.
  return <>{children}</>
}
