"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";
import { divIcon, latLngBounds } from "leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";

import { Button } from "@/components/ui/button";
import type { CampaignMapPoint } from "@/types/campaign-intelligence";

type MapMode = "density" | "territory" | "timeline" | "sales";
type MapTheme = "light" | "dark";

function FitToPoints({ points }: { points: CampaignMapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = latLngBounds(points.map((point) => [point.latitude, point.longitude]));
    map.fitBounds(bounds, { padding: [20, 20], maxZoom: 14 });
  }, [map, points]);
  return null;
}

function colorForStatus(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("convert")) return "var(--color-primary)";
  if (normalized.includes("pending")) return "var(--color-chart-4)";
  if (normalized.includes("revisit")) return "var(--color-destructive)";
  return "var(--color-muted-foreground)";
}

function markerIcon(color: string) {
  return divIcon({
    className: "fieldops-map-marker",
    html: `<div style="display:grid;place-items:center;width:22px;height:22px;border-radius:9999px;background:${color};border:2px solid var(--color-background);color:#fff;font-size:11px;font-weight:700;line-height:1">L</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function parsePointTime(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function scaleRadius(value: number, minValue: number, maxValue: number, minRadius: number, maxRadius: number) {
  if (maxValue <= minValue) return (minRadius + maxRadius) / 2;
  const pct = (value - minValue) / (maxValue - minValue);
  return minRadius + pct * (maxRadius - minRadius);
}

export default function CampaignPointMap({ points }: { points: CampaignMapPoint[] }) {
  const [mode, setMode] = useState<MapMode>("density");
  const [mapTheme, setMapTheme] = useState<MapTheme>("light");
  const [timelineIndex, setTimelineIndex] = useState(1);
  const [playing, setPlaying] = useState(false);

  const validPoints = points.filter(
    (point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
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
      setTimelineIndex((current) => {
        if (current >= timelineMax) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 500);
    return () => clearInterval(timer);
  }, [mode, playing, timelineMax]);

  const densityCells = useMemo(() => {
    const grid = new Map<string, { latitude: number; longitude: number; count: number; converted: number }>();
    for (const point of validPoints) {
      const cellLat = Math.round(point.latitude * 50) / 50;
      const cellLng = Math.round(point.longitude * 50) / 50;
      const key = `${cellLat}:${cellLng}`;
      const current = grid.get(key) ?? { latitude: cellLat, longitude: cellLng, count: 0, converted: 0 };
      current.count += 1;
      if ((point.status ?? "").toLowerCase().includes("convert")) current.converted += 1;
      grid.set(key, current);
    }
    return [...grid.values()];
  }, [validPoints]);

  const territoryPoints = useMemo(() => {
    const buckets = new Map<string, { lga: string; latitudeSum: number; longitudeSum: number; count: number; converted: number; salesQty: number }>();
    for (const point of validPoints) {
      const lga = point.lga?.trim() || "Unknown LGA";
      const current = buckets.get(lga) ?? {
        lga,
        latitudeSum: 0,
        longitudeSum: 0,
        count: 0,
        converted: 0,
        salesQty: 0,
      };
      current.latitudeSum += point.latitude;
      current.longitudeSum += point.longitude;
      current.count += 1;
      if ((point.status ?? "").toLowerCase().includes("convert")) current.converted += 1;
      current.salesQty += Math.max(0, point.saleQuantityTotal ?? 0);
      buckets.set(lga, current);
    }
    return [...buckets.values()].map((row) => ({
      ...row,
      latitude: row.latitudeSum / row.count,
      longitude: row.longitudeSum / row.count,
      conversionRate: row.count > 0 ? (row.converted / row.count) * 100 : 0,
    }));
  }, [validPoints]);

  const salesMax = useMemo(
    () => Math.max(1, ...validPoints.map((point) => Math.max(0, point.saleQuantityTotal ?? 0))),
    [validPoints]
  );

  const timelineVisiblePoints = useMemo(
    () => timelinePoints.slice(0, clampedTimelineIndex),
    [timelinePoints, clampedTimelineIndex]
  );

  const displayedPoints =
    mode === "timeline"
      ? timelineVisiblePoints
      : validPoints;

  const mapKey = `${mode}-${validPoints.length}-${validPoints[0]?.id ?? "none"}-${validPoints[validPoints.length - 1]?.id ?? "none"}`;

  if (validPoints.length === 0) {
    return <p className="text-sm text-muted-foreground">No coordinate data captured yet.</p>;
  }

  return (
    <div className="relative z-10 h-150 overflow-hidden rounded-3xl border border-border bg-muted/20">
      <div className="absolute left-3 top-3 z-[1000] flex flex-wrap gap-2 rounded-xl border border-border bg-background/90 p-2 backdrop-blur">
        <Button size="sm" variant={mode === "density" ? "default" : "outline"} onClick={() => setMode("density")}>Density</Button>
        <Button size="sm" variant={mode === "territory" ? "default" : "outline"} onClick={() => setMode("territory")}>Territory</Button>
        <Button size="sm" variant={mode === "timeline" ? "default" : "outline"} onClick={() => setMode("timeline")}>Timeline</Button>
        <Button size="sm" variant={mode === "sales" ? "default" : "outline"} onClick={() => setMode("sales")}>Sales Intensity</Button>
        <Button size="sm" variant="outline" onClick={() => setMapTheme((value) => (value === "light" ? "dark" : "light"))}>
          Map: {mapTheme === "light" ? "Light" : "Dark"}
        </Button>
      </div>
      {mode === "timeline" ? (
        <div className="absolute right-3 top-3 z-[1000] flex items-center gap-2 rounded-xl border border-border bg-background/90 px-3 py-2 text-xs backdrop-blur">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPlaying((value) => !value)}
            disabled={timelinePoints.length <= 1}
          >
            {playing ? "Pause" : "Play"}
          </Button>
          <input
            type="range"
            min={1}
            max={timelineMax}
            value={clampedTimelineIndex}
            onChange={(event) => setTimelineIndex(Number(event.target.value))}
            className="w-44"
          />
          <span>{clampedTimelineIndex}/{timelinePoints.length}</span>
        </div>
      ) : null}
      <MapContainer key={mapKey} center={[9.082, 8.6753]} zoom={6} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer
          attribution="&copy; OpenStreetMap, &copy; CARTO"
          url={mapTheme === "dark"
            ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"}
        />
        <FitToPoints points={validPoints} />
        {mode === "density" ? (
          densityCells.map((cell) => (
            <CircleMarker
              key={`${cell.latitude}-${cell.longitude}`}
              center={[cell.latitude, cell.longitude]}
              radius={scaleRadius(cell.count, 1, Math.max(1, ...densityCells.map((entry) => entry.count)), 8, 28)}
              pathOptions={{ color: "var(--color-chart-1)", fillColor: "var(--color-chart-1)", fillOpacity: 0.25, weight: 1 }}
            >
              <Tooltip direction="top" offset={[0, -6]} opacity={1}>
                <div className="text-xs">
                  <p className="font-medium">Density Cell</p>
                  <p>Submissions: {cell.count}</p>
                  <p>Converted: {cell.converted}</p>
                </div>
              </Tooltip>
            </CircleMarker>
          ))
        ) : null}
        {mode === "territory" ? (
          territoryPoints.map((point) => (
            <CircleMarker
              key={point.lga}
              center={[point.latitude, point.longitude]}
              radius={scaleRadius(point.count, 1, Math.max(1, ...territoryPoints.map((entry) => entry.count)), 10, 26)}
              pathOptions={{ color: "var(--color-chart-4)", fillColor: "var(--color-chart-4)", fillOpacity: 0.3, weight: 1 }}
            >
              <Tooltip direction="top" offset={[0, -6]} opacity={1}>
                <div className="text-xs">
                  <p className="font-medium">{point.lga}</p>
                  <p>Submissions: {point.count}</p>
                  <p>Conversion: {point.conversionRate.toFixed(1)}%</p>
                  <p>Sales qty: {point.salesQty}</p>
                </div>
              </Tooltip>
            </CircleMarker>
          ))
        ) : null}
        {mode === "timeline" ? (
          <MarkerClusterGroup chunkedLoading>
            {timelineVisiblePoints.map((point) => (
              <Marker
                key={point.id}
                position={[point.latitude, point.longitude]}
                icon={markerIcon(colorForStatus(point.status))}
              >
                <Tooltip direction="top" offset={[0, -6]} opacity={1}>
                  <div className="text-xs">
                    <p className="font-medium">{point.outlet}</p>
                    <p className="text-muted-foreground">{new Date(point.createdAt).toLocaleString()}</p>
                    <p>{point.agent}</p>
                  </div>
                </Tooltip>
              </Marker>
            ))}
          </MarkerClusterGroup>
        ) : null}
        {mode === "sales" ? (
          validPoints.map((point) => (
            <CircleMarker
              key={point.id}
              center={[point.latitude, point.longitude]}
              radius={scaleRadius(Math.max(0, point.saleQuantityTotal ?? 0), 0, salesMax, 4, 18)}
              pathOptions={{
                color: colorForStatus(point.status),
                fillColor: colorForStatus(point.status),
                fillOpacity: 0.4,
                weight: 1,
              }}
            >
              <Tooltip direction="top" offset={[0, -6]} opacity={1}>
                <div className="text-xs">
                  <p className="font-medium">{point.outlet}</p>
                  <p>{point.agent}</p>
                  <p className="capitalize">{point.status}</p>
                  <p>Sales qty: {point.saleQuantityTotal ?? 0}</p>
                </div>
              </Tooltip>
            </CircleMarker>
          ))
        ) : null}
      </MapContainer>
      <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 rounded-full border border-border bg-background/85 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur">
        <span className="inline-flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-white">L</span>
        Mode: {mode === "density" ? "Density" : mode === "territory" ? "Territory" : mode === "timeline" ? "Timeline" : "Sales intensity"}.
      </div>
    </div>
  );
}
