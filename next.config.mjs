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
      {
        source: "/check-ins",
        destination: "/api/v1/check-ins",
      },
      {
        source: "/today",
        has: [
          {
            type: "header",
            key: "accept",
            value: "(.*application/json.*)",
          },
        ],
        destination: "/api/v1/today",
      },
    ];
  },
};

export default nextConfig;
