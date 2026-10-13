import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  // The dev badge sits over the sidebar footer (answers left, theme toggle). Dev only.
  devIndicators: false,
};

export default nextConfig;
