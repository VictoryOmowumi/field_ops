"use client";

import { useCallback, useState } from "react";

type LocationState = {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  error?: string;
  loading: boolean;
};

export function useGeolocation() {
  const [location, setLocation] = useState<LocationState>({ loading: false });

  const captureLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocation({ loading: false, error: "Geolocation is not supported on this device." });
      return;
    }

    setLocation((prev) => ({ ...prev, loading: true, error: undefined }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          loading: false,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        setLocation({ loading: false, error: error.message });
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, []);

  return {
    location,
    captureLocation,
  };
}
