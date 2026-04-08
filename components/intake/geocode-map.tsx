"use client";

import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Default center: Denver
const DEFAULT_CENTER: [number, number] = [39.7392, -104.9903];
const DEFAULT_ZOOM = 11;
const PIN_ZOOM = 16;

type GeocodeMapProps = {
  lat: number | null;
  lng: number | null;
  onCoordsChange: (lat: number, lng: number) => void;
  /** Fixed pixel height. Ignored when className includes aspect-* utility. */
  height?: number;
  className?: string;
};

function makePropertyIcon() {
  return L.divIcon({
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    html: `<div style="
      width:24px;height:24px;
      background:#dc2626;border:3px solid #fff;border-radius:50% 50% 50% 0;
      box-shadow:0 2px 6px rgba(0,0,0,0.35);
      transform:rotate(-45deg);
    "></div>`,
  });
}

export function GeocodeMap({
  lat,
  lng,
  onCoordsChange,
  height = 300,
  className = "",
}: GeocodeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onCoordsChangeRef = useRef(onCoordsChange);
  onCoordsChangeRef.current = onCoordsChange;

  // Create map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      scrollWheelZoom: true,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    L.control
      .attribution({ position: "bottomright", prefix: false })
      .addAttribution(
        '&copy; <a href="https://openstreetmap.org/copyright">OSM</a>',
      )
      .addTo(map);

    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    // Click-to-place: user clicks the map to drop a pin
    map.on("click", (e: L.LeafletMouseEvent) => {
      const { lat: clickLat, lng: clickLng } = e.latlng;
      onCoordsChangeRef.current(
        parseFloat(clickLat.toFixed(6)),
        parseFloat(clickLng.toFixed(6)),
      );
    });

    mapRef.current = map;

    // Leaflet needs a size recalc when the container uses CSS aspect-ratio
    // because the height isn't known at the moment of L.map() init.
    requestAnimationFrame(() => map.invalidateSize());

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Update marker when lat/lng change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove old marker
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }

    if (lat != null && lng != null) {
      const marker = L.marker([lat, lng], {
        icon: makePropertyIcon(),
        draggable: true,
      }).addTo(map);

      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        onCoordsChangeRef.current(
          parseFloat(pos.lat.toFixed(6)),
          parseFloat(pos.lng.toFixed(6)),
        );
      });

      markerRef.current = marker;
      map.setView([lat, lng], Math.max(map.getZoom(), PIN_ZOOM));
    } else {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    }
  }, [lat, lng]);

  // When using an aspect-ratio class (e.g. aspect-square), let CSS control
  // the height. Otherwise fall back to the explicit pixel height.
  const useAspect = className.includes("aspect-");

  return (
    <div
      ref={containerRef}
      className={`rounded-lg border border-slate-200 ${className}`}
      style={useAspect ? undefined : { height }}
    />
  );
}
