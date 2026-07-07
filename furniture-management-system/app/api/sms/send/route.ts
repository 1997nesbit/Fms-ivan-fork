import { NextRequest, NextResponse } from "next/server"

function buildPayload(
  to: string,
  message: string,
  from: string
): Record<string, string> {
  return { to, from, message }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)

  if (!body || typeof body.to !== "string" || typeof body.message !== "string") {
    return NextResponse.json(
      { error: "Missing required fields: to, message" },
      { status: 400 }
    )
  }

  const baseUrl = process.env.SMS_PROVIDER_BASE_URL
  const apiKey = process.env.SMS_API_KEY
  const defaultSender = process.env.SMS_SENDER_ID ?? "FurnitureCo"
  const senderId = (body.from as string | undefined) ?? defaultSender

  if (!baseUrl || !apiKey) {
    return NextResponse.json({
      status: "simulated",
      message: "No SMS provider configured. Set SMS_PROVIDER_BASE_URL and SMS_API_KEY to enable real delivery.",
      to: body.to,
      preview: body.message,
    })
  }

  try {
    const payload = buildPayload(body.to, body.message, senderId)

    const upstream = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    const text = await upstream.text()
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text }
    }

    if (!upstream.ok) {
      return NextResponse.json(
        { error: "Provider rejected the request", detail: data, status: upstream.status },
        { status: 502 }
      )
    }

    return NextResponse.json({ status: "sent", provider: data })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: "Network error", detail: message }, { status: 503 })
  }
}
