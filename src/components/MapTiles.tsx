import { TileLayer } from 'react-leaflet'

/**
 * Dunkle Karte mit dezentem Hoehenrelief: CARTO dark (ohne Labels) + Esri-Hillshade
 * (soft-light) + Labels obenauf. Macht die Berge sichtbar, bleibt im Cockpit-Dunkel.
 */
export function DarkReliefTiles() {
  return (
    <>
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        maxZoom={19}
      />
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}"
        className="hillshade"
        opacity={0.35}
        maxNativeZoom={14}
        maxZoom={19}
        attribution="Esri"
      />
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
        maxZoom={19}
      />
    </>
  )
}
