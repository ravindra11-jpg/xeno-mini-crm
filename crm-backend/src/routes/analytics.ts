import { Hono } from 'hono'
import { db } from '../db/index'
import { campaigns, messages } from '../db/schema'
import { sql, eq } from 'drizzle-orm'

const analyticsRoutes = new Hono()

// ─── GET /api/analytics ───────────────────────────────────────────────────────
// overall stats across all campaigns
// used by dashboard for top-level numbers
analyticsRoutes.get('/', async (c) => {
  try {
    // total campaigns by status
    const campaignStats = await db
      .select({
        total:     sql<number>`count(*)`,
        sending:   sql<number>`sum(case when ${campaigns.status} = 'sending' then 1 else 0 end)`,
        completed: sql<number>`sum(case when ${campaigns.status} = 'completed' then 1 else 0 end)`,
        draft:     sql<number>`sum(case when ${campaigns.status} = 'draft' then 1 else 0 end)`,
      })
      .from(campaigns)

    // total message stats across all campaigns
    const messageStats = await db
      .select({
        totalSent:      sql<number>`count(*)`,
        totalDelivered: sql<number>`count(${messages.deliveredAt})`,
        totalOpened:    sql<number>`count(${messages.openedAt})`,
        totalClicked:   sql<number>`count(${messages.clickedAt})`,
        totalFailed:    sql<number>`sum(case when ${messages.status} = 'failed' then 1 else 0 end)`,
      })
      .from(messages)

    const c1 = campaignStats[0]
    const m1 = messageStats[0]

    return c.json({
      campaigns: {
        total:     Number(c1?.total ?? 0),
        sending:   Number(c1?.sending ?? 0),
        completed: Number(c1?.completed ?? 0),
        draft:     Number(c1?.draft ?? 0),
      },
      messages: {
        totalSent:      Number(m1?.totalSent ?? 0),
        totalDelivered: Number(m1?.totalDelivered ?? 0),
        totalOpened:    Number(m1?.totalOpened ?? 0),
        totalClicked:   Number(m1?.totalClicked ?? 0),
        totalFailed:    Number(m1?.totalFailed ?? 0),
      },
    })
  } catch (err) {
    console.error('GET /api/analytics error:', err)
    return c.json({ error: 'Failed to fetch analytics' }, 500)
  }
})

export default analyticsRoutes