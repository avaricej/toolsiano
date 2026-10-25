import { defineConfig } from 'astro/config';
export default defineConfig({
  site: 'https://toolsiano.com',
  output: 'static',
  trailingSlash: 'always',
  build: { inlineStylesheets: 'never' },
  vite: { build: { assetsInlineLimit: 0 } },
});
