import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getCampaigns, getCampaignStats, createCampaign, sendCampaign,
  getSegments, createSegment, previewSegment,
  aiSegment, aiSegmentName, aiChannel, aiMessage, aiAgent,
} from '@/lib/api'
import {
  Loader2, Plus, Sparkles, Send, ChevronRight, ChevronLeft,
  X, Bot, CheckCircle2, Mail, MessageSquare, Phone,
  BarChart2, Activity, Radio, Users, Calendar,
  TrendingUp, MousePointerClick, PackageCheck, XCircle, AlertTriangle,
} from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  blue:      '#1B6EF3',
  blueBg:    'rgba(27,110,243,0.06)',
  blueTrack: '#EEF4FF',
  violet:    '#7C3AED',
  violetBg:  'rgba(124,58,237,0.07)',
  green:     '#059669',
  greenBg:   'rgba(5,150,105,0.07)',
  amber:     '#B45309',
  amberBg:   '#FEF3C7',
  amberDot:  '#EF9F27',
  red:       '#DC2626',
  redBg:     'rgba(220,38,38,0.07)',
  sky:       '#0369A1',
  skyBg:     '#F0F9FF',
  slate900:  '#0F172A',
  slate800:  '#1E293B',
  slate700:  '#334155',
  slate600:  '#475569',
  slate500:  '#64748B',
  slate400:  '#94A3B8',
  slate300:  '#CBD5E1',
  slate200:  '#E2E8F0',
  slate100:  '#F1F5F9',
  slate50:   '#F8FAFC',
  border:    '#E8ECF2',
  surface:   '#fff',
  pageBg:    '#F4F7FB',
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Rule = { field: string; operator: string; value: string | number | boolean }
type Segment = {
  id: string; name: string; description?: string
  rules: Rule[]; customerCount: number; createdAt: string; isDefault?: boolean
}
type AgentPlan = {
  segmentName: string; segmentDescription: string; rules: Rule[]
  matchedExistingSegment: string | null; channel: string
  messageTemplate: string; reasoning: string
}
type WizardData = {
  name: string; purpose: string; segmentId: string
  segmentDescription: string; channel: string; messageTemplate: string
}
type CampaignStats = {
  sent: number; delivered: number; opened: number
  clicked: number; failed: number; pending: number
}

const CHANNELS = [
  { value: 'email',    label: 'Email' },
  { value: 'sms',      label: 'SMS' },
  { value: 'whatsapp', label: 'WhatsApp' },
]

const FIELDS = [
  { value: 'city',                    label: 'City' },
  { value: 'totalSpend',              label: 'Total Spend (₹)' },
  { value: 'orderCount',              label: 'Order Count' },
  { value: 'lastPurchaseAt',          label: 'Days Since Last Purchase' },
  { value: 'productCategory',         label: 'Product Category' },
  { value: 'discountTag',             label: 'Discount Tag' },
  { value: 'purchasedDuringCampaign', label: 'Purchased During Campaign' },
]

function ruleToLabel(rule: Rule): string {
  const fieldLabel = FIELDS.find(f => f.value === rule.field)?.label ?? rule.field
  const opLabel: Record<string, string> = {
    eq: 'is', neq: 'is not', gt: 'more than', lt: 'less than', gte: 'at least', lte: 'at most',
  }
  return `${fieldLabel} ${opLabel[rule.operator] ?? rule.operator} ${rule.value}`
}

// ─── Channel config ───────────────────────────────────────────────────────────
const CHANNEL_MAP: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  email:    { label: 'Email',    icon: <Mail size={10} />,          color: C.blue,  bg: C.blueTrack },
  sms:      { label: 'SMS',      icon: <MessageSquare size={10} />, color: C.sky,   bg: C.skyBg },
  whatsapp: { label: 'WhatsApp', icon: <Phone size={10} />,         color: C.green, bg: C.greenBg },
}

function ChannelBadge({ channel }: { channel: string }) {
  const ch = CHANNEL_MAP[channel] ?? { label: channel?.toUpperCase() ?? '—', icon: null, color: C.slate600, bg: C.slate100 }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10,
      padding: '2px 8px', borderRadius: 99, fontWeight: 600,
      background: ch.bg, color: ch.color, letterSpacing: '0.03em',
    }}>
      {ch.icon}{ch.label}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; dot?: string; label: string }> = {
    draft:     { bg: C.slate100,  color: C.slate500, label: 'Draft' },
    sending:   { bg: C.amberBg,   color: C.amber,    dot: C.amberDot, label: 'Live' },
    completed: { bg: C.green,   color: C.surface,    label: 'Completed' },
  }
  const s = map[status] ?? map.draft
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10,
      padding: '2px 8px', borderRadius: 99, fontWeight: 600,
      background: s.bg, color: s.color,
    }}>
      {s.dot && <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.dot, animation: 'xeno-pulse 1.8s ease-in-out infinite' }} />}
      {s.label}
    </span>
  )
}

function RulePillList({ rules, tinted }: { rules: Rule[]; tinted?: boolean }) {
  if (rules.length === 0)
    return (
      <div style={{
        padding: '7px 11px', borderRadius: 7, fontSize: 12,
        background: tinted ? 'rgba(255,255,255,0.1)' : C.slate50,
        border: `1px solid ${tinted ? 'rgba(255,255,255,0.15)' : C.border}`,
        color: tinted ? 'rgba(255,255,255,0.6)' : C.slate500,
      }}>
        No filters — includes all customers
      </div>
    )
  const PILL_COLORS = [
    { bg: C.blueTrack,  color: C.blue },
    { bg: C.violetBg,   color: C.violet },
    { bg: C.greenBg,    color: C.green },
    { bg: C.amberBg,    color: C.amber },
  ]
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {rules.map((rule, i) => {
        const p = PILL_COLORS[i % PILL_COLORS.length]
        return (
          <span key={i} style={{
            fontSize: 11, padding: '3px 9px', borderRadius: 99, fontWeight: 500,
            background: tinted ? 'rgba(255,255,255,0.15)' : p.bg,
            color: tinted ? '#fff' : p.color,
          }}>
            {ruleToLabel(rule)}
          </span>
        )
      })}
    </div>
  )
}

// ─── Zero count warning ───────────────────────────────────────────────────────
function ZeroCountWarning({ tinted, message }: { tinted?: boolean; message: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '10px 14px', borderRadius: 10, fontSize: 12, lineHeight: 1.6,
      background: tinted ? 'rgba(220,38,38,0.18)' : 'rgba(220,38,38,0.06)',
      border: `1px solid ${tinted ? 'rgba(220,38,38,0.35)' : 'rgba(220,38,38,0.15)'}`,
      color: tinted ? '#FCA5A5' : C.red,
    }}>
      <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{message}</span>
    </div>
  )
}

// ─── Stat chip used inside cards ──────────────────────────────────────────────
function StatChip({ icon, value, label, color }: { icon: React.ReactNode; value: number; label: string; color: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
      padding: '8px 12px', borderRadius: 10, background: C.pageBg,
      border: `1px solid ${C.border}`, minWidth: 60,
    }}>
      <div style={{ color, display: 'flex', alignItems: 'center', gap: 4 }}>
        {icon}
        <span style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</span>
      </div>
      <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.slate400, fontWeight: 600 }}>{label}</span>
    </div>
  )
}

