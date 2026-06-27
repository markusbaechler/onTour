# Alpes – Tour des Cols

Page **und** installierbare App (PWA) für eine einwöchige Motorradtour durch die französischen Alpen.
Dunkles Cockpit-Design, **Col-Schild** als Signature-Element.

- **Übersicht** der Gesamttour (Distanz, Höhenmeter, Cols, Karte)
- **Etappen (Soll)** mit Roadbook-Download (GPX) je Tag
- **Soll-Ist-Vergleich** – Ist-Werte manuell erfassen oder per **gefahrenem GPX** automatisch (Distanz + Höhenmeter)
- **Fotobuch** entlang der Strecke (Polarsteps-Stil), Upload durch **alle 3 Teilnehmenden**
- **Kostenlos**, installierbar (Home-Bildschirm), offline-fähige Karte

## Stack

| Zweck | Technik | Kosten |
|---|---|---|
| Frontend / PWA | Vite + React + TypeScript | – |
| Karte | Leaflet + CARTO Dark Tiles | gratis |
| Foto-Bytes | **Cloudinary** (unsigned upload) | Free-Tier 25 GB |
| Soll-Ist + Foto-Index | **Google Apps Script** (Mini-API) | gratis, kein Pause |
| Hosting | GitHub Pages + Actions | gratis |

Bewusst **ohne** Supabase/Firebase/Cloudflare: keine zusätzlichen DB-Accounts, kein Inaktivitäts-Pause-Problem.

## Schnellstart (Demo, ohne jeden Account)

```bash
npm install
npm run dev
```

Läuft sofort mit Beispieldaten. Fotos werden im Demo-Modus nur lokal im eigenen Browser gehalten,
Soll-Ist im `localStorage`. Zum echten Teilen → unten scharfschalten.

## Scharfschalten für die 3 Teilnehmenden

`.env.example` nach `.env` kopieren und ausfüllen.

### 1 · Fotos (Cloudinary)

1. Account auf [cloudinary.com](https://cloudinary.com) (Free).
2. **Settings → Upload → Add upload preset** → *Signing Mode:* **Unsigned**. Preset-Name notieren.
3. In `.env`:
   ```
   VITE_CLOUDINARY_CLOUD=dein-cloud-name
   VITE_CLOUDINARY_PRESET=dein-unsigned-preset
   ```

Damit lädt jede:r der drei Fotos direkt aus dem Browser hoch – ohne Server, ohne Login.

### 2 · Daten (Google Apps Script)

1. [script.google.com](https://script.google.com) → **Neues Projekt** → Inhalt von `apps-script/Code.gs` einfügen.
2. **Bereitstellen → Neue Bereitstellung → Web-App**
   - *Ausführen als:* Ich
   - *Zugriff:* **Jeder**
3. Web-App-URL kopieren → `.env`:
   ```
   VITE_DATA_API=https://script.google.com/macros/s/AKfy.../exec
   ```

Soll-Ist und Foto-Index werden so für alle synchron gehalten (Last-Write-Wins, reicht für 3 Leute).

### 3 · Optional: Passwort

```
VITE_TRIP_PASSWORD=euer-geheimnis
```

## Deploy auf GitHub Pages

> **Wichtig:** Der Base-Pfad in `vite.config.ts` muss eurem Repo-Namen entsprechen.
> Default ist `/alpes-tour/`. Heisst euer Repo `alpen-2026`, dann
> `VITE_BASE=/alpen-2026/` setzen (Env) **oder** den Default in `vite.config.ts` ändern.

1. Repo nach GitHub pushen.
2. **Settings → Pages → Source:** *GitHub Actions*.
3. Secrets unter **Settings → Secrets and variables → Actions** anlegen:
   `VITE_CLOUDINARY_CLOUD`, `VITE_CLOUDINARY_PRESET`, `VITE_DATA_API`, ggf. `VITE_TRIP_PASSWORD`.
4. Push auf `main` → der Workflow `.github/workflows/deploy.yml` baut und veröffentlicht.

Alternativ ohne Pages: `npm run build` und `dist/` auf einen beliebigen Static-Host (Netlify, Vercel) legen – dann `VITE_BASE=/`.

## Eigene Tour eintragen

- **Etappen, Cols, Koordinaten:** `src/data/trip.ts`
- **Roadbooks:** echte GPX-Dateien nach `public/roadbooks/` legen (z. B. aus deinem Routenplaner exportiert) und in `trip.ts` als `gpxUrl` referenzieren. Die mitgelieferten Dateien sind Platzhalter.
- Der grobe `track` je Etappe steuert nur die Kartenlinie der Planung; die echte Form kommt aus dem GPX.

## Datenmodell

`Cloudinary = Bytes`, `Apps Script = Metadaten`. Der gemeinsame Stand ist ein JSON:

```ts
{ actuals: Actual[]; photos: Photo[] }
```

Typen in `src/types.ts`. Foto = `{ url, thumbUrl, author, stageId, caption?, createdAt }`.

## Grenzen

- Foto-Sync schreibt den ganzen Stand neu (Last-Write-Wins). Für 3 Leute unkritisch.
- Cloudinary Free: 25 GB – für eine Woche zu dritt mit Auto-Komprimierung reichlich.
- Apps Script: einfache Requests, keine Authentifizierung der Schreibenden (Trip-Passwort schützt nur die UI).
