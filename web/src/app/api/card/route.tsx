import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { requireUser } from "@/lib/session";
import { findSecret } from "@/lib/secrets";
import { highlight } from "@/lib/highlight";

const MAX_LINES = 12;
const MAX_COLS = 76;
type Kind = "add" | "del" | "ctx";
type Line = { kind: Kind; text: string };

let font: Promise<Buffer> | undefined;
const getFont = () =>
  (font ??= readFile(join(process.cwd(), "assets/JetBrainsMono-Regular.ttf")));

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");

export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const raw = await req.text();
  if (raw.length > 20_000)
    return NextResponse.json({ error: "snippet too large" }, { status: 413 });

  let b: { file?: unknown; lang?: unknown; title?: unknown; lines?: unknown };
  try {
    b = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (!Array.isArray(b.lines) || b.lines.length === 0)
    return NextResponse.json({ error: "no lines" }, { status: 400 });

  const lines: Line[] = [];
  for (const l of b.lines.slice(0, MAX_LINES)) {
    if (!l || !["add", "del", "ctx"].includes(l.kind) || typeof l.text !== "string")
      return NextResponse.json({ error: "bad line" }, { status: 400 });
    lines.push({ kind: l.kind, text: l.text.replaceAll("\t", "    ").slice(0, MAX_COLS) });
  }

  if (findSecret(lines.map((l) => l.text).join("\n")))
    return NextResponse.json(
      { error: "that snippet looks like it contains a secret, so no card was made" },
      { status: 422 },
    );

  const file = clip(b.file, 60) || "snippet";
  const lang = clip(b.lang, 20);
  const title = clip(b.title, 90);
  const added = lines.filter((l) => l.kind === "add").length;
  const removed = lines.filter((l) => l.kind === "del").length;

  const bg: Record<Kind, string> = {
    add: "rgba(46,160,67,0.20)",
    del: "rgba(248,81,73,0.18)",
    ctx: "transparent",
  };
  const mark: Record<Kind, string> = { add: "+", del: "-", ctx: " " };
  const markColor: Record<Kind, string> = { add: "#3fb950", del: "#f85149", ctx: "#4b5575" };

  const card = (
    <div
      style={{
        width: 1200,
        height: 630,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 56,
        background: "linear-gradient(135deg, #0b1020 0%, #1a1038 100%)",
        fontFamily: "Mono",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          background: "#0f1426",
          border: "1px solid #2a3355",
          borderRadius: 18,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            height: 52,
            padding: "0 20px",
            background: "#141a30",
            borderBottom: "1px solid #2a3355",
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            {["#ff5f56", "#ffbd2e", "#27c93f"].map((c) => (
              <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />
            ))}
          </div>
          <div style={{ display: "flex", marginLeft: 20, color: "#8892b0", fontSize: 18 }}>
            {file}
          </div>
          <div style={{ display: "flex", marginLeft: "auto", color: "#8892b0", fontSize: 16 }}>
            {lang}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", padding: "18px 0" }}>
          {lines.map((l, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                height: 30,
                padding: "0 24px",
                fontSize: 20,
                background: bg[l.kind],
                whiteSpace: "pre",
              }}
            >
              <div style={{ display: "flex", width: 28, color: markColor[l.kind] }}>
                {mark[l.kind]}
              </div>
              {highlight(l.text).map((t, j) => (
                <span key={j} style={{ color: t.color, whiteSpace: "pre" }}>
                  {t.text}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 28,
          color: "#8892b0",
          fontSize: 20,
        }}
      >
        <div style={{ display: "flex" }}>{title}</div>
        <div style={{ display: "flex", color: "#c792ea" }}>shiplog</div>
      </div>
    </div>
  );

  const png = await new ImageResponse(card, {
    width: 1200,
    height: 630,
    fonts: [{ name: "Mono", data: await getFont(), style: "normal", weight: 400 }],
  }).arrayBuffer();

  const blob = await put(`shiplog/${user.id}/cards/${randomUUID()}.png`, png, {
    access: "public",
    contentType: "image/png",
  });

  return NextResponse.json({
    url: blob.url,
    alt: `Code change in ${file}: ${added} line${added === 1 ? "" : "s"} added, ${removed} removed`,
  });
}