"use client";

import React from "react";

type Glow = "cyan" | "purple" | "coral" | "amber";

function glowClass(glow: Glow) {
  switch (glow) {
    case "cyan":
      return "shadow-glowCyan text-neon-cyan";
    case "purple":
      return "shadow-glowPurple text-neon-purple";
    case "coral":
      return "shadow-glowCoral text-neon-coral";
    case "amber":
      return "text-neon-amber";
  }
}

function formatCompactCurrency(value: number) {
  // Simple formatter (no extra libs).
  // 1_800_000_000 -> $1.8B
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export function GlassStatCard(props: {
  title: string;
  value: number;
  subtitle?: string;
  badge?: string; // e.g. "HIGH IMPACT"
  glow?: Glow; // coral for damage, cyan for "normal"
  icon?: React.ReactNode;
}) {
  const { title, value, subtitle, badge, glow = "coral", icon } = props;

  return (
    <div className="glass-panel glass-panel-hover rounded-xl2 p-4 transition-all duration-300 ease-out">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {icon ? (
              <div className="shrink-0 opacity-90">{icon}</div>
            ) : null}

            <p className="text-xs font-semibold tracking-widest text-slate-300 uppercase">
              {title}
            </p>
          </div>

          {badge ? (
            <div className="mt-2 inline-flex items-center rounded-full border border-neon-coral/40 bg-neon-coral/15 px-2 py-0.5">
              <span className="text-[11px] font-bold tracking-[0.18em] text-neon-coral uppercase">
                {badge}
              </span>
            </div>
          ) : null}

          {subtitle ? (
            <p className="mt-2 text-xs text-slate-300">{subtitle}</p>
          ) : null}
        </div>

        {/* Decorative dot */}
        <div className={`h-2.5 w-2.5 rounded-full ${glowClass(glow)}`} />
      </div>

      {/* Hero value */}
      <div className="mt-3">
        <div
          className={`text-3xl font-bold tabular-nums tracking-wide ${glowClass(
            glow
          )}`}
          style={{ textShadow: "0 0 14px rgba(255,59,122,0.55)" }}
        >
          {formatCompactCurrency(value)}
        </div>

        <div className="mt-1 text-xs text-slate-300">
          Estimated total economic impact
        </div>
      </div>

      {/* Optional subtle "trend line" placeholder */}
      <div className="mt-3 h-10 rounded-lg border border-white/5 bg-white/5" />
    </div>
  );
}
