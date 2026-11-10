export interface WindParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  opacity: number;
}

export const CATEGORY_COLORS: Record<number, { rgba: string; rgb: [number, number, number] }> = {
  5: { rgba: 'rgba(192, 132, 252, 0.42)', rgb: [192, 132, 252] },
  4: { rgba: 'rgba(248, 113, 113, 0.38)', rgb: [248, 113, 113] },
  3: { rgba: 'rgba(251, 146,  60, 0.34)', rgb: [251, 146, 60] },
  2: { rgba: 'rgba(250, 204,  21, 0.30)', rgb: [250, 204, 21] },
  1: { rgba: 'rgba(253, 224,  71, 0.26)', rgb: [253, 224, 71] },
  0: { rgba: 'rgba(125, 211, 252, 0.24)', rgb: [125, 211, 252] },
};

export function noise2D(x: number, y: number, seed: number = 0): number {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  x -= Math.floor(x);
  y -= Math.floor(y);
  const u = x * x * x * (x * (x * 6 - 15) + 10);
  const v = y * y * y * (y * (y * 6 - 15) + 10);
  const hash = (i: number, j: number) => {
    const h = (i * 374761393 + j * 668265263 + seed) & 0x7fffffff;
    return ((h ^ (h >> 13)) * 1274126177) & 0x7fffffff;
  };
  const a = hash(X, Y) / 0x7fffffff;
  const b = hash(X + 1, Y) / 0x7fffffff;
  const c = hash(X, Y + 1) / 0x7fffffff;
  const d = hash(X + 1, Y + 1) / 0x7fffffff;
  return a + u * (b - a) + v * (c + u * (d - c) - (a + u * (b - a)));
}

export function initWindParticles(
  particles: WindParticle[],
  count: number,
  cycloneX: number,
  cycloneY: number,
  radiusPx: number,
  maxParticles: number
): WindParticle[] {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * radiusPx;
    particles.push({
      x: cycloneX + Math.cos(angle) * dist,
      y: cycloneY + Math.sin(angle) * dist,
      vx: 0,
      vy: 0,
      life: Math.random() * 100,
      maxLife: 100 + Math.random() * 50,
      opacity: 1,
    });
  }

  if (particles.length <= maxParticles) {
    return particles;
  }

  return particles.slice(-maxParticles);
}

export function updateWindParticles(
  particles: WindParticle[],
  cycloneX: number,
  cycloneY: number,
  radiusPx: number,
  meanWind: number,
  noiseDetail: number,
  phase: number
): void {
  let w = 0;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.life++;
    if (p.life > p.maxLife) continue;

    const dx = p.x - cycloneX;
    const dy = p.y - cycloneY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > radiusPx * 1.5) continue;

    const angle = Math.atan2(dy, dx);
    const swirlAngle = angle + Math.PI / 2;
    const swirlSpeed = (meanWind / 100) * 2;
    const ns = 0.02;
    const nx = noise2D(p.x * ns, p.y * ns, phase) - 0.5;
    const ny = noise2D(p.x * ns + 100, p.y * ns + 100, phase) - 0.5;
    const radial = Math.sin(p.life * 0.1) * 0.5;

    p.vx = Math.cos(swirlAngle) * swirlSpeed + Math.cos(angle) * radial + nx * noiseDetail * 0.3;
    p.vy = Math.sin(swirlAngle) * swirlSpeed + Math.sin(angle) * radial + ny * noiseDetail * 0.3;
    p.x += p.vx;
    p.y += p.vy;
    p.opacity = Math.min(1, (p.maxLife - p.life) / 20);

    if (w !== i) particles[w] = p;
    w++;
  }
  particles.length = w;
}
