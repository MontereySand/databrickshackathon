import { config } from "../config"
import { getWorkspaceClient } from "./workspace"

const GOOGLE_MAPS_RESOURCE_ENV = "google-maps-api-key"
const GOOGLE_MAPS_SECRET_SCOPE = process.env.GOOGLE_MAPS_SECRET_SCOPE ?? "neelu"
const GOOGLE_MAPS_SECRET_KEY =
  process.env.GOOGLE_MAPS_SECRET_KEY ?? "google-maps-api-key"

let cachedGoogleMapsApiKey: string | null | undefined

function directGoogleMapsApiKey(): string | undefined {
  const key =
    process.env.GOOGLE_MAPS_API_KEY ??
    process.env.GOOGLE_MAPS_KEY ??
    process.env[GOOGLE_MAPS_RESOURCE_ENV]
  return key?.trim() || undefined
}

function decodeSecretValue(value: string | undefined): string | null {
  if (!value) return null
  const decoded = Buffer.from(value, "base64").toString("utf8").trim()
  return decoded || null
}

export async function getGoogleMapsApiKey(): Promise<string | null> {
  if (cachedGoogleMapsApiKey !== undefined) return cachedGoogleMapsApiKey

  const direct = directGoogleMapsApiKey()
  if (direct) {
    cachedGoogleMapsApiKey = direct
    return cachedGoogleMapsApiKey
  }

  if (config.localSim) {
    cachedGoogleMapsApiKey = null
    return cachedGoogleMapsApiKey
  }

  const secret = await getWorkspaceClient().secrets.getSecret({
    scope: GOOGLE_MAPS_SECRET_SCOPE,
    key: GOOGLE_MAPS_SECRET_KEY,
  })
  cachedGoogleMapsApiKey = decodeSecretValue(secret.value)
  return cachedGoogleMapsApiKey
}
