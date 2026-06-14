

type Props = {
  label: string
  value: number | string
  accent?: 'blue' | 'emerald' | 'amber' | 'red' | 'slate'
  sub?: string
}

const accents: Record<string, { border: string; bg: string; value: string }> = {
  blue:    { border: '#1B6EF3', bg: 'rgba(27,110,243,0.05)',  value: '#1B6EF3' },
  emerald: { border: '#10B981', bg: 'rgba(16,185,129,0.05)',  value: '#059669' },
  amber:   { border: '#F59E0B', bg: 'rgba(245,158,11,0.05)',  value: '#D97706' },
  red:     { border: '#EF4444', bg: 'rgba(239,68,68,0.05)',   value: '#DC2626' },
  slate:   { border: '#CBD5E1', bg: 'rgba(203,213,225,0.15)', value: '#475569' },
}

export default function StatCard({ label, value, accent = 'slate', sub }: Props) {
  const a = accents[accent]
  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: '#fff',
        border: '1px solid #E2E8F0',
        borderLeft: `3px solid ${a.border}`,
      }}
    >
      <div
        className="text-xs uppercase tracking-wider mb-1"
        style={{ color: '#94A3B8', letterSpacing: '0.06em' }}
      >
        {label}
      </div>
      <div className="text-2xl font-semibold" style={{ color: '#0F172A' }}>
        {value}
      </div>
      {sub && (
        <div className="text-xs mt-1" style={{ color: '#94A3B8' }}>
          {sub}
        </div>
      )}
    </div>
  )
}