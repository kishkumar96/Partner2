import type { Metadata, Viewport } from 'next';
import './globals.css';
import ErrorBoundary from '@/components/ErrorBoundary';

// Environment variables
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Climate Risk Dashboard';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0';

// Enhanced metadata for SEO
export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} | Real-Time Climate Risk Assessment`,
    template: `%s | ${APP_NAME}`,
  },
  description:
    'Advanced WebGIS platform for real-time climate risk assessment and disaster impact analysis. Monitor cyclones, assess damages, and analyze regional impacts across the Pacific region.',
  keywords: [
    'climate risk',
    'disaster management',
    'GIS platform',
    'cyclone tracking',
    'impact assessment',
    'risk analysis',
    'climate adaptation',
    'disaster resilience',
    'Pacific region',
    'Vanuatu',
    'hazard mapping',
  ],
  authors: [
    {
      name: 'Climate Risk Analytics Team',
      url: APP_URL,
    },
  ],
  creator: 'Climate Risk Analytics',
  publisher: 'Climate Risk Analytics',
  applicationName: APP_NAME,
  generator: `Next.js ${APP_VERSION}`,

  // Robots and indexing
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },

  // Open Graph metadata for social sharing
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: APP_URL,
    siteName: APP_NAME,
    title: `${APP_NAME} | Real-Time Climate Risk Assessment`,
    description:
      'Advanced WebGIS platform for real-time climate risk assessment and disaster impact analysis.',
    images: [
      {
        url: `${APP_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: `${APP_NAME} Preview`,
      },
    ],
  },

  // Twitter Card metadata
  twitter: {
    card: 'summary_large_image',
    title: `${APP_NAME} | Real-Time Climate Risk Assessment`,
    description:
      'Advanced WebGIS platform for real-time climate risk assessment and disaster impact analysis.',
    images: [`${APP_URL}/og-image.png`],
    creator: '@yourtwitterhandle',
  },

  // Icons and manifest
  icons: {
    icon: [{ url: '/favicon.ico', sizes: 'any' }],
  },
  manifest: `${process.env.NEXT_PUBLIC_BASE_PATH ?? '/partner2'}/manifest.json`,

  // Additional metadata
  category: 'technology',
  classification: 'Climate Risk Assessment Platform',

  // Verification (add your verification codes)
  verification: {
    // google: "your-google-verification-code",
    // yandex: "your-yandex-verification-code",
    // other: {
    //   me: ["your@email.com"],
    // },
  },
};

// Viewport configuration
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Preconnect to external domains for performance */}
        <link rel="preconnect" href="https://basemaps.cartocdn.com" />
        <link rel="dns-prefetch" href="https://basemaps.cartocdn.com" />

        {/* Structured data for search engines */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebApplication',
              name: APP_NAME,
              description:
                'Advanced WebGIS platform for real-time climate risk assessment and disaster impact analysis',
              url: APP_URL,
              applicationCategory: 'BusinessApplication',
              operatingSystem: 'Web Browser',
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'USD',
              },
              featureList: [
                'Real-time cyclone tracking',
                'Impact assessment',
                'Regional risk analysis',
                'Interactive mapping',
                'Data visualization',
              ],
            }),
          }}
        />
      </head>
      <body className="antialiased font-sans min-h-screen bg-atmosphere text-slate-100">
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  );
}
