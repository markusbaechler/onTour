/**
 * bbz Cannonball – Daten-API (operationsbasiert) + Live-Standort + Web-Push
 * ------------------------------------------------------------------------
 * ScriptProperties:
 *   'data'         -> { actuals, photos, comments, reactions }
 *   'loc:<rider>'  -> { rider, lat, lng, at, ... }          (Live-Standort)
 *   'sub:<hash>'   -> { rider, sub }                         (Web-Push-Abo)
 *   'ann:<rider>'  -> <timestamp>                            (Drossel je Fahrer)
 *
 * Setup Web-App: script.google.com -> Bereitstellen -> Web-App
 *   Ausführen als: Ich · Zugriff: JEDER -> URL als VITE_DATA_API.
 * Fuer Push zusaetzlich unter Projekt-Einstellungen -> Skripteigenschaften setzen:
 *   SENDER_URL    = URL des Sende-Dienstes (sender/, /api/notify)
 *   SENDER_SECRET = gemeinsames Geheimnis (gleich wie im Sende-Dienst)
 *   APP_URL       = https://markusbaechler.github.io/onTour/   (optional)
 * Client sendet POST als text/plain (vermeidet CORS-Preflight).
 */

var THROTTLE_MS = 10 * 60 * 1000 // max. 1 "live"-Push je Fahrer / 10 Min

function _props() { return PropertiesService.getScriptProperties() }
function _json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON) }
function _data() {
  var raw = _props().getProperty('data')
  return raw ? JSON.parse(raw) : { actuals: [], photos: [], comments: [], reactions: [] }
}
function _md5(s) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s)
  return d.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2) }).join('')
}

function doGet(e) {
  var scope = (e && e.parameter && e.parameter.scope) || 'data'
  if (scope === 'live') {
    var all = _props().getProperties(), live = {}
    Object.keys(all).forEach(function (k) { if (k.indexOf('loc:') === 0) live[k.slice(4)] = JSON.parse(all[k]) })
    return _json(live)
  }
  return _json(_data())
}

function doPost(e) {
  var body = JSON.parse((e && e.postData && e.postData.contents) || '{}')
  var op = body.op
  var props = _props()

  // Standort: eigener Key pro Fahrer, kein Lock noetig
  if (op === 'setLocation') {
    if (!body.rider) return _json({ ok: false })
    props.setProperty('loc:' + body.rider, JSON.stringify({
      rider: body.rider, lat: body.lat, lng: body.lng,
      at: new Date().toISOString(), accuracy: body.accuracy, speed: body.speed, heading: body.heading
    }))
    return _json({ ok: true })
  }

  // Web-Push-Abo speichern (Key = Hash des Endpoints, ein Eintrag pro Geraet)
  if (op === 'subscribe') {
    if (!body.sub || !body.sub.endpoint) return _json({ ok: false })
    props.setProperty('sub:' + _md5(body.sub.endpoint), JSON.stringify({ rider: body.rider || '', sub: body.sub }))
    return _json({ ok: true })
  }

  // "<rider> ist live" -> Push an alle anderen Abos (gedrosselt, ueber den Sende-Dienst)
  if (op === 'announce') {
    var rider = body.rider || ''
    var now = Date.now()
    var lastRaw = props.getProperty('ann:' + rider)
    if (lastRaw && (now - parseInt(lastRaw, 10)) < THROTTLE_MS) return _json({ ok: true, throttled: true })
    props.setProperty('ann:' + rider, String(now))

    var sender = props.getProperty('SENDER_URL')
    var secret = props.getProperty('SENDER_SECRET')
    if (!sender) return _json({ ok: false, error: 'no SENDER_URL' })

    var all = props.getProperties(), subs = [], keyOf = {}
    Object.keys(all).forEach(function (k) {
      if (k.indexOf('sub:') === 0) {
        var rec = JSON.parse(all[k])
        if (rec.rider !== rider && rec.sub) { subs.push(rec.sub); keyOf[rec.sub.endpoint] = k }
      }
    })
    if (!subs.length) return _json({ ok: true, sent: 0 })

    var appUrl = props.getProperty('APP_URL') || 'https://markusbaechler.github.io/onTour/'
    var payload = {
      secret: secret,
      subscriptions: subs,
      notification: { title: 'Live', body: rider + ' ist jetzt live unterwegs', url: appUrl, tag: 'live-' + rider },
    }
    var resp = UrlFetchApp.fetch(sender, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify(payload), muteHttpExceptions: true,
    })
    // Abgelaufene Abos (410/404) entfernen
    try {
      var res = JSON.parse(resp.getContentText() || '{}')
      if (res.expired && res.expired.length) res.expired.forEach(function (ep) { if (keyOf[ep]) props.deleteProperty(keyOf[ep]) })
    } catch (err) { /* ignore */ }
    return _json({ ok: true })
  }

  // Alle 'data'-Mutationen unter Lock mergen
  var lock = LockService.getScriptLock()
  lock.waitLock(5000)
  try {
    var d = _data()
    switch (op) {
      case 'upsertActual':
        var i = d.actuals.findIndex(function (a) { return a.stageId === body.actual.stageId })
        if (i >= 0) d.actuals[i] = body.actual; else d.actuals.push(body.actual)
        break
      case 'addPhoto': d.photos.unshift(body.photo); break
      case 'removePhoto': d.photos = d.photos.filter(function (p) { return p.id !== body.id }); break
      case 'addComment': d.comments.push(body.comment); break
      case 'removeComment': d.comments = d.comments.filter(function (c) { return c.id !== body.id }); break
      case 'addReaction':
        var dup = d.reactions.some(function (r) { return r.photoId === body.reaction.photoId && r.author === body.reaction.author && r.emoji === body.reaction.emoji })
        if (!dup) d.reactions.push(body.reaction)
        break
      case 'removeReaction':
        d.reactions = d.reactions.filter(function (r) { return !(r.photoId === body.photoId && r.author === body.author && r.emoji === body.emoji) })
        break
      default: return _json({ ok: false, error: 'unknown op' })
    }
    props.setProperty('data', JSON.stringify(d))
    return _json({ ok: true })
  } finally {
    lock.releaseLock()
  }
}
