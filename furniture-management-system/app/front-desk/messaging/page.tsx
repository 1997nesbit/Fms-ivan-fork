import { OrdersProvider } from "@/components/front-desk/orders-store"
import { SmsProvider } from "@/components/messaging/sms-store"
import { MessagingPortal } from "@/components/messaging/messaging-portal"

export const metadata = {
  title: "Messaging | Front Desk",
  description: "Send automated SMS notifications and manual messages to customers.",
}

export default function MessagingPage() {
  return (
    <OrdersProvider>
      <SmsProvider>
        <MessagingPortal />
      </SmsProvider>
    </OrdersProvider>
  )
}
