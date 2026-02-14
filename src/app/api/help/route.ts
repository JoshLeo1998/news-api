import { NextRequest, NextResponse } from "next/server";
import { generateHelpAnswer } from "@/lib/llm";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

interface HelpRequest {
  title: string;
  summary: string;
  question: string;
}

function validateBody(body: unknown): HelpRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const obj = body as Record<string, unknown>;

  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
  const question = typeof obj.question === "string" ? obj.question.trim() : "";

  if (!title || !question) return null;

  return { title, summary, question };
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
        {
          ok: false,
          error:
            "Invalid request body. `title` (string) and `question` (string) are required.",
        },
        { status: 400 }
      );
    }

    let answer: string | null = null;

    if (process.env.OPENAI_API_KEY) {
      answer = await generateHelpAnswer(
        input.title,
        input.summary,
        input.question
      );
    }

    if (!answer) {
      // Fallback: return a helpful but honest message
      answer =
        "I wasn't able to generate a detailed answer right now. " +
        "Try thinking about how the key concepts in the article — " +
        "as outlined in the summary bullets above — relate to this question. " +
        "Consider the cause-and-effect relationships, the stakeholders involved, " +
        "and what practical implications follow from the article's main points.";
    }

    return NextResponse.json({ ok: true, answer }, { status: 200 });
  } catch (err) {
    console.error("[api/help] Unexpected error:", err);

    return NextResponse.json(
      { ok: false, error: "Failed to generate help answer" },
      { status: 500 }
    );
  }
}
