/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [
      {
        source: "/goals/:id/plan/generate",
        destination: "/api/v1/goals/:id/plan/generate",
      },
      {
        source: "/plan/adapt",
        destination: "/api/v1/plan/adapt",
      },
      {
        source: "/plan/reschedule",
        destination: "/api/v1/plan/reschedule",
      },
    ];
  },
};

export default nextConfig;
