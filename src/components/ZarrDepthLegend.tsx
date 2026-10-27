import type { RealWMSLayer } from '@/data/realThreddsLayers';
import { DEPTH_ALPHA, DEPTH_RAMP_MAX_M, depthRgb } from '@/utils/hazardZarr';

/**
 * The legend of a hazard scenario drawn from the Zarr store: the exact colour scale the picture is
 * painted with, 0 to 5 m. Its colours come from `depthRgb`, the function that paints the picture, so
 * the legend cannot drift from the map.
 */

/** Layer opacity set when the picture is added to the map (hazardZarrMapLayer) */
const LAYER_OPACITY = 0.85;
const TICKS = Array.from({ length: DEPTH_RAMP_MAX_M + 1 }, (_, metres) => metres);

/** The scale as a CSS gradient, with the opacity the map really paints it at. */
export function depthScaleGradient(): string {
  const alpha = ((DEPTH_ALPHA / 255) * LAYER_OPACITY).toFixed(3);
  const stops = TICKS.map(metres => {
    const [red, green, blue] = depthRgb(metres);
    return `rgba(${red}, ${green}, ${blue}, ${alpha}) ${(metres / DEPTH_RAMP_MAX_M) * 100}%`;
  });
  // laid over a pale backdrop, as it is over the map
  return `linear-gradient(to right, ${stops.join(', ')}), #e2e8f0`;
}

export default function ZarrDepthLegend({ layer }: { layer: Pick<RealWMSLayer, 'name'> }) {
  return (
    <div className="bg-black/20 rounded-lg p-2" data-testid="zarr-depth-legend">
      <div className="text-xs font-semibold text-slate-200 mb-2">{layer.name}</div>

      <div
        role="img"
        aria-label={`Flood depth colour scale: pale blue at 0 metres, darker blue to 5 metres and deeper`}
        className="h-4 rounded border border-white/10"
        style={{ background: depthScaleGradient() }}
        data-testid="zarr-depth-scale"
      />
      <div className="relative mt-1 h-4 text-xs text-slate-300 font-mono" aria-hidden="true">
        {TICKS.map(metres => {
          const percent = (metres / DEPTH_RAMP_MAX_M) * 100;
          return (
            <span
              key={metres}
              className="absolute top-0"
              style={{ left: `${percent}%`, transform: `translateX(-${percent}%)` }}
            >
              {metres === DEPTH_RAMP_MAX_M ? `${metres}+` : metres}
            </span>
          );
        })}
      </div>
      <p className="text-xs text-slate-400">Flood depth in metres.</p>

      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
        <span
          className="inline-block h-3 w-4 rounded-sm border border-dashed border-slate-500"
          aria-hidden="true"
        />
        No colour: no flooding modelled.
      </p>
      <p className="mt-1 text-xs text-slate-400">Click the map to read the depth at a point.</p>
    </div>
  );
}
