import { ExpiredError, NotConnectedError } from "./publish";
import { loadLinkedIn } from "./tokens";

export const LINKEDIN_CONNECT_PATH = "/api/linkedin/connect";

// The commentary field treats these characters as markup, so escape them
const RESERVED = /[\\|{}@\[\]()<>#*_~]/g;
const escapeCommentary = (s: string) => s.replace(RESERVED, (m) => "\\" + m);

export async function postToLinkedIn(text: string) {
  const auth = await loadLinkedIn();
  if (!auth)
    throw new NotConnectedError(
      `LinkedIn not connected. Connect at ${LINKEDIN_CONNECT_PATH}`,
    );
  if (Date.now() >= auth.expiresAt)
    throw new ExpiredError(
      `LinkedIn connection expired. Reconnect at ${LINKEDIN_CONNECT_PATH}`,
    );

  const res = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "Linkedin-Version": process.env.LINKEDIN_VERSION ?? "202609",
    },
    body: JSON.stringify({
      author: auth.personUrn,
      commentary: escapeCommentary(text),
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });

  if (res.status !== 201) {
    const detail = await res.text();
    console.error("LinkedIn post failed", res.status, detail);
    throw new Error(`LinkedIn error ${res.status}: ${detail}`);
  }

  const id = res.headers.get("x-restli-id") ?? undefined;
  return {
    id,
    url: id ? `https://www.linkedin.com/feed/update/${id}/` : undefined,
  };
}
