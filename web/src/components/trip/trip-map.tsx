"use client"

import { useEffect, useMemo } from "react"
import L from "leaflet"
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, ZoomControl, useMap } from "react-leaflet"
import "leaflet/dist/leaflet.css"

import { kindMeta } from "./meta"

export interface MapPoint {
  id: string
  lat: number
  lon: number
  label: string
  kind: string
  title: string
}

// Standard OpenStreetMap tiles: free and keyless for light use (softened via .leaflet-tile-pane in globals.css).
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

const BED_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/><path d="M12 4v6"/><path d="M2 18h20"/></svg>'

function pinIcon(label: string, color: string, active: boolean) {
  return L.divIcon({
    className: "",
    html: `<div class="wm-pin${active ? " wm-pin-active" : ""}" style="--pin:${color}"><span>${label}</span></div>`,
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    tooltipAnchor: [0, -40],
  })
}

const stayIcon = L.divIcon({ className: "", html: `<div class="wm-stay">${BED_SVG}</div>`, iconSize: [32, 32], iconAnchor: [16, 16] })

function FitToStops({ points, stay, center }: { points: MapPoint[]; stay?: { lat: number; lon: number } | null; center: { lat: number; lon: number } }) {
  const map = useMap()
  useEffect(() => {
    const all: [number, number][] = [...points.map((p) => [p.lat, p.lon] as [number, number]), ...(stay ? [[stay.lat, stay.lon] as [number, number]] : [])]
    // The map may mount inside a drawer or a sticky panel that is still sizing itself.
    map.invalidateSize()
    if (all.length === 0) map.setView([center.lat, center.lon], 12)
    else if (all.length === 1) map.setView(all[0], 14)
    else map.fitBounds(L.latLngBounds(all), { padding: [48, 48], maxZoom: 15 })
  }, [map, points, stay, center.lat, center.lon])
  return null
}

function FollowActive({ points, activeId }: { points: MapPoint[]; activeId?: string | null }) {
  const map = useMap()
  useEffect(() => {
    const p = points.find((x) => x.id === activeId)
    if (p) map.panTo([p.lat, p.lon], { animate: true })
  }, [map, points, activeId])
  return null
}

export default function TripMap({
  points,
  stay,
  center,
  activeId,
  onSelect,
}: {
  points: MapPoint[]
  stay?: { lat: number; lon: number; name: string } | null
  center: { lat: number; lon: number }
  activeId?: string | null
  onSelect?: (id: string) => void
}) {
  const route = useMemo(() => points.map((p) => [p.lat, p.lon] as [number, number]), [points])

  return (
    <MapContainer center={[center.lat, center.lon]} zoom={12} zoomControl={false} scrollWheelZoom={false} className="size-full" style={{ background: "var(--sand)" }}>
      <TileLayer url={TILES} attribution={ATTRIBUTION} maxZoom={19} />
      <ZoomControl position="topright" />
      <FitToStops points={points} stay={stay} center={center} />
      <FollowActive points={points} activeId={activeId} />
      {route.length > 1 && (
        <>
          <Polyline positions={route} pathOptions={{ color: "#ffffff", weight: 7, opacity: 0.9 }} />
          <Polyline positions={route} pathOptions={{ color: "#0E7C86", weight: 3, dashArray: "6 9", lineCap: "round" }} />
        </>
      )}
      {stay && (
        <Marker position={[stay.lat, stay.lon]} icon={stayIcon}>
          <Tooltip direction="top" offset={[0, -14]}>{stay.name}</Tooltip>
        </Marker>
      )}
      {points.map((p) => {
        const active = p.id === activeId
        return (
          <Marker
            key={`${p.id}-${active ? "on" : "off"}`}
            position={[p.lat, p.lon]}
            icon={pinIcon(p.label, kindMeta(p.kind).color, active)}
            zIndexOffset={active ? 1000 : 0}
            eventHandlers={{ click: () => onSelect?.(p.id) }}
          >
            <Tooltip direction="top" permanent={active}>
              {p.title}
            </Tooltip>
          </Marker>
        )
      })}
    </MapContainer>
  )
}
