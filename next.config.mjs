/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No `rewrites` to any backend. PairPath's frontend proxied /api/* straight
  // to http://localhost:3001, hardcoded in this file with no env var, which
  // meant the deployed build pointed at the developer's laptop. Backend calls
  // go through app/api/bff/, server-side, where the URL comes from the
  // environment and the token is attached out of reach of the browser.
  eslint: { ignoreDuringBuilds: true },

  // A dev server and a production build share `.next` by default, and running
  // both at once leaves the build half-overwritten - `next start` then dies on
  // "Cannot find module ./638.js" from a webpack runtime pointing at chunks
  // the dev server has since replaced. Setting NEXT_DIST_DIR gives a build its
  // own directory so it can be checked without stopping the dev server.
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default nextConfig;
