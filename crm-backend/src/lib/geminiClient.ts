import { z } from 'zod'
import 'dotenv/config'
import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })

/*
  crm-backend/src/lib/geminiClient.ts
  --------------------------------------
  Gemini client wrapper and AI response validators.
  - callGemini sends prompts to the model and returns raw text
  - Zod schemas validate AI output for segment generation, agent planning, and channel selection
  - safeParseJSON removes markdown fences before JSON.parse
  Dependencies: groq-sdk, zod
*/

export async function callGemini(prompt: string): Promise<string> {
  /**
   * Send a prompt to Gemini and return the raw text completion.
   * @param prompt The natural language prompt for the model
   * @returns Raw string response from Gemini
   */
  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
  })
  return response.choices[0].message.content ?? ''
}

// ─── SEGMENT RULES SCHEMA ─────────────────────────────────────────────────────
// Validates the array of segment rules returned by /api/ai/segment.
export const SegmentRuleSchema = z.object({
  field: z.enum(['city', 'totalSpend', 'orderCount', 'lastPurchaseAt', 'productCategory', 'discountTag', 'purchasedDuringCampaign']),
  operator: z.enum(['eq', 'neq', 'gt', 'lt', 'gte', 'lte']),
  value: z.union([z.string(), z.number(), z.boolean()]),
})

export const SegmentRulesSchema = z.array(SegmentRuleSchema).min(1).max(5)

// ─── AGENT RESPONSE SCHEMA ────────────────────────────────────────────────────
// Validates the structured AI plan returned by /api/ai/agent.
// matchedExistingSegment: name of an existing segment the AI judges as a good fit
// for this goal, or null if none of the existing segments fit well and a new
// one should be generated. The "rules"/"segmentName"/"segmentDescription" fields
// always describe the NEW candidate segment regardless — frontend decides
// whether to use the existing match or the generated one.
export const AgentResponseSchema = z.object({
  segmentName: z.string(),
  segmentDescription: z.string(),
  rules: SegmentRulesSchema,
  matchedExistingSegment: z.string().nullable(),
  channel: z.enum(['email', 'sms', 'whatsapp']),
  messageTemplate: z.string(),
  reasoning: z.string(),
})

export type AgentResponse = z.infer<typeof AgentResponseSchema>

// ─── CHANNEL RECOMMENDATION SCHEMA ────────────────────────────────────────────
export const ChannelRecommendationSchema = z.object({
  // Validates the AI channel recommendation returned by /api/ai/channel.
  channel: z.enum(['email', 'sms', 'whatsapp']),
  reasoning: z.string(),
})

export type ChannelRecommendation = z.infer<typeof ChannelRecommendationSchema>

// ─── SAFE JSON PARSE ──────────────────────────────────────────────────────────
// strips markdown fences before parsing — Gemini often wraps JSON in ```json
export function safeParseJSON(text: string): unknown {
  /**
   * Parse JSON text returned by Gemini after stripping optional markdown fences.
   * @param text Raw response text from Gemini
   * @returns Parsed JSON object
   */
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  return JSON.parse(cleaned)
}