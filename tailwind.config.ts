import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/utils/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  // Future CSS flag for optimizations
  future: {
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      fontFamily: {
        // If you already use Geist in Next, this will map to it nicely.
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular"],
      },
      colors: {
        // Use CSS variables so you can theme easily (dark/ light or hazard-based).
        surface: "rgba(30, 40, 60, 0.35)",
        "surface-strong": "rgba(40, 50, 80, 0.45)",
        borderGlow: "rgba(255,255,255,0.08)",

        // Mission Control accents
        neon: {
          cyan: "#00E0FF",
          purple: "#A855F7",
          coral: "#FF3B7A",
          amber: "#FFD60A",
        },

        // Base background tones
        space: {
          950: "#070A12",
          900: "#0B1220",
          850: "#0F172A",
          800: "#111827",
        },
      },
      boxShadow: {
        // Glass depth
        glass: "0 8px 32px rgba(0,0,0,0.40), inset 0 0 0 0.5px rgba(255,255,255,0.06)",
        glassHover: "0 18px 45px rgba(0,0,0,0.55), inset 0 0 0 0.5px rgba(255,255,255,0.08)",

        // Neon glows (use sparingly)
        glowCyan: "0 0 18px rgba(0,224,255,0.35)",
        glowPurple: "0 0 18px rgba(168,85,247,0.35)",
        glowCoral: "0 0 18px rgba(255,59,122,0.35)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
      keyframes: {
        // Gentle "UI appears" animation
        fadeSlide: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0px)" },
        },
        // For hazard marker pulses
        pulseRing: {
          "0%": { transform: "scale(0.75)", opacity: "0.65" },
          "70%": { transform: "scale(1.9)", opacity: "0" },
          "100%": { opacity: "0" },
        },
      },
      animation: {
        fadeSlide: "fadeSlide 260ms ease-out",
        pulseRing: "pulseRing 2s ease-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
