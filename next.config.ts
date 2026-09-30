import type { NextConfig } from "next";

const DEFAULT_EXTENSIONS = ["tsx", "ts", "jsx", "js"];

/**
 * next/image may load only the public `situs` photo bucket of the configured
 * Supabase project (brief §14.5), nothing else. Optimizing from a private IP
 * is allowed only when that project is the local stack (`supabase start`).
 */
function situsImages(): NonNullable<NextConfig["images"]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return { remotePatterns: [] };
  const origin = new URL(supabaseUrl);
  return {
    remotePatterns: [new URL(`${origin.origin}/storage/v1/object/public/situs/**`)],
    dangerouslyAllowLocalIP: origin.hostname === "127.0.0.1" || origin.hostname === "localhost",
  };
}

const nextConfig: NextConfig = {
  // `page.dev.tsx` routes (dev-only demos) exist under `next dev` only; a
  // production build doesn't see them as pages at all.
  pageExtensions: process.env.NODE_ENV === "production" ? DEFAULT_EXTENSIONS : [...DEFAULT_EXTENSIONS, "dev.tsx"],
  images: situsImages(),
};

export default nextConfig;
