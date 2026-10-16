"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import type { SiteItem } from "@/components/network-watch/NetworkMap";

const NetworkMap = dynamic(() => import("@/components/network-watch/NetworkMap"), {
  ssr: false, loading: () => <div style={{ padding: 30, color: "#111827" }}>Memuat peta Bali…</div>,
});
interface ApiResponse {
  success: boolean;
  generatedAt?: string;
  error?: string;
  counts: { total: number; green: number; yellow: number; red: number; unknown: number };
  sites: SiteItem[];
  analytics?: {
    topPayloadSites: { siteid: string; payloadMb: number | null }[];
    hourly: HourlyPoint[];
  };
}
interface HourlyPoint {
  dateHour: string;
  payloadMb: number | null;
  maxUtilization: number | null;
  maxUser: number | null;
}
type HourlyMetric = "payloadMb" | "maxUtilization" | "maxUser";

function formatPayload(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} TB`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)} GB`;
  return `${value.toFixed(0)} MB`;
}

function formatMetric(metric: HourlyMetric, value: number | null) {
  if (value === null) return "N/A";
  if (metric === "payloadMb") return formatPayload(value);
  if (metric === "maxUtilization") return `${value.toFixed(1)}%`;
  return value.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

function formatHourLabel(value: string) {
  const [date, time] = value.split(" ");
  return `${date.slice(8, 10)}/${date.slice(5, 7)} ${time?.slice(0, 5) ?? ""}`;
}

function HourlyChart({ title, data, metric, color }: {
  title: string; data: HourlyPoint[]; metric: HourlyMetric; color: string;
}) {
  const valid = data.flatMap((point, index) => {
    const value = point[metric];
    return value === null ? [] : [{ index, value, dateHour: point.dateHour }];
  });
  const maxValue = Math.max(1, ...valid.map(point => point.value));
  const lastIndex = Math.max(1, data.length - 1);
  const graphPoints = valid.map(point => ({
    ...point,
    x: point.index / lastIndex * 320,
    y: 58 - point.value / maxValue * 46,
  }));
  const linePoints = graphPoints.map(point => `${point.x},${point.y}`).join(" ");
  const latest = valid.at(-1);

  return (
    <section className="analytics-chart">
      <div className="analytics-chart-heading">
        <h3>{title}</h3>
        <strong>{formatMetric(metric, latest?.value ?? null)}</strong>
      </div>
      {graphPoints.length ? <>
        <svg className="hourly-chart" viewBox="0 0 320 68" role="img" aria-label={title}>
          <line x1="0" y1="58" x2="320" y2="58" stroke="#dbe3ed" strokeWidth="1" />
          <line x1="0" y1="35" x2="320" y2="35" stroke="#edf1f5" strokeWidth="1" />
          <polygon points={`0,58 ${linePoints} 320,58`} fill={color} opacity=".1" />
          <polyline points={linePoints} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {graphPoints.filter((_, index) => index === graphPoints.length - 1).map(point => (
            <circle key={point.dateHour} cx={point.x} cy={point.y} r="3" fill={color} />
          ))}
        </svg>
        <div className="chart-time-labels"><span>{formatHourLabel(valid[0].dateHour)}</span><span>{formatHourLabel(latest!.dateHour)}</span></div>
      </> : <div className="chart-empty">Belum ada data mingguan</div>}
    </section>
  );
}

export default function NetworkWatchPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/network-watch", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Gagal mengambil data.");
      setData(json);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const sites = data?.sites || [];
  const uniqueSectors = new Map<string, SiteItem>();
  for (const site of sites) {
    const key = `${site.siteid}::${site.sector ?? site.id}`;
    if (!uniqueSectors.has(key)) uniqueSectors.set(key, site);
  }
  const sectorSites = [...uniqueSectors.values()];

  const counts = {
    total: sectorSites.length,
    green: sectorSites.filter(s => s.status === "GREEN").length,
    yellow: sectorSites.filter(s => s.status === "YELLOW").length,
    red: sectorSites.filter(s => s.status === "RED").length,
  };
  const analytics = data?.analytics;
  const topPayloadSites = analytics?.topPayloadSites ?? [];
  const maxPayload = Math.max(1, ...topPayloadSites.map(site => site.payloadMb ?? 0));

  return (
    <main className="dashboard">
      <div className="map-wrap">
        <NetworkMap sites={sites} selectedId={selectedId} onSelect={setSelectedId} />
      </div>

      {error && <div className="error-banner">{error} <button onClick={() => void load()}>Coba lagi</button></div>}

      <section className="top-panel">
        <div className="brand-row"><span className="brand-icon">📡</span><div>
          <h1>Network Monitoring - SPBU Bali</h1>
          <div className="subtitle">Live KPI Monitoring · Site-sector 4G · Auto refresh 60 detik</div>
        </div></div>
        <div className="kpi-grid">
          <div className="kpi total"><strong>{loading ? "…" : counts.total}</strong><span>Total Sector</span></div>
          <div className="kpi green"><strong>{counts.green}</strong><span>Healthy</span></div>
          <div className="kpi yellow"><strong>{counts.yellow}</strong><span>Warning</span></div>
          <div className="kpi red"><strong>{counts.red}</strong><span>Critical</span></div>
        </div>
        {data?.generatedAt && <div className="subtitle">Data diperbarui: {new Date(data.generatedAt).toLocaleString("id-ID")}</div>}
      </section>

      <aside className="analytics-panel" aria-label="Analitik mingguan">
        <section className="top-payload-section">
          <h3>Top 10 site contributor (payload)</h3>
          {topPayloadSites.length ? <ol className="payload-ranking">
            {topPayloadSites.map((site, index) => {
              const payload = site.payloadMb ?? 0;
              return (
                <li key={site.siteid}>
                  <span className="payload-rank">{String(index + 1).padStart(2, "0")}</span>
                  <div className="payload-site-content">
                    <div className="payload-site-label"><strong>{site.siteid}</strong><span>{formatPayload(payload)}</span></div>
                    <div className="payload-track"><span style={{ width: `${Math.max(2, payload / maxPayload * 100)}%` }} /></div>
                  </div>
                </li>
              );
            })}
          </ol> : <div className="chart-empty">Belum ada data payload</div>}
        </section>
        <HourlyChart title="Payload hourly" data={analytics?.hourly ?? []} metric="payloadMb" color="#0f766e" />
        <HourlyChart title="Max utilisasi" data={analytics?.hourly ?? []} metric="maxUtilization" color="#d97706" />
        <HourlyChart title="Max user" data={analytics?.hourly ?? []} metric="maxUser" color="#2563eb" />
      </aside>

      <section className="legend">
        <div className="legend-title">Status KPI</div>
        <div className="legend-row"><span className="dot green" /> DL PRB 50%</div>
        <div className="legend-row"><span className="dot yellow" /> DL PRB (50-90%)</div>
        <div className="legend-row"><span className="dot red" /> DL PRB &gt;90%</div>
      </section>
    </main>
  );
}
