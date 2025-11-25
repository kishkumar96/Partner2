"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Event, Hazard, FilterState, DistrictGeoProperties } from "@/types";
import { formatCurrency, formatNumber, getHazardColor } from "@/utils/formatters";
import { filterEvents } from "@/utils/filterUtils";
import { hazardLayers, hazards as allHazards } from "@/data/mockData";
import { districtsGeoJSON } from "@/data/districtsGeo";

// Free OpenStreetMap-based tile style (no API key required)
const MAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

// Layer IDs for district polygons
const DISTRICTS_SOURCE_ID = "districts-source";
const DISTRICTS_FILL_LAYER_ID = "districts-fill";
const DISTRICTS_OUTLINE_LAYER_ID = "districts-outline";
const DISTRICTS_HOVER_LAYER_ID = "districts-hover";

// Hazard zone layer configuration
const HAZARD_ZONE_OPACITY_VISIBLE = 0.25;
const HAZARD_ZONE_OPACITY_HIDDEN = 0;
const HAZARD_ZONE_OUTLINE_OPACITY_VISIBLE = 0.8;
const HAZARD_ZONE_OUTLINE_OPACITY_HIDDEN = 0;
const HAZARD_ZONE_TRANSITION_DURATION = 300; // ms

/**
 * Shared mapping between hazard IDs and their exposure property names.
 * Used in both popup HTML generation and filter sync logic.
 */
const HAZARD_EXPOSURE_FIELDS: Record<string, keyof DistrictGeoProperties> = {
  flood: "floodExposure",
  drought: "droughtExposure",
  cyclone: "cycloneExposure",
  earthquake: "earthquakeExposure",
  wildfire: "wildfireExposure",
};

/**
 * Creates a MapLibre expression for hazard-based color matching.
 * Reused for fill layer, outline layer, and default expression.
 */
function createHazardColorExpression(): maplibregl.ExpressionSpecification {
  return [
    "match",
    ["get", "primaryHazard"],
    "flood", getHazardColor("flood"),
    "drought", getHazardColor("drought"),
    "cyclone", getHazardColor("cyclone"),
    "earthquake", getHazardColor("earthquake"),
    "wildfire", getHazardColor("wildfire"),
    "#6B7280", // default gray
  ];
}

/**
 * Creates styled HTML for the district popup.
 */
