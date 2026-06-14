import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CampaignDetailDialog } from '@/pages/Campaigns'
import { getAnalytics, getCampaigns, getCampaignStats } from '@/lib/api'
import {
  Loader2, Sparkles, ArrowRight, Mail, MessageSquare, Phone,
  TrendingUp, Users, Send, BarChart2, Zap,
  CheckCircle2, AlertCircle, MousePointerClick,
} from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

// ─── Types ─────────────────────────────────────────────────────────────────────
type CampaignStats = {
  sent: number; delivered: number; opened: number
  clicked: number; failed: number; pending: number
}

// ─── Channel config ────────────────────────────────────────────────────────────
const CHANNEL_MAP: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  email:    { label: 'Email',    icon: <Mail size={10} />,          color: '#6366F1', bg: 'rgba(99,102,241,0.08)'  },
  sms:      { label: 'SMS',      icon: <MessageSquare size={10} />, color: '#0EA5E9', bg: 'rgba(14,165,233,0.08)'  },
  whatsapp: { label: 'WhatsApp', icon: <Phone size={10} />,         color: '#22C55E', bg: 'rgba(34,197,94,0.08)'   },
}

// ─── Channel badge ─────────────────────────────────────────────────────────────
function ChannelBadge({ channel }: { channel: string }) {
  const ch = CHANNEL_MAP[channel] ?? { label: channel?.toUpperCase() ?? '—', icon: null, color: '#64748B', bg: '#F1F5F9' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 10, padding: '3px 8px', borderRadius: 6, fontWeight: 600,
      background: ch.bg, color: ch.color, letterSpacing: '0.04em', textTransform: 'uppercase',
    }}>
      {ch.icon}{ch.label}
    </span>
  )
}

// ─── Pulse dot ────────────────────────────────────────────────────────────────
function PulseDot({ color = '#F59E0B' }: { color?: string }) {
  return (
    <span style={{
      display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
      background: color, animation: 'xeno-pulse 1.8s ease-in-out infinite', flexShrink: 0,
    }} />
  )
}

// ─── Mini donut tooltip ────────────────────────────────────────────────────────
function MiniDonutTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#1E293B', color: '#fff', padding: '5px 9px',
      borderRadius: 7, fontSize: 11, fontWeight: 600, pointerEvents: 'none',
    }}>
      {payload[0].name}: {payload[0].value}
    </div>
  )
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, accent }: {
  icon: React.ReactNode; label: string; value: string | number; accent: string
}) {
  return (
    <div style={{
      background: accent, borderRadius: 18, padding: '22px 24px',
      boxShadow: '0 18px 40px rgba(15,23,42,0.08)',
      display: 'flex', flexDirection: 'column', gap: 16
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 12,
        background: 'rgba(255,255,255,0.16)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff',
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
          {value}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 6, fontWeight: 500 }}>{label}</div>
      </div>
      <div style={{ height: 3, width: 28, borderRadius: 99, background: 'rgba(255,255,255,0.35)' }} />
    </div>
  )
}

