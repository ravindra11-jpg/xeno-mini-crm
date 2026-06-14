import { Hono } from 'hono'
import {
  callGemini,
  safeParseJSON,
  SegmentRulesSchema,
  AgentResponseSchema,
  ChannelRecommendationSchema,
} from '../lib/geminiClient'
import { db } from '../db/index'
import { messages, segments } from '../db/schema'
import { eq } from 'drizzle-orm'

/*
  crm-backend/src/routes/ai.ts
  ---------------------------
  AI endpoints for CRM route handling.
  - /segment: generate customer segment rules from natural language intent
  - /segment-name: generate a human-friendly segment name from rules
  - /channel: recommend the best campaign channel and reasoning
  - /message: suggest, improve, or personalise campaign copy
  Dependencies: ../lib/geminiClient, ../db/index, ../db/schema
*/

const aiRoutes = new Hono()

// ─── helper: human-readable rule summary ──────────────────────────────────────
function rulesToText(rules: any[]): string {
  if (!rules || rules.length === 0) return 'no filters — includes all customers'
  return rules.map(r => {
    const opMap: Record<string, string> = {
      eq: 'equals', neq: 'does not equal', gt: 'greater than', lt: 'less than', gte: 'at least', lte: 'at most',
    }
    return `${r.field} ${opMap[r.operator] ?? r.operator} ${r.value}`
  }).join(', ')
}

// ─── POST /api/ai/segment ─────────────────────────────────────────────────────
aiRoutes.post('/segment', async (c) => {
  try {
    const { prompt } = await c.req.json()
    if (!prompt) return c.json({ error: 'prompt is required' }, 400)

    const geminiPrompt = `
You are a CRM segment rule generator for Aria, an Indian fashion retail brand.
Convert this natural language description into segment rules.

Description: "${prompt}"

Available fields and their types:
- city: string (Chennai, Mumbai, Delhi, Bangalore)
- totalSpend: number (total ₹ spent)
- orderCount: number (number of orders)
- lastPurchaseAt: number (days since last purchase — use lt for "recent", gt for "inactive")
- productCategory: string (Kurta, Western, Ethnic Fusion, Accessories)
- discountTag: string (none, sale, festive, clearance)
- purchasedDuringCampaign: boolean

Operators: eq, neq, gt, lt, gte, lte
IMPORTANT: Only the 6 operators listed above are valid. Use neq for "not" or "excluding" conditions, primarily with discountTag.

Enum fields have fixed allowed values. You must map user intent to the closest allowed value.
Never output a value that is not in the allowed list, even if the user used different wording.

Allowed values:
- city: "Chennai", "Mumbai", "Delhi", "Bangalore"
- productCategory: "Kurta", "Western", "Ethnic Fusion", "Accessories"
- discountTag: "none", "sale", "festive", "clearance"
- purchasedDuringCampaign: true, false

When the user's wording doesn't exactly match an allowed value, pick the closest semantic match.
For example: if the user says something that sounds like traditional Indian clothing, use "Ethnic Fusion" or "Kurta" depending on context.
If the user describes any kind of promotional pricing, map to the most specific discount tag that fits.
If a concept has no close match in the allowed values, omit that rule entirely rather than inventing a value.

All rules combine with AND.

Respond ONLY with a valid JSON array of rules. No explanation, no markdown, no preamble.
Example: [{"field":"city","operator":"eq","value":"Mumbai"},{"field":"lastPurchaseAt","operator":"gt","value":60}]
`

    const rawResponse = await callGemini(geminiPrompt)
    console.log('[/segment] raw Gemini response:', rawResponse)

    const parsed = safeParseJSON(rawResponse)
    console.log('[/segment] parsed:', JSON.stringify(parsed))

    const rulesArray = Array.isArray(parsed) ? parsed : (parsed as any).rules ?? []

    if (rulesArray.length === 0) {
      console.warn('[/segment] Gemini returned no rules for prompt:', prompt)
      return c.json({ error: 'AI could not generate rules for that description. Try being more specific.', rules: [] }, 422)
    }

    const result = SegmentRulesSchema.safeParse(rulesArray)
    if (!result.success) {
      console.error('[/segment] Zod validation failed:', result.error.issues)
      return c.json({ error: 'AI returned malformed rules', details: result.error.issues, rules: [] }, 422)
    }

    return c.json({ rules: result.data })
  } catch (err) {
    console.error('POST /api/ai/segment error:', err)
    return c.json({ error: 'Failed to generate segment rules', rules: [] }, 500)
  }
})

