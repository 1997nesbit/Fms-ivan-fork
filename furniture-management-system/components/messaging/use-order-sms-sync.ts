"use client"

import { useEffect, useRef } from "react"
import { useOrders } from "@/components/front-desk/orders-store"
import { useSms } from "@/components/messaging/sms-store"
import { findTemplate, resolveTemplate, varsFromOrder } from "@/lib/sms-templates"
import type { Order } from "@/lib/mock-data"

export function useOrderSmsSync() {
  const { orders } = useOrders()
  const { templates, config, sendSms } = useSms()

  const prevRef = useRef<Map<string, Order>>(new Map())

  useEffect(() => {
    if (!config.autoSendEnabled) return

    const prev = prevRef.current
    const next = new Map(orders.map((o) => [o.id, o]))

    for (const [id, curr] of next) {
      const old = prev.get(id)

      if (!old) {
        const tpl = findTemplate(templates, "order_created")
        if (tpl) {
          const body = resolveTemplate(tpl.body, varsFromOrder(curr))
          sendSms({ to: curr.contact, recipientName: curr.customerName, body, trigger: "order_created", orderId: id })
        }
        continue
      }

      if (old.status === "Pending Approval" && curr.status === "In Workshop") {
        const tpl = findTemplate(templates, "order_approved")
        if (tpl) {
          const body = resolveTemplate(tpl.body, varsFromOrder(curr))
          sendSms({ to: curr.contact, recipientName: curr.customerName, body, trigger: "order_approved", orderId: id })
        }
      }

      if (old.status === "Planned" && curr.status === "In Workshop") {
        const tpl = findTemplate(templates, "stage_started")
        if (tpl) {
          const firstStage = curr.stages[0]
          const body = resolveTemplate(tpl.body, { ...varsFromOrder(curr), stageName: firstStage?.name })
          sendSms({ to: curr.contact, recipientName: curr.customerName, body, trigger: "stage_started", orderId: id })
        }
        continue
      }

      if (curr.status === "In Workshop" && old.status === "In Workshop") {
        const newActiveIdx = curr.stages.findIndex((s) => s.status === "Active")
        const oldActiveIdx = old.stages.findIndex((s) => s.status === "Active")
        if (newActiveIdx > 0 && newActiveIdx !== oldActiveIdx) {
          const tpl = findTemplate(templates, "stage_advanced")
          if (tpl) {
            const activeStage = curr.stages[newActiveIdx]
            const body = resolveTemplate(tpl.body, { ...varsFromOrder(curr), stageName: activeStage?.name })
            sendSms({ to: curr.contact, recipientName: curr.customerName, body, trigger: "stage_advanced", orderId: id })
          }
        }
      }

      if (old.status !== "Ready for Collection" && curr.status === "Ready for Collection") {
        const tpl = findTemplate(templates, "ready_collection")
        if (tpl) {
          const body = resolveTemplate(tpl.body, varsFromOrder(curr))
          sendSms({ to: curr.contact, recipientName: curr.customerName, body, trigger: "ready_collection", orderId: id })
        }
      }

      if (old.status !== "Collected" && curr.status === "Collected") {
        const tpl = findTemplate(templates, "order_collected")
        if (tpl) {
          const body = resolveTemplate(tpl.body, varsFromOrder(curr))
          sendSms({ to: curr.contact, recipientName: curr.customerName, body, trigger: "order_collected", orderId: id })
        }
      }
    }

    prevRef.current = next
  }, [orders, templates, config.autoSendEnabled, sendSms])
}
