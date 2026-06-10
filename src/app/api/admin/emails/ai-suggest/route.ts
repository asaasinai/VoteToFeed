import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";

// --- Subject generation ---

function buildSubjectPrompt(text: string) {
  return `Read this customer support message and write a short, specific email subject line (max 8 words, no quotes, no prefixes like "Re:" or "Subject:").

Customer message:
"""
${text.slice(0, 1500)}
"""

Return ONLY the subject line text, nothing else.`;
}

async function suggestSubjectWithGemini(text: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;
  try {
    const gemini = new GoogleGenerativeAI(apiKey);
    const model = gemini.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: { maxOutputTokens: 60, temperature: 0.4 },
    });
    const result = await model.generateContent(buildSubjectPrompt(text));
    const out = result.response.text().trim().replace(/^["'`]+|["'`]+$/g, "").replace(/^(Re:|Subject:|FW:)\s*/i, "").trim();
    if (out.length > 5 && out.length < 100) return out;
    return null;
  } catch {
    return null;
  }
}

async function suggestSubjectWithAnthropic(text: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 60,
      messages: [{ role: "user", content: buildSubjectPrompt(text) }],
    });
    const out = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim()
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/^(Re:|Subject:|FW:)\s*/i, "")
      .trim();
    if (out.length > 5 && out.length < 100) return out;
    return null;
  } catch {
    return null;
  }
}

// --- Body (reply draft) generation ---

function buildBodyPrompt(customerMessage: string, ticketIssue?: string) {
  const issueContext = ticketIssue
    ? `The support ticket is about: "${ticketIssue}"\n\n`
    : "";
  return `You are a friendly and professional customer support agent for VoteToFeed, a pet photo contest platform where users vote for pets and help feed shelter animals.

${issueContext}The customer sent this message:
"""
${customerMessage.slice(0, 2000)}
"""

Write a helpful, warm, and concise reply email body. Address the customer's concern directly. Do NOT include a greeting line (no "Hi" or "Dear") and do NOT include a sign-off (no "Best regards"). Write only the body paragraphs. Keep it under 120 words.`;
}

async function draftBodyWithGemini(customerMessage: string, ticketIssue?: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;
  try {
    const gemini = new GoogleGenerativeAI(apiKey);
    const model = gemini.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: { maxOutputTokens: 300, temperature: 0.6 },
    });
    const result = await model.generateContent(buildBodyPrompt(customerMessage, ticketIssue));
    const out = result.response.text().trim();
    if (out.length > 20) return out;
    return null;
  } catch {
    return null;
  }
}

async function draftBodyWithAnthropic(customerMessage: string, ticketIssue?: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{ role: "user", content: buildBodyPrompt(customerMessage, ticketIssue) }],
    });
    const out = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim();
    if (out.length > 20) return out;
    return null;
  } catch {
    return null;
  }
}

// --- Route ---

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string })?.role;
    if (!session?.user || role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: { text?: string; mode?: string; ticketIssue?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const text = body.text?.trim();
    if (!text || text.length < 5) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    // mode=body → generate a reply body draft
    if (body.mode === "body") {
      const replyBody =
        (await draftBodyWithGemini(text, body.ticketIssue)) ??
        (await draftBodyWithAnthropic(text, body.ticketIssue)) ??
        null;

      if (!replyBody) {
        return NextResponse.json({ error: "AI unavailable" }, { status: 503 });
      }
      return NextResponse.json({ body: replyBody });
    }

    // default → generate subject
    const subject =
      (await suggestSubjectWithGemini(text)) ??
      (await suggestSubjectWithAnthropic(text)) ??
      null;

    if (!subject) {
      return NextResponse.json({ error: "AI unavailable" }, { status: 503 });
    }

    return NextResponse.json({ subject });
  } catch (e) {
    console.error("[admin/emails/ai-suggest] POST:", e);
    return NextResponse.json({ error: "Failed to generate suggestion" }, { status: 500 });
  }
}
