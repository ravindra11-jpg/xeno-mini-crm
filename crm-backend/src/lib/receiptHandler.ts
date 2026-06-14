import { db } from '../db/index'
import { messages } from '../db/schema'
import { eq } from 'drizzle-orm'

// ─── RECEIPT PAYLOAD TYPE ─────────────────────────────────────────────────────
// this is what the channel service sends back on each callback
export type ReceiptPayload = {
  messageId: string
  customerId: string
  status: 'delivered' | 'failed' | 'opened' | 'clicked'
  timestamp: string
}

// ─── HANDLE RECEIPT ───────────────────────────────────────────────────────────
// finds the message row and updates its status and timestamps
// called by the /api/receipt route every time channel service callbacks
export async function handleReceipt(payload: ReceiptPayload) {
  const { messageId, status, timestamp } = payload
  const ts = new Date(timestamp)

  // build the update object based on outcome
  // each status sets its own timestamp column
  const updateData: Record<string, any> = { status }

  switch (status) {
    case 'delivered':
      updateData.deliveredAt = ts
      break
    case 'failed':
      // failed has no timestamp column — just update status
      break
    case 'opened':
      // opened means it was also delivered first
      updateData.deliveredAt = ts
      updateData.openedAt = ts
      break
    case 'clicked':
      // clicked means it was delivered and opened first
      updateData.deliveredAt = ts
      updateData.openedAt = ts
      updateData.clickedAt = ts
      break
  }

  await db
    .update(messages)
    .set(updateData)
    .where(eq(messages.id, messageId))

  console.log(`📬 [${new Date().toISOString()}] Receipt processed — messageId: ${messageId}, status: ${status}`)
}