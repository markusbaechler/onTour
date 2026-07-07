import { useEffect, useRef, useState } from 'react'
import { Nav, type Tab } from './components/Nav'
import { Overview } from './views/Overview'
import { Stages } from './views/Stages'
import { SollIst } from './views/SollIst'
import { Photobook } from './views/Photobook'
import { Live } from './views/Live'
import { IdentityPicker } from './components/IdentityPicker'
import { OfflineBanner } from './components/OfflineBanner'
import { Toaster } from './components/Toaster'
import { Hero } from './components/Hero'
import { useStore } from './lib/store'
import { useViewer } from './lib/viewer'
import { useGeoShare, useAutoShare } from './lib/geo'
import { announceLive } from './lib/push'
import { useStageStats } from './lib/passes'
import { trip } from './data/trip'

const PASSWORD = import.meta.env.VITE_TRIP_PASSWORD

export default function App() {
  const [tab, setTab] = useState<Tab>('overview')
  const [openStage, setOpenStage] = useState<string | undefined>()
  const [showHero, setShowHero] = useState(() => { try { return sessionStorage.getItem('hero-seen') !== '1' } catch { return true } })
  const [unlocked, setUnlocked] = useState(() => !PASSWORD || sessionStorage.getItem('alpes-ok') === '1')
  const store = useStore()
  const viewer = useViewer()
  const [autoShare, setAutoShare] = useAutoShare()
  const geo = useGeoShare(store.setLocation, { riderName: viewer.name, autoShare })
  const base = import.meta.env.BASE_URL
  const stageStats = useStageStats(base, store.actuals)

  // Beim Live-gehen (Wechsel auf "teilt jetzt") die anderen per Push benachrichtigen.
  // Das Backend drosselt, damit Vordergrund-Wechsel nicht mehrfach pingen.
  const prevSharing = useRef(false)
  useEffect(() => {
    if (geo.sharing && !prevSharing.current && viewer.name) announceLive(viewer.name)
    prevSharing.current = geo.sharing
  }, [geo.sharing, viewer.name])

  if (!unlocked) return <Gate onUnlock={() => setUnlocked(true)} />

  // Identitaet noch nicht gewaehlt -> einmaliger Erststart-Picker (blockierend).
  if (!viewer.name) return <IdentityPicker onPick={viewer.setName} />

  function openStageInStages(id: string) {
    setOpenStage(id)
    setTab('stages')
  }

  const heroReady = trip.stages.every((s) => stageStats[s.id])
  const heroKm = heroReady ? trip.stages.reduce((a, s) => a + stageStats[s.id].km, 0) : trip.stages.reduce((a, s) => a + s.plannedKm, 0)
  const heroPasses = heroReady ? trip.stages.reduce((a, s) => a + stageStats[s.id].passes.length, 0) : trip.stages.reduce((a, s) => a + s.cols.length, 0)

  return (
    <>
    <div className="shell">
      <OfflineBanner />
      {tab === 'overview' && <Overview actuals={store.actuals} stats={stageStats} live={store.live} onOpenStage={openStageInStages} onGoLive={() => setTab('live')} viewerName={viewer.name} onChangeName={viewer.setName} />}
      {tab === 'stages' && <Stages actuals={store.actuals} stats={stageStats} openStage={openStage} onUpsert={store.upsertActual} base={base} />}
      {tab === 'sollist' && <SollIst actuals={store.actuals} stats={stageStats} onUpsert={store.upsertActual} />}
      {tab === 'photos' && (
        <Photobook
          photos={store.photos}
          comments={store.comments}
          reactions={store.reactions}
          viewerName={viewer.name}
          loading={store.loading}
          error={store.error}
          onRetry={store.reload}
          onAdd={store.addPhoto}
          onAddLocal={store.addPhotoLocal}
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
          autoShare={autoShare}
          onAutoShareChange={setAutoShare}
          onChangeName={viewer.setName}
        />
      )}
      <Nav tab={tab} onChange={(t) => { setOpenStage(undefined); setTab(t) }} />
      <Toaster />
    </div>
    {showHero && (
      <Hero
        base={base}
        title={trip.title}
        subtitle={trip.subtitle}
        days={trip.stages.length}
        km={heroKm}
        passes={heroPasses}
        riders={trip.riders}
        onEnter={() => { setShowHero(false); window.scrollTo(0, 0) }}
      />
    )}
    </>
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
