import { Hono } from 'hono'
import { db } from '../db/index'
import { messages, campaigns } from '../db/schema'
import { eq, sql } from 'drizzle-orm'
import { generateCampaignInsight } from './ai'

const receiptRoutes = new Hono()

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/receipt
// called by channel service after each message delivery attempt
receiptRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const { messageId, status: outcome } = body

    if (!messageId || !UUID_REGEX.test(messageId)) {
      console.error(`❌ Receipt: invalid messageId format — "${messageId}"`)
      return c.json({ error: 'Invalid messageId' }, 400)
    }

    const validOutcomes = ['delivered', 'opened', 'clicked', 'failed']
    if (!outcome || !validOutcomes.includes(outcome)) {
      return c.json({ error: `Invalid outcome. Must be one of: ${validOutcomes.join(', ')}` }, 400)
    }

    const now = new Date()

    // build the update payload based on outcome
    // each outcome is cumulative — clicked also means opened and delivered
    const updatePayload: Record<string, unknown> = { status: outcome }

    if (outcome === 'delivered' || outcome === 'opened' || outcome === 'clicked') {
      updatePayload.deliveredAt = now
    }
    if (outcome === 'opened' || outcome === 'clicked') {
      updatePayload.openedAt = now
    }
    if (outcome === 'clicked') {
      updatePayload.clickedAt = now
    }
    if (outcome === 'failed') {
      updatePayload.status = 'failed'
    }

    const [updated] = await db
      .update(messages)
      .set(updatePayload)
      .where(eq(messages.id, messageId))
      .returning({ id: messages.id, campaignId: messages.campaignId })

    if (!updated) {
      console.error(`❌ Receipt: message not found — ${messageId}`)
      return c.json({ error: 'Message not found' }, 404)
    }

    console.log(`📬 Receipt processed — messageId: ${messageId}, outcome: ${outcome}`)

    // check if all messages for this campaign are done (no more pending)
    const pending = await db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(eq(messages.campaignId, updated.campaignId))

    // mark campaign completed if nothing pending
    const [pendingCheck] = await db
      .select({ pending: sql<number>`sum(case when ${messages.status} = 'pending' then 1 else 0 end)` })
      .from(messages)
      .where(eq(messages.campaignId, updated.campaignId))

    if (Number(pendingCheck?.pending ?? 0) === 0) {
      const campaign = await db.query.campaigns.findFirst({
        where: (c, { eq }) => eq(c.id, updated.campaignId),
      })

      let aiInsight: string | undefined
      if (campaign && !campaign.aiInsight) {
        try {
          aiInsight = await generateCampaignInsight(updated.campaignId)
        } catch (err) {
          console.error(`Insight generation failed for campaign ${updated.campaignId}:`, err)
        }
      }

      const updatePayload: Record<string, unknown> = { status: 'completed' }
      if (aiInsight) updatePayload.aiInsight = aiInsight

      await db
        .update(campaigns)
        .set(updatePayload)
        .where(eq(campaigns.id, updated.campaignId))

      console.log(`🏁 Campaign ${updated.campaignId} marked completed`)
    }

    return c.json({ ok: true })
  } catch (err) {
    console.error('POST /api/receipt error:', err)
    return c.json({ error: 'Failed to process receipt' }, 500)
  }
})

export default receiptRoutes