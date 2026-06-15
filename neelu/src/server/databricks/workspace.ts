import { WorkspaceClient } from "@databricks/sdk-experimental"
import type { sql } from "@databricks/sdk-experimental"
import { config } from "../config"

let client: WorkspaceClient | null = null

export function getWorkspaceClient(): WorkspaceClient {
  if (client) return client
  client = new WorkspaceClient({
    host: config.databricks.host,
    token: config.databricks.token,
    profile: config.databricks.profile,
    warehouseId: config.databricks.warehouseId,
  })
  return client
}

export function databricksConfigured(): boolean {
  return !config.localSim
}

export function missingDatabricksDetail(service: string, envName: string): string {
  return `${service} is not connected: ${envName} is required when LOCAL_SIM=false`
}

function assertSucceeded(response: sql.StatementResponse): void {
  const state = response.status?.state
  if (state === "FAILED" || state === "CANCELED" || state === "CLOSED") {
    const message =
      response.status?.error?.message ??
      response.status?.error?.error_code ??
      `SQL statement ended with state ${state}`
    throw new Error(message)
  }
}

export async function runSqlRows(
  statement: string,
  options: {
    rowLimit?: number
    parameters?: sql.StatementParameterListItem[]
  } = {}
): Promise<Record<string, string | null>[]> {
  const { warehouseId, ucCatalog, ucSchema } = config.databricks
  if (!warehouseId) {
    throw new Error(missingDatabricksDetail("Unity Catalog", "DATABRICKS_WAREHOUSE_ID"))
  }

  const response = await getWorkspaceClient().statementExecution.executeStatement({
    statement,
    warehouse_id: warehouseId,
    catalog: ucCatalog,
    schema: ucSchema,
    wait_timeout: "30s",
    on_wait_timeout: "CANCEL",
    disposition: "INLINE",
    format: "JSON_ARRAY",
    row_limit: options.rowLimit,
    parameters: options.parameters,
  })
  assertSucceeded(response)

  const columns = response.manifest?.schema?.columns ?? []
  const names = columns.map((column, index) => column.name ?? `_c${index}`)
  const rows = response.result?.data_array ?? []
  return rows.map((row) =>
    Object.fromEntries(names.map((name, index) => [name, row[index] ?? null]))
  )
}

export function tableName(table: string): string {
  const { ucCatalog, ucSchema } = config.databricks
  if (!ucCatalog || !ucSchema) {
    throw new Error(missingDatabricksDetail("Unity Catalog", "UC_CATALOG and UC_SCHEMA"))
  }
  return `\`${ucCatalog}\`.\`${ucSchema}\`.\`${table}\``
}

export function numberValue(
  row: Record<string, string | null>,
  key: string,
  fallback = 0
): number {
  const value = row[key]
  if (value === null || value === undefined || value === "") return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function stringValue(
  row: Record<string, string | null>,
  key: string,
  fallback = ""
): string {
  return row[key] ?? fallback
}
