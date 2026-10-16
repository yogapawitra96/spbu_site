export type SiteStatus = "RED" | "YELLOW" | "GREEN" | "UNKNOWN";

export function getSiteStatus(prb: number | null, throughput: number | null): SiteStatus {
  if (prb === null || throughput === null || !Number.isFinite(prb) || !Number.isFinite(throughput)) {
    return "UNKNOWN";
  }
  if (prb >= 90 && throughput < 1.5) return "RED";
  if (prb >= 50 && throughput < 5) return "YELLOW";
  return "GREEN";
}

export function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
