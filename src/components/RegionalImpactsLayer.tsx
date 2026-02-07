/**
 * Component to load and display regional impacts GeoJSON layer
 */

import { useEffect } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";

interface RegionalImpactsLayerProps {
  map: MapLibreMap | null;
  visible: boolean;
  mapStyle?: "loss" | "wind";
  selectedRegion?: string | null;
  onRegionSelect?: (regionId: string | null) => void;
}

export default function RegionalImpactsLayer({ map, visible, mapStyle = "loss", selectedRegion = null, onRegionSelect }: RegionalImpactsLayerProps) {
  useEffect(() => {
    if (!map || !visible) return;

    const loadRegionalImpacts = async () => {
      try {
        console.log('📊 Loading regional impacts layer...');

        // Load both regional impacts and sector-specific data
        const [response, sectorResponse] = await Promise.all([
          fetch('/regional-impacts.geojson'),
          fetch('/regional-impacts-by-sector.geojson')
        ]);
        
        if (!response.ok) {
          console.warn('Could not load regional impacts data');
          return;
        }

        const geojson = await response.json();
        const sectorGeojson = sectorResponse.ok ? await sectorResponse.json() : null;
        const sourceId = 'regional-impacts';
        const fillLayerId = 'regional-impacts-fill';
        const lineLayerId = 'regional-impacts-line';

        // Remove existing layers and source if present
        try {
          if (map.getLayer(fillLayerId)) {
            map.removeLayer(fillLayerId);
          }
          if (map.getLayer(lineLayerId)) {
            map.removeLayer(lineLayerId);
          }
          if (map.getSource(sourceId)) {
            map.removeSource(sourceId);
          }
        } catch (e) {
          console.warn('Error removing existing regional impacts layers:', e);
        }

        // Create sector data lookup by region
        const sectorDataByRegion = new Map();
        if (sectorGeojson?.features) {
          sectorGeojson.features.forEach((feature: any) => {
            const region = feature.properties?.Region || feature.properties?.ID;
            if (region) {
              sectorDataByRegion.set(region, feature.properties);
            }
          });
        }

        // Function to add layers
        const addLayers = () => {
          // Add source
          map.addSource(sourceId, {
            type: "geojson",
            data: geojson,
          });

        // Define color schemes for both styles
        const lossColorExpression = [
          "interpolate",
          ["linear"],
          ["get", "Total_Loss"],
          0, "#ffffcc",
          1000000, "#ffeda0",
          5000000, "#fed976",
          10000000, "#feb24c",
          20000000, "#fd8d3c",
          50000000, "#fc4e2a",
          100000000, "#e31a1c",
          200000000, "#bd0026",
        ] as any;

        const windColorExpression = [
          "interpolate",
          ["linear"],
          ["get", "Max_Wind_Gusts"],
          0, "#f0f9ff",    // Very light blue (calm)
          25, "#e0f2fe",   // Light cyan
          63, "#7dd3fc",   // Sky blue (Tropical Depression)
          88, "#38bdf8",   // Bright blue (Tropical Storm)
          118, "#0ea5e9",  // Deep blue (Category 1)
          165, "#0284c7",  // Darker blue (Category 2-3)
          252, "#0369a1",  // Navy blue (Category 4)
          311, "#075985",  // Very dark blue (Category 5)
        ] as any;

        // Insert before interactive layers (damaged buildings/roads) to keep proper order
        let beforeId: string | undefined = undefined;
        if (map.getLayer('damaged-buildings-layer')) {
          beforeId = 'damaged-buildings-layer';
        } else if (map.getLayer('damaged-buildings-clusters')) {
          beforeId = 'damaged-buildings-clusters';  
        } else if (map.getLayer('damaged-roads-layer')) {
          beforeId = 'damaged-roads-layer';
        } else if (map.getLayer('cyclone-forecast-track-line')) {
          beforeId = 'cyclone-forecast-track-line';
        }

        // Add fill layer for regions with dynamic color based on mapStyle
        map.addLayer({
          id: fillLayerId,
          type: "fill",
          source: sourceId,
          paint: {
            "fill-color": mapStyle === "wind" ? windColorExpression : lossColorExpression,
            "fill-opacity": [
              "case",
              ["==", ["get", "Region.Region"], selectedRegion || ""], 0.85, // Selected region more opaque
              0.6 // Default opacity
            ],
          },
        }, beforeId);

        // Enable smooth transitions for animated region updates
        map.setPaintProperty(fillLayerId, "fill-color-transition", {
          duration: 800,
          delay: 0,
        });
        map.setPaintProperty(fillLayerId, "fill-opacity-transition", {
          duration: 500,
          delay: 0,
        });

        // Add outline layer with selection highlighting
        map.addLayer({
          id: lineLayerId,
          type: "line",
          source: sourceId,
          paint: {
            "line-color": [
              "case",
              ["==", ["get", "Region.Region"], selectedRegion || ""], "#fbbf24", // Gold outline for selected
              "#333" // Default black outline
            ],
            "line-width": [
              "case",
              ["==", ["get", "Region.Region"], selectedRegion || ""], 3, // Thicker line for selected
              1 // Default width
            ],
            "line-opacity": 0.8,
          },
        });

        // Add click handler for popup with sector breakdown + region selection
        map.on('click', fillLayerId, (e) => {
          if (!e.features || e.features.length === 0) return;

          const feature = e.features[0];
          const props = feature.properties;
          const regionName = props['Region.Region'] || 'Unknown Region';
          const regionId = props['Region.ID'] || regionName;
          
          // Update selected region (for filtering charts/analytics)
          if (onRegionSelect) {
            const isAlreadySelected = selectedRegion === regionName;
            onRegionSelect(isAlreadySelected ? null : regionName);
          }
          
          // Get sector-specific data for this region
          const sectorData = sectorDataByRegion.get(regionName);

          let sectorBreakdown = '';
          if (sectorData) {
            const sectors = [
              { name: 'Education', key: 'Sector.Education.Loss' },
              { name: 'Infrastructure', key: 'Sector.Infrastructure.Loss' },
              { name: 'Productive', key: 'Sector.Productive.Loss' },
              { name: 'Public', key: 'Sector.Public.Loss' },
              { name: 'Residential', key: 'Sector.Residential.Loss' },
              { name: 'Other', key: 'Sector.Other.Loss' }
            ];

            const sectorLines = sectors
              .map(sector => {
                const loss = Number(sectorData[sector.key]) || 0;
                if (loss > 0) {
                  return `<p style="margin: 2px 0 2px 16px;">• ${sector.name}: $${loss.toLocaleString()}</p>`;
                }
                return '';
              })
              .filter(Boolean)
              .join('');

            if (sectorLines) {
              sectorBreakdown = `
                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb;">
                  <p style="margin: 4px 0; font-weight: bold;">Sector Breakdown:</p>
                  ${sectorLines}
                </div>
              `;
            }
          }

          // Determine wind category
          const windSpeed = Number(props.Max_Wind_Gusts) || 0;
          let windCategory = '';
          let windColor = '#f0f9ff';
          if (windSpeed >= 252) {
            windCategory = 'Category 5 Hurricane';
            windColor = '#075985';
          } else if (windSpeed >= 165) {
            windCategory = 'Category 4 Hurricane';
            windColor = '#0369a1';
          } else if (windSpeed >= 118) {
            windCategory = 'Category 2-3 Hurricane';
            windColor = '#0284c7';
          } else if (windSpeed >= 88) {
            windCategory = 'Category 1 Hurricane';
            windColor = '#0ea5e9';
          } else if (windSpeed >= 63) {
            windCategory = 'Tropical Storm';
            windColor = '#38bdf8';
          } else if (windSpeed >= 25) {
            windCategory = 'Tropical Depression';
            windColor = '#7dd3fc';
          }

          const popupContent = `
            <div style="padding: 8px; font-family: system-ui, sans-serif;">
              <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold;">
                ${regionName}
              </h3>
              ${windCategory ? `
                <div style="background: ${windColor}; color: ${windSpeed >= 88 ? 'white' : '#0f172a'}; padding: 6px 8px; border-radius: 4px; margin-bottom: 8px; font-size: 11px; font-weight: bold;">
                  🌪️ ${windCategory}
                </div>
              ` : ''}
              <div style="font-size: 12px;">
                <p style="margin: 4px 0;"><strong>Max Wind Gusts:</strong> ${windSpeed} km/h</p>
                <p style="margin: 4px 0;"><strong>Avg Wind Gusts:</strong> ${Number(props.Average_Wind_Gusts || 0)} km/h</p>
                <p style="margin: 4px 0;"><strong>Total Loss:</strong> $${Number(props.Total_Loss || 0).toLocaleString()}</p>
                <p style="margin: 4px 0;"><strong>Buildings Damaged:</strong> ${Number(props.Damaged_Buildings || 0).toLocaleString()}</p>
                <p style="margin: 4px 0;"><strong>Population Affected:</strong> ${Number(props.Population_Exposed_To_Any_Hazard || 0).toLocaleString()}</p>
                ${sectorBreakdown}
              </div>
            </div>
          `;

          new maplibregl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(popupContent)
            .addTo(map);
        });

        // Change cursor on hover
        map.on('mouseenter', fillLayerId, () => {
          map.getCanvas().style.cursor = 'pointer';
        });

          map.on('mouseleave', fillLayerId, () => {
            map.getCanvas().style.cursor = '';
          });

          console.log('✅ Loaded regional impacts layer successfully');
        };

        // Check if style is loaded before adding layers
        if (map.isStyleLoaded()) {
          addLayers();
        } else {
          map.once('load', addLayers);
        }
      } catch (error) {
        console.error('Error loading regional impacts:', error);
      }
    };

    // Wait for map to be fully loaded before adding layers
    if (!map.isStyleLoaded()) {
      const onStyleLoad = () => {
        map.off('styledata', onStyleLoad);
        loadRegionalImpacts();
      };
      map.on('styledata', onStyleLoad);
      return;
    }

    loadRegionalImpacts();

    // Cleanup
    return () => {
      if (!map) return;

      const sourceId = 'regional-impacts';
      const fillLayerId = 'regional-impacts-fill';
      const lineLayerId = 'regional-impacts-line';

      try {
        if (map.getLayer(fillLayerId)) {
          map.removeLayer(fillLayerId);
        }
        if (map.getLayer(lineLayerId)) {
          map.removeLayer(lineLayerId);
        }
        if (map.getSource(sourceId)) {
          map.removeSource(sourceId);
        }
      } catch (e) {
        console.warn('Error cleaning up regional impacts layers:', e);
      }
    };
  }, [map, visible]);

  // Separate effect to update colors when style changes (without recreating layers)
  useEffect(() => {
    if (!map || !visible) return;

    const fillLayerId = 'regional-impacts-fill';
    const lineLayerId = 'regional-impacts-line';
    
    try {
      if (map.getLayer(fillLayerId)) {
        const lossColorExpression = [
          "interpolate",
          ["linear"],
          ["get", "Total_Loss"],
          0, "#ffffcc",
          1000000, "#ffeda0",
          5000000, "#fed976",
          10000000, "#feb24c",
          20000000, "#fd8d3c",
          50000000, "#fc4e2a",
          100000000, "#e31a1c",
          200000000, "#bd0026",
        ] as any;

        const windColorExpression = [
          "interpolate",
          ["linear"],
          ["get", "Max_Wind_Gusts"],
          0, "#f0f9ff",
          25, "#e0f2fe",
          63, "#7dd3fc",
          88, "#38bdf8",
          118, "#0ea5e9",
          165, "#0284c7",
          252, "#0369a1",
          311, "#075985",
        ] as any;

        // Smoothly transition to new color scheme
        map.setPaintProperty(
          fillLayerId,
          "fill-color",
          mapStyle === "wind" ? windColorExpression : lossColorExpression
        );
        
        // Update fill opacity based on selection
        map.setPaintProperty(fillLayerId, "fill-opacity", [
          "case",
          ["==", ["get", "Region.Region"], selectedRegion || ""],
          0.85,
          0.6
        ]);
        
        // Update line highlighting based on selection
        if (map.getLayer(lineLayerId)) {
          map.setPaintProperty(lineLayerId, "line-color", [
            "case",
            ["==", ["get", "Region.Region"], selectedRegion || ""],
            "#fbbf24",
            "#333"
          ]);
          map.setPaintProperty(lineLayerId, "line-width", [
            "case",
            ["==", ["get", "Region.Region"], selectedRegion || ""],
            3,
            1
          ]);
        }
        
        console.log(`🎨 Switched to ${mapStyle} color scheme`);
      }
    } catch (e) {
      console.warn('Error updating map style:', e);
    }
  }, [map, visible, mapStyle, selectedRegion]);

  return null;
}
