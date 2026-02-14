"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import styles from "./page.module.css";

// ---- types ----------------------------------------------------------------

interface NewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string;
  summary: string;
}

interface TopicSection {
  topic: string;
  items: NewsItem[];
}

// ---- localStorage helpers -------------------------------------------------

const STORAGE_KEY = "news-feed-topics";
const MAX_PER_TILE = 4;

function loadTopics(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistTopics(topics: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(topics));
}

// ---- formatting -----------------------------------------------------------

function timeAgo(iso: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(iso).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function isReddit(source: string): boolean {
  return source.startsWith("r/");
}

// ---- component ------------------------------------------------------------

export default function FeedPage() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [topicInput, setTopicInput] = useState("");
  const [savedTopics, setSavedTopics] = useState<string[]>([]);

  // Load saved topics on mount
  useEffect(() => {
    setSavedTopics(loadTopics());
  }, []);

  // Fetch news
  const fetchNews = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/news");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load news");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  // Topic management
  const addTopics = useCallback(() => {
    const incoming = topicInput
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    if (incoming.length === 0) return;

    const merged = Array.from(new Set([...savedTopics, ...incoming]));
    setSavedTopics(merged);
    persistTopics(merged);
    setTopicInput("");
  }, [topicInput, savedTopics]);

  const removeTopic = useCallback(
    (topic: string) => {
      const next = savedTopics.filter((t) => t !== topic);
      setSavedTopics(next);
      persistTopics(next);
    },
    [savedTopics]
  );

  const clearAllTopics = useCallback(() => {
    setSavedTopics([]);
    persistTopics([]);
  }, []);

  // Build per-topic sections (only when topics exist)
  const sections: TopicSection[] = useMemo(() => {
    if (savedTopics.length === 0) return [];

    return savedTopics.map((topic) => ({
      topic,
      items: items.filter((item) => {
        const haystack = `${item.title} ${item.summary}`.toLowerCase();
        return haystack.includes(topic);
      }),
    }));
  }, [items, savedTopics]);

  // The full scrollable list — all articles, sorted by time
  const allArticles = items;

  // ---- render -------------------------------------------------------------

  return (
    <div className={styles.container}>
      {/* Header + refresh */}
      <header className={styles.header}>
        <div>
          <h1>Your Feed</h1>
          <p className={styles.subtitle}>
            {items.length > 0
              ? `${items.length} articles from RSS & Reddit`
              : "Aggregated from RSS feeds & Reddit"}
          </p>
        </div>
        <button
          className={styles.refreshBtn}
          onClick={fetchNews}
          disabled={loading}
          title="Refresh feed"
        >
          <svg
            className={`${styles.refreshIcon} ${loading ? styles.refreshSpin : ""}`}
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21.5 2v6h-6" />
            <path d="M2.5 22v-6h6" />
            <path d="M2.8 10.5a10 10 0 0 1 17.5-3.3L21.5 8" />
            <path d="M21.2 13.5a10 10 0 0 1-17.5 3.3L2.5 16" />
          </svg>
        </button>
      </header>

      {/* Topic input */}
      <div className={styles.topicsBar}>
        <input
          className={styles.topicsInput}
          type="text"
          placeholder="Add topics, e.g. technology, climate, finance"
          value={topicInput}
          onChange={(e) => setTopicInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addTopics();
          }}
        />
        <button className={styles.addBtn} onClick={addTopics}>
          Add
        </button>
      </div>

      {/* Topic chips */}
      {savedTopics.length > 0 && (
        <div className={styles.chipsRow}>
          {savedTopics.map((topic) => (
            <span key={topic} className={styles.chip}>
              {topic}
              <button
                className={styles.chipRemove}
                onClick={() => removeTopic(topic)}
                aria-label={`Remove ${topic}`}
              >
                &times;
              </button>
            </span>
          ))}
          <button className={styles.clearAllBtn} onClick={clearAllTopics}>
            Clear all
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className={styles.stateBox}>
          <div className={styles.spinner} />
          <p>Fetching latest news&hellip;</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className={`${styles.stateBox} ${styles.stateError}`}>
          <p>Something went wrong: {error}</p>
          <button className={styles.retryBtn} onClick={fetchNews}>
            Try again
          </button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && items.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </div>
          <h2 className={styles.emptyTitle}>No articles available</h2>
          <p className={styles.emptyText}>
            Nothing came through from the RSS feeds. Try refreshing.
          </p>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <>
          {/* ---- Topic tiles (only when topics are saved) ---- */}
          {sections.length > 0 && (
            <div className={styles.tilesGrid}>
              {sections.map((section) => (
                <section key={section.topic} className={styles.tile}>
                  <div className={styles.tileHeader}>
                    <h2 className={styles.tileTitle}>
                      {capitalize(section.topic)}
                    </h2>
                    <span className={styles.tileCount}>
                      {section.items.length}
                    </span>
                  </div>

                  {section.items.length === 0 ? (
                    <p className={styles.tileEmpty}>
                      No articles match this topic.
                    </p>
                  ) : (
                    <ul className={styles.tileList}>
                      {section.items.slice(0, MAX_PER_TILE).map((item) => (
                        <li key={item.id}>
                          <Link
                            href={`/article/${item.id}`}
                            className={styles.tileLink}
                          >
                            <span className={styles.tileLinkTitle}>
                              {item.title}
                            </span>
                            <span className={styles.tileLinkMeta}>
                              <span className={isReddit(item.source) ? styles.badgeReddit : styles.badgeWeb}>
                                {isReddit(item.source) ? "Reddit" : "Web"}
                              </span>
                              {item.source} &middot; {timeAgo(item.publishedAt)}
                            </span>
                          </Link>
                        </li>
                      ))}
                      {section.items.length > MAX_PER_TILE && (
                        <li className={styles.tileOverflow}>
                          +{section.items.length - MAX_PER_TILE} more
                        </li>
                      )}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          )}

          {/* ---- Latest Articles — scrollable list ---- */}
          <div className={styles.latestSection}>
            <h2 className={styles.latestHeading}>Latest Articles</h2>
            <ul className={styles.latestList}>
              {allArticles.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/article/${item.id}`}
                    className={styles.card}
                  >
                    <div className={styles.cardLeft}>
                      <span className={styles.cardSource}>
                        <span className={isReddit(item.source) ? styles.badgeReddit : styles.badgeWeb}>
                          {isReddit(item.source) ? "Reddit" : "Web"}
                        </span>
                        {item.source}
                      </span>
                      <h3 className={styles.cardTitle}>{item.title}</h3>
                      {item.summary && (
                        <p className={styles.cardSummary}>
                          {item.summary.length > 140
                            ? item.summary.slice(0, 137) + "..."
                            : item.summary}
                        </p>
                      )}
                    </div>
                    <span className={styles.cardTime}>
                      {timeAgo(item.publishedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