// ─── Funnel row ───────────────────────────────────────────────────────────────
function FunnelRow({ label, value, pct, color }: {
  label: string; value: number; pct: number; color: string
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '68px 1fr 72px', alignItems: 'center', gap: '8px 12px' }}>
      <span style={{ fontSize: 11, color: '#64748B', fontWeight: 500 }}>{label}</span>
      <div style={{ height: 5, borderRadius: 99, background: '#F1F5F9', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`, borderRadius: 99,
          background: color, transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
          {value.toLocaleString()}
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4,
          background: `${color}12`, color,
        }}>{pct}%</span>
      </div>
    </div>
  )
}

// ─── Active campaign card ──────────────────────────────────────────────────────
function ActiveCampaignCard({ campaign }: { campaign: any }) {
  const { data: stats } = useQuery({
    queryKey: ['campaign-stats', campaign.id],
    queryFn: () => getCampaignStats(campaign.id),
    refetchInterval: 10_000,
  })
  const s: CampaignStats = stats ?? { sent: 0, delivered: 0, opened: 0, clicked: 0, failed: 0, pending: 0 }
  const pct = (n: number) => s.sent > 0 ? Math.round((n / s.sent) * 100) : 0

  return (
    <div style={{
      background: '#fff', border: '1px solid #E8ECF2', borderRadius: 16,
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ height: 3, background: 'linear-gradient(90deg, #F59E0B, #FCD34D)' }} />
      <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ChannelBadge channel={campaign.channel} />
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10,
                fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                background: 'rgba(245,158,11,0.08)', color: '#D97706',
              }}>
                <PulseDot color="#F59E0B" /> Live
              </span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{campaign.name}</div>
            <div style={{ fontSize: 11, color: '#94A3B8' }}>{campaign.segmentName || 'All customers'}</div>
          </div>
          {s.pending > 0 && (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#D97706', fontVariantNumeric: 'tabular-nums' }}>{s.pending}</div>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94A3B8' }}>pending</div>
            </div>
          )}
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(5,1fr)',
          background: '#F8FAFC', borderRadius: 10, overflow: 'hidden',
          border: '1px solid #F0F2F7',
        }}>
          {([
            { label: 'Sent',      value: s.sent,      color: '#475569' },
            { label: 'Delivered', value: s.delivered, color: '#10B981' },
            { label: 'Opened',    value: s.opened,    color: '#8B5CF6' },
            { label: 'Clicked',   value: s.clicked,   color: '#6366F1' },
            { label: 'Failed',    value: s.failed,    color: '#EF4444' },
          ] as { label: string; value: number; color: string }[]).map(({ label, value, color }, i) => (
            <div key={label} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0',
              borderRight: i < 4 ? '1px solid #F0F2F7' : 'none',
            }}>
              <div style={{ fontSize: 16, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
              <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#CBD5E1', marginTop: 3 }}>{label}</div>
            </div>
          ))}
        </div>

        {s.sent > 0 && (
          <div style={{ display: 'flex', gap: 16 }}>
            {([
              { label: 'Delivery rate', value: pct(s.delivered), color: '#10B981' },
              { label: 'Open rate',     value: pct(s.opened),    color: '#334155' },
            ] as { label: string; value: number; color: string }[]).map(bar => (
              <div key={bar.label} style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 10, color: '#94A3B8' }}>
                  <span>{bar.label}</span>
                  <span style={{ fontWeight: 700, color: bar.color }}>{bar.value}%</span>
                </div>
                <div style={{ height: 4, borderRadius: 99, background: '#F1F5F9', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${bar.value}%`, borderRadius: 99, background: bar.color, transition: 'width 0.8s' }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Completed campaign card ───────────────────────────────────────────────────
function CompletedCampaignCard({ campaign, onClick }: { campaign: any; onClick: () => void }) {
  const { data: stats } = useQuery({
    queryKey: ['campaign-stats', campaign.id],
    queryFn: () => getCampaignStats(campaign.id),
  })
  const s: CampaignStats = stats ?? { sent: 0, delivered: 0, opened: 0, clicked: 0, failed: 0, pending: 0 }
  const pct = (n: number) => s.sent > 0 ? Math.round((n / s.sent) * 100) : 0

  const donutData = [
    { name: 'Clicked',   value: s.clicked,              color: '#6366F1' },
    { name: 'Opened',    value: s.opened  - s.clicked,  color: '#8B5CF6' },
    { name: 'Delivered', value: s.delivered - s.opened, color: '#10B981' },
    { name: 'Failed',    value: s.failed,               color: '#EF4444' },
  ].filter(d => d.value > 0)

  const channelInfo = CHANNEL_MAP[campaign.channel] ?? {
    label: campaign.channel?.toUpperCase() ?? '—',
    icon: <Mail size={14} />,
    color: '#64748B',
    bg: '#F1F5F9',
  }

  return (
    <div onClick={onClick} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick() }} style={{
      background: '#fff', border: '1px solid #E8ECF2', borderRadius: 16,
      overflow: 'hidden', display: 'flex', flexDirection: 'column', cursor: 'pointer',
    }}>
      <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', flex: 1, gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: channelInfo.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: channelInfo.color, flexShrink: 0 }}>
                {channelInfo.icon}
              </div>

            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{campaign.name}</div>
            <div style={{ fontSize: 11, color: '#94A3B8' }}>{campaign.segmentName || 'No segment'}</div>
          </div>
          {s.sent > 0 && (
            <div style={{ width: 64, height: 64, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donutData} cx="50%" cy="50%"
                    innerRadius={18} outerRadius={28}
                    paddingAngle={2} dataKey="value"
                    startAngle={90} endAngle={-270}>
                    {donutData.map((entry, i) => <Cell key={i} fill={entry.color} stroke="none" />)}
                  </Pie>
                  <Tooltip content={<MiniDonutTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {s.sent > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
            {([
              { icon: <Send size={9} />,              label: 'Delivered', value: pct(s.delivered), color: '#10B981' },
              { icon: <BarChart2 size={9} />,         label: 'Opened',    value: pct(s.opened),    color: '#8B5CF6' },
              { icon: <MousePointerClick size={9} />, label: 'Clicked',   value: pct(s.clicked),   color: '#6366F1' },
              { icon: <AlertCircle size={9} />,       label: 'Failed',    value: pct(s.failed),    color: '#EF4444' },
            ] as { icon: React.ReactNode; label: string; value: number; color: string }[]).map(r => (
              <div key={r.label} style={{
                padding: '8px 10px', borderRadius: 12, background: '#F8FAFC', border: `1px solid ${r.color}20`,
                display: 'flex', flexDirection: 'column', gap: 4,
              }}>
                <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: r.color, opacity: 0.8, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {r.icon} {r.label}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: r.color, fontVariantNumeric: 'tabular-nums' }}>{r.value}%</span>
              </div>
            ))}
          </div>
        )}

        {donutData.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px' }}>
            {donutData.map(d => (
              <span key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#94A3B8' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: d.color, display: 'inline-block' }} />
                {d.name}: {d.value}
              </span>
            ))}
          </div>
        )}

        <div style={{ marginTop: 'auto', paddingTop: 10, borderTop: '1px solid #F1F5F9' }} />
      </div>
    </div>
  )
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: getAnalytics,
  })
  const { data: campaigns, isLoading: campaignsLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: getCampaigns,
    refetchInterval: 10_000,
  })

  const isLoading = analyticsLoading || campaignsLoading
  const a         = analytics ?? {}
  const msgStats  = a.messages  ?? {}
  const campStats = a.campaigns ?? {}

  const totalSent      = msgStats.totalSent      ?? 0
  const totalDelivered = msgStats.totalDelivered ?? 0
  const totalOpened    = msgStats.totalOpened    ?? 0
  const totalClicked   = msgStats.totalClicked   ?? 0
  const avgOpenRate    = totalDelivered > 0
    ? `${Math.round((totalOpened / totalDelivered) * 100)}%` : '—'

  const [selectedCampaign, setSelectedCampaign] = useState<any | null>(null)
  const allCampaigns: any[] = campaigns ?? []
  const active    = allCampaigns.filter(c => c.status === 'sending')
  const completed = allCampaigns
    .filter(c => c.status === 'completed')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const recentCompleted = completed.slice(0, 4)

  const funnelRows = [
    { label: 'Sent',      value: totalSent,      pct: 100,                                                               color: '#6366F1' },
    { label: 'Delivered', value: totalDelivered, pct: totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0, color: '#10B981' },
    { label: 'Opened',    value: totalOpened,    pct: totalSent > 0 ? Math.round((totalOpened    / totalSent) * 100) : 0, color: '#8B5CF6' },
    { label: 'Clicked',   value: totalClicked,   pct: totalSent > 0 ? Math.round((totalClicked   / totalSent) * 100) : 0, color: '#F59E0B' },
  ]

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Loader2 size={20} style={{ animation: 'xeno-spin 1s linear infinite', color: '#6366F1' }} />
      </div>
    )
  }

  return (
    <>
      <style>{`
        @keyframes xeno-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(245,158,11,0.45); }
          70%  { box-shadow: 0 0 0 7px rgba(245,158,11,0); }
          100% { box-shadow: 0 0 0 0 rgba(245,158,11,0); }
        }
        @keyframes xeno-spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ padding: '28px 32px' }}>

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#CBD5E1', fontWeight: 600, marginBottom: 5 }}>Dashboard</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', margin: 0 }}>
              Campaign Performance
            </h1>
            {active.length > 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                fontSize: 11, fontWeight: 600, padding: '6px 12px', borderRadius: 99,
                background: 'rgba(245,158,11,0.08)', color: '#D97706',
                border: '1px solid rgba(245,158,11,0.2)',
              }}>
                <PulseDot color="#F59E0B" />
                {active.length} campaign{active.length > 1 ? 's' : ''} live
              </span>
            )}
          </div>
        </div>

        {/* ── KPI row ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14, marginBottom: 28 }}>
          <KpiCard icon={<Users size={16} />}      label="Total Customers" value="200"                                     accent="#6366F1" />
          <KpiCard icon={<Zap size={16} />}        label="Campaigns Run"   value={campStats.total ?? allCampaigns.length}  accent="#8B5CF6" />
          <KpiCard icon={<Send size={16} />}       label="Messages Sent"   value={totalSent.toLocaleString()}               accent="#10B981" />
          <KpiCard icon={<TrendingUp size={16} />} label="Avg Open Rate"   value={avgOpenRate}                             accent="#F59E0B" />
        </div>

        {/* ── Funnel ──────────────────────────────────────────────────────── */}
        {totalSent > 0 && (
          <div style={{
            background: '#fff', border: '1px solid #E8ECF2', borderRadius: 16,
            padding: '18px 22px', marginBottom: 28,
          }}>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#CBD5E1', fontWeight: 600, marginBottom: 16 }}>
              Communication funnel · all time
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {funnelRows.map(r => <FunnelRow key={r.label} {...r} />)}
            </div>
          </div>
        )}

        {/* ── Active campaigns ─────────────────────────────────────────────── */}
        {active.length > 0 && (
          <section style={{ marginBottom: 28 }}>
            <div style={{
              fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em',
              color: '#CBD5E1', fontWeight: 600, marginBottom: 12,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              Active <PulseDot color="#F59E0B" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
              {active.map(c => <ActiveCampaignCard key={c.id} campaign={c} />)}
            </div>
          </section>
        )}

        {/* ── Completed campaigns ──────────────────────────────────────────── */}
        {completed.length > 0 && (
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{
                fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em',
                color: '#CBD5E1', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <CheckCircle2 size={10} style={{ color: '#10B981' }} /> Completed
              </div>
              <Link to="/campaigns" style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontWeight: 600, color: '#6366F1', textDecoration: 'none',
              }}>
                View all <ArrowRight size={12} />
              </Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 }}>
              {recentCompleted.map((c, i) => (
                <CompletedCampaignCard key={c.id} campaign={c} onClick={() => setSelectedCampaign(c)} />
              ))}
            </div>
            {selectedCampaign && (
              <CampaignDetailDialog campaign={selectedCampaign} onClose={() => setSelectedCampaign(null)} />
            )}
          </section>
        )}

        {/* ── Empty state ──────────────────────────────────────────────────── */}
        {allCampaigns.length === 0 && (
          <div style={{ border: '1.5px dashed #E2E8F0', borderRadius: 16, padding: '60px 32px', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>
              No campaigns yet.{' '}
              <Link to="/campaigns" style={{ color: '#0F172A', fontWeight: 600, textDecoration: 'none' }}>
                Create your first one →
              </Link>
            </p>
          </div>
        )}
      </div>
    </>
  )
}