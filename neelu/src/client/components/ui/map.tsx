import maplibregl, {
  type Map as MapLibreMap,
  type MapOptions,
  type StyleSpecification,
} from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import {
  RiAddLine,
  RiCompass3Line,
  RiLoader4Line,
  RiSubtractLine,
} from "@remixicon/react"

import { Button } from "@/client/components/ui/button"
import { cn } from "@/client/lib/utils"

const CARTO_STYLES = {
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
}

const EMPTY_STYLES: Record<Theme, StyleSpecification> = {
  dark: {
    version: 8,
    sources: {},
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#090c10" },
      },
    ],
  },
  light: {
    version: 8,
    sources: {},
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#f7f7f4" },
      },
    ],
  },
}

type Theme = "light" | "dark"
type MapStyle = string | StyleSpecification

type MapContextValue = {
  map: MapLibreMap | null
  isLoaded: boolean
}

const MapContext = createContext<MapContextValue | null>(null)

export function useMap() {
  const context = useContext(MapContext)
  if (!context) {
    throw new Error("useMap must be used within a Map")
  }
  return context
}

function documentTheme(): Theme | null {
  if (typeof document === "undefined") return null
  if (document.documentElement.classList.contains("dark")) return "dark"
  if (document.documentElement.classList.contains("light")) return "light"
  return null
}

function systemTheme(): Theme {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

function useResolvedTheme(theme?: Theme): Theme {
  const [resolved, setResolved] = useState<Theme>(
    () => documentTheme() ?? systemTheme()
  )

  useEffect(() => {
    if (theme) return
    const observer = new MutationObserver(() => {
      setResolved(documentTheme() ?? systemTheme())
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })
    return () => observer.disconnect()
  }, [theme])

  return theme ?? resolved
}

export type MapRef = MapLibreMap

export type MapProps = {
  children?: ReactNode
  className?: string
  theme?: Theme
  useEmptyStyle?: boolean
  styles?: Partial<Record<Theme, MapStyle>>
  loading?: boolean
  onMapError?: (message: string) => void
} & Omit<MapOptions, "container" | "style">

function MapLoader() {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-background/45 backdrop-blur-[1px]">
      <RiLoader4Line className="size-5 animate-spin text-muted-foreground" />
    </div>
  )
}

const Map = forwardRef<MapRef, MapProps>(function Map(
  {
    children,
    className,
    theme,
    useEmptyStyle = false,
    styles,
    loading = false,
    onMapError,
    ...options
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [loaded, setLoaded] = useState(false)
  const resolvedTheme = useResolvedTheme(theme)
  const latestError = useRef(onMapError)
  latestError.current = onMapError

  const activeStyles = useMemo(
    () => ({
      dark: useEmptyStyle
        ? EMPTY_STYLES.dark
        : styles?.dark ?? CARTO_STYLES.dark,
      light: useEmptyStyle
        ? EMPTY_STYLES.light
        : styles?.light ?? CARTO_STYLES.light,
    }),
    [styles, useEmptyStyle]
  )

  useImperativeHandle(ref, () => map as MapLibreMap, [map])

  useEffect(() => {
    if (!containerRef.current) return
    const instance = new maplibregl.Map({
      container: containerRef.current,
      style: activeStyles[resolvedTheme],
      center: [78.9629, 22.5937],
      zoom: 4.2,
      attributionControl: { compact: true },
      renderWorldCopies: false,
      ...options,
    })
    const handleLoad = () => setLoaded(true)
    const handleError = (event: { error?: Error }) => {
      latestError.current?.(event.error?.message ?? "Map tiles unavailable")
    }
    instance.on("load", handleLoad)
    instance.on("error", handleError)
    setMap(instance)
    return () => {
      instance.off("load", handleLoad)
      instance.off("error", handleError)
      instance.remove()
      setLoaded(false)
      setMap(null)
    }
    // MapLibre owns the initial options after construction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!map) return
    setLoaded(false)
    map.setStyle(activeStyles[resolvedTheme])
    const handleStyle = () => setLoaded(true)
    map.once("styledata", handleStyle)
    return () => {
      map.off("styledata", handleStyle)
    }
  }, [activeStyles, map, resolvedTheme])

  return (
    <MapContext.Provider value={{ map, isLoaded: loaded }}>
      <div ref={containerRef} className={cn("relative h-full w-full", className)}>
        {(!loaded || loading) && <MapLoader />}
        {map ? children : null}
      </div>
    </MapContext.Provider>
  )
})

function MapControls({ className }: { className?: string }) {
  const { map } = useMap()
  return (
    <div className={cn("absolute right-3 top-3 z-20 grid gap-1", className)}>
      <Button
        type="button"
        variant="secondary"
        size="icon-sm"
        onClick={() => map?.zoomIn()}
        aria-label="Zoom in"
      >
        <RiAddLine className="size-4" />
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="icon-sm"
        onClick={() => map?.zoomOut()}
        aria-label="Zoom out"
      >
        <RiSubtractLine className="size-4" />
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="icon-sm"
        onClick={() => map?.resetNorthPitch()}
        aria-label="Reset bearing"
      >
        <RiCompass3Line className="size-4" />
      </Button>
    </div>
  )
}

function MapMarker({
  longitude,
  latitude,
  children,
  onClick,
  onContextMenu,
  className,
}: {
  longitude: number
  latitude: number
  children: ReactNode
  onClick?: () => void
  onContextMenu?: () => void
  className?: string
}) {
  const { map } = useMap()
  const marker = useMemo(
    () =>
      new maplibregl.Marker({
        element: document.createElement("button"),
      }).setLngLat([longitude, latitude]),
    []
  )

  useEffect(() => {
    if (!map) return
    marker.addTo(map)
    return () => {
      marker.remove()
    }
  }, [map, marker])

  useEffect(() => {
    marker.setLngLat([longitude, latitude])
  }, [latitude, longitude, marker])

  const element = marker.getElement()
  element.setAttribute("type", "button")
  element.className = cn(
    "group/map-marker cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    className
  )
  element.onclick = (event) => {
    event.stopPropagation()
    onClick?.()
  }
  element.oncontextmenu = (event) => {
    if (!onContextMenu) return
    event.preventDefault()
    event.stopPropagation()
    onContextMenu()
  }

  return createPortal(children, element)
}

export { Map, MapControls, MapMarker }
