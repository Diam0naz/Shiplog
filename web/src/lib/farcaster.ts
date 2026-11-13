import { mnemonicToAccount } from "viem/accounts";
import { NotConnectedError } from "./publish";
import { loadFarcaster, saveFarcaster, type FarcasterAuth } from "./tokens";
import type { PostImage } from "./images";

/**
 * Farcaster via Neynar **managed signers** (SIWN is deprecated).
 *
 * Flow:
 *  1. createManagedSigner — create a signer, sign a key request with the app's
 *     developer account (EIP-712), register it, and store it as pending with an
 *     approval URL.
 *  2. The user opens that URL in their Farcaster wallet (Warpcast) and approves.
 *  3. refreshSignerStatus — poll Neynar; once approved, hydrate the profile and
 *     mark the stored signer approved.
 *  4. postToFarcaster — cast with the approved signer.
 *
 * Server config:
 *  - FARCASTER_API_KEY            Neynar API key
 *  - FARCASTER_DEVELOPER_MNEMONIC seed phrase of the app's Farcaster account
 *  - FARCASTER_DEVELOPER_FID      (optional) the app's FID; derived from the
 *                                 mnemonic's custody address when omitted
 */

export const FARCASTER_CONNECT_PATH = "/connect/farcaster";

const apiBase = () =>
  (process.env.FARCASTER_API_BASE ?? "https://api.neynar.com/v2").replace(
    /\/$/,
    "",
  );

const neynarHeaders = () => {
  const key = process.env.FARCASTER_API_KEY;
  if (!key) throw new Error("FARCASTER_API_KEY is not set (Neynar API key)");
  return { "x-api-key": key, "Content-Type": "application/json" };
};

// Farcaster's SignedKeyRequestValidator on Optimism (chain id 10).
const SIGNED_KEY_REQUEST_VALIDATOR =
  "0x00000000fc700472606ed4fa22623acf62c60553" as const;
