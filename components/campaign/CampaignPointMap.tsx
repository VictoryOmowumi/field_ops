"use client";

import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";
import { divIcon, latLngBounds } from "leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";

import type { CampaignMapPoint } from "@/types/campaign-intelligence";

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

export default function CampaignPointMap({ points }: { points: CampaignMapPoint[] }) {
  const validPoints = points.filter(
    (point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
  );
  const mapKey = `${validPoints.length}-${validPoints[0]?.id ?? "none"}-${validPoints[validPoints.length - 1]?.id ?? "none"}`;

  if (validPoints.length === 0) {
    return <p className="text-sm text-muted-foreground">No coordinate data captured yet.</p>;
  }

  return (
    <div className="relative z-10 h-120 overflow-hidden rounded-3xl border border-border bg-muted/20">
      <MapContainer key={mapKey} center={[9.082, 8.6753]} zoom={6} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer
          attribution="&copy; OpenStreetMap, &copy; CARTO"
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        <FitToPoints points={validPoints} />
        <MarkerClusterGroup chunkedLoading>
          {validPoints.map((point) => (
            <Marker
              key={point.id}
              position={[point.latitude, point.longitude]}
              icon={markerIcon(colorForStatus(point.status))}
            >
              <Tooltip direction="top" offset={[0, -6]} opacity={1}>
                <div className="text-xs">
                  <p className="font-medium">{point.outlet}</p>
                  <p className="text-muted-foreground">{point.lga || "LGA not captured"}</p>
                  <p>{point.agent}</p>
                  <p className="capitalize">{point.status}</p>
                  {point.source === "visit" ? (
                    <p>
                      {point.saleCount && point.saleCount > 0
                        ? `Sales qty: ${point.saleQuantityTotal ?? 0}`
                        : "Sales: none"}
                    </p>
                  ) : null}
                </div>
              </Tooltip>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>
      <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 rounded-full border border-border bg-background/85 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur">
        <span className="inline-flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-white">L</span>
        Marker includes outlet status; tooltip includes LGA.
      </div>
    </div>
  );
}
