import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020', chunkSizeWarningLimit: 2500,
    rollupOptions: {
      // two games: the 2D original (/) and the 3D open-world version (/3d/)
      input: { main: 'index.html', world3d: '3d/index.html' },
      output: { manualChunks: (id) => (id.includes('node_modules/phaser') ? 'phaser' : id.includes('node_modules/three') ? 'three' : undefined) },
    },
  },
  server: { host: true },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate', // new versions install and take over by themselves — no reinstalling the app
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Dragonbound', short_name: 'Dragonbound', lang: 'pt-BR',
        description: 'Beta — RPG de ação em pixel art: conquiste a confiança de dragões únicos em um arquipélago vivo.',
        start_url: './', scope: './', display: 'fullscreen', display_override: ['fullscreen', 'standalone'], orientation: 'landscape',
        background_color: '#0c0e1a', theme_color: '#0c0e1a', categories: ['games'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // precache the whole game so it runs offline after the first visit / install
        globPatterns: ['**/*.{js,css,html,png,json,xml,webmanifest}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        cleanupOutdatedCaches: true, clientsClaim: true, skipWaiting: true,
        navigateFallbackDenylist: [/^\/3d/],
      },
    }),
  ],
});
