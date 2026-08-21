import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  transpilePackages: ["@nevora/tasks-api", "@nevora/tasks-contracts", "@nevora/tasks-runtime"],
};

export default nextConfig;
