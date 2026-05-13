/** @type {import('next').NextConfig} */
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
const apiHostPattern = apiUrl
  ? (() => {
      try {
        const u = new URL(apiUrl);
        return { protocol: u.protocol.replace(":", ""), hostname: u.hostname };
      } catch {
        return null;
      }
    })()
  : null;

const nextConfig = {
  reactStrictMode: true,
  // Production builds run via `next build` (webpack) — Turbopack is dev-only.
  turbopack: {
    root: import.meta.dirname || process.cwd(),
  },
  // Allow images served from the API host (user uploads, signature logo).
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "raw.githubusercontent.com" },
      ...(apiHostPattern ? [apiHostPattern] : []),
    ],
  },
};

export default nextConfig;
