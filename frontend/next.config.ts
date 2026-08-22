import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  cacheComponents: true,
  experimental: {
    proxyClientMaxBodySize: "25mb",
  },
  turbopack: {
    root: path.join(__dirname),
  },
  async rewrites() {
    const api = process.env.API_PROXY_ORIGIN ?? "http://localhost:3001";
    return [
      { source: "/api/:path*", destination: `${api}/api/:path*` },
      { source: "/socket.io/:path*", destination: `${api}/socket.io/:path*` },
    ];
  },
};

export default nextConfig;
