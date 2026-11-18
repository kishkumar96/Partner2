import { existsSync, readFileSync } from 'fs';
import path from 'path';

const publicDir = path.join(process.cwd(), 'public');
const manifest = JSON.parse(readFileSync(path.join(publicDir, 'manifest.json'), 'utf8'));

/** Width and height from a PNG's header, so the declared icon sizes are checked against the files */
function pngSize(file: string): [number, number] {
  const bytes = readFileSync(file);
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

describe('web app manifest', () => {
  it('names the product as the app does, not a former name', () => {
    expect(manifest.name).toBe('Tropical Cyclone Rapid Impact Assessment Tool');
    expect(JSON.stringify(manifest)).not.toMatch(/Resilience Atlas/i);
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
  });

  it('opens where the app is mounted, whatever the base path', () => {
    // Relative to the manifest, so /partner2/manifest.json starts at /partner2/ and dev at /
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
    expect(manifest.display).toBe('standalone');
  });

  it('has 192 and 512 px icons and a maskable one, each the size it says', () => {
    const icons = manifest.icons as Array<{
      src: string;
      sizes: string;
      type: string;
      purpose: string;
    }>;
    expect(icons.filter(i => i.purpose === 'maskable')).toHaveLength(1);
    for (const sizes of ['192x192', '512x512']) {
      expect(icons.some(i => i.sizes === sizes && i.purpose === 'any')).toBe(true);
    }
    for (const icon of icons) {
      const file = path.join(publicDir, icon.src);
      expect(existsSync(file)).toBe(true);
      expect(icon.type).toBe('image/png');
      const [w, h] = pngSize(file);
      expect(`${w}x${h}`).toBe(icon.sizes);
    }
  });

  it('uses the dark theme of the dashboard for the splash and the status bar', () => {
    expect(manifest.background_color).toBe('#0f172a');
    expect(manifest.theme_color).toBe('#0f172a');
  });
});
