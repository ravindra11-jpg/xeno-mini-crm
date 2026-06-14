import { db } from '../db/index'
import { customers, orders } from '../db/schema'
import { and, eq, ne, gt, lt, gte, lte, sql } from 'drizzle-orm'
import type { Customer } from '../db/schema'

/*
  crm-backend/src/lib/segmentEngine.ts
  -------------------------------------
  Segment execution helper for CRM segment rules.
  - converts JSON segment rules into Drizzle SQL conditions
  - supports customer fields and order-derived predicates
  - provides both matching customer fetch and preview count helpers
*/

// ─── RULE TYPE ────────────────────────────────────────────────────────────────
// this is the shape of one rule inside a segment's JSONB rules array
// example: { field: 'city', operator: 'eq', value: 'Mumbai' }
export type SegmentRule = {
  field: string
  operator: 'eq' | 'gt' | 'lt' | 'gte' | 'lte'| 'neq'
  value: string | number | boolean
}

// ─── OPERATOR MAP ─────────────────────────────────────────────────────────────
// maps a string operator to the drizzle function that performs it
function applyOperator(column: any, operator: string, value: any) {
  switch (operator) {
    case 'eq':  return eq(column, value)
    case 'gt':  return gt(column, value)
    case 'lt':  return lt(column, value)
    case 'gte': return gte(column, value)
    case 'lte': return lte(column, value)
    case 'neq': return ne(column, value)

    default:    throw new Error(`Unsupported operator: ${operator}`)
  }
}

// ─── FIELD MAP ────────────────────────────────────────────────────────────────
// maps a rule field name to the actual drizzle column
// lastPurchaseAt is special — rules store it as "days since purchase"
// we convert that to an actual date for the SQL query
function buildCondition(rule: SegmentRule) {
  const { field, operator, value } = rule

  switch (field) {
    case 'city':
      return applyOperator(customers.city, operator, value)

    case 'totalSpend':
      return applyOperator(customers.totalSpend, operator, Number(value))

    case 'orderCount':
      return applyOperator(customers.orderCount, operator, Number(value))
    case 'productCategory':
      return sql`${customers.id} IN (
        SELECT customer_id FROM orders WHERE product_category = ${String(value)}
      )`

    // productCategory and discountTag are derived from customer order records.
    // A subquery pattern keeps rule composition simple while still allowing
    // all rules to be combined using AND logic for preview and matching.
    case 'discountTag':
      return sql`EXISTS (
        SELECT 1 FROM orders
        WHERE orders.customer_id = ${customers.id}
        AND orders.discount_tag ${sql.raw(operator === 'neq' ? '!=' : '=')} ${String(value)}
      )`


    case 'purchasedDuringCampaign':
      return sql`${customers.id} IN (
        SELECT customer_id FROM orders WHERE purchased_during_campaign = ${value === 'true' || value === true}
      )`


    case 'lastPurchaseAt': {
      // value is number of days — convert to a date that many days ago
      // e.g. value=60 means "last purchased more than 60 days ago"
      const daysAgo = new Date()
      daysAgo.setDate(daysAgo.getDate() - Number(value))
      return applyOperator(customers.lastPurchaseAt, operator, daysAgo)
      
    
    }

    default:
      throw new Error(`Unsupported field: ${field}`)
  }
}

// ─── MAIN FUNCTION — GET MATCHING CUSTOMERS ───────────────────────────────────
// takes an array of rules, returns all customers that match ALL rules (AND logic)
export async function getMatchingCustomers(rules: SegmentRule[]): Promise<Customer[]> {
  if (!rules || rules.length === 0) {
    // no rules — return all customers
    return await db.select().from(customers)
  }

  // build one condition per rule
  const conditions = rules.map(buildCondition)

  // AND all conditions together — customer must match every rule
  return await db
    .select()
    .from(customers)
    .where(and(...conditions))
}

// ─── PREVIEW FUNCTION — COUNT ONLY ───────────────────────────────────────────
// same logic but returns just the count — used for the preview endpoint
// cheaper than fetching all customer rows just to count them
export async function countMatchingCustomers(rules: SegmentRule[]): Promise<number> {
  if (!rules || rules.length === 0) {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(customers)
    return Number(result[0].count)
  }

  const conditions = rules.map(buildCondition)

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(customers)
    .where(and(...conditions))

  return Number(result[0].count)
}