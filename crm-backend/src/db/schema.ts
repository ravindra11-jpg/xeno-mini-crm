import { pgTable, uuid, text, integer, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core'

// ─── CUSTOMERS ───────────────────────────────────────────────────────────────
// One row per shopper. This is the core entity everything else references.
export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email'),                    // nullable — 8 customers have no email
  phone: text('phone'),                    // nullable — 15 customers have no phone
  city: text('city').notNull(),            // Chennai / Mumbai / Delhi / Bangalore
  totalSpend: integer('total_spend').notNull().default(0),     // sum of all orders in ₹
  orderCount: integer('order_count').notNull().default(0),     // count of all orders
  lastPurchaseAt: timestamp('last_purchase_at'),               // most recent order date
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// ─── ORDERS ──────────────────────────────────────────────────────────────────
// One row per purchase. A customer can have 1–8 orders.
export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  amount: integer('amount').notNull(),                         // ₹500–₹15,000
  productCategory: text('product_category').notNull(),         // Kurta / Western / Ethnic Fusion / Accessories
  discountTag: text('discount_tag').notNull().default('none'), // none / sale / festive / clearance
  purchasedDuringCampaign: boolean('purchased_during_campaign').notNull().default(false),
  purchasedAt: timestamp('purchased_at').notNull(),
})

// ─── SEGMENTS ────────────────────────────────────────────────────────────────
// A saved filter on the customers table.
// Rules are stored as JSONB — flexible structure for user-defined conditions.
// Example rule: [{ field: 'city', operator: 'eq', value: 'Mumbai' }]
export const segments = pgTable('segments', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  rules: jsonb('rules').notNull(),          // JSONB — variable structure, this is the one field that needs it
  isDefault: boolean('is_default').notNull().default(false),   // true = seeded system segment, cannot be deleted
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// ─── CAMPAIGNS ───────────────────────────────────────────────────────────────
// One campaign targets one segment with one message on one channel.
// ai_insight is populated after campaign completes — Gemini generates it.
export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  segmentId: uuid('segment_id').notNull().references(() => segments.id),
  channel: text('channel').notNull(),              // email / sms / push
  messageTemplate: text('message_template').notNull(), // has {{firstName}}, {{city}} placeholders
  status: text('status').notNull().default('draft'),   // draft / sending / completed
  aiInsight: text('ai_insight'),                   // nullable — filled after campaign completes
  createdAt: timestamp('created_at').notNull().defaultNow(),
  sentAt: timestamp('sent_at'),                    // nullable — filled when campaign is triggered
})

// ─── MESSAGES ────────────────────────────────────────────────────────────────
// One row per customer per campaign.
// If a campaign targets 84 customers, 84 message rows are created.
// Status updates as the channel service sends callbacks.
export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').notNull().references(() => campaigns.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  channel: text('channel').notNull(),
  content: text('content').notNull(),        // final interpolated message for this specific customer
  status: text('status').notNull().default('pending'), // pending / delivered / failed / opened / clicked
  sentAt: timestamp('sent_at'),
  deliveredAt: timestamp('delivered_at'),    // filled by receipt handler on callback
  openedAt: timestamp('opened_at'),          // filled by receipt handler on callback
  clickedAt: timestamp('clicked_at'),        // filled by receipt handler on callback
})

// ─── TYPE EXPORTS ─────────────────────────────────────────────────────────────
// These give you TypeScript types derived directly from the schema.
// Use these types throughout the backend instead of defining them manually.
export type Customer = typeof customers.$inferSelect
export type NewCustomer = typeof customers.$inferInsert
export type Order = typeof orders.$inferSelect
export type NewOrder = typeof orders.$inferInsert
export type Segment = typeof segments.$inferSelect
export type NewSegment = typeof segments.$inferInsert
export type Campaign = typeof campaigns.$inferSelect
export type NewCampaign = typeof campaigns.$inferInsert
export type Message = typeof messages.$inferSelect
export type NewMessage = typeof messages.$inferInsert