"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Event, Hazard, FilterState } from "@/types";
import { formatCurrency, formatNumber, getHazardColor } from "@/utils/formatters";
import { hazardLayers } from "@/data/mockData";

// Free OpenStreetMap-based tile style (no API key required)
const MAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

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
  const [mapLoaded, setMapLoaded] = useState(false);

  // Filter events based on current filters
  const filteredEvents = useMemo(() => events.filter((event) => {
    if (
      filters.selectedHazards.length > 0 &&
      !filters.selectedHazards.includes(event.hazardId)
    ) {
      return false;
    }
    if (
      filters.selectedEvents.length > 0 &&
      !filters.selectedEvents.includes(event.id)
    ) {
      return false;
    }
    if (filters.dateRange.start && event.date < filters.dateRange.start) {
      return false;
    }
    if (filters.dateRange.end && event.date > filters.dateRange.end) {
      return false;
    }
    return true;
  }), [events, filters]);

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

  // Add hazard zone layers when filters change
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Transform hazardLayers from mockData to map zones with closed polygons
    const hazardZones = hazardLayers.map((layer) => ({
      id: `${layer.hazardId}-zone`,
      hazardId: layer.hazardId,
      coordinates: [...layer.coordinates, layer.coordinates[0]], // Close the polygon
    }));

    // Remove existing hazard layers
    hazardZones.forEach((zone) => {
      const layer = map.current!.getLayer(zone.id);
      if (layer !== undefined) {
        map.current!.removeLayer(zone.id);
      }
      const outlineLayer = map.current!.getLayer(`${zone.id}-outline`);
      if (outlineLayer !== undefined) {
        map.current!.removeLayer(`${zone.id}-outline`);
      }
      const source = map.current!.getSource(zone.id);
      if (source !== undefined) {
        map.current!.removeSource(zone.id);
      }
    });

    // Add filtered hazard zones
    hazardZones.forEach((zone) => {
      const shouldShow =
        filters.selectedHazards.length === 0 ||
        filters.selectedHazards.includes(zone.hazardId);

      if (shouldShow) {
        const color = getHazardColor(zone.hazardId);

        map.current!.addSource(zone.id, {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Polygon",
              coordinates: [zone.coordinates],
            },
          },
        });

        map.current!.addLayer({
          id: zone.id,
          type: "fill",
          source: zone.id,
          paint: {
            "fill-color": color,
            "fill-opacity": 0.2,
          },
        });

        map.current!.addLayer({
          id: `${zone.id}-outline`,
          type: "line",
          source: zone.id,
          paint: {
            "line-color": color,
            "line-width": 2,
          },
        });
      }
    });
  }, [filters.selectedHazards, mapLoaded]);

  return (
    <div className="relative flex-1 h-full">
      <div ref={mapContainer} className="w-full h-full" />
      
      {/* Map Legend */}
      <div className="absolute bottom-8 right-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3 max-w-[180px]">
        <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Legend
        </h4>
        <div className="space-y-1">
          {hazards.map((hazard) => (
            <div key={hazard.id} className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: hazard.color }}
              />
              <span className="text-xs text-gray-600 dark:text-gray-400">
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
