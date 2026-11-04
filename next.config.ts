import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  outputFileTracingIncludes: {
    '/api/papers/*': ['./docs/*.pdf'],
  },
  async rewrites() {
    return [
      { source: '/demonstrator', destination: '/nats/index.html' },
      { source: '/loop_demo', destination: '/nats/index.html' },
    ];
  },
};

export default nextConfig;
