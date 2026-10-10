// Renders web/public/icons/icon.svg to the PNG sizes the manifest and iOS need.
// Usage: node scripts/make-icons.mjs
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const read = (name) => readFile(new URL(`../web/public/icons/${name}`, import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
for (const [source, size, out] of [['icon.svg', 192, 'icon-192.png'], ['icon.svg', 512, 'icon-512.png'], ['icon-maskable.svg', 512, 'icon-maskable-512.png']]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0}svg{width:${size}px;height:${size}px;display:block}</style>${await read(source)}`);
  await page.screenshot({ path: new URL(`../web/public/icons/${out}`, import.meta.url).pathname, omitBackground: true });
}
await browser.close();
