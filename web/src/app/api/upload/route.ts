import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { requireUser } from "@/lib/session";

const MAX_BYTES = 4 * 1024 * 1024; // Vercel caps request bodies near 4.5 MB

// Trust the bytes, not the Content-Type header.
function sniff(b: Uint8Array): { type: string; ext: string } | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return { type: "image/png", ext: "png" };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return { type: "image/jpeg", ext: "jpg" };
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38)
    return { type: "image/gif", ext: "gif" };
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return { type: "image/webp", ext: "webp" };
  return null;
}

export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES)
    return NextResponse.json({ error: "image over 4 MB" }, { status: 413 });

  const ab = await req.arrayBuffer();
  if (ab.byteLength === 0)
    return NextResponse.json({ error: "empty upload" }, { status: 400 });
  if (ab.byteLength > MAX_BYTES)
    return NextResponse.json({ error: "image over 4 MB" }, { status: 413 });

  const kind = sniff(new Uint8Array(ab));
  if (!kind)
    return NextResponse.json(
      { error: "use PNG, JPEG, WebP or GIF" },
      { status: 415 },
    );

  const blob = await put(`shiplog/${user.id}/${randomUUID()}.${kind.ext}`, ab, {
    access: "public",
    contentType: kind.type,
  });
  return NextResponse.json({ url: blob.url });
}
