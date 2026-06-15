/**
 * AI Search / Vector Search adapter.
 *
 * LOCAL_SIM: keyword retrieval over the seeded guidance corpus. Every result is
 * marked `fallback: true`.
 *
 * DATABRICKS: implement `searchGuidanceLive` against a Vector Search index named
 * by AI_SEARCH_INDEX_NAME (see sql/ai_search_indexes.sql), then have
 * searchGuidance prefer it and set source: "ai_search".
 */

import { config } from "../config"
import { GUIDANCE_DOCS } from "../data/guidance"
import type { GuidanceDoc } from "../data/guidance"
import { ServiceUnavailableError } from "../lib/errors"
import type { ServiceCapability } from "../../shared/types"
import type { TestType } from "../../shared/constants"
import { getWorkspaceClient, missingDatabricksDetail } from "./workspace"

export interface RetrievalResult {
  guidanceId: string
  title: string
  sourceName: string
  sourceUri: string
  snippet: string
  score: number
}

export interface RetrievalResponse {
  results: RetrievalResult[]
  fallback: boolean
  source: "ai_search" | "local_fallback"
}

export interface RagContextPack {
  query: string
  results: RetrievalResult[]
  source: "vector_search" | "local_fallback"
  fallback: boolean
}

function snippet(text: string, max = 260): string {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`
}

function appliesToTest(
  doc: GuidanceDoc,
  testType: TestType | undefined
): boolean {
  if (!testType) return false
  return doc.appliesTo === "all" || doc.appliesTo.includes(testType)
}

function scoreDoc(
  doc: GuidanceDoc,
  terms: string[],
  testType: TestType | undefined
): number {
  const haystack =
    `${doc.title} ${doc.text} ${doc.tags.join(" ")}`.toLowerCase()
  let score = 0
  for (const term of terms) {
    if (term.length >= 3 && haystack.includes(term)) score += 1
  }
  if (appliesToTest(doc, testType)) score += 3
  return score
}

function localSearch(
  query: string,
  testType: TestType | undefined,
  limit: number
): RetrievalResult[] {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(Boolean)
  const scored = GUIDANCE_DOCS.map((doc) => ({
    doc,
    score: scoreDoc(doc, terms, testType),
  }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return scored.map(({ doc, score }) => ({
    guidanceId: doc.id,
    title: doc.title,
    sourceName: doc.sourceName,
    sourceUri: doc.sourceUri,
    snippet: snippet(doc.text),
    score,
  }))
}

export interface SearchOptions {
  testType?: TestType
  limit?: number
}

function resultFromVectorRow(
  row: string[],
  index: number
): RetrievalResult {
  const [id, title, sourceName, sourceUri, content, score] = row
  return {
    guidanceId: id ?? `vector-${index}`,
    title: title ?? "Databricks Vector Search result",
    sourceName: sourceName ?? "Unity Catalog Vector Search",
    sourceUri: sourceUri ?? "",
    snippet: snippet(content ?? ""),
    score: Number(score ?? 0),
  }
}

async function liveSearch(
  query: string,
  options: SearchOptions,
  limit: number
): Promise<RetrievalResult[]> {
  const index = config.databricks.aiSearchIndex
  if (!index) {
    throw new ServiceUnavailableError(
      missingDatabricksDetail("Vector Search", "AI_SEARCH_INDEX_NAME")
    )
  }

  const filters =
    options.testType === undefined
      ? undefined
      : JSON.stringify({ applies_to: ["all", options.testType] })
  const response = await getWorkspaceClient().vectorSearchIndexes.queryIndex({
    index_name: index,
    columns: ["id", "title", "source_name", "source_uri", "content"],
    query_text: query,
    query_type: "HYBRID",
    filters_json: filters,
    num_results: limit,
  })
  return (response.result?.data_array ?? []).map(resultFromVectorRow)
}

export async function searchGuidance(
  query: string,
  options: SearchOptions = {}
): Promise<RetrievalResponse> {
  const limit = options.limit ?? 4
  if (!config.localSim) {
    const results = await liveSearch(query, options, limit)
    return { results, fallback: false, source: "ai_search" }
  }

  const results = localSearch(query, options.testType, limit)
  return { results, fallback: true, source: "local_fallback" }
}

export async function retrieveRagContext(
  query: string,
  options: SearchOptions = {}
): Promise<RagContextPack> {
  const response = await searchGuidance(query, options)
  return {
    query,
    results: response.results,
    source:
      response.source === "ai_search" ? "vector_search" : "local_fallback",
    fallback: response.fallback,
  }
}

export function aiSearchCapability(): ServiceCapability {
  const index = config.databricks.aiSearchIndex
  if (config.localSim) {
    return {
      service: "ai_search",
      status: "local_fallback",
      detail: "LOCAL_SIM=true; local keyword retrieval over seeded guidance corpus",
    }
  }
  if (!index) {
    return {
      service: "ai_search",
      status: "error",
      detail: missingDatabricksDetail("Vector Search", "AI_SEARCH_INDEX_NAME"),
    }
  }
  return {
    service: "ai_search",
    status: "connected",
    detail: `Querying Databricks Vector Search index ${index}`,
  }
}
