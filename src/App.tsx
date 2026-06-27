import { useState } from 'react'
import { Nav, type Tab } from './components/Nav'
import { Overview } from './views/Overview'
import { Stages } from './views/Stages'
import { SollIst } from './views/SollIst'
import { Photobook } from './views/Photobook'
import { Live } from './views/Live'
import { IdentityPicker } from './components/IdentityPicker'
import { useStore } from './lib/store'
import { useViewer } from './lib/viewer'
import { useGeoShare } from './lib/geo'
import { trip } from './data/trip'

const PASSWORD = import.meta.env.VITE_TRIP_PASSWORD

export default function App() {
  const [tab, setTab] = useState<Tab>('overview')
  const [openStage, setOpenStage] = useState<string | undefined>()
  const [unlocked, setUnlocked] = useState(() => !PASSWORD || sessionStorage.getItem('alpes-ok') === '1')
  const store = useStore()
  const viewer = useViewer()
  const geo = useGeoShare(store.setLocation)
  const base = import.meta.env.BASE_URL

  if (!unlocked) return <Gate onUnlock={() => setUnlocked(true)} />

  // Identitaet noch nicht gewaehlt -> einmaliger Erststart-Picker (blockierend).
  if (!viewer.name) return <IdentityPicker onPick={viewer.setName} />

  function openStageInStages(id: string) {
    setOpenStage(id)
    setTab('stages')
  }

  return (
    <div className="shell">
      {tab === 'overview' && <Overview actuals={store.actuals} onOpenStage={openStageInStages} viewerName={viewer.name} onChangeName={viewer.setName} />}
      {tab === 'stages' && <Stages actuals={store.actuals} openStage={openStage} onUpsert={store.upsertActual} base={base} />}
      {tab === 'sollist' && <SollIst actuals={store.actuals} onUpsert={store.upsertActual} />}
      {tab === 'photos' && (
        <Photobook
          photos={store.photos}
          comments={store.comments}
          reactions={store.reactions}
          viewerName={viewer.name}
          onAdd={store.addPhoto}
          onRemove={store.removePhoto}
          onAddComment={store.addComment}
          onToggleReaction={store.toggleReaction}
          onChangeName={viewer.setName}
        />
      )}
      {tab === 'live' && (
        <Live
          live={store.live}
          viewerName={viewer.name}
          sharing={geo.sharing}
          geoError={geo.error}
          onStartShare={geo.start}
          onStopShare={geo.stop}
          onChangeName={viewer.setName}
        />
      )}
      <Nav tab={tab} onChange={(t) => { setOpenStage(undefined); setTab(t) }} />
    </div>
  )
}

function Gate({ onUnlock }: { onUnlock: () => void }) {
  const [val, setVal] = useState('')
  const [err, setErr] = useState(false)
  function submit() {
    if (val === PASSWORD) {
      sessionStorage.setItem('alpes-ok', '1')
      onUnlock()
    } else setErr(true)
  }
  return (
    <div className="shell">
      <div className="view" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '80vh', gap: 14 }}>
        <span className="eyebrow">{trip.title} · {trip.subtitle}</span>
        <h1 className="h1">Trip-Passwort</h1>
        <input
          autoFocus
          type="password"
          value={val}
          onChange={(e) => { setVal(e.target.value); setErr(false) }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="••••••"
          style={{ background: 'var(--ink-2)', color: 'var(--snow)', border: '0.5px solid var(--slate)', borderRadius: 8, padding: '12px 14px', fontSize: 16 }}
        />
        {err && <span style={{ color: 'var(--bad)', fontSize: 13 }}>Falsches Passwort.</span>}
        <button className="btn" onClick={submit}>Öffnen</button>
      </div>
    </div>
  )
}
