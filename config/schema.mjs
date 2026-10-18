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
  .regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, 'must be lower-case words joined by hyphens, e.g. "cook-islands"');

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
        center: z.tuple([
          z.number().min(-180).max(180),
          z.number().min(-90).max(90),
        ]),
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
 * @param {{ release: unknown, countries: Array<{ file: string, value: unknown }> }} sources
 * @returns {{ ok: true, release: z.infer<typeof releaseSchema>, countries: Array<z.infer<typeof countrySchema>> }
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
        errors.push(`alias "${alias}" is claimed by both ${aliasOwners.get(alias)} and ${country.code}`);
      }
      aliasOwners.set(alias, country.code);
    }
  }

  if (release.success) {
    const slugs = new Set(countries.map(c => c.slug));
    for (const listed of release.data.countries) {
      if (!slugs.has(listed)) errors.push(`release.json: lists "${listed}" but config/countries/${listed}.json is missing or invalid`);
    }
    for (const value of new Set(duplicates(release.data.countries))) {
      errors.push(`release.json: "${value}" is listed twice`);
    }
    for (const country of countries) {
      if (!release.data.countries.includes(country.slug)) {
        errors.push(`${country.slug}.json: not listed in release.json "countries", so it would be silently ignored`);
      }
    }
    if (!countries.some(c => c.code === release.data.defaultCountry)) {
      errors.push(`release.json: defaultCountry "${release.data.defaultCountry}" is not a configured country`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const order = release.data.countries;
  return {
    ok: true,
    release: release.data,
    countries: [...countries].sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug)),
  };
}
