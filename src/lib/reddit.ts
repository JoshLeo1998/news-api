import https from "https";
import { makeId, type NewsItem } from "./news-types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SUBREDDITS: string[] = [
  "worldnews",
  "news",
  "technology",
  "science",
  "finance",
  "politics",
];

const POSTS_PER_SUB = 25;
const USER_AGENT = "NewsFlash/1.0 (news aggregator)";

// Allow self-signed / corporate-intercepted certs in development
const agent = new https.Agent({ rejectUnauthorized: false });

// ---------------------------------------------------------------------------
// In-memory cache (independent from RSS cache)
// ---------------------------------------------------------------------------

interface CacheEntry {
  data: NewsItem[];
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cache: CacheEntry | null = null;

// ---------------------------------------------------------------------------
// Reddit JSON types (partial — only the fields we need)
// ---------------------------------------------------------------------------

interface RedditPost {
  data: {
    title: string;
    url: string;
    permalink: string;
    selftext: string;
    is_self: boolean;
    stickied: boolean;
    created_utc: number;
    subreddit: string;
    domain: string;
  };
}

interface RedditListing {
  data: {
    children: RedditPost[];
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch JSON from a URL using the https module directly
 * (to reuse our custom agent for SSL workaround).
 */
function fetchJSON(url: string): Promise<RedditListing> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        agent,
        headers: { "User-Agent": USER_AGENT },
      },
      (res) => {
        // Follow redirects (Reddit sometimes 301s)
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          fetchJSON(res.headers.location).then(resolve, reject);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          try {
            const body = Buffer.concat(chunks).toString("utf-8");
            resolve(JSON.parse(body));
          } catch (err) {
            reject(err);
          }
        });
      }
    );

    req.on("error", reject);
    req.setTimeout(10_000, () => {
      req.destroy(new Error("Request timed out"));
    });
  });
}

/**
 * Normalise a single Reddit post into the NewsItem shape.
 */
function normalisePost(post: RedditPost): NewsItem | null {
  const { data } = post;

  // Skip stickied / pinned posts and posts without a title
  if (data.stickied || !data.title?.trim()) return null;

  // Use external link for link-posts, Reddit permalink for self-posts
  const link = data.is_self
    ? `https://www.reddit.com${data.permalink}`
    : data.url;

  if (!link) return null;

  const title = data.title.trim();
  const source = `r/${data.subreddit}`;
  const publishedAt = new Date(data.created_utc * 1000).toISOString();

  // Self-posts have body text; link-posts usually don't
  let summary = "";
  if (data.selftext) {
    const cleaned = data.selftext.replace(/\n{2,}/g, " ").trim();
    summary =
      cleaned.length > 500 ? cleaned.slice(0, 497) + "…" : cleaned;
  }

  return {
    id: makeId(link),
    title,
    link,
    source,
    publishedAt,
    summary,
  };
}

/**
 * Fetch hot posts from a single subreddit.
 * Errors are caught so one failing sub doesn't break the rest.
 */
async function fetchSubreddit(name: string): Promise<NewsItem[]> {
  try {
    const url = `https://www.reddit.com/r/${name}/hot.json?limit=${POSTS_PER_SUB}&raw_json=1`;
    const listing = await fetchJSON(url);

    const items: NewsItem[] = [];
    for (const post of listing.data.children) {
      const normalised = normalisePost(post);
      if (normalised) items.push(normalised);
    }

    return items;
  } catch (err) {
    console.error(`[reddit] Failed to fetch r/${name}:`, err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch hot posts from all configured subreddits.
 * Results are cached independently from the RSS cache.
 */
export async function getRedditNews(): Promise<NewsItem[]> {
  // Return cached data if still valid
  if (cache && Date.now() < cache.expiresAt) {
    return cache.data;
  }

  // Fetch all subreddits concurrently
  const results = await Promise.all(SUBREDDITS.map(fetchSubreddit));
  const allItems = results.flat();

  // Store in cache
  cache = {
    data: allItems,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };

  return allItems;
}
