import { db } from './index'
import { customers, orders, segments, campaigns, messages } from './schema'
import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'
import 'dotenv/config'

// ─── HELPERS ──────────────────────────────────────────────────────────────────

// reads a csv file and returns an array of objects
// each row becomes one object, column headers become the keys
function readCsv(filename: string) {
  const filePath = path.join(process.cwd(), 'data', filename)
  const content = fs.readFileSync(filePath, 'utf-8')
  return parse(content, {
    columns: true,        // use first row as keys
    skip_empty_lines: true,
    trim: true,           // remove whitespace around values
  })
}

// ─── DEFAULT SEGMENTS ─────────────────────────────────────────────────────────
// Standard segments seeded on every fresh DB.
// isDefault: true means they show a "Default" badge and cannot be deleted.
const DEFAULT_SEGMENTS = [
  {
    name: 'All Customers',
    description: 'Your entire customer base with no filters applied. Use this segment for broad announcements, brand updates, or top-of-funnel campaigns targeting every shopper.',
    rules: [],
    isDefault: true,
  },
  {
    name: 'Active Customers',
    description: 'Customers who made a purchase within the last 30 days. This high-intent segment is ideal for upsell campaigns, loyalty rewards, and new arrival announcements.',
    rules: [{ field: 'lastPurchaseAt', operator: 'lt', value: 30 }],
    isDefault: true,
  },
  {
    name: 'Inactive Customers',
    description: 'Customers who have not purchased in over 30 days. Re-engage them with a personalised win-back offer or a curated collection based on their past preferences.',
    rules: [{ field: 'lastPurchaseAt', operator: 'gt', value: 30 }],
    isDefault: true,
  },
  {
    name: 'Dormant Customers',
    description: 'Customers who have not purchased in over 60 days and are at risk of churning. A strong incentive or exclusive offer works best to bring this segment back.',
    rules: [{ field: 'lastPurchaseAt', operator: 'gt', value: 60 }],
    isDefault: true,
  },
  {
    name: 'High Value',
    description: 'Customers with a total lifetime spend above ₹10,000 — your most valuable shoppers. Prioritise VIP experiences, early access to new collections, and premium loyalty perks for this segment.',
    rules: [{ field: 'totalSpend', operator: 'gt', value: 10000 }],
    isDefault: true,
  },
  {
    name: 'Festive Buyers',
    description: 'Customers who have purchased items tagged with festive discounts. This seasonally-driven segment responds well to occasion-based campaigns around festivals and sale events.',
    rules: [{ field: 'discountTag', operator: 'eq', value: 'festive' }],
    isDefault: true,
  },
  {
    name: 'Campaign Responders',
    description: 'Customers who have previously purchased during a campaign period, showing they are receptive to marketing. Retargeting this segment with new campaigns typically yields higher conversion rates.',
    rules: [{ field: 'purchasedDuringCampaign', operator: 'eq', value: true }],
    isDefault: true,
  },
]

// ─── MAIN SEED FUNCTION ───────────────────────────────────────────────────────

async function seed() {
  console.log('🌱 Starting seed...')

  // ── STEP 1: clear existing data ──────────────────────────────────────────
  // must delete in reverse dependency order to avoid FK violations:
  // messages → campaigns → orders → customers → segments
  console.log('🗑️  Clearing existing data...')
  await db.delete(messages)
  await db.delete(campaigns)
  await db.delete(orders)
  await db.delete(customers)
  await db.delete(segments)
  console.log('✅ Cleared')

  // ── STEP 2: read csv files ────────────────────────────────────────────────
  console.log('📂 Reading CSV files...')
  const customerRows = readCsv('customers.csv')
  const orderRows = readCsv('orders.csv')
  console.log(`📊 Found ${customerRows.length} customers and ${orderRows.length} orders`)

  // ── STEP 3: insert customers ──────────────────────────────────────────────
  console.log('👥 Inserting customers...')

  // insert in batches of 50 to avoid hitting neon's request size limits
  const BATCH_SIZE = 50
  for (let i = 0; i < customerRows.length; i += BATCH_SIZE) {
    const batch = customerRows.slice(i, i + BATCH_SIZE)

    await db.insert(customers).values(
      batch.map((row: any) => ({
        id: row.id,
        name: row.name,
        // csv gives empty string for nulls — convert to actual null
        email: row.email === '' ? null : row.email,
        phone: row.phone === '' ? null : row.phone,
        city: row.city,
        totalSpend: parseInt(row.total_spend, 10),
        orderCount: parseInt(row.order_count, 10),
        // convert iso string to js date object
        lastPurchaseAt: row.last_purchase_at ? new Date(row.last_purchase_at) : null,
        createdAt: new Date(row.created_at),
      }))
    )

    console.log(`  inserted customers ${i + 1}–${Math.min(i + BATCH_SIZE, customerRows.length)}`)
  }

  console.log('✅ Customers inserted')

  // ── STEP 4: insert orders ─────────────────────────────────────────────────
  console.log('🛍️  Inserting orders...')

  for (let i = 0; i < orderRows.length; i += BATCH_SIZE) {
    const batch = orderRows.slice(i, i + BATCH_SIZE)

    await db.insert(orders).values(
      batch.map((row: any) => ({
        id: row.id,
        customerId: row.customer_id,
        amount: parseInt(row.amount, 10),
        productCategory: row.product_category,
        discountTag: row.discount_tag,
        // csv stores true/false as strings — convert to boolean
        purchasedDuringCampaign: row.purchased_during_campaign === 'true',
        purchasedAt: new Date(row.purchased_at),
      }))
    )

    console.log(`  inserted orders ${i + 1}–${Math.min(i + BATCH_SIZE, orderRows.length)}`)
  }

  console.log('✅ Orders inserted')

  // ── STEP 5: insert default segments ──────────────────────────────────────
  console.log('🏷️  Inserting default segments...')

  await db.insert(segments).values(DEFAULT_SEGMENTS)

  console.log(`✅ ${DEFAULT_SEGMENTS.length} default segments inserted`)
  console.log('🎉 Seed complete')
  process.exit(0)
}

// ─── RUN ──────────────────────────────────────────────────────────────────────
seed().catch((err) => {
  console.error('❌ Seed failed:', err)
  process.exit(1)
})