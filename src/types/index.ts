export interface Hazard {
  id: string;
  name: string;
  color: string;
  icon: string;
}

export interface Sector {
  id: string;
  name: string;
  icon: string;
}

export interface District {
  id: string;
  name: string;
  provinceId: string;
}

export interface Province {
  id: string;
  name: string;
}

export interface Event {
  id: string;
  name: string;
  date: string;
  hazardId: string;
  sectorId: string;
  districtId: string;
  provinceId: string;
  location: {
    lat: number;
    lng: number;
  };
  severity: "low" | "medium" | "high" | "critical";
  affectedPopulation: number;
  economicDamage: number;
}

export interface HazardLayer {
  id: string;
  hazardId: string;
  name: string;
  coordinates: [number, number][];
  intensity: number;
}

export interface ExposureData {
  id: string;
  hazardId: string;
  sectorId: string;
  population: number;
  assets: number;
  infrastructure: number;
}

export interface EconomicDamageData {
  id: string;
  hazardId: string;
  sectorId: string;
  directLoss: number;
  indirectLoss: number;
  totalLoss: number;
  year: number;
}

export interface SummaryStats {
  totalEvents: number;
  totalAffectedPopulation: number;
  totalEconomicDamage: number;
  highRiskAreas: number;
}

export type AggregationLevel = 'district' | 'province' | 'national';

export interface FilterState {
  selectedHazards: string[];
  selectedSectors: string[];
  selectedEvents: string[];
  dateRange: {
    start: string;
    end: string;
  };
  aggregationLevel: AggregationLevel;
}
