import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. A stray ~/package-lock.json otherwise
  // makes Next infer the home dir as the root (multiple-lockfiles warning).
  turbopack: {
    root: import.meta.dirname,
  },
  // pdfjs runs in Node in our parse route; don't bundle it.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
