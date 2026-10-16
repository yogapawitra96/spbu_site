"use client";

import { Fragment, useEffect, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polygon, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";

export type SiteStatus = "RED" | "YELLOW" | "GREEN" | "UNKNOWN";
export interface SiteItem {
  id: string; siteid: string; sector: number | null; siteSector: string | null;
  spbu: string | null; kode: string | null; area: string | null; kabupatenKota: string | null;
  site: { lat: number; lng: number } | null;
  spbuLocation: { lat: number; lng: number } | null;
  prb: number | null; throughput: number | null; status: SiteStatus; dateHour: string | null;
}
const colors: Record<SiteStatus, string> = {
  RED: "#dc2626", YELLOW: "#f59e0b", GREEN: "#16a34a", UNKNOWN: "#64748b",
};
type LatLngPoint = [number, number];

function fmt(value: number | null, suffix = "") { return value === null ? "N/A" : `${value.toFixed(2)}${suffix}`; }

function colorForSector(site: SiteItem) {
  if (site.prb === null || site.throughput === null) return colors.UNKNOWN;
  if (site.prb >= 90 && site.throughput < 1.5) return colors.RED;
  if (site.prb >= 50 && site.throughput < 5) return colors.YELLOW;
  return colors.GREEN;
}

function sectorWedge(center: { lat: number; lng: number }, index: number, count: number, distanceMeters: number): LatLngPoint[] {
  const earthRadius = 6_371_000;
  const distance = distanceMeters / earthRadius;
  const sweep = 42;
  const centerBearing = index * 360 / count;
  const startBearing = (centerBearing - sweep / 2) * Math.PI / 180;
  const points: LatLngPoint[] = [[center.lat, center.lng]];

  for (let step = 0; step <= 16; step += 1) {
    const bearing = startBearing + sweep * Math.PI / 180 * step / 16;
    const latitude = center.lat * Math.PI / 180;
    const longitude = center.lng * Math.PI / 180;
    const destinationLatitude = Math.asin(
      Math.sin(latitude) * Math.cos(distance) +
      Math.cos(latitude) * Math.sin(distance) * Math.cos(bearing),
    );
    const destinationLongitude = longitude + Math.atan2(
      Math.sin(bearing) * Math.sin(distance) * Math.cos(latitude),
      Math.cos(distance) - Math.sin(latitude) * Math.sin(destinationLatitude),
    );
    points.push([destinationLatitude * 180 / Math.PI, destinationLongitude * 180 / Math.PI]);
  }

  points.push([center.lat, center.lng]);
  return points;
}
function FitBali() {
  const map = useMap();
  useEffect(() => { map.setView([-8.4095, 115.1889], 9); }, [map]);
  return null;
}
function makeSpbuIcon() {
  return L.divIcon({
    className: "",
    html: '<div class="spbu-marker" style="width:22px;height:22px">⛽</div>',
    iconSize: [22, 22], iconAnchor: [11, 11],
  });
}
function makeTowerIcon() {
  return L.divIcon({
    className: "",
    html: '<div class="site-tower-marker" style="width:18px;height:18px">📡</div>',
    iconSize: [18, 18], iconAnchor: [9, 9],
  });
}
const towerIcon = makeTowerIcon();
const spbuIcon = makeSpbuIcon();

function SectorLayers({ groups, selectedId, onSelect }: {
  groups: Map<string, Map<string, SiteItem>>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useEffect(() => {
    const updateZoom = () => setZoom(map.getZoom());
    map.on("zoomend", updateZoom);
    return () => { map.off("zoomend", updateZoom); };
  }, [map]);

  return [...groups.values()].map(group => {
    const sortedGroup = [...group.values()].sort((first, second) => (first.sector ?? 0) - (second.sector ?? 0));
    const center = sortedGroup[0].site!;
    const metersPerPixel = 156543.03392 * Math.cos(center.lat * Math.PI / 180) / 2 ** zoom;
    const beamLength = 28 * metersPerPixel;

    return (
      <Fragment key={sortedGroup[0].siteid}>
        {sortedGroup.map((site, index) => {
          const color = colorForSector(site);
          return (
            <Polygon
              key={`sector-${site.id}`}
              positions={sectorWedge(center, index, sortedGroup.length, beamLength)}
              pathOptions={{ color: "#ffffff", weight: selectedId === site.id ? 2 : 1, fillColor: color, fillOpacity: .9 }}
              eventHandlers={{ click: () => onSelect(site.id) }}
            >
              <Tooltip direction="top">
                {site.siteid} / Sector {site.sector ?? "?"} · PRB {fmt(site.prb, "%")}
              </Tooltip>
              <Popup>
                <div className="popup-title">{site.siteid} / Sector {site.sector ?? "N/A"}</div>
                <div className="popup-status" style={{ backgroundColor: color }}>PRB {fmt(site.prb, "%")}</div>
                <div className="popup-grid">
                  <span>Status KPI</span><b>{site.status}</b>
                  <span>SPBU terdekat</span><b>{site.spbu || "N/A"}</b>
                  <span>User DL throughput</span><b>{fmt(site.throughput, " Mbps")}</b>
                  <span>Waktu KPI</span><b>{site.dateHour ? new Date(site.dateHour).toLocaleString("id-ID") : "N/A"}</b>
                </div>
              </Popup>
            </Polygon>
          );
        })}
        <Marker position={[center.lat, center.lng]} icon={towerIcon}>
          <Tooltip direction="top">
            {sortedGroup[0].siteid} · Sector {sortedGroup.map(site => site.sector ?? "?").join(", ")}
          </Tooltip>
        </Marker>
      </Fragment>
    );
  });
}

export default function NetworkMap({ sites, selectedId, onSelect }: {
  sites: SiteItem[]; selectedId: string | null; onSelect: (id: string) => void;
}) {
  const groupedSites = new Map<string, Map<string, SiteItem>>();
  for (const site of sites) {
    if (!site.site) continue;
    const group = groupedSites.get(site.siteid) ?? new Map<string, SiteItem>();
    const sectorKey = site.sector === null ? site.id : String(site.sector);
    if (!group.has(sectorKey)) group.set(sectorKey, site);
    groupedSites.set(site.siteid, group);
  }

  return (
    <MapContainer center={[-8.4095, 115.1889]} zoom={9} zoomControl>
      <FitBali />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <SectorLayers groups={groupedSites} selectedId={selectedId} onSelect={onSelect} />
      {sites.map(site => {
        if (!site.spbuLocation) return null;
        return (
          <Marker
            key={`spbu-${site.id}`}
            position={[site.spbuLocation.lat, site.spbuLocation.lng]}
            icon={spbuIcon}
          >
            <Tooltip direction="top">SPBU: {site.spbu || "Nama SPBU tidak tersedia"}</Tooltip>
            <Popup>
              <div className="popup-title">⛽ {site.spbu || "SPBU"}</div>
              <div className="popup-grid">
                <span>Kode SPBU</span><b>{site.kode || "N/A"}</b>
                <span>Site terkait</span><b>{site.siteid} / {site.sector ?? "N/A"}</b>
                <span>Area</span><b>{site.kabupatenKota || site.area || "N/A"}</b>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
