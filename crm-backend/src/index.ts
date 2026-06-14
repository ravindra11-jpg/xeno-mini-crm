import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import 'dotenv/config'
import segmentRoutes from './routes/segments'
import receiptRoutes from './routes/receipt'
import campaignRoutes from './routes/campaigns'
import analyticsRoutes from './routes/analytics'
import aiRoutes from './routes/ai'

/*
  crm-backend/src/index.ts
  ------------------------
  Entrypoint for the CRM backend service.
  - configures the Hono app with CORS and route mounts
  - exposes health, segment, campaign, analytics, receipt, and AI endpoints
  - starts the HTTP server on the configured port
  Dependencies: routes/*, dotenv, hono, hono/cors
*/


const app = new Hono()

app.use('*', cors())

app.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'crm-backend' })
})

// ─── ROUTES ───────────────────────────────────────────────────────────────────
app.route('/api/segments', segmentRoutes)
app.route('/api/receipt', receiptRoutes)
app.route('/api/campaigns', campaignRoutes)
app.route('/api/analytics', analyticsRoutes)
app.route('/api/ai', aiRoutes)


const port = Number(process.env.PORT) || 3001
console.log(`CRM backend running on port ${port}`)

serve({ fetch: app.fetch, port })