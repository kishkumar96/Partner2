import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Base path for subdirectory deployment
  basePath: '/partner2',
  
  // Production optimizations
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  productionBrowserSourceMaps: false,
  
  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60,
  },

  // Optimize imports and tree-shaking
  modularizeImports: {
    'lucide-react': {
      transform: 'lucide-react/dist/esm/icons/{{kebabCase member}}',
    },
  },

  // Headers for security and caching
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          }
        ],
      },
      // Cache static assets
      {
        source: '/public/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // Cache data files with shorter TTL
      {
        source: '/:file*.csv',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, stale-while-revalidate=86400',
          },
        ],
      },
      {
        source: '/:file*.geojson',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, stale-while-revalidate=86400',
          },
        ],
      },
    ];
  },

  // Production build settings
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
    reactRemoveProperties: process.env.NODE_ENV === 'production',
  },

  // Performance budgets
  experimental: {
    optimizePackageImports: ['lucide-react', 'chart.js', 'react-chartjs-2'],
    // Disable aggressive preloading for better performance
    optimisticClientCache: false,
  },

  // Output standalone for better production optimization
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,

  // Turbopack configuration (Next.js 16+)
  turbopack: {
    // Turbopack handles code splitting and optimization automatically
    // The webpack config below is kept for backward compatibility
  },

  // Webpack optimizations
  webpack: (config, { dev, isServer }) => {
    // Production optimizations
    if (!dev && !isServer) {
      config.optimization = {
        ...config.optimization,
        moduleIds: 'deterministic',
        runtimeChunk: 'single',
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            default: false,
            vendors: false,
            // Vendor chunk for large libraries
            vendor: {
              name: 'vendor',
              chunks: 'all',
              test: /node_modules/,
              priority: 20,
            },
            // Common chunks
            common: {
              name: 'common',
              minChunks: 2,
              chunks: 'async',
              priority: 10,
              reuseExistingChunk: true,
              enforce: true,
            },
            // Separate chunks for map libraries (they're large)
            maps: {
              name: 'maps',
              test: /[\\/]node_modules[\\/](maplibre-gl|georaster|geotiff)[\\/]/,
              chunks: 'all',
              priority: 30,
            },
            // Separate chunks for chart libraries
            charts: {
              name: 'charts',
              test: /[\\/]node_modules[\\/](chart\.js|react-chartjs-2)[\\/]/,
              chunks: 'all',
              priority: 30,
            },
            // Export libraries - lazy load only when needed (no preload)
            exports: {
              name: 'exports',
              test: /[\\/]node_modules[\\/](exceljs|jspdf|html2canvas|file-saver|dompurify|canvg)[\\/]/,
              chunks: 'async',
              priority: 40,
              enforce: true,
            },
          },
        },
      };
    }

    return config;
  },
};

export default nextConfig;
