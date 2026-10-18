/**
 * The configuration contract, defined once.
 *
 * Used by scripts/config.mjs (validate / generate / check), by the app's typed
 * registry, and by the tests. Plain ES module with no Node imports, so it runs
 * the same in the script, in Jest and under the type checker.
 *
 * Strict by design: an unknown field is an error, so a typo or a pasted secret
 * fails review instead of being silently ignored.
 */
import { z } from 'zod';

/** ISO 3166-1 alpha-2 style: two capital letters. */
const countryCode = z.string().regex(/^[A-Z]{2}$/, 'must be two capital letters, e.g. "VU"');

/** URL-safe: lower-case words joined by single hyphens, e.g. "cook-islands". */
const slug = z
  .string()
  .regex(
    /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/,
    'must be lower-case words joined by hyphens, e.g. "cook-islands"'
  );

const text = z.string().trim().min(1, 'must not be empty').max(120);

export const countrySchema = z
  .object({
    $schema: z.string().optional(),
    code: countryCode,
    slug,
    name: text,
    fullName: text,
    viewport: z
      .object({
        /** [longitude, latitude] */
        center: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
        zoom: z.number().min(0).max(22),
      })
      .strict(),
    partnerApi: z
      .object({
        /** Lower-case names the Partner API may know the country by */
        aliases: z
          .array(z.string().regex(/^[a-z][a-z .'-]*$/, 'must be lower-case words'))
          .min(1, 'needs at least one alias'),
      })
      .strict(),
    terminology: z
      .object({
        focusAreaSingular: text,
        focusAreaPlural: text,
        broaderAreaSingular: text,
        broaderAreaPlural: text,
        nationalLabel: text,
      })
      .strict(),
  })
  .strict();

export const releaseSchema = z
  .object({
    $schema: z.string().optional(),
    /** Semantic version of this configuration release */
    configVersion: z.string().regex(/^\d+\.\d+\.\d+$/, 'must be a semantic version, e.g. "1.0.0"'),
    /** Version of this schema; bumped when the shape of the files changes */
    schemaVersion: z.literal(1),
    /** Country code shown when a request names none */
    defaultCountry: countryCode,
    /** Country files to include, in display order (a file's slug, without ".json") */
    countries: z.array(slug).min(1, 'needs at least one country'),
  })
  .strict();

/** Kebab-case identifier, e.g. "tc-lola-2024" or "vu-tc-lola-wind". */
const identifier = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9]*(-[a-z0-9]+)*$/,
    'must be lower-case words and digits joined by hyphens'
  );

const longitude = z.number().min(-180).max(180);
const latitude = z.number().min(-90).max(90);

/** [minLon, minLat, maxLon, maxLat] */
const bbox = z
  .tuple([longitude, latitude, longitude, latitude])
  .refine(([minLon, minLat, maxLon, maxLat]) => minLon < maxLon && minLat < maxLat, {
    message: 'must be [minLon, minLat, maxLon, maxLat] with each minimum below its maximum',
  });

/** A path inside the app's own files: no leading slash, no "..", no scheme, query or backslash. */
const relativePath = z
  .string()
  .min(1)
  .refine(
    value =>
      !value.startsWith('/') &&
      !value.split('/').includes('..') &&
      !/^[a-z][a-z0-9+.-]*:/i.test(value) &&
      !/[\\?#]/.test(value),
    {
      message:
        'must be a plain relative path (no leading "/", "..", URL scheme, query or backslash)',
    }
  );

/** An absolute path on the data server, not a URL: "/POP/..." with no "..". */
const serverPath = z
  .string()
  .regex(
    /^\/[A-Za-z0-9_\-./]+$/,
    'must be an absolute server path such as "/POP/Partner2/...", not a URL'
  )
  .refine(value => !value.split('/').includes('..'), { message: 'must not contain ".."' });

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date such as "2024-01-30"')
  .refine(
    value => {
      // Date.parse is lenient ("2026-02-30" becomes 2 March), so round-trip the parts
      const [year, month, day] = value.split('-').map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));
      return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
      );
    },
    { message: 'is not a real calendar date' }
  );

export const eventSchema = z
  .object({
    id: identifier,
    name: text,
    date: isoDate,
    /** The hazard this event is for, e.g. "tropical-cyclone" */
    hazardId: identifier,
    location: z.object({ lat: latitude, lng: longitude }).strict(),
    bbox,
    trackFile: relativePath.optional(),
    forecastFile: relativePath.optional(),
    /** The event shown when nothing else is chosen; exactly one per country */
    isDefault: z.boolean().default(false),
    aliases: z
      .array(z.string().regex(/^[a-z0-9][a-z0-9 ]*$/, 'must be lower-case words'))
      .default([]),
    /** false hides an approved fallback event without deleting it */
    enabled: z.boolean().default(true),
  })
  .strict();

