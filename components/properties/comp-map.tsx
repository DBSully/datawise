"use client";

import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MapPinTooltipData = {
  closePrice?: number | null;
  closeDate?: string | null;
  sqft?: number | null;
  sqftDelta?: number | null;       // comp sqft − subject sqft
  sqftDeltaPct?: number | null;    // as decimal e.g. 0.05 = 5%
  ppsf?: number | null;
  distance?: number | null;
  gapPerSqft?: number | null;     // deal-level (ARV − list) / sqft
  listPrice?: number | null;      // subject list price (for subject pin)
};

export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  detail?: string;
  tooltipData?: MapPinTooltipData;
  type: "subject" | "selected" | "candidate";
  /** Optional number/label shown inside the marker (e.g. "1", "2") */
  pinLabel?: string;
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

function numberedIcon(color: string, border: string, size: number, label: string) {
  return makeDivIcon(
    `<div style="
      width:${size}px;height:${size}px;
      background:${color};border:2px solid ${border};border-radius:50%;
      box-shadow:0 1px 4px rgba(0,0,0,0.3);cursor:pointer;
      display:flex;align-items:center;justify-content:center;
      font-size:${Math.max(9, size - 8)}px;font-weight:700;color:#fff;
      line-height:1;font-family:Arial,sans-serif;
    ">${label}</div>`,
    size,
  );
}

