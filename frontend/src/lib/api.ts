import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001',
})

// ─── ANALYTICS ───────────────────────────────────────────────────────────────
// shape: { campaigns: { total, sending, completed, draft }, messages: { totalSent, ... } }
export const getAnalytics = () =>
  api.get('/api/analytics').then(r => r.data)

// ─── CAMPAIGNS ───────────────────────────────────────────────────────────────
// shape: { campaigns: [...] }
export const getCampaigns = () =>
  api.get('/api/campaigns').then(r => r.data.campaigns)

export const getCampaign = (id: string) =>
  api.get(`/api/campaigns/${id}`).then(r => r.data.campaign ?? r.data)

export const getCampaignStats = (id: string) =>
  api.get(`/api/campaigns/${id}/stats`).then(r => r.data.stats ?? r.data)

export const createCampaign = (data: {
  name: string
  segmentId: string
  channel: string
  messageTemplate: string
}) => api.post('/api/campaigns', data).then(r => r.data)

export const sendCampaign = (id: string) =>
  api.post(`/api/campaigns/${id}/send`).then(r => r.data)

// ─── SEGMENTS ────────────────────────────────────────────────────────────────
// shape: { segments: [...] }
export const getSegments = () =>
  api.get('/api/segments').then(r => r.data.segments)

export const getSegment = (id: string) =>
  api.get(`/api/segments/${id}`).then(r => r.data.segment ?? r.data)

export const createSegment = (data: {
  name: string
  description?: string
  rules: unknown[]
}) => api.post('/api/segments', data).then(r => r.data)

export const deleteSegment = (id: string) =>
  api.delete(`/api/segments/${id}`).then(r => r.data)

export const previewSegment = (rules: unknown[]) =>
  api.post('/api/segments/preview', { rules }).then(r => r.data)

// ─── AI ──────────────────────────────────────────────────────────────────────
export const aiSegment = (prompt: string) =>
  api.post('/api/ai/segment', { prompt }).then(r => r.data)

export const aiMessage = (action: string, template?: string, context?: object) =>
  api.post('/api/ai/message', { action, template, context }).then(r => r.data)

export const aiAgent = (prompt: string) =>
  api.post('/api/ai/agent', { prompt }).then(r => r.data)

export const aiInsight = (campaignId: string) =>
  api.post('/api/ai/insight', { campaignId }).then(r => r.data)

export const aiSegmentName = (description: string, rules: unknown[]) =>
  api.post('/api/ai/segment-name', { description, rules }).then(r => r.data)

export const aiChannel = (campaignName: string, purpose: string, segmentDescription: string) =>
  api.post('/api/ai/channel', { campaignName, purpose, segmentDescription }).then(r => r.data)