export function greeting(timezone: string, now = new Date()): string {
  let hour: number;
  try {
    hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: timezone }).format(now)) % 24;
  } catch {
    hour = now.getUTCHours();
  }
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const FORMAT_LABEL: Record<string, string> = { post: "Post", carousel: "Carousel", story: "Stories", reel: "Reel" };
export const STATUS_LABEL: Record<string, string> = {
  generating: "Generating",
  ready_for_review: "Ready for review",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Published",
  rejected: "Rejected",
  saved_for_later: "Saved for later",
  archived: "Archived",
  failed: "Failed",
};
