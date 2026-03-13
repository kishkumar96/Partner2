/**
 * Wind-glow canvas renderer – Web Worker
 *
 * Owns an internal OffscreenCanvas. The main thread posts per-frame coordinate
 * data (cyclone screen position + radius, computed via map.project()); this
 * worker runs particle physics, draws everything to the OffscreenCanvas, then
 * posts an ImageBitmap back so the main thread can blit it onto the visible DOM
 * canvas with a single ctx.drawImage() call (a GPU memcpy – effectively free).
 *
 * Main-thread workload per frame (worker path):
 *   • map.project() × 2   (< 0.1 ms)
 *   • postMessage() payload ~200 bytes
 *   • ctx.drawImage(bitmap) on message receipt – GPU blit, no CPU budget
 *
 * The worker handles:
 *   • All particle physics (spawn, velocity integration, lifecycle)
 *   • All Canvas2D draw calls (gradients, arcs, rain-bands, story-beat overlays)
 *   • Balanced-quality throttle (30 Hz physics at 60 Hz render)
 */

import {
  CATEGORY_COLORS,
  initWindParticles,
  updateWindParticles,
  type WindParticle,
} from '../utils/windGlowParticles';

// ── Shared types ──────────────────────────────────────────────────────────────

export interface WindGlowQuality {
  maxParticles: number;
  spawnRate: number;
  glowRings: number;
  trailLength: number;
  glowOpacity: number[];
  stormEye: boolean;
  rainBands: number;
  windShear: boolean;
  noiseDetail: number;
}

export interface WindGlowBeatInfo {
  type: string;
  startTime: number;
  storyModeEnabled: boolean;
}

export type WindGlowToWorker =
  | { type: 'init'; width: number; height: number }
  | { type: 'reset' }
  | {
      type: 'frame';
      seq: number;
      cycloneX: number;
      cycloneY: number;
      radiusPixels: number;
      category: number;
      meanWind: number;
      quality: WindGlowQuality;
      beatInfo: WindGlowBeatInfo | null;
      width: number;
      height: number;
      translateDx: number;
      translateDy: number;
      runPhysics: boolean;
    };

// ── Module state ──────────────────────────────────────────────────────────────

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let particles: WindParticle[] = [];
let phase = 0;
let physicsTick = 0;

// ── Draw ──────────────────────────────────────────────────────────────────────
// Mirrors drawWindGlow() in CycloneAnimationLayer without any map.project() calls.

