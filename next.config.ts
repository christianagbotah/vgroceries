import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Allow the sandbox preview proxy to request /_next/* assets without cross-origin warnings.
  allowedDevOrigins: ["preview-chat-d906d6ba-f705-46ad-a8c1-c0d56db34e11.space-z.ai"],
};

export default nextConfig;
