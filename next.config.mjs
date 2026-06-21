/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "api.dicebear.com" }
    ]
  },
  async rewrites() {
    return [
      {
        source: "/dashboard/master-admin/:path*",
        destination: "/dashboard/admin/:path*",
      },
      {
        source: "/dashboard/sub-admin/:path*",
        destination: "/dashboard/admin/:path*",
      },
    ];
  },
};

export default nextConfig;
