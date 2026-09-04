/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No `rewrites` to any backend. PairPath's frontend proxied /api/* straight
  // to http://localhost:3001, hardcoded in this file with no env var, which
  // meant the deployed build pointed at the developer's laptop. Backend calls
  // go through app/api/bff/, server-side, where the URL comes from the
  // environment and the token is attached out of reach of the browser.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
