import { Hono } from 'hono'
import { db } from '../db/index'
import { campaigns, messages, segments } from '../db/schema'
import { eq, desc, isNotNull, sql } from 'drizzle-orm'
import { sendCampaign } from '../lib/campaignSender'

const campaignRoutes = new Hono()

/*
  crm-backend/src/routes/campaigns.ts
  --------------------------------------
  Campaign route handlers for the CRM backend.
  - /api/campaigns: list, create, fetch, stats, send
  - includes campaign stats aggregation and timeline building helpers
  Dependencies: ../db/index, ../db/schema, ../lib/campaignSender
*/

// ─── GET /api/campaigns ───────────────────────────────────────────────────────
// returns all campaigns with segment name and quick stats
campaignRoutes.get('/', async (c) => {
  try {
    const allCampaigns = await db
      .select()
      .from(campaigns)
      .orderBy(desc(campaigns.createdAt))

    // for each campaign attach segment name and basic stats
    const campaignsWithDetails = await Promise.all(
      allCampaigns.map(async (campaign) => {
        // get segment name
        const segment = await db.query.segments.findFirst({
          where: (s, { eq }) => eq(s.id, campaign.segmentId)
        })

        // get quick stats
        const stats = await getCampaignStats(campaign.id)

        return {
          ...campaign,
          segmentName: segment?.name ?? 'Unknown',
          stats,
        }
      })
    )

    return c.json({ campaigns: campaignsWithDetails })
  } catch (err) {
    console.error('GET /api/campaigns error:', err)
    return c.json({ error: 'Failed to fetch campaigns' }, 500)
  }
})

// ─── POST /api/campaigns ──────────────────────────────────────────────────────
// creates a new campaign in draft status
// body: { name, segmentId, channel, messageTemplate }
campaignRoutes.post('/', async (c) => {
  try {
    const requestBody = await c.req.json()
    const { name, segmentId, channel, messageTemplate } = requestBody

    if (!name || !segmentId || !channel || !messageTemplate) {
      return c.json({ error: 'name, segmentId, channel, messageTemplate are required' }, 400)
    }

    // validate channel
    const validChannels = ['email', 'sms', 'whatsapp']
    if (!validChannels.includes(channel)) {
      return c.json({ error: `Invalid channel. Must be one of: ${validChannels.join(', ')}` }, 400)
    }

    // verify segment exists
    const segment = await db.query.segments.findFirst({
      where: (s, { eq }) => eq(s.id, segmentId)
    })

    if (!segment) {
      return c.json({ error: 'Segment not found' }, 404)
    }

    const [newCampaign] = await db
      .insert(campaigns)
      .values({ name, segmentId, channel, messageTemplate })
      .returning()

    return c.json({ campaign: { ...newCampaign, segmentName: segment.name } }, 201)
  } catch (err) {
    console.error('POST /api/campaigns error:', err)
    return c.json({ error: 'Failed to create campaign' }, 500)
  }
})

// ─── GET /api/campaigns/:id ───────────────────────────────────────────────────
// returns full campaign detail with stats and message timeline
campaignRoutes.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')

    const campaign = await db.query.campaigns.findFirst({
      where: (c, { eq }) => eq(c.id, id)
    })

    if (!campaign) {
      return c.json({ error: 'Campaign not found' }, 404)
    }

    const segment = await db.query.segments.findFirst({
      where: (s, { eq }) => eq(s.id, campaign.segmentId)
    })

    const stats = await getCampaignStats(id)

    // get message timeline — chronological events from message timestamps
    const timeline = await getMessageTimeline(id)

    return c.json({
      campaign: {
        ...campaign,
        segmentName: segment?.name ?? 'Unknown',
        stats,
        timeline,
      }
    })
  } catch (err) {
    console.error('GET /api/campaigns/:id error:', err)
    return c.json({ error: 'Failed to fetch campaign' }, 500)
  }
})

