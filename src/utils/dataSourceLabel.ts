export type DataSource = 'partner_api' | 'local_files';

/**
 * The "Source" line is built from the first load pass. The risk tables arrive in a later,
 * background pass, so a first pass that found none must not leave "Local Files" on screen
 * once the API has supplied them.
 */
export function withRiskSource(label: string, source: DataSource): string {
  const text = source === 'partner_api' ? 'Partner API' : 'Local Files';
  return label.includes('Risk: ')
    ? label.replace(/Risk: [^|]*?(?=\s*\||$)/, `Risk: ${text}`)
    : label;
}