// ─── Campaign card ────────────────────────────────────────────────────────────
function CampaignCard({ campaign, onClick }: { campaign: any; onClick: () => void }) {
  const isLive = campaign.status === 'sending'
  const { data: stats } = useQuery({
    queryKey: ['campaign-stats', campaign.id],
    queryFn: () => getCampaignStats(campaign.id),
    refetchInterval: isLive ? 10_000 : false,
    enabled: campaign.status !== 'draft',
  })
  const s: CampaignStats = stats ?? { sent: 0, delivered: 0, opened: 0, clicked: 0, failed: 0, pending: 0 }
  const delivPct = s.sent > 0 ? Math.round((s.delivered / s.sent) * 100) : 0

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', background: C.surface,
        border: `1px solid ${C.border}`, borderRadius: 14,
        padding: '16px 18px', cursor: 'pointer',
        transition: 'box-shadow 0.15s, border-color 0.15s',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = '0 4px 20px rgba(27,110,243,0.09)'
        e.currentTarget.style.borderColor = 'rgba(27,110,243,0.25)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.borderColor = C.border
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: C.slate900, lineHeight: 1.3,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            marginBottom: 4,
          }}>
            {campaign.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: C.slate400, fontSize: 11 }}>
            <Users size={10} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {campaign.segmentName || 'No segment'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <ChannelBadge channel={campaign.channel} />
        </div>
      </div>

      {/* Stats row — only if sent */}
      {campaign.status !== 'draft' && (
        <div style={{ display: 'flex', gap: 6 }}>
          <StatChip icon={<Send size={10} />}              value={s.sent}      label="Sent"      color={C.slate700} />
          <StatChip icon={<PackageCheck size={10} />}      value={s.delivered} label="Delivered" color={C.green} />
          <StatChip icon={<TrendingUp size={10} />}        value={s.opened}    label="Opened"    color={C.violet} />
          <StatChip icon={<MousePointerClick size={10} />} value={s.clicked}   label="Clicked"   color={C.blue} />
          {s.failed > 0 && <StatChip icon={<XCircle size={10} />} value={s.failed} label="Failed" color={C.red} />}
        </div>
      )}

      {/* Progress bar — delivery rate */}
      {campaign.status !== 'draft' && s.sent > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 10, color: C.slate400 }}>Delivery rate</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.green }}>{delivPct}%</span>
          </div>
          <div style={{ height: 4, background: C.slate100, borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${delivPct}%`, background: C.green, borderRadius: 99, transition: 'width 0.5s' }} />
          </div>
        </div>
      )}

      {/* Draft state */}
      {campaign.status === 'draft' && (
        <div style={{ fontSize: 11, color: C.slate400, fontStyle: 'italic' }}>
          Draft — not sent yet
        </div>
      )}

      {/* Footer — date */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: C.slate400, fontSize: 10, marginTop: -4 }}>
        <Calendar size={10} />
        {new Date(campaign.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        {isLive && s.pending > 0 && (
          <span style={{ marginLeft: 'auto', color: C.amber, fontWeight: 600 }}>
            {s.pending} pending
          </span>
        )}
      </div>
    </button>
  )
}

// ─── Donut tooltip ────────────────────────────────────────────────────────────
function DonutTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: C.slate800, color: '#fff', padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>
      {payload[0].name}: {payload[0].value}
    </div>
  )
}

// ─── Campaign detail dialog ───────────────────────────────────────────────────
export function CampaignDetailDialog({ campaign, onClose }: { campaign: any; onClose: () => void }) {
  const isLive      = campaign.status === 'sending'
  const isCompleted = campaign.status === 'completed'
  const [insight, setInsight] = useState<string | null>(campaign.aiInsight || null)

  useEffect(() => {
    setInsight(campaign.aiInsight || null)
  }, [campaign.id, campaign.aiInsight])

  const { data: stats } = useQuery({
    queryKey: ['campaign-stats', campaign.id],
    queryFn: () => getCampaignStats(campaign.id),
    refetchInterval: isLive ? 10_000 : false,
  })
  const s: CampaignStats = stats ?? { sent: 0, delivered: 0, opened: 0, clicked: 0, failed: 0, pending: 0 }
  const pct = (n: number) => s.sent > 0 ? Math.round((n / s.sent) * 100) : 0

  const donutData = [
    { name: 'Clicked',   value: s.clicked,              color: C.blue },
    { name: 'Opened',    value: s.opened - s.clicked,   color: C.violet },
    { name: 'Delivered', value: s.delivered - s.opened, color: C.green },
    { name: 'Failed',    value: s.failed,               color: C.red },
    { name: 'Pending',   value: s.pending,              color: C.slate300 },
  ].filter(d => d.value > 0)

  const SLabel = ({ children }: { children: React.ReactNode }) => (
    <div style={{ fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: C.slate400, fontWeight: 700, marginBottom: 10 }}>
      {children}
    </div>
  )

  const statCellBg: Record<string, string> = {
    sent:      C.slate50,
    delivered: 'rgba(5,150,105,0.04)',
    opened:    'rgba(124,58,237,0.04)',
    clicked:   'rgba(27,110,243,0.04)',
    failed:    'rgba(220,38,38,0.04)',
  }
  const statColors: Record<string, { bg: string; color: string }> = {
    sent:      { bg: C.slate800, color: '#fff' },
    delivered: { bg: C.green,    color: '#fff' },
    opened:    { bg: C.violet,   color: '#fff' },
    clicked:   { bg: C.blue,     color: '#fff' },
    failed:    { bg: C.red,      color: '#fff' },
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        width: '100%', maxWidth: 860, maxHeight: '90vh',
        background: C.surface, borderRadius: 18,
        border: `1px solid ${C.border}`,
        boxShadow: '0 24px 64px rgba(0,0,0,0.14)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* Dialog header */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          padding: '18px 22px 14px', borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.slate900, marginBottom: 4 }}>{campaign.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.slate400 }}>
              <Users size={11} />
              <span>{campaign.segmentName || 'No segment'}</span>
              <span>·</span>
              <Calendar size={11} />
              <span>{new Date(campaign.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <ChannelBadge channel={campaign.channel} />
              <StatusBadge status={campaign.status} />
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.slate400, cursor: 'pointer', padding: 4, borderRadius: 6 }}>
            <X size={18} />
          </button>
        </div>

        {/* Stat strip */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
          borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        }}>
          {([
            { key: 'sent',      label: 'Sent',      value: s.sent },
            { key: 'delivered', label: 'Delivered',  value: s.delivered },
            { key: 'opened',    label: 'Opened',     value: s.opened },
            { key: 'clicked',   label: 'Clicked',    value: s.clicked },
            { key: 'failed',    label: 'Failed',     value: s.failed },
          ] as { key: string; label: string; value: number }[]).map(({ key, label, value }, i) => (
            <div key={key} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0',
              borderRight: i < 4 ? `1px solid ${C.border}` : 'none',
              background: statCellBg[key],
            }}>
              <div style={{
                fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                background: statColors[key].bg, color: statColors[key].color,
                padding: '2px 12px', borderRadius: 8, lineHeight: 1.4,
              }}>
                {value}
              </div>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.slate400, marginTop: 5 }}>
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

          {/* Left — funnel + message + insight */}
          <div style={{ width: '50%', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: `1px solid ${C.border}` }}>

            {s.sent > 0 && (
              <div style={{ padding: '18px 22px', borderBottom: `1px solid ${C.border}`, background: '#FAFBFF', flexShrink: 0 }}>
                <SLabel>Conversion funnel</SLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {([
                    { label: 'Delivered', value: pct(s.delivered), color: C.green },
                    { label: 'Opened',    value: pct(s.opened),    color: C.violet },
                    { label: 'Clicked',   value: pct(s.clicked),   color: C.blue },
                    { label: 'Failed',    value: pct(s.failed),    color: C.red },
                  ]).map(row => (
                    <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 11, color: C.slate600, width: 62, flexShrink: 0 }}>{row.label}</span>
                      <div style={{ flex: 1, height: 7, background: C.blueTrack, borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${row.value}%`, background: row.color, borderRadius: 99, transition: 'width 0.6s' }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.slate900, width: 34, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {row.value}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <SLabel>Message template</SLabel>
                <div style={{
                  background: '#F8FBFF', border: `1px solid rgba(27,110,243,0.12)`,
                  borderRadius: 10, padding: '13px 16px', fontSize: 13, lineHeight: 1.75,
                  color: C.slate700, fontFamily: 'system-ui, -apple-system, sans-serif',
                }}>
                  {campaign.messageTemplate || '—'}
                </div>
              </div>

              {isCompleted && (
                <div>
                  <SLabel>AI insight</SLabel>
                  <div style={{
                    background: '#EFF6FF', border: '1px solid rgba(27,110,243,0.15)',
                    borderRadius: 10, padding: '13px 16px',
                    fontSize: 13, lineHeight: 1.65, color: '#1D4ED8',
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                  }}>
                    <Sparkles size={13} style={{ color: C.blue, marginTop: 2, flexShrink: 0 }} />
                    <div style={{ whiteSpace: 'pre-line', margin: 0 }}>
                      {insight || 'No AI insight available yet.'}
                    </div>
                  </div>
                </div>
              )}

              {campaign.status === 'draft' && (
                <div style={{
                  background: C.slate50, border: `1px dashed ${C.border}`, borderRadius: 10,
                  padding: '18px', textAlign: 'center', fontSize: 12, color: C.slate400, fontStyle: 'italic',
                }}>
                  This campaign is a draft and hasn't been sent yet.
                </div>
              )}
            </div>
          </div>

          {/* Right — donut */}
          <div style={{
            width: '50%', flexShrink: 0, padding: '24px 28px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 16, background: C.surface, overflowY: 'auto',
          }}>
            <SLabel>Outcome distribution</SLabel>
            {s.sent > 0 && donutData.length > 0 ? (
              <>
                <div style={{ width: 240, height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutData} cx="50%" cy="50%"
                        innerRadius={64} outerRadius={108}
                        paddingAngle={2} dataKey="value"
                        startAngle={90} endAngle={-270}
                      >
                        {donutData.map((entry, i) => <Cell key={i} fill={entry.color} stroke="none" />)}
                      </Pie>
                      <Tooltip content={<DonutTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 200 }}>
                  {donutData.map(d => (
                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: d.color, display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: C.slate600, flex: 1 }}>{d.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.slate900, fontVariantNumeric: 'tabular-nums' }}>{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: C.slate400, fontStyle: 'italic', textAlign: 'center' }}>
                {campaign.status === 'draft' ? 'Not sent yet' : 'No data yet'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Summary strip ────────────────────────────────────────────────────────────
function SummaryStrip({ campaigns }: { campaigns: any[] }) {
  const live      = campaigns.filter(c => c.status === 'sending').length
  const completed = campaigns.filter(c => c.status === 'completed').length

  const cells = [
    { label: 'Total',     value: campaigns.length, icon: <BarChart2 size={16} />,   accent: C.blue,  bg: C.blueBg,  caption: 'All campaigns in your workspace' },
    { label: 'Live',      value: live,             icon: <Radio size={16} />,        accent: C.amber, bg: C.amberBg, caption: 'Currently running campaigns' },
    { label: 'Completed', value: completed,        icon: <CheckCircle2 size={16} />, accent: C.green, bg: C.greenBg, caption: 'Campaigns finished successfully' },
  ]

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16,
      padding: '18px 24px', background: C.surface,
    }}>
      {cells.map((cell) => (
        <div key={cell.label} style={{
          minHeight: 108, borderRadius: 20,
          background: cell.bg, border: `1px solid ${cell.bg === C.blueBg ? 'rgba(27,110,243,0.16)' : cell.bg === C.amberBg ? 'rgba(180,83,9,0.16)' : 'rgba(5,150,105,0.16)' }`,
          boxShadow: '0 10px 24px rgba(15,23,42,0.05)', overflow: 'hidden',
          padding: '18px 18px 16px 18px', display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 14, flexShrink: 0,
              background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: cell.accent,
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.5)',
            }}>
              {cell.icon}
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.slate900, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {cell.value}
              </div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.slate500, marginTop: 4 }}>
                {cell.label}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: C.slate600, lineHeight: 1.6 }}>
            {cell.caption}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Channel sort bar ─────────────────────────────────────────────────────────