// ─── GET /api/campaigns/:id/stats ────────────────────────────────────────────
// returns aggregated stats — used by frontend polling every 10 seconds
// returns pre-calculated numbers, never raw rows
campaignRoutes.get('/:id/stats', async (c) => {
  try {
    const id = c.req.param('id')
    const stats = await getCampaignStats(id)
    return c.json({ stats })
  } catch (err) {
    console.error('GET /api/campaigns/:id/stats error:', err)
    return c.json({ error: 'Failed to fetch stats' }, 500)
  }
})

// ─── POST /api/campaigns/:id/send ────────────────────────────────────────────
// triggers campaign send — creates message rows and fires to channel service
campaignRoutes.post('/:id/send', async (c) => {
  try {
    const id = c.req.param('id')

    const campaign = await db.query.campaigns.findFirst({
      where: (c, { eq }) => eq(c.id, id)
    })

    if (!campaign) {
      return c.json({ error: 'Campaign not found' }, 404)
    }

    // prevent double sending
    if (campaign.status === 'sending' || campaign.status === 'completed') {
      return c.json({ error: `Campaign is already ${campaign.status}` }, 400)
    }

    // fire and forget — don't await the full send
    // respond immediately, sending happens in background
    sendCampaign(campaign).catch(err => {
      console.error(`❌ Campaign send failed for ${campaign.id}:`, err)
    })

    return c.json({ ok: true, message: 'Campaign send initiated' })
  } catch (err) {
    console.error('POST /api/campaigns/:id/send error:', err)
    return c.json({ error: 'Failed to initiate campaign send' }, 500)
  }
})

// ─── HELPERS ──────────────────────────────────────────────────────────────────

// aggregates campaign stats from message rows
// uses timestamp presence for accuracy — not status string
// delivered = deliveredAt IS NOT NULL (includes opened and clicked)
// opened = openedAt IS NOT NULL (includes clicked)
// clicked = clickedAt IS NOT NULL
async function getCampaignStats(campaignId: string) {
  const result = await db
    .select({
      sent:      sql<number>`count(*)`,
      delivered: sql<number>`count(${messages.deliveredAt})`,
      opened:    sql<number>`count(${messages.openedAt})`,
      clicked:   sql<number>`count(${messages.clickedAt})`,
      failed:    sql<number>`sum(case when ${messages.status} = 'failed' then 1 else 0 end)`,
      pending:   sql<number>`sum(case when ${messages.status} = 'pending' then 1 else 0 end)`,
    })
    .from(messages)
    .where(eq(messages.campaignId, campaignId))

  const row = result[0]
  return {
    sent:      Number(row?.sent ?? 0),
    delivered: Number(row?.delivered ?? 0),
    opened:    Number(row?.opened ?? 0),
    clicked:   Number(row?.clicked ?? 0),
    failed:    Number(row?.failed ?? 0),
    pending:   Number(row?.pending ?? 0),
  }
}

// builds a chronological timeline from message timestamps
// groups events by minute for a clean display
async function getMessageTimeline(campaignId: string) {
  const allMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.campaignId, campaignId))

  // collect all timestamped events
  const events: { time: Date; type: string }[] = []

  for (const msg of allMessages) {
    if (msg.sentAt)     events.push({ time: msg.sentAt,     type: 'sent' })
    if (msg.deliveredAt) events.push({ time: msg.deliveredAt, type: 'delivered' })
    if (msg.openedAt)   events.push({ time: msg.openedAt,   type: 'opened' })
    if (msg.clickedAt)  events.push({ time: msg.clickedAt,  type: 'clicked' })
  }

  // sort chronologically
  events.sort((a, b) => a.time.getTime() - b.time.getTime())

  // group by minute and count events of each type per minute
  const grouped: Record<string, Record<string, number>> = {}

  for (const event of events) {
    // round to minute for grouping
    const minute = new Date(event.time)
    minute.setSeconds(0, 0)
    const key = minute.toISOString()

    if (!grouped[key]) grouped[key] = {}
    grouped[key][event.type] = (grouped[key][event.type] || 0) + 1
  }

  // convert to array for frontend
  return Object.entries(grouped).map(([time, counts]) => ({
    time,
    ...counts,
  }))
}

export default campaignRoutes