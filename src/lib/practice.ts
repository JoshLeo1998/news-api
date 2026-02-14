// ---------------------------------------------------------------------------
// Practice content types & mock fallback generator.
//
// The real generation lives in llm.ts.  This module owns the shared types
// and provides a deterministic fallback used when:
//   - OPENAI_API_KEY is not configured
//   - The LLM call fails or returns unparseable output
//   - The article has insufficient content
// ---------------------------------------------------------------------------

export interface PracticeContent {
  bullets: string[];                        // 5 summary bullets
  steps: string[];                          // 5-8 implementation steps
  exercises: { q: string; a: string }[];    // 3 exercises
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractKeywords(text: string, max = 8): string[] {
  const stopWords = new Set([
    "about", "after", "again", "being", "between", "could", "does",
    "during", "every", "found", "from", "going", "great", "have",
    "into", "just", "might", "more", "much", "never", "only", "other",
    "over", "people", "really", "should", "since", "still", "their",
    "them", "then", "there", "these", "they", "this", "those", "through",
    "under", "very", "want", "were", "what", "when", "where", "which",
    "while", "will", "with", "would", "your",
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 4 && !stopWords.has(w));

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const w of words) {
    if (!seen.has(w)) {
      seen.add(w);
      unique.push(w);
    }
  }
  return unique.slice(0, max);
}

function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function pick<T>(arr: T[], seed: number, index: number): T {
  return arr[(seed + index) % arr.length];
}

// ---------------------------------------------------------------------------
// Template pools
// ---------------------------------------------------------------------------

const BULLET_TEMPLATES = [
  (kw: string) => `The core issue revolves around ${kw} and its broader implications.`,
  (kw: string) => `Experts highlight the growing significance of ${kw} in this context.`,
  (kw: string) => `Recent developments in ${kw} have accelerated the pace of change.`,
  (kw: string) => `Stakeholders are divided on how ${kw} should be addressed going forward.`,
  (kw: string) => `Data suggests that ${kw} plays a larger role than previously understood.`,
  (kw: string) => `The relationship between ${kw} and public policy is becoming clearer.`,
  (kw: string) => `Understanding ${kw} is essential for grasping the full picture.`,
  (kw: string) => `Long-term trends indicate ${kw} will remain a focal point.`,
  (kw: string) => `Critics argue the focus on ${kw} overlooks other contributing factors.`,
  (kw: string) => `New research sheds light on the mechanics behind ${kw}.`,
];

const STEP_TEMPLATES = [
  (kw: string) => `Research the fundamentals of ${kw} using reputable sources.`,
  (kw: string) => `Identify three real-world examples where ${kw} is directly relevant.`,
  (kw: string) => `Write a one-paragraph summary explaining ${kw} in your own words.`,
  (kw: string) => `Create a simple diagram mapping the key relationships around ${kw}.`,
  (kw: string) => `Discuss the topic of ${kw} with a peer and note differing viewpoints.`,
  (kw: string) => `List the potential consequences if ${kw} continues on its current trajectory.`,
  (kw: string) => `Draft an action plan for applying insights about ${kw} in your work.`,
  (kw: string) => `Review a contrarian perspective on ${kw} and evaluate its merits.`,
  (kw: string) => `Set up a simple tracking system to monitor developments in ${kw}.`,
  (kw: string) => `Reflect on how ${kw} connects to topics you've studied before.`,
];

const EXERCISE_TEMPLATES: { q: (kw: string) => string; a: (kw: string) => string }[] = [
  {
    q: (kw) => `Explain why ${kw} matters in the context of this article. What would change without it?`,
    a: (kw) => `${kw} is central because it drives the main dynamic described. Without it, the situation would lack its primary catalyst and likely unfold very differently.`,
  },
  {
    q: (kw) => `Compare two different approaches to ${kw}. Which seems more sustainable?`,
    a: (kw) => `One approach focuses on short-term mitigation of ${kw}, while another invests in systemic change. The systemic approach is typically more sustainable but requires greater upfront commitment.`,
  },
  {
    q: (kw) => `If you had to brief a colleague on ${kw} in 60 seconds, what would you say?`,
    a: (kw) => `Focus on the single most impactful dimension of ${kw}: what changed, why it matters now, and what the likely next development is.`,
  },
  {
    q: (kw) => `What assumptions does the article make about ${kw}? Are they justified?`,
    a: (kw) => `The article implicitly treats ${kw} as a settled concern. This is partially justified by current evidence but overlooks emerging counter-arguments.`,
  },
  {
    q: (kw) => `Propose one investigation that could deepen understanding of ${kw}.`,
    a: (kw) => `A comparative study of how ${kw} has been addressed in different regions or industries would reveal which strategies are most transferable.`,
  },
  {
    q: (kw) => `How might ${kw} evolve over the next five years? Outline two scenarios.`,
    a: (kw) => `Optimistically, increased attention to ${kw} leads to effective policy. Pessimistically, fragmented responses cause the issue to deepen before meaningful action occurs.`,
  },
];

// ---------------------------------------------------------------------------
// Public fallback generator
// ---------------------------------------------------------------------------

/**
 * Deterministic mock generator — used as a fallback when the LLM is
 * unavailable or returns bad data.
 */
export function generateFallbackContent(
  title: string,
  summary: string
): PracticeContent {
  const keywords = extractKeywords(`${title} ${summary}`);
  const seed = hash(title);

  while (keywords.length < 8) {
    keywords.push(
      keywords[keywords.length % Math.max(keywords.length, 1)] ?? "this topic"
    );
  }

  const bullets: string[] = [];
  for (let i = 0; i < 5; i++) {
    bullets.push(pick(BULLET_TEMPLATES, seed, i)(keywords[i % keywords.length]));
  }

  const stepCount = 5 + (seed % 4);
  const steps: string[] = [];
  for (let i = 0; i < stepCount; i++) {
    steps.push(pick(STEP_TEMPLATES, seed, i + 10)(keywords[(i + 2) % keywords.length]));
  }

  const exercises: { q: string; a: string }[] = [];
  for (let i = 0; i < 3; i++) {
    const tpl = pick(EXERCISE_TEMPLATES, seed, i + 20);
    const kw = keywords[(i + 4) % keywords.length];
    exercises.push({ q: tpl.q(kw), a: tpl.a(kw) });
  }

  return { bullets, steps, exercises };
}
