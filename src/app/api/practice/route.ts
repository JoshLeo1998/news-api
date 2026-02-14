import { NextRequest, NextResponse } from "next/server";
import { generateWithLLM } from "@/lib/llm";
import { generateFallbackContent, type PracticeContent } from "@/lib/practice";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

interface PracticeRequest {
  title: string;
  summary: string;
  topics: string[];
}

function validateBody(body: unknown): PracticeRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const obj = body as Record<string, unknown>;

  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
  const topics = Array.isArray(obj.topics)
    ? obj.topics.filter((t): t is string => typeof t === "string").map((t) => t.trim()).filter(Boolean)
    : [];

  if (!title) return null; // title is the minimum requirement

  return { title, summary, topics };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const input = validateBody(body);

    if (!input) {
      return NextResponse.json(
        { ok: false, error: "Invalid request body. At minimum, `title` (string) is required." },
        { status: 400 }
      );
    }

    let content: PracticeContent | null = null;
    let source: "llm" | "fallback" = "llm";

    // Attempt real LLM generation
    if (process.env.OPENAI_API_KEY) {
      content = await generateWithLLM(input.title, input.summary, input.topics);
    }

    // Fallback: mock generator
    if (!content) {
      source = "fallback";
      content = generateFallbackContent(input.title, input.summary);
    }

    return NextResponse.json(
      { ok: true, source, ...content },
      { status: 200 }
    );
  } catch (err) {
    console.error("[api/practice] Unexpected error:", err);

    return NextResponse.json(
      { ok: false, error: "Failed to generate practice content" },
      { status: 500 }
    );
  }
}
