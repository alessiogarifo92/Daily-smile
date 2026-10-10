import { defineConfig, devices } from '@playwright/test';

// In the cloud container Chromium is preinstalled at a fixed path; locally Playwright finds its own.
const executablePath = process.env.CHROMIUM_PATH || (process.env.PLAYWRIGHT_BROWSERS_PATH === '/opt/pw-browsers' ? '/opt/pw-browsers/chromium' : undefined);

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    ...devices['Pixel 7'],
    launchOptions: { executablePath, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] },
  },
  webServer: { command: 'npm run preview', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 30_000 },
});
