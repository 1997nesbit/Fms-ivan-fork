"use client"

import { useState } from "react"
import {
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  Inbox,
  Megaphone,
  MessageSquare,
  Send,
  Settings2,
  TriangleAlert,
  WifiOff,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { useSms, type MessageTrigger } from "@/components/messaging/sms-store"
import { useOrders } from "@/components/front-desk/orders-store"
import { useOrderSmsSync } from "@/components/messaging/use-order-sms-sync"
import { findTemplate, resolveTemplate, varsFromOrder } from "@/lib/sms-templates"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return "just now"
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

const TRIGGER_LABELS: Record<MessageTrigger, string> = {
  order_created: "Order received",
  order_approved: "Order approved",
  stage_started: "Work started",
  stage_advanced: "Stage handover",
  ready_collection: "Ready for collection",
  order_collected: "Collection confirmed",
  payment_received: "Payment received",
  campaign: "Campaign",
  manual: "Manual",
}

const STATUS_CONFIG = {
  sending: { label: "Sending", className: "border-border bg-muted text-muted-foreground" },
  sent: { label: "Sent", className: "border-transparent bg-primary text-primary-foreground" },
  simulated: { label: "Simulated", className: "border-accent bg-accent/30 text-accent-foreground" },
  failed: { label: "Failed", className: "border-transparent bg-destructive text-destructive-foreground" },
} as const

type Tab = "log" | "compose" | "settings"

function MessageLog() {
  const { messages, clearLog, providerConfigured } = useSms()

  const sentCount = messages.filter((m) => m.status === "sent").length
  const failedCount = messages.filter((m) => m.status === "failed").length
  const simCount = messages.filter((m) => m.status === "simulated").length

  return (
    <div className="flex flex-col gap-5">
      {!providerConfigured && messages.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <WifiOff className="size-8 text-muted-foreground" />
            <div>
              <p className="font-medium">No SMS provider connected</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Messages will run in simulation mode until you set{" "}
                <code className="rounded bg-muted px-1 text-xs">SMS_PROVIDER_BASE_URL</code> and{" "}
                <code className="rounded bg-muted px-1 text-xs">SMS_API_KEY</code> in your Vercel
                environment. See Settings for details.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {messages.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{messages.length} messages</span>
            <div className="flex items-center gap-2">
              {sentCount > 0 && (
                <Badge className="border-transparent bg-primary text-primary-foreground">
                  {sentCount} sent
                </Badge>
              )}
              {simCount > 0 && (
                <Badge className="border-accent bg-accent/30 text-accent-foreground">
                  {simCount} simulated
                </Badge>
              )}
              {failedCount > 0 && (
                <Badge className="border-transparent bg-destructive text-destructive-foreground">
                  {failedCount} failed
                </Badge>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={clearLog}>
            <X className="size-3.5" />
            Clear log
          </Button>
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recipient</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Preview</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Sent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {messages.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                    No messages yet. Messages will appear here as orders move through their lifecycle.
                  </TableCell>
                </TableRow>
              ) : (
                messages.map((msg) => {
                  const cfg = STATUS_CONFIG[msg.status]
                  return (
                    <TableRow key={msg.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{msg.recipientName}</span>
                          <span className="text-xs text-muted-foreground">{msg.to}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {TRIGGER_LABELS[msg.trigger]}
                        </span>
                        {msg.orderId && (
                          <p className="font-mono text-xs text-muted-foreground/70">
                            {msg.orderId}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="max-w-xs truncate text-sm text-muted-foreground">
                          {msg.body}
                        </p>
                        {msg.errorDetail && (
                          <p className="mt-0.5 text-xs text-destructive">{msg.errorDetail}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={cn("text-xs", cfg.className)}>{cfg.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {formatRelative(msg.sentAt)}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  )
}

function ComposeAndCampaigns() {
  const { orders } = useOrders()
  const { templates, sendSms } = useSms()

  const [manualTo, setManualTo] = useState("")
  const [manualName, setManualName] = useState("")
  const [manualBody, setManualBody] = useState("")
  const [manualSending, setManualSending] = useState(false)

  const [campaignBody, setCampaignBody] = useState("")
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set())
  const [campaignSending, setCampaignSending] = useState(false)

  const [quickOrderId, setQuickOrderId] = useState("")
  const [quickTrigger, setQuickTrigger] = useState<MessageTrigger>("manual")
  const [quickBody, setQuickBody] = useState("")

  const activeOrders = orders.filter((o) =>
    ["In Workshop", "Planned", "Awaiting Return", "Ready for Collection"].includes(o.status)
  )

  function handleQuickOrderChange(id: string) {
    setQuickOrderId(id)
    const order = orders.find((o) => o.id === id)
    if (!order) return
    const tpl = findTemplate(templates, quickTrigger)
    if (tpl) setQuickBody(resolveTemplate(tpl.body, varsFromOrder(order)))
  }

  function handleQuickTriggerChange(trigger: MessageTrigger) {
    setQuickTrigger(trigger)
    const order = orders.find((o) => o.id === quickOrderId)
    if (!order) return
    const tpl = findTemplate(templates, trigger)
    if (tpl) setQuickBody(resolveTemplate(tpl.body, varsFromOrder(order)))
  }

  async function sendQuick() {
    const order = orders.find((o) => o.id === quickOrderId)
    if (!order || !quickBody.trim()) return
    await sendSms({ to: order.contact, recipientName: order.customerName, body: quickBody.trim(), trigger: quickTrigger, orderId: order.id })
    toast.success(`Message queued for ${order.customerName}`)
    setQuickBody("")
  }

  async function sendManual() {
    if (!manualTo.trim() || !manualBody.trim()) return
    setManualSending(true)
    await sendSms({ to: manualTo.trim(), recipientName: manualName.trim() || manualTo.trim(), body: manualBody.trim(), trigger: "manual" })
    toast.success("Message sent")
    setManualTo("")
    setManualName("")
    setManualBody("")
    setManualSending(false)
  }

  function toggleOrderSelect(id: string) {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function sendCampaign() {
    if (!campaignBody.trim() || selectedOrderIds.size === 0) return
    setCampaignSending(true)
    const targets = orders.filter((o) => selectedOrderIds.has(o.id))
    for (const order of targets) {
      const body = resolveTemplate(campaignBody, varsFromOrder(order))
      await sendSms({ to: order.contact, recipientName: order.customerName, body, trigger: "campaign", orderId: order.id })
    }
    toast.success(`Campaign sent to ${targets.length} customer${targets.length === 1 ? "" : "s"}`)
    setSelectedOrderIds(new Set())
    setCampaignBody("")
    setCampaignSending(false)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ChevronRight className="size-4 text-primary" />
            Quick send (order-linked)
          </CardTitle>
          <CardDescription>
            Pick an active order, choose a template trigger and edit before sending.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Order</Label>
            <select
              className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={quickOrderId}
              onChange={(e) => handleQuickOrderChange(e.target.value)}
            >
              <option value="">Select order…</option>
              {activeOrders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.id} — {o.customerName} ({o.furnitureType})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Template trigger</Label>
            <select
              className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={quickTrigger}
              onChange={(e) => handleQuickTriggerChange(e.target.value as MessageTrigger)}
            >
              {(Object.keys(TRIGGER_LABELS) as MessageTrigger[]).map((t) => (
                <option key={t} value={t}>{TRIGGER_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Message</Label>
            <Textarea rows={4} value={quickBody} onChange={(e) => setQuickBody(e.target.value)} placeholder="Select an order above to pre-fill from the template…" />
            <p className="text-xs text-muted-foreground">{quickBody.length} characters</p>
          </div>
          <Button disabled={!quickOrderId || !quickBody.trim()} onClick={sendQuick} className="self-end">
            <Send className="size-3.5" />
            Send
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="size-4 text-primary" />
            Manual compose
          </CardTitle>
          <CardDescription>
            Send a one-off message to any number — not tied to an order.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="manual-name">Recipient name</Label>
            <Input id="manual-name" value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="e.g. John Doe" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="manual-to">Phone number</Label>
            <Input id="manual-to" value={manualTo} onChange={(e) => setManualTo(e.target.value)} placeholder="+254 7XX XXX XXX" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="manual-body">Message</Label>
            <Textarea id="manual-body" rows={4} value={manualBody} onChange={(e) => setManualBody(e.target.value)} placeholder="Type your message…" />
            <p className="text-xs text-muted-foreground">{manualBody.length} characters</p>
          </div>
          <Button disabled={!manualTo.trim() || !manualBody.trim() || manualSending} onClick={sendManual} className="self-end">
            <Send className="size-3.5" />
            {manualSending ? "Sending…" : "Send"}
          </Button>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="size-4 text-primary" />
            Campaign broadcast
          </CardTitle>
          <CardDescription>
            Select customers from your active orders and send a personalised broadcast. Use{" "}
            <code className="rounded bg-muted px-1 text-xs">{"{{customerName}}"}</code>,{" "}
            <code className="rounded bg-muted px-1 text-xs">{"{{orderId}}"}</code>,{" "}
            <code className="rounded bg-muted px-1 text-xs">{"{{furnitureType}}"}</code> for personalisation.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="campaign-body">Campaign message</Label>
            <Textarea id="campaign-body" rows={3} value={campaignBody} onChange={(e) => setCampaignBody(e.target.value)} placeholder="Hi {{customerName}}, we have an exciting offer for you…" />
            <p className="text-xs text-muted-foreground">{campaignBody.length} characters</p>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Select recipients</Label>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => {
                  if (selectedOrderIds.size === orders.length) {
                    setSelectedOrderIds(new Set())
                  } else {
                    setSelectedOrderIds(new Set(orders.map((o) => o.id)))
                  }
                }}
              >
                {selectedOrderIds.size === orders.length ? "Deselect all" : "Select all"}
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto rounded-md border border-border">
              {orders.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No orders on record.</p>
              ) : (
                orders.map((order) => {
                  const checked = selectedOrderIds.has(order.id)
                  return (
                    <label
                      key={order.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 border-b border-border px-4 py-2.5 text-sm last:border-0 hover:bg-muted/50",
                        checked && "bg-primary/5"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOrderSelect(order.id)}
                        className="size-4 accent-primary"
                      />
                      <span className="font-mono text-xs text-muted-foreground">{order.id}</span>
                      <span className="font-medium">{order.customerName}</span>
                      <span className="text-muted-foreground">{order.contact}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{order.furnitureType}</span>
                    </label>
                  )
                })
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedOrderIds.size} of {orders.length} selected
            </p>
          </div>

          <Button
            disabled={!campaignBody.trim() || selectedOrderIds.size === 0 || campaignSending}
            onClick={sendCampaign}
            className="self-end"
          >
            <Megaphone className="size-3.5" />
            {campaignSending ? "Sending…" : `Send to ${selectedOrderIds.size} customer${selectedOrderIds.size === 1 ? "" : "s"}`}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

const TRIGGER_ORDER: MessageTrigger[] = [
  "order_created",
  "order_approved",
  "stage_started",
  "stage_advanced",
  "ready_collection",
  "order_collected",
  "payment_received",
]

const ENV_VARS: { name: string; description: React.ReactNode }[] = [
  {
    name: "SMS_PROVIDER_BASE_URL",
    description: (
      <>
        Your provider&apos;s REST send endpoint (e.g.{" "}
        <code className="break-all">https://api.yoursms.com/v1/messages</code>)
      </>
    ),
  },
  {
    name: "SMS_API_KEY",
    description: "API key or Bearer token issued by your provider",
  },
  {
    name: "SMS_SENDER_ID",
    description: (
      <>
        Sender name or number shown to recipients (default: <code>FurnitureCo</code>)
      </>
    ),
  },
]

function EnvVarRow({ name, description }: { name: string; description: React.ReactNode }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(name)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Couldn't copy to clipboard")
    }
  }

  return (
    <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:gap-4">
      <button
        type="button"
        onClick={copy}
        className="flex w-fit shrink-0 items-center gap-1.5 rounded-md bg-muted px-2 py-1 font-mono text-xs transition-colors hover:bg-muted/70 sm:min-w-[220px]"
      >
        {name}
        {copied ? (
          <Check className="size-3 text-primary" />
        ) : (
          <Copy className="size-3 text-muted-foreground" />
        )}
      </button>
      <span className="min-w-0 break-words text-sm text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:text-xs [&_code]:break-all">
        {description}
      </span>
    </div>
  )
}

function MessagingSettings() {
  const { templates, updateTemplate, config, updateConfig, providerConfigured } = useSms()

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="size-4 text-primary" />
            SMS provider
          </CardTitle>
          <CardAction>
            <Badge
              className={cn(
                "text-xs",
                providerConfigured
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border bg-muted text-muted-foreground"
              )}
            >
              {providerConfigured ? "Connected" : "Not connected"}
            </Badge>
          </CardAction>
          <CardDescription>
            Connection is configured via Vercel environment variables.
            Set these in your project settings and they will be picked up automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border text-sm">
            {ENV_VARS.map((v) => (
              <EnvVarRow key={v.name} name={v.name} description={v.description} />
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sender-id">Display sender ID (client-side override)</Label>
            <Input
              id="sender-id"
              value={config.senderId}
              onChange={(e) => updateConfig({ senderId: e.target.value })}
              placeholder="FurnitureCo"
              className="max-w-xs"
            />
            <p className="text-xs text-muted-foreground">
              Passed as the <code>from</code> field on each request. The server-side env var takes precedence when set.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-border p-4">
            <Switch
              checked={config.autoSendEnabled}
              onCheckedChange={(v) => updateConfig({ autoSendEnabled: v })}
              id="auto-send"
            />
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="auto-send" className="cursor-pointer text-sm font-medium">
                Automatic lifecycle messages
              </Label>
              <p className="text-xs text-muted-foreground">
                When enabled, messages fire automatically as orders move through each stage.
                Disable to send manually only.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Message templates</CardTitle>
          <CardDescription>
            Edit the body text for each automatic trigger. Variables:{" "}
            <code className="text-xs">{"{{customerName}}"}</code>{" "}
            <code className="text-xs">{"{{orderId}}"}</code>{" "}
            <code className="text-xs">{"{{furnitureType}}"}</code>{" "}
            <code className="text-xs">{"{{expectedDelivery}}"}</code>{" "}
            <code className="text-xs">{"{{stageName}}"}</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {TRIGGER_ORDER.map((trigger) => {
            const tpl = templates.find((t) => t.trigger === trigger)
            if (!tpl) return null
            return (
              <div key={tpl.id} className="flex flex-col gap-2 rounded-lg border border-border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Bell className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{tpl.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {TRIGGER_LABELS[trigger]}
                    </Badge>
                  </div>
                  <Switch
                    checked={tpl.enabled}
                    onCheckedChange={(v) => updateTemplate(tpl.id, { enabled: v })}
                  />
                </div>
                <Textarea
                  rows={3}
                  value={tpl.body}
                  disabled={!tpl.enabled}
                  onChange={(e) => updateTemplate(tpl.id, { body: e.target.value })}
                  className="text-sm disabled:opacity-50"
                />
                <p className="text-xs text-muted-foreground">{tpl.body.length} characters</p>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}

export function MessagingPortal() {
  const { messages } = useSms()
  const [tab, setTab] = useState<Tab>("log")

  useOrderSmsSync()

  const unreadFailed = messages.filter((m) => m.status === "failed").length

  const stats = {
    total: messages.length,
    sent: messages.filter((m) => m.status === "sent").length,
    simulated: messages.filter((m) => m.status === "simulated").length,
    failed: messages.filter((m) => m.status === "failed").length,
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <MessageSquare className="size-5" />
          </span>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">
              Messaging
            </h1>
            <p className="max-w-2xl text-pretty text-muted-foreground">
              Send automated lifecycle notifications and manual messages to customers. Connect your
              SMS provider via environment variables to enable real delivery.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-4 rounded-lg border border-border bg-card px-4 py-2.5">
          <div className="flex flex-col items-center">
            <span className="text-lg font-semibold tabular-nums">{stats.total}</span>
            <span className="text-xs text-muted-foreground">Total</span>
          </div>
          <div className="h-8 w-px bg-border" />
          <div className="flex flex-col items-center">
            <span className="text-lg font-semibold tabular-nums text-primary">{stats.sent}</span>
            <span className="text-xs text-muted-foreground">Sent</span>
          </div>
          <div className="h-8 w-px bg-border" />
          <div className="flex flex-col items-center">
            <span className="text-lg font-semibold tabular-nums text-accent-foreground">{stats.simulated}</span>
            <span className="text-xs text-muted-foreground">Simulated</span>
          </div>
          {stats.failed > 0 && (
            <>
              <div className="h-8 w-px bg-border" />
              <div className="flex flex-col items-center">
                <span className="text-lg font-semibold tabular-nums text-destructive">{stats.failed}</span>
                <span className="text-xs text-muted-foreground">Failed</span>
              </div>
            </>
          )}
        </div>
      </div>

      {unreadFailed > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-center gap-3 py-3">
            <TriangleAlert className="size-4 text-destructive" />
            <p className="text-sm text-destructive">
              <span className="font-semibold">{unreadFailed}</span> message{unreadFailed === 1 ? "" : "s"} failed to
              send. Check your provider configuration in Settings.
            </p>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-4">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="log" className="gap-1.5">
            <Inbox className="size-3.5" />
            Message log
            {stats.total > 0 && (
              <span className="rounded-full bg-foreground/10 px-1.5 text-xs tabular-nums">
                {stats.total}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="compose" className="gap-1.5">
            <Send className="size-3.5" />
            Compose &amp; Campaigns
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5">
            <Settings2 className="size-3.5" />
            Templates &amp; Settings
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "log" && <MessageLog />}
      {tab === "compose" && <ComposeAndCampaigns />}
      {tab === "settings" && <MessagingSettings />}
    </div>
  )
}
