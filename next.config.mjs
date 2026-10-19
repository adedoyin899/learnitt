/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async redirects() {
    return [
      {
        source: "/",
        destination: "/today",
        permanent: false,
      },
    ];
  },
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
      {
        source: "/reminders",
        destination: "/api/v1/reminders",
      },
      {
        source: "/cron/reminders",
        destination: "/api/v1/cron/reminders",
      },
      {
        source: "/push/subscribe",
        destination: "/api/v1/push/subscribe",
      },
      {
        source: "/check-ins/weekly",
        destination: "/api/v1/check-ins/weekly",
      },
      {
        source: "/export",
        destination: "/api/v1/export",
      },
      {
        source: "/account",
        destination: "/api/v1/account",
      },
      {
        source: "/cron/retention",
        destination: "/api/v1/cron/retention",
      },
      {
        source: "/metrics",
        has: [
          {
            type: "header",
            key: "accept",
            value: "(.*application/json.*)",
          },
        ],
        destination: "/api/v1/metrics",
      },
    ];
  },
};

export default nextConfig;
