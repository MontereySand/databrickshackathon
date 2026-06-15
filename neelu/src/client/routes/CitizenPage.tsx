import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  RiChatVoiceLine,
  RiDropLine,
  RiMapPinLine,
  RiMicLine,
  RiQrScanLine,
  RiRecordCircleLine,
  RiSendPlaneLine,
} from "@remixicon/react"

import { H3MapPanel } from "@/client/components/H3MapPanel"
import { Badge } from "@/client/components/ui/badge"
import { Button } from "@/client/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card"
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/client/components/ui/sheet"
import { Textarea } from "@/client/components/ui/textarea"
import { api, ApiClientError } from "@/client/lib/api"
import { useApi } from "@/client/lib/useApi"
import type { H3MapCell } from "@/shared/types"

type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognition
  webkitSpeechRecognition?: new () => SpeechRecognition
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>
      }) => void)
    | null
  onend: (() => void) | null
}

const VOICE_LANGUAGES = [
  { label: "English", value: "en-IN" },
  { label: "हिन्दी", value: "hi-IN" },
  { label: "தமிழ்", value: "ta-IN" },
  { label: "తెలుగు", value: "te-IN" },
  { label: "ಕನ್ನಡ", value: "kn-IN" },
  { label: "മലയാളം", value: "ml-IN" },
  { label: "ગુજરાતી", value: "gu-IN" },
  { label: "বাংলা", value: "bn-IN" },
]

function parseUpiCoordinates(uri: string): {
  latitude: number
  longitude: number
} | null {
  try {
    const parsed = new URL(uri)
    const params = parsed.searchParams
    const ll = params.get("ll") ?? params.get("location")
    if (ll) {
      const [lat, lng] = ll.split(",").map((item) => Number(item.trim()))
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { latitude: lat, longitude: lng }
      }
    }
    const latitude = Number(params.get("lat") ?? params.get("latitude"))
    const longitude = Number(params.get("lng") ?? params.get("lon") ?? params.get("longitude"))
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return { latitude, longitude }
    }
  } catch {
    return null
  }
  return null
}

function qualityLabel(cell: H3MapCell | null): string {
  if (!cell) return "Select a hex"
  if (cell.quality === "contaminated") return "Contaminated"
  if (cell.quality === "caution") return "Caution"
  return "Clean"
}

function score(value: number | undefined): string {
  return `${Math.round((value ?? 0) * 100)}`
}

