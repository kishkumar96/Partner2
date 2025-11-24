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

export interface Event {
  id: string;
  name: string;
  date: string;
  hazardId: string;
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

export interface FilterState {
  selectedHazards: string[];
  selectedSectors: string[];
  selectedEvents: string[];
  dateRange: {
    start: string;
    end: string;
  };
}