function ChannelSortBar({ active, onChange }: { active: string; onChange: (v: string) => void }) {
  const opts = [
    { value: 'all',      label: 'All' },
    { value: 'email',    icon: <Mail size={10} /> },
    { value: 'sms',      icon: <MessageSquare size={10} /> },
    { value: 'whatsapp', icon: <Phone size={10} /> },
  ]
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {opts.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          padding: o.label ? '3px 8px' : '4px 7px',
          borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600,
          background: active === o.value ? C.blue : C.slate100,
          color: active === o.value ? '#fff' : C.slate500,
          transition: 'all 0.12s',
        }}>
          {o.label ?? o.icon}
        </button>
      ))}
    </div>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ label, count, sort, onSort }: { label: string; count: number; sort: string; onSort: (v: string) => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 16px 6px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.slate400, fontWeight: 700 }}>
          {label}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
          background: C.slate100, color: C.slate500,
        }}>{count}</span>
      </div>
      <ChannelSortBar active={sort} onChange={onSort} />
    </div>
  )
}

// ─── Customer count pill ──────────────────────────────────────────────────────
function CustomerCountPill({ count, loading, tinted }: { count: number | null | undefined; loading?: boolean; tinted?: boolean }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: tinted ? 'rgba(255,255,255,0.6)' : C.slate400 }}>
        <Loader2 size={11} style={{ animation: 'xeno-spin 1s linear infinite' }} /> Counting customers…
      </div>
    )
  }
  if (count === null || count === undefined) return null
  if (count === 0) return null // handled by ZeroCountWarning
  return (
    <div style={{ fontSize: 11, color: tinted ? 'rgba(255,255,255,0.7)' : C.slate500 }}>
      Will send to{' '}
      <span style={{ fontWeight: 700, color: tinted ? '#fff' : C.blue }}>~{count} customers</span>
    </div>
  )
}

