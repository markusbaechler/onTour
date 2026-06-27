import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Base-Pfad fuer GitHub Pages: bei Projekt-Sites "/<repo-name>/".
// Per Env ueberschreibbar (z. B. VITE_BASE=/ fuer lokale Domains / Vercel).
const base = process.env.VITE_BASE ?? '/onTour/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Alpes \u2013 Tour des Cols',
        short_name: 'Alpes',
        description: 'Motorradtour durch die franz\u00f6sischen Alpen',
        theme_color: '#0E0D11',
        background_color: '#0E0D11',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // OSM/CARTO-Kacheln offline cachen, damit die Karte unterwegs ohne Netz laedt
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[a-d]\.basemaps\.cartocdn\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 1000, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
})
