import { NextRequest, NextResponse } from "next/server";
import { createCliCode, SESSION_COOKIE, userFromToken } from "@/lib/session";

/**
 * The URL `shiplog login` opens. A route handler rather than a page: this is a
 * pure redirect, and a page would be partially prerendered, which turns the
 * redirect into a client-side one the CLI's plain HTTP client cannot follow.
 *
 * Signed out -> GitHub. Signed in -> a single-use code handed to the CLI's
 * loopback listener.
 */
const html = (title: string, body: string) =>
  new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
      `<body style="font-family:system-ui;padding:40px;line-height:1.5">` +
      `<h1 style="font-size:20px">${title}</h1><p>${body}</p></body>`,
    { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );

export async function GET(req: NextRequest) {
  const port = req.nextUrl.searchParams.get("port");
  const state = req.nextUrl.searchParams.get("state");
  if (!port || !/^\d{2,5}$/.test(port) || !state)
    return html(
      "Invalid login request",
      "Run <code>shiplog login</code> again to start a new sign-in.",
    );

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await userFromToken(token) : null;

  if (!user) {
    const next = `/cli/login?port=${encodeURIComponent(port)}&state=${encodeURIComponent(state)}`;
    return NextResponse.redirect(
      new URL(`/api/github/connect?next=${encodeURIComponent(next)}`, req.url),
    );
  }

  const code = await createCliCode(user.id);
  return NextResponse.redirect(
    `http://127.0.0.1:${port}/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
  );
}
