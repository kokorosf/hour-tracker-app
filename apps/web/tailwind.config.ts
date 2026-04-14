import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        barlow: ["'Barlow Condensed'", 'sans-serif'],
      },
    }
  },
  plugins: []
};

export default config;
