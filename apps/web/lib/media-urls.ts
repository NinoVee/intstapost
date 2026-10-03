import "server-only";
import { signMediaPath } from "@intstapost/media";
import { env } from "./server";

export function mediaUrl(key: string | null | undefined, userId: string): string | null {
  if (!key) return null;
  return signMediaPath(key, userId, env().SIGNED_URL_TTL_SECONDS, env().APP_SECRET);
}