function drawFrame(
  cycloneX: number,
  cycloneY: number,
  radiusPx: number,
  category: number,
  meanWind: number,
  quality: WindGlowQuality,
  beatInfo: WindGlowBeatInfo | null
): void {
  if (!ctx || !canvas) return;
  const { width, height } = canvas;

  if (cycloneX < -200 || cycloneX > width + 200 || cycloneY < -200 || cycloneY > height + 200) {
    ctx.clearRect(0, 0, width, height);
    return;
  }

  ctx.clearRect(0, 0, width, height);

  const colorInfo = CATEGORY_COLORS[category] ?? CATEGORY_COLORS[0];
  const color = colorInfo.rgba;
  const pc = colorInfo.rgb;

  // ── Glow rings ──────────────────────────────────────────────────────────────
  for (let ring = 0; ring < quality.glowRings; ring++) {
    const rr = radiusPx * (0.85 + ring * 0.55);
    const inner = rr * 0.18;
    const g = ctx.createRadialGradient(cycloneX, cycloneY, inner, cycloneX, cycloneY, rr);
    const base = quality.glowOpacity[ring] ?? 0.08;
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.28, color.replace(/[\d.]+\)$/, `${base})`));
    g.addColorStop(0.55, color.replace(/[\d.]+\)$/, `${base * 0.45})`));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(cycloneX, cycloneY);
    ctx.rotate(phase + (ring * Math.PI) / 3);
    ctx.translate(-cycloneX, -cycloneY);
    ctx.beginPath();
    ctx.arc(cycloneX, cycloneY, rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── Rain bands ──────────────────────────────────────────────────────────────
  if (quality.rainBands > 0 && category >= 1) {
    for (let band = 0; band < quality.rainBands; band++) {
      const br = radiusPx * (0.3 + band * 0.25);
      const ao = (band * Math.PI * 2) / quality.rainBands + phase * 0.003;
      ctx.save();
      ctx.globalAlpha = 0.15 - band * 0.02;
      ctx.strokeStyle = color.replace(/[\d.]+\)$/, '0.4)');
      ctx.lineWidth = Math.max(1, radiusPx * 0.022);
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 1.5; a += 0.1) {
        const sr = br * (1 + a * 0.15);
        const x = cycloneX + Math.cos(a + ao) * sr;
        const y = cycloneY + Math.sin(a + ao) * sr;
        if (a === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── Storm eye ───────────────────────────────────────────────────────────────
  if (quality.stormEye && category >= 2) {
    const er = radiusPx * 0.12;
    const eg = ctx.createRadialGradient(cycloneX, cycloneY, 0, cycloneX, cycloneY, er);
    eg.addColorStop(0, 'rgba(0,0,0,0.85)');
    eg.addColorStop(0.7, 'rgba(20,20,30,0.7)');
    eg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(cycloneX, cycloneY, er, 0, Math.PI * 2);
    ctx.fill();
    // shimmer
    const shimmer = phase * 2;
    ctx.save();
    ctx.globalAlpha = 0.15 + Math.sin(shimmer) * 0.08;
    ctx.strokeStyle = 'rgba(200,220,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = -shimmer * 5;
    ctx.beginPath();
    ctx.arc(cycloneX, cycloneY, er * 0.95, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // ── Story beat overlays ─────────────────────────────────────────────────────
  if (beatInfo?.storyModeEnabled) {
    const elapsed = Date.now() - beatInfo.startTime;
    const prog = Math.min(elapsed / 2500, 1);
    const intens = Math.sin(prog * Math.PI);

    if (['peak-intensity', 'rapid-intensification', 'category-upgrade'].includes(beatInfo.type)) {
      const fp = (elapsed % 400) / 400;
      if (fp < 0.15) {
        ctx.save();
        ctx.globalAlpha = (0.15 - fp) * intens * 0.4;
        const fg = ctx.createRadialGradient(
          cycloneX,
          cycloneY,
          0,
          cycloneX,
          cycloneY,
          radiusPx * 2
        );
        fg.addColorStop(0, 'rgba(255,255,200,0.6)');
        fg.addColorStop(0.5, 'rgba(255,255,150,0.2)');
        fg.addColorStop(1, 'rgba(255,255,100,0)');
        ctx.fillStyle = fg;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }
    }

    if (beatInfo.type === 'closest-approach') {
      ctx.save();
      ctx.globalAlpha = intens * 0.3;
      ctx.strokeStyle = 'rgba(255,80,80,0.8)';
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 5]);
      ctx.beginPath();
      ctx.arc(cycloneX, cycloneY, radiusPx * (1 + prog * 0.5), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── Particles ───────────────────────────────────────────────────────────────
  for (const p of particles) {
    const opacity = Math.min(p.opacity * 0.55, 0.45);
    ctx.save();
    ctx.globalAlpha = opacity;
    if (quality.windShear) {
      ctx.shadowBlur = 3;
      ctx.shadowColor = `rgba(${pc[0]},${pc[1]},${pc[2]},0.4)`;
    }
    ctx.strokeStyle = `rgba(${pc[0]},${pc[1]},${pc[2]},1)`;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - p.vx * quality.trailLength, p.y - p.vy * quality.trailLength);
    ctx.stroke();

    if (quality.windShear && p.opacity > 0.5) {
      const perp = Math.atan2(p.vy, p.vx) + Math.PI / 2;
      const so = 4;
      const tlFac = quality.trailLength * 0.7;
      ctx.save();
      ctx.globalAlpha = opacity * 0.25;
      ctx.strokeStyle = `rgba(${pc[0]},${pc[1]},${pc[2]},0.4)`;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      for (const sign of [1, -1] as const) {
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(perp) * so * sign, p.y + Math.sin(perp) * so * sign);
        ctx.lineTo(
          p.x - p.vx * tlFac + Math.cos(perp) * so * sign,
          p.y - p.vy * tlFac + Math.sin(perp) * so * sign
        );
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.shadowBlur = 0;
    ctx.fillStyle = `rgba(255,255,255,${opacity * 0.5})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ── Message handler ───────────────────────────────────────────────────────────

self.onmessage = (event: MessageEvent<WindGlowToWorker>): void => {
  const msg = event.data;

  switch (msg.type) {
    case 'init': {
      canvas = new OffscreenCanvas(Math.max(1, msg.width), Math.max(1, msg.height));
      ctx = canvas.getContext('2d');
      particles = [];
      phase = 0;
      physicsTick = 0;
      break;
    }

    case 'reset': {
      particles = [];
      physicsTick = 0;
      if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
      break;
    }

    case 'frame': {
      if (!ctx || !canvas) return;

      // Resize internal canvas when the map container changes
      const needsResize = canvas.width !== msg.width || canvas.height !== msg.height;
      if (needsResize) {
        canvas.width = Math.max(1, msg.width);
        canvas.height = Math.max(1, msg.height);
      }

      // Translate existing particles to compensate for map pan/zoom
      if (msg.translateDx !== 0 || msg.translateDy !== 0) {
        for (const p of particles) {
          p.x += msg.translateDx;
          p.y += msg.translateDy;
        }
      }

      if (msg.runPhysics) {
        physicsTick++;
        // Throttle physics to ~30 Hz on balanced quality (maxParticles ≤ 500).
        // The canvas still receives a freshly composed bitmap every vsync (60 Hz)
        // so motion appears smooth — only the velocity recalculation is halved.
        const isBalanced = msg.quality.maxParticles <= 500;
        if (!isBalanced || physicsTick % 2 === 0) {
          if (particles.length < msg.quality.maxParticles) {
            particles = initWindParticles(
              particles,
              msg.quality.spawnRate,
              msg.cycloneX,
              msg.cycloneY,
              msg.radiusPixels,
              msg.quality.maxParticles
            );
          }
          updateWindParticles(
            particles,
            msg.cycloneX,
            msg.cycloneY,
            msg.radiusPixels,
            msg.meanWind,
            msg.quality.noiseDetail,
            phase
          );
        }
        phase += 0.005;
      }

      drawFrame(
        msg.cycloneX,
        msg.cycloneY,
        msg.radiusPixels,
        msg.category,
        msg.meanWind,
        msg.quality,
        msg.beatInfo
      );

      // Zero-copy GPU transfer — the bitmap is a Transferable; the existing
      // OffscreenCanvas backbuffer is released and cleared ready for next frame.
      const bitmap = canvas.transferToImageBitmap();
      (self as unknown as Worker).postMessage({ type: 'bitmap', bitmap, seq: msg.seq }, [
        bitmap as unknown as Transferable,
      ]);
      break;
    }
  }
};
