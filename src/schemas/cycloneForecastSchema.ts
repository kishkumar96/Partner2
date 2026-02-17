/**
 * Zod schemas for cyclone forecast data validation
 * Provides type-safe parsing with clear error messages
 */

import { z } from 'zod';

/**
 * Schema for raw CSV row from cyclone forecast file
 * Validates all 56 columns from professional meteorological data
 */
export const CycloneForecastRowSchema = z.object({
  // Core temporal and spatial data
  "Time[fmt=yyyy-MM-dd'T'HH:mm:ss'Z']": z.string(),
  Latitude: z.coerce.number().min(-90).max(90),
  Longitude: z.coerce.number().min(-180).max(180),

  // Intensity metrics
  Symbol: z.coerce.number().nullable().optional(),
  Category: z.coerce.number().min(0).max(5),
  Pressure: z.coerce.number().min(800).max(1020), // hPa
  PressureOCI: z.coerce.number().nullable().optional(), // Outermost closed isobar

  // Wind data
  MeanWind: z.coerce.number().min(0).max(200), // knots
  WindGust: z.coerce.number().min(0).max(250), // knots
  P5Wind: z.coerce.number().nullable().optional(), // Alternative wind metric

  // Structural metrics
  RadiusOCI: z.coerce.number().nullable().optional(), // km
  Radius1000hPa: z.coerce.number().nullable().optional(),
  RadiusMaxWinds: z.coerce.number().nullable().optional(),
  EyeRadius: z.coerce.number().nullable().optional(), // km
  UncEyeRadius: z.coerce.number().nullable().optional(), // km
  VerticalExtent: z.coerce.number().nullable().optional(), // scale 1-5

  // Forecast uncertainty
  Uncertainty: z.coerce.number().min(0).max(1000), // km

  // Professional intensity metrics
  FinalT: z.coerce.number().nullable().optional(), // Dvorak T-number
  CurrentIntensity: z.coerce.number().nullable().optional(),
  DataTNoDvorak: z.coerce.number().nullable().optional(),
  ModelTNoDvorak: z.coerce.number().nullable().optional(),
  PatternTNoDvorak: z.coerce.number().nullable().optional(),

  // Wind radii (directional) - Gale force (34kt+)
  GaleRadius: z.coerce.number().nullable().optional(),
  NEGaleRadius: z.coerce.number().min(0).max(500).nullable().optional(),
  SEGaleRadius: z.coerce.number().min(0).max(500).nullable().optional(),
  SWGaleRadius: z.coerce.number().min(0).max(500).nullable().optional(),
  NWGaleRadius: z.coerce.number().min(0).max(500).nullable().optional(),

  // Wind radii - Strong gale (50kt+)
  StrongGaleRadius: z.coerce.number().nullable().optional(),
  NEStrongGaleRadius: z.coerce.number().min(0).max(300).nullable().optional(),
  SEStrongGaleRadius: z.coerce.number().min(0).max(300).nullable().optional(),
  SWStrongGaleRadius: z.coerce.number().min(0).max(300).nullable().optional(),
  NWStrongGaleRadius: z.coerce.number().min(0).max(300).nullable().optional(),

  // Wind radii - Storm force (64kt+)
  StormRadius: z.coerce.number().nullable().optional(),
  NEStormRadius: z.coerce.number().min(0).max(200).nullable().optional(),
  SEStormRadius: z.coerce.number().min(0).max(200).nullable().optional(),
  SWStormRadius: z.coerce.number().min(0).max(200).nullable().optional(),
  NWStormRadius: z.coerce.number().min(0).max(200).nullable().optional(),

  // Wind radii - Hurricane force (96kt+)
  HurricaneRadius: z.coerce.number().nullable().optional(),
  NEHurricaneRadius: z.coerce.number().min(0).max(150).nullable().optional(),
  SEHurricaneRadius: z.coerce.number().min(0).max(150).nullable().optional(),
  SWHurricaneRadius: z.coerce.number().min(0).max(150).nullable().optional(),
  NWHurricaneRadius: z.coerce.number().min(0).max(150).nullable().optional(),

  // Metadata fields (optional, for completeness)
  DataSource: z.string().nullable().optional(),
  'Land/Water': z.string().nullable().optional(),
  CycloneStatus: z.string().nullable().optional(),
  HowLocation: z.string().nullable().optional(),
  UncPressure: z.coerce.number().nullable().optional(),
  HowPressure: z.string().nullable().optional(),
  'P/W_Method': z.string().nullable().optional(),
  HowMaxWindRadius: z.string().nullable().optional(),
  HowGaleRadius: z.string().nullable().optional(),
  HowStormRadius: z.string().nullable().optional(),
  HowHurricaneRadius: z.string().nullable().optional(),
  UncMaxWindSpeed: z.coerce.number().nullable().optional(),
  HowMaxWindSpeed: z.string().nullable().optional(),
  HowGust: z.string().nullable().optional(),
  HowEyeRadius: z.string().nullable().optional(),
});

