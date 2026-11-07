import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: { root: process.cwd() },
  ...(isGitHubPages
    ? { output: "export" as const, basePath: "/RelayOps" }
    : {}),
};

export default nextConfig;
