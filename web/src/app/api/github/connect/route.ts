import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  githubAuthorizeUrl,
  githubRedirectUriFor,
  safeNextPath,
} from "@/lib/github";
import { themedError } from "@/lib/oauth-response";

export async function GET(req: NextRequest) {
  const next = safeNextPath(req.nextUrl.searchParams.get("next"));
  const state = randomBytes(16).toString("hex");

  let url: string;
  try {
    url = githubAuthorizeUrl(state, githubRedirectUriFor(req.url));
  } catch (e) {
    return themedError("Could not start GitHub login", "Failed to build the GitHub authorization URL.", e instanceof Error ? e.message : "unknown error", 500);
  }

  const res = NextResponse.redirect(url);
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  };
  res.cookies.set("gh_state", state, options);
  res.cookies.set("gh_next", next, options);
  return res;
}
