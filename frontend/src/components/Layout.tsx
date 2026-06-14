import { useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, Megaphone, Users, ChevronLeft, ChevronRight } from 'lucide-react'


const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { to: '/segments', label: 'Segments', icon: Users },
]

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#F4F6FA' }}>

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <aside
        style={{
          width: collapsed ? 56 : 220,
          flexShrink: 0,
          background: '#ffffff',
          borderRight: '1px solid #E8ECF2',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Brand */}
        <div style={{
          padding: collapsed ? '18px 0' : '18px 20px',
          borderBottom: '1px solid #F0F2F7',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          justifyContent: collapsed ? 'center' : 'flex-start',
          transition: 'padding 0.22s',
          minHeight: 64,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10, flexShrink: 0,
            background: 'linear-gradient(135deg, #1B6EF3 0%, #3B82F6 100%)',
            boxShadow: '0 2px 8px rgba(27,110,243,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 800, color: '#fff',
          }}>A</div>

          {/* Text fades out when collapsed */}
          <div style={{
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            opacity: collapsed ? 0 : 1,
            width: collapsed ? 0 : 'auto',
            transition: 'opacity 0.15s, width 0.22s',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', lineHeight: 1.3 }}>Aria CRM</div>
            <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 500 }}>Fashion Retail · Xeno</div>
          </div>
        </div>

        {/* Nav label */}
        {!collapsed && (
          <div style={{ padding: '16px 20px 6px' }}>
            <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#CBD5E1' }}>
              Menu
            </span>
          </div>
        )}

        {/* Nav links */}
        <nav style={{ flex: 1, padding: collapsed ? '8px 6px' : '8px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {nav.map(({ to, label, icon: Icon, end }) => (
            <div key={to} style={{ position: 'relative' }} className="xeno-nav-item">
              <NavLink
                to={to}
                end={end}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: collapsed ? 0 : 9,
                  padding: collapsed ? '9px 0' : '9px 10px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  borderRadius: 10,
                  textDecoration: 'none',
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? '#1B6EF3' : '#64748B',
                  background: isActive ? 'rgba(27,110,243,0.08)' : 'transparent',
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  position: 'relative',
                })}
              >
                {({ isActive }) => (
                  <>
                    <span style={{
                      width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isActive ? 'rgba(27,110,243,0.12)' : 'transparent',
                      color: isActive ? '#1B6EF3' : '#94A3B8',
                      transition: 'background 0.15s',
                    }}>
                      <Icon size={15} />
                    </span>

                    <span style={{
                      opacity: collapsed ? 0 : 1,
                      width: collapsed ? 0 : 'auto',
                      overflow: 'hidden',
                      transition: 'opacity 0.12s, width 0.22s',
                      flex: 1,
                    }}>
                      {label}
                    </span>

                    {isActive && !collapsed && (
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: '#1B6EF3', flexShrink: 0,
                      }} />
                    )}
                  </>
                )}
              </NavLink>

              {/* Tooltip when collapsed */}
              {collapsed && (
                <div className="xeno-tooltip" style={{
                  position: 'absolute', left: '110%', top: '50%', transform: 'translateY(-50%)',
                  background: '#1E293B', color: '#fff', fontSize: 11, fontWeight: 600,
                  padding: '5px 10px', borderRadius: 7, whiteSpace: 'nowrap',
                  pointerEvents: 'none', zIndex: 50,
                  opacity: 0, transition: 'opacity 0.12s',
                }}>
                  {label}
                  {/* Arrow */}
                  <span style={{
                    position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%)',
                    borderWidth: 5, borderStyle: 'solid',
                    borderColor: 'transparent #1E293B transparent transparent',
                    display: 'block', width: 0, height: 0,
                  }} />
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{
            margin: collapsed ? '0 auto 16px' : '0 10px 16px',
            width: collapsed ? 36 : '100%',
            display: 'flex', alignItems: 'center',
            gap: 8, padding: '8px 10px',
            borderRadius: 10, border: '1px solid #E8ECF2',
            background: '#F8FAFC', cursor: 'pointer',
            color: '#94A3B8', fontSize: 11, fontWeight: 600,
            justifyContent: collapsed ? 'center' : 'flex-start',
            transition: 'all 0.22s',
          }}
        >
          {collapsed
            ? <ChevronRight size={14} />
            : <><ChevronLeft size={14} /><span>Collapse</span></>
          }
        </button>

        {/* Footer */}
        {!collapsed && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid #F0F2F7' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                padding: '2px 6px', borderRadius: 4, background: '#F1F5F9', color: '#94A3B8',
              }}>v1.0</span>
              <span style={{ fontSize: 10, color: '#CBD5E1' }}>Xeno Mini CRM</span>
            </div>
          </div>
        )}
      </aside>

      {/* Tooltip hover CSS */}
      <style>{`
        .xeno-nav-item:hover .xeno-tooltip { opacity: 1 !important; }
      `}</style>

      {/* ── Main ──────────────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto" style={{ background: '#F4F6FA', minWidth: 0 }}>
        <Outlet />
      </main>
    </div>
  )
}