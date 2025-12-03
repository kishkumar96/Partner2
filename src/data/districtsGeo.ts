import { DistrictsGeoJSON } from "@/types";

/**
 * Mock GeoJSON data for district polygons.
 * Each district includes hazard exposure values, population, infrastructure,
 * and economic damage data for the Climate Risk Dashboard map visualization.
 */
export const districtsGeoJSON: DistrictsGeoJSON = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        id: "dist-001",
        name: "North District A",
        provinceId: "prov-001",
        population: 125000,
        buildingCount: 12500,
        infrastructureCount: 850,
        economicDamageUSD: 450000000,
        windExposure: 0.8,
        cycloneTrackExposure: 0.4,
        inundationExposure: 0.2,
        primaryHazard: "wind",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [55.05, 25.15],
            [55.25, 25.15],
            [55.30, 25.25],
            [55.25, 25.40],
            [55.10, 25.38],
            [55.05, 25.25],
            [55.05, 25.15],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        id: "dist-002",
        name: "North District B",
        provinceId: "prov-001",
        population: 250000,
        buildingCount: 28000,
        infrastructureCount: 3200,
        economicDamageUSD: 780000000,
        windExposure: 0.3,
        cycloneTrackExposure: 0.85,
        inundationExposure: 0.2,
        primaryHazard: "cyclone_track",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [55.30, 25.20],
            [55.55, 25.18],
            [55.65, 25.35],
            [55.55, 25.55],
            [55.35, 25.52],
            [55.30, 25.35],
            [55.30, 25.20],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        id: "dist-003",
        name: "Central District A",
        provinceId: "prov-002",
        population: 85000,
        buildingCount: 9500,
        infrastructureCount: 450,
        economicDamageUSD: 280000000,
        windExposure: 0.15,
        cycloneTrackExposure: 0.75,
        inundationExposure: 0.3,
        primaryHazard: "cyclone_track",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [54.15, 24.35],
            [54.45, 24.32],
            [54.50, 24.50],
            [54.42, 24.65],
            [54.20, 24.62],
            [54.15, 24.50],
            [54.15, 24.35],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        id: "dist-004",
        name: "Central District B",
        provinceId: "prov-002",
        population: 45000,
        buildingCount: 5200,
        infrastructureCount: 380,
        economicDamageUSD: 120000000,
        windExposure: 0.65,
        cycloneTrackExposure: 0.2,
        inundationExposure: 0.4,
        primaryHazard: "wind",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [54.90, 24.90],
            [55.20, 24.88],
            [55.25, 25.05],
            [55.15, 25.18],
            [54.95, 25.15],
            [54.90, 25.00],
            [54.90, 24.90],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        id: "dist-005",
        name: "South District A",
        provinceId: "prov-003",
        population: 12000,
        buildingCount: 1800,
        infrastructureCount: 220,
        economicDamageUSD: 35000000,
        windExposure: 0.2,
        cycloneTrackExposure: 0.1,
        inundationExposure: 0.7,
        primaryHazard: "inundation",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [55.55, 24.10],
            [55.85, 24.08],
            [55.90, 24.28],
            [55.80, 24.40],
            [55.58, 24.38],
            [55.55, 24.22],
            [55.55, 24.10],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        id: "dist-006",
        name: "South District B",
        provinceId: "prov-003",
        population: 8500,
        buildingCount: 1200,
        infrastructureCount: 650,
        economicDamageUSD: 95000000,
        windExposure: 0.1,
        cycloneTrackExposure: 0.15,
        inundationExposure: 0.8,
        primaryHazard: "inundation",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [55.20, 24.12],
            [55.40, 24.10],
            [55.50, 24.22],
            [55.42, 24.32],
            [55.25, 24.30],
            [55.20, 24.22],
            [55.20, 24.12],
          ],
        ],
      },
    },
  ],
};
