/** The loss columns an area's Total_Loss is made of in the post-event impact tables */
const LOSS_PARTS = ['Building_Loss', 'Road_Loss', 'Crop_Loss'] as const;

const num = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Areas whose Total_Loss is missing or 0 while their parts are not get the sum of the parts.
 * Cyclone Meena's regional impacts give Rarotonga Total_Loss 0 beside Building_Loss $39.6M, so
 * the map shaded it as no loss while the tables (from the summary file) said $39.8M.
 */
export function withTotalLossFromParts<T extends GeoJSON.FeatureCollection>(collection: T): T {
  let changed = false;
  const features = collection.features.map(feature => {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const parts = LOSS_PARTS.reduce((sum, key) => sum + num(props[key]), 0);
    if (num(props.Total_Loss) > 0 || parts <= 0) return feature;
    changed = true;
    return { ...feature, properties: { ...props, Total_Loss: parts } };
  });
  return changed ? { ...collection, features } : collection;
}
