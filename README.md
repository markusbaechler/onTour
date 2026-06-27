# Alpes – Tour des Cols

Page **und** installierbare PWA für eine einwöchige Motorradtour durch die französischen Alpen.
Für **3 Fahrer** und die **Daheimgebliebenen**. Dunkles Cockpit-Design, Col-Schild als Signature.

**Features:** Gesamtübersicht · Etappen (Soll) mit Roadbook-GPX · Soll-Ist (auch per gefahrenem GPX) ·
Fotobuch mit Upload aller Fahrer · **Kommentare + Emoji-Reaktionen** je Foto · **Live-Standort ("last seen")** der Fahrer.

## Stack & Architektur

| Zweck | Lösung | Free-Tier |
|---|---|---|
| Frontend / PWA | Vite + React + TypeScript | – |
| Karte | Leaflet + CARTO dark_all | gratis |
| Foto-Bytes | Cloudinary (unsigned upload) | 25 GB |
| Daten (Soll-Ist, Fotos-Index, Kommentare, Standort) | Google Apps Script, **operationsbasiert mit LockService** | gratis, kein Pause |
| Hosting | GitHub Pages + Actions | gratis |

Prinzip: **Cloudinary = Bytes, Apps Script = Metadaten.** Kein Supabase/Firebase/Cloudflare.
Mehrere gleichzeitige Schreibende (Fahrer-Pings, Kommentare) → Apps Script merged `data`-Operationen unter Lock;
Standort liegt in eigenen Keys `loc:<fahrer>`.

## Schnellstart (Demo, ohne Account)

```bash
npm install && npm run dev
```

Läuft sofort mit Seed-Daten; alles (inkl. Kommentare/Standort) wird im Demo-Modus in `localStorage` gespiegelt.

## Scharfschalten

`.env.example` → `.env`.

1. **Cloudinary** (Fotos): Account → Settings → Upload → Add upload preset → *Unsigned*.
   → `VITE_CLOUDINARY_CLOUD`, `VITE_CLOUDINARY_PRESET`.
2. **Apps Script** (Daten): `apps-script/Code.gs` in script.google.com einfügen → Bereitstellen → Web-App
   (*Ausführen als:* Ich · *Zugriff:* Jeder) → URL als `VITE_DATA_API`.
3. Optional Passwort: `VITE_TRIP_PASSWORD`.

## Datenmodell

`data` = `{ actuals, photos, comments, reactions }` (über Operationen, siehe `src/lib/dataApi.ts`).
`loc:<fahrer>` = letzter Standort. Typen in `src/types.ts`.

## Deploy auf GitHub Pages

`base` in `vite.config.ts` = `/<repo-name>/`. Pages-Source = GitHub Actions.
Env-Secrets im Repo hinterlegen. Push auf `main` → `.github/workflows/deploy.yml` baut & deployt.
Anderer Host (Netlify/Vercel): `npm run build`, `dist/` hochladen, `VITE_BASE=/`.

## Eigene Tour

Route in `src/data/trip.ts`. Echte Roadbooks als GPX nach `public/roadbooks/`. Mitgelieferte GPX sind Platzhalter.

## Mockups

Visuelle Referenz in `design/` (alle Screens + Navi-Splitscreen + Live-Karte + Kommentare). Siehe `HANDOFF.md`.

## Grenzen

Live-Standort = **"last seen"**, kein Hintergrund-GPS (PWA/iOS): aktualisiert nur bei offener App.
Cloudinary Free 25 GB. Apps Script: Tageskontingent begrenzt → Standort-Pings gedrosselt (≥30 s / >50 m), Betrachter pollen 30–60 s.
