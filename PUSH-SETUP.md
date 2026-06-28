# Push-Benachrichtigungen einrichten (Live)

Damit eine Push ankommt **auch wenn die App geschlossen ist**, braucht es drei Teile:
die App (schon gebaut), das Apps-Script-Backend (speichert Abos + stösst Push an) und
einen kleinen **Sende-Dienst** (`sender/`), der die eigentliche Web-Push verschlüsselt
versendet (das kann Apps Script nicht).

```
App  --subscribe/announce-->  Apps Script  --POST-->  Sende-Dienst (web-push)  --Push-->  Geräte
```

## 1 · VAPID-Schlüssel
Ein P-256-Schlüsselpaar identifiziert den Absender.
- **Öffentlicher Schlüssel** (kommt in die App + Doku, ist nicht geheim):
  `BBfc5rZJJxCEyycJ9-5eNTFq5USq7Ccf5bgMsd1R5bQUhonm2dgQv-SCKjfpp0fJZ2Dr7aHUQ66f3Cu5pr6ZFiQ`
- **Privater Schlüssel**: bekommst du von mir im Chat — **niemals committen**, nur als
  Env-Variable im Sende-Dienst setzen.

(Neu erzeugen ginge mit `npx web-push generate-vapid-keys`.)

## 2 · Sende-Dienst deployen (Vercel, kostenlos)
1. Ordner `sender/` zu Vercel deployen (eigenes Projekt; Root = `sender/`).
   Vercel erkennt `api/notify.js` automatisch als Funktion.
2. Unter **Project → Settings → Environment Variables** setzen:
   - `VAPID_PUBLIC`  = der öffentliche Schlüssel (oben)
   - `VAPID_PRIVATE` = der private Schlüssel (aus dem Chat)
   - `VAPID_SUBJECT` = `mailto:markus.baechler.ch@gmail.com`
   - `SENDER_SECRET` = ein selbst gewähltes Geheimnis (zufällige Zeichenkette)
3. Deploy → die Funktions-URL lautet `https://<projekt>.vercel.app/api/notify`.

(Netlify-Alternative: `sender/api/notify.js` als Function, gleiche Env-Variablen.)

## 3 · Apps Script aktualisieren
1. Im Apps-Script-Projekt den Inhalt von `apps-script/Code.gs` ersetzen (neue Version
   mit `subscribe` + `announce`) → speichern.
2. **Projekt-Einstellungen → Skripteigenschaften** setzen:
   - `SENDER_URL`    = die Vercel-URL aus Schritt 2 (`…/api/notify`)
   - `SENDER_SECRET` = **dasselbe** Geheimnis wie im Sende-Dienst
   - `APP_URL`       = `https://markusbaechler.github.io/onTour/`  (optional)
3. **Bereitstellen → Bereitstellungen verwalten → ✏️ → Neue Version → Bereitstellen.**
   So bleibt die `…/exec`-URL gleich (kein neues `VITE_DATA_API` nötig).

## 4 · App-Build mit öffentlichem Schlüssel
GitHub-Secret `VITE_VAPID_PUBLIC_KEY` = der öffentliche Schlüssel, dann neu deployen.
→ Das übernehme ich (`gh secret set …` + Deploy), sobald Schritt 2–3 stehen.

## 5 · Testen
1. Auf dem Gerät die App öffnen → **Live → „Benachrichtigen, wenn jemand live geht" →
   einschalten** → im Browser erlauben.
2. Anderes Gerät: App öffnen / Standort teilen (geht „live").
3. Erstes Gerät bekommt die Push „… ist jetzt live unterwegs" — auch bei geschlossener App.

### Wichtig
- **iPhone:** Web-Push gibt es nur, wenn die App über *Zum Home-Bildschirm* installiert
  ist (iOS 16.4+). Im Safari-Tab kommt keine Push.
- Drosselung: max. 1 „live"-Push pro Fahrer/10 Min (gegen Spam bei Vordergrund-Wechseln).
