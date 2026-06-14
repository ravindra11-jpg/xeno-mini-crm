import { Hono } from 'hono'
import { db } from '../db/index'
import { segments, campaigns } from '../db/schema'
import { eq, sql } from 'drizzle-orm'
import { countMatchingCustomers } from '../lib/segmentEngine'
import { callGemini } from '../lib/geminiClient'

/*
  crm-backend/src/routes/segments.ts
  -------------------------------------
  Segment CRUD and preview endpoints for the CRM backend.
  - list, create, delete, fetch, and preview segments
  - uses AI to generate segment descriptions
  Dependencies: ../db/index, ../db/schema, ../lib/segmentEngine, ../lib/geminiClient
*/

const segmentRoutes = new Hono()

/**
 * Convert a list of rule objects into a readable sentence.
 * @param rules Array of segment rule objects
 * @returns Human-friendly text for the rule list
 */
function rulesToText(rules: any[]): string {
  return rules.map(r => {
    const opMap: Record<string, string> = {
      eq:  'equals',
      neq: 'does not equal',
      gt:  'greater than',
      lt:  'less than',
      gte: 'at least',
      lte: 'at most',
    }
    return `${r.field} ${opMap[r.operator] ?? r.operator} ${r.value}`
  }).join(', ')
}

async function generateSegmentDescription(rules: any[], customerCount: number): Promise<string> {
  const ruleCount = rules.length
  const rulesText = ruleCount === 0
    ? 'No filters — includes the entire customer base.'
    : `- ${rulesToText(rules)}`

  const prompt = `
You are a CRM analyst at Aria, an Indian fashion retail brand.
Your job: write a crisp AI summary for a customer segment, to help a marketer understand WHO this is and WHAT to do.

Segment rules (${ruleCount} total):
${rulesText}

STRICT RULES:
1. Base EVERY claim solely on the rules above. If a rule doesn't say it, don't write it.
2. If rules are sparse (1–2 rules), write SHORT bullets — 1 sentence each. Do not pad.
3. Never infer emotional states, intent, or motivations beyond what the rules directly indicate.
4. "purchasedDuringCampaign = true" means: this customer has bought something during a past campaign window. Nothing more.
5. Use plain, direct language. Avoid marketing fluff like "engaged", "receptive", "high-intent" unless rules directly support it.

Write exactly 4 markdown bullets:
- **Audience**: Describe who these customers are based strictly on the rules. If only 1–2 rules, keep this to 1 sentence.
- **Intent signal**: What the rule combination suggests — be conservative. If rules are sparse, say so honestly (e.g. "Limited signal from this rule alone").
- **Campaign angle**: One concrete tactic matching these rules (offer type, channel, or timing).
- **Watch out**: One genuine risk or limitation of this segment.

Output ONLY the 4 bullet lines in markdown. No heading, no preamble, no segment name, no customer count.
`.trim()

  try {
    const result = await callGemini(prompt)
    return result.trim()
  } catch {
    return ruleCount === 0
      ? '- **Audience**: Entire customer base — no filters applied.\n- **Intent signal**: Mixed across all engagement and spend levels.\n- **Campaign angle**: Best for **broad announcements** or new collection launches.\n- **Watch out**: Too broad for personalised or high-value targeting.'
      : '- **Audience**: Customers matching the defined criteria.\n- **Intent signal**: See targeting rules above for specifics.\n- **Campaign angle**: Match offer and channel to the dominant rule in this segment.\n- **Watch out**: Verify segment size before committing to large send volumes.'
  }
}

segmentRoutes.get('/', async (c) => {
  try {
    const rows = await db.select().from(segments).orderBy(segments.createdAt)
    const withCounts = await Promise.all(
      rows.map(async (seg) => {
        const rules = (seg.rules as any[]) ?? []
        const customerCount = await countMatchingCustomers(rules)
        return { ...seg, customerCount }
      })
    )
    return c.json({ segments: withCounts })
  } catch (err) {
    console.error('GET /api/segments error:', err)
    return c.json({ error: 'Failed to fetch segments' }, 500)
  }
})

segmentRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const { name, rules } = body
    if (!name) return c.json({ error: 'name is required' }, 400)
    if (!Array.isArray(rules)) return c.json({ error: 'rules must be an array' }, 400)
    const customerCount = await countMatchingCustomers(rules)
    const description = await generateSegmentDescription(rules, customerCount)
    const [segment] = await db
      .insert(segments)
      .values({ name, description, rules, isDefault: false })
      .returning()
    return c.json({ segment: { ...segment, customerCount } }, 201)
  } catch (err) {
    console.error('POST /api/segments error:', err)
    return c.json({ error: 'Failed to create segment' }, 500)
  }
})

segmentRoutes.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const [segment] = await db.select().from(segments).where(eq(segments.id, id))
    if (!segment) return c.json({ error: 'Segment not found' }, 404)
    if (segment.isDefault) return c.json({ error: 'Default segments cannot be deleted' }, 403)
    const linked = await db.select().from(campaigns).where(eq(campaigns.segmentId, id))
    if (linked.length > 0) {
      return c.json({
        error: `This segment is used by ${linked.length} campaign${linked.length > 1 ? 's' : ''} and cannot be deleted`,
      }, 409)
    }
    await db.delete(segments).where(eq(segments.id, id))
    return c.json({ success: true })
  } catch (err) {
    console.error('DELETE /api/segments/:id error:', err)
    return c.json({ error: 'Failed to delete segment' }, 500)
  }
})

segmentRoutes.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const [segment] = await db.select().from(segments).where(eq(segments.id, id))
    if (!segment) return c.json({ error: 'Segment not found' }, 404)
    const rules = (segment.rules as any[]) ?? []
    const customerCount = await countMatchingCustomers(rules)
    return c.json({ segment: { ...segment, customerCount } })
  } catch (err) {
    console.error('GET /api/segments/:id error:', err)
    return c.json({ error: 'Failed to fetch segment' }, 500)
  }
})

segmentRoutes.get('/:id/preview', async (c) => {
  try {
    const id = c.req.param('id')
    const [segment] = await db.select().from(segments).where(eq(segments.id, id))
    if (!segment) return c.json({ error: 'Segment not found' }, 404)
    const rules = (segment.rules as any[]) ?? []
    const count = await countMatchingCustomers(rules)
    return c.json({ count })
  } catch (err) {
    console.error('GET /api/segments/:id/preview error:', err)
    return c.json({ error: 'Failed to preview segment' }, 500)
  }
})

segmentRoutes.post('/preview', async (c) => {
  try {
    const { rules } = await c.req.json()
    if (!Array.isArray(rules)) return c.json({ error: 'rules must be an array' }, 400)
    const count = await countMatchingCustomers(rules)
    return c.json({ count })
  } catch (err) {
    console.error('POST /api/segments/preview error:', err)
    return c.json({ error: 'Failed to preview segment' }, 500)
  }
})

export default segmentRoutes