/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.1.69", "float-departed-symphony.ngrok-free.dev"],
  distDir: process.env.PHYSIQUEOS_BUILD_DIST_DIR || ".next",
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
