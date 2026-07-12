/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  // Cloudinary (Foto-Bytes) - unsigned upload
  readonly VITE_CLOUDINARY_CLOUD?: string
  readonly VITE_CLOUDINARY_PRESET?: string
  // Google Apps Script Web-App URL (Mini-API fuer Soll-Ist + Foto-Index)
  readonly VITE_DATA_API?: string
  // Optionales gemeinsames Trip-Passwort (leer = kein Login)
  readonly VITE_TRIP_PASSWORD?: string
  // Web-Push: oeffentlicher VAPID-Schluessel (Privater liegt im Sende-Dienst)
  readonly VITE_VAPID_PUBLIC_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
