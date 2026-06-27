# HANDOFF · Alpes – Tour des Cols

Auftrag für **Claude Code**. Ziel: **minimale Produktionszeit.** Startpunkt = dieses Repo (Scaffold, Build verifiziert). Visuelle Referenz = `design/`. Nicht neu scaffolden, nicht neu designen – nur die unten markierten Lücken füllen.

## Entscheidungen (fix – keine Alternativen prüfen)

- Frontend: Vite + React + TypeScript, PWA (`vite-plugin-pwa`). Karte: Leaflet + CARTO `dark_all`.
- Fotos → **Cloudinary** unsigned upload. Daten → **Google Apps Script**, operationsbasiert mit `LockService`.
- **Kein** Supabase/Firebase/Cloudflare. Hosting: GitHub Pages + Actions.
- Live-Standort = **"last seen"** (kein Hintergrund-GPS, kein Traccar). Nur In-App-Sharing, opt-in, gedrosselt.
- Design: dunkles Cockpit, Signature = Col-Schild. Tokens stehen in `src/index.css` – nicht ändern.

## Schon fertig im Scaffold (NICHT neu bauen)

| Bereich | Status |
|---|---|
| 4 Screens (Übersicht, Etappen, Soll-Ist, Fotobuch) + Bottom-Nav | gebaut |
| Karte, GPX-Parser, Roadbook-Download, Gefahren-GPX-Upload (km + hm) | gebaut |
| Cloudinary-Upload (`src/lib/cloudinary.ts`), Demo-Fallback | gebaut |
| **Daten-API operationsbasiert** (`apps-script/Code.gs`, `src/lib/dataApi.ts`) inkl. LockService | gebaut |
| **Store** mit `actuals, photos, comments, reactions, live` + Aktionen `upsertActual / addPhoto / removePhoto / addComment / toggleReaction / setLocation` | gebaut |
| Typen `Comment / Reaction / RiderLocation` | gebaut |
| PWA-Manifest, Service-Worker, GitHub-Actions-Deploy, 7 Roadbook-GPX (Platzhalter) | gebaut |
| Demo-Modus ohne Account (Seed + localStorage spiegelt alle Operationen) | gebaut |

**Die Plumbing für Kommentare und Live-Standort steht bereits.** Es fehlt nur die UI + der Geolocation-Watcher.

## Zu bauen – Phasen (in dieser Reihenfolge, zeitoptimiert)

### P0 · Inbetriebnahme (~0,5 Tag)
`npm i && npm run dev` muss laufen. `.env` aus `.env.example` (Cloudinary-Preset + Apps-Script-URL, Setup unten). `base` in `vite.config.ts` = `/<repo>/`. Deploy testen.

### P1 · Fotobuch-Kommentare + Emoji-Reaktionen (~2 Tage)
Referenz `design/comments-mockup.html`. Im Foto-Lightbox ergänzen:
- Reaktions-Leiste: aggregierte Emojis mit Count + Picker. Tap → `store.toggleReaction(photoId, viewerName, emoji)`.
- Kommentar-Thread + Eingabe (Text mit Emojis) → `store.addComment({ id: crypto.randomUUID(), photoId, author: viewerName, text, createdAt })`.
- **Betrachter-Name:** beim ersten Schreiben abfragen, in `localStorage('alpes-name')`, änderbar. Util dafür anlegen.
- Avatar = Initiale, Farbe aus Name gehasht.

### P2 · Live-Standort "last seen" (~2 Tage)
Referenz `design/live-mockup.html`. Neuer 5. Tab "Live" **oder** Sektion auf Übersicht:
- Karte mit Pin je Fahrer aus `store.live` (`RiderLocation`); frisch < 15 Min = amber "live", sonst grau "zuletzt HH:MM" (`isFresh()` aus `store.ts`). Liste darunter.
- Fahrer-Toggle "Meinen Standort teilen" → `navigator.geolocation.watchPosition`; bei Update `store.setLocation({ rider, lat, lng, speed, heading, accuracy })` **nur alle ≥30 s und bei >50 m Bewegung** (Drossel). Toggle aus / App zu → Stopp.
- `store.live` wird bereits alle 45 s gepollt. Stale-/Privacy-Hinweis anzeigen (siehe Mockup).

### P3 · Reale Tourdaten (~0,5 Tag, jederzeit)
Echte Route in `src/data/trip.ts`, echte Roadbook-GPX nach `public/roadbooks/` (Export aus `markusbaechler/motorbike`). Platzhalter ersetzen.

### P4 · Navigation B+ (OPTIONAL, zuletzt – ~1–1,5 Wochen)
Beeline-Splitscreen mit Strassennamen + Kreisel-Ausfahrt. Referenz `design/nav-mockup.html`. **Erst nach P0–P3.**
- Pipeline (einmalig je Roadbook): GPX → Valhalla Map-Matching `trace_route` (`costing: motorcycle`, `language: de`) → `public/roadbooks/t{N}.cues.json` mit `{ at, type, exit?, text, street?, distFromStart }`. Quelle: gehosteter Valhalla (Stadia Maps Free) oder self-host.
- On-Bike-Player: `watchPosition` → Position auf Track projizieren → nächstes Cue + Distanz-Countdown. Oben MapLibre GL heading-up, unten Manöver-Karte. `navigator.wakeLock`.
- **Kein Live-Reroute:** Abweichung > 50 m → Kompass "zurück zur Route". iOS: nur Vordergrund. Offline = Vektor-Tiles.
- Fallback je Etappe: "In Navi-App öffnen" (GPX-Handoff).

## Daten-API (Referenz)

```
GET  ?scope=data  -> { actuals, photos, comments, reactions }
GET  ?scope=live  -> { '<rider>': RiderLocation, ... }
POST {op:'upsertActual'|'addPhoto'|'removePhoto'|'addComment'|'removeComment'|'addReaction'|'removeReaction', ...}
POST {op:'setLocation', rider, lat, lng, speed?, heading?, accuracy?}   // eigener Key, kein Lock
```
`data`-Ops mergen serverseitig unter Lock. Client + Demo-Fallback in `src/lib/dataApi.ts`.

## Setup (für scharfen Betrieb)

1. **Cloudinary**: Settings → Upload → Unsigned Preset → `VITE_CLOUDINARY_CLOUD`, `VITE_CLOUDINARY_PRESET`.
2. **Apps Script**: `apps-script/Code.gs` → script.google.com → Bereitstellen → Web-App (*Ausführen als:* Ich, *Zugriff:* Jeder) → URL als `VITE_DATA_API`.
3. GitHub Pages: Env als Repo-Secrets; Pages-Source = Actions.

## Speed-Regeln

- Scaffold-Code wiederverwenden; Store/dataApi/Code.gs **nicht** umschreiben – nur konsumieren.
- Design aus `design/` und `src/index.css` übernehmen, nicht neu erfinden.
- P4 nur auf ausdrücklichen Wunsch. Nach jeder Phase: `npm run build` muss grün sein.

## Kickoff-Prompt

> Setze `HANDOFF.md` in diesem Repo um. Starte vom vorhandenen Scaffold (nicht neu scaffolden). Baue P0→P3 in dieser Reihenfolge; P4 nur auf Anweisung. Nutze die fertigen Store-Aktionen (`addComment`, `toggleReaction`, `setLocation`) und das operationsbasierte `dataApi` – nicht umschreiben. Visuelle Vorlagen in `design/` exakt übernehmen, Design-Tokens aus `src/index.css`. Halte den Demo-Modus lauffähig (ohne `.env`). Verifiziere nach jeder Phase mit `npm run build`.
