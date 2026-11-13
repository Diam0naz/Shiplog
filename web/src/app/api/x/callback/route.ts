import { NextRequest } from "next/server";
import { userFromCookie } from "@/lib/session";
import { exchangeCode, redirectUriFor } from "@/lib/x";
import { themedError, themedSuccess } from "@/lib/oauth-response";

export async function GET(req: NextRequest) {
  const user = await userFromCookie(req);
  if (!user)
    return themedError("Sign in required", "Please sign in with GitHub first.", undefined, 401);

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const verifier = req.cookies.get("x_verifier")?.value;

  if (!code || !state || state !== req.cookies.get("x_state")?.value) {
    return themedError("Invalid state", "The OAuth state parameter is missing or doesn't match. Please try again.");
  }
  if (!verifier) {
    return themedError("Missing PKCE verifier", "The PKCE verifier cookie is missing. Please start again at /api/x/connect.");
  }

  const params = req.nextUrl.searchParams;
  if (params.get("error")) {
    return themedError(
      "Authorization declined",
      "X declined the authorization request.",
      params.get("error_description") ?? params.get("error") ?? "Unknown error",
      400
    );
  }

  let username: string | undefined;
  try {
    const auth = await exchangeCode(user.id, code, verifier, redirectUriFor(req.url));
    username = auth.username;
  } catch (e) {
    return themedError("Could not connect X", "Failed to complete the X connection.", e instanceof Error ? e.message : "unknown error", 500);
  }

  const res = themedSuccess("X connected", `X connected${username ? " as @" + username : ""}.`);
  res.cookies.delete("x_state");
  res.cookies.delete("x_verifier");
  return res;
}
