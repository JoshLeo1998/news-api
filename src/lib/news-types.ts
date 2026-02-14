import crypto from "crypto";

// ---------------------------------------------------------------------------
// Shared types and utilities for all news source modules (RSS, Reddit, etc.)
// ---------------------------------------------------------------------------

export interface NewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string; // ISO-8601
  summary: string;
}

/**
 * Deterministic ID derived from a URL so we can deduplicate across sources.
 */
export function makeId(link: string): string {
  return crypto.createHash("sha256").update(link).digest("hex").slice(0, 16);
}