export const eventsFileSchema = z
  .object({
    $schema: z.string().optional(),
    country: countryCode,
    events: z.array(eventSchema).min(1, 'needs at least one event (or remove the file)'),
  })
  .strict();

export const styleConfigSchema = z
  .object({
    wmsVersion: z.enum(['1.1.1', '1.3.0']).optional(),
    crs: z.enum(['EPSG:4326', 'EPSG:3857']).optional(),
    styles: z.string().min(1).optional(),
    colorScaleRange: z
      .string()
      .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, 'must be "min,max", e.g. "0,4"')
      .optional(),
    numColorBands: z.number().int().min(1).max(250).optional(),
    aboveMaxColor: z.string().min(1).optional(),
    belowMinColor: z.string().min(1).optional(),
    bgColor: z.string().min(1).optional(),
    logScale: z.boolean().optional(),
    time: z.iso.datetime().optional(),
  })
  .strict();

export const layerSchema = z
  .object({
    id: identifier,
    /** The event this layer belongs to; must be one of the same country's events */
    eventId: identifier.optional(),
    name: text,
    /** The dataset file on the THREDDS server, under the country's datasetBasePath */
    ncFile: relativePath,
    layerName: text,
    description: z.string().trim().min(1).max(240),
    hazardType: z.enum(['wind', 'flood', 'inundation', 'cyclone', 'fluvial-depth']),
    bbox,
    maxNativeZoom: z.number().int().min(0).max(22).optional(),
    styleConfig: styleConfigSchema.optional(),
    /** Overrides datasetBasePath + ncFile for one layer */
    datasetPath: serverPath.optional(),
    /** false hides an approved layer without deleting it */
    enabled: z.boolean().default(true),
  })
  .strict();

export const layersFileSchema = z
  .object({
    $schema: z.string().optional(),
    country: countryCode,
    /** Where this country's static hazard datasets live on the THREDDS server */
    datasetBasePath: serverPath,
    layers: z.array(layerSchema).min(1, 'needs at least one layer (or remove the file)'),
  })
  .strict();

const duplicates = values => values.filter((value, index) => values.indexOf(value) !== index);

const format = (label, error) =>
  error.issues.map(issue => {
    const where = issue.path.length ? issue.path.join('.') : '(root)';
    const extra =
      issue.code === 'unrecognized_keys' ? ` — unknown field(s): ${issue.keys.join(', ')}` : '';
    return `${label}: ${where}: ${issue.message}${extra}`;
  });

/**
 * Validate a whole configuration: every file against its schema, then the
 * rules that span files (unique codes/slugs/aliases, valid references).
 *
 * @param {{ release: unknown, countries: Array<{ file: string, value: unknown }>, events?: Array<{ file: string, value: unknown }>, layers?: Array<{ file: string, value: unknown }> }} sources
 * @returns {{ ok: true, release: z.infer<typeof releaseSchema>, countries: Array<z.infer<typeof countrySchema>>,
 *     events: Array<{ country: string, events: Array<z.infer<typeof eventSchema>> }>,
 *     layers: Array<{ country: string, datasetBasePath: string, layers: Array<z.infer<typeof layerSchema>> }> }
 *   | { ok: false, errors: string[] }}
 */
