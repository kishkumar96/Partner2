export const BASEMAP_STYLES = {
  positron: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  voyager: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
} as const;

export const DEFAULT_BASEMAP_STYLE = BASEMAP_STYLES.positron;

const SUPPORTED_BASEMAP_STYLES: ReadonlySet<string> = new Set(Object.values(BASEMAP_STYLES));

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function isSupportedBasemapStyle(style: string): boolean {
  return SUPPORTED_BASEMAP_STYLES.has(style);
}

export function normalizeBasemapStyle(style?: string | null): string {
  if (!style) return DEFAULT_BASEMAP_STYLE;

  const candidate = safeDecodeURIComponent(style.trim());

  if (candidate in BASEMAP_STYLES) {
    return BASEMAP_STYLES[candidate as keyof typeof BASEMAP_STYLES];
  }

  return isSupportedBasemapStyle(candidate) ? candidate : DEFAULT_BASEMAP_STYLE;
}
