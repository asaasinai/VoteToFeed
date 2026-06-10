import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const dynamic = "force-dynamic";

// POST /api/admin/demo-studio/generate-post
// Body: { imageUrl, petName, petType, petBreed?, postType? }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY is not configured" }, { status: 503 });
  }

  const { imageUrl, petName, petType, petBreed, postType = "POST" } = await req.json() as {
    imageUrl: string;
    petName: string;
    petType: string;
    petBreed?: string;
    postType?: "POST" | "STORY";
  };

  if (!imageUrl || !petName) {
    return NextResponse.json({ error: "imageUrl and petName are required" }, { status: 400 });
  }

  // Fetch the image and convert to base64
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    return NextResponse.json({ error: "Could not fetch image" }, { status: 400 });
  }
  const imgBuffer = await imgRes.arrayBuffer();
  const base64 = Buffer.from(imgBuffer).toString("base64");
  const mimeType = imgRes.headers.get("content-type") || "image/jpeg";

  const breedInfo = petBreed ? ` (${petBreed})` : "";
  const typeLabel = petType === "DOG" ? "dog" : petType === "CAT" ? "cat" : "pet";

  const prompt =
    postType === "STORY"
      ? `You are writing a fun, engaging Instagram Story caption for a ${typeLabel} named ${petName}${breedInfo}.
Look at this photo and write:
1. A short, punchy caption (max 15 words) that captures the vibe
2. 5 relevant emojis to overlay on the story
3. A suggested story text overlay (1 line, energetic, playful)

Reply in this exact JSON format:
{
  "caption": "...",
  "emojis": ["🐾","❤️","✨","🐶","😍"],
  "overlay": "..."
}`
      : `You are writing a compelling social media post for a ${typeLabel} named ${petName}${breedInfo} competing in a pet photo contest on VoteToFeed.com.
Look at this photo and write:
1. An engaging post caption (2-3 sentences, warm and personal, encourage voting)
2. 5-8 relevant hashtags
3. A short call-to-action sentence (e.g., "Vote for ${petName} today!")

Reply in this exact JSON format:
{
  "caption": "...",
  "hashtags": ["#PetContest","#VoteToFeed"],
  "cta": "..."
}`;

  try {
    const gemini = new GoogleGenerativeAI(apiKey);
    const model = gemini.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: { maxOutputTokens: 400, temperature: 0.8 },
    });

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64,
          mimeType: mimeType as string,
        },
      },
    ]);

    let text = result.response.text().trim();
    // Strip markdown code fences if present
    text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

    const parsed = JSON.parse(text);
    return NextResponse.json({ result: parsed, postType });
  } catch (err) {
    console.error("[generate-post] Gemini error:", err);
    return NextResponse.json({ error: "AI generation failed. Check GEMINI_API_KEY." }, { status: 500 });
  }
}
