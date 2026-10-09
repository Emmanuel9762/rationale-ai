import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the Node HTTP transport native (including its IPv4 dispatcher).
  serverExternalPackages: ["undici"],
  reactCompiler: true,
};

export default nextConfig;
