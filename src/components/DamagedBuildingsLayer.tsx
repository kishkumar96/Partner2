"use client";

import { useEffect } from "react";
import { Map as MapLibreMap } from "maplibre-gl";

interface DamagedBuildingsLayerProps {
  map: MapLibreMap | null;
  data: any;
  visible?: boolean;
}

/**
 * Component to render damaged buildings on the map
 * Color-coded by damage severity (Wind_Loss)
 * Uses clustering for performance with 51k+ buildings
 */
export default function DamagedBuildingsLayer({
  map,
  data,
  visible = true,
}: DamagedBuildingsLayerProps) {
  useEffect(() => {
    if (!map || !data) return;

    const sourceId = "damaged-buildings";
    const layerId = "damaged-buildings-layer";
    const clusterLayerId = "damaged-buildings-clusters";
    const clusterCountLayerId = "damaged-buildings-cluster-count";

    // Function to add layers and sources
    const addLayers = () => {
      // Add source with clustering enabled
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: "geojson",
          data: data,
          cluster: true,
          clusterMaxZoom: 14, // Max zoom to cluster points
          clusterRadius: 50, // Radius of each cluster
        });
      }

      // Add cluster circle layer
      if (!map.getLayer(clusterLayerId)) {
        map.addLayer({
          id: clusterLayerId,
          type: "circle",
          source: sourceId,
          filter: ["has", "point_count"],
          paint: {
            // Size based on point count
            "circle-radius": [
              "step",
              ["get", "point_count"],
              15, // radius for clusters with < 100 points
              100, 20, // radius for clusters with >= 100 points
              750, 25, // radius for clusters with >= 750 points
            ],
            // Color clusters by severity (red for high damage areas)
            "circle-color": [
              "step",
              ["get", "point_count"],
              "#fbbf24", // yellow for smaller clusters
              100, "#f97316", // orange for medium clusters
              750, "#ef4444", // red for large clusters
            ],
            "circle-opacity": 0.8,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-opacity": 0.6,
          },
        });
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
          filter: ["!", ["has", "point_count"]],
          paint: {
            // Size based on damage
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["get", "Wind_Loss"],
              0, 3,
              50000, 5,
              100000, 7,
              500000, 10,
            ],
            // Color by damage severity
            "circle-color": [
              "interpolate",
              ["linear"],
              ["get", "Wind_Loss"],
              0, "#10b981", // green - minimal damage
              25000, "#fbbf24", // yellow - moderate
              50000, "#f97316", // orange - significant
              100000, "#ef4444", // red - severe
              500000, "#991b1b", // dark red - catastrophic
            ],
            "circle-opacity": 0.7,
            "circle-stroke-width": 1,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-opacity": 0.5,
          },
        });
      }

      // Define event handlers
      const handleClick = (e: any) => {
        if (!e.features || e.features.length === 0) return;
        
        const feature = e.features[0];
        const props = feature.properties;
        
        const html = `
          <div style="font-family: system-ui; padding: 4px;">
            <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">Damaged Building</h3>
            <div style="font-size: 12px; line-height: 1.6;">
              <p style="margin: 4px 0;"><strong>Type:</strong> ${props?.UseType || 'N/A'}</p>
              <p style="margin: 4px 0;"><strong>Asset:</strong> ${props?.Asset || 'N/A'}</p>
              <p style="margin: 4px 0;"><strong>Structure:</strong> ${props?.Structure || 'N/A'}</p>
              <p style="margin: 4px 0;"><strong>Condition:</strong> ${props?.Condition || 'N/A'}</p>
              <p style="margin: 4px 0;"><strong>Wind Speed:</strong> ${props?.WindGust_kmph || 0} km/h</p>
              <p style="margin: 4px 0; color: #ef4444; font-weight: 600;"><strong>Wind Loss:</strong> $${Number(props?.Wind_Loss || 0).toLocaleString()}</p>
              <p style="margin: 4px 0; font-size: 10px; color: #666;"><strong>Region:</strong> ${props?.Admin1_Region || 'N/A'}</p>
            </div>
          </div>
        `;
        
        new (window as any).maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(html)
          .addTo(map);
      };

      const handleMouseEnter = () => {
        map.getCanvas().style.cursor = "pointer";
      };

      const handleMouseLeave = () => {
        map.getCanvas().style.cursor = "";
      };

      // Handle cluster clicks to zoom in
      const handleClusterClick = (e: any) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: [clusterLayerId],
        });
        
        if (!features.length) return;
        
        const clusterId = features[0].properties.cluster_id;
        const source = map.getSource(sourceId) as any;
        
        source.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
          if (err) return;
          
          map.easeTo({
            center: (features[0].geometry as any).coordinates,
            zoom: zoom + 0.5,
          });
        });
      };

      // Add event listeners
      map.on("click", layerId, handleClick);
      map.on("mouseenter", layerId, handleMouseEnter);
      map.on("mouseleave", layerId, handleMouseLeave);
      map.on("click", clusterLayerId, handleClusterClick);
      map.on("mouseenter", clusterLayerId, handleMouseEnter);
      map.on("mouseleave", clusterLayerId, handleMouseLeave);

      // Toggle visibility
      const visibility = visible ? "visible" : "none";
      [layerId, clusterLayerId, clusterCountLayerId].forEach((id) => {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, "visibility", visibility);
        }
      });
    };

    // Check if style is loaded before adding layers
    if (map.isStyleLoaded()) {
      addLayers();
    } else {
      map.once('load', addLayers);
    }

    return () => {
      // Cleanup on unmount - remove layers and sources
      try {
        if (map.getLayer(layerId)) {
          map.removeLayer(layerId);
        }
        if (map.getLayer(clusterLayerId)) {
          map.removeLayer(clusterLayerId);
        }
        if (map.getLayer(clusterCountLayerId)) {
          map.removeLayer(clusterCountLayerId);
        }
        if (map.getSource(sourceId)) {
          map.removeSource(sourceId);
        }
      } catch (e) {
        // Layers/sources might not exist
      }
    };
  }, [map, data, visible]);

  return null;
}
