// Source - https://stackoverflow.com/a
// Posted by castelinos
// Retrieved 2026-01-12, License - CC BY-SA 4.0

//custom-image-loader.js

import path from "path";

export default function myImageLoader({ src, width }) {
  // __NEXT_ROUTER_BASEPATH is automatically set by Next.js from next.config.mjs basePath
  const basePath = process.env.__NEXT_ROUTER_BASEPATH || '';
  if (basePath && path.isAbsolute(src)) {
    return `${basePath}${src}?width=${width}`;
  }
  return `${src}?width=${width}`;
}