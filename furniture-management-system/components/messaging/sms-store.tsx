"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"

export type MessageStatus = "sending" | "sent" | "simulated" | "failed"

export type MessageTrigger =
  | "order_created"
  | "order_approved"
  | "stage_started"
  | "stage_advanced"
  | "ready_collection"
  | "order_collected"
  | "payment_received"
  | "campaign"
  | "manual"

export interface SmsMessage {
  id: string
  to: string
  recipientName: string
  body: string
  status: MessageStatus
  trigger: MessageTrigger
  orderId?: string
  sentAt: string
  errorDetail?: string
}

export interface MessageTemplate {
  id: string
  name: string
  trigger: MessageTrigger
  body: string
  enabled: boolean
}

export interface SmsProviderConfig {
  name: string
  baseUrlHint: string
  senderId: string
  autoSendEnabled: boolean
}

interface SmsContextValue {
  messages: SmsMessage[]
  templates: MessageTemplate[]
  config: SmsProviderConfig
  providerConfigured: boolean
  sendSms: (params: {
    to: string
    recipientName: string
    body: string
    trigger: MessageTrigger
    orderId?: string
  }) => Promise<void>
  updateTemplate: (id: string, patch: Partial<MessageTemplate>) => void
  updateConfig: (patch: Partial<SmsProviderConfig>) => void
  clearLog: () => void
}

const DEFAULT_TEMPLATES: MessageTemplate[] = [
  {
    id: "tpl-order-created",
    trigger: "order_created",
    name: "Order received",
    body: "Hello {{customerName}}, thank you! Your order ({{orderId}}) for a {{furnitureType}} has been received and is being processed. Expected delivery: {{expectedDelivery}}.",
    enabled: true,
  },
  {
    id: "tpl-order-approved",
    trigger: "order_approved",
    name: "Order approved",
    body: "Hi {{customerName}}, great news — your order {{orderId}} has been approved and production starts shortly.",
    enabled: true,
  },
  {
    id: "tpl-stage-started",
    trigger: "stage_started",
    name: "Work started",
    body: "Hi {{customerName}}, our team has started work on your {{furnitureType}} (order {{orderId}}). We will keep you posted.",
    enabled: true,
  },
  {
    id: "tpl-stage-advanced",
    trigger: "stage_advanced",
    name: "Stage handover",
    body: "Hi {{customerName}}, your {{furnitureType}} ({{orderId}}) has moved to the next stage of production. Things are progressing well!",
    enabled: true,
  },
  {
    id: "tpl-ready-collection",
    trigger: "ready_collection",
    name: "Ready for collection",
    body: "Hi {{customerName}}, your {{furnitureType}} is ready for collection! Please visit us at your earliest convenience. Order ref: {{orderId}}.",
    enabled: true,
  },
  {
    id: "tpl-order-collected",
    trigger: "order_collected",
    name: "Collection confirmed",
    body: "Thank you {{customerName}}! Your {{furnitureType}} ({{orderId}}) has been collected. We hope you love it — thank you for choosing us.",
    enabled: true,
  },
  {
    id: "tpl-payment-received",
    trigger: "payment_received",
    name: "Payment received",
    body: "Hi {{customerName}}, we have received your payment for order {{orderId}}. Thank you!",
    enabled: true,
  },
]

const SmsContext = createContext<SmsContextValue | null>(null)

export function SmsProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<SmsMessage[]>([])
  const [templates, setTemplates] = useState<MessageTemplate[]>(DEFAULT_TEMPLATES)
  const [config, setConfig] = useState<SmsProviderConfig>({
    name: "",
    baseUrlHint: "Set SMS_PROVIDER_BASE_URL in Vercel environment vars",
    senderId: "FurnitureCo",
    autoSendEnabled: true,
  })
  const [providerConfigured, setProviderConfigured] = useState(false)

  const sendSms = useCallback(
    async ({
      to,
      recipientName,
      body,
      trigger,
      orderId,
    }: {
      to: string
      recipientName: string
      body: string
      trigger: MessageTrigger
      orderId?: string
    }) => {
      const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const sentAt = new Date().toISOString()

      const draft: SmsMessage = {
        id, to, recipientName, body, trigger, orderId, status: "sending", sentAt,
      }
      setMessages((prev) => [draft, ...prev])

      try {
        const res = await fetch("/api/sms/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to, message: body, from: config.senderId }),
        })
        const data = await res.json()

        const isSent = res.ok && data.status === "sent"
        const isSimulated = res.ok && data.status === "simulated"
        if (isSent) setProviderConfigured(true)

        setMessages((prev) =>
          prev.map((m) =>
            m.id === id
              ? {
                  ...m,
                  status: isSent ? "sent" : isSimulated ? "simulated" : "failed",
                  errorDetail: isSent || isSimulated ? undefined : JSON.stringify(data),
                }
              : m
          )
        )
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id
              ? {
                  ...m,
                  status: "failed",
                  errorDetail: err instanceof Error ? err.message : "Network error",
                }
              : m
          )
        )
      }
    },
    [config.senderId]
  )

  const updateTemplate = useCallback(
    (id: string, patch: Partial<MessageTemplate>) => {
      setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    },
    []
  )

  const updateConfig = useCallback((patch: Partial<SmsProviderConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }))
  }, [])

  const clearLog = useCallback(() => setMessages([]), [])

  const value = useMemo<SmsContextValue>(
    () => ({ messages, templates, config, providerConfigured, sendSms, updateTemplate, updateConfig, clearLog }),
    [messages, templates, config, providerConfigured, sendSms, updateTemplate, updateConfig, clearLog]
  )

  return <SmsContext.Provider value={value}>{children}</SmsContext.Provider>
}

export function useSms(): SmsContextValue {
  const ctx = useContext(SmsContext)
  if (!ctx) throw new Error("useSms must be used within a SmsProvider")
  return ctx
}