// ─── Wizard sub-components ────────────────────────────────────────────────────
function SegmentPickerStep({ segList, segmentId, campaignName, purpose, onSelect, onCountChange }: {
  segList: Segment[]
  segmentId: string
  campaignName: string
  purpose: string
  onSelect: (seg: Segment) => void
  onCountChange: (count: number | null) => void
}) {
  const [showBuilder, setShowBuilder] = useState(false)
  const [aiPrompt, setAiPrompt]       = useState('')
  const [aiLoading, setAiLoading]     = useState(false)
  const [generatedRules, setGeneratedRules] = useState<Rule[] | null>(null)
  const [previewCount, setPreviewCount]     = useState<number | null>(null)
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [recommendedId, setRecommendedId] = useState<string | null>(null)
  const [recommendationLoading, setRecommendationLoading] = useState(false)
  const [recommendationError, setRecommendationError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const selectedSeg = segList.find(s => s.id === segmentId)
  const selectedCount = selectedSeg?.customerCount ?? null

  // Notify parent of current count whenever selection changes
  useEffect(() => {
    onCountChange(selectedCount)
  }, [segmentId, selectedCount])

  const handleGenerate = async () => {
    if (!aiPrompt.trim()) return
    setAiLoading(true); setError(null)
    try {
      const res = await aiSegment(aiPrompt)
      if (res.rules?.length) {
        setGeneratedRules(res.rules)
        const preview = await previewSegment(res.rules)
        setPreviewCount(preview.count ?? preview.total ?? 0)
      } else { setError(res.error || 'Could not generate rules.') }
    } catch (err: any) { setError(err?.response?.data?.error ?? 'Failed') }
    finally { setAiLoading(false) }
  }

  const handleSaveAndSelect = async () => {
    if (!generatedRules) return
    setSaving(true); setError(null)
    try {
      const nameRes = await aiSegmentName(aiPrompt, generatedRules)
      const created = await createSegment({ name: nameRes.name || 'New Segment', rules: generatedRules })
      queryClient.invalidateQueries({ queryKey: ['segments'] })
      onSelect({ ...created.segment, customerCount: previewCount ?? 0 })
      setShowBuilder(false); setAiPrompt(''); setGeneratedRules(null); setPreviewCount(null)
    } catch (err: any) { setError(err?.response?.data?.error ?? 'Failed to save') }
    finally { setSaving(false) }
  }

  useEffect(() => {
    if (!campaignName.trim() && !purpose.trim()) return
    if (segList.length === 0) return

    setRecommendationLoading(true)
    setRecommendationError(null)
    const prompt = `${campaignName.trim()}${campaignName.trim() && purpose.trim() ? '. ' : ''}${purpose.trim()}`

    aiAgent(prompt)
      .then(res => {
        const matchedName = res.plan?.matchedExistingSegment
        if (matchedName) {
          const matchedSeg = segList.find(s => s.name.toLowerCase() === matchedName.toLowerCase())
          if (matchedSeg) setRecommendedId(matchedSeg.id)
        }
      })
      .catch(() => {
        setRecommendationError('Could not recommend a segment.')
      })
      .finally(() => setRecommendationLoading(false))
  }, [campaignName, purpose, segList])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.slate400, fontWeight: 600 }}>Select Segment</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontSize: 12, color: C.slate500 }}>Pick a segment or use the recommended match.</div>
        {recommendationLoading ? (
          <div style={{ fontSize: 11, color: C.slate400 }}>Finding best match…</div>
        ) : recommendedId ? (
          <button onClick={() => {
            const seg = segList.find(s => s.id === recommendedId)
            if (seg) onSelect(seg)
          }} style={{ fontSize: 11, fontWeight: 600, color: C.blue, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            Use recommended segment
          </button>
        ) : recommendationError ? (
          <span style={{ fontSize: 11, color: C.red }}>{recommendationError}</span>
        ) : null}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
        {segList.length === 0
          ? <div style={{ fontSize: 12, color: C.slate400 }}>No segments yet.</div>
          : segList.map(seg => {
            const isRecommended = recommendedId === seg.id
            const isSelected    = segmentId === seg.id
            const hasNoCustomers = (seg.customerCount ?? 0) === 0
            return (
              <button key={seg.id} onClick={() => onSelect(seg)} style={{
                width: '100%', textAlign: 'left', padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                border: `1px solid ${isSelected ? C.blue : isRecommended ? C.green : C.border}`,
                background: isSelected ? C.blueTrack : isRecommended ? 'rgba(5,150,105,0.08)' : C.surface,
                transition: 'all 0.12s',
                opacity: hasNoCustomers ? 0.6 : 1,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.slate900 }}>{seg.name}</div>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                    {hasNoCustomers && (
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: 'rgba(220,38,38,0.1)', color: C.red, fontWeight: 600 }}>
                        0 customers
                      </span>
                    )}
                    {isRecommended && (
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(5,150,105,0.16)', color: C.green, fontWeight: 700 }}>
                        Best match
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: C.slate400, marginTop: 2 }}>
                  {seg.customerCount ?? '?'} customers · {seg.rules.length === 0 ? 'No filters' : `${seg.rules.length} rule${seg.rules.length !== 1 ? 's' : ''}`}
                </div>
              </button>
            )
          })
        }
      </div>

      {/* Zero-count warning and customer count for selected segment */}
      {segmentId && selectedCount === 0 && (
        <ZeroCountWarning message="This segment has 0 customers. Select a different segment, or describe a new audience using the AI builder below." />
      )}
      {segmentId && selectedCount !== null && selectedCount > 0 && (
        <CustomerCountPill count={selectedCount} />
      )}

      {!showBuilder ? (
        <button onClick={() => setShowBuilder(true)} style={{
          display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600,
          color: C.blue, background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        }}>
          <Sparkles size={11} /> Describe a new audience instead
        </button>
      ) : (
        <div style={{ background: C.blueTrack, border: `1px solid rgba(27,110,243,0.15)`, borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.blue, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Sparkles size={11} /> Describe in plain English
          </div>
          <div style={{ fontSize: 11, color: C.slate500, lineHeight: 1.5 }}>
            Be specific — mention city, spend range, days since purchase, or product category for better results.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={{ flex: 1, padding: '7px 12px', borderRadius: 8, fontSize: 12, outline: 'none', border: `1px solid ${C.border}`, color: C.slate900, background: C.surface }}
              placeholder="e.g. customers in Mumbai who haven't bought in 60 days"
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleGenerate()}
            />
            <button onClick={handleGenerate} disabled={aiLoading || !aiPrompt.trim()} style={{
              padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: C.blue, color: '#fff', border: 'none', cursor: 'pointer',
              opacity: aiLoading || !aiPrompt.trim() ? 0.5 : 1,
            }}>
              {aiLoading ? <Loader2 size={12} style={{ animation: 'xeno-spin 1s linear infinite' }} /> : 'Generate'}
            </button>
          </div>
          {error && <div style={{ fontSize: 11, padding: '6px 10px', borderRadius: 7, background: 'rgba(220,38,38,0.06)', color: C.red }}>{error}</div>}
          {generatedRules && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <RulePillList rules={generatedRules} />
              {previewCount !== null && previewCount === 0 && (
                <ZeroCountWarning message="0 customers match these rules. Try a broader description — e.g. remove a filter or widen the city/spend range." />
              )}
              {previewCount !== null && previewCount > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, color: C.blue }}>
                  {previewCount} customers match
                </span>
              )}
              <button onClick={handleSaveAndSelect} disabled={saving || previewCount === 0} style={{
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600,
                padding: '7px 14px', borderRadius: 8, background: C.blue, color: '#fff', border: 'none', cursor: 'pointer',
                opacity: saving || previewCount === 0 ? 0.5 : 1, alignSelf: 'flex-start',
              }}>
                {saving ? <><Loader2 size={11} style={{ animation: 'xeno-spin 1s linear infinite' }} />Saving…</> : 'Save & Use This Segment'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ChannelPickerStep({ channel, segmentDescription, onSelect }: {
  channel: string; campaignName?: string; purpose?: string; segmentDescription: string; onSelect: (c: string) => void
}) {
  const [recommended, setRecommended] = useState<string | null>(null)
  const [reasoning, setReasoning]     = useState<string | null>(null)
  const [loading, setLoading]         = useState(false)
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    setLoading(true)
    aiChannel('', '', segmentDescription)
      .then(res => { if (res.channel) { setRecommended(res.channel); setReasoning(res.reasoning); onSelect(res.channel) } })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.slate400, fontWeight: 600 }}>Channel</div>
      <div style={{ display: 'flex', gap: 8 }}>
        {CHANNELS.map(ch => {
          const isSelected    = channel === ch.value
          const isRecommended = recommended === ch.value
          return (
            <button key={ch.value} onClick={() => onSelect(ch.value)} style={{
              flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', position: 'relative', transition: 'all 0.12s',
              background: isSelected ? C.blue : C.slate50,
              color: isSelected ? '#fff' : C.slate600,
              border: `1px solid ${isSelected ? C.blue : C.border}`,
            }}>
              {ch.label}
              {isRecommended && (
                <span style={{
                  position: 'absolute', top: 6, right: 6, width: 7, height: 7,
                  borderRadius: '50%', background: C.green,
                  boxShadow: `0 0 0 2px ${isSelected ? C.blue : C.slate50}`,
                }} />
              )}
            </button>
          )
        })}
      </div>
      <div style={{ minHeight: 20 }}>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.slate400 }}>
            <Loader2 size={11} style={{ animation: 'xeno-spin 1s linear infinite' }} /> Analysing best channel…
          </div>
        )}
        {!loading && reasoning && (
          <div style={{ display: 'flex', gap: 6, fontSize: 11, color: C.slate600, lineHeight: 1.5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, flexShrink: 0, marginTop: 3, display: 'inline-block' }} />
            <span><strong style={{ color: C.slate900 }}>{CHANNELS.find(c => c.value === recommended)?.label} recommended:</strong> {reasoning}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function MessageStep({ campaignName, purpose, segmentDescription, messageTemplate, onChange }: {
  campaignName: string; purpose: string; segmentDescription: string
  messageTemplate: string; onChange: (t: string) => void
}) {
  const [aiLoading, setAiLoading] = useState<string | null>(null)
  const handleSuggest     = async () => { setAiLoading('suggest');     try { const r = await aiMessage('suggest',     undefined,       { campaignName, purpose, segmentDescription }); onChange(r.template) } finally { setAiLoading(null) } }
  const handleImprove     = async () => { setAiLoading('improve');     try { const r = await aiMessage('improve',     messageTemplate); onChange(r.template) } finally { setAiLoading(null) } }
  const handlePersonalise = async () => { setAiLoading('personalise'); try { const r = await aiMessage('personalise', messageTemplate); onChange(r.template) } finally { setAiLoading(null) } }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.slate400, fontWeight: 600, marginBottom: 2 }}>Message</div>
      <div style={{ fontSize: 11, color: C.slate400 }}>Use {`{{firstName}}`} and {`{{city}}`} for personalisation.</div>
      <textarea
        style={{
          width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 13,
          border: `1px solid ${C.border}`, color: C.slate900, resize: 'none',
          minHeight: 100, outline: 'none', lineHeight: 1.6, boxSizing: 'border-box',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
        placeholder="Write your message, or use Suggest to get started…"
        value={messageTemplate}
        onChange={e => onChange(e.target.value)}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        {[
          { key: 'suggest',     label: 'Suggest',      fn: handleSuggest,     disabled: false },
          { key: 'improve',     label: 'Improve Tone', fn: handleImprove,     disabled: !messageTemplate.trim() },
          { key: 'personalise', label: 'Personalise',  fn: handlePersonalise, disabled: !messageTemplate.trim() },
        ].map(btn => (
          <button key={btn.key} onClick={btn.fn} disabled={aiLoading !== null || btn.disabled} style={{
            display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600,
            padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
            background: C.blueTrack, color: C.blue, border: 'none',
            opacity: aiLoading !== null || btn.disabled ? 0.4 : 1,
          }}>
            {aiLoading === btn.key ? <Loader2 size={10} style={{ animation: 'xeno-spin 1s linear infinite' }} /> : <Sparkles size={10} />}
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Agent step 2: segment chooser ───────────────────────────────────────────
function AgentSegmentStep({ plan, segList, selectedSegmentId, generatedPreviewCount, onSelectExisting, onSelectGenerated }: {
  plan: AgentPlan
  segList: Segment[]
  selectedSegmentId: string | 'generated'
  generatedPreviewCount: number | undefined
  onSelectExisting: (seg: Segment) => void
  onSelectGenerated: () => void
}) {
  // Compute count for whatever is currently selected
  const selectedCount: number | undefined = selectedSegmentId === 'generated'
    ? generatedPreviewCount
    : segList.find(s => s.id === selectedSegmentId)?.customerCount

  const isZero = selectedCount !== undefined && selectedCount === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Choose an audience</div>

      {/* Existing segments list */}
      {segList.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 176, overflowY: 'auto' }}>
          {segList.map(seg => {
            const isSelected = selectedSegmentId === seg.id
            const hasNoCustomers = (seg.customerCount ?? 0) === 0
            return (
              <button key={seg.id} onClick={() => onSelectExisting(seg)} style={{
                width: '100%', textAlign: 'left', padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                border: `1px solid ${isSelected ? '#fff' : 'rgba(255,255,255,0.2)'}`,
                background: isSelected ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.04)',
                transition: 'all 0.12s',
                opacity: hasNoCustomers ? 0.5 : 1,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{seg.name}</div>
                  {hasNoCustomers && (
                    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: 'rgba(220,38,38,0.3)', color: '#FCA5A5', fontWeight: 600 }}>
                      0 customers
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
                  {seg.customerCount ?? '?'} customers · {seg.rules.length === 0 ? 'No filters' : `${seg.rules.length} rule${seg.rules.length !== 1 ? 's' : ''}`}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Generate segment option */}
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
        Generate a suitable segment
      </div>
      <button onClick={onSelectGenerated} style={{
        width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
        border: `1px solid ${selectedSegmentId === 'generated' ? '#fff' : 'rgba(255,255,255,0.2)'}`,
        background: selectedSegmentId === 'generated' ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.04)',
        transition: 'all 0.12s',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={12} style={{ color: '#fff' }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Generate a suitable segment</div>
        </div>
        {selectedSegmentId !== 'generated' ? (
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, marginTop: 8 }}>
            Click to use AI to generate a matching segment for this campaign.
          </div>
        ) : (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, marginBottom: 8 }}>{plan.segmentDescription}</div>
            <RulePillList rules={plan.rules} tinted />
          </div>
        )}
      </button>

      {/* Customer count / zero warning — shown whenever something is selected */}
      {selectedSegmentId && (
        <div>
          {isZero ? (
            <ZeroCountWarning
              tinted
              message={
                selectedSegmentId === 'generated'
                  ? "The generated segment matches 0 customers. Go back and rephrase your purpose — try a broader city, lower spend threshold, or longer inactivity window."
                  : "This segment has 0 customers. Choose a different segment or generate a new one."
              }
            />
          ) : selectedCount !== undefined && (
            <CustomerCountPill count={selectedCount} tinted />
          )}
        </div>
      )}
    </div>
  )
}

function SummaryStep({ data, segmentName, customerCount, tinted, agentReasoning, onChannelChange, onMessageChange }: {
  data: WizardData; segmentName: string; customerCount: number | undefined
  tinted: boolean; agentReasoning?: string; onChannelChange: (c: string) => void; onMessageChange: (t: string) => void
}) {
  const [aiLoading, setAiLoading] = useState<string | null>(null)
  const labelColor = tinted ? 'rgba(255,255,255,0.6)' : C.slate400
  const valueColor = tinted ? '#fff' : C.slate900
  const boxBg      = tinted ? 'rgba(255,255,255,0.08)' : C.slate50
  const boxBorder  = tinted ? '1px solid rgba(255,255,255,0.15)' : `1px solid ${C.border}`

  const handleSuggest     = async () => { setAiLoading('suggest');     try { const r = await aiMessage('suggest',     undefined,       { campaignName: data.name, purpose: data.purpose, segmentDescription: data.segmentDescription }); onMessageChange(r.template) } finally { setAiLoading(null) } }
  const handleImprove     = async () => { setAiLoading('improve');     try { const r = await aiMessage('improve',     data.messageTemplate); onMessageChange(r.template) } finally { setAiLoading(null) } }
  const handlePersonalise = async () => { setAiLoading('personalise'); try { const r = await aiMessage('personalise', data.messageTemplate); onMessageChange(r.template) } finally { setAiLoading(null) } }

  const Row = ({ label, value }: { label: string; value: string }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 14px', borderRadius: 10, background: boxBg, border: boxBorder }}>
      <span style={{ fontSize: 11, color: labelColor }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: valueColor }}>{value}</span>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: labelColor, fontWeight: 600 }}>Review & Send</div>
      <Row label="Name" value={data.name} />
      <Row label="Segment" value={segmentName} />
      <div style={{ padding: '10px 14px', borderRadius: 10, background: boxBg, border: boxBorder }}>
        <div style={{ fontSize: 11, color: labelColor, marginBottom: 8 }}>Channel</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {CHANNELS.map(ch => {
            const isSelected = data.channel === ch.value
            return (
              <button key={ch.value} onClick={() => onChannelChange(ch.value)} style={{
                flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.12s',
                background: isSelected ? (tinted ? '#fff' : C.blue) : 'transparent',
                color: isSelected ? (tinted ? C.blue : '#fff') : valueColor,
                border: `1px solid ${isSelected ? (tinted ? '#fff' : C.blue) : boxBorder}`,
              }}>
                {ch.label}
              </button>
            )
          })}
        </div>
      </div>
      <div style={{ padding: '10px 14px', borderRadius: 10, background: boxBg, border: boxBorder }}>
        <div style={{ fontSize: 11, color: labelColor, marginBottom: 6 }}>Message</div>
        <textarea
          style={{
            width: '100%', fontSize: 12, lineHeight: 1.6, outline: 'none',
            resize: 'none', background: 'transparent', border: 'none',
            color: tinted ? '#fff' : C.slate700, minHeight: 64, boxSizing: 'border-box',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
          value={data.messageTemplate}
          onChange={e => onMessageChange(e.target.value)}
        />
        {tinted && (
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[
              { key: 'suggest', label: 'Suggest', fn: handleSuggest },
              { key: 'improve', label: 'Improve', fn: handleImprove, disabled: !data.messageTemplate.trim() },
              { key: 'personalise', label: 'Personalise', fn: handlePersonalise, disabled: !data.messageTemplate.trim() },
            ].map(btn => (
              <button key={btn.key} onClick={btn.fn} disabled={aiLoading !== null || btn.disabled} style={{
                flex: 1, minWidth: 100, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                padding: '8px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                cursor: btn.disabled || aiLoading !== null ? 'not-allowed' : 'pointer',
                background: tinted ? 'rgba(255,255,255,0.12)' : C.blueTrack,
                color: tinted ? '#fff' : C.blue,
                border: 'none', opacity: aiLoading !== null || btn.disabled ? 0.45 : 1,
              }}>
                {aiLoading === btn.key ? <Loader2 size={10} style={{ animation: 'xeno-spin 1s linear infinite' }} /> : <Sparkles size={10} />}
                <span>{btn.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {agentReasoning && tinted && (
        <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.08)', border: boxBorder, color: '#fff', fontSize: 12, lineHeight: 1.6 }}>
          <strong style={{ display: 'block', marginBottom: 6, color: '#fff' }}>AI reasoning</strong>
          {agentReasoning}
        </div>
      )}
      {customerCount !== undefined && customerCount > 0 && (
        <div style={{ fontSize: 11, color: labelColor }}>Will send to ~{customerCount} customers.</div>
      )}
    </div>
  )
}

// ─── Wizard ───────────────────────────────────────────────────────────────────
function nextBtnStyle(isAgent: boolean, disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
    padding: '8px 16px', borderRadius: 10, cursor: disabled ? 'not-allowed' : 'pointer',
    background: isAgent ? '#fff' : C.blue, color: isAgent ? C.blue : '#fff',
    border: 'none', opacity: disabled ? 0.4 : 1, transition: 'opacity 0.15s',
  }
}

function NewCampaignWizard({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [step, setStep]           = useState(1)
  const [agentMode, setAgentMode] = useState(false)
  const [data, setData] = useState<WizardData>({ name: '', purpose: '', segmentId: '', segmentDescription: '', channel: '', messageTemplate: '' })
  const [agentLoading, setAgentLoading]   = useState(false)
  const [agentPlan, setAgentPlan]         = useState<AgentPlan | null>(null)
  const [agentSelectedSegmentId, setAgentSelectedSegmentId] = useState<string | 'generated'>('')
  const [agentGeneratedPreviewCount, setAgentGeneratedPreviewCount] = useState<number | undefined>(undefined)
  const [agentError, setAgentError]       = useState<string | null>(null)
  const [agentSegmentSaving, setAgentSegmentSaving] = useState(false)
  const [agentFinalCustomerCount, setAgentFinalCustomerCount] = useState<number | undefined>(undefined)
  const [manualSegmentCount, setManualSegmentCount] = useState<number | null>(null)
  const [submitting, setSubmitting]       = useState(false)

  const queryClient = useQueryClient()
  const { data: segments } = useQuery({ queryKey: ['segments'], queryFn: getSegments })
  const createMutation = useMutation({ mutationFn: createCampaign })
  const segList: Segment[] = segments || []
  const selectedSegment = segList.find(s => s.id === data.segmentId)

  const handleSelectSegment = (seg: Segment) => {
    setData(d => ({ ...d, segmentId: seg.id, segmentDescription: seg.description ?? '' }))
    setManualSegmentCount(seg.customerCount ?? null)
  }
  const handleChannelSelect  = (channel: string) => setData(d => ({ ...d, channel }))
  const handleMessageChange  = (messageTemplate: string) => setData(d => ({ ...d, messageTemplate }))

  // ── Agent: step 1 → 2 (no pre-validation, just plan and go) ──────────────
  const handleAgentPlan = async () => {
    if (!data.name.trim() || !data.purpose.trim()) return
    setAgentLoading(true); setAgentError(null)
    try {
      const res = await aiAgent(data.purpose)
      if (res.plan) {
        setAgentPlan(res.plan)
        // pre-select best match if one exists, otherwise nothing selected
        const matched = res.plan.matchedExistingSegment
          ? segList.find(s => s.name.toLowerCase() === res.plan.matchedExistingSegment?.toLowerCase())
          : null
        setAgentSelectedSegmentId(matched ? matched.id : '')

        // fetch preview count for the generated rules so step 2 can show it immediately
        try {
          const preview = await previewSegment(res.plan.rules)
          setAgentGeneratedPreviewCount(preview.count ?? preview.total ?? 0)
        } catch {
          setAgentGeneratedPreviewCount(undefined)
        }

        setStep(2)
      } else {
        setAgentError(res.error || 'Failed to generate a campaign plan')
      }
    } catch (err: any) {
      setAgentError(err?.response?.data?.error ?? 'Failed')
    } finally {
      setAgentLoading(false)
    }
  }

  // ── Agent: step 2 → 3 (validate count here, save segment, proceed) ───────
  const handleAgentProceedToSummary = async () => {
    if (!agentPlan || !agentSelectedSegmentId) return

    // Derive count for the current selection
    const currentCount = agentSelectedSegmentId === 'generated'
      ? agentGeneratedPreviewCount
      : segList.find(s => s.id === agentSelectedSegmentId)?.customerCount

    // Block if 0
    if (currentCount !== undefined && currentCount === 0) return // button already disabled

    let finalSegmentId = '', finalSegmentDescription = '', finalCustomerCount: number | undefined

    if (agentSelectedSegmentId === 'generated') {
      setAgentSegmentSaving(true); setAgentError(null)
      try {
        const created = await createSegment({ name: agentPlan.segmentName, rules: agentPlan.rules })
        finalSegmentId = created.segment.id
        finalSegmentDescription = created.segment.description ?? ''
        finalCustomerCount = agentGeneratedPreviewCount
        queryClient.invalidateQueries({ queryKey: ['segments'] })
      } catch (err: any) {
        setAgentError(err?.response?.data?.error ?? 'Failed to save segment')
        setAgentSegmentSaving(false)
        return
      }
      setAgentSegmentSaving(false)
    } else {
      const existing = segList.find(s => s.id === agentSelectedSegmentId)
      if (!existing) return
      finalSegmentId = existing.id
      finalSegmentDescription = existing.description ?? ''
      finalCustomerCount = existing.customerCount
    }

    setData(d => ({
      ...d,
      segmentId: finalSegmentId,
      segmentDescription: finalSegmentDescription,
      channel: agentPlan.channel,
      messageTemplate: agentPlan.messageTemplate,
    }))
    setAgentFinalCustomerCount(finalCustomerCount)
    setStep(3)
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const res = await createMutation.mutateAsync({ name: data.name, segmentId: data.segmentId, channel: data.channel, messageTemplate: data.messageTemplate })
      const id = res.campaign?.id || res.id
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      await sendCampaign(id)
      onCreated(id)
    } finally { setSubmitting(false) }
  }

  const totalSteps = agentMode ? 3 : 5
  const manualSegmentName = selectedSegment?.name || 'None selected'
  const agentSegmentName  = agentSelectedSegmentId === 'generated'
    ? agentPlan?.segmentName || ''
    : segList.find(s => s.id === agentSelectedSegmentId)?.name || ''

  // Compute whether agent step 2 "Next" should be disabled
  const agentStep2SelectedCount = agentSelectedSegmentId === 'generated'
    ? agentGeneratedPreviewCount
    : segList.find(s => s.id === agentSelectedSegmentId)?.customerCount
  const agentStep2Blocked = !agentSelectedSegmentId || agentSegmentSaving || (agentStep2SelectedCount !== undefined && agentStep2SelectedCount === 0)

  // Manual step 2 next button: need a segment with >0 customers
  const manualStep2Count = selectedSegment?.customerCount ?? manualSegmentCount ?? null
  const canStep2M = !!data.segmentId && (manualStep2Count === null || manualStep2Count > 0)

  const isAgent      = agentMode
  const containerBg  = isAgent ? 'linear-gradient(145deg, #1B6EF3 0%, #0F172A 100%)' : C.surface
  const headerBorder = isAgent ? '1px solid rgba(255,255,255,0.1)' : `1px solid ${C.border}`
  const titleColor   = isAgent ? '#fff' : C.slate900
  const subtleColor  = isAgent ? 'rgba(255,255,255,0.55)' : C.slate400
  const canStep1  = !!data.name.trim() && !!data.purpose.trim()
  const canStep3M = !!data.channel

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      background: 'rgba(15,23,42,0.5)',
    }}>
      <div style={{
        width: '100%', maxWidth: 480, borderRadius: 18,
        background: containerBg,
        border: isAgent ? '1px solid rgba(255,255,255,0.1)' : `1px solid ${C.border}`,
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px', borderBottom: headerBorder }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: titleColor }}>{isAgent ? 'New Campaign · AI Plan' : 'New Campaign'}</div>
            <div style={{ fontSize: 11, color: subtleColor, marginTop: 2 }}>Step {step} of {totalSteps}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: subtleColor, cursor: 'pointer', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '12px 22px 0', display: 'flex', gap: 5 }}>
          {Array.from({ length: totalSteps }, (_, i) => i + 1).map(s => (
            <div key={s} style={{
              height: 3, flex: 1, borderRadius: 99, transition: 'background 0.2s',
              background: s <= step ? (isAgent ? '#fff' : C.blue) : (isAgent ? 'rgba(255,255,255,0.18)' : C.border),
            }} />
          ))}
        </div>

        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* ── Step 1: name + purpose + mode toggle ── */}
          {step === 1 && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: subtleColor, fontWeight: 600 }}>Campaign Name</div>
                <input
                  style={{
                    width: '100%', padding: '9px 14px', borderRadius: 10, fontSize: 13, outline: 'none',
                    border: `1px solid ${isAgent ? 'rgba(255,255,255,0.2)' : C.border}`,
                    color: titleColor, background: isAgent ? 'rgba(255,255,255,0.08)' : C.surface, boxSizing: 'border-box',
                  }}
                  placeholder="e.g. Diwali Mumbai Reactivation"
                  value={data.name}
                  onChange={e => setData(d => ({ ...d, name: e.target.value }))}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: subtleColor, fontWeight: 600 }}>Purpose</div>
                {isAgent && (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
                    Be specific — mention city, spend range, product category, or inactivity period for better AI results.
                  </div>
                )}
                <textarea
                  style={{
                    width: '100%', padding: '9px 14px', borderRadius: 10, fontSize: 13, outline: 'none',
                    border: `1px solid ${isAgent ? 'rgba(255,255,255,0.2)' : C.border}`,
                    color: titleColor, background: isAgent ? 'rgba(255,255,255,0.08)' : C.surface,
                    resize: 'none', minHeight: 72, lineHeight: 1.6, boxSizing: 'border-box',
                  }}
                  placeholder={isAgent
                    ? "e.g. re-engage Mumbai customers who spent over ₹5,000 but haven't bought in 60 days"
                    : "e.g. re-engage Chennai customers who haven't returned in 60 days"}
                  value={data.purpose}
                  onChange={e => setData(d => ({ ...d, purpose: e.target.value }))}
                />
              </div>
              <button onClick={() => setAgentMode(m => !m)} style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '11px 14px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s',
                background: isAgent ? 'rgba(255,255,255,0.12)' : C.blueTrack,
                border: `1px solid ${isAgent ? 'rgba(255,255,255,0.25)' : 'rgba(27,110,243,0.15)'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Bot size={14} style={{ color: isAgent ? '#fff' : C.blue }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: isAgent ? '#fff' : C.blue }}>Let AI plan this campaign</span>
                </div>
                <div style={{ width: 34, height: 18, borderRadius: 99, position: 'relative', background: isAgent ? '#fff' : C.slate200 }}>
                  <div style={{
                    position: 'absolute', width: 14, height: 14, borderRadius: '50%', top: 2,
                    left: isAgent ? 18 : 2, transition: 'left 0.2s',
                    background: isAgent ? C.blue : C.slate400,
                  }} />
                </div>
              </button>
              {/* Only show agent error on step 1 for non-network errors (plan parse failures etc) */}
              {agentError && step === 1 && (
                <div style={{ fontSize: 11, padding: '8px 12px', borderRadius: 8, background: 'rgba(220,38,38,0.12)', color: '#FCA5A5' }}>
                  {agentError}
                </div>
              )}
            </>
          )}

          {/* ── Manual steps ── */}
          {!agentMode && step === 2 && (
            <SegmentPickerStep
              segList={segList}
              segmentId={data.segmentId}
              campaignName={data.name}
              purpose={data.purpose}
              onSelect={handleSelectSegment}
              onCountChange={count => setManualSegmentCount(count)}
            />
          )}
          {!agentMode && step === 3 && <ChannelPickerStep channel={data.channel} segmentDescription={data.segmentDescription} onSelect={handleChannelSelect} />}
          {!agentMode && step === 4 && <MessageStep campaignName={data.name} purpose={data.purpose} segmentDescription={data.segmentDescription} messageTemplate={data.messageTemplate} onChange={handleMessageChange} />}
          {!agentMode && step === 5 && <SummaryStep data={data} segmentName={manualSegmentName} customerCount={selectedSegment?.customerCount} tinted={false} onChannelChange={handleChannelSelect} onMessageChange={handleMessageChange} />}

          {/* ── Agent steps ── */}
          {agentMode && step === 2 && agentPlan && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <AgentSegmentStep
                plan={agentPlan}
                segList={segList}
                selectedSegmentId={agentSelectedSegmentId}
                generatedPreviewCount={agentGeneratedPreviewCount}
                onSelectExisting={seg => { setAgentSelectedSegmentId(seg.id); setAgentError(null) }}
                onSelectGenerated={() => { setAgentSelectedSegmentId('generated'); setAgentError(null) }}
              />
              {agentError && step === 2 && (
                <ZeroCountWarning tinted message={agentError} />
              )}
            </div>
          )}
          {agentMode && step === 3 && (
            <SummaryStep
              data={data}
              segmentName={agentSegmentName}
              customerCount={agentFinalCustomerCount}
              tinted
              agentReasoning={agentPlan?.reasoning}
              onChannelChange={handleChannelSelect}
              onMessageChange={handleMessageChange}
            />
          )}
        </div>

        {/* ── Footer nav ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 22px', borderTop: headerBorder }}>
          <button onClick={() => step === 1 ? onClose() : setStep(s => s - 1)} style={{
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 500,
            color: subtleColor, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px', borderRadius: 8,
          }}>
            {step > 1 && <ChevronLeft size={14} />}
            {step === 1 ? 'Cancel' : 'Back'}
          </button>

          {/* Step 1 buttons */}
          {step === 1 && !agentMode && (
            <button onClick={() => setStep(2)} disabled={!canStep1} style={nextBtnStyle(false, !canStep1)}>
              Next <ChevronRight size={14} />
            </button>
          )}
          {step === 1 && agentMode && (
            <button onClick={handleAgentPlan} disabled={!canStep1 || agentLoading} style={nextBtnStyle(true, !canStep1 || agentLoading)}>
              {agentLoading
                ? <><Loader2 size={13} style={{ animation: 'xeno-spin 1s linear infinite' }} />Planning…</>
                : <><Bot size={13} />Generate Plan</>}
            </button>
          )}

          {/* Manual step buttons */}
          {!agentMode && step === 2 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {manualStep2Count === 0 && data.segmentId && (
                <span style={{ fontSize: 11, color: C.red, fontWeight: 600 }}>0 customers in this segment</span>
              )}
              <button onClick={() => setStep(3)} disabled={!canStep2M} style={nextBtnStyle(false, !canStep2M)}>
                Next <ChevronRight size={14} />
              </button>
            </div>
          )}
          {!agentMode && step === 3 && (
            <button onClick={() => setStep(4)} disabled={!canStep3M} style={nextBtnStyle(false, !canStep3M)}>
              Next <ChevronRight size={14} />
            </button>
          )}
          {!agentMode && step === 4 && (
            <button onClick={() => setStep(5)} disabled={!data.messageTemplate.trim()} style={nextBtnStyle(false, !data.messageTemplate.trim())}>
              Next <ChevronRight size={14} />
            </button>
          )}

          {/* Agent step 2 button */}
          {agentMode && step === 2 && (
            <button onClick={handleAgentProceedToSummary} disabled={agentStep2Blocked} style={nextBtnStyle(true, agentStep2Blocked)}>
              {agentSegmentSaving
                ? <><Loader2 size={13} style={{ animation: 'xeno-spin 1s linear infinite' }} />Saving…</>
                : <>Next <ChevronRight size={14} /></>}
            </button>
          )}

          {/* Final send buttons */}
          {((!agentMode && step === 5) || (agentMode && step === 3)) && (
            <button
              onClick={handleSubmit}
              disabled={submitting || (!agentMode && !data.messageTemplate.trim())}
              style={nextBtnStyle(isAgent, submitting || (!agentMode && !data.messageTemplate.trim()))}
            >
              {submitting
                ? <><Loader2 size={13} style={{ animation: 'xeno-spin 1s linear infinite' }} />Sending…</>
                : <><Send size={13} />Create & Send</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Campaigns page ───────────────────────────────────────────────────────────
export default function Campaigns() {
  const [wizardOpen, setWizardOpen]   = useState(false)
  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [liveSort, setLiveSort]       = useState('all')
  const [doneSort, setDoneSort]       = useState('all')
  const [draftSort, setDraftSort]     = useState('all')
  const queryClient = useQueryClient()

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ['campaigns'], queryFn: getCampaigns, refetchInterval: 10_000,
  })
  const list: any[] = campaigns || []

  const handleCreated = (id: string) => {
    setWizardOpen(false)
    queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    setSelectedId(id)
  }

  const selectedCampaign = list.find(c => c.id === selectedId) ?? null

  const live      = list.filter(c => c.status === 'sending')
  const completed = list.filter(c => c.status === 'completed')
  const drafts    = list.filter(c => c.status === 'draft')

  const byChannel = (items: any[], sort: string) => sort === 'all' ? items : items.filter(c => c.channel === sort)

  return (
    <>
      <style>{`
        @keyframes xeno-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(239,159,39,0.5); }
          70%  { box-shadow: 0 0 0 7px rgba(239,159,39,0); }
          100% { box-shadow: 0 0 0 0 rgba(239,159,39,0); }
        }
        @keyframes xeno-spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: C.pageBg }}>

        {/* ── Top bar ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '24px 28px 20px',
        }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, color: C.slate900, margin: 0, lineHeight: 1.2 }}>Campaigns</h1>
            <p style={{ fontSize: 13, color: C.slate500, margin: '2px 0 0', lineHeight: 1 }}>
              {live.length} live · {completed.length} completed
            </p>
          </div>
          <button onClick={() => setWizardOpen(true)} style={{
            display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500,
            padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: C.blue, color: '#fff',
          }}>
            <Plus size={15} /> New Campaign
          </button>
        </div>

        {/* Summary strip */}
        <SummaryStrip campaigns={list} />

        {/* Card list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 28 }}>
          {isLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 0' }}>
              <Loader2 size={20} style={{ animation: 'xeno-spin 1s linear infinite', color: C.blue }} />
            </div>
          ) : list.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: '80px 0', gap: 12,
            }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: C.blueTrack, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BarChart2 size={24} style={{ color: C.blue }} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.slate900 }}>No campaigns yet</div>
              <div style={{ fontSize: 12, color: C.slate400, textAlign: 'center', maxWidth: 220, lineHeight: 1.6 }}>
                Create your first campaign to start reaching customers.
              </div>
              <button onClick={() => setWizardOpen(true)} style={{
                marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 13, fontWeight: 500, padding: '8px 16px', borderRadius: 8,
                background: C.blue, color: '#fff', border: 'none', cursor: 'pointer',
              }}>
                <Plus size={15} /> New Campaign
              </button>
            </div>
          ) : (
            <>
              {/* Live */}
              <div>
                <SectionHeader label="Live" count={byChannel(live, liveSort).length} sort={liveSort} onSort={setLiveSort} />
                {byChannel(live, liveSort).length === 0 ? (
                  <div style={{
                    margin: '6px 0', padding: '20px', background: C.surface, borderRadius: 12,
                    border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: C.slate100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Activity size={15} style={{ color: C.slate400 }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.slate700 }}>No live campaigns</div>
                      <div style={{ fontSize: 11, color: C.slate400 }}>
                        {liveSort !== 'all' ? `No live ${liveSort} campaigns` : "Start a new campaign and it'll appear here."}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginTop: 6 }}>
                    {byChannel(live, liveSort).map(c => (
                      <CampaignCard key={c.id} campaign={c} onClick={() => setSelectedId(c.id)} />
                    ))}
                  </div>
                )}
              </div>

              {/* Completed */}
              {completed.length > 0 && (
                <div>
                  <SectionHeader label="Completed" count={byChannel(completed, doneSort).length} sort={doneSort} onSort={setDoneSort} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginTop: 6 }}>
                    {byChannel(completed, doneSort).map(c => (
                      <CampaignCard key={c.id} campaign={c} onClick={() => setSelectedId(c.id)} />
                    ))}
                  </div>
                </div>
              )}

              {/* Drafts */}
              {drafts.length > 0 && (
                <div>
                  <SectionHeader label="Drafts" count={byChannel(drafts, draftSort).length} sort={draftSort} onSort={setDraftSort} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginTop: 6 }}>
                    {byChannel(drafts, draftSort).map(c => (
                      <CampaignCard key={c.id} campaign={c} onClick={() => setSelectedId(c.id)} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {selectedCampaign && (
        <CampaignDetailDialog campaign={selectedCampaign} onClose={() => setSelectedId(null)} />
      )}
      {wizardOpen && <NewCampaignWizard onClose={() => setWizardOpen(false)} onCreated={handleCreated} />}
    </>
  )
}