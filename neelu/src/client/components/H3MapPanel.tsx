import { useEffect, useRef } from "react"
import { RiMapPinLine } from "@remixicon/react"

import { api } from "@/client/lib/api"
import { cn } from "@/client/lib/utils"
import { useApi } from "@/client/lib/useApi"
import {
  useGoogleMaps,
  type GoogleMap,
  type GoogleMarker,
  type GooglePolygon,
  type GoogleLatLng,
} from "@/client/lib/useGoogleMaps"
import type { H3MapCell } from "@/shared/types"

const QUALITY_COLOR = {
  clean: "#16a34a",
  caution: "#d97706",
  contaminated: "#dc2626",
} as const

function centerOf(cells: H3MapCell[]): GoogleLatLng {
  if (!cells.length) return { lat: 22.5937, lng: 78.9629 }
  const first = cells[0]
  return { lat: first.center.latitude, lng: first.center.longitude }
}

export function H3MapPanel({
  cells,
  className,
  defaultMapType = "roadmap",
  selectedCell,
  onCellSelect,
  mode = "polygons",
}: {
  cells: H3MapCell[]
  className?: string
  defaultMapType?: "roadmap" | "hybrid"
  selectedCell?: string | null
  onCellSelect?: (cell: H3MapCell) => void
  mode?: "polygons" | "pins"
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<GoogleMap | null>(null)
  const polygonsRef = useRef<GooglePolygon[]>([])
  const markersRef = useRef<GoogleMarker[]>([])
  const config = useApi(() => api.clientConfig(), [])
  const { maps, status } = useGoogleMaps(config.data?.googleMapsApiKey)

  useEffect(() => {
    if (!maps || !containerRef.current || mapRef.current) return
    mapRef.current = new maps.Map(containerRef.current, {
      center: centerOf(cells),
      zoom: cells.length ? 7 : 4,
      mapTypeId: defaultMapType,
      disableDefaultUI: true,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      clickableIcons: false,
      gestureHandling: "greedy",
      styles:
        mode === "pins"
          ? undefined
          : [
              {
                featureType: "poi",
                stylers: [{ visibility: "off" }],
              },
              {
                featureType: "transit",
                stylers: [{ visibility: "off" }],
              },
            ],
      })
    // Initialized once. Cell updates are handled in the drawing effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maps, defaultMapType])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !maps) return

    polygonsRef.current.forEach((polygon) => polygon.setMap(null))
    markersRef.current.forEach((marker) => marker.setMap(null))
    polygonsRef.current = []
    markersRef.current = []

    if (mode === "pins") {
      markersRef.current = cells.map((cell) => {
        const marker = new maps.Marker({
          position: {
            lat: cell.center.latitude,
            lng: cell.center.longitude,
          },
          map,
          title: `${cell.districtName} water point`,
          icon: {
            path: "M12 2C8.14 2 5 5.14 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.86-3.14-7-7-7z",
            fillColor: QUALITY_COLOR[cell.quality],
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 1.5,
            scale: selectedCell === cell.h3Cell ? 1.45 : 1.2,
            anchor: { x: 12, y: 22 },
          },
        })
        if (onCellSelect) {
          marker.addListener("click", () => onCellSelect(cell))
        }
        return marker
      })
    } else {
      polygonsRef.current = cells.map((cell) => {
      const selected = selectedCell === cell.h3Cell
      const polygon = new maps.Polygon({
        paths: cell.boundary.map(([lat, lng]) => ({ lat, lng })),
        strokeColor: QUALITY_COLOR[cell.quality],
        strokeOpacity: selected ? 1 : 0.9,
        strokeWeight: selected ? 3 : 1,
        fillColor: QUALITY_COLOR[cell.quality],
        fillOpacity: selected ? 0.58 : defaultMapType === "hybrid" ? 0.28 : 0.42,
        map,
      })
      if (onCellSelect) {
        polygon.addListener("click", () => onCellSelect(cell))
      }
      return polygon
    })
    }

    if (!cells.length) {
      map.setCenter(centerOf(cells))
      map.setZoom(4)
      return
    }

    const bounds = new maps.LatLngBounds()
    cells.slice(0, 80).forEach((cell) => {
      bounds.extend({
        lat: cell.center.latitude,
        lng: cell.center.longitude,
      })
    })
    map.fitBounds(bounds)
  }, [cells, defaultMapType, maps, mode, onCellSelect, selectedCell])

  const showOverlay = status !== "ready"

  return (
    <div
      className={cn(
        "relative min-h-[320px] overflow-hidden rounded-md border bg-muted",
        className
      )}
      aria-label="Google Maps H3 water quality map"
    >
      <div ref={containerRef} className="absolute inset-0" />
      {showOverlay ? (
        <div className="absolute inset-0 grid place-items-center bg-background/80 p-4 text-center backdrop-blur">
          <div className="max-w-sm space-y-2">
            <RiMapPinLine className="mx-auto size-5 text-primary" />
            <p className="text-sm font-medium">
              {status === "missing"
                ? "Google Maps key required"
                : status === "error"
                  ? "Google Maps failed to load"
                  : "Loading Google Maps"}
            </p>
            <p className="text-xs text-muted-foreground">
              Attach `GOOGLE_MAPS_API_KEY` to the Databricks App environment.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
