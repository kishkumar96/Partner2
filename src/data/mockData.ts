/**
 * Mock data for monthly damage trends
 * Used for visualization in the SummaryPanel component
 */

export interface MonthlyDamageEntry {
  month: string;
  [hazardId: string]: string | number;
}

/**
 * Monthly damage data showing economic damage trends by hazard type
 * Values are in USD (millions)
 * Based on Vanuatu-specific hazards: tropical cyclones, floods, volcanic activity, earthquakes, tsunami, landslides, drought
 */
export const monthlyDamageData: MonthlyDamageEntry[] = [
  { month: "Jan", "tropical-cyclone": 45.2, flood: 12.5, volcanic: 8.3, earthquake: 15.2, tsunami: 5.1, landslide: 3.2, drought: 4.5 },
  { month: "Feb", "tropical-cyclone": 52.8, flood: 10.8, volcanic: 9.5, earthquake: 12.8, tsunami: 6.3, landslide: 2.8, drought: 5.2 },
  { month: "Mar", "tropical-cyclone": 68.5, flood: 18.3, volcanic: 11.2, earthquake: 20.5, tsunami: 7.8, landslide: 4.5, drought: 6.8 },
  { month: "Apr", "tropical-cyclone": 35.3, flood: 22.5, volcanic: 13.8, earthquake: 18.3, tsunami: 9.2, landslide: 5.2, drought: 8.5 },
  { month: "May", "tropical-cyclone": 28.8, flood: 28.7, volcanic: 15.5, earthquake: 25.8, tsunami: 12.5, landslide: 6.8, drought: 10.2 },
  { month: "Jun", "tropical-cyclone": 22.5, flood: 35.2, volcanic: 18.3, earthquake: 32.5, tsunami: 15.8, landslide: 8.3, drought: 12.5 },
  { month: "Jul", "tropical-cyclone": 18.2, flood: 42.8, volcanic: 22.5, earthquake: 38.2, tsunami: 18.5, landslide: 10.2, drought: 15.8 },
  { month: "Aug", "tropical-cyclone": 15.5, flood: 38.5, volcanic: 20.8, earthquake: 35.5, tsunami: 16.8, landslide: 9.5, drought: 14.2 },
  { month: "Sep", "tropical-cyclone": 20.8, flood: 32.3, volcanic: 17.5, earthquake: 28.8, tsunami: 14.2, landslide: 7.8, drought: 11.5 },
  { month: "Oct", "tropical-cyclone": 25.5, flood: 25.8, volcanic: 14.2, earthquake: 22.5, tsunami: 11.5, landslide: 6.2, drought: 9.8 },
  { month: "Nov", "tropical-cyclone": 32.8, flood: 18.5, volcanic: 11.8, earthquake: 16.8, tsunami: 8.8, landslide: 4.8, drought: 7.5 },
  { month: "Dec", "tropical-cyclone": 38.5, flood: 14.2, volcanic: 9.8, earthquake: 13.5, tsunami: 6.5, landslide: 3.5, drought: 5.8 },
];
