import { NextResponse } from "next/server";
import { getNews } from "@/lib/rss";
import { getRedditNews } from "@/lib/reddit";
import type { NewsItem } from "@/lib/news-types";

export const dynamic = "force-dynamic"; // never statically cache this route

export async function GET() {
  try {
    // Fetch RSS and Reddit in parallel
    const [rssItems, redditItems] = await Promise.all([
      getNews(),
      getRedditNews(),
    ]);

    // Merge all sources
    const allItems: NewsItem[] = [...rssItems, ...redditItems];

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

    return NextResponse.json(
      { ok: true, count: unique.length, items: unique },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (err) {
    console.error("[api/news] Unexpected error:", err);

    return NextResponse.json(
      { ok: false, error: "Failed to fetch news feeds" },
      { status: 500 }
    );
  }
}
