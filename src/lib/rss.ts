import Parser from "rss-parser";
import https from "https";
import { makeId, type NewsItem } from "./news-types";

export type { NewsItem };

// Allow self-signed / corporate-intercepted certs in development
const agent = new https.Agent({ rejectUnauthorized: false });

// ---------------------------------------------------------------------------
// Configuration — add / remove RSS feeds here
// ---------------------------------------------------------------------------

const RSS_FEED_URLS: string[] = [
  "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml",
  "https://feeds.bbci.co.uk/news/rss.xml",
  "https://www.theguardian.com/world/rss",
  "https://rss.cnn.com/rss/edition.rss",
  "https://feeds.nbcnews.com/nbcnews/public/news",
];

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  data: NewsItem[];
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cache: CacheEntry | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const parser = new Parser({
  timeout: 10_000, // 10 s per feed
  headers: {
    // Some feeds block requests without a User-Agent
    "User-Agent": "NewsAggregator/1.0",
  },
  requestOptions: { agent },
});

/**
 * Best-effort extraction of the "source" (feed / publisher name) from a feed.
 */
function extractSource(feed: Parser.Output<Record<string, unknown>>): string {
  return feed.title?.trim() || new URL(feed.link ?? "").hostname;
}

/**
 * Normalise a single RSS item into our NewsItem shape.
 */
function normaliseItem(
  item: Parser.Item,
  source: string
): NewsItem | null {
  const link = item.link?.trim();
  if (!link) return null; // skip items without a link

  const title = item.title?.trim() || "(no title)";
  const summary =
    item.contentSnippet?.trim() ||
    item.content?.replace(/<[^>]*>/g, "").trim() ||
    "";
  const publishedAt = item.isoDate
    ? new Date(item.isoDate).toISOString()
    : new Date().toISOString(); // fallback to now

  return {
    id: makeId(link),
    title,
    link,
    source,
    publishedAt,
    summary: summary.length > 500 ? summary.slice(0, 497) + "…" : summary,
  };
}

/**
 * Fetch a single RSS feed and return normalised items.
 * Errors are caught so one broken feed doesn't take down the whole response.
 */
async function fetchFeed(url: string): Promise<NewsItem[]> {
  try {
    const feed = await parser.parseURL(url);
    const source = extractSource(feed);
    const items: NewsItem[] = [];

    for (const entry of feed.items) {
      const normalised = normaliseItem(entry, source);
      if (normalised) items.push(normalised);
    }

    return items;
  } catch (err) {
    console.error(`[rss] Failed to fetch ${url}:`, err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch all configured RSS feeds, deduplicate by link, sort by publishedAt
 * descending, and return the result. Results are cached in memory.
 */
export async function getNews(): Promise<NewsItem[]> {
  // Return cached data if still valid
  if (cache && Date.now() < cache.expiresAt) {
    return cache.data;
  }

  // Fetch all feeds concurrently
  const results = await Promise.all(RSS_FEED_URLS.map(fetchFeed));
  const allItems = results.flat();

  // Deduplicate by link (keep first occurrence)
  const seen = new Set<string>();
  const unique: NewsItem[] = [];

  for (const item of allItems) {
    if (!seen.has(item.link)) {
      seen.add(item.link);
      unique.push(item);
    }
  }

  // Sort descending by publishedAt
  unique.sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  // Store in cache
  cache = {
    data: unique,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };

  return unique;
}
