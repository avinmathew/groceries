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
};

export default nextConfig;
