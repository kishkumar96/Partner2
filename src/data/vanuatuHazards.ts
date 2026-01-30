/**
 * Vanuatu-specific hazard data
 * Based on actual hazards affecting the Pacific island nation
 */

import { Hazard, Sector } from "@/types";

/**
 * Primary hazards affecting Vanuatu
 */
export const vanuatuHazards: Hazard[] = [
  {
    id: "tropical-cyclone",
    name: "Tropical Cyclone",
    color: "#DC2626", // Red
    icon: "🌀",
  },
  {
    id: "flood",
    name: "Flood",
    color: "#2563EB", // Blue
    icon: "🌊",
  },
  {
    id: "volcanic",
    name: "Volcanic Activity",
    color: "#EA580C", // Orange
    icon: "🌋",
  },
  {
    id: "earthquake",
    name: "Earthquake",
    color: "#7C3AED", // Purple
    icon: "📍",
  },
  {
    id: "tsunami",
    name: "Tsunami",
    color: "#0891B2", // Cyan
    icon: "〰️",
  },
  {
    id: "landslide",
    name: "Landslide",
    color: "#92400E", // Brown
    icon: "⛰️",
  },
  {
    id: "drought",
    name: "Drought",
    color: "#D97706", // Amber
    icon: "☀️",
  },
];

/**
 * Key sectors affected by hazards in Vanuatu
 */
export const vanuatuSectors: Sector[] = [
  {
    id: "agriculture",
    name: "Agriculture",
    icon: "🌾",
    color: "#16A34A",
  },
  {
    id: "infrastructure",
    name: "Infrastructure",
    icon: "🏗️",
    color: "#6B7280",
  },
  {
    id: "housing",
    name: "Housing",
    icon: "🏘️",
    color: "#EF4444",
  },
  {
    id: "health",
    name: "Health",
    icon: "🏥",
    color: "#EC4899",
  },
  {
    id: "education",
    name: "Education",
    icon: "🎓",
    color: "#8B5CF6",
  },
  {
    id: "tourism",
    name: "Tourism",
    icon: "✈️",
    color: "#06B6D4",
  },
  {
    id: "fisheries",
    name: "Fisheries",
    icon: "🐟",
    color: "#0EA5E9",
  },
  {
    id: "energy",
    name: "Energy",
    icon: "⚡",
    color: "#F59E0B",
  },
];

/**
 * Vanuatu provinces
 */
export const vanuatuProvinces = [
  { id: "shefa", name: "Shefa" },
  { id: "sanma", name: "Sanma" },
  { id: "penama", name: "Penama" },
  { id: "malampa", name: "Malampa" },
  { id: "tafea", name: "Tafea" },
  { id: "torba", name: "Torba" },
];

/**
 * Major districts/islands in Vanuatu
 */
export const vanuatuDistricts = [
  // Shefa Province
  { id: "efate", name: "Efate", provinceId: "shefa" },
  { id: "epi", name: "Epi", provinceId: "shefa" },
  { id: "shepherds", name: "Shepherds", provinceId: "shefa" },
  
  // Sanma Province
  { id: "santo", name: "Santo", provinceId: "sanma" },
  { id: "malo", name: "Malo", provinceId: "sanma" },
  
  // Penama Province
  { id: "pentecost", name: "Pentecost", provinceId: "penama" },
  { id: "ambae", name: "Ambae", provinceId: "penama" },
  { id: "maewo", name: "Maewo", provinceId: "penama" },
  
  // Malampa Province
  { id: "malekula", name: "Malekula", provinceId: "malampa" },
  { id: "ambrym", name: "Ambrym", provinceId: "malampa" },
  { id: "paama", name: "Paama", provinceId: "malampa" },
  
  // Tafea Province
  { id: "tanna", name: "Tanna", provinceId: "tafea" },
  { id: "aniwa", name: "Aniwa", provinceId: "tafea" },
  { id: "futuna", name: "Futuna", provinceId: "tafea" },
  { id: "erromango", name: "Erromango", provinceId: "tafea" },
  { id: "aneityum", name: "Aneityum", provinceId: "tafea" },
  
  // Torba Province
  { id: "torres", name: "Torres Islands", provinceId: "torba" },
  { id: "banks", name: "Banks Islands", provinceId: "torba" },
];
