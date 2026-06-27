/**
 * Alpes – Tour des Cols · Daten-Mini-API
 * --------------------------------------
 * Speichert den gemeinsamen Stand (Soll-Ist + Foto-Index) als ein JSON-Dokument.
 * Kein Spreadsheet noetig – nutzt die ScriptProperties als Key-Value-Speicher.
 *
 * Setup:
 * 1. script.google.com -> Neues Projekt -> diesen Code einfuegen.
 * 2. Deploy -> Neue Bereitstellung -> Typ "Web-App".
 *    - Ausfuehren als: Ich
 *    - Zugriff: "Jeder" (damit die App ohne Login lesen/schreiben kann)
 * 3. Web-App-URL kopieren -> in .env als VITE_DATA_API eintragen.
 *
 * Hinweis: Der Client sendet POST als text/plain, um den CORS-Preflight zu
 * vermeiden. Apps Script setzt selbst keine CORS-Header, liefert die Antwort
 * aber so aus, dass einfache Requests durchgehen.
 */

const KEY = 'store'

function _store() {
  return PropertiesService.getScriptProperties()
}

function doGet() {
  const raw = _store().getProperty(KEY) || '{"actuals":[],"photos":[]}'
  return ContentService.createTextOutput(raw).setMimeType(ContentService.MimeType.JSON)
}

function doPost(e) {
  try {
    const body = e.postData && e.postData.contents ? e.postData.contents : '{}'
    JSON.parse(body) // Validierung
    _store().setProperty(KEY, body)
    return ContentService.createTextOutput('{"ok":true}').setMimeType(ContentService.MimeType.JSON)
  } catch (err) {
    return ContentService.createTextOutput('{"ok":false}').setMimeType(ContentService.MimeType.JSON)
  }
}
