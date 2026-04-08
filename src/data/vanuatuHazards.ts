/**
 * Vanuatu-specific hazard data
 * Based on actual hazards affecting the Pacific island nation
 */

import { Hazard, Sector } from '@/types';
import {
  Activity,
  Building2,
  Droplet,
  Flame,
  HelpCircle,
  Home,
  Landmark,
  Leaf,
  Mountain,
  Package,
  School,
  Sun,
  Waves,
  Wind,
} from 'lucide-react';

/**
 * Primary hazards affecting Vanuatu
 */
export const vanuatuHazards: Hazard[] = [
  {
    id: 'tropical-cyclone',
    name: 'Tropical Cyclone',
    color: '#DC2626', // Red
    icon: Wind,
  },
  {
    id: 'flood',
    name: 'Flood',
    color: '#2563EB', // Blue
    icon: Droplet,
  },
  {
    id: 'volcanic',
    name: 'Volcanic Activity',
    color: '#EA580C', // Orange
    icon: Flame,
  },
  {
    id: 'earthquake',
    name: 'Earthquake',
    color: '#7C3AED', // Purple
    icon: Activity,
  },
  {
    id: 'tsunami',
    name: 'Tsunami',
    color: '#0891B2', // Cyan
    icon: Waves,
  },
  {
    id: 'landslide',
    name: 'Landslide',
    color: '#92400E', // Brown
    icon: Mountain,
  },
  {
    id: 'drought',
    name: 'Drought',
    color: '#D97706', // Amber
    icon: Sun,
  },
];

/**
 * Key sectors affected by hazards in Vanuatu
 * Based on actual PDIE output data from RiskScape TC Lola analysis
 */
export const vanuatuSectors: Sector[] = [
  {
    id: 'Education',
    name: 'Education',
    icon: School,
    color: '#8B5CF6',
  },
  {
    id: 'Infrastructure',
    name: 'Infrastructure',
    icon: Building2,
    color: '#6B7280',
  },
  {
    id: 'Productive',
    name: 'Productive',
    icon: Leaf,
    color: '#16A34A',
  },
  {
    id: 'Public',
    name: 'Public',
    icon: Landmark,
    color: '#3B82F6',
  },
  {
    id: 'Residential',
    name: 'Residential',
    icon: Home,
    color: '#EF4444',
  },
  {
    id: 'Other',
    name: 'Other',
    icon: Package,
    color: '#64748B',
  },
  {
    id: 'Unknown',
    name: 'Unknown',
    icon: HelpCircle,
    color: '#9CA3AF',
  },
];

/**
 * Vanuatu provinces (Admin1)
 * Real data from PDIE RiskScape output
 */
export const vanuatuProvinces = [
  { id: 'VUT.1_1', name: 'Malampa' },
  { id: 'VUT.2_1', name: 'Penama' },
  { id: 'VUT.3_1', name: 'Sanma' },
  { id: 'VUT.4_1', name: 'Shefa' },
  { id: 'VUT.5_1', name: 'Tafea' },
  { id: 'VUT.6_1', name: 'Torba' },
];

/**
 * Vanuatu districts (Admin2 - Area Councils)
 * All 66 districts from PDIE RiskScape output
 */
