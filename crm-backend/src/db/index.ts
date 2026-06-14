import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'
import 'dotenv/config'

// create the connection to neon using the connection string from .env
// this is the single database connection used by the entire crm-backend
const sql = neon(process.env.DATABASE_URL!)

// create the drizzle instance
// passing schema gives drizzle full knowledge of your tables and types
export const db = drizzle(sql, { schema })