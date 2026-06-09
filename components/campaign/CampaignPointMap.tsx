"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";
import { divIcon, latLngBounds } from "leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { Maximize2, Minimize2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CampaignMapPoint } from "@/types/campaign-intelligence";
import { cn } from "@/lib/utils";

type MapMode = "cluster" | "heat" | "territory" | "timeline" | "sales";
type MapTheme = "light" | "dark";

// ── Cluster icon factory ────────────────────────────────────────────────────

function clusterIcon(count: number) {
  const size = count < 5 ? 36 : count < 15 ? 44 : 52;
  const bg =
    count < 3 ? "#f97316"
    : count < 8 ? "#ef4444"
    : "#dc2626";
  const ringColor = `${bg}40`;
  return divIcon({
    className: "",
    html: `<div style="
      width:${size}px;height:${size}px;
      border-radius:9999px;
      background:${bg};
      border:3px solid ${ringColor};
      box-shadow:0 2px 10px ${bg}55;
      display:flex;align-items:center;justify-content:center;
      color:#fff;font-weight:700;font-size:${count < 10 ? 14 : 12}px;
      font-family:inherit;
    ">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function pointIcon(status: string) {
  const color =
    status.toLowerCase().includes("convert") ? "#22c55e"
    : status.toLowerCase().includes("revisit") ? "#a855f7"
    : "#ef4444";
  return divIcon({
    className: "",
    html: `<div style="
      width:12px;height:12px;border-radius:9999px;
      background:${color};border:2.5px solid #fff;
      box-shadow:0 1px 4px rgba(0,0,0,0.35);
    "></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

function legacyMarkerIcon(color: string) {
  return divIcon({
    className: "",
    html: `<div style="
      width:22px;height:22px;border-radius:9999px;
      background:${color};border:2px solid #fff;
      color:#fff;font-size:10px;font-weight:700;
      display:grid;place-items:center;
      box-shadow:0 2px 6px rgba(0,0,0,0.25);
    ">●</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function colorForStatus(status: string) {
  const s = status.toLowerCase();
  if (s.includes("convert")) return "#22c55e";
  if (s.includes("pending")) return "#f59e0b";
  if (s.includes("revisit")) return "#a855f7";
  return "#94a3b8";
}

// ── Map helpers ─────────────────────────────────────────────────────────────

function FitToPoints({ points }: { points: CampaignMapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = latLngBounds(points.map((p) => [p.latitude, p.longitude]));
    map.fitBounds(bounds, { padding: [20, 20], maxZoom: 14 });
  }, [map, points]);
  return null;
}

// Calls invalidateSize() when the parent tab becomes visible again
function InvalidateOnTrigger({ trigger }: { trigger: number }) {
  const map = useMap();
  useEffect(() => {
    const id = requestAnimationFrame(() => map.invalidateSize());
    return () => cancelAnimationFrame(id);
  }, [map, trigger]);
  return null;
}

function parsePointTime(v: string) {
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : 0;
}

function scaleRadius(v: number, min: number, max: number, lo: number, hi: number) {
  if (max <= min) return (lo + hi) / 2;
  return lo + ((v - min) / (max - min)) * (hi - lo);
}

// ── Main component ──────────────────────────────────────────────────────────

export default function CampaignPointMap({
  points,
  resizeTrigger = 0,
}: {
  points: CampaignMapPoint[];
  resizeTrigger?: number;
}) {
  const [mode, setMode] = useState<MapMode>("cluster");
  const [mapTheme, setMapTheme] = useState<MapTheme>("light");
  const [timelineIndex, setTimelineIndex] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // Exit fullscreen on Escape
  useEffect(() => {
    if (!fullscreen) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setFullscreen(false); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const validPoints = points.filter(
    (p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)
  );

  const timelinePoints = useMemo(
    () => [...validPoints].sort((a, b) => parsePointTime(a.createdAt) - parsePointTime(b.createdAt)),
    [validPoints]
  );
  const timelineMax = Math.max(1, timelinePoints.length);
  const clampedTimelineIndex = Math.max(1, Math.min(timelineIndex, timelineMax));

  useEffect(() => {
    if (mode !== "timeline" || !playing) return;
    const timer = setInterval(() => {
      setTimelineIndex((c) => {
        if (c >= timelineMax) { setPlaying(false); return c; }
        return c + 1;
      });
    }, 500);
    return () => clearInterval(timer);
  }, [mode, playing, timelineMax]);

  const territoryPoints = useMemo(() => {
    const buckets = new Map<string, { lga: string; latSum: number; lngSum: number; count: number; converted: number; salesQty: number }>();
    for (const p of validPoints) {
      const lga = p.lga?.trim() || "Unknown LGA";
      const cur = buckets.get(lga) ?? { lga, latSum: 0, lngSum: 0, count: 0, converted: 0, salesQty: 0 };
      cur.latSum += p.latitude; cur.lngSum += p.longitude; cur.count++;
      if (p.status.toLowerCase().includes("convert")) cur.converted++;
      cur.salesQty += Math.max(0, p.saleQuantityTotal ?? 0);
      buckets.set(lga, cur);
    }
    return [...buckets.values()].map((r) => ({
      ...r,
      latitude: r.latSum / r.count,
      longitude: r.lngSum / r.count,
      conversionRate: r.count > 0 ? (r.converted / r.count) * 100 : 0,
    }));
  }, [validPoints]);

  const salesMax = useMemo(
    () => Math.max(1, ...validPoints.map((p) => Math.max(0, p.saleQuantityTotal ?? 0))),
    [validPoints]
  );

  const timelineVisiblePoints = useMemo(
    () => timelinePoints.slice(0, clampedTimelineIndex),
    [timelinePoints, clampedTimelineIndex]
  );

  const tileUrl = mapTheme === "dark"
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

  const MODES: { id: MapMode; label: string }[] = [
    { id: "cluster", label: "Cluster" },
    { id: "heat", label: "Heat map" },
    { id: "territory", label: "Territory" },
    { id: "timeline", label: "Timeline" },
    { id: "sales", label: "Sales" },
  ];

  return (
    <div
      className={cn(
        "relative z-10 overflow-hidden border border-border bg-muted/20",
        fullscreen
          ? "fixed inset-0 z-[9999] rounded-none"
          : "h-[480px] rounded-3xl"
      )}
    >
      {/* ── Mode toolbar ── */}
      <div className="absolute left-3 top-3 z-[1000] flex flex-wrap gap-1 rounded-xl border border-border/60 bg-background/95 p-1 shadow-sm backdrop-blur-md">
        {MODES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={cn(
              "rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
              mode === id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setMapTheme((v) => (v === "light" ? "dark" : "light"))}
          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {mapTheme === "light" ? "Dark" : "Light"}
        </button>
      </div>

      {/* ── Fullscreen toggle ── */}
      <button
        type="button"
        onClick={() => setFullscreen((v) => !v)}
        className="absolute right-3 top-3 z-[1000] grid size-8 place-items-center rounded-xl border border-border/60 bg-background/95 shadow-sm backdrop-blur-md transition hover:bg-muted"
        title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
      >
        {fullscreen ? <Minimize2 className="size-3.5 text-muted-foreground" /> : <Maximize2 className="size-3.5 text-muted-foreground" />}
      </button>

      {/* ── Timeline controls ── */}
      {mode === "timeline" ? (
        <div className="absolute right-12 top-3 z-[1000] flex items-center gap-2 rounded-xl border border-border/60 bg-background/95 px-3 py-2 text-xs shadow-sm backdrop-blur-md">
          <Button size="sm" variant="outline" onClick={() => setPlaying((v) => !v)} disabled={timelinePoints.length <= 1}>
            {playing ? "Pause" : "Play"}
          </Button>
          <input
            type="range" min={1} max={timelineMax} value={clampedTimelineIndex}
            onChange={(e) => setTimelineIndex(Number(e.target.value))}
            className="w-28"
          />
          <span className="tabular-nums">{clampedTimelineIndex}/{timelinePoints.length}</span>
        </div>
      ) : null}

      {/* ── No-data overlay — shown as layer on top so MapContainer stays mounted ── */}
      {validPoints.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center">
          <div className="rounded-2xl border border-dashed border-border bg-background/90 px-6 py-4 text-center backdrop-blur-sm">
            <p className="text-sm text-muted-foreground">No coordinate data captured yet.</p>
          </div>
        </div>
      )}

      {/* ── MapContainer — NO key prop (avoids TileLayer/appendChild crash on remount) ── */}
      <MapContainer center={[9.082, 8.6753]} zoom={6} scrollWheelZoom className="h-full w-full">
        <TileLayer attribution="&copy; OpenStreetMap, &copy; CARTO" url={tileUrl} />
        <FitToPoints points={validPoints} />
        <InvalidateOnTrigger trigger={resizeTrigger} />

        {/* ── Cluster mode ── */}
        {mode === "cluster" ? (
          <MarkerClusterGroup
            chunkedLoading
            // @ts-expect-error iconCreateFunction is a Leaflet option
            iconCreateFunction={(cluster) => clusterIcon(cluster.getChildCount())}
            showCoverageOnHover={false}
            spiderfyOnMaxZoom
            maxClusterRadius={60}
          >
            {validPoints.map((p) => (
              <Marker key={p.id} position={[p.latitude, p.longitude]} icon={pointIcon(p.status)}>
                <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                  <div className="space-y-0.5 text-xs">
                    <p className="font-semibold">{p.outlet}</p>
                    <p className="text-muted-foreground">{p.lga ?? "-"} · {p.agent}</p>
                    <p className="capitalize">{p.status}</p>
                    {(p.saleCount ?? 0) > 0 ? <p>Sales: {p.saleCount}</p> : null}
                  </div>
                </Tooltip>
              </Marker>
            ))}
          </MarkerClusterGroup>
        ) : null}

        {/* ── Heat map mode — overlapping low-opacity circles create density glow ── */}
        {mode === "heat" ? (
          <>
            {validPoints.map((p) => (
              <CircleMarker
                key={p.id}
                center={[p.latitude, p.longitude]}
                radius={32}
                pathOptions={{
                  color: "transparent",
                  fillColor: p.status.toLowerCase().includes("convert") ? "#22c55e" : "#f97316",
                  fillOpacity: 0.06,
                  weight: 0,
                }}
              />
            ))}
            {/* Inner brighter dot for each point */}
            {validPoints.map((p) => (
              <CircleMarker
                key={`${p.id}-inner`}
                center={[p.latitude, p.longitude]}
                radius={8}
                pathOptions={{
                  color: "transparent",
                  fillColor: p.status.toLowerCase().includes("convert") ? "#22c55e" : "#f97316",
                  fillOpacity: 0.25,
                  weight: 0,
                }}
              />
            ))}
          </>
        ) : null}

        {/* ── Territory mode ── */}
        {mode === "territory" ? (
          <>
            {territoryPoints.map((pt) => {
              const maxCount = Math.max(1, ...territoryPoints.map((r) => r.count));
              return (
                <CircleMarker
                  key={pt.lga}
                  center={[pt.latitude, pt.longitude]}
                  radius={scaleRadius(pt.count, 1, maxCount, 10, 35)}
                  pathOptions={{ color: "#f97316", fillColor: "#f97316", fillOpacity: 0.3, weight: 2 }}
                >
                  <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                    <div className="space-y-0.5 text-xs">
                      <p className="font-semibold">{pt.lga}</p>
                      <p>Submissions: {pt.count}</p>
                      <p>Conversion: {pt.conversionRate.toFixed(1)}%</p>
                      <p>Sales qty: {pt.salesQty}</p>
                    </div>
                  </Tooltip>
                </CircleMarker>
              );
            })}
          </>
        ) : null}

        {/* ── Timeline mode ── */}
        {mode === "timeline" ? (
          <MarkerClusterGroup
            chunkedLoading
            // @ts-expect-error iconCreateFunction is a Leaflet option
            iconCreateFunction={(cluster) => clusterIcon(cluster.getChildCount())}
            showCoverageOnHover={false}
            maxClusterRadius={60}
          >
            {timelineVisiblePoints.map((p) => (
              <Marker key={p.id} position={[p.latitude, p.longitude]} icon={legacyMarkerIcon(colorForStatus(p.status))}>
                <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                  <div className="space-y-0.5 text-xs">
                    <p className="font-semibold">{p.outlet}</p>
                    <p className="text-muted-foreground">{new Date(p.createdAt).toLocaleString()}</p>
                    <p>{p.agent}</p>
                  </div>
                </Tooltip>
              </Marker>
            ))}
          </MarkerClusterGroup>
        ) : null}

        {/* ── Sales intensity mode ── */}
        {mode === "sales" ? (
          <>
            {validPoints.map((p) => (
              <CircleMarker
                key={p.id}
                center={[p.latitude, p.longitude]}
                radius={scaleRadius(Math.max(0, p.saleQuantityTotal ?? 0), 0, salesMax, 4, 22)}
                pathOptions={{
                  color: colorForStatus(p.status),
                  fillColor: colorForStatus(p.status),
                  fillOpacity: 0.45,
                  weight: 1.5,
                }}
              >
                <Tooltip direction="top" offset={[0, -6]} opacity={1}>
                  <div className="space-y-0.5 text-xs">
                    <p className="font-semibold">{p.outlet}</p>
                    <p>{p.agent}</p>
                    <p className="capitalize">{p.status}</p>
                    <p>Sales qty: {p.saleQuantityTotal ?? 0}</p>
                  </div>
                </Tooltip>
              </CircleMarker>
            ))}
          </>
        ) : null}
      </MapContainer>

      {/* ── Bottom legend ── */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] flex items-center gap-2 rounded-full border border-border/60 bg-background/90 px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur-md">
        <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-full bg-[#22c55e]" />Converted</span>
        <span className="text-border">·</span>
        <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-full bg-[#ef4444]" />Pending</span>
        <span className="text-border">·</span>
        <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-full bg-[#a855f7]" />Revisit</span>
      </div>
    </div>
  );
}
