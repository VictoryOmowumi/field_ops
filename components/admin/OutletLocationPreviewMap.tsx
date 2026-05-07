"use client";

import { Circle, MapContainer, Marker, Popup, TileLayer } from "react-leaflet";

type OutletLocationPreviewMapProps = {
  name: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
};

export default function OutletLocationPreviewMap({
  name,
  latitude,
  longitude,
  accuracyMeters = 18,
}: OutletLocationPreviewMapProps) {
  return (
    <div className="relative mt-5 h-72 overflow-hidden rounded-3xl border border-border bg-background">
      <MapContainer
        center={[latitude, longitude]}
        zoom={16}
        scrollWheelZoom={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; OpenStreetMap, &copy; CARTO'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        <Circle
          center={[latitude, longitude]}
          radius={accuracyMeters}
          pathOptions={{
            color: "var(--color-primary)",
            fillColor: "var(--color-primary)",
            fillOpacity: 0.15,
            weight: 1.5,
          }}
        />
        <Marker position={[latitude, longitude]}>
          <Popup>
            <div className="text-xs">
              <p className="font-medium">{name}</p>
              <p className="text-muted-foreground">
                {latitude.toFixed(4)}, {longitude.toFixed(4)}
              </p>
              <p className="text-muted-foreground">Accuracy: ±{accuracyMeters}m</p>
            </div>
          </Popup>
        </Marker>
      </MapContainer>

      <div className="absolute bottom-4 left-4 rounded-2xl border border-border bg-popover/90 p-3 text-xs shadow-sm backdrop-blur">
        <p className="font-medium">{name}</p>
        <p className="mt-1 text-muted-foreground">
          {latitude.toFixed(4)}, {longitude.toFixed(4)}
        </p>
      </div>
    </div>
  );
}

