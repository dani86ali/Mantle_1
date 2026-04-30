import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "#0a0a0f",
          card: "#141419",
          elevated: "#1a1a22",
        },
        border: {
          DEFAULT: "#1e1e2a",
          hover: "#2a2a3a",
        },
        accent: {
          DEFAULT: "#00d4aa",
          hover: "#00e6b8",
          muted: "rgba(0, 212, 170, 0.1)",
        },
        blue: {
          DEFAULT: "#3b82f6",
          muted: "rgba(59, 130, 246, 0.1)",
        },
        destructive: {
          DEFAULT: "#ef4444",
          muted: "rgba(239, 68, 68, 0.1)",
        },
        warning: {
          DEFAULT: "#f59e0b",
          muted: "rgba(245, 158, 11, 0.1)",
        },
        success: {
          DEFAULT: "#10b981",
          muted: "rgba(16, 185, 129, 0.1)",
        },
        text: {
          primary: "#f0f0f5",
          secondary: "#8888a0",
          tertiary: "#55556a",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      borderRadius: {
        card: "8px",
        button: "6px",
        input: "4px",
      },
    },
  },
  plugins: [],
};

export default config;
