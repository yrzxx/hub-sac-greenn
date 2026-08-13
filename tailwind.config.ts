import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#222222",
          soft: "#7D7D7D",
          tertiary: "#9A9A9A",
        },
        forest: {
          50: "#EAF5EE",
          100: "#CFE9D8",
          300: "#6FAE8C",
          500: "#2E7D57",
          600: "#1F5E43",
          700: "#184B36",
          900: "#0F2F23",
        },
        sand: {
          bg: "#F7F8F6",
          surface: "#FFFFFF",
          subtle: "#F1F2EF",
          line: "#E8E8E8",
          "line-strong": "#D8D8D8",
        },
        amber: {
          50: "#FDF3E1",
          400: "#F7C766",
          500: "#F5B942",
          600: "#D69C2B",
          700: "#9C7420",
        },
        rust: {
          50: "#FCEAEA",
          500: "#E75A5A",
          600: "#C94848",
          700: "#963636",
        },
        sky: {
          50: "#EAF2FA",
          500: "#3B82C4",
          600: "#2E6CA3",
          700: "#22537E",
        },
        violet: {
          50: "#F1EEF9",
          400: "#A79BD1",
          500: "#8B7FB8",
          600: "#71679C",
          700: "#584F7A",
        },
        success: "#4CAF50",
      },
      fontFamily: {
        display: ["'Inter'", "system-ui", "sans-serif"],
        body: ["'Inter'", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
      fontSize: {
        display: ["2rem", { lineHeight: "1.25", fontWeight: "700" }],
        "card-title": ["1.125rem", { lineHeight: "1.4", fontWeight: "600" }],
        legenda: ["0.8125rem", { lineHeight: "1.4", fontWeight: "400" }],
        "kpi-lg": ["1.875rem", { lineHeight: "1.15", fontWeight: "700" }],
        micro: ["0.75rem", { lineHeight: "1.4", letterSpacing: "0.02em", fontWeight: "500" }],
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.03)",
        soft: "0 4px 18px rgba(0,0,0,0.04)",
        float: "0 12px 32px -8px rgba(0,0,0,0.16)",
      },
      transitionDuration: {
        DEFAULT: "150ms",
      },
    },
  },
  plugins: [],
} satisfies Config;
