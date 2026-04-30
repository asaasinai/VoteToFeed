import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import { CHAT_SYSTEM_PROMPT } from "@/lib/chat-knowledge";

type Draft = { subject: string; body: string };

function parseJsonDraft(text: string): { subject?: string; body?: string } | null {
  if (!text) return null;
  const trimmed = text.trim();

  try {
    const obj = JSON.parse(trimmed);
    if (obj && typeof obj === "object") return obj;
  } catch { /* fall through */ }

  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) return null;
  const sliced = trimmed.slice(jsonStart, jsonEnd + 1);

  try {
    return JSON.parse(sliced);
  } catch {
    try {
      return JSON.parse(sliced.replace(/\r\n|\n|\r/g, "\\n").replace(/\t/g, "\\t"));
    } catch {
      return null;
    }
  }
}

function isUsable(parsed: { subject?: string; body?: string } | null): parsed is Draft {
  return !!parsed && typeof parsed.subject === "string" && typeof parsed.body === "string" && parsed.body.trim().length > 30;
}

function buildFallback(name: string, ticketShort: string, ticketProblem: string, reason: string) {
  const firstName = (name && name !== "there") ? name.split(" ")[0] : null;
  const greeting = firstName ? `Hi ${firstName},` : "Hi there,";
  const body = `${greeting}

Thanks for reaching out about: "${ticketProblem.slice(0, 200)}".

We've received your ticket #${ticketShort} and someone from our team will look into it and get back to you within 24–48 hours.

If you have any extra details that would help us help you faster, just reply to this email.

Reply to this email if you need anything else. — VoteToFeed Support 🐾`;
  return {
    subject: `Re: Your VoteToFeed support ticket #${ticketShort}`,
    body,
    fallback: true,
    fallbackReason: reason,
  };
}

function buildSystemInstruction(transcript: string) {
  return `You are a senior customer-support agent for VoteToFeed. You are drafting a reply email that will be sent from support@votetofeed.com to a real customer who opened a support ticket. The reply MUST directly answer their actual question using the product knowledge below — do NOT just say "we'll look into it" if you can answer.

──────── PRODUCT KNOWLEDGE ────────
${CHAT_SYSTEM_PROMPT}
──────── END KNOWLEDGE ────────

Email-writing rules:
- Address the customer by their first name if available.
- Directly answer the customer's actual question using the knowledge above.
- Be specific: numbers, links, concrete steps. Reference real VoteToFeed features.
- Tone: warm, human, direct. No corporate jargon.
- Body 100–250 words. Plain text. Blank lines between paragraphs.
- Subject must be specific to the issue (NOT "We received your ticket").
- End the body with: "Reply to this email if you need anything else. — VoteToFeed Support 🐾"

Output format: ONLY a JSON object with exactly two string keys: "subject" and "body". No markdown wrapping, no commentary, no code fences.${transcript ? `

Conversation transcript so far:
"""
${transcript}
"""` : ""}`;
}

async function tryGemini(
  systemInstruction: string,
  userPrompt: string,
  modelName: string,
  useJsonMime: boolean,
  errors: string[],
): Promise<Draft | null> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;
  try {
    const gemini = new GoogleGenerativeAI(apiKey);
    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: 1500,
      temperature: 0.7,
    };
    if (useJsonMime) {
      generationConfig.responseMimeType = "application/json";
    }
    const model = gemini.getGenerativeModel({ model: modelName, systemInstruction, generationConfig });
    const result = await model.generateContent(userPrompt);
    const text = result.response.text();
    const parsed = parseJsonDraft(text);
    if (isUsable(parsed)) return { subject: parsed.subject, body: parsed.body };
    errors.push(`gemini ${modelName}${useJsonMime ? "/json" : ""}: unusable output`);
    return null;
  } catch (err) {
    errors.push(`gemini ${modelName}${useJsonMime ? "/json" : ""}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function tryAnthropic(
  systemInstruction: string,
  userPrompt: string,
  errors: string[],
): Promise<Draft | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system: systemInstruction,
      messages: [{ role: "user", content: userPrompt }],
    });
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n");
    const parsed = parseJsonDraft(text);
    if (isUsable(parsed)) return { subject: parsed.subject, body: parsed.body };
    errors.push(`anthropic: unusable output`);
    return null;
  } catch (err) {
    errors.push(`anthropic: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string })?.role;
    if (!session?.user || role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: { conversationId?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const conversationId = body.conversationId;
    if (!conversationId || typeof conversationId !== "string") {
      return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
    }

    const conversation = await prisma.chatConversation.findUnique({
      where: { id: conversationId },
      include: {
        user: { select: { name: true, email: true } },
        messages: { orderBy: { createdAt: "asc" }, take: 50 },
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const name = conversation.user?.name || conversation.userName || "there";
    const customerEmail = conversation.user?.email || conversation.userEmail || "the customer";
    const ticketProblem = conversation.ticketProblem || conversation.lastMessage || "(no ticket description on file)";
    const ticketShort = conversation.id.slice(-8).toUpperCase();

    const transcript = conversation.messages
      .map((m) => {
        const who = m.role === "USER" ? "Customer" : m.role === "ADMIN" ? "Admin" : "AI";
        return `${who}: ${m.content}`;
      })
      .join("\n\n");

    const systemInstruction = buildSystemInstruction(transcript);

    const userPrompt = `Ticket #${ticketShort}
Customer: ${name} <${customerEmail}>

The customer's main issue (what they asked support for):
"""
${ticketProblem}
"""

Now draft the support email reply. Answer their actual question using the product knowledge in the system prompt. Return ONLY a JSON object: {"subject": "...", "body": "..."}.`;

    const errors: string[] = [];
    const attempts: Array<() => Promise<Draft | null>> = [
      () => tryGemini(systemInstruction, userPrompt, "gemini-2.0-flash", true, errors),
      () => tryGemini(systemInstruction, userPrompt, "gemini-1.5-flash", true, errors),
      () => tryGemini(systemInstruction, userPrompt, "gemini-1.5-flash", false, errors),
      () => tryAnthropic(systemInstruction, userPrompt, errors),
    ];

    for (const attempt of attempts) {
      const result = await attempt();
      if (result) return NextResponse.json(result);
    }

    console.error("[generate-email] All AI providers failed:", errors);
    return NextResponse.json(
      buildFallback(name, ticketShort, ticketProblem, errors.join(" | ") || "All AI providers failed"),
    );
  } catch (e) {
    console.error("[admin/chat/generate-email] POST:", e);
    return NextResponse.json(
      { error: "Couldn't generate email draft. Please try again later." },
      { status: 500 },
    );
  }
}
