import type { Config } from "tailwindcss";

const withOpacity = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        lexos: {
          ink: withOpacity("--lexos-ink"),
          navy: withOpacity("--lexos-navy"),
          panel: withOpacity("--lexos-panel"),
          card: withOpacity("--lexos-card"),
          line: withOpacity("--lexos-line"),
          cyan: withOpacity("--lexos-cyan"),
          gold: withOpacity("--lexos-gold"),
          goldSoft: withOpacity("--lexos-gold-soft"),
          silver: withOpacity("--lexos-silver"),
          muted: withOpacity("--lexos-muted"),
          green: withOpacity("--lexos-green"),
          wine: withOpacity("--lexos-wine"),
          red: withOpacity("--lexos-red"),
        },
      },
      boxShadow: {
        premium: "var(--lexos-shadow-premium)",
        glow: "var(--lexos-shadow-glow)",
      },
      fontFamily: {
        sans: ["Manrope", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["DM Mono", "SFMono-Regular", "Consolas", "monospace"],
        serif: ["Newsreader", "Georgia", "serif"],
      },
      backgroundImage: {
        "premium-radial": "var(--lexos-premium-radial)",
      },
    },
  },
  plugins: [],
};

export default config;