// ─── POST /api/ai/segment-name ────────────────────────────────────────────────
aiRoutes.post('/segment-name', async (c) => {
  try {
    const { description, rules } = await c.req.json()
    if (!description) return c.json({ error: 'description is required' }, 400)
    if (!Array.isArray(rules)) return c.json({ error: 'rules must be an array' }, 400)

    const rulesText = rulesToText(rules)

    const prompt = `
You are naming a customer segment for Aria, an Indian fashion retail brand's CRM.

The marketer described this audience as: "${description}"
The resulting targeting rules are: ${rulesText}

Write a short, descriptive segment name — 2 to 5 words, title case, no punctuation.
Examples of good names: "Mumbai High Spenders", "Lapsed Kurta Buyers", "Festive Season Shoppers"

Respond with ONLY the segment name. No quotes, no explanation, no markdown.
`
    const result = await callGemini(prompt)
    const name = result.trim().replace(/^["']|["']$/g, '')

    return c.json({ name })
  } catch (err) {
    console.error('POST /api/ai/segment-name error:', err)
    return c.json({ error: 'Failed to generate segment name', name: 'New Segment' }, 500)
  }
})

// ─── POST /api/ai/channel ─────────────────────────────────────────────────────
aiRoutes.post('/channel', async (c) => {
  try {
    const { campaignName, purpose, segmentDescription } = await c.req.json()

    if (!campaignName || !purpose || !segmentDescription) {
      return c.json({ error: 'campaignName, purpose, and segmentDescription are all required' }, 400)
    }

    const prompt = `
You are a senior CRM manager at Aria, an Indian fashion retail brand. You've run hundreds of campaigns and know from experience which channel actually works for which situation.

Campaign name: "${campaignName}"
Campaign purpose: "${purpose}"
Target audience: ${segmentDescription}

Your job is to pick the single best channel. Think about what this campaign is actually trying to do and who it's talking to — not abstract rules about urgency.

Here's how experienced CRM managers at fashion brands actually think about this:

WhatsApp works best when:
- You're pushing a sale, offer, or discount (people act on deals immediately when they see them on WhatsApp)
- You want to feel like a friend tipping someone off — "hey this is on sale, grab it"
- The audience is active/engaged and you want high open + click rates
- New arrivals, flash sales, festive offers, limited-time drops

Email works best when:
- The message is more of a gentle nudge or relationship touchpoint — win-back, re-engagement, "we miss you", loyalty rewards
- You have more to say — a collection story, a lookbook, a detailed offer breakdown
- The audience is lapsed or low-engagement (email is lower pressure, doesn't feel intrusive)
- Post-purchase follow-ups, feedback requests, anniversary or milestone messages

SMS works best when:
- It's a last-resort reminder for someone who hasn't responded to other channels
- Truly time-critical — "sale ends tonight", "your order is ready", "OTP / transactional"
- The message is 1-2 lines and needs guaranteed delivery
- Avoid SMS for anything that feels like marketing — it feels spammy in 2024

Pick the channel that fits what this campaign is actually trying to achieve with this specific audience.

Respond ONLY with a valid JSON object:
{ "channel": "email" | "sms" | "whatsapp", "reasoning": "one practical sentence a marketer would write in a campaign brief — say what the campaign is doing and why this channel fits that" }
No markdown, no preamble, nothing outside the JSON.
`
    const rawResponse = await callGemini(prompt)
    const parsed = safeParseJSON(rawResponse)
    const result = ChannelRecommendationSchema.parse(parsed)

    return c.json(result)
  } catch (err) {
    console.error('POST /api/ai/channel error:', err)
    return c.json({ error: 'Failed to generate channel recommendation' }, 500)
  }
})

// ─── POST /api/ai/message ─────────────────────────────────────────────────────
aiRoutes.post('/message', async (c) => {
  try {
    const { action, template, context } = await c.req.json()

    if (!action) return c.json({ error: 'action is required' }, 400)
    if (!['suggest', 'improve', 'personalise'].includes(action)) {
      return c.json({ error: 'action must be suggest, improve, or personalise' }, 400)
    }

    let prompt: string

    if (action === 'suggest') {
      const { campaignName, purpose, segmentDescription } = context ?? {}
      if (!campaignName || !purpose || !segmentDescription) {
        return c.json({ error: 'context.campaignName, context.purpose, and context.segmentDescription are required for suggest' }, 400)
      }

      prompt = `
You are a marketing copywriter for Aria, an Indian fashion retail brand.
Write a short campaign message for a mass broadcast — sent to every customer in the audience unchanged.

Campaign name: "${campaignName}"
Campaign purpose: "${purpose}"
Target audience: ${segmentDescription}

CRITICAL — match the message TYPE to the campaign purpose:

Win-back / re-engagement campaigns (lapsed customers, haven't visited in a while, inactive):
- Tone: warm, nostalgic, low-pressure — like a brand genuinely checking in
- Do NOT invent discounts or offers unless the purpose explicitly mentions one
- Do NOT add free shipping, percentage off, or any promotion that wasn't stated
- Good example: "Hey there, it's been a while and we've been thinking of you. There's a lot of new Aria waiting — come take a look."
- Bad example: "We miss you! Here's 20% off to welcome you back." ← inventing offers is wrong

Sale / promotional campaigns (purpose explicitly mentions a sale, offer, discount, festive):
- Lead with the offer — that's the hook
- Be specific about what was mentioned (sale, festive collection, new drop)
- Energetic, action-oriented tone

New arrivals / collection launches:
- Focus on discovery and excitement, not discounts
- Paint a picture of what's new, make them curious

Loyalty / milestone campaigns:
- Make it feel special and exclusive
- Acknowledge the customer's relationship with the brand

Rules that apply to ALL messages:
- Do NOT use {{firstName}}, {{city}}, or any placeholder
- Open with an inclusive greeting ("Hey there", "Hello" etc.) — never a name
- Max 2-3 sentences
- No hashtags
- Do NOT add any offer, discount, or promotion unless the campaign purpose explicitly states one

Respond with ONLY the message text. No explanation, no markdown.
`
    } else if (action === 'improve') {
      if (!template) return c.json({ error: 'template is required for improve' }, 400)

      prompt = `
You are a marketing copywriter for Aria, an Indian fashion retail brand.
Rewrite this campaign message to be more compelling and well-crafted —
sharper language, better flow, stronger call to action if appropriate.

Important:
- Do NOT change the nature or intent of the message. If it's a win-back message with no offer, keep it that way — do not add discounts or promotions.
- If the original contains {{firstName}} or {{city}} placeholders, keep them exactly as-is.
- Match the tone of the original (warm and gentle stays warm and gentle, urgent stays urgent).

Original: "${template}"

Respond with ONLY the improved message text. No explanation, no markdown.
`
    } else {
      if (!template) return c.json({ error: 'template is required for personalise' }, 400)

      prompt = `
You are a marketing copywriter for Aria, an Indian fashion retail brand.
Rewrite this campaign message so it feels personally addressed to each customer,
using the placeholders {{firstName}} and {{city}}.

Original message (use this as the basis for tone and intent, but feel free to
restructure the sentence so the personalisation feels natural rather than inserted):
"${template}"

Rules:
- Include {{firstName}} naturally, typically in a greeting
- Include {{city}} only if it adds relevance (e.g. local offer, local store, weather-appropriate styling) — don't force it if it doesn't fit
- Keep the core message and intent of the original — do NOT add offers or change what the message is about
- Max 2-3 sentences
- Warm, personal tone — should feel like a message written for that one person

Respond with ONLY the personalised message text. No explanation, no markdown.
`
    }

    const result = await callGemini(prompt)
    return c.json({ template: result.trim() })
  } catch (err) {
    console.error('POST /api/ai/message error:', err)
    return c.json({ error: 'Failed to generate message' }, 500)
  }
})

// ─── POST /api/ai/agent ───────────────────────────────────────────────────────
aiRoutes.post('/agent', async (c) => {
  try {
    const { prompt } = await c.req.json()
    if (!prompt) return c.json({ error: 'prompt is required' }, 400)

    const existingSegments = await db.select().from(segments)
    const existingSegmentsText = existingSegments.length === 0
      ? 'No existing segments.'
      : existingSegments.map(s => {
          const rules = (s.rules as any[]) ?? []
          return `- "${s.name}": ${rulesToText(rules)}`
        }).join('\n')

    const geminiPrompt = `
You are an AI marketing agent for Aria, an Indian fashion retail brand.
A marketer has described a campaign goal. Generate a complete campaign plan.

Marketer's goal: "${prompt}"

Existing saved segments (name and targeting rules):
${existingSegmentsText}

Available segment fields:
- city: string (Chennai, Mumbai, Delhi, Bangalore)
- totalSpend: number (₹ spent total)
- orderCount: number
- lastPurchaseAt: number (days since last purchase)
- productCategory: string (Kurta, Western, Ethnic Fusion, Accessories)
- discountTag: string (none, sale, festive, clearance)
- purchasedDuringCampaign: boolean

Operators: eq, neq, gt, lt, gte, lte

Available channels:
- email: detailed content, visuals, less urgent
- sms: short, urgent, time-sensitive, high open rates
- whatsapp: personal, conversational, rich media, high engagement

Steps:
1. Design the ideal segment (rules, name, description) for this goal — generate this regardless of whether an existing segment fits.
2. Check if any EXISTING segment listed above already targets essentially the same audience as your ideal segment. If yes, set "matchedExistingSegment" to that segment's exact name. If no existing segment is a good match, set "matchedExistingSegment" to null.
3. Pick the best channel for this goal.
4. Write a message template using {{firstName}} and/or {{city}} where appropriate.
5. Explain your reasoning.

Respond ONLY with a valid JSON object matching this exact shape:
{
  "segmentName": "short descriptive name for the ideal segment",
  "segmentDescription": "one sentence describing this audience",
  "rules": [...],
  "matchedExistingSegment": "exact name of an existing segment that fits, or null",
  "channel": "email" | "sms" | "whatsapp",
  "messageTemplate": "template with {{firstName}} and/or {{city}}",
  "reasoning": "2-3 sentences explaining the audience, channel, and message choices, and whether an existing segment was reused or a new one is recommended"
}
No markdown, no preamble, no explanation outside the JSON.
`

    const rawResponse = await callGemini(geminiPrompt)
    const parsed = safeParseJSON(rawResponse)
    const planData = (parsed as any).plan ?? parsed
    const plan = AgentResponseSchema.parse(planData)

    return c.json({ plan })
  } catch (err) {
    console.error('POST /api/ai/agent error:', err)
    return c.json({ error: 'Failed to generate campaign plan' }, 500)
  }
})

// ─── POST /api/ai/insight ─────────────────────────────────────────────────────
interface CampaignStats {
  total: number
  delivered: number
  opened: number
  clicked: number
  failed: number
  deliveryRate: string
  openRate: string
  clickRate: string
}

function computeCampaignStats(allMessages: typeof messages.$inferSelect[]): CampaignStats {
  const total     = allMessages.length
  const delivered = allMessages.filter(m => m.deliveredAt).length
  const opened    = allMessages.filter(m => m.openedAt).length
  const clicked   = allMessages.filter(m => m.clickedAt).length
  const failed    = allMessages.filter(m => m.status === 'failed').length

  return {
    total,
    delivered,
    opened,
    clicked,
    failed,
    deliveryRate: total > 0 ? ((delivered / total) * 100).toFixed(1) : '0',
    openRate:     delivered > 0 ? ((opened / delivered) * 100).toFixed(1) : '0',
    clickRate:    opened > 0    ? ((clicked / opened) * 100).toFixed(1)   : '0',
  }
}

function buildInsightPrompt(stats: CampaignStats): string {
  return `
You are a CRM analyst for Aria, an Indian fashion retail brand. A marketer just finished a campaign and wants to know what it means — not what the numbers are (they can already see those on screen), but what to take away from them.

Campaign stats:
- Sent: ${stats.total}
- Delivered: ${stats.delivered} (${stats.deliveryRate}%)
- Opened: ${stats.opened} (${stats.openRate}% of delivered)
- Clicked: ${stats.clicked} (${stats.clickRate}% of opened)
- Failed: ${stats.failed}

Industry benchmarks for Indian fashion retail:
- Delivery ≥ 90% = good, < 80% = poor
- Open rate ≥ 40% = excellent, 25–39% = good, 15–24% = average, < 15% = poor
- Click-to-open ≥ 20% = excellent, 10–19% = good, 5–9% = average, < 5% = poor
- Failed < 5% = fine, ≥ 10% = investigate contact list quality

Your job — write 2–4 insight points:
- Interpret what these numbers MEAN, not what they are. The marketer can read numbers. You tell them what to do with the information.
- Good example: "The audience list is clean — safe to reuse this segment for future campaigns."
- Bad example: "Delivery rate (98.9%) is excellent." ← this just restates a number they already see.
- If a metric is strong, say WHY it likely worked and WHEN to run this type of campaign again.
- If a metric is weak, give one specific actionable fix — not generic advice like "improve subject lines."
- NEVER flag a metric as a problem if it meets or exceeds its benchmark.
- NEVER mention a metric by its percentage value — they can see that. Interpret it instead.
- No filler. No "it is worth noting." No "consider leveraging."

Respond with ONLY valid JSON, no markdown, no backticks:
{
  "performance": "excellent" | "good" | "average" | "poor",
  "points": ["insight 1", "insight 2", "insight 3"]
}
`
}

function formatInsightResponse(raw: string): string {
  try {
    const parsed = safeParseJSON(raw) as any
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.points) && parsed.points.length > 0) {
      const performance = typeof parsed.performance === 'string' && parsed.performance.length > 0
        ? parsed.performance.charAt(0).toUpperCase() + parsed.performance.slice(1)
        : 'Insight'
      const points = (parsed.points as string[])
        .filter((point) => typeof point === 'string')
        .map((point) => point.trim().replace(/^[•\-\*\s]+/, ''))
        .filter(Boolean)

      if (points.length > 0) {
        return `[${performance}]\n` + points.map((p: string) => `• ${p}`).join('\n')
      }
    }
  } catch (err) {
    // fall back to raw response if parsing fails
  }

  return raw.trim()
}

export async function generateCampaignInsight(campaignId: string): Promise<string> {
  const allMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.campaignId, campaignId))

  if (allMessages.length === 0) {
    throw new Error('No messages found for this campaign')
  }

  const stats = computeCampaignStats(allMessages)
  const raw = await callGemini(buildInsightPrompt(stats))
  return formatInsightResponse(raw)
}

aiRoutes.post('/insight', async (c) => {
  try {
    const { campaignId } = await c.req.json()
    if (!campaignId) return c.json({ error: 'campaignId is required' }, 400)

    const insight = await generateCampaignInsight(campaignId)
    return c.json({ insight })
  } catch (err) {
    console.error('POST /api/ai/insight error:', err)
    return c.json({ error: 'Failed to generate insight' }, 500)
  }
})

export default aiRoutes