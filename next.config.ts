import type { NextConfig } from "next";

const DEFAULT_EXTENSIONS = ["tsx", "ts", "jsx", "js"];

const nextConfig: NextConfig = {
  // `page.dev.tsx` routes (dev-only demos) exist under `next dev` only; a
  // production build doesn't see them as pages at all.
  pageExtensions: process.env.NODE_ENV === "production" ? DEFAULT_EXTENSIONS : [...DEFAULT_EXTENSIONS, "dev.tsx"],
};

export default nextConfig;
