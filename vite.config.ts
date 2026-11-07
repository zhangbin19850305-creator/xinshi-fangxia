import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const pagesBase = "/xinshi-fangxia/";

export default defineConfig({
  plugins: [react()],
  appType: "spa",
  base: process.env.GITHUB_PAGES === "true" ? pagesBase : "/",
});
