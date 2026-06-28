// Web-Push-Client: Berechtigung anfragen, Push abonnieren, Abo + "live"-Meldung ans Backend.
// Echte Push (auch bei geschlossener App) braucht zusaetzlich den Sende-Dienst (sender/)
// und die VAPID-Schluessel. Ohne Konfiguration ist alles ein No-op (Demo bleibt nutzbar).
const API = import.meta.env.VITE_DATA_API
const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    Boolean(API) &&
    Boolean(VAPID)
  )
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  if (!pushSupported()) return 'unsupported'
  return Notification.permission
}

function urlB64ToUint8(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

async function post(op: object): Promise<void> {
  if (!API) return
  await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(op) })
}

/** Berechtigung anfragen, Push abonnieren und das Abo dem Backend melden. */
export async function enablePush(rider: string): Promise<'granted' | 'denied' | 'unsupported'> {
  if (!pushSupported()) return 'unsupported'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return 'denied'
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(VAPID!) as BufferSource })
  await post({ op: 'subscribe', rider, sub: sub.toJSON() })
  return 'granted'
}

/** Meldet dem Backend: <rider> ist live -> Push an die anderen Abonnenten. */
export async function announceLive(rider: string): Promise<void> {
  if (!pushSupported() || Notification.permission !== 'granted') return
  try {
    // Abo auffrischen, falls der Browser es rotiert hat
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) await post({ op: 'subscribe', rider, sub: sub.toJSON() })
  } catch { /* ignore */ }
  try { await post({ op: 'announce', rider }) } catch { /* ignore */ }
}
