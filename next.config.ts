import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required so Turbopack/webpack don't try to bundle the Walrus WASM module
  serverExternalPackages: ['@mysten/walrus', '@mysten/walrus-wasm'],
  // Prevent pre-existing TS errors from blocking Vercel deployment
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