function createDistrictPopupHTML(
  props: DistrictGeoProperties,
  selectedHazards: string[]
): string {
  const hazard = allHazards.find((h) => h.id === props.primaryHazard);
  const hazardIcon = hazard?.icon || "";
  const hazardName = hazard?.name || props.primaryHazard;

  // Build exposure info using shared HAZARD_EXPOSURE_FIELDS mapping
  const exposureMap: Record<string, { label: string; value: number }> = {};
  for (const [hazardId, fieldName] of Object.entries(HAZARD_EXPOSURE_FIELDS)) {
    exposureMap[hazardId] = {
      label: hazardId.charAt(0).toUpperCase() + hazardId.slice(1),
      value: props[fieldName] as number,
    };
  }

  // Determine which hazards to show (filtered or all)
  const hazardsToShow =
    selectedHazards.length > 0 ? selectedHazards : Object.keys(exposureMap);

  const exposureBars = hazardsToShow
    .map((hazardId) => {
      const exp = exposureMap[hazardId];
      if (!exp) return "";
      const color = getHazardColor(hazardId);
      const pct = Math.round(exp.value * 100);
      return `
        <div style="margin-bottom: 4px;">
          <div style="display: flex; justify-content: space-between; font-size: 11px; color: #6b7280;">
            <span>${exp.label}</span>
            <span>${pct}%</span>
          </div>
          <div style="height: 4px; background: #e5e7eb; border-radius: 2px; overflow: hidden;">
            <div style="height: 100%; width: ${pct}%; background: ${color}; transition: width 0.3s;"></div>
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <div style="
      padding: 12px;
      min-width: 220px;
      font-family: system-ui, -apple-system, sans-serif;
    ">
      <h3 style="
        font-weight: 600;
        font-size: 15px;
        margin: 0 0 8px 0;
        color: #1f2937;
        border-bottom: 1px solid #e5e7eb;
        padding-bottom: 8px;
      ">
        ${props.name}
      </h3>
      <div style="font-size: 12px; color: #374151; margin-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 4px;">
          <span style="font-weight: 500;">Primary Hazard:</span>
          <span style="
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 8px;
            background: ${getHazardColor(props.primaryHazard)}20;
            color: ${getHazardColor(props.primaryHazard)};
            border-radius: 12px;
            font-weight: 500;
          ">
            ${hazardIcon} ${hazardName}
          </span>
        </div>
      </div>
      <div style="
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 10px;
        font-size: 12px;
      ">
        <div style="background: #f9fafb; padding: 6px 8px; border-radius: 6px;">
          <div style="color: #6b7280; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Population</div>
          <div style="font-weight: 600; color: #1f2937;">${formatNumber(props.population)}</div>
        </div>
        <div style="background: #f9fafb; padding: 6px 8px; border-radius: 6px;">
          <div style="color: #6b7280; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Economic Damage</div>
          <div style="font-weight: 600; color: #1f2937;">${formatCurrency(props.economicDamageUSD)}</div>
        </div>
        <div style="background: #f9fafb; padding: 6px 8px; border-radius: 6px;">
          <div style="color: #6b7280; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Buildings</div>
          <div style="font-weight: 600; color: #1f2937;">${formatNumber(props.buildingCount)}</div>
        </div>
        <div style="background: #f9fafb; padding: 6px 8px; border-radius: 6px;">
          <div style="color: #6b7280; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Infrastructure</div>
          <div style="font-weight: 600; color: #1f2937;">${formatNumber(props.infrastructureCount)}</div>
        </div>
      </div>
      <div>
        <div style="font-size: 11px; font-weight: 500; color: #374151; margin-bottom: 6px;">Hazard Exposure</div>
        ${exposureBars}
      </div>
    </div>
  `;
}

interface MapViewProps {
  events: Event[];
  hazards: Hazard[];
  filters: FilterState;
  onEventSelect: (event: Event | null) => void;
}

export default function MapView({
  events,
  hazards,
  filters,
  onEventSelect,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Filter events based on current filters using shared utility
  const filteredEvents = useMemo(
    () => filterEvents(events, filters),
    [events, filters]
  );

  const getHazardInfo = useCallback((hazardId: string) => {
    return hazards.find((h) => h.id === hazardId);
  }, [hazards]);

  // Initialize map
  useEffect(() => {
    if (map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current!,
      style: MAP_STYLE,
      center: [55.2, 25.0],
      zoom: 8,
    });

    map.current.addControl(new maplibregl.NavigationControl(), "top-right");
    map.current.addControl(new maplibregl.ScaleControl(), "bottom-left");

    map.current.on("load", () => {
      setMapLoaded(true);
    });
    
    map.current.on("error", (e) => {
      console.error("Map error:", e);
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Add district polygon layers after map loads
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const m = map.current;
    const hazardColorExpression = createHazardColorExpression();

    // Add source for district polygons if not exists
    if (!m.getSource(DISTRICTS_SOURCE_ID)) {
      m.addSource(DISTRICTS_SOURCE_ID, {
        type: "geojson",
        data: districtsGeoJSON as GeoJSON.FeatureCollection,
        promoteId: "id", // Required for feature state
      });

      // Add fill layer for districts with semi-transparent colors
      m.addLayer({
        id: DISTRICTS_FILL_LAYER_ID,
        type: "fill",
        source: DISTRICTS_SOURCE_ID,
        paint: {
          "fill-color": hazardColorExpression,
          "fill-opacity": 0.4,
          "fill-opacity-transition": { duration: 300 },
        },
      });

      // Add outline layer for clean borders
      m.addLayer({
        id: DISTRICTS_OUTLINE_LAYER_ID,
        type: "line",
        source: DISTRICTS_SOURCE_ID,
        paint: {
          "line-color": hazardColorExpression,
          "line-width": 2,
          "line-opacity": 0.8,
        },
      });

      // Add hover highlight layer (initially invisible)
      m.addLayer({
        id: DISTRICTS_HOVER_LAYER_ID,
        type: "fill",
        source: DISTRICTS_SOURCE_ID,
        paint: {
          "fill-color": "#ffffff",
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            0.3,
            0,
          ],
        },
      });
    }
  }, [mapLoaded]);

  // Handle district hover and click interactions
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const m = map.current;
    let hoveredDistrictId: string | null = null;

    // Change cursor on hover
    const handleMouseEnter = () => {
      m.getCanvas().style.cursor = "pointer";
    };

    const handleMouseLeave = () => {
      m.getCanvas().style.cursor = "";
      if (hoveredDistrictId !== null) {
        m.setFeatureState(
          { source: DISTRICTS_SOURCE_ID, id: hoveredDistrictId },
          { hover: false }
        );
        hoveredDistrictId = null;
      }
    };

    const handleMouseMove = (e: maplibregl.MapLayerMouseEvent) => {
      if (e.features && e.features.length > 0) {
        const feature = e.features[0];
        const featureId = feature.properties?.id;

        if (hoveredDistrictId !== null && hoveredDistrictId !== featureId) {
          m.setFeatureState(
            { source: DISTRICTS_SOURCE_ID, id: hoveredDistrictId },
            { hover: false }
          );
        }

        if (featureId) {
          hoveredDistrictId = featureId;
          m.setFeatureState(
            { source: DISTRICTS_SOURCE_ID, id: featureId },
            { hover: true }
          );
        }
      }
    };

    const handleClick = (e: maplibregl.MapLayerMouseEvent) => {
      if (e.features && e.features.length > 0) {
        const feature = e.features[0];
        const props = feature.properties as unknown as DistrictGeoProperties;

        // Close existing popup using ref
        if (popupRef.current) {
          popupRef.current.remove();
        }

        // Create styled popup and store in ref
        popupRef.current = new maplibregl.Popup({
          closeButton: true,
          closeOnClick: true,
          maxWidth: "280px",
          className: "district-popup",
        })
          .setLngLat(e.lngLat)
          .setHTML(createDistrictPopupHTML(props, filters.selectedHazards))
          .addTo(m);
      }
    };

    // Register event handlers
    m.on("mouseenter", DISTRICTS_FILL_LAYER_ID, handleMouseEnter);
    m.on("mouseleave", DISTRICTS_FILL_LAYER_ID, handleMouseLeave);
    m.on("mousemove", DISTRICTS_FILL_LAYER_ID, handleMouseMove);
    m.on("click", DISTRICTS_FILL_LAYER_ID, handleClick);

    return () => {
      m.off("mouseenter", DISTRICTS_FILL_LAYER_ID, handleMouseEnter);
      m.off("mouseleave", DISTRICTS_FILL_LAYER_ID, handleMouseLeave);
      m.off("mousemove", DISTRICTS_FILL_LAYER_ID, handleMouseMove);
      m.off("click", DISTRICTS_FILL_LAYER_ID, handleClick);
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
    };
  }, [mapLoaded, filters.selectedHazards]);

  // Update district layer visibility/opacity based on selected hazards
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const m = map.current;

    if (!m.getLayer(DISTRICTS_FILL_LAYER_ID)) return;

    // Use shared color expression for default styling
    const defaultColorExpression = createHazardColorExpression();

    if (filters.selectedHazards.length === 0) {
      // Show all districts with default styling
      m.setPaintProperty(DISTRICTS_FILL_LAYER_ID, "fill-color", defaultColorExpression);
      m.setPaintProperty(DISTRICTS_OUTLINE_LAYER_ID, "line-color", defaultColorExpression);
      m.setPaintProperty(DISTRICTS_FILL_LAYER_ID, "fill-opacity", 0.4);
      m.setPaintProperty(DISTRICTS_OUTLINE_LAYER_ID, "line-opacity", 0.8);
    } else {
      // Build case expression for selected hazards
      // TypeScript assertions needed due to MapLibre's complex expression types
      const caseArgs: (maplibregl.ExpressionSpecification | string)[] = [];
      for (const hazard of filters.selectedHazards) {
        caseArgs.push(["==", ["get", "primaryHazard"], hazard] as maplibregl.ExpressionSpecification);
        caseArgs.push(getHazardColor(hazard));
      }
      caseArgs.push("#9CA3AF"); // fallback for non-matching

      // Type assertion required for dynamic case expression construction
      const colorExpression = ["case", ...caseArgs] as maplibregl.ExpressionSpecification;

      m.setPaintProperty(DISTRICTS_FILL_LAYER_ID, "fill-color", colorExpression);
      m.setPaintProperty(DISTRICTS_OUTLINE_LAYER_ID, "line-color", colorExpression);

      // Build max exposure expression for selected hazards using shared mapping
      const exposureExpressions = filters.selectedHazards
        .filter((h) => HAZARD_EXPOSURE_FIELDS[h])
        .map((h) => ["get", HAZARD_EXPOSURE_FIELDS[h]] as maplibregl.ExpressionSpecification);

      if (exposureExpressions.length > 0) {
        // Type assertion required for dynamic max expression construction
        const maxExposure: maplibregl.ExpressionSpecification =
          exposureExpressions.length === 1
            ? exposureExpressions[0]
            : (["max", ...exposureExpressions] as maplibregl.ExpressionSpecification);

        // Opacity based on exposure level
        const opacityExpression: maplibregl.ExpressionSpecification = [
          "interpolate",
          ["linear"],
          maxExposure,
          0, 0.15,
          0.5, 0.4,
          1, 0.6,
        ];

        m.setPaintProperty(DISTRICTS_FILL_LAYER_ID, "fill-opacity", opacityExpression);
      } else {
        // No valid exposure fields for selected hazards, use low opacity
        m.setPaintProperty(DISTRICTS_FILL_LAYER_ID, "fill-opacity", 0.15);
      }
    }
  }, [filters.selectedHazards, mapLoaded]);

  // Update markers when filtered events change - optimized to only add/remove changed markers
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const currentEventIds = new Set(filteredEvents.map(e => e.id));
    const existingEventIds = new Set(markersRef.current.keys());

    // Remove markers that are no longer in filtered events
    for (const eventId of existingEventIds) {
      if (!currentEventIds.has(eventId)) {
        const marker = markersRef.current.get(eventId);
        if (marker) {
          marker.remove();
          markersRef.current.delete(eventId);
        }
      }
    }

    // Add new markers for events that don't have markers yet
    filteredEvents.forEach((event) => {
      if (markersRef.current.has(event.id)) return; // Skip if marker already exists
      
      const hazard = getHazardInfo(event.hazardId);
      const color = hazard?.color || "#6B7280";

      // Create custom marker element
      const el = document.createElement("div");
      el.className = "event-marker";
      el.style.cssText = `
        width: 24px;
        height: 24px;
        background-color: ${color};
        border: 3px solid white;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        transition: transform 0.2s ease;
      `;

      // Accessibility attributes for custom marker
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", event.name);
      el.setAttribute("tabindex", "0");
      el.addEventListener("mouseenter", () => {
        el.style.transform = "scale(1.2)";
      });
      el.addEventListener("mouseleave", () => {
        el.style.transform = "scale(1)";
      });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          onEventSelect(event);
        }
      });

      // Create popup
      const popup = new maplibregl.Popup({ offset: 25 }).setHTML(`
        <div style="padding: 8px; min-width: 200px;">
          <h3 style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: #1f2937;">
            ${hazard?.icon || ""} ${event.name}
          </h3>
          <div style="font-size: 12px; color: #6b7280; space-y: 4px;">
            <p><strong>Date:</strong> ${event.date}</p>
            <p><strong>Severity:</strong> <span style="text-transform: capitalize;">${event.severity}</span></p>
            <p><strong>Affected Population:</strong> ${formatNumber(event.affectedPopulation)}</p>
            <p><strong>Economic Damage:</strong> ${formatCurrency(event.economicDamage)}</p>
          </div>
        </div>
      `);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([event.location.lng, event.location.lat])
        .setPopup(popup)
        .addTo(map.current!);

      el.addEventListener("click", () => {
        onEventSelect(event);
      });

      markersRef.current.set(event.id, marker);
    });

    // Fit bounds to show all markers
    if (filteredEvents.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      filteredEvents.forEach((event) => {
        bounds.extend([event.location.lng, event.location.lat]);
      });
      map.current.fitBounds(bounds, { padding: 50, maxZoom: 10 });
    }
  }, [filteredEvents, mapLoaded, getHazardInfo, onEventSelect]);

  // Create all hazard zone layers once when map loads (with initial hidden opacity)
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const m = map.current;

    // Transform hazardLayers from mockData to map zones with closed polygons
    const hazardZones = hazardLayers.map((layer) => ({
      id: `${layer.hazardId}-zone`,
      hazardId: layer.hazardId,
      coordinates: [...layer.coordinates, layer.coordinates[0]], // Close the polygon
    }));

    // Add all hazard zone layers once with smooth transition support
    hazardZones.forEach((zone) => {
      // Skip if source already exists
      if (m.getSource(zone.id)) return;

      const color = getHazardColor(zone.hazardId);

      m.addSource(zone.id, {
        type: "geojson",
        data: {
          type: "Feature",
          properties: { hazardId: zone.hazardId },
          geometry: {
            type: "Polygon",
            coordinates: [zone.coordinates],
          },
        },
      });

      // Add fill layer with opacity transition
      m.addLayer({
        id: zone.id,
        type: "fill",
        source: zone.id,
        paint: {
          "fill-color": color,
          "fill-opacity": HAZARD_ZONE_OPACITY_HIDDEN, // Start hidden, filter effect will set visibility
          "fill-opacity-transition": { duration: HAZARD_ZONE_TRANSITION_DURATION },
        },
      });

      // Add outline layer with opacity transition
      m.addLayer({
        id: `${zone.id}-outline`,
        type: "line",
        source: zone.id,
        paint: {
          "line-color": color,
          "line-width": 2,
          "line-opacity": HAZARD_ZONE_OUTLINE_OPACITY_HIDDEN, // Start hidden, filter effect will set visibility
          "line-opacity-transition": { duration: HAZARD_ZONE_TRANSITION_DURATION },
        },
      });
    });
  }, [mapLoaded]);

  // Toggle hazard zone visibility with smooth opacity transitions based on filters
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const m = map.current;

    // Get all hazard zone IDs from mockData
    const hazardZoneIds = hazardLayers.map((layer) => `${layer.hazardId}-zone`);

    hazardZoneIds.forEach((zoneId) => {
      // Extract hazardId from zoneId (e.g., "flood-zone" -> "flood")
      const hazardId = zoneId.replace("-zone", "");
      
      // Determine if this layer should be visible
      const shouldShow =
        filters.selectedHazards.length === 0 ||
        filters.selectedHazards.includes(hazardId);

      // Set fill opacity (animated via fill-opacity-transition)
      if (m.getLayer(zoneId)) {
        m.setPaintProperty(
          zoneId,
          "fill-opacity",
          shouldShow ? HAZARD_ZONE_OPACITY_VISIBLE : HAZARD_ZONE_OPACITY_HIDDEN
        );
      }

      // Set outline opacity (animated via line-opacity-transition)
      const outlineId = `${zoneId}-outline`;
      if (m.getLayer(outlineId)) {
        m.setPaintProperty(
          outlineId,
          "line-opacity",
          shouldShow ? HAZARD_ZONE_OUTLINE_OPACITY_VISIBLE : HAZARD_ZONE_OUTLINE_OPACITY_HIDDEN
        );
      }
    });
  }, [filters.selectedHazards, mapLoaded, hazardLayers]);

  // Compute which hazards to show in legend based on filter state
  const visibleHazards = useMemo(() => {
    // When no hazards are selected, show all hazards in the legend
    if (filters.selectedHazards.length === 0) {
      return hazards;
    }
    // Otherwise, show only selected hazards
    return hazards.filter((h) => filters.selectedHazards.includes(h.id));
  }, [hazards, filters.selectedHazards]);

  return (
    <div className="relative flex-1 h-full">
      <div ref={mapContainer} className="w-full h-full" />
      
      {/* Map Legend - styled to match SummaryPanel cards */}
      <div 
        className="absolute bottom-8 right-4 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/80 dark:to-slate-900/80 rounded-xl shadow-lg p-4 min-w-[160px] backdrop-blur-sm"
        role="region"
        aria-label="Map legend showing hazard types"
      >
        <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-3 uppercase tracking-wide">
          Hazard Legend
        </h4>
        <div className="space-y-2">
          {visibleHazards.map((hazard) => (
            <div 
              key={hazard.id} 
              className="flex items-center gap-2.5 transition-opacity duration-300"
            >
              <span
                className="w-3.5 h-3.5 rounded-full ring-2 ring-white dark:ring-slate-700 shadow-sm flex-shrink-0"
                style={{ backgroundColor: hazard.color }}
                aria-hidden="true"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">
                {hazard.icon} {hazard.name}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Event count indicator */}
      <div className="absolute top-4 left-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg px-3 py-2">
        <span className="text-sm text-gray-600 dark:text-gray-400">
          Showing{" "}
          <span className="font-semibold text-gray-900 dark:text-white">
            {filteredEvents.length}
          </span>{" "}
          of {events.length} events
        </span>
      </div>
    </div>
  );
}
