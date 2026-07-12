import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the phone (and other devices on the LAN) to load dev-only resources
  // like the HMR websocket when testing over the local network. Without this,
  // Next.js 16 blocks cross-origin dev requests and the page loads but never
  // hydrates. Dev-only; has no effect on the production build.
  allowedDevOrigins: ["192.168.1.249", "*.192.168.1.249"],
};

export default nextConfig;
