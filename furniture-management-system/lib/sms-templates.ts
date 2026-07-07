import type { MessageTemplate, MessageTrigger } from "@/components/messaging/sms-store"
import type { Order } from "@/lib/mock-data"

export interface TemplateVars {
  customerName?: string
  orderId?: string
  furnitureType?: string
  expectedDelivery?: string
  stageName?: string
  technicianName?: string
  senderName?: string
  customVar?: string
}

/** Replace {{variable}} placeholders with resolved values. */
export function resolveTemplate(body: string, vars: TemplateVars): string {
  return body
    .replace(/{{customerName}}/g, vars.customerName ?? "")
    .replace(/{{orderId}}/g, vars.orderId ?? "")
    .replace(/{{furnitureType}}/g, vars.furnitureType ?? "")
    .replace(/{{expectedDelivery}}/g, vars.expectedDelivery
      ? new Date(vars.expectedDelivery).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : "")
    .replace(/{{stageName}}/g, vars.stageName ?? "")
    .replace(/{{technicianName}}/g, vars.technicianName ?? "")
    .replace(/{{senderName}}/g, vars.senderName ?? "our team")
    .replace(/{{customVar}}/g, vars.customVar ?? "")
}

/** Build TemplateVars from an Order object. */
export function varsFromOrder(order: Order): TemplateVars {
  return {
    customerName: order.customerName,
    orderId: order.id,
    furnitureType: order.furnitureType,
    expectedDelivery: order.expectedDelivery,
  }
}

/** Find the first enabled template for a given trigger. */
export function findTemplate(
  templates: MessageTemplate[],
  trigger: MessageTrigger
): MessageTemplate | undefined {
  return templates.find((t) => t.trigger === trigger && t.enabled)
}
