"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import { latLngBounds } from "leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useThemeMode } from "@/hooks/useThemeMode";
import { db } from "@/lib/offline/db";

type VisitPoint = {
  id: string;
  city: string;
  outlet: string;
  lat: number;
  lng: number;
  status: "converted" | "pending" | "revisit";
};

const outletVisitPoints: VisitPoint[] = [
  { id: "1", city: "Lagos", outlet: "Jolly Mart", lat: 6.5244, lng: 3.3792, status: "converted" },
  { id: "2", city: "Lagos", outlet: "Prime Stores", lat: 6.4654, lng: 3.4064, status: "pending" },
  { id: "3", city: "Lagos", outlet: "City Retail", lat: 6.6018, lng: 3.3515, status: "revisit" },
  { id: "13", city: "Lagos", outlet: "Lekki Mart", lat: 6.4422, lng: 3.5387, status: "converted" },
  { id: "14", city: "Lagos", outlet: "Yaba Plus", lat: 6.5095, lng: 3.3703, status: "pending" },
  { id: "15", city: "Lagos", outlet: "Ikeja Fresh", lat: 6.6059, lng: 3.3491, status: "converted" },
  { id: "16", city: "Lagos", outlet: "Surulere Hub", lat: 6.5016, lng: 3.3581, status: "revisit" },
  { id: "17", city: "Lagos", outlet: "Festac Corner", lat: 6.4682, lng: 3.2827, status: "converted" },
  { id: "4", city: "Abuja", outlet: "Wuse Fresh", lat: 9.0765, lng: 7.3986, status: "converted" },
  { id: "5", city: "Abuja", outlet: "Garki Hub", lat: 9.0403, lng: 7.4898, status: "pending" },
  { id: "6", city: "Abuja", outlet: "Maitama Point", lat: 9.1042, lng: 7.4932, status: "converted" },
  { id: "18", city: "Abuja", outlet: "Asokoro Mart", lat: 9.0564, lng: 7.5201, status: "revisit" },
  { id: "19", city: "Abuja", outlet: "Jabi Retail", lat: 9.0872, lng: 7.4342, status: "converted" },
  { id: "20", city: "Abuja", outlet: "Kubwa Depot", lat: 9.1508, lng: 7.3246, status: "pending" },
  { id: "21", city: "Abuja", outlet: "Utako Point", lat: 9.0898, lng: 7.4493, status: "converted" },
  { id: "7", city: "Ibadan", outlet: "Bodija Mart", lat: 7.4246, lng: 3.9118, status: "converted" },
  { id: "8", city: "Ibadan", outlet: "Dugbe Stores", lat: 7.3775, lng: 3.947, status: "pending" },
  { id: "22", city: "Ibadan", outlet: "Mokola Market", lat: 7.4092, lng: 3.9044, status: "converted" },
  { id: "23", city: "Ibadan", outlet: "Ring Road Shop", lat: 7.3859, lng: 3.9205, status: "revisit" },
  { id: "24", city: "Ibadan", outlet: "Challenge Plus", lat: 7.3572, lng: 3.8962, status: "pending" },
  { id: "9", city: "Kano", outlet: "Sabon Gari", lat: 12.0022, lng: 8.592, status: "revisit" },
  { id: "10", city: "Kano", outlet: "Nassarawa Shop", lat: 11.9904, lng: 8.5156, status: "converted" },
  { id: "25", city: "Kano", outlet: "Fagge Mart", lat: 11.9975, lng: 8.5306, status: "converted" },
  { id: "26", city: "Kano", outlet: "Kurna Retail", lat: 12.0152, lng: 8.5077, status: "pending" },
  { id: "27", city: "Kano", outlet: "Gwale Outlet", lat: 11.9721, lng: 8.4928, status: "revisit" },
  { id: "11", city: "Enugu", outlet: "Coal Camp Retail", lat: 6.4527, lng: 7.5105, status: "converted" },
  { id: "12", city: "Enugu", outlet: "Independence Mart", lat: 6.4412, lng: 7.4983, status: "pending" },
  { id: "28", city: "Enugu", outlet: "Achara Layout", lat: 6.4648, lng: 7.5199, status: "converted" },
  { id: "29", city: "Enugu", outlet: "Trans Ekulu", lat: 6.4723, lng: 7.5372, status: "pending" },
  { id: "30", city: "Enugu", outlet: "New Haven", lat: 6.4418, lng: 7.5313, status: "revisit" },
];