export const vanuatuDistricts = [
  // Torba Province (VU01xxx)
  { id: 'VU01053', name: 'Gaua', provinceId: 'VUT.6_1' },
  { id: 'VU01054', name: 'Vanua Lava', provinceId: 'VUT.6_1' },
  { id: 'VU01055', name: 'Torres', provinceId: 'VUT.6_1' },
  { id: 'VU01063', name: 'Motalava', provinceId: 'VUT.6_1' },
  { id: 'VU01064', name: 'Mota', provinceId: 'VUT.6_1' },
  { id: 'VU01065', name: 'Merelava', provinceId: 'VUT.6_1' },
  { id: 'VU01066', name: 'Ureparapara', provinceId: 'VUT.6_1' },

  // Sanma Province (VU02xxx)
  { id: 'VU02001', name: 'Luganville', provinceId: 'VUT.3_1' },
  { id: 'VU02042', name: 'East Malo', provinceId: 'VUT.3_1' },
  { id: 'VU02043', name: 'West Malo', provinceId: 'VUT.3_1' },
  { id: 'VU02044', name: 'North West Santo', provinceId: 'VUT.3_1' },
  { id: 'VU02045', name: 'South Santo', provinceId: 'VUT.3_1' },
  { id: 'VU02046', name: 'South East Santo', provinceId: 'VUT.3_1' },
  { id: 'VU02047', name: 'North Santo', provinceId: 'VUT.3_1' },
  { id: 'VU02048', name: 'West Santo', provinceId: 'VUT.3_1' },
  { id: 'VU02056', name: 'East Santo', provinceId: 'VUT.3_1' },
  { id: 'VU02061', name: 'Canal - Fanafo', provinceId: 'VUT.3_1' },

  // Penama Province (VU03xxx)
  { id: 'VU03014', name: 'North Maewo', provinceId: 'VUT.2_1' },
  { id: 'VU03015', name: 'South Maewo', provinceId: 'VUT.2_1' },
  { id: 'VU03016', name: 'South Pentecost', provinceId: 'VUT.2_1' },
  { id: 'VU03017', name: 'North Pentecost', provinceId: 'VUT.2_1' },
  { id: 'VU03018', name: 'Central Pentecost 2', provinceId: 'VUT.2_1' },
  { id: 'VU03049', name: 'South Ambae', provinceId: 'VUT.2_1' },
  { id: 'VU03050', name: 'North Ambae', provinceId: 'VUT.2_1' },
  { id: 'VU03051', name: 'East Ambae', provinceId: 'VUT.2_1' },
  { id: 'VU03052', name: 'West Ambae', provinceId: 'VUT.2_1' },
  { id: 'VU03060', name: 'Central Pentecost 1', provinceId: 'VUT.2_1' },

  // Malampa Province (VU04xxx)
  { id: 'VU04006', name: 'North West Malekula', provinceId: 'VUT.1_1' },
  { id: 'VU04007', name: 'North East Malekula', provinceId: 'VUT.1_1' },
  { id: 'VU04008', name: 'Central Malekula', provinceId: 'VUT.1_1' },
  { id: 'VU04009', name: 'South East Malekula', provinceId: 'VUT.1_1' },
  { id: 'VU04010', name: 'West Ambrym', provinceId: 'VUT.1_1' },
  { id: 'VU04011', name: 'North Ambrym', provinceId: 'VUT.1_1' },
  { id: 'VU04012', name: 'South East Ambrym', provinceId: 'VUT.1_1' },
  { id: 'VU04013', name: 'Paama', provinceId: 'VUT.1_1' },
  { id: 'VU04058', name: 'South Malekula', provinceId: 'VUT.1_1' },
  { id: 'VU04059', name: 'South West Malekula', provinceId: 'VUT.1_1' },

  // Shefa Province (VU05xxx)
  { id: 'VU05002', name: 'Port Vila', provinceId: 'VUT.4_1' },
  { id: 'VU05003', name: 'Eratap', provinceId: 'VUT.4_1' },
  { id: 'VU05027', name: 'South Epi', provinceId: 'VUT.4_1' },
  { id: 'VU05028', name: 'Vermaul', provinceId: 'VUT.4_1' },
  { id: 'VU05029', name: 'Vermali', provinceId: 'VUT.4_1' },
  { id: 'VU05030', name: 'Varisu', provinceId: 'VUT.4_1' },
  { id: 'VU05031', name: 'North Tongoa', provinceId: 'VUT.4_1' },
  { id: 'VU05032', name: 'Tongariki', provinceId: 'VUT.4_1' },
  { id: 'VU05033', name: 'Makimae', provinceId: 'VUT.4_1' },
  { id: 'VU05034', name: 'Emau', provinceId: 'VUT.4_1' },
  { id: 'VU05035', name: 'North Efate', provinceId: 'VUT.4_1' },
  { id: 'VU05036', name: 'Nguna', provinceId: 'VUT.4_1' },
  { id: 'VU05037', name: 'Eton', provinceId: 'VUT.4_1' },
  { id: 'VU05038', name: 'Pango', provinceId: 'VUT.4_1' },
  { id: 'VU05039', name: 'Ifira', provinceId: 'VUT.4_1' },
  { id: 'VU05040', name: 'Erakor', provinceId: 'VUT.4_1' },
  { id: 'VU05041', name: 'Malorua', provinceId: 'VUT.4_1' },
  { id: 'VU05057', name: 'Mele', provinceId: 'VUT.4_1' },

  // Tafea Province (VU06xxx)
  { id: 'VU06004', name: 'Futuna', provinceId: 'VUT.5_1' },
  { id: 'VU06005', name: 'Aniwa', provinceId: 'VUT.5_1' },
  { id: 'VU06019', name: 'North Erromango', provinceId: 'VUT.5_1' },
  { id: 'VU06020', name: 'South Erromango', provinceId: 'VUT.5_1' },
  { id: 'VU06021', name: 'Aneityum', provinceId: 'VUT.5_1' },
  { id: 'VU06022', name: 'South Tanna', provinceId: 'VUT.5_1' },
  { id: 'VU06023', name: 'South West Tanna', provinceId: 'VUT.5_1' },
  { id: 'VU06024', name: 'Whitesands', provinceId: 'VUT.5_1' },
  { id: 'VU06025', name: 'West Tanna', provinceId: 'VUT.5_1' },
  { id: 'VU06026', name: 'North Tanna', provinceId: 'VUT.5_1' },
  { id: 'VU06062', name: 'Middle Bush Tanna', provinceId: 'VUT.5_1' },
];
