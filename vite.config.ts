import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        filename: 'pwa-sw-v2.js',
        includeAssets: [
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
          'assets/aistudio/file_000000005860821188dbaf696e0dbfa6_1a485403.png',
          'assets/aistudio/kano-drama-og.png',
        ],
        manifest: {
          id: '/',
          name: 'KanoDrama',
          short_name: 'KanoDrama',
          description:
            'Multi-provider Chinese & Vertical Short Drama streaming platform across DramaBox, Melolo, NetShort & 49+ providers.',
          theme_color: '#090706',
          background_color: '#090706',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: '/assets/aistudio/file_000000005860821188dbaf696e0dbfa6_1a485403.png',
              sizes: '1024x1024',
              type: 'image/png',
              purpose: 'any',
            },
          ],
        },
        workbox: {
          cacheId: 'kano-drama-pwa-v3',
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          globIgnores: ['**/sw.js', '**/pwa-sw-*.js', '**/*.backup.png'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /\/api\/home(?:\?.*)?$/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'home-catalog-api-cache',
                networkTimeoutSeconds: 4,
                expiration: {
                  maxEntries: 12,
                  maxAgeSeconds: 60 * 60 * 24,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /\/api\/mola\/.*(?:detail|allepisode|episode|foryou|ranking|trending|new|terbaru|rank)/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'episodes-catalog-api-cache',
                networkTimeoutSeconds: 5,
                expiration: {
                  maxEntries: 80,
                  maxAgeSeconds: 60 * 60 * 24 * 3,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /\.(?:jpg|jpeg|png|webp|gif)$/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'poster-images-cache',
                expiration: {
                  maxEntries: 180,
                  maxAgeSeconds: 60 * 60 * 24 * 7,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    build: {
      minify: true,
      cssMinify: true,
      sourcemap: false,
      reportCompressedSize: true,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'react-vendor',
                test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
                priority: 30,
              },
              {
                name: 'hls-vendor',
                test: /node_modules[\\/]hls\.js[\\/]/,
                priority: 25,
              },
              {
                name: 'lucide-vendor',
                test: /node_modules[\\/]lucide-react[\\/]/,
                priority: 20,
              },
            ],
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      hmr: false as const,
      ws: false as const,
      watch: null,
    },
  };
});
