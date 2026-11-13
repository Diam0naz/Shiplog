import { type PostImage } from "@/lib/images";
import { ExpiredError, NotConnectedError } from "./publish";
import { loadLinkedIn } from "./tokens";

export const LINKEDIN_CONNECT_PATH = "/api/linkedin/connect";

/**
 * The OAuth callback URL. Follows the request origin (so a localhost connect
 * returns to localhost, a production connect to production), with
 * LINKEDIN_REDIRECT_URI as an optional override — matching the GitHub and X
 * flows. Pinning it to one environment is what made local connects bounce to
 * the production callback, where there is no session.
 */
export function linkedinRedirectUri(requestUrl: string) {
  const env = process.env.LINKEDIN_REDIRECT_URI?.trim();
  return env || `${new URL(requestUrl).origin}/api/linkedin/callback`;
}

// The commentary field treats these characters as markup, so escape them
const RESERVED = /[\\|{}@\[\]()<>#*_~]/g;
const escapeCommentary = (s: string) => s.replace(RESERVED, (m) => "\\" + m);

const LI_HEADERS = {
  "X-Restli-Protocol-Version": "2.0.0",
  "Linkedin-Version": process.env.LINKEDIN_VERSION ?? "202609",
};

async function uploadImage(
  auth: { accessToken: string; personUrn: string },
  img: PostImage,
): Promise<{ id: string; altText?: string }> {
  const src = await fetch(img.url);
  if (!src.ok) throw new Error(`could not read image (${src.status})`);
  const bytes = await src.arrayBuffer();

  const init = await fetch(
    "https://api.linkedin.com/rest/images?action=initializeUpload",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        "Content-Type": "application/json",
        ...LI_HEADERS,
      },
      body: JSON.stringify({
        initializeUploadRequest: { owner: auth.personUrn },
      }),
    },
  );
  if (!init.ok)
    throw new Error(`LinkedIn image init ${init.status}: ${await init.text()}`);
  const { value } = (await init.json()) as {
    value: { uploadUrl: string; image: string };
  };

  const up = await fetch(value.uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${auth.accessToken}` },
    body: bytes,
  });
  if (!up.ok) throw new Error(`LinkedIn image upload ${up.status}`);

  return { id: value.image, altText: img.alt };
}

export async function postToLinkedIn(
  userId: string,
  text: string,
  images: PostImage[] = [],
) {
  const auth = await loadLinkedIn(userId);
  if (!auth)
    throw new NotConnectedError(
      `LinkedIn not connected. Connect at ${LINKEDIN_CONNECT_PATH}`,
    );
  if (Date.now() >= auth.expiresAt)
    throw new ExpiredError(
      `LinkedIn connection expired. Reconnect at ${LINKEDIN_CONNECT_PATH}`,
    );

  const uploaded = await Promise.all(images.map((i) => uploadImage(auth, i)));
  const content =
    uploaded.length === 0
      ? undefined
      : uploaded.length === 1
        ? { media: uploaded[0] }
        : { multiImage: { images: uploaded } };

  const res = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "Content-Type": "application/json",
      ...LI_HEADERS,
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
      ...(content ? { content } : {}),
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
