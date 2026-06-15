import { NavLink, Route, Routes } from "react-router-dom"
import { DeskPage } from "./routes/DeskPage"
import { FieldPage } from "./routes/FieldPage"
import { CasePage } from "./routes/CasePage"
import { Logo } from "./components/Logo"
import { cn } from "./lib/utils"

function navClass({ isActive }: { isActive: boolean }): string {
  return cn(
    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
    isActive
      ? "bg-primary/15 text-primary"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  )
}

function Header() {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2">
        <NavLink to="/" aria-label="Neelu home">
          <Logo />
        </NavLink>
        <nav className="flex items-center gap-1">
          <NavLink to="/" end className={navClass}>
            Command desk
          </NavLink>
          <NavLink to="/field" className={navClass}>
            Field intake
          </NavLink>
        </nav>
      </div>
    </header>
  )
}

export function App() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-4">
        <Routes>
          <Route path="/" element={<DeskPage />} />
          <Route path="/field" element={<FieldPage />} />
          <Route path="/cases/:caseId" element={<CasePage />} />
          <Route path="*" element={<DeskPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
