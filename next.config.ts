import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

// Pin the workspace root to this project. Without this, Next can infer a parent
// directory as the root when a stray lockfile exists above the project (e.g. a
// ~/pnpm-lock.yaml), which breaks output file tracing on Vercel.
const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: { root: projectRoot },
};

export default nextConfig;
