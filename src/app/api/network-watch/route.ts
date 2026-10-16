import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { spbuDb } from "@/lib/db-spbu";
import { getSiteStatus, numberOrNull } from "@/lib/network-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SpbuRow extends RowDataPacket {
  ID: number | null;
  site_sector: string | null;
  siteid: string | null;
  sector: number | null;
  Long: number | null;
  Lat: number | null;
  spbu: string | null;
  Kode: string | null;
  Area: string | null;
  "Kabupaten/Kota": string | null;
  Latitude: number | null;
  Longitude: number | null;
}
interface KpiRow extends RowDataPacket {
  siteid: string;
  Sector: number;
  Date_Hour: Date | string;
  prb: number | null;
  throughput: number | null;
}
interface TopPayloadRow extends RowDataPacket {
  siteid: string;
  payload_mb: number | null;
}
interface HourlyAnalyticsRow extends RowDataPacket {
  hour: string;
  payload_mb: number | null;
  max_utilization: number | null;
  max_user: number | null;
}

const SITE_IDS = [
  "APR012", "APR013", "APR016", "APR019", "APR033", "APR054", "APR056", "APR091", "APR116", "APR119", "APR127",
  "BLI006", "BLI012", "BLI024", "BLI030", "BLI540", "BLI543",
  "DPR023", "DPR041", "DPR046", "DPR073", "DPR138", "DPR143", "DPR148", "DPR150", "DPR201", "DPR233", "DPR237", "DPR280", "DPR281", "DPR289", "DPR378", "DPR391", "DPR434", "DPR462", "DPR465", "DPR587", "DPR589", "DPR590", "DPR599", "DPR605", "DPR615", "DPR672", "DPR724", "DPR731", "DPR756", "DPR783", "DPR791", "DPR798", "DPR826", "DPR832", "DPR837", "DPR839", "DPR863", "DPR884", "DPR916", "DPR921", "DPR926", "DPR939", "DPR941", "DPR971", "DPR980", "DPR984", "DPR993",
  "GIN002", "GIN010", "GIN016", "GIN020", "GIN022", "GIN033", "GIN038", "GIN060", "GIN098", "GIN109", "GIN118", "GIN121", "GIN137", "GIN142", "GIN143", "GIN173", "GIN176", "GIN177", "GIN184", "GIN203", "GIN229", "GIN245", "GIN266", "GIN283", "GIN555",
  "KLK015", "KLK060", "KLK071", "KLK076", "KLK079", "KLK083", "KLK092", "KLK912",
  "MGW067", "MGW078", "MGW083", "MGW084", "MGW095", "MGW105", "MGW106", "MGW128", "MGW137", "MGW187", "MGW203", "MGW258", "MGW267", "MGW285", "MGW289", "MGW292", "MGW319", "MGW333", "MGW349", "MGW363", "MGW374", "MGW479", "MGW494", "MGW514", "MGW526", "MGW536", "MGW571", "MGW620", "MGW644", "MGW746", "MGW819",
  "NGA001", "NGA005", "NGA010", "NGA012", "NGA027", "NGA029", "NGA042", "NGA056", "NGA067", "NGA086", "NGA114",
  "SGR009", "SGR016", "SGR019", "SGR040", "SGR045", "SGR074", "SGR081", "SGR090", "SGR101", "SGR109", "SGR112", "SGR124", "SGR134", "SGR149", "SGR157", "SGR165", "SGR179", "SGR221", "SGR554",
  "TAB040", "TAB058", "TAB059", "TAB072", "TAB084", "TAB129", "TAB138", "TAB152", "TAB153", "TAB170", "TAB194", "TAB209", "TAB227", "TAB532", "TAB533",
];

