import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. A stray ~/package-lock.json otherwise
  // makes Next infer the home dir as the root. process.cwd() is the project root when
  // run via `pnpm dev` (and is reliable, unlike import.meta.dirname in the compiled config).
  turbopack: {
    root: process.cwd(),
  },
  // pdfjs runs in Node in our parse route; don't bundle it.
  serverExternalPackages: ["pdfjs-dist"],
  // hide the dev-tools overlay (intercepts clicks near the corner; clutters screenshots)
  devIndicators: false,
};

export default nextConfig;
