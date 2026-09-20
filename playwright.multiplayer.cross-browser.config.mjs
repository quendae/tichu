import {defineConfig,devices} from '@playwright/test';

const baseURL=`http://127.0.0.1:${process.env.PORT||8080}`;

export default defineConfig({
  testDir:'./tests/e2e-multiplayer',
  testMatch:'live-2h2b.spec.mjs',
  timeout:120_000,
  expect:{timeout:15_000},
  fullyParallel:false,
  workers:1,
  retries:process.env.CI?1:0,
  reporter:'line',
  outputDir:'test-results-cross-browser-multiplayer',
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
  projects:[
    {name:'live-firefox-desktop',use:{...devices['Desktop Firefox'],viewport:{width:1440,height:900}}},
    {name:'live-webkit-desktop',use:{...devices['Desktop Safari'],viewport:{width:1440,height:900}}},
    {name:'live-tablet-portrait',use:{...devices['Desktop Chrome'],viewport:{width:768,height:1024},hasTouch:true}},
    {name:'live-tablet-landscape',use:{...devices['Desktop Chrome'],viewport:{width:1024,height:768},hasTouch:true}},
  ],
});
