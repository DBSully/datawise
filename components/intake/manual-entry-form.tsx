"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { createManualPropertyAction } from "@/app/(workspace)/intake/manual/actions";

const GeocodeMap = dynamic(
  () => import("./geocode-map").then((m) => ({ default: m.GeocodeMap })),
  { ssr: false },
);

export function ManualEntryForm() {
  // Address fields
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("CO");
  const [postalCode, setPostalCode] = useState("");

  // Geocoding state
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [mapVisible, setMapVisible] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeFailed, setGeocodeFailed] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addressComplete =
    address.trim() && city.trim() && state.trim() && postalCode.trim();

  // ---------- Geocoding ----------

  const geocode = useCallback(async () => {
    if (!addressComplete) return;

    setGeocoding(true);
    setGeocodeFailed(false);

    try {
      const q = `${address.trim()}, ${city.trim()}, ${state.trim()}, ${postalCode.trim()}`;
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`;

      const res = await fetch(url, {
        headers: { "User-Agent": "DataWise/1.0" },
      });
      const data = await res.json();

      if (Array.isArray(data) && data.length > 0) {
        const result = data[0];
        setLat(parseFloat(parseFloat(result.lat).toFixed(6)));
        setLng(parseFloat(parseFloat(result.lon).toFixed(6)));
        setGeocodeFailed(false);
      } else {
        setLat(null);
        setLng(null);
        setGeocodeFailed(true);
      }
    } catch {
      setLat(null);
      setLng(null);
      setGeocodeFailed(true);
    } finally {
      setGeocoding(false);
      setMapVisible(true);
    }
  }, [address, city, state, postalCode, addressComplete]);

  // Auto-geocode on postal_code blur (debounced 500ms)
  const handlePostalCodeBlur = useCallback(() => {
    if (!addressComplete) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      geocode();
    }, 500);
  }, [addressComplete, geocode]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // ---------- Map interaction ----------

  const handleCoordsChange = useCallback((newLat: number, newLng: number) => {
    setLat(newLat);
    setLng(newLng);
    setGeocodeFailed(false);
  }, []);

  // Google Maps fallback URL
  const googleMapsUrl = addressComplete
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address} ${city} ${state} ${postalCode}`)}`
    : "#";

  return (
    <form
      action={createManualPropertyAction}
      className="flex flex-row items-start gap-5"
    >
      {/* ── Left column ── */}
      <div className="flex flex-col gap-4" style={{ width: 500 }}>
        {/* Panel 1: Location */}
        <div className="dw-card space-y-3">
          <h2 className="text-sm font-semibold text-slate-800">Location</h2>

          {/* Row 1: Address + Unit */}
          <div className="grid gap-2" style={{ gridTemplateColumns: "60% 15%" }}>
            <div>
              <label className="dw-label">Address</label>
              <input
                name="unparsed_address"
                className="dw-input"
                placeholder="5601 E Nichols Pl"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
            <div>
              <label className="dw-label">Unit #</label>
              <input
                name="unit_number"
                className="dw-input"
                placeholder="310"
              />
            </div>
          </div>

          {/* Row 2: City + State + Postal */}
          <div className="grid gap-2" style={{ gridTemplateColumns: "40% 15% 20%" }}>
            <div>
              <label className="dw-label">City</label>
              <input
                name="city"
                className="dw-input"
                placeholder="Centennial"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div>
              <label className="dw-label">State</label>
              <input
                name="state"
                className="dw-input"
                placeholder="CO"
                required
                value={state}
                onChange={(e) => setState(e.target.value)}
              />
            </div>
            <div>
              <label className="dw-label">Postal code</label>
              <input
                name="postal_code"
                className="dw-input"
                placeholder="80112"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                onBlur={handlePostalCodeBlur}
              />
            </div>
          </div>

          {/* Row 3: Geocoding button */}
          <div>
            <button
              type="button"
              onClick={geocode}
              disabled={!addressComplete || geocoding}
              className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {geocoding ? (
                <>
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                  Looking up…
                </>
              ) : (
                "Look up coordinates"
              )}
            </button>
          </div>
        </div>

        {/* Panel 2: Property Details */}
        <div className="dw-card space-y-3">
          <h2 className="text-sm font-semibold text-slate-800">
            Property Details
          </h2>

          <div className="flex gap-2">
            <div style={{ width: 220 }}>
              <label className="dw-label">Property type</label>
              <select name="property_type" className="dw-select">
                <option value="">—</option>
                <option value="Detached">Detached</option>
                <option value="Condo">Condo</option>
                <option value="Townhome">Townhome</option>
                <option value="Duplex">Duplex</option>
                <option value="Triplex">Triplex</option>
                <option value="Fourplex">Fourplex</option>
              </select>
            </div>
            <div style={{ width: 100 }}>
              <label className="dw-label">Year built</label>
              <input name="year_built" className="dw-input" placeholder="1985" />
            </div>
            <div style={{ width: 120 }}>
              <label className="dw-label">Lot sqft</label>
              <input name="lot_size_sqft" className="dw-input" placeholder="7500" />
            </div>
          </div>

          <div className="flex gap-2">
            <div style={{ width: 160 }}>
              <label className="dw-label">Level class</label>
              <select name="level_class_standardized" className="dw-select">
                <option value="">—</option>
                <option value="One Story">One Story</option>
                <option value="Two Story">Two Story</option>
                <option value="Three+ Story">Three+ Story</option>
                <option value="Bi-Level">Bi-Level</option>
                <option value="Multi-Level">Multi-Level</option>
              </select>
            </div>
            <div style={{ width: 180 }}>
              <label className="dw-label">Building form</label>
              <select name="building_form_standardized" className="dw-select">
                <option value="">—</option>
                <option value="house">House</option>
                <option value="high_rise">High Rise</option>
                <option value="mid_rise">Mid Rise</option>
                <option value="low_rise">Low Rise</option>
                <option value="townhouse_style">Townhouse Style</option>
                <option value="patio_cluster">Patio / Cluster</option>
                <option value="duplex">Duplex</option>
                <option value="triplex">Triplex</option>
                <option value="quadruplex">Quadruplex</option>
                <option value="manufactured_house">Manufactured House</option>
              </select>
            </div>
            <div style={{ width: 100 }}>
              <label className="dw-label">Attached</label>
              <select name="property_attached_yn" className="dw-select">
                <option value="">—</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <div style={{ width: 140 }}>
              <label className="dw-label">Building sqft</label>
              <input
                name="building_area_total_sqft"
                className="dw-input"
                placeholder="2400"
              />
            </div>
            <div style={{ width: 120 }}>
              <label className="dw-label">Above grade</label>
              <input
                name="above_grade_finished_area_sqft"
                className="dw-input"
                placeholder="1800"
              />
            </div>
            <div style={{ width: 120 }}>
              <label className="dw-label">Below grade</label>
              <input
                name="below_grade_total_sqft"
                className="dw-input"
                placeholder="600"
              />
            </div>
            <div style={{ width: 120 }}>
              <label className="dw-label">BG finished</label>
              <input
                name="below_grade_finished_area_sqft"
                className="dw-input"
                placeholder="400"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <div style={{ width: 70 }}>
              <label className="dw-label">Beds</label>
              <input name="bedrooms_total" className="dw-input" placeholder="4" />
            </div>
            <div style={{ width: 70 }}>
              <label className="dw-label">Baths</label>
              <input name="bathrooms_total" className="dw-input" placeholder="3" />
            </div>
            <div style={{ width: 70 }}>
              <label className="dw-label">Garage</label>
              <input name="garage_spaces" className="dw-input" placeholder="2" />
            </div>
          </div>
        </div>

        {/* Panel 3: Notes */}
        <div className="dw-card space-y-3">
          <h2 className="text-sm font-semibold text-slate-800">Notes</h2>

          <div>
            <label className="dw-label">Import notes</label>
            <textarea
              name="import_notes"
              className="dw-textarea"
              rows={4}
              placeholder="e.g. Off-market lead from agent, historical comp sale"
            />
          </div>
        </div>

        {/* Submit */}
        <div>
          <button type="submit" className="dw-button-primary">
            Add Property
          </button>
        </div>
      </div>

      {/* ── Right column: Map panel ── */}
      <div className="flex flex-col" style={{ width: 460 }}>
        <div className="dw-card space-y-3">
          <h2 className="text-sm font-semibold text-slate-800">Pin Location</h2>

          {mapVisible ? (
            <div className="animate-in fade-in slide-in-from-right-2 duration-300">
              <GeocodeMap
                lat={lat}
                lng={lng}
                onCoordsChange={handleCoordsChange}
                height={420}
              />
              <p className="mt-1 text-[10px] leading-tight text-slate-400">
                {lat != null && lng != null
                  ? "Drag the pin to adjust if needed"
                  : "Click map to place pin"}
              </p>
            </div>
          ) : (
            <div
              className="flex items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-[10px] text-slate-400"
              style={{ height: 420 }}
            >
              Map appears after lookup
            </div>
          )}

          {/* Lat/Lng */}
          <div className="flex gap-2">
            <div style={{ width: 120 }}>
              <label className="dw-label text-[10px]">Lat</label>
              <input
                className="dw-input bg-slate-100 text-slate-500 cursor-not-allowed text-[10px] py-1"
                readOnly
                tabIndex={-1}
                value={lat != null ? lat.toString() : ""}
                placeholder="—"
              />
              <input
                type="hidden"
                name="latitude"
                value={lat != null ? lat.toString() : ""}
              />
            </div>
            <div style={{ width: 120 }}>
              <label className="dw-label text-[10px]">Lng</label>
              <input
                className="dw-input bg-slate-100 text-slate-500 cursor-not-allowed text-[10px] py-1"
                readOnly
                tabIndex={-1}
                value={lng != null ? lng.toString() : ""}
                placeholder="—"
              />
              <input
                type="hidden"
                name="longitude"
                value={lng != null ? lng.toString() : ""}
              />
            </div>
          </div>

          {/* Google Maps fallback */}
          {geocodeFailed && (
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-amber-600 underline hover:text-amber-700"
            >
              Look up on Google Maps &rarr;
            </a>
          )}
        </div>
      </div>
    </form>
  );
}
