// Web-Push-Sende-Dienst (stateless). Wird vom Apps-Script-Backend bei "<rider> ist live"
// aufgerufen und verschickt die Benachrichtigung an alle uebergebenen Abos.
// Deploy: Vercel (api/-Funktion wird automatisch erkannt). Env-Variablen siehe README.
const webpush = require('web-push')

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:markus.baechler.ch@gmail.com',
  process.env.VAPID_PUBLIC,
  process.env.VAPID_PRIVATE,
)

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch (e) { body = {} } }
  if (!body || !process.env.SENDER_SECRET || body.secret !== process.env.SENDER_SECRET) {
    return res.status(401).json({ error: 'bad secret' })
  }

  const subs = Array.isArray(body.subscriptions) ? body.subscriptions : []
  const payload = JSON.stringify(body.notification || {})
  let sent = 0
  const expired = []

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, payload)
        sent++
      } catch (e) {
        // 404/410 = Abo abgelaufen -> dem Aufrufer melden, damit es entfernt wird
        if (e && (e.statusCode === 404 || e.statusCode === 410) && sub && sub.endpoint) expired.push(sub.endpoint)
      }
    }),
  )

  return res.status(200).json({ ok: true, sent, expired })
}
