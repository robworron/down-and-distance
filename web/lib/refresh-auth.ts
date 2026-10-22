// Who may call POST /api/revalidate: whoever sends
// `Authorization: Bearer <REVALIDATE_SECRET>`. Pure, so it's unit-tested.

import { createHash, timingSafeEqual } from "node:crypto";

export type RefreshAuth = "ok" | "unauthorized" | "unconfigured";

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Check an Authorization header against the secret.
 *
 * - No secret configured (unset, empty or blank): "unconfigured", so the
 *   route fails closed rather than accepting anything.
 * - Anything but exactly "Bearer <token>": "unauthorized".
 * - Otherwise the token and the secret are compared in constant time. Both
 *   are hashed first, so the comparison takes the same time whatever their
 *   lengths (timingSafeEqual itself needs equal lengths).
 */
export function checkRefreshAuth(header: string | null, secret: string | undefined): RefreshAuth {
  if (!secret?.trim()) return "unconfigured";
  const token = /^Bearer (\S+)$/.exec(header ?? "")?.[1];
  if (!token) return "unauthorized";
  return timingSafeEqual(digest(token), digest(secret)) ? "ok" : "unauthorized";
}
