import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const isRenderStatic = process.env.RENDER_STATIC === "true";
const isStaticExport = isGitHubPages || isRenderStatic;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: { root: process.cwd() },
  ...(isStaticExport ? { output: "export" as const } : {}),
  ...(isGitHubPages ? { basePath: "/RelayOps" } : {}),
};

export default nextConfig;
