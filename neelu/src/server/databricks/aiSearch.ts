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

import { config } from "../config";
import { GUIDANCE_DOCS } from "../data/guidance";
import type { GuidanceDoc } from "../data/guidance";
import type { ServiceCapability } from "../../shared/types";
import type { TestType } from "../../shared/constants";

export interface RetrievalResult {
  guidanceId: string;
  title: string;
  sourceName: string;
  sourceUri: string;
  snippet: string;
  score: number;
}

export interface RetrievalResponse {
  results: RetrievalResult[];
  fallback: boolean;
  source: "ai_search" | "local_fallback";
}

function snippet(text: string, max = 260): string {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}

function appliesToTest(doc: GuidanceDoc, testType: TestType | undefined): boolean {
  if (!testType) return false;
  return doc.appliesTo === "all" || doc.appliesTo.includes(testType);
}

function scoreDoc(
  doc: GuidanceDoc,
  terms: string[],
  testType: TestType | undefined,
): number {
  const haystack = `${doc.title} ${doc.text} ${doc.tags.join(" ")}`.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (term.length >= 3 && haystack.includes(term)) score += 1;
  }
  if (appliesToTest(doc, testType)) score += 3;
  return score;
}

function localSearch(
  query: string,
  testType: TestType | undefined,
  limit: number,
): RetrievalResult[] {
  const terms = query.toLowerCase().split(/[^a-z0-9]+/u).filter(Boolean);
  const scored = GUIDANCE_DOCS.map((doc) => ({
    doc,
    score: scoreDoc(doc, terms, testType),
  }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ doc, score }) => ({
    guidanceId: doc.id,
    title: doc.title,
    sourceName: doc.sourceName,
    sourceUri: doc.sourceUri,
    snippet: snippet(doc.text),
    score,
  }));
}

export interface SearchOptions {
  testType?: TestType;
  limit?: number;
}

export async function searchGuidance(
  query: string,
  options: SearchOptions = {},
): Promise<RetrievalResponse> {
  const limit = options.limit ?? 4;
  // DATABRICKS extension point: when a live Vector Search adapter is implemented
  // and AI_SEARCH_INDEX_NAME is set, call it here and return source: "ai_search".
  const results = localSearch(query, options.testType, limit);
  return { results, fallback: true, source: "local_fallback" };
}

export function aiSearchCapability(): ServiceCapability {
  const index = config.databricks.aiSearchIndex;
  return {
    service: "ai_search",
    status: "local_fallback",
    detail: index
      ? `AI_SEARCH_INDEX_NAME=${index} configured; live adapter not yet implemented, using local keyword retrieval`
      : "Local keyword retrieval over seeded guidance corpus",
  };
}
