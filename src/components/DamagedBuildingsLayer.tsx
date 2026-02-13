"use client";

import { useEffect } from "react";
import maplibregl, { Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import { BUILDING_DAMAGE_COLORS } from '@/theme/colors';
import type { BuildingProperties } from '@/types/realData';

interface DamagedBuildingsLayerProps {
  map: MapLibreMap | null;
  data: GeoJSON.FeatureCollection<GeoJSON.Geometry, BuildingProperties> | null;
  visible?: boolean;
  styleChangeCounter?: number;
}

/**
 * Component to render damaged buildings on the map
 * Color-coded by damage severity (Wind_Loss)
 * Uses clustering for performance with 51k+ buildings
 * 
 * Performance optimization: Uses separate effects to avoid recreating layers/sources
 * when data changes - only updates the source data using setData()
 */
export default function DamagedBuildingsLayer({
  map,
  data,
  visible = true,
  styleChangeCounter = 0,
}: DamagedBuildingsLayerProps) {
  const sourceId = "damaged-buildings";
  const layerId = "damaged-buildings-layer";
  const clusterLayerId = "damaged-buildings-clusters";
  const clusterCountLayerId = "damaged-buildings-cluster-count";

  // Effect 1: Initial setup - add sources, layers, and event handlers
  // Only runs on mount/unmount or when style changes
  useEffect(() => {
    if (!map) return;

    // Define event handlers
    const handleClick = (e: MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      if (!e.features || e.features.length === 0) return;

      const feature = e.features[0];
      const props = feature.properties as BuildingProperties;

      const container = document.createElement("div");
      container.className = "p-2";

      const title = document.createElement("h3");
      title.className = "font-bold text-sm mb-1";
      title.textContent = "Damaged Building";
      container.appendChild(title);

      const damageP = document.createElement("p");
      damageP.className = "text-xs";
      const damageStrong = document.createElement("strong");
      damageStrong.textContent = "Damage:";
      damageP.appendChild(damageStrong);
      damageP.appendChild(
        document.createTextNode(
          ` $${Number(props.Wind_Loss || 0).toLocaleString()}`
        )
      );
      container.appendChild(damageP);

      const exposureP = document.createElement("p");
      exposureP.className = "text-xs";
      const exposureStrong = document.createElement("strong");
      exposureStrong.textContent = "Exposure:";
      exposureP.appendChild(exposureStrong);
      exposureP.appendChild(
        document.createTextNode(
          ` $${Number(props.Exposure || 0).toLocaleString()}`
        )
      );
      container.appendChild(exposureP);

      const damageRatioP = document.createElement("p");
      damageRatioP.className = "text-xs";
      const damageRatioStrong = document.createElement("strong");
      damageRatioStrong.textContent = "Damage Ratio:";
      damageRatioP.appendChild(damageRatioStrong);
      damageRatioP.appendChild(
        document.createTextNode(
          ` ${((Number(props.Damage_Ratio) || 0) * 100).toFixed(1)}%`
        )
      );
      container.appendChild(damageRatioP);

      const buildingTypeP = document.createElement("p");
      buildingTypeP.className = "text-xs";
      const buildingTypeStrong = document.createElement("strong");
      buildingTypeStrong.textContent = "Building Type:";
      buildingTypeP.appendChild(buildingTypeStrong);
      const buildingTypeText =
        props.Building_Type || props.BTypeCat || "Unknown";
      buildingTypeP.appendChild(
        document.createTextNode(` ${buildingTypeText}`)
      );
      container.appendChild(buildingTypeP);

      const occupancyP = document.createElement("p");
      occupancyP.className = "text-xs";
      const occupancyStrong = document.createElement("strong");
      occupancyStrong.textContent = "Occupancy:";
      occupancyP.appendChild(occupancyStrong);
      const occupancyText = props.Occupancy || "Unknown";
      occupancyP.appendChild(
        document.createTextNode(` ${occupancyText}`)
      );
      container.appendChild(occupancyP);

      new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setDOMContent(container)
        .addTo(map);
    };

    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    const handleClusterClick = async (e: MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [clusterLayerId],
      });

      if (!features.length) return;

      const clusterId = features[0].properties?.cluster_id;
      const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;

      try {
        const zoom = await source.getClusterExpansionZoom(clusterId);
        const geometry = features[0].geometry as GeoJSON.Point;
        map.easeTo({
          center: geometry.coordinates as [number, number],
          zoom: zoom + 0.5,
        });
      } catch (err) {
        // Ignore errors (cluster may have changed)
        if (process.env.NODE_ENV !== 'production') {
          console.warn('Failed to expand cluster:', err);
        }
      }
    };

    // Function to add layers and sources
    const addLayers = () => {
      // Find the first symbol layer to insert before (ensures clusters are on top)
      const layers = map.getStyle()?.layers || [];
      const firstSymbolId = layers.find((layer) => layer.type === 'symbol')?.id;
      
      // Add source with clustering enabled (with empty data initially)
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
          cluster: true,
          clusterMaxZoom: 14, // Max zoom to cluster points
          clusterRadius: 50, // Radius of each cluster
        });
      }

      // Add cluster circle layer - MUST render above regional polygons
      if (!map.getLayer(clusterLayerId)) {
        
        map.addLayer({
          id: clusterLayerId,
          type: "circle",
          source: sourceId,
          filter: ["has", "point_count"],
          paint: {
            // Size based on point count - LARGE for visibility
            "circle-radius": [
              "step",
              ["get", "point_count"],
              22, // radius for clusters with < 100 points (increased from 18)
              100, 28, // radius for clusters with >= 100 points (increased from 24)
              750, 35, // radius for clusters with >= 750 points (increased from 30)
            ],
            // Color clusters by severity
            "circle-color": [
              "step",
              ["get", "point_count"],
              BUILDING_DAMAGE_COLORS.moderate, // yellow for smaller clusters
              100, BUILDING_DAMAGE_COLORS.substantial, // orange for medium clusters
              750, BUILDING_DAMAGE_COLORS.severe, // red for large clusters
            ],
            "circle-opacity": 1.0, // Fully opaque for maximum visibility
            "circle-stroke-width": 4, // Very thick stroke (increased from 3)
            "circle-stroke-color": "#ffffff",
            "circle-stroke-opacity": 1.0, // Fully opaque stroke
          },
        }, firstSymbolId); // Insert before symbol layers for proper z-order
      }

      // Add cluster count label layer
      if (!map.getLayer(clusterCountLayerId)) {
        map.addLayer({
          id: clusterCountLayerId,
          type: "symbol",
          source: sourceId,
          filter: ["has", "point_count"],
          layout: {
            "text-field": "{point_count_abbreviated}",
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
            "text-size": 12,
          },
          paint: {
            "text-color": "#ffffff",
          },
        });
      }

      // Add circle layer for individual buildings (unclustered points)
      if (!map.getLayer(layerId)) {
        map.addLayer({
          id: layerId,
          type: "circle",
          source: sourceId,
          filter: ["!", ["has", "point_count"]], // Only show unclustered points
          paint: {
            // Size based on damage - larger for visibility
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["get", "Wind_Loss"],
              0, 6,
              10000, 7,
              50000, 9,
              100000, 12,
            ],
            // Color by damage severity - using theme colors
            "circle-color": [
              "step",
              ["get", "Wind_Loss"],
              BUILDING_DAMAGE_COLORS.minimal,    // < $10K
              10000, BUILDING_DAMAGE_COLORS.moderate,     // $10K-$50K
              50000, BUILDING_DAMAGE_COLORS.substantial,  // $50K-$100K
              100000, BUILDING_DAMAGE_COLORS.severe,      // $100K-$500K
              500000, BUILDING_DAMAGE_COLORS.catastrophic // > $500K
            ],
            "circle-opacity": 0.95,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-opacity": 0.8,
          },
        }, firstSymbolId); // Insert before symbol layers
      }

      // Add event listeners
      map.on("click", layerId, handleClick);
      map.on("mouseenter", layerId, handleMouseEnter);
      map.on("mouseleave", layerId, handleMouseLeave);
      map.on("click", clusterLayerId, handleClusterClick);
      map.on("mouseenter", clusterLayerId, handleMouseEnter);
      map.on("mouseleave", clusterLayerId, handleMouseLeave);
    };

    // Check if style is loaded before adding layers
    if (map.isStyleLoaded()) {
      addLayers();
    } else {
      map.once('load', addLayers);
    }

    // Cleanup on unmount or style change
    return () => {
      // Check if map still exists before cleanup
      if (!map || !map.getStyle()) return;
      
      try {
        // Remove event listeners
        map.off("click", layerId, handleClick);
        map.off("mouseenter", layerId, handleMouseEnter);
        map.off("mouseleave", layerId, handleMouseLeave);
        map.off("click", clusterLayerId, handleClusterClick);
        map.off("mouseenter", clusterLayerId, handleMouseEnter);
        map.off("mouseleave", clusterLayerId, handleMouseLeave);

        // Remove layers
        if (map.getLayer(layerId)) {
          map.removeLayer(layerId);
        }
        if (map.getLayer(clusterLayerId)) {
          map.removeLayer(clusterLayerId);
        }
        if (map.getLayer(clusterCountLayerId)) {
          map.removeLayer(clusterCountLayerId);
        }
        // Remove source
        if (map.getSource(sourceId)) {
          map.removeSource(sourceId);
        }
      } catch (e) {
        // Silently ignore cleanup errors when map is destroyed
      }
    };
  }, [map, styleChangeCounter]); // Only depend on map and styleChangeCounter

  // Effect 2: Update data in existing source when data changes
  // This avoids recreating layers/sources and eliminates flicker
  useEffect(() => {
    if (!map || !data) return;

    const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
    if (source && source.setData) {
      // Update the existing source with new data - much faster than recreating
      source.setData(data as GeoJSON.FeatureCollection);
    }
  }, [map, data]); // Only depend on map and data

  // Effect 3: Handle visibility changes
  useEffect(() => {
    if (!map) return;

    const visibility = visible ? "visible" : "none";
    [layerId, clusterLayerId, clusterCountLayerId].forEach((id) => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", visibility);
      }
    });
  }, [map, visible]); // Only depend on map and visible

  return null;
}
