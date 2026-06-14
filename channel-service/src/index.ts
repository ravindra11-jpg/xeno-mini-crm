import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import 'dotenv/config'

const app = new Hono()

app.use('*', cors())

// health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'channel-service' })
})

// ─── POST /send ───────────────────────────────────────────────────────────────
app.post('/send', async (c) => {
  const body = await c.req.json()
  const { messageId, customerId, content, channel, callbackUrl } = body

  if (!messageId || !customerId || !content || !callbackUrl) {
    return c.json({ error: 'messageId, customerId, content, callbackUrl are required' }, 400)
  }

  c.status(202)
  const response = c.json({ status: 'accepted', messageId })

  simulateAndCallback({ messageId, customerId, content, channel, callbackUrl })

  return response
})

// ─── SIMULATION ───────────────────────────────────────────────────────────────
async function simulateAndCallback({
  messageId,
  customerId,
  content,
  channel,
  callbackUrl,
}: {
  messageId: string
  customerId: string
  content: string
  channel: string
  callbackUrl: string
}) {
  const delay = Math.floor(Math.random() * 8000) + 2000
  await sleep(delay)

  // channel is now passed through — pickOutcome uses it for realistic weights
  const outcome = pickOutcome(channel)

  try {
    await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageId,
        customerId,
        status: outcome,
        timestamp: new Date().toISOString(),
      }),
    })
    console.log(`✅ Callback sent — messageId: ${messageId}, channel: ${channel}, outcome: ${outcome}`)
  } catch (err) {
    console.error(`❌ Callback failed — messageId: ${messageId}`, err)
  }
}

// ─── OUTCOME PICKER ───────────────────────────────────────────────────────────
// Channel-aware weighted outcomes:
// SMS     — high delivery, low engagement (people read but don't click)
// WhatsApp — high engagement, very low failure (conversational channel)
// Email    — moderate delivery, moderate open rate, low click rate (classic funnel)
function pickOutcome(channel: string): string {
  const rand = Math.random()

  if (channel === 'sms') {
    if (rand < 0.05) return 'failed'                          // 5% failed
    if (rand < 0.60) return 'delivered'                       // 55% delivered only
    return Math.random() < 0.15 ? 'clicked' : 'opened'       // 40% opened, 6% clicked
  }

  if (channel === 'whatsapp') {
    if (rand < 0.03) return 'failed'                          // 3% failed
    if (rand < 0.38) return 'delivered'                       // 35% delivered only
    return Math.random() < 0.35 ? 'clicked' : 'opened'       // 62% opened, ~22% clicked
  }

  // email (default)
  if (rand < 0.10) return 'failed'                            // 10% failed
  if (rand < 0.55) return 'delivered'                         // 45% delivered only
  return Math.random() < 0.25 ? 'clicked' : 'opened'         // 45% opened, ~11% clicked
}

// ─── SLEEP HELPER ─────────────────────────────────────────────────────────────
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const port = Number(process.env.PORT) || 3002
console.log(`Channel service running on port ${port}`)

serve({ fetch: app.fetch, port })