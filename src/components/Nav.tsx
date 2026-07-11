import { IcDashboard, IcMap, IcCamera, IcBroadcast } from './Icons'

export type Tab = 'overview' | 'stages' | 'photos' | 'live'

const items: { id: Tab; label: string; Icon: (p: { size?: number }) => JSX.Element }[] = [
  { id: 'overview', label: 'Übersicht', Icon: IcDashboard },
  { id: 'stages', label: 'Etappen', Icon: IcMap },
  { id: 'photos', label: 'Fotobuch', Icon: IcCamera },
  { id: 'live', label: 'Live', Icon: IcBroadcast },
]

export function Nav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="nav">
      {items.map(({ id, label, Icon }) => (
        <button key={id} className={tab === id ? 'active' : ''} onClick={() => onChange(id)} aria-current={tab === id}>
          <Icon size={22} />
          {label}
        </button>
      ))}
    </nav>
  )
}
