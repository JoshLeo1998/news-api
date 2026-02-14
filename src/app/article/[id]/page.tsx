"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
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

interface PracticeContent {
  bullets: string[];
  steps: string[];
  exercises: { q: string; a: string }[];
}

// ---- helpers --------------------------------------------------------------

const TOPICS_STORAGE_KEY = "news-feed-topics";

function loadTopics(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(TOPICS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---- component ------------------------------------------------------------

export default function ArticlePage() {
  const { id } = useParams<{ id: string }>();

  // Article state
  const [item, setItem] = useState<NewsItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Practice state
  const [practice, setPractice] = useState<PracticeContent | null>(null);
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [practiceError, setPracticeError] = useState<string | null>(null);
  const [showAnswers, setShowAnswers] = useState<Record<number, boolean>>({});

  // Help-me state (per exercise index)
  const [helpAnswers, setHelpAnswers] = useState<Record<number, string>>({});
  const [helpLoading, setHelpLoading] = useState<Record<number, boolean>>({});

  // Fetch article
  useEffect(() => {
    let cancelled = false;

    async function fetchArticle() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/news");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const match = (data.items as NewsItem[]).find((i) => i.id === id);

        if (!cancelled) {
          if (match) setItem(match);
          else setError("Article not found");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load article");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchArticle();
    return () => { cancelled = true; };
  }, [id]);

  // Request practice content from /api/practice
  const handlePractice = useCallback(async () => {
    if (!item) return;

    if (practice) {
      setPractice(null);
      setShowAnswers({});
      setPracticeError(null);
      setHelpAnswers({});
      setHelpLoading({});
      return;
    }

    setPracticeLoading(true);
    setPracticeError(null);

    try {
      const topics = loadTopics();

      const res = await fetch("/api/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: item.title,
          summary: item.summary,
          topics,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Unknown error");

      setPractice({
        bullets: data.bullets ?? [],
        steps: data.steps ?? [],
        exercises: data.exercises ?? [],
      });
      setShowAnswers({});
      setHelpAnswers({});
      setHelpLoading({});
    } catch (err) {
      setPracticeError(
        err instanceof Error ? err.message : "Failed to generate practice content"
      );
    } finally {
      setPracticeLoading(false);
    }
  }, [item, practice]);

  function toggleAnswer(index: number) {
    setShowAnswers((prev) => ({ ...prev, [index]: !prev[index] }));
  }

  // "Help me" — calls /api/help for a specific exercise
  async function handleHelp(index: number, question: string) {
    if (!item || helpLoading[index] || helpAnswers[index]) return;

    setHelpLoading((prev) => ({ ...prev, [index]: true }));

    try {
      const res = await fetch("/api/help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: item.title,
          summary: item.summary,
          question,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      setHelpAnswers((prev) => ({
        ...prev,
        [index]: data.answer ?? "Could not generate an answer.",
      }));
    } catch {
      setHelpAnswers((prev) => ({
        ...prev,
        [index]: "Something went wrong. Please try again.",
      }));
    } finally {
      setHelpLoading((prev) => ({ ...prev, [index]: false }));
    }
  }

  // ---- render -------------------------------------------------------------

  return (
    <div className={styles.container}>
      <Link href="/" className={styles.back}>
        &larr; Back to feed
      </Link>

      {loading && (
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <p>Loading article&hellip;</p>
        </div>
      )}

      {error && (
        <div className={styles.error}>
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && item && (
        <>
          <article className={styles.article}>
            <h1 className={styles.title}>{item.title}</h1>

            <div className={styles.meta}>
              <span className={styles.source}>{item.source}</span>
              <span className={styles.date}>{formatDate(item.publishedAt)}</span>
            </div>

            {item.summary && (
              <p className={styles.summary}>{item.summary}</p>
            )}

            <div className={styles.actions}>
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.externalLink}
              >
                Read full article &rarr;
              </a>

              <button
                className={`${styles.practiceBtn} ${practice ? styles.practiceBtnActive : ""}`}
                onClick={handlePractice}
                disabled={practiceLoading}
              >
                {practiceLoading
                  ? "Generating\u2026"
                  : practice
                    ? "Hide Practice"
                    : "Practice"}
              </button>
            </div>
          </article>

          {practiceLoading && (
            <div className={styles.practiceLoading}>
              <div className={styles.spinner} />
              <p>Generating practice content&hellip;</p>
            </div>
          )}

          {practiceError && (
            <div className={styles.practiceError}>
              <p>Failed to load practice content: {practiceError}</p>
            </div>
          )}

          {practice && (
            <section className={styles.practiceSection}>
              {/* Bullets */}
              <div className={styles.practiceBlock}>
                <h2 className={styles.practiceHeading}>Summary Bullets</h2>
                <ul className={styles.bulletList}>
                  {practice.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>

              {/* Steps */}
              <div className={styles.practiceBlock}>
                <h2 className={styles.practiceHeading}>
                  Implement in Practice
                </h2>
                <ol className={styles.stepList}>
                  {practice.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </div>

              {/* Exercises */}
              <div className={styles.practiceBlock}>
                <h2 className={styles.practiceHeading}>Exercises</h2>
                <div className={styles.exerciseList}>
                  {practice.exercises.map((ex, i) => (
                    <div key={i} className={styles.exerciseCard}>
                      <p className={styles.exerciseQ}>
                        <strong>Q{i + 1}.</strong> {ex.q}
                      </p>

                      <div className={styles.exerciseActions}>
                        <button
                          className={styles.answerBtn}
                          onClick={() => toggleAnswer(i)}
                        >
                          {showAnswers[i] ? "Hide answer" : "Show answer"}
                        </button>

                        <button
                          className={styles.helpBtn}
                          onClick={() => handleHelp(i, ex.q)}
                          disabled={helpLoading[i] || !!helpAnswers[i]}
                        >
                          {helpLoading[i]
                            ? "Thinking\u2026"
                            : helpAnswers[i]
                              ? "Answered"
                              : "Help me"}
                        </button>
                      </div>

                      {showAnswers[i] && (
                        <p className={styles.answerText}>{ex.a}</p>
                      )}

                      {helpAnswers[i] && (
                        <div className={styles.helpAnswer}>
                          <span className={styles.helpLabel}>AI Answer</span>
                          <p className={styles.helpText}>{helpAnswers[i]}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
