import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // utils/ are pure functions — the default node environment is all they need.
    environment: "node",
    // `scripts/` too: the digest's recipient rules decide who gets mailed, so they
    // are covered by unit tests rather than by running the job.
    include: ["src/**/*.test.{js,jsx}", "scripts/**/*.test.mjs"],
  },
});
