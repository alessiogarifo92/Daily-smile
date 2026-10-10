// Renders web/public/icons/icon.svg to the PNG sizes the manifest and iOS need.
// Usage: node scripts/make-icons.mjs
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const svg = await readFile(new URL('../web/public/icons/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
for (const size of [192, 512]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`);
  await page.screenshot({ path: new URL(`../web/public/icons/icon-${size}.png`, import.meta.url).pathname, omitBackground: true });
}
await browser.close();