const SIGNED_KEY_REQUEST_TYPE = {
  SignedKeyRequest: [
    { name: "requestFid", type: "uint256" },
    { name: "key", type: "bytes" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

function developerAccount() {
  const mnemonic = process.env.FARCASTER_DEVELOPER_MNEMONIC;
  if (!mnemonic)
    throw new Error(
      "FARCASTER_DEVELOPER_MNEMONIC is not set (your app's developer Farcaster seed phrase)",
    );
  return mnemonicToAccount(mnemonic.trim());
}

/** The app's developer FID, from env or derived from the custody address. */
async function developerFid(): Promise<number> {
  const env = process.env.FARCASTER_DEVELOPER_FID;
  if (env && /^\d+$/.test(env.trim())) return Number(env.trim());

  const account = developerAccount();
  const res = await fetch(
    `${apiBase()}/farcaster/user/custody-address?custody_address=${account.address}`,
    { headers: neynarHeaders() },
  );
  if (!res.ok)
    throw new Error(
      `Could not resolve the developer FID from the custody address (${res.status}); set FARCASTER_DEVELOPER_FID`,
    );
  const fid = ((await res.json()) as { user?: { fid?: number } })?.user?.fid;
  if (!fid)
    throw new Error(
      "No Farcaster developer FID for this mnemonic; set FARCASTER_DEVELOPER_FID",
    );
  return fid;
}

async function signKeyRequest(appFid: number, publicKey: string, deadline: number) {
  return developerAccount().signTypedData({
    domain: {
      name: "Farcaster SignedKeyRequestValidator",
      version: "1",
      chainId: 10,
      verifyingContract: SIGNED_KEY_REQUEST_VALIDATOR,
    },
    types: SIGNED_KEY_REQUEST_TYPE,
    primaryType: "SignedKeyRequest",
    message: {
      requestFid: BigInt(appFid),
      key: publicKey as `0x${string}`,
      deadline: BigInt(deadline),
    },
  });
}

/**
 * Creates a managed signer, registers the signed key, and stores it as pending.
 * Returns the approval URL the user opens in their wallet.
 */
export async function createManagedSigner(userId: string) {
  const cRes = await fetch(`${apiBase()}/farcaster/signer`, {
    method: "POST",
    headers: neynarHeaders(),
    body: JSON.stringify({}),
  });
  if (!cRes.ok)
    throw new Error(`Create signer failed (${cRes.status}): ${await cRes.text()}`);
  const signer = (await cRes.json()) as {
    signer_uuid?: string;
    public_key?: string;
  };
  if (!signer.signer_uuid || !signer.public_key)
    throw new Error("Neynar did not return a signer");

  const appFid = await developerFid();
  const deadline = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  const signature = await signKeyRequest(appFid, signer.public_key, deadline);

  const rRes = await fetch(`${apiBase()}/farcaster/signer/signed_key`, {
    method: "POST",
    headers: neynarHeaders(),
    body: JSON.stringify({
      signer_uuid: signer.signer_uuid,
      app_fid: appFid,
      deadline,
      signature,
    }),
  });
  if (!rRes.ok)
    throw new Error(`Register signer failed (${rRes.status}): ${await rRes.text()}`);
  const reg = (await rRes.json()) as { signer_approval_url?: string };
  if (!reg.signer_approval_url)
    throw new Error("Neynar did not return an approval URL");

  const auth: FarcasterAuth = {
    fid: 0,
    username: "",
    signerUuid: signer.signer_uuid,
    status: "pending_approval",
    approvalUrl: reg.signer_approval_url,
  };
  await saveFarcaster(userId, auth);
  return { signerUuid: signer.signer_uuid, approvalUrl: reg.signer_approval_url };
}

export type SignerState =
  | { status: "none" }
  | { status: "pending_approval"; approvalUrl?: string }
  | { status: "approved"; username: string };

/** Polls the stored signer; promotes it to approved and hydrates the profile. */
export async function refreshSignerStatus(userId: string): Promise<SignerState> {
  const auth = await loadFarcaster(userId);
  if (!auth) return { status: "none" };
  if (auth.status === "approved")
    return { status: "approved", username: auth.username };

  const sRes = await fetch(
    `${apiBase()}/farcaster/signer?signer_uuid=${encodeURIComponent(auth.signerUuid)}`,
    { headers: neynarHeaders() },
  );
  if (!sRes.ok)
    return { status: "pending_approval", approvalUrl: auth.approvalUrl };
  const signer = (await sRes.json()) as { status?: string; fid?: number };
  if (signer.status !== "approved" || !signer.fid)
    return { status: "pending_approval", approvalUrl: auth.approvalUrl };

  let username = "";
  let displayName: string | undefined;
  let pfpUrl: string | undefined;
  try {
    const uRes = await fetch(`${apiBase()}/farcaster/user/bulk?fids=${signer.fid}`, {
      headers: neynarHeaders(),
    });
    const user = ((await uRes.json()) as {
      users?: { username?: string; display_name?: string; pfp_url?: string }[];
    })?.users?.[0];
    username = user?.username ?? "";
    displayName = user?.display_name;
    pfpUrl = user?.pfp_url;
  } catch {
    // Profile hydration is best-effort; approval is what matters.
  }

  await saveFarcaster(userId, {
    ...auth,
    fid: signer.fid,
    username,
    displayName,
    pfpUrl,
    status: "approved",
    approvalUrl: undefined,
  });
  return { status: "approved", username };
}

/** Post a cast using the approved signer. */
export async function postToFarcaster(
  userId: string,
  text: string,
  images: PostImage[] = [],
) {
  const auth = await loadFarcaster(userId);
  if (!auth || auth.status !== "approved")
    throw new NotConnectedError(
      `Farcaster not connected. Connect at ${FARCASTER_CONNECT_PATH}`,
    );

  const res = await fetch(`${apiBase()}/farcaster/cast`, {
    method: "POST",
    headers: neynarHeaders(),
    body: JSON.stringify({
      signer_uuid: auth.signerUuid,
      text,
      ...(images.length
        ? { embeds: images.slice(0, 2).map((i) => ({ url: i.url })) }
        : {}),
    }),
  });
  const body = (await res.json().catch(() => null)) as {
    cast?: { hash?: string };
    message?: string;
    detail?: string;
  } | null;
  if (!res.ok)
    throw new Error(
      `Farcaster error ${res.status}: ${body?.message ?? body?.detail ?? "unknown"}`,
    );
  const hash = body?.cast?.hash;
  if (!hash)
    throw new Error("Farcaster accepted the cast but returned no hash");
  const shortHash = hash.slice(0, 10);
  return { id: hash, url: `https://warpcast.com/${auth.username}/${shortHash}` };
}
