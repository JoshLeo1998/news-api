import OpenAI from "openai";
import type { PracticeContent } from "./practice";

// ---------------------------------------------------------------------------
// Client — initialised lazily so the module can be imported even when the
// env var is missing (e.g. during `next build`).
// ---------------------------------------------------------------------------

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Prompt template
// ---------------------------------------------------------------------------

function buildPrompt(
  title: string,
  summary: string,
  topics: string[]
): string {
  const topicClause =
    topics.length > 0
      ? `The reader is interested in these topics: ${topics.join(", ")}.  Tailor your practical advice toward these interests where relevant, but stay grounded in the article content.\n\n`
      : "";

  return `You are a practical-learning assistant.  You help readers turn news articles into actionable knowledge.

ARTICLE TITLE:
${title}

ARTICLE SUMMARY:
${summary || "(no summary available)"}

${topicClause}YOUR TASK — produce a JSON object with exactly three keys:

1. "bullets" — an array of exactly 5 strings.
   Each bullet is a concise, factual takeaway DIRECTLY supported by the title and summary above.
   Do NOT invent statistics, quotes, or claims not present in the source material.

2. "steps" — an array of 5 to 8 strings.
   Each step is a concrete, actionable thing the reader can do to apply or deepen their understanding of the article's subject.
   Steps should be practical (research, discuss, build, write, compare) — not vague platitudes.

3. "exercises" — an array of exactly 3 objects, each with:
   • "q" — a thought-provoking question grounded in the article content.
   • "a" — a concise model answer (2-3 sentences) that a reader could use to self-check.

STRICT RULES:
- ONLY use information from the title and summary provided.  Never fabricate quotes, names, numbers, or facts.
- If the summary is empty or too short to derive meaningful content, return the JSON with helpful generic study-skill advice related to the title — but flag this clearly in the first bullet: "Note: limited source material — guidance below is general."
- Keep language clear, direct, and free of jargon where possible.
- Do NOT wrap the JSON in markdown code fences.  Return raw JSON only.`;
}

// ---------------------------------------------------------------------------
// Parse + validate the LLM response
// ---------------------------------------------------------------------------

function parseResponse(raw: string): PracticeContent | null {
  try {
    // Strip markdown fences if the model added them anyway
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    const obj = JSON.parse(cleaned);

    // Validate shape
    if (
      !Array.isArray(obj.bullets) ||
      !Array.isArray(obj.steps) ||
      !Array.isArray(obj.exercises)
    ) {
      return null;
    }

    const bullets: string[] = obj.bullets
      .filter((b: unknown) => typeof b === "string")
      .slice(0, 5);

    const steps: string[] = obj.steps
      .filter((s: unknown) => typeof s === "string")
      .slice(0, 8);

    const exercises: { q: string; a: string }[] = obj.exercises
      .filter(
        (e: unknown) =>
          typeof e === "object" &&
          e !== null &&
          typeof (e as Record<string, unknown>).q === "string" &&
          typeof (e as Record<string, unknown>).a === "string"
      )
      .slice(0, 3)
      .map((e: { q: string; a: string }) => ({ q: e.q, a: e.a }));

    if (bullets.length === 0 && steps.length === 0 && exercises.length === 0) {
      return null;
    }

    return { bullets, steps, exercises };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a thorough AI answer for a specific exercise question,
 * grounded in the article's title and summary.
 *
 * Returns `null` on failure so the caller can fall back.
 */
export async function generateHelpAnswer(
  title: string,
  summary: string,
  question: string
): Promise<string | null> {
  try {
    const client = getClient();

    const prompt = `You are a knowledgeable tutor helping a reader understand a news article.

ARTICLE TITLE:
${title}

ARTICLE SUMMARY:
${summary || "(no summary available)"}

EXERCISE QUESTION:
${question}

Write a clear, thorough answer to the exercise question above (4-6 sentences).

STRICT RULES:
- ONLY use information that can be reasonably inferred from the title and summary. Never invent quotes, names, statistics, or facts not present in the source material.
- Be specific and reference details from the article where possible.
- Structure your answer so it directly addresses the question first, then expands with reasoning.
- If the source material is too thin to give a strong answer, acknowledge this honestly and provide the best answer you can from what's available.
- Return ONLY the answer text. No preamble, no "Answer:" prefix, no markdown formatting.`;

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0.5,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content: "You are a helpful tutor. Respond with only the answer text, nothing else.",
        },
        { role: "user", content: prompt },
      ],
    });

    const text = completion.choices[0]?.message?.content?.trim();
    return text || null;
  } catch (err) {
    console.error("[llm] Help answer generation failed:", err);
    return null;
  }
}

/**
 * Call the LLM to generate practice content for an article.
 *
 * Returns `null` when the call fails or the response can't be parsed,
 * allowing the caller to fall back to the mock generator.
 */
export async function generateWithLLM(
  title: string,
  summary: string,
  topics: string[]
): Promise<PracticeContent | null> {
  try {
    const client = getClient();
    const prompt = buildPrompt(title, summary, topics);

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0.4,
      max_tokens: 1500,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a JSON-only assistant.  Always respond with valid JSON.  No markdown, no commentary outside the JSON object.",
        },
        { role: "user", content: prompt },
      ],
    });

    const text = completion.choices[0]?.message?.content;
    if (!text) return null;

    return parseResponse(text);
  } catch (err) {
    console.error("[llm] Generation failed:", err);
    return null;
  }
}
