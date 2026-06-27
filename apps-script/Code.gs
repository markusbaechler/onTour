/**
 * Alpes – Tour des Cols · Daten-API (operationsbasiert)
 * -----------------------------------------------------
 * Hält den gemeinsamen Stand in ScriptProperties:
 *   'data'        -> { actuals, photos, comments, reactions }
 *   'loc:<rider>' -> { rider, lat, lng, at, ... }   (ein Key pro Fahrer)
 *
 * Mehrere Schreibende (Fahrer-Pings, Kommentare) -> 'data'-Operationen
 * mergen serverseitig unter LockService. Standort-Pings schreiben ihren
 * eigenen Key und brauchen keinen Lock.
 *
 * Setup: script.google.com -> Code einfügen -> Bereitstellen -> Web-App
 *   Ausführen als: Ich · Zugriff: Jeder -> URL als VITE_DATA_API in .env.
 * Client sendet POST als text/plain (vermeidet CORS-Preflight).
 */

function _props() { return PropertiesService.getScriptProperties() }
function _json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON) }
function _data() {
  var raw = _props().getProperty('data')
  return raw ? JSON.parse(raw) : { actuals: [], photos: [], comments: [], reactions: [] }
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

  // Standort: eigener Key pro Fahrer, kein Lock nötig
  if (op === 'setLocation') {
    if (!body.rider) return _json({ ok: false })
    _props().setProperty('loc:' + body.rider, JSON.stringify({
      rider: body.rider, lat: body.lat, lng: body.lng,
      at: new Date().toISOString(), accuracy: body.accuracy, speed: body.speed, heading: body.heading
    }))
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
    _props().setProperty('data', JSON.stringify(d))
    return _json({ ok: true })
  } finally {
    lock.releaseLock()
  }
}
