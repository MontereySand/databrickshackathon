import { Link, Route, Routes, useLocation } from "react-router-dom"
import { DeskPage } from "./routes/DeskPage"
import { FieldPage } from "./routes/FieldPage"
import { CasePage } from "./routes/CasePage"
import { CitizenPage } from "./routes/CitizenPage"
import { ContractorPage } from "./routes/ContractorPage"
import { Logo } from "./components/Logo"
import { cn } from "./lib/utils"
import { useLanguage } from "./lib/i18n"
import {
  RiArrowRightLine,
  RiFirstAidKitLine,
  RiMicLine,
  RiToolsLine,
} from "@remixicon/react"

const ROLES = [
  {
    to: "/provider",
    key: "provider",
    hint: "providerHint",
    icon: RiFirstAidKitLine,
  },
  {
    to: "/citizen",
    key: "citizen",
    hint: "citizenHint",
    icon: RiMicLine,
  },
  {
    to: "/contractor",
    key: "contractor",
    hint: "contractorHint",
    icon: RiToolsLine,
  },
] as const

function RootLandingGate() {
  const { t } = useLanguage()
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-5xl flex-col px-4 py-8">
      <div className="flex items-center justify-between">
        <Logo />
        <span className="border px-2 py-1 text-xs text-muted-foreground">
          Databricks-native ledger
        </span>
      </div>

      <section className="grid flex-1 place-items-center py-10">
        <div className="w-full max-w-4xl">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-normal">
              {t.roleGate}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Neelu separates healthcare review, citizen reporting, and field
              repair work into dedicated surfaces.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {ROLES.map((role) => {
              const Icon = role.icon
              return (
                <Link
                  key={role.to}
                  to={role.to}
                  className="group flex min-h-44 flex-col justify-between border bg-card p-4 text-card-foreground transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                >
                  <div>
                    <Icon className="mb-4 size-6 text-primary" />
                    <h2 className="text-base font-semibold">
                      {t[role.key]}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {t[role.hint]}
                    </p>
                  </div>
                  <span className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary">
                    Open workspace
                    <RiArrowRightLine className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )
}

export function App() {
  const location = useLocation()
  const providerMode = location.pathname.startsWith("/provider")
  return (
    <div className="min-h-svh bg-background text-foreground">
      <main
        className={cn(
          providerMode
            ? "p-0 pb-20"
            : location.pathname === "/"
              ? ""
              : "mx-auto max-w-6xl px-4 py-4 pb-8"
        )}
      >
        <Routes>
          <Route path="/" element={<RootLandingGate />} />
          <Route path="/provider" element={<DeskPage />} />
          <Route path="/field" element={<FieldPage />} />
          <Route path="/citizen" element={<CitizenPage />} />
          <Route path="/contractor" element={<ContractorPage />} />
          <Route path="/cases/:caseId" element={<CasePage />} />
          <Route path="*" element={<RootLandingGate />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
