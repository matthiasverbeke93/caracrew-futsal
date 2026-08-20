import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Stamped into the bundle so a bug report says WHICH build it came from.
  // Without it "works for me" has no version to hang on.
  define: {
    "import.meta.env.VITE_APP_BUILD": JSON.stringify(new Date().toISOString()),
  },
  test: {
    // utils/ are pure functions — the default node environment is all they need.
    environment: "node",
    // `scripts/` too: the digest's recipient rules decide who gets mailed, so they
    // are covered by unit tests rather than by running the job.
    include: ["src/**/*.test.{js,jsx}", "scripts/**/*.test.mjs"],
  },
});
