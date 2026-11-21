import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Puppeteer launches a real Chrome; keep it out of the server bundle.
  serverExternalPackages: ["puppeteer", "exceljs"],
};

export default nextConfig;
