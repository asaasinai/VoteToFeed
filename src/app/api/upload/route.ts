import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

export const dynamic = "force-dynamic";

// Accepted MIME types
const ACCEPTED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
]);

// Accepted extensions (fallback check)
const ACCEPTED_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif",
]);

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB per file
const MAX_FILES = 10;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const files = formData.getAll("photos") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Maximum ${MAX_FILES} photos allowed` }, { status: 400 });
    }

    // Ensure upload directory exists
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });

    const urls: string[] = [];

    for (const file of files) {
      // Validate file type
      const ext = path.extname(file.name).toLowerCase();
      const isValidType = ACCEPTED_TYPES.has(file.type) || ACCEPTED_EXTENSIONS.has(ext);

      if (!isValidType) {
        return NextResponse.json(
          { error: `Unsupported file type: ${file.name}. Accepted: JPG, PNG, GIF, WebP, HEIC` },
          { status: 400 }
        );
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File too large: ${file.name}. Maximum 20MB per file.` },
          { status: 400 }
        );
      }

      // Generate unique filename
      const uniqueId = crypto.randomBytes(12).toString("hex");
      const safeExt = ext || ".jpg";
      const filename = `${uniqueId}${safeExt}`;
      const filepath = path.join(uploadDir, filename);

      // Write file to disk
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(filepath, buffer);

      // Return public URL
      urls.push(`/uploads/${filename}`);
    }

    return NextResponse.json({ urls });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
