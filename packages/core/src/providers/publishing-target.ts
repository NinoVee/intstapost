import type { PublishAuthorization } from "../policy/approval";

export type ContentFormat = "post" | "carousel" | "story" | "reel";

export interface PublishingCapabilities {
  formats: ContentFormat[];
  /**
   * Instagram's official API has no "create native draft" endpoint, so this is
   * false and all drafts are INTERNAL drafts inside this app.
   */
  nativeDrafts: boolean;
  maxCarouselItems: number;
  reelMaxSeconds: number;
}

export interface PublishRequest {
  authorization: PublishAuthorization;
  format: ContentFormat;
  caption: string;
  /** Public, short-lived signed URLs the platform fetches media from. */
  mediaUrls: string[];
  coverUrl?: string;
}

export interface PublishingTarget {
  readonly platform: "instagram";
  readonly capabilities: PublishingCapabilities;
  /** Requires a PublishAuthorization, which only `authorizePublish` can produce. */
  publish(req: PublishRequest): Promise<{ externalId: string; permalink?: string }>;
}
