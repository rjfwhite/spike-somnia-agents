import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // Add rule to import .md files as raw text (for webpack builds)
    config.module.rules.push({
      test: /\.md$/,
      type: 'asset/source',
    });

    return config;
  },

  // Turbopack configuration for markdown files
  experimental: {
    turbo: {
      loaders: {
        '.md': ['raw-loader'],
      },
    },
  },
};

export default nextConfig;
