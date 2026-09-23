import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/profile',
        destination: '/settings?tab=profile',
        permanent: false,
      },
      {
        source: '/preferences',
        destination: '/settings?tab=preferences',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
