import { useState } from "react"
import {
  RiDatabase2Line,
  RiKeyboardLine,
  RiMoonLine,
  RiSunLine,
} from "@remixicon/react"

import { useTheme } from "@/client/components/theme-provider"
import { Button } from "@/client/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/client/components/ui/tooltip"
import { useApi } from "@/client/lib/useApi"
import { api } from "@/client/lib/api"
import { cn } from "@/client/lib/utils"

function DatabricksMark() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="grid h-4 w-4 grid-rows-3 gap-0.5" aria-hidden>
        <span className="border border-[#ff3621]" />
        <span className="border border-[#ff3621]" />
        <span className="border border-[#ff3621]" />
      </span>
      <span>Databricks</span>
    </span>
  )
}

export function AppStatusBar() {
  const health = useApi(() => api.health(), [])
  const { theme, setTheme } = useTheme()
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const loading = health.loading
  const connected = health.data?.services.filter(
    (service) => service.status === "connected"
  ).length ?? 0
  const total = health.data?.services.length ?? 5

  return (
    <>
      <TooltipProvider delayDuration={150}>
        <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0b0f14] text-xs text-white shadow-[0_-1px_0_rgba(255,255,255,0.04)]">
          <div
            className={cn(
              "h-0.5 bg-primary transition-all",
              loading ? "w-2/3 animate-pulse" : "w-full"
            )}
          />
          <div className="mx-auto flex h-9 max-w-[1800px] items-center justify-between gap-3 px-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 text-white/80">
                  <RiDatabase2Line className="size-4 text-primary" />
                  <span>
                    {loading
                      ? "Loading Databricks services"
                      : `${connected}/${total} services connected`}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {health.error
                  ? health.error
                  : health.data?.services
                      .map((service) => `${service.service}: ${service.status}`)
                      .join(" · ") ?? "Checking service status"}
              </TooltipContent>
            </Tooltip>

            <div className="flex items-center gap-2">
              <span className="hidden text-white/70 sm:inline">
                Powered by <DatabricksMark />
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-white hover:bg-white/10 hover:text-white"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                aria-label="Toggle theme"
              >
                {theme === "dark" ? (
                  <RiSunLine className="size-4" />
                ) : (
                  <RiMoonLine className="size-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-white hover:bg-white/10 hover:text-white"
                onClick={() => setShortcutsOpen(true)}
                aria-label="Open keyboard shortcuts"
              >
                <RiKeyboardLine className="size-4" />
              </Button>
            </div>
          </div>
        </footer>
      </TooltipProvider>

      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 text-sm">
            {[
              ["D", "Toggle theme"],
              ["R", "Refresh provider data"],
              ["?", "Open shortcuts"],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center justify-between border p-2">
                <span>{label}</span>
                <kbd className="border bg-muted px-2 py-1 text-xs">{key}</kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
