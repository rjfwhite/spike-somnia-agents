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

  experimental: {
    turbo: {
      rules: {
        // Add rule to import .md files as raw text (for Turbopack builds)
        '*.md': {
          loaders: ['raw-loader'],
          as: '*.js',
        },
      },
    },
  },

  // Turbopack-specific configuration
  turbopack: {
    rules: {
      '*.md': {
        loaders: ['raw-loader'],
        as: '*.js',
      },
    },
  },
};

export default nextConfig;
