/** Shared types for the publish path. */

export type Platform = "linkedin" | "x";

export const PLATFORMS: Platform[] = ["linkedin", "x"];

export const PLATFORM_LABELS: Record<Platform, string> = {
  linkedin: "LinkedIn",
  x: "X",
};

/** No credential stored for this platform yet. */
export class NotConnectedError extends Error {}

/** A stored credential can no longer be used without reconnecting. */
export class ExpiredError extends Error {}

export function isPlatform(value: unknown): value is Platform {
  return value === "linkedin" || value === "x";
}
