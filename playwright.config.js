import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
    testDir: './tests/e2e',
    outputDir: 'output/playwright-test-results',
    fullyParallel: false,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    // The suite mutates browser-local route flags and collection state; one worker keeps
    // teardown deterministic across repeated 13-route audits on constrained CI machines.
    workers: 1,
    reporter: [['list'], ['html', { outputFolder: 'output/playwright-report', open: 'never' }]],
    use: {
        baseURL: 'http://127.0.0.1:4174',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        reducedMotion: 'reduce',
        colorScheme: 'light'
    },
    projects: [
        {
            name: 'chromium-desktop',
            use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1440, height: 900 } }
        }
    ],
    webServer: {
        command: 'VITE_WEB3FORMS_KEY=playwright-test-key npm run dev -- --host 127.0.0.1 --port 4174',
        url: 'http://127.0.0.1:4174',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000
    }
})
