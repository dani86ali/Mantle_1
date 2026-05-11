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
          primary: "#FFFFFF",
          card: "#F8F9FC",
          elevated: "#F0F2F7",
        },
        border: {
          DEFAULT: "#E2E4EB",
          hover: "#C8CCd6",
        },
        accent: {
          DEFAULT: "#01BFFD",
          hover: "#01D0FE",
          muted: "rgba(1, 191, 253, 0.1)",
        },
        blue: {
          DEFAULT: "#2980F9",
          muted: "rgba(41, 128, 249, 0.1)",
        },
        destructive: {
          DEFAULT: "#ef4444",
          muted: "rgba(239, 68, 68, 0.06)",
        },
        warning: {
          DEFAULT: "#f59e0b",
          muted: "rgba(245, 158, 11, 0.06)",
        },
        success: {
          DEFAULT: "#10b981",
          muted: "rgba(16, 185, 129, 0.06)",
        },
        text: {
          primary: "#1A1A2E",
          secondary: "#5A5A7A",
          tertiary: "#9A9AB0",
        },
        brand: {
          primary: "#01BFFD",
          secondary: "#7509FD",
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