export function CitizenPage() {
  const map = useApi(() => api.h3Map(), [])
  const systems = useApi(() => api.systems(), [])
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [recording, setRecording] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [speechLang, setSpeechLang] = useState("en-IN")
  const [qrUri, setQrUri] = useState(
    "upi://pay?pa=neelu@upi&pn=Neelu%20Water&tn=SYS_sys-village_REPORT_URGENT&ll=28.6139,77.2090"
  )
  const [parsedQr, setParsedQr] = useState<{
    latitude: number
    longitude: number
  } | null>(null)
  const cells = map.data?.cells ?? []
  const selectedCell =
    cells.find((cell) => cell.h3Cell === selectedCellId) ?? cells[0] ?? null
  const selectedSystem = systems.data?.[0]?.systemId ?? "sys-village"

  useEffect(() => {
    if (!selectedCellId && cells[0]) {
      setSelectedCellId(cells[0].h3Cell)
    }
  }, [cells, selectedCellId])

  function startVoice() {
    const speechWindow = window as SpeechWindow
    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
    if (!Recognition) {
      toast.message("Speech recognition is not available in this browser.")
      return
    }
    const recognition = new Recognition()
    recognition.lang = speechLang
    recognition.continuous = false
    recognition.interimResults = false
    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .flatMap((result) => Array.from(result))
        .map((item) => item.transcript)
        .join(" ")
      setTranscript(text)
    }
    recognition.onend = () => setRecording(false)
    setRecording(true)
    recognition.start()
  }

  async function submitVoice() {
    setSubmitting(true)
    try {
      const detail = await api.createVoiceSignal({
        mode: "voice",
        transcript,
        systemId: selectedSystem,
        actor: "citizen",
        h3Cell: selectedCell?.h3Cell,
        latitude: selectedCell?.center.latitude,
        longitude: selectedCell?.center.longitude,
      })
      toast.success(`Report opened as ${detail.case.caseId}`)
      setTranscript("")
      setSheetOpen(false)
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : "Report failed"
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function simulateFountainScan() {
    const coordinates = parseUpiCoordinates(qrUri)
    setParsedQr(coordinates)
    if (!coordinates) {
      toast.error("QR URI must include ll=lat,lng or lat/lng parameters.")
      return
    }
    setSubmitting(true)
    try {
      const result = await api.upiCallback({
        transactionId: `fountain-scan-${Date.now()}`,
        tn:
          new URL(qrUri).searchParams.get("tn") ??
          `SYS_${selectedSystem}_REPORT_URGENT`,
        actor: "physical-fountain-qr",
      })
      toast.success(`Fountain scan opened ${result.caseId}`)
      setSheetOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Scan failed")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto grid max-w-md gap-4">
      <section className="relative min-h-[calc(100svh-5rem)]">
        <H3MapPanel
          cells={cells}
          selectedCell={selectedCell?.h3Cell}
          onCellSelect={(cell) => setSelectedCellId(cell.h3Cell)}
          defaultMapType="roadmap"
          mode="pins"
          className="min-h-[calc(100svh-5rem)] rounded-none border-x-0"
        />
        <div className="absolute inset-x-4 bottom-4 flex items-center justify-center">
          <Button
            size="lg"
            className="h-14 min-w-48 shadow-xl"
            onClick={() => setSheetOpen(true)}
          >
            <RiChatVoiceLine className="size-5" />
            Report water issue
          </Button>
        </div>
      </section>

      <aside className="grid gap-3 content-start">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <RiMapPinLine className="size-4 text-primary" />
              Selected water area
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-2xl font-semibold">{qualityLabel(selectedCell)}</p>
              <p className="text-xs text-muted-foreground">
              {selectedCell?.districtName ?? "Tap a hexagon on the map"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Metric label="Water" value={score(selectedCell?.waterContaminationScore)} />
              <Metric label="Access" value={score(selectedCell?.medicalDesertScore)} />
              <Metric label="Priority" value={score(selectedCell?.vulnerabilityIndex)} />
              <Metric label="Points" value={String(selectedCell?.waterPointCount ?? 0)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Green clean</Badge>
              <Badge variant="outline">Yellow caution</Badge>
              <Badge variant="outline">Red contaminated</Badge>
            </div>
          </CardContent>
        </Card>
      </aside>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="mx-auto max-h-[92svh] max-w-md overflow-auto border">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-base">
              <RiDropLine className="size-5 text-primary" />
              Report from this water point
            </SheetTitle>
          </SheetHeader>
          <div className="grid gap-4 px-6">
            <div className="grid grid-cols-4 gap-1">
              {VOICE_LANGUAGES.map((item) => (
                <Button
                  key={item.value}
                  variant={speechLang === item.value ? "default" : "outline"}
                  size="sm"
                  className="h-8 px-1 text-[0.6875rem]"
                  onClick={() => setSpeechLang(item.value)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
            <Button
              className="h-24 flex-col gap-2"
              variant={recording ? "destructive" : "default"}
              onClick={startVoice}
              disabled={recording}
            >
              {recording ? (
                <RiRecordCircleLine className="size-8 animate-pulse" />
              ) : (
                <RiMicLine className="size-8" />
              )}
              {recording ? "Listening" : "Hold phone near speaker and record"}
            </Button>
            <Textarea
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
              placeholder="Transcript appears here. For demo spoofing, type the report or use the physical fountain scan action."
              rows={6}
            />
            <Button
              variant="outline"
              onClick={() =>
                setTranscript(
                  "The tap near the school has cloudy water and children report stomach pain after drinking it."
                )
              }
            >
              Use demo voice transcript
            </Button>
            <div className="space-y-2 border p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <RiQrScanLine className="size-4 text-primary" />
                QR scanner mock
              </div>
              <Textarea
                value={qrUri}
                onChange={(event) => setQrUri(event.target.value)}
                rows={3}
                placeholder="upi://pay?...&tn=SYS_sys-village_REPORT_URGENT&ll=28.6139,77.2090"
              />
              {parsedQr ? (
                <p className="text-xs text-muted-foreground">
                  Parsed {parsedQr.latitude.toFixed(4)},{" "}
                  {parsedQr.longitude.toFixed(4)}
                </p>
              ) : null}
            </div>
          </div>
          <SheetFooter>
            <Button
              onClick={submitVoice}
              disabled={submitting || transcript.trim().length < 3}
            >
              <RiSendPlaneLine className="size-4" />
              Send voice report
            </Button>
            <Button
              variant="outline"
              onClick={simulateFountainScan}
              disabled={submitting}
            >
              <RiQrScanLine className="size-4" />
              Simulate phone scanning fountain QR
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border p-3">
      <p className="text-[0.6875rem] text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  )
}
