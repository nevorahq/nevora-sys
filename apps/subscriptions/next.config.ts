import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  transpilePackages: [
    "@nevora/subscriptions-api",
    "@nevora/subscriptions-contracts",
    "@nevora/subscriptions-runtime",
    "@nevora/tasks-api",
    "@nevora/tasks-contracts",
  ],
};

export default nextConfig;
