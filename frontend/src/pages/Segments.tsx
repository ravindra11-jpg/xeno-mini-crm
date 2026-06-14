import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSegments, createSegment, previewSegment, aiSegment, deleteSegment } from '@/lib/api'
import { Loader2, Plus, Sparkles, X, Users, ChevronRight, Trash2, Lock } from 'lucide-react'
import ReactMarkdown from 'react-markdown'


type Rule = {
  field: string
  operator: string
  value: string | number | boolean
}

type Segment = {
  id: string
  name: string
  description?: string
  rules: Rule[]
  customerCount: number
  createdAt: string
  isDefault?: boolean
}

const FIELDS = [
  { value: 'city',                     label: 'City' },
  { value: 'totalSpend',              label: 'Total Spend (₹)' },
  { value: 'orderCount',              label: 'Order Count' },
  { value: 'lastPurchaseAt',          label: 'Days Since Last Purchase' },
  { value: 'productCategory',         label: 'Product Category' },
  { value: 'discountTag',             label: 'Discount Tag' },
  { value: 'purchasedDuringCampaign', label: 'Purchased During Campaign' },
]

const OPERATORS = [
  { value: 'eq',  label: 'equals' },
  { value: 'gt',  label: 'greater than' },
  { value: 'lt',  label: 'less than' },
  { value: 'gte', label: 'at least' },
  { value: 'lte', label: 'at most' },
]

const FIELD_VALUES: Record<string, string[]> = {
  city:                    ['Chennai', 'Mumbai', 'Delhi', 'Bangalore'],
  productCategory:         ['Kurta', 'Western', 'Ethnic Fusion', 'Accessories'],
  discountTag:             ['none', 'sale', 'festive', 'clearance'],
  purchasedDuringCampaign: ['true', 'false'],
}

function allRulesValid(rules: Rule[]): boolean {
  return rules.every(r => String(r.value).trim() !== '')
}

function ruleToLabel(rule: Rule): string {
  const fieldLabel = FIELDS.find(f => f.value === rule.field)?.label ?? rule.field
  const opLabel: Record<string, string> = {
    eq: 'is', gt: 'more than', lt: 'less than', gte: 'at least', lte: 'at most',
  }
  return `${fieldLabel} ${opLabel[rule.operator] ?? rule.operator} ${rule.value}`
}

