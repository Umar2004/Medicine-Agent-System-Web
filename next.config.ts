import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for Docker deployment — produces a minimal Node.js server
  output: "standalone",
  // Puppeteer launches a real Chrome; keep it out of the server bundle.
  serverExternalPackages: ["puppeteer", "exceljs"],
};

export default nextConfig;
