import {defineConfig,devices} from '@playwright/test';

const baseURL=`http://127.0.0.1:${process.env.PORT||8080}`;

export default defineConfig({
  testDir:'./tests/e2e-multiplayer',
  timeout:120_000,
  expect:{timeout:15_000},
  fullyParallel:false,
  workers:1,
  retries:process.env.CI?1:0,
  reporter:'line',
  outputDir:'test-results-multiplayer',
  use:{
    baseURL,
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
    video:'retain-on-failure',
  },
  webServer:{
    command:'npm run serve',
    url:baseURL,
    reuseExistingServer:false,
    timeout:20_000,
  },
  projects:[{
    name:'live-desktop',
    use:{...devices['Desktop Chrome'],viewport:{width:1440,height:900}},
  }],
});
