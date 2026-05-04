import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        srgc: {
          rp: "#1d4ed8",
          trap: "#b45309",
          clubhouse: "#15803d",
        },
      },
    },
  },
  plugins: [],
};

export default config;
