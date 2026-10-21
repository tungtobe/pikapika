import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: { host: 'localhost', port: 5173, strictPort: true },
  preview: { host: 'localhost', port: 5173, strictPort: true },
  build: { rollupOptions: { input: { main: 'index.html', emulator: 'emulator.html' } } },
  plugins: [VitePWA({
    registerType: 'prompt',
    manifest: {
      id: '/', name: 'Pokémon Pocket', short_name: 'Pokémon Pocket', lang: 'vi',
      description: 'Pokémon Red & Blue — chơi offline, lưu tiến trình trên thiết bị của bạn.',
      start_url: '/', scope: '/', display: 'standalone',
      background_color: '#f5f3ea', theme_color: '#f5f3ea',
      icons: [
        { src: '/icons/pokeball-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/pokeball-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/pokeball-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,png,svg,json,wasm,data,gbc}', '**/LICENSE'],
      // Both HTML entries read the game from the query string at runtime.
      ignoreURLParametersMatching: [/^game$/, /^utm_/, /^fbclid$/],
      navigateFallback: null,
      cleanupOutdatedCaches: true,
      clientsClaim: true,
      skipWaiting: false,
    },
  })],
});