// ─── Rule row ─────────────────────────────────────────────────────────────────
function RuleRow({ rule, index, onChange, onRemove }: {
  rule: Rule; index: number
  onChange: (i: number, r: Rule) => void
  onRemove: (i: number) => void
}) {
  const presetValues = FIELD_VALUES[rule.field]
  const isEmpty = String(rule.value).trim() === ''

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 110px 1fr 24px', alignItems: 'center' }}>
      <select
        className="rounded-lg px-3 py-2 text-sm outline-none w-full"
        style={{ border: '1px solid #E2E8F0', color: '#0F172A', background: '#fff' }}
        value={rule.field}
        onChange={e => onChange(index, { ...rule, field: e.target.value, value: '' })}
      >
        {FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>

      <select
        className="rounded-lg px-2 py-2 text-sm outline-none w-full"
        style={{ border: '1px solid #E2E8F0', color: '#0F172A', background: '#fff' }}
        value={rule.operator}
        onChange={e => onChange(index, { ...rule, operator: e.target.value })}
      >
        {OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
      </select>

      {presetValues ? (
        <select
          className="rounded-lg px-3 py-2 text-sm outline-none w-full"
          style={{
            border: `1px solid ${isEmpty ? '#FCA5A5' : '#E2E8F0'}`,
            color: '#0F172A',
            background: isEmpty ? '#FFF5F5' : '#fff',
          }}
          value={String(rule.value)}
          onChange={e => onChange(index, { ...rule, value: e.target.value })}
        >
          <option value="">Select…</option>
          {presetValues.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      ) : (
        <input
          className="rounded-lg px-3 py-2 text-sm outline-none w-full"
          style={{
            border: `1px solid ${isEmpty ? '#FCA5A5' : '#E2E8F0'}`,
            color: '#0F172A',
            background: isEmpty ? '#FFF5F5' : '#fff',
          }}
          placeholder="Value"
          value={String(rule.value)}
          onChange={e => {
            const v = isNaN(Number(e.target.value)) || e.target.value.trim() === ''
              ? e.target.value : Number(e.target.value)
            onChange(index, { ...rule, value: v })
          }}
        />
      )}

      <button onClick={() => onRemove(index)} style={{ color: '#94A3B8' }} className="flex items-center justify-center">
        <X size={14} />
      </button>
    </div>
  )
}

// ─── Segment detail dialog ────────────────────────────────────────────────────
function SegmentDialog({ segment, onClose }: { segment: Segment; onClose: () => void }) {
  const tagColors = [
    { bg: 'rgba(27,110,243,0.08)',  color: '#1B6EF3' },
    { bg: 'rgba(124,58,237,0.07)', color: '#7C3AED' },
    { bg: 'rgba(16,185,129,0.08)', color: '#059669' },
    { bg: 'rgba(245,158,11,0.08)', color: '#D97706' },
    { bg: 'rgba(239,68,68,0.08)',  color: '#DC2626' },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl shadow-2xl overflow-y-auto"
        style={{ background: '#fff', border: '1px solid #E2E8F0', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 py-5" style={{ borderBottom: '1px solid #E2E8F0' }}>
          <div>
            <div className="flex items-center gap-2">
              <div className="text-base font-semibold" style={{ color: '#0F172A' }}>{segment.name}</div>
              {segment.isDefault && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1"
                  style={{ background: 'rgba(27,110,243,0.08)', color: '#1B6EF3' }}>
                  <Lock size={9} /> Default
                </span>
              )}
            </div>
            <div className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
              Created {new Date(segment.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1" style={{ color: '#94A3B8' }}>
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg p-4" style={{ background: 'rgba(27,110,243,0.05)', border: '1px solid rgba(27,110,243,0.15)' }}>
              <div className="text-2xl font-bold" style={{ color: '#1B6EF3' }}>{segment.customerCount}</div>
              <div className="text-xs mt-0.5 uppercase tracking-wider" style={{ color: '#64748B' }}>Customers</div>
            </div>
            <div className="rounded-lg p-4" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              <div className="text-2xl font-bold" style={{ color: '#0F172A' }}>
                {segment.rules.length === 0 ? 'All' : segment.rules.length}
              </div>
              <div className="text-xs mt-0.5 uppercase tracking-wider" style={{ color: '#64748B' }}>
                {segment.rules.length === 1 ? 'Rule applied' : 'Rules applied'}
              </div>
            </div>
          </div>

          {segment.description && (
            <div className="rounded-lg p-4" style={{ background: 'rgba(27,110,243,0.04)', border: '1px solid rgba(27,110,243,0.12)' }}>
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles size={12} style={{ color: '#1B6EF3' }} />
                <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: '#1B6EF3' }}>AI Summary</span>
              </div>
              <div className="text-sm leading-relaxed [&_ul]:space-y-1.5 [&_ul]:pl-4 [&_li]:list-disc [&_strong]:font-semibold" style={{ color: '#334155' }}>
                <ReactMarkdown>{segment.description}</ReactMarkdown>
              </div>
            </div>
          )}

          <div>
            <div className="text-xs font-medium uppercase tracking-wider mb-2.5" style={{ color: '#94A3B8' }}>Targeting Rules</div>
            {segment.rules.length === 0 ? (
              <div className="rounded-lg px-4 py-3 text-sm" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#64748B' }}>
                No filters — includes all customers
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {segment.rules.map((rule, i) => {
                  const c = tagColors[i % tagColors.length]
                  return (
                    <span key={i} className="text-xs px-3 py-1.5 rounded-full font-medium" style={{ background: c.bg, color: c.color }}>
                      {ruleToLabel(rule)}
                    </span>
                  )
                })}
              </div>
            )}
          </div>

          {segment.rules.length > 0 && (
            <div>
              <div className="text-xs font-medium uppercase tracking-wider mb-2.5" style={{ color: '#94A3B8' }}>Targeting Profile</div>
              <div className="space-y-2">
                {segment.rules.some(r => r.field === 'city') && (
                  <ProfileRow label="Geography" value={segment.rules.filter(r => r.field === 'city').map(r => String(r.value)).join(', ')} />
                )}
                {segment.rules.some(r => r.field === 'lastPurchaseAt') && (
                  <ProfileRow
                    label="Recency"
                    value={segment.rules.find(r => r.field === 'lastPurchaseAt')?.operator === 'gt'
                      ? `Inactive for ${segment.rules.find(r => r.field === 'lastPurchaseAt')?.value}+ days`
                      : `Active within ${segment.rules.find(r => r.field === 'lastPurchaseAt')?.value} days`}
                  />
                )}
                {segment.rules.some(r => r.field === 'totalSpend') && (
                  <ProfileRow label="Spend tier" value={`₹${Number(segment.rules.find(r => r.field === 'totalSpend')?.value).toLocaleString('en-IN')} threshold`} />
                )}
                {segment.rules.some(r => r.field === 'productCategory') && (
                  <ProfileRow label="Category affinity" value={segment.rules.filter(r => r.field === 'productCategory').map(r => String(r.value)).join(', ')} />
                )}
                {segment.rules.some(r => r.field === 'discountTag') && (
                  <ProfileRow label="Discount sensitivity" value={String(segment.rules.find(r => r.field === 'discountTag')?.value)} />
                )}
                {segment.rules.some(r => r.field === 'purchasedDuringCampaign') && (
                  <ProfileRow
                    label="Campaign responsiveness"
                    value={String(segment.rules.find(r => r.field === 'purchasedDuringCampaign')?.value) === 'true'
                      ? 'Previously responded to campaigns' : 'Has not responded to campaigns'}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
      <span className="text-xs" style={{ color: '#94A3B8' }}>{label}</span>
      <span className="text-xs font-medium" style={{ color: '#0F172A' }}>{value}</span>
    </div>
  )
}

// ─── Segment card ─────────────────────────────────────────────────────────────
function SegmentCard({ segment, onClick, onDelete }: {
  segment: Segment
  onClick: () => void
  onDelete: (id: string) => void
}) {
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (segment.isDefault) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await onDelete(segment.id)
    } catch (err: any) {
      setDeleteError(err?.response?.data?.error ?? 'Could not delete segment')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div
      className="rounded-xl p-5 cursor-pointer transition-all relative"
      style={{ background: '#fff', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
      onClick={onClick}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = '#1B6EF3'
        el.style.boxShadow = '0 4px 12px rgba(27,110,243,0.08)'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = '#E2E8F0'
        el.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(27,110,243,0.08)' }}>
            <Users size={15} style={{ color: '#1B6EF3' }} />
          </div>
          {segment.isDefault && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1"
              style={{ background: 'rgba(27,110,243,0.06)', color: '#94A3B8' }}>
              <Lock size={9} /> Default
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {!segment.isDefault && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-md p-1 transition-colors"
              style={{ color: '#CBD5E1' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
              onMouseLeave={e => (e.currentTarget.style.color = '#CBD5E1')}
              title="Delete segment"
            >
              {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            </button>
          )}
          <ChevronRight size={15} style={{ color: '#CBD5E1' }} />
        </div>
      </div>

      <div className="font-semibold text-sm mb-1.5" style={{ color: '#0F172A' }}>{segment.name}</div>

      {segment.description ? (
        <div className="text-xs leading-relaxed mb-4" style={{
          color: '#64748B',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          <ReactMarkdown
            components={{
              p: ({ children }) => <>{children} </>,
              li: ({ children }) => <>{children} </>,
              ul: ({ children }) => <>{children}</>,
              strong: ({ children }) => <span style={{ fontWeight: 600, color: '#475569' }}>{children}</span>,
            }}
          >
            {segment.description}
          </ReactMarkdown>
        </div>
      ) : (
        <p className="text-xs mb-4" style={{ color: '#94A3B8' }}>No description available.</p>
      )}

      {deleteError && (
        <div className="text-xs mb-2 px-2 py-1.5 rounded-md" style={{ background: 'rgba(239,68,68,0.06)', color: '#DC2626' }}>
          {deleteError}
        </div>
      )}

      <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid #F1F5F9' }}>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold" style={{ color: '#1B6EF3' }}>
            {segment.customerCount} customers
          </span>
          <span className="text-xs" style={{ color: '#CBD5E1' }}>·</span>
          <span className="text-xs" style={{ color: '#94A3B8' }}>
            {segment.rules.length === 0 ? 'No filters' : `${segment.rules.length} rule${segment.rules.length !== 1 ? 's' : ''}`}
          </span>
        </div>
        <span className="text-[10px]" style={{ color: '#CBD5E1' }}>
          {new Date(segment.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
        </span>
      </div>
    </div>
  )
}

// ─── New segment modal ────────────────────────────────────────────────────────
function NewSegmentModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [rules, setRules] = useState<Rule[]>([])
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: createSegment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['segments'] })
      onClose()
    },
  })

  useEffect(() => {
    if (rules.length === 0 || !allRulesValid(rules)) {
      setPreviewCount(null)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setPreviewLoading(true)
      try {
        const res = await previewSegment(rules)
        setPreviewCount(res.count ?? res.total ?? 0)
      } finally {
        setPreviewLoading(false)
      }
    }, 600)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [rules])

  const handleRuleChange = (i: number, r: Rule) =>
    setRules(prev => prev.map((old, idx) => (idx === i ? r : old)))

  const handleRuleRemove = (i: number) => {
    setRules(prev => prev.filter((_, idx) => idx !== i))
    setPreviewCount(null)
  }

  const handleAddRule = () =>
    setRules(prev => [...prev, { field: 'city', operator: 'eq', value: '' }])

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return
    setAiLoading(true)
    try {
      const res = await aiSegment(aiPrompt)
      if (res.rules?.length) setRules(res.rules)
    } finally {
      setAiLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await createMutation.mutateAsync({ name, rules })
    } finally {
      setSaving(false)
    }
  }

  const rulesValid = rules.length === 0 || allRulesValid(rules)
  const canSave = !!name.trim() && rulesValid && previewCount !== 0 && !saving
  const countIsZero = previewCount === 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}
    >
      <div className="w-full max-w-lg rounded-xl shadow-xl" style={{ background: '#fff', border: '1px solid #E2E8F0' }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #E2E8F0' }}>
          <div className="font-semibold text-sm" style={{ color: '#0F172A' }}>New Segment</div>
          <button onClick={onClose} style={{ color: '#94A3B8' }}><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-xs font-medium uppercase tracking-wider" style={{ color: '#64748B' }}>
              Segment Name
            </label>
            <input
              className="mt-1.5 w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ border: '1px solid #E2E8F0', color: '#0F172A' }}
              placeholder="e.g. Mumbai High-Spenders"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div className="rounded-lg p-3" style={{ background: 'rgba(27,110,243,0.04)', border: '1px solid rgba(27,110,243,0.12)' }}>
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles size={13} style={{ color: '#1B6EF3' }} />
              <span className="text-xs font-medium" style={{ color: '#1B6EF3' }}>Describe in plain English</span>
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-lg px-3 py-1.5 text-xs outline-none"
                style={{ border: '1px solid #E2E8F0', color: '#0F172A' }}
                placeholder="e.g. customers in Mumbai who haven't bought in 60 days"
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAiGenerate()}
              />
              <button
                onClick={handleAiGenerate}
                disabled={aiLoading || !aiPrompt.trim()}
                className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
                style={{ background: '#1B6EF3', color: '#fff' }}
              >
                {aiLoading ? <Loader2 size={12} className="animate-spin" /> : 'Generate'}
              </button>
            </div>
          </div>

          <div>
            <div className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: '#64748B' }}>
              Rules · All must match
            </div>
            {rules.length === 0 ? (
              <div className="rounded-lg px-4 py-4 text-center" style={{ border: '1px dashed #E2E8F0' }}>
                <p className="text-xs" style={{ color: '#94A3B8' }}>
                  No rules yet — add one manually or describe above.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {rules.map((rule, i) => (
                  <RuleRow key={i} rule={rule} index={i} onChange={handleRuleChange} onRemove={handleRuleRemove} />
                ))}
              </div>
            )}
            <button
              onClick={handleAddRule}
              className="mt-2 flex items-center gap-1.5 text-xs font-medium"
              style={{ color: '#1B6EF3' }}
            >
              <Plus size={13} /> Add rule
            </button>
          </div>

          <div className="flex items-center gap-2 h-5">
            {previewLoading && <Loader2 size={13} className="animate-spin" style={{ color: '#94A3B8' }} />}
            {!previewLoading && previewCount !== null && (
              <span className="text-sm font-semibold" style={{ color: countIsZero ? '#EF4444' : '#1B6EF3' }}>
                {countIsZero ? '0 customers match — adjust your rules' : `${previewCount} customers match`}
              </span>
            )}
            {!previewLoading && previewCount === null && !rulesValid && rules.length > 0 && (
              <span className="text-xs" style={{ color: '#94A3B8' }}>Fill in all rule values to preview</span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-xs" style={{ color: '#94A3B8' }}>
            <Sparkles size={11} />
            AI will generate a segment description automatically on save.
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4" style={{ borderTop: '1px solid #E2E8F0' }}>
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg" style={{ color: '#64748B' }}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-medium disabled:opacity-40"
            style={{ background: '#1B6EF3', color: '#fff' }}
          >
            {saving
              ? <><Loader2 size={14} className="animate-spin" /> Generating description…</>
              : 'Save Segment'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Segments page ────────────────────────────────────────────────────────────
export default function Segments() {
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null)
  const queryClient = useQueryClient()

  const { data: segments, isLoading } = useQuery({
    queryKey: ['segments'],
    queryFn: getSegments,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteSegment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['segments'] }),
  })

  const list: Segment[] = segments || []
  const defaults = list.filter(s => s.isDefault)
  const custom = list.filter(s => !s.isDefault)

  return (
    <div className="p-7 w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: '#0F172A' }}>Segments</h1>
          <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>
            {defaults.length} default · {custom.length} custom
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-medium"
          style={{ background: '#1B6EF3', color: '#fff' }}
        >
          <Plus size={15} /> New Segment
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin" size={20} style={{ color: '#1B6EF3' }} />
        </div>
      ) : (
        <>
          {defaults.length > 0 && (
            <div className="mb-8">
              <div className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: '#94A3B8' }}>
                Default Segments
              </div>
              <div className="grid grid-cols-3 gap-4">
                {defaults.map(seg => (
                  <SegmentCard
                    key={seg.id}
                    segment={seg}
                    onClick={() => setSelectedSegment(seg)}
                    onDelete={id => deleteMutation.mutateAsync(id)}
                  />
                ))}
              </div>
            </div>
          )}

          {custom.length > 0 && (
            <div>
              <div className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: '#94A3B8' }}>
                Custom Segments
              </div>
              <div className="grid grid-cols-3 gap-4">
                {custom.map(seg => (
                  <SegmentCard
                    key={seg.id}
                    segment={seg}
                    onClick={() => setSelectedSegment(seg)}
                    onDelete={id => deleteMutation.mutateAsync(id)}
                  />
                ))}
              </div>
            </div>
          )}

          {list.length === 0 && (
            <div className="rounded-lg p-14 text-center" style={{ border: '2px dashed #E2E8F0' }}>
              <Users size={32} className="mx-auto mb-3" style={{ color: '#CBD5E1' }} />
              <p className="text-sm" style={{ color: '#94A3B8' }}>No segments yet.</p>
            </div>
          )}
        </>
      )}

      {modalOpen && <NewSegmentModal onClose={() => setModalOpen(false)} />}
      {selectedSegment && (
        <SegmentDialog segment={selectedSegment} onClose={() => setSelectedSegment(null)} />
      )}
    </div>
  )
}