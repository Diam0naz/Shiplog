import { NextResponse } from "next/server";
import { signedBlobUrl } from "@/lib/blob";

/**
 * Public, permanent proxy for private blobs. Code cards and uploaded images are
 * stored privately, but are embedded in public social posts (and Farcaster caps
 * embed URLs at 256 bytes and keeps them forever). This route serves them at a
 * short, stable URL: it presigns a fresh GET internally on each request and
 * streams the bytes, so nothing here ever expires and no credentials leak.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const pathname = path.map((p) => decodeURIComponent(p)).join("/");

  // Only ever serve blobs under our own namespace, and never a traversal.
  if (!pathname.startsWith("shiplog/") || pathname.includes("..")) {
    return new NextResponse("not found", { status: 404 });
  }

  try {
    const signed = await signedBlobUrl(pathname);
    const upstream = await fetch(signed);
    if (!upstream.ok || !upstream.body) {
      return new NextResponse("not found", { status: 404 });
    }
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("not found", { status: 404 });
  }
}