export async function GET() {
  try {
    const sitePlaceholders = SITE_IDS.map(() => "?").join(", ");

    // Explicit columns keep the API response small and avoid leaking unrelated SPBU fields.
    const [spbuRows] = await spbuDb.query<SpbuRow[]>(`
      SELECT ID, site_sector, siteid, sector, \`Long\`, Lat, spbu, Kode, Area,
             \`Kabupaten/Kota\`, Latitude, Longitude
      FROM sitelist_spbu
      WHERE siteid IN (${sitePlaceholders})
    `, SITE_IDS);

    // Keep all sectors at one shared latest hour for the requested sites.
    const [kpiRows] = await spbuDb.query<KpiRow[]>(`
      SELECT siteid, Sector, Date_Hour,
             prb_dl AS prb,
             user_dl_throughput_mbps AS throughput
      FROM \`4g_kpi_latest\`
      WHERE siteid IN (${sitePlaceholders})
        AND Date_Hour = (
          SELECT MAX(Date_Hour)
          FROM \`4g_kpi_latest\`
          WHERE siteid IN (${sitePlaceholders})
        )
    `, [...SITE_IDS, ...SITE_IDS]);

    const [topPayloadRows] = await spbuDb.query<TopPayloadRow[]>(`
      SELECT siteid, SUM(payload_mb) AS payload_mb
      FROM \`4g_kpi_latest\`
      WHERE siteid IN (${sitePlaceholders})
        AND date_hour >= NOW() - INTERVAL 7 DAY
      GROUP BY siteid
      ORDER BY payload_mb DESC
      LIMIT 10
    `, SITE_IDS);

    const [hourlyAnalyticsRows] = await spbuDb.query<HourlyAnalyticsRow[]>(`
      SELECT DATE_FORMAT(date_hour, '%Y-%m-%d %H:00:00') AS hour,
             SUM(payload_mb) AS payload_mb,
             MAX(prb_dl) AS max_utilization,
             MAX(maximum_user_number) AS max_user
      FROM \`4g_kpi_latest\`
      WHERE siteid IN (${sitePlaceholders})
        AND date_hour >= NOW() - INTERVAL 7 DAY
      GROUP BY DATE_FORMAT(date_hour, '%Y-%m-%d %H:00:00')
      ORDER BY hour
    `, SITE_IDS);

    const kpiByKey = new Map<string, KpiRow>();
    for (const row of kpiRows) {
      kpiByKey.set(`${String(row.siteid).trim()}::${Number(row.Sector)}`, row);
    }

    const spbuBySiteId = new Map<string, SpbuRow>();
    for (const row of spbuRows) {
      const siteid = String(row.siteid ?? "").trim();
      if (siteid && !spbuBySiteId.has(siteid)) spbuBySiteId.set(siteid, row);
    }
    const representedSiteSectors = new Set(
      spbuRows.map(row => `${String(row.siteid ?? "").trim()}::${numberOrNull(row.sector)}`),
    );

    const sites = spbuRows.map((row, index) => {
      const siteid = String(row.siteid ?? "").trim();
      const sector = numberOrNull(row.sector);
      const kpi = sector === null ? undefined : kpiByKey.get(`${siteid}::${sector}`);
      const prb = numberOrNull(kpi?.prb);
      const throughput = numberOrNull(kpi?.throughput);
      const siteLat = numberOrNull(row.Lat);
      const siteLng = numberOrNull(row.Long);
      const spbuLat = numberOrNull(row.Latitude);
      const spbuLng = numberOrNull(row.Longitude);
      const status = getSiteStatus(prb, throughput);

      return {
        id: `${siteid || "unknown"}-${sector ?? "x"}-${row.ID ?? index}`,
        siteid,
        sector,
        siteSector: row.site_sector,
        spbu: row.spbu,
        kode: row.Kode,
        area: row.Area,
        kabupatenKota: row["Kabupaten/Kota"],
        site: siteLat !== null && siteLng !== null && Math.abs(siteLat) <= 90 && Math.abs(siteLng) <= 180
          ? { lat: siteLat, lng: siteLng } : null,
        spbuLocation: spbuLat !== null && spbuLng !== null && Math.abs(spbuLat) <= 90 && Math.abs(spbuLng) <= 180
          ? { lat: spbuLat, lng: spbuLng } : null,
        prb,
        throughput,
        status,
        dateHour: kpi?.Date_Hour ? new Date(kpi.Date_Hour).toISOString() : null,
      };
    });

    for (const kpi of kpiRows) {
      const siteid = String(kpi.siteid ?? "").trim();
      const sector = numberOrNull(kpi.Sector);
      if (!siteid || sector === null) continue;

      const key = `${siteid}::${sector}`;
      if (representedSiteSectors.has(key)) continue;
      representedSiteSectors.add(key);

      const row = spbuBySiteId.get(siteid);
      const siteLat = numberOrNull(row?.Lat);
      const siteLng = numberOrNull(row?.Long);
      const spbuLat = numberOrNull(row?.Latitude);
      const spbuLng = numberOrNull(row?.Longitude);
      const prb = numberOrNull(kpi.prb);
      const throughput = numberOrNull(kpi.throughput);

      sites.push({
        id: `${siteid}-${sector}-kpi`,
        siteid,
        sector,
        siteSector: row?.site_sector ?? `${siteid}_${sector}`,
        spbu: row?.spbu ?? null,
        kode: row?.Kode ?? null,
        area: row?.Area ?? null,
        kabupatenKota: row?.["Kabupaten/Kota"] ?? null,
        site: siteLat !== null && siteLng !== null && Math.abs(siteLat) <= 90 && Math.abs(siteLng) <= 180
          ? { lat: siteLat, lng: siteLng } : null,
        spbuLocation: spbuLat !== null && spbuLng !== null && Math.abs(spbuLat) <= 90 && Math.abs(spbuLng) <= 180
          ? { lat: spbuLat, lng: spbuLng } : null,
        prb,
        throughput,
        status: getSiteStatus(prb, throughput),
        dateHour: kpi.Date_Hour ? new Date(kpi.Date_Hour).toISOString() : null,
      });
    }

    const uniqueSectors = new Map<string, typeof sites[number]>();
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
      unknown: sectorSites.filter(s => s.status === "UNKNOWN").length,
    };
    const analytics = {
      topPayloadSites: topPayloadRows.map(row => ({
        siteid: row.siteid,
        payloadMb: numberOrNull(row.payload_mb),
      })),
      hourly: hourlyAnalyticsRows.map(row => ({
        dateHour: row.hour,
        payloadMb: numberOrNull(row.payload_mb),
        maxUtilization: numberOrNull(row.max_utilization),
        maxUser: numberOrNull(row.max_user),
      })),
    };

    return NextResponse.json(
      { success: true, generatedAt: new Date().toISOString(), counts, sites, analytics },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("GET /api/network-watch failed:", error);
    return NextResponse.json(
      { success: false, error: "Gagal mengambil data SPBU/KPI. Periksa koneksi database dan konfigurasi server." },
      { status: 500 }
    );
  }
}
