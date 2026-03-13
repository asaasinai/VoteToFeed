import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { put } from "@vercel/blob";

export const dynamic = "force-dynamic";

const ACCEPTED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const ACCEPTED_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif",
]);

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB per file
const MAX_FILES = 10;

function validateFile(file: File) {
  const ext = path.extname(file.name).toLowerCase();
  const isValidType = ACCEPTED_TYPES.has(file.type) || ACCEPTED_EXTENSIONS.has(ext);

  if (!isValidType) {
    return `Unsupported file type: ${file.name}. Accepted: JPG, PNG, GIF, WebP, HEIC`;
  }

  if (file.size > MAX_FILE_SIZE) {
    return `File too large: ${file.name}. Maximum 20MB per file.`;
  }

  return null;
}

async function uploadToBlob(file: File) {
  const ext = path.extname(file.name).toLowerCase() || ".jpg";
  const baseName = path.basename(file.name, ext).replace(/[^a-zA-Z0-9-_]/g, "-") || "pet-photo";

  const blob = await put(`pets/${baseName}${ext}`, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type || undefined,
  });

  return blob.url;
}

async function uploadToLocalDisk(file: File) {
  const ext = path.extname(file.name).toLowerCase() || ".jpg";
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });

  const uniqueId = crypto.randomBytes(12).toString("hex");
  const filename = `${uniqueId}${ext}`;
  const filepath = path.join(uploadDir, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filepath, buffer);

  return `/uploads/${filename}`;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const files = formData.getAll("photos").filter((value): value is File => value instanceof File);

    if (!files.length) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Maximum ${MAX_FILES} photos allowed` }, { status: 400 });
    }

    for (const file of files) {
      const validationError = validateFile(file);
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }
    }

    const useBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
    const urls: string[] = [];

    for (const file of files) {
      const url = useBlob
        ? await uploadToBlob(file)
        : await uploadToLocalDisk(file);
      urls.push(url);
    }

    return NextResponse.json({ urls, storage: useBlob ? "blob" : "local" });
  } catch (error) {
    console.error("Upload error:", error);

    if (error instanceof Error && /token|blob/i.test(error.message)) {
      return NextResponse.json(
        { error: "Image upload service is misconfigured. Please contact support." },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
