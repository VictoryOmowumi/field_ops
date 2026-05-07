"use client";

import { useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import { latLngBounds } from "leaflet";
import { useEffect } from "react";

type TerritoryPoint = {
  label: string;
  state: string;
  lga: string;
  visits: number;
  conversions: number;
  rate: number;
  latitude: number;
  longitude: number;
};

function FitToPoints({ points }: { points: TerritoryPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const bounds = latLngBounds(points.map((point) => [point.latitude, point.longitude]));
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 10 });
  }, [map, points]);
  return null;
}

function rateColor(rate: number) {
  if (rate >= 70) return "var(--color-primary)";
  if (rate >= 40) return "var(--color-chart-4)";
  return "var(--color-destructive)";
}

export default function TerritoryPerformanceMap({ points }: { points: TerritoryPoint[] }) {
  const [mapStyle, setMapStyle] = useState<"street" | "light" | "dark">("street");
  const tileConfig =
    mapStyle === "dark"
      ? {
          url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
          attribution: "&copy; OpenStreetMap, &copy; CARTO",
        }
      : mapStyle === "light"
        ? {
            url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
            attribution: "&copy; OpenStreetMap, &copy; CARTO",
          }
        : {
            url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            attribution: "&copy; OpenStreetMap contributors",
          };

  return (
    <div className="fieldops-map relative h-[340px] overflow-hidden rounded-3xl border border-border bg-muted/30">
      <div className="absolute right-3 top-3 z-[500] flex gap-1 rounded-full border border-border bg-background/95 p-1 shadow-sm">
        {(["street", "light", "dark"] as const).map((style) => (
          <button
            key={style}
            type="button"
            onClick={() => setMapStyle(style)}
            className={`rounded-full px-2.5 py-1 text-[11px] capitalize ${
              mapStyle === style ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            {style}
          </button>
        ))}
      </div>
      <MapContainer center={[9.082, 8.6753]} zoom={6} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer attribution={tileConfig.attribution} url={tileConfig.url} />
        <FitToPoints points={points} />
        {points.map((point) => (
          <CircleMarker
            key={point.label}
            center={[point.latitude, point.longitude]}
            radius={Math.max(7, Math.min(18, 6 + point.visits / 3))}
            pathOptions={{
              color: rateColor(point.rate),
              fillColor: rateColor(point.rate),
              fillOpacity: 0.3,
              weight: 1.5,
            }}
          >
            <Tooltip direction="top" offset={[0, -8]} opacity={1}>
              <div className="text-xs">
                <p className="font-semibold">{point.label}</p>
                <p className="text-muted-foreground">
                  {point.rate.toFixed(1)}% conversion ({point.conversions}/{point.visits})
                </p>
              </div>
            </Tooltip>
            <Popup>
              <div className="text-xs">
                <p className="font-semibold">{point.label}</p>
                <p className="text-muted-foreground">Visits: {point.visits}</p>
                <p className="text-muted-foreground">Conversions: {point.conversions}</p>
                <p className="text-muted-foreground">Rate: {point.rate.toFixed(1)}%</p>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-background/50 to-transparent" />
    </div>
  );
}