/**
 * Validated and parsed cyclone forecast point
 * Post-transformation with computed fields
 */
export const CycloneForecastPointSchema = z.object({
  time: z.date(),
  timeString: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  category: z.number(),
  pressure: z.number(),
  meanWind: z.number(),
  windGust: z.number(),
  uncertainty: z.number(),

  // Directional radii
  galeRadiusNE: z.number(),
  galeRadiusSE: z.number(),
  galeRadiusSW: z.number(),
  galeRadiusNW: z.number(),
  stormRadiusNE: z.number(),
  stormRadiusSE: z.number(),
  stormRadiusSW: z.number(),
  stormRadiusNW: z.number(),
  hurricaneRadiusNE: z.number(),
  hurricaneRadiusSE: z.number(),
  hurricaneRadiusSW: z.number(),
  hurricaneRadiusNW: z.number(),

  // Enhanced fields
  eyeRadius: z.number(),
  eyeRadiusUncertainty: z.number(),
  verticalExtent: z.number(),
  pressureOCI: z.number(),
  radiusOCI: z.number(),
  dvorakTNumber: z.number(),
  currentIntensity: z.number(),
  p5Wind: z.number(),
});

export type CycloneForecastRow = z.infer<typeof CycloneForecastRowSchema>;
export type ValidatedCycloneForecastPoint = z.infer<typeof CycloneForecastPointSchema>;

/**
 * Validation result with detailed error reporting
 */
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: Array<{
    row: number;
    field: string;
    message: string;
    value: any;
  }>;
  warnings?: Array<{
    row: number;
    field: string;
    message: string;
  }>;
}

/**
 * Validate a single CSV row
 */
export function validateCycloneRow(
  row: any,
  rowIndex: number
): ValidationResult<CycloneForecastRow> {
  try {
    const validated = CycloneForecastRowSchema.parse(row);

    // Check for warnings (valid but potentially problematic data)
    const warnings: ValidationResult<CycloneForecastRow>['warnings'] = [];

    if (validated.EyeRadius === null) {
      warnings.push({
        row: rowIndex,
        field: 'EyeRadius',
        message: 'Missing eye radius data',
      });
    }

    if (validated.Uncertainty > 500) {
      warnings.push({
        row: rowIndex,
        field: 'Uncertainty',
        message: 'Very high uncertainty (>500km)',
      });
    }

    return {
      success: true,
      data: validated,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      const zodError = error as z.ZodError;
      const errors = zodError.issues.map(err => ({
        row: rowIndex,
        field: err.path.join('.'),
        message: err.message,
        value: (row as any)[err.path[0] || 'unknown'],
      }));

      return {
        success: false,
        errors,
      };
    }

    return {
      success: false,
      errors: [
        {
          row: rowIndex,
          field: 'unknown',
          message: 'Unexpected validation error',
          value: row,
        },
      ],
    };
  }
}

/**
 * Validate entire forecast track with aggregated results
 */
export function validateForecastTrack(rows: any[]): ValidationResult<CycloneForecastRow[]> {
  const validatedRows: CycloneForecastRow[] = [];
  const allErrors: ValidationResult<CycloneForecastRow>['errors'] = [];
  const allWarnings: ValidationResult<CycloneForecastRow>['warnings'] = [];

  rows.forEach((row, index) => {
    const result = validateCycloneRow(row, index + 1); // 1-based row numbers for user display

    if (result.success && result.data) {
      validatedRows.push(result.data);
    }

    if (result.errors) {
      allErrors?.push(...result.errors);
    }

    if (result.warnings) {
      allWarnings?.push(...result.warnings);
    }
  });

  return {
    success: validatedRows.length === rows.length,
    data: validatedRows,
    errors: allErrors?.length ? allErrors : undefined,
    warnings: allWarnings?.length ? allWarnings : undefined,
  };
}