/** Gap/sqft → border color for candidate pins */
function gapBorderColor(gapPerSqft: number | null | undefined): string {
  if (gapPerSqft == null) return "#1e293b"; // default dark ring
  if (gapPerSqft >= 60) return "#16a34a";   // green
  if (gapPerSqft >= 30) return "#ca8a04";   // yellow/amber
  return "#dc2626";                          // red
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
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const circleLayerRef = useRef<L.LayerGroup | null>(null);
  const initialFitDoneRef = useRef(false);
  // Keep a stable ref to the callback so the effect doesn't re-run on every render
  const onPinClickRef = useRef(onPinClick);
  onPinClickRef.current = onPinClick;

  // -- Effect 1: Create the map instance once --
  useEffect(() => {
    if (!containerRef.current) return;

    if (mapRef.current) return; // already initialized

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

    // Set a default view so the map is valid before pins arrive
    map.setView([39.7392, -104.9903], 11);

    markerLayerRef.current = L.layerGroup().addTo(map);
    circleLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    initialFitDoneRef.current = false;

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerLayerRef.current = null;
        circleLayerRef.current = null;
        initialFitDoneRef.current = false;
      }
    };
  }, []); // only runs once

  // -- Effect 2: Update markers when pins change (preserve zoom/center) --
  useEffect(() => {
    const map = mapRef.current;
    const markerLayer = markerLayerRef.current;
    const circleLayer = circleLayerRef.current;
    if (!map || !markerLayer || !circleLayer) return;

    // Clear previous markers and circles
    markerLayer.clearLayers();
    circleLayer.clearLayers();

    if (pins.length === 0) return;

    const bounds = L.latLngBounds([]);

    const subjectPins = pins.filter((p) => p.type === "subject");
    const candidatePins = pins.filter((p) => p.type === "candidate");
    const selectedPins = pins.filter((p) => p.type === "selected");

    // Helper — format currency (compact)
    function $f(v: number | null | undefined) {
      if (v == null) return "—";
      return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
    }

    // Helper to build rich tooltip HTML
    function tooltipHtml(pin: MapPin) {
      const t = pin.tooltipData;
      const isSubject = pin.type === "subject";
      const accentColor = isSubject ? "#dc2626" : pin.type === "selected" ? "#16a34a" : "#475569";
      const star = pin.type === "selected" ? "★ " : "";
      const tag = isSubject
        ? `<div style="background:#dc2626;color:#fff;font-size:9px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:1px 5px;border-radius:3px;margin-bottom:3px;display:inline-block">SUBJECT</div><br/>`
        : "";

      let rows = "";
      if (t && !isSubject) {
        // Sale price row
        if (t.closePrice != null) rows += `<tr><td style="color:#94a3b8;padding-right:8px">Net Sale</td><td style="font-weight:600">${$f(t.closePrice)}</td></tr>`;
        // Close date
        if (t.closeDate) rows += `<tr><td style="color:#94a3b8;padding-right:8px">Closed</td><td>${t.closeDate}</td></tr>`;
        // PSF
        if (t.ppsf != null) rows += `<tr><td style="color:#94a3b8;padding-right:8px">PSF</td><td>$${t.ppsf.toFixed(0)}</td></tr>`;
        // Sqft with delta
        if (t.sqft != null) {
          let deltaHtml = "";
          if (t.sqftDelta != null) {
            const sign = t.sqftDelta > 0 ? "+" : "";
            const pctStr = t.sqftDeltaPct != null ? ` (${sign}${(t.sqftDeltaPct * 100).toFixed(1)}%)` : "";
            const deltaColor = t.sqftDelta > 0 ? "#16a34a" : t.sqftDelta < 0 ? "#dc2626" : "#94a3b8";
            deltaHtml = ` <span style="color:${deltaColor};font-weight:600">${sign}${t.sqftDelta.toLocaleString()}${pctStr}</span>`;
          }
          rows += `<tr><td style="color:#94a3b8;padding-right:8px">Sqft</td><td>${t.sqft.toLocaleString()}${deltaHtml}</td></tr>`;
        }
        // Distance
        if (t.distance != null) rows += `<tr><td style="color:#94a3b8;padding-right:8px">Dist</td><td>${t.distance.toFixed(2)} mi</td></tr>`;
        // Gap/sqft
        if (t.gapPerSqft != null) {
          const gapColor = t.gapPerSqft >= 60 ? "#16a34a" : t.gapPerSqft >= 30 ? "#ca8a04" : "#94a3b8";
          rows += `<tr><td style="color:#94a3b8;padding-right:8px">Gap/sf</td><td style="color:${gapColor};font-weight:600">$${t.gapPerSqft.toFixed(0)}</td></tr>`;
        }
      } else if (t && isSubject) {
        if (t.listPrice != null) rows += `<tr><td style="color:#94a3b8;padding-right:8px">List</td><td style="font-weight:600">${$f(t.listPrice)}</td></tr>`;
        if (t.sqft != null) rows += `<tr><td style="color:#94a3b8;padding-right:8px">Sqft</td><td>${t.sqft.toLocaleString()}</td></tr>`;
        if (t.gapPerSqft != null) {
          const gapColor = t.gapPerSqft >= 60 ? "#16a34a" : t.gapPerSqft >= 30 ? "#ca8a04" : "#94a3b8";
          rows += `<tr><td style="color:#94a3b8;padding-right:8px">Gap/sf</td><td style="color:${gapColor};font-weight:600">$${t.gapPerSqft.toFixed(0)}</td></tr>`;
        }
      }

      const metricsTable = rows ? `<table style="font-size:11px;line-height:1.5;margin-top:2px;border-collapse:collapse">${rows}</table>` : "";
      const clickHint = onPinClickRef.current && !isSubject
        ? `<div style="color:#6366f1;font-size:10px;margin-top:3px;border-top:1px solid #e2e8f0;padding-top:3px">${pin.type === "selected" ? "Click to deselect" : "Click to select"}</div>`
        : "";

      return `<div style="font-size:12px;line-height:1.3">
        ${tag}<strong style="color:${accentColor}">${star}${pin.label}</strong>
        ${metricsTable}${clickHint}
      </div>`;
    }

    // Dynamically reposition tooltip toward map center on each hover,
    // so it stays visible even after pan/zoom
    function addSmartTooltip(marker: L.Marker, pin: MapPin, iconSize: number) {
      const html = tooltipHtml(pin);
      const pad = iconSize / 2 + 4;

      function bestDir(): { direction: L.Direction; offset: L.PointExpression } {
        const pinPt = map!.latLngToContainerPoint(marker.getLatLng());
        const size = map!.getSize();
        const dx = size.x / 2 - pinPt.x;
        const dy = size.y / 2 - pinPt.y;

        if (Math.abs(dy) > Math.abs(dx)) {
          return dy > 0
            ? { direction: "bottom", offset: [0, pad] }
            : { direction: "top", offset: [0, -pad] };
        }
        return dx > 0
          ? { direction: "right", offset: [pad, 0] }
          : { direction: "left", offset: [-pad, 0] };
      }

      // Rebind with correct direction on every hover (before Leaflet opens it)
      marker.on("mouseover", () => {
        if (marker.getTooltip()) marker.unbindTooltip();
        const d = bestDir();
        marker.bindTooltip(html, {
          direction: d.direction,
          offset: d.offset,
          opacity: 0.97,
          className: "comp-map-tooltip",
        });
        marker.openTooltip();
      });
    }

    // Candidates (bottom layer) — border color reflects gap/sqft
    for (const pin of candidatePins) {
      const border = gapBorderColor(pin.tooltipData?.gapPerSqft);
      const icon = pin.pinLabel
        ? numberedIcon("#94a3b8", border, 20, pin.pinLabel)
        : compIcon("#94a3b8", border, 13);
      const marker = L.marker([pin.lat, pin.lng], {
        icon,
        zIndexOffset: 100,
      });
      addSmartTooltip(marker, pin, 13);
      if (onPinClickRef.current) {
        marker.on("click", () => onPinClickRef.current?.(pin.id, "candidate"));
      }
      markerLayer.addLayer(marker);
      bounds.extend([pin.lat, pin.lng]);
    }

    // Selected (middle layer)
    for (const pin of selectedPins) {
      const icon = pin.pinLabel
        ? numberedIcon("#16a34a", "#fff", 20, pin.pinLabel)
        : ICONS.selected;
      const marker = L.marker([pin.lat, pin.lng], {
        icon,
        zIndexOffset: 200,
      });
      addSmartTooltip(marker, pin, 14);
      if (onPinClickRef.current) {
        marker.on("click", () => onPinClickRef.current?.(pin.id, "selected"));
      }
      markerLayer.addLayer(marker);
      bounds.extend([pin.lat, pin.lng]);
    }

    // Subject (top layer, never clickable)
    for (const pin of subjectPins) {
      const marker = L.marker([pin.lat, pin.lng], {
        icon: ICONS.subject,
        zIndexOffset: 1000,
      });
      addSmartTooltip(marker, pin, 20);
      markerLayer.addLayer(marker);
      bounds.extend([pin.lat, pin.lng]);
    }

    // Distance circles with labels placed on the ring edge
    if (showDistanceCircles && subjectLat && subjectLng) {
      const subjectLatLng = L.latLng(subjectLat, subjectLng);

      circleLayer.addLayer(L.circle(subjectLatLng, {
        radius: 0.5 * METERS_PER_MILE,
        color: "#6366f1",
        weight: 1.5,
        dashArray: "6 4",
        fillOpacity: 0.03,
        interactive: false,
      }));

      circleLayer.addLayer(L.circle(subjectLatLng, {
        radius: 1 * METERS_PER_MILE,
        color: "#6366f1",
        weight: 1.5,
        dashArray: "6 4",
        fillOpacity: 0.02,
        interactive: false,
      }));

      // Place labels on the right edge of each ring
      const halfMilePt = subjectLatLng.toBounds(0.5 * METERS_PER_MILE * 2);
      circleLayer.addLayer(L.marker([subjectLat, halfMilePt.getEast()], {
        icon: L.divIcon({
          className: "leaflet-distance-label",
          html: "0.5 mi",
          iconSize: [40, 16],
          iconAnchor: [20, 8],
        }),
        interactive: false,
      }));

      const oneMilePt = subjectLatLng.toBounds(1 * METERS_PER_MILE * 2);
      circleLayer.addLayer(L.marker([subjectLat, oneMilePt.getEast()], {
        icon: L.divIcon({
          className: "leaflet-distance-label",
          html: "1 mi",
          iconSize: [32, 16],
          iconAnchor: [16, 8],
        }),
        interactive: false,
      }));
    }

    // Only fit bounds on the first render — preserve user's zoom/pan after that
    if (!initialFitDoneRef.current && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
      initialFitDoneRef.current = true;
    }
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
