import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"

import "./styles/index.css"
import App from "./App.tsx"
import { ThemeProvider } from "@/client/components/theme-provider.tsx"
import { Toaster } from "@/client/components/ui/sonner"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="light">
      <BrowserRouter>
        <App />
      </BrowserRouter>
      <Toaster richColors closeButton position="top-right" />
    </ThemeProvider>
  </StrictMode>
)