export function validateConfig(sources) {
  const errors = [];

  const release = releaseSchema.safeParse(sources.release);
  if (!release.success) errors.push(...format('release.json', release.error));

  const parsed = [];
  for (const { file, value } of sources.countries) {
    const result = countrySchema.safeParse(value);
    if (!result.success) {
      errors.push(...format(file, result.error));
      continue;
    }
    if (file !== `${result.data.slug}.json`) {
      errors.push(`${file}: file name must be "${result.data.slug}.json" to match its slug`);
    }
    parsed.push({ file, data: result.data });
  }

  const countries = parsed.map(entry => entry.data);
  for (const code of new Set(duplicates(countries.map(c => c.code)))) {
    errors.push(`duplicate country code "${code}"`);
  }
  for (const value of new Set(duplicates(countries.map(c => c.slug)))) {
    errors.push(`duplicate slug "${value}"`);
  }
  const aliasOwners = new Map();
  for (const country of countries) {
    for (const alias of country.partnerApi.aliases) {
      if (aliasOwners.has(alias) && aliasOwners.get(alias) !== country.code) {
        errors.push(
          `alias "${alias}" is claimed by both ${aliasOwners.get(alias)} and ${country.code}`
        );
      }
      aliasOwners.set(alias, country.code);
    }
  }

  if (release.success) {
    const slugs = new Set(countries.map(c => c.slug));
    for (const listed of release.data.countries) {
      if (!slugs.has(listed))
        errors.push(
          `release.json: lists "${listed}" but config/countries/${listed}.json is missing or invalid`
        );
    }
    for (const value of new Set(duplicates(release.data.countries))) {
      errors.push(`release.json: "${value}" is listed twice`);
    }
    for (const country of countries) {
      if (!release.data.countries.includes(country.slug)) {
        errors.push(
          `${country.slug}.json: not listed in release.json "countries", so it would be silently ignored`
        );
      }
    }
    if (!countries.some(c => c.code === release.data.defaultCountry)) {
      errors.push(
        `release.json: defaultCountry "${release.data.defaultCountry}" is not a configured country`
      );
    }
  }

  const slugByCode = new Map(countries.map(c => [c.code, c.slug]));
  const eventFiles = parseCountryFiles(
    'events',
    eventsFileSchema,
    sources.events ?? [],
    slugByCode,
    errors
  );
  const layerFiles = parseCountryFiles(
    'layers',
    layersFileSchema,
    sources.layers ?? [],
    slugByCode,
    errors
  );

  const eventIdOwners = new Map();
  for (const file of eventFiles) {
    for (const event of file.events) {
      if (eventIdOwners.has(event.id)) {
        errors.push(
          `events/${file.slug}.json: event id "${event.id}" is also used in ${eventIdOwners.get(event.id)}`
        );
      }
      eventIdOwners.set(event.id, `events/${file.slug}.json`);
    }
    const defaults = file.events.filter(event => event.isDefault && event.enabled);
    if (defaults.length !== 1) {
      errors.push(
        `events/${file.slug}.json: needs exactly one enabled default event (isDefault: true), found ${defaults.length}`
      );
    }
  }

  const layerIdOwners = new Map();
  for (const file of layerFiles) {
    const eventIds = new Set(
      (eventFiles.find(candidate => candidate.country === file.country)?.events ?? []).map(
        event => event.id
      )
    );
    for (const layer of file.layers) {
      if (layerIdOwners.has(layer.id)) {
        errors.push(
          `layers/${file.slug}.json: layer id "${layer.id}" is also used in ${layerIdOwners.get(layer.id)}`
        );
      }
      layerIdOwners.set(layer.id, `layers/${file.slug}.json`);
      if (layer.eventId && !eventIds.has(layer.eventId)) {
        errors.push(
          `layers/${file.slug}.json: layer "${layer.id}" belongs to event "${layer.eventId}", which is not in events/${file.slug}.json`
        );
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const order = release.data.countries;
  const byRelease = (a, b) => order.indexOf(a.slug) - order.indexOf(b.slug);
  return {
    ok: true,
    release: release.data,
    countries: [...countries].sort(byRelease),
    events: eventFiles.sort(byRelease).map(({ country, events }) => ({ country, events })),
    layers: layerFiles
      .sort(byRelease)
      .map(({ country, datasetBasePath, layers }) => ({ country, datasetBasePath, layers })),
  };
}

/**
 * Parse a directory of per-country files (events/ or layers/): each against its schema, named
 * after the country it describes, and about a country that is configured.
 */
function parseCountryFiles(kind, schema, sources, slugByCode, errors) {
  const parsed = [];
  for (const { file, value } of sources) {
    const result = schema.safeParse(value);
    if (!result.success) {
      errors.push(...format(`${kind}/${file}`, result.error));
      continue;
    }
    const slug = slugByCode.get(result.data.country);
    if (!slug) {
      errors.push(`${kind}/${file}: country "${result.data.country}" is not a configured country`);
      continue;
    }
    if (file !== `${slug}.json`) {
      errors.push(
        `${kind}/${file}: file name must be "${slug}.json" to match country ${result.data.country}`
      );
    }
    parsed.push({ ...result.data, slug });
  }
  for (const code of new Set(duplicates(parsed.map(entry => entry.country)))) {
    errors.push(`${kind}: more than one file for country "${code}"`);
  }
  return parsed;
}
