"use client";

import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  detail?: string;
  type: "subject" | "selected" | "candidate";
};

type CompMapProps = {
  pins: MapPin[];
  height?: number;
  className?: string;
  /** Subject coordinates for distance circles */
  subjectLat?: number | null;
  subjectLng?: number | null;
  /** Show 0.5mi and 1mi distance circles (default true) */
  showDistanceCircles?: boolean;
  /** Called when a candidate/selected pin is clicked — returns pin id */
  onPinClick?: (pinId: string, currentType: "selected" | "candidate") => void;
};

// ---------------------------------------------------------------------------
// Pin icon helpers
// ---------------------------------------------------------------------------

const METERS_PER_MILE = 1609.344;

function makeDivIcon(html: string, size: number) {
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    html,
  });
}

function compIcon(color: string, border: string, size: number) {
  return makeDivIcon(
    `<div style="
      width:${size}px;height:${size}px;
      background:${color};border:2px solid ${border};border-radius:50%;
      box-shadow:0 1px 4px rgba(0,0,0,0.3);cursor:pointer;
    "></div>`,
    size,
  );
}

const ICONS = {
  subject: makeDivIcon(
    `<div style="
      width:20px;height:20px;
      background:#dc2626;border:3px solid #fff;border-radius:50%;
      box-shadow:0 0 0 2px #dc2626,0 2px 6px rgba(0,0,0,0.4);
    "></div>`,
    20,
  ),
  selected: compIcon("#16a34a", "#fff", 14),
  candidate: compIcon("#94a3b8", "#1e293b", 13),
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CompMap({
  pins,
  height = 300,
  className = "",
  subjectLat,
  subjectLng,
  showDistanceCircles = true,
  onPinClick,
}: CompMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  // Keep a stable ref to the callback so the effect doesn't re-run on every render
  const onPinClickRef = useRef(onPinClick);
  onPinClickRef.current = onPinClick;

  useEffect(() => {
    if (!containerRef.current || pins.length === 0) return;

    // Clean up previous map instance
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = L.map(containerRef.current, {
      scrollWheelZoom: false,
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

    const bounds = L.latLngBounds([]);

    const subjectPins = pins.filter((p) => p.type === "subject");
    const candidatePins = pins.filter((p) => p.type === "candidate");
    const selectedPins = pins.filter((p) => p.type === "selected");

    // Helper to build popup HTML
    function popupHtml(pin: MapPin, interactive: boolean) {
      const colorStyle =
        pin.type === "selected"
          ? ' style="color:#16a34a"'
          : pin.type === "subject"
            ? ' style="color:#dc2626"'
            : "";
      const prefix = pin.type === "subject" ? "<strong style=\"color:#dc2626\">SUBJECT</strong><br/>" : "";
      const star = pin.type === "selected" ? "&#9733; " : "";
      const action = interactive
        ? `<br/><span style="color:#6366f1;font-size:11px;cursor:pointer">${pin.type === "selected" ? "Click to deselect" : "Click to select"}</span>`
        : "";
      return `<div style="font-size:12px;line-height:1.4">
        ${prefix}<strong${colorStyle}>${star}${pin.label}</strong>
        ${pin.detail ? `<br/>${pin.detail}` : ""}${action}
      </div>`;
    }

    // Candidates (bottom layer)
    for (const pin of candidatePins) {
      const marker = L.marker([pin.lat, pin.lng], {
        icon: ICONS.candidate,
        zIndexOffset: 100,
      }).addTo(map);
      marker.bindPopup(popupHtml(pin, !!onPinClickRef.current), {
        closeButton: false,
        maxWidth: 240,
      });
      if (onPinClickRef.current) {
        marker.on("click", () => onPinClickRef.current?.(pin.id, "candidate"));
      }
      bounds.extend([pin.lat, pin.lng]);
    }

    // Selected (middle layer)
    for (const pin of selectedPins) {
      const marker = L.marker([pin.lat, pin.lng], {
        icon: ICONS.selected,
        zIndexOffset: 200,
      }).addTo(map);
      marker.bindPopup(popupHtml(pin, !!onPinClickRef.current), {
        closeButton: false,
        maxWidth: 240,
      });
      if (onPinClickRef.current) {
        marker.on("click", () => onPinClickRef.current?.(pin.id, "selected"));
      }
      bounds.extend([pin.lat, pin.lng]);
    }

    // Subject (top layer, never clickable)
    for (const pin of subjectPins) {
      const marker = L.marker([pin.lat, pin.lng], {
        icon: ICONS.subject,
        zIndexOffset: 1000,
      }).addTo(map);
      marker.bindPopup(popupHtml(pin, false), {
        closeButton: false,
        maxWidth: 240,
      });
      bounds.extend([pin.lat, pin.lng]);
    }

    // Distance circles with labels placed on the ring edge
    if (showDistanceCircles && subjectLat && subjectLng) {
      const subjectLatLng = L.latLng(subjectLat, subjectLng);

      const halfMileCircle = L.circle(subjectLatLng, {
        radius: 0.5 * METERS_PER_MILE,
        color: "#6366f1",
        weight: 1.5,
        dashArray: "6 4",
        fillOpacity: 0.03,
        interactive: false,
      }).addTo(map);

      const oneMileCircle = L.circle(subjectLatLng, {
        radius: 1 * METERS_PER_MILE,
        color: "#6366f1",
        weight: 1.5,
        dashArray: "6 4",
        fillOpacity: 0.02,
        interactive: false,
      }).addTo(map);

      // Place labels on the right edge of each ring
      const halfMilePt = subjectLatLng.toBounds(0.5 * METERS_PER_MILE * 2);
      L.marker([subjectLat, halfMilePt.getEast()], {
        icon: L.divIcon({
          className: "leaflet-distance-label",
          html: "0.5 mi",
          iconSize: [40, 16],
          iconAnchor: [20, 8],
        }),
        interactive: false,
      }).addTo(map);

      const oneMilePt = subjectLatLng.toBounds(1 * METERS_PER_MILE * 2);
      L.marker([subjectLat, oneMilePt.getEast()], {
        icon: L.divIcon({
          className: "leaflet-distance-label",
          html: "1 mi",
          iconSize: [32, 16],
          iconAnchor: [16, 8],
        }),
        interactive: false,
      }).addTo(map);
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
    }

    mapRef.current = map;

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [pins, subjectLat, subjectLng, showDistanceCircles]);

  if (pins.length === 0) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-400 ${className}`}
        style={{ height }}
      >
        No location data available
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`rounded-lg border border-slate-200 ${className}`}
      style={{ height }}
    />
  );
}
