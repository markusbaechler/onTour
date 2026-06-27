interface P { size?: number }

const S = ({ size = 24, children }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

export const IcDashboard = (p: P) => (<S {...p}><path d="M3 13a9 9 0 0 1 18 0" /><path d="M12 13l4-3" /><circle cx="12" cy="13" r="1.5" /></S>)
export const IcMap = (p: P) => (<S {...p}><path d="M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2Z" /><path d="M9 4v14M15 6v14" /></S>)
export const IcCompare = (p: P) => (<S {...p}><path d="M7 4v16M17 4v16" /><path d="M7 8l-3 3 3 3M17 16l3-3-3-3" /></S>)
export const IcCamera = (p: P) => (<S {...p}><path d="M4 8h3l1.5-2h7L17 8h3v11H4Z" /><circle cx="12" cy="13" r="3.2" /></S>)
export const IcDownload = (p: P) => (<S {...p}><path d="M12 4v10m0 0 4-4m-4 4-4-4" /><path d="M5 19h14" /></S>)
export const IcUpload = (p: P) => (<S {...p}><path d="M12 20V10m0 0 4 4m-4-4-4 4" /><path d="M5 5h14" /></S>)
export const IcCheck = (p: P) => (<S {...p}><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" /></S>)
export const IcCircle = (p: P) => (<S {...p}><circle cx="12" cy="12" r="9" /></S>)
export const IcRoute = (p: P) => (<S {...p}><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="6" r="2.5" /><path d="M8.5 18H14a3.5 3.5 0 0 0 0-7H10a3.5 3.5 0 0 1 0-7h5.5" /></S>)
export const IcX = (p: P) => (<S {...p}><path d="M6 6l12 12M18 6 6 18" /></S>)
export const IcMountain = (p: P) => (<S {...p}><path d="m4 18 5-9 3 5 2-3 6 7Z" /></S>)
export const IcUser = (p: P) => (<S {...p}><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></S>)
