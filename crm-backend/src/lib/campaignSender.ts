import { db } from '../db/index'
import { campaigns, messages } from '../db/schema'
import { eq } from 'drizzle-orm'
import { getMatchingCustomers } from './segmentEngine'
import type { SegmentRule } from './segmentEngine'
import type { Campaign, Customer } from '../db/schema'
import 'dotenv/config'

/*
  crm-backend/src/lib/campaignSender.ts
  ---------------------------------------
  Sends campaign messages by resolving segment customers, creating message rows,
  and forwarding content to the channel-service.
  - exports sendCampaign(campaign)
  Dependencies: ../db/index, ../db/schema, ./segmentEngine
*/

// ─── INTERPOLATE MESSAGE ──────────────────────────────────────────────────────
/**
 * Replace template placeholders with customer-specific values.
 * Supports `{{firstName}}` and `{{city}}` placeholders used in `messageTemplate`.
 * @param template Message template containing placeholders
 * @param customer Customer row used to interpolate values
 */
function interpolateMessage(template: string, customer: Customer): string {
  const firstName = (customer.name || '').split(' ')[0]
  return template
    .replace(/{{firstName}}/g, firstName)
    .replace(/{{city}}/g, customer.city)
}

// ─── SEND CAMPAIGN ────────────────────────────────────────────────────────────
// main function — called by POST /api/campaigns/:id/send
// fetches matching customers, creates message rows, sends to channel service
/**
 * Send a campaign to all matching customers.
 * Behavior:
 * - Resolves the campaign's segment to customers via `getMatchingCustomers`.
 * - Inserts one `messages` row per customer with status `pending`.
 * - Posts each message to the channel service in a fire-and-forget manner.
 * - Updates campaign status to `sending` and sets `sentAt`.
 * Note: failures to POST to the channel service are logged per-customer but do not
 * abort sending to other recipients.
 * @param campaign Campaign row loaded from DB
 */
export async function sendCampaign(campaign: Campaign): Promise<void> {
  const CHANNEL_SERVICE_URL = process.env.CHANNEL_SERVICE_URL || 'http://localhost:3002'
  const CRM_CALLBACK_URL = process.env.CRM_CALLBACK_URL || 'http://localhost:3001'

  // step 1 — fetch the segment to get its rules
  const segment = await db.query.segments.findFirst({
    where: (segments, { eq }) => eq(segments.id, campaign.segmentId)
  })

  if (!segment) {
    throw new Error(`Segment not found for campaign ${campaign.id}`)
  }

  // step 2 — get all customers matching the segment rules
  const matchingCustomers = await getMatchingCustomers(segment.rules as SegmentRule[])

  if (matchingCustomers.length === 0) {
    throw new Error('No customers match this segment')
  }

  console.log(`📤 Sending campaign "${campaign.name}" to ${matchingCustomers.length} customers`)

  // step 3 — update campaign status to sending
  await db
    .update(campaigns)
    .set({ status: 'sending', sentAt: new Date() })
    .where(eq(campaigns.id, campaign.id))

  // step 4 — for each customer, create a message row and send to channel service
  for (const customer of matchingCustomers) {
    // interpolate the template for this specific customer
    const content = interpolateMessage(campaign.messageTemplate, customer)

    // create the message row in DB — starts as pending
    const [message] = await db
      .insert(messages)
      .values({
        campaignId: campaign.id,
        customerId: customer.id,
        channel: campaign.channel,
        content,
        status: 'pending',
        sentAt: new Date(),
      })
      .returning()

    // fire and forget — send to channel service
    // we do NOT await this — campaign sender moves to next customer immediately
    // channel service handles simulation and callback asynchronously
    fetch(`${CHANNEL_SERVICE_URL}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageId: message.id,
        customerId: customer.id,
        content,
        channel: campaign.channel,
        callbackUrl: `${CRM_CALLBACK_URL}/api/receipt`,
      }),
    }).catch(err => {
      // log but don't crash — other customers still get their messages
      console.error(`❌ Failed to send to channel service for customer ${customer.id}:`, err)
    })
  }

  console.log(`✅ Campaign "${campaign.name}" — all ${matchingCustomers.length} sends fired`)
}