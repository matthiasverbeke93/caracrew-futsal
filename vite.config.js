import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // utils/ are pure functions — the default node environment is all they need.
    environment: "node",
    include: ["src/**/*.test.{js,jsx}"],
  },
});
