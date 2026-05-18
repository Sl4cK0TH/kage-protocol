import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0a0d10",
        obsidian: "#0f1318",
        slate: "#1a222b",
        neon: "#62f7c6",
        electric: "#4cc9ff",
        ember: "#ff5d5d"
      },
      boxShadow: {
        glow: "0 0 20px rgba(98, 247, 198, 0.2)",
        glowStrong: "0 0 40px rgba(76, 201, 255, 0.25)"
      },
      backgroundImage: {
        "grid-faint": "linear-gradient(rgba(98, 247, 198, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(98, 247, 198, 0.08) 1px, transparent 1px)",
        "hero-radial": "radial-gradient(circle at top left, rgba(76, 201, 255, 0.2), transparent 60%)"
      },
      fontFamily: {
        sans: ["var(--font-space)", "ui-sans-serif", "system-ui"],
        display: ["var(--font-rajdhani)", "ui-sans-serif", "system-ui"]
      }
    }
  },
  plugins: []
};

export default config;