const cityCenters = [
  { city: "Lagos", lat: 6.5244, lng: 3.3792 },
  { city: "Abuja", lat: 9.0765, lng: 7.3986 },
  { city: "Ibadan", lat: 7.3775, lng: 3.947 },
  { city: "Kano", lat: 12.0022, lng: 8.592 },
  { city: "Enugu", lat: 6.4527, lng: 7.5105 },
];

function nearestCity(lat: number, lng: number) {
  let best = cityCenters[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const center of cityCenters) {
    const score = Math.hypot(lat - center.lat, lng - center.lng);
    if (score < bestScore) {
      bestScore = score;
      best = center;
    }
  }
  return best.city;
}

function FitToPoints({ points }: { points: VisitPoint[] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;
    const bounds = latLngBounds(points.map((point) => [point.lat, point.lng]));
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
  }, [map, points]);

  return null;
}

function markerColor(status: VisitPoint["status"]) {
  if (status === "converted") return "var(--color-primary)";
  if (status === "pending") return "var(--color-chart-4)";
  return "var(--color-destructive)";
}

function markerLabel(status: VisitPoint["status"]) {
  if (status === "converted") return "Converted";
  if (status === "pending") return "Pending";
  return "Revisit";
}

export default function OutletVisitMap() {
  const [selectedCity, setSelectedCity] = useState("all");
  const [enabledStatuses, setEnabledStatuses] = useState<VisitPoint["status"][]>([
    "converted",
    "pending",
    "revisit",
  ]);
  const [livePoints, setLivePoints] = useState<VisitPoint[]>([]);
  const { theme } = useThemeMode();

  useEffect(() => {
    let active = true;

    async function loadFromDexie() {
      try {
        const [outlets, sales] = await Promise.all([db.outlets.toArray(), db.sales.toArray()]);
        if (!active) return;

        const outletById = new Map(outlets.map((o) => [o.id, o]));

        const salePoints: VisitPoint[] = sales
          .filter((sale) => typeof sale.latitude === "number" && typeof sale.longitude === "number")
          .map((sale) => ({
            id: `sale-${sale.id}`,
            outlet: outletById.get(sale.outletId)?.name ?? "Unknown Outlet",
            city: nearestCity(sale.latitude as number, sale.longitude as number),
            lat: sale.latitude as number,
            lng: sale.longitude as number,
            status: sale.conversionStatus,
          }));

        const outletPoints: VisitPoint[] = outlets
          .filter((outlet) => typeof outlet.latitude === "number" && typeof outlet.longitude === "number")
          .map((outlet) => ({
            id: `outlet-${outlet.id}`,
            outlet: outlet.name,
            city: nearestCity(outlet.latitude as number, outlet.longitude as number),
            lat: outlet.latitude as number,
            lng: outlet.longitude as number,
            status: "pending",
          }));

        const merged = salePoints.length > 0 ? salePoints : outletPoints;
        setLivePoints(merged);
      } catch {
        setLivePoints([]);
      }
    }

    void loadFromDexie();
    return () => {
      active = false;
    };
  }, []);

  const basePoints = livePoints.length > 0 ? livePoints : outletVisitPoints;

  const filteredPoints = useMemo(() => {
    const byCity = selectedCity === "all" ? basePoints : basePoints.filter((point) => point.city === selectedCity);
    return byCity.filter((point) => enabledStatuses.includes(point.status));
  }, [basePoints, enabledStatuses, selectedCity]);

  const tileUrl =
    theme === "dark"
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

  const toggleStatus = (status: VisitPoint["status"]) => {
    setEnabledStatuses((current) =>
      current.includes(status) ? current.filter((item) => item !== status) : [...current, status]
    );
  };

  return (
    <div className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-7">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Outlet Visit Map</h2>
          <p className="text-sm text-muted-foreground">
            Plot outlet visit coordinates by selected city.
          </p>
        </div>

        <Select value={selectedCity} onValueChange={setSelectedCity}>
          <SelectTrigger className="w-[180px] rounded-full">
            <SelectValue placeholder="Select city" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All cities</SelectItem>
            <SelectItem value="Lagos">Lagos</SelectItem>
            <SelectItem value="Abuja">Abuja</SelectItem>
            <SelectItem value="Ibadan">Ibadan</SelectItem>
            <SelectItem value="Kano">Kano</SelectItem>
            <SelectItem value="Enugu">Enugu</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        {(["converted", "pending", "revisit"] as const).map((status) => {
          const active = enabledStatuses.includes(status);
          const tone =
            status === "converted"
              ? "bg-primary text-primary-foreground"
              : status === "pending"
                ? "bg-chart-4 text-foreground"
                : "bg-destructive text-destructive-foreground";
          return (
            <button
              key={status}
              type="button"
              onClick={() => toggleStatus(status)}
              className={`rounded-full border px-3 py-1.5 capitalize transition ${
                active ? `${tone} border-transparent` : "border-border bg-card text-muted-foreground"
              }`}
            >
              {status}
            </button>
          );
        })}
      </div>

      <div className="fieldops-map relative h-[340px] overflow-hidden rounded-3xl border border-border bg-muted/30">
        <MapContainer
          key={theme}
          center={[9.082, 8.6753]}
          zoom={6}
          scrollWheelZoom={false}
          className="h-full w-full saturate-[.85]"
        >
          <TileLayer
            attribution='&copy; OpenStreetMap, &copy; CARTO'
            url={tileUrl}
          />
          <FitToPoints points={filteredPoints} />
          <MarkerClusterGroup chunkedLoading>
            {filteredPoints.map((point) => (
              <div key={point.id}>
                <CircleMarker
                  center={[point.lat, point.lng]}
                  radius={12}
                  pathOptions={{
                    color: markerColor(point.status),
                    fillColor: markerColor(point.status),
                    fillOpacity: 0.18,
                    weight: 1.5,
                  }}
                />
                <CircleMarker
                  center={[point.lat, point.lng]}
                  radius={6}
                  pathOptions={{
                    color: "var(--color-background)",
                    fillColor: markerColor(point.status),
                    fillOpacity: 1,
                    weight: 2,
                  }}
                >
                  <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                    <div className="text-xs">
                      <p className="font-semibold">{point.outlet}</p>
                      <p className="text-muted-foreground">{point.city}</p>
                      <p className="mt-1 text-muted-foreground">
                        {point.lat.toFixed(4)}, {point.lng.toFixed(4)}
                      </p>
                    </div>
                  </Tooltip>
                  <Popup className="fieldops-map-popup">
                    <div className="text-xs">
                      <p className="font-semibold">{point.outlet}</p>
                      <p className="text-muted-foreground">{point.city}</p>
                      <p className="mt-1">
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
                          <span
                            className="size-1.5 rounded-full"
                            style={{ backgroundColor: markerColor(point.status) }}
                          />
                          {markerLabel(point.status)}
                        </span>
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {point.lat.toFixed(4)}, {point.lng.toFixed(4)}
                      </p>
                    </div>
                  </Popup>
                </CircleMarker>
              </div>
            ))}
          </MarkerClusterGroup>
        </MapContainer>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-background/55 to-transparent" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-2.5 py-1">
          <span className="size-2.5 rounded-full bg-primary shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-primary)_20%,transparent)]" />
          Converted
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-2.5 py-1">
          <span className="size-2.5 rounded-full bg-chart-4 shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-chart-4)_20%,transparent)]" />
          Pending
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-2.5 py-1">
          <span className="size-2.5 rounded-full bg-destructive shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-destructive)_20%,transparent)]" />
          Revisit
        </div>
        <span className="ml-auto text-xs">{filteredPoints.length} outlets plotted</span>
      </div>
    </div>
  );
}
