/**
 * Unified CSV Parser Utility
 *
 * World-class CSV parsing with support for:
 * - Quoted fields containing commas
 * - Escaped quotes
 * - Multiple line endings (Windows/Unix)
 * - Type inference (numbers vs strings)
 * - Empty value handling
 */

export interface CSVParseOptions {
  /** Convert numeric strings to numbers (default: true) */
  inferTypes?: boolean;
  /** Trim whitespace from values (default: true) */
  trimValues?: boolean;
  /** Skip empty rows (default: true) */
  skipEmptyRows?: boolean;
  /** Handle NaN values as null (default: true) */
  convertNaN?: boolean;
}

/**
 * Parse CSV text into array of objects
 * @param csvText - The CSV text to parse
 * @param options - Parsing options
 * @returns Array of objects with header names as keys
 */
export function parseCSV(
  csvText: string,
  options: CSVParseOptions = {}
): Record<string, string | number | null>[] {
  const { inferTypes = true, trimValues = true, skipEmptyRows = true, convertNaN = true } = options;

  // Normalize line endings
  const normalizedText = csvText.trim().replace(/\r\n/g, '\n');
  const lines = normalizedText.split('\n');

  if (lines.length < 2) return [];

  const headers = parseLine(lines[0], trimValues);
  const data: Record<string, string | number | null>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];

    // Skip empty rows if option is set
    if (skipEmptyRows && !line.trim()) continue;

    const values = parseLine(line, trimValues);

    // Skip if column count mismatch
    if (values.length !== headers.length && values.length > 0) {
      console.warn(
        `CSV line ${i + 1}: Column count mismatch (expected ${headers.length}, got ${values.length})`
      );
    }

    const row: Record<string, string | number | null> = {};
    headers.forEach((header, index) => {
      const rawValue = values[index] || '';
      row[header] = processValue(rawValue, { inferTypes, convertNaN });
    });

    data.push(row);
  }

  return data;
}

/**
 * Parse a single CSV line with proper quote handling
 * @param line - The CSV line to parse
 * @param trim - Whether to trim  values
 * @returns Array of field values
 */
function parseLine(line: string, trim: boolean = true): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote within quoted field
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(trim ? current.trim() : current);
      current = '';
    } else {
      current += char;
    }
  }

  // Push final field
  result.push(trim ? current.trim() : current);
  return result;
}

/**
 * Process a CSV value with type inference and special value handling
 * @param value - The raw string value
 * @param options - Processing options
 * @returns Processed value (string, number, or null)
 */
function processValue(
  value: string,
  options: { inferTypes: boolean; convertNaN: boolean }
): string | number | null {
  const { inferTypes, convertNaN } = options;

  // Handle empty strings
  if (value === '') {
    return inferTypes ? null : '';
  }

  // Handle NaN values
  if (convertNaN && (value === 'NaN' || value === 'nan')) {
    return null;
  }

  // Type inference
  if (inferTypes) {
    const numValue = Number(value);
    if (!isNaN(numValue) && value.trim() !== '') {
      return numValue;
    }
  }

  return value;
}

/**
 * Parse CSV to array of arrays (raw format)
 * @param csvText - The CSV text to parse
 * @param options - Parsing options
 * @returns Array of arrays (including header row)
 */
export function parseCSVToArray(
  csvText: string,
  options: Pick<CSVParseOptions, 'trimValues' | 'skipEmptyRows'> = {}
): string[][] {
  const { trimValues = true, skipEmptyRows = true } = options;

  const normalizedText = csvText.trim().replace(/\r\n/g, '\n');
  const lines = normalizedText.split('\n');

  const result: string[][] = [];

  for (const line of lines) {
    if (skipEmptyRows && !line.trim()) continue;
    result.push(parseLine(line, trimValues));
  }

  return result;
}

/**
 * Validate CSV structure
 * @param csvText - The CSV text to validate
 * @returns Validation result with errors if any
 */
export function validateCSV(csvText: string): {
  valid: boolean;
  errors: string[];
  rowCount: number;
  columnCount: number;
} {
  const errors: string[] = [];
  const normalizedText = csvText.trim().replace(/\r\n/g, '\n');
  const lines = normalizedText.split('\n').filter(line => line.trim());

  if (lines.length === 0) {
    errors.push('CSV is empty');
    return { valid: false, errors, rowCount: 0, columnCount: 0 };
  }

  if (lines.length < 2) {
    errors.push('CSV must have at least a header row and one data row');
    return { valid: false, errors, rowCount: lines.length, columnCount: 0 };
  }

  const headerColumnCount = parseLine(lines[0], true).length;

  // Check for consistent column counts
  for (let i = 1; i < lines.length; i++) {
    const columnCount = parseLine(lines[i], true).length;
    if (columnCount !== headerColumnCount && columnCount > 0) {
      errors.push(
        `Row ${i + 1}: Column count mismatch (expected ${headerColumnCount}, got ${columnCount})`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    rowCount: lines.length,
    columnCount: headerColumnCount,
  };
}
