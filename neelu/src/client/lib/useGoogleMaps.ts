import { useEffect, useState } from "react"

export type GoogleLatLng = { lat: number; lng: number }

export type GoogleBounds = {
  extend: (point: GoogleLatLng) => void
}

export type GoogleListener = { remove: () => void }

export type GoogleMap = {
  fitBounds: (bounds: GoogleBounds) => void
  setCenter: (point: GoogleLatLng) => void
  setZoom: (zoom: number) => void
}

export type GoogleMarker = {
  setMap: (map: unknown | null) => void
  addListener: (eventName: string, callback: () => void) => GoogleListener
}

export type GooglePolygon = {
  setMap: (map: unknown | null) => void
  addListener: (eventName: string, callback: () => void) => GoogleListener
}

export type GoogleMaps = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMap
  LatLngBounds: new () => GoogleBounds
  Marker: new (options: Record<string, unknown>) => GoogleMarker
  Polygon: new (options: Record<string, unknown>) => GooglePolygon
}

type GoogleWindow = Window & { google?: { maps?: GoogleMaps } }

let googleMapsPromise: Promise<GoogleMaps> | null = null

function currentGoogleMaps(): GoogleMaps | undefined {
  return (window as GoogleWindow).google?.maps
}

function injectGoogleMaps(apiKey: string): Promise<GoogleMaps> {
  const existing = currentGoogleMaps()
  if (existing) return Promise.resolve(existing)
  if (googleMapsPromise) return googleMapsPromise

  googleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`
    script.async = true
    script.defer = true
    script.onload = () => {
      const maps = currentGoogleMaps()
      if (maps) {
        resolve(maps)
        return
      }
      reject(new Error("Google Maps did not initialize"))
    }
    script.onerror = () => reject(new Error("Google Maps script failed"))
    document.head.appendChild(script)
  })

  return googleMapsPromise
}

export function useGoogleMaps(apiKey: string | null | undefined) {
  const [maps, setMaps] = useState<GoogleMaps | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">(
    apiKey ? "loading" : "missing"
  )

  useEffect(() => {
    let active = true
    if (!apiKey) {
      setMaps(null)
      setStatus("missing")
      return () => {
        active = false
      }
    }

    setStatus("loading")
    injectGoogleMaps(apiKey)
      .then((loadedMaps) => {
        if (!active) return
        setMaps(loadedMaps)
        setStatus("ready")
      })
      .catch(() => {
        if (!active) return
        setMaps(null)
        setStatus("error")
      })

    return () => {
      active = false
    }
  }, [apiKey])

  return { maps, status }
}
