module.exports = {
    ci: {
        collect: {
            startServerCommand: 'npm run preview -- --host 127.0.0.1 --port 4175',
            startServerReadyPattern: 'Local:',
            startServerReadyTimeout: 120000,
            url: [
                'http://127.0.0.1:4175/',
                'http://127.0.0.1:4175/skills',
                'http://127.0.0.1:4175/standards/MA-D2-GE-003'
            ],
            numberOfRuns: 1,
            settings: {
                preset: 'desktop',
                chromeFlags: '--headless --no-sandbox --disable-gpu'
            }
        },
        assert: {
            assertions: {
                'categories:accessibility': ['error', { minScore: 0.9 }],
                'categories:performance': ['warn', { minScore: 0.8 }],
                'categories:best-practices': ['warn', { minScore: 0.9 }],
                'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
                'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
                'total-blocking-time': ['error', { maxNumericValue: 200 }]
            }
        },
        upload: { target: 'filesystem', outputDir: 'output/quality/lighthouse' }
    }
}
