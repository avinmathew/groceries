/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/groceries',
  images:{
      loader:"custom",
      loaderFile:"/lib/custom-image-loader.js",
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  async headers() {
    return [
      {
        source: '/groceries/sw.js',
        headers: [
          {
            key: 'Service-Worker-Allowed',
            value: '/groceries/',
          },
        ],
      },
      {
        source: '/groceries/manifest.json',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/manifest+json',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
