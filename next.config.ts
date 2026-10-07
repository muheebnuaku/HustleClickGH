import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // "My Surveys" (user-created surveys) was retired — old links land on the dashboard.
  async redirects() {
    return [
      { source: "/my-surveys", destination: "/dashboard", permanent: false },
      { source: "/my-surveys/:path*", destination: "/dashboard", permanent: false },
    ];
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
        pathname: '/**',
      },
      {
        // Supabase Storage public objects
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
