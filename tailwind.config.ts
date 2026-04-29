import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Per-tenant theming via CSS variables
        brand: {
          primary: "var(--brand-primary, #0d6efd)",
          secondary: "var(--brand-secondary, #6c757d)",
          accent: "var(--brand-accent, #198754)",
        },
      },
    },
  },
  plugins: [],
};

export default config;
