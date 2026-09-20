import {defineConfig,devices} from '@playwright/test';

const baseURL=`http://127.0.0.1:${process.env.PORT||8080}`;
const tabletPortrait={viewport:{width:768,height:1024},hasTouch:true};
const tabletLandscape={viewport:{width:1024,height:768},hasTouch:true};

export default defineConfig({
  testDir:'./tests/e2e',
  timeout:30_000,
  fullyParallel:true,
  reporter:'line',
  outputDir:'test-results-cross-browser',
  use:{baseURL,trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:{command:'npm run serve',url:baseURL,reuseExistingServer:false,timeout:20_000},
  projects:[
    {name:'firefox-desktop',use:{...devices['Desktop Firefox'],viewport:{width:1440,height:900}}},
    {name:'firefox-tablet-portrait',use:{browserName:'firefox',...tabletPortrait}},
    {name:'firefox-tablet-landscape',use:{browserName:'firefox',...tabletLandscape}},
    {name:'webkit-desktop',use:{...devices['Desktop Safari'],viewport:{width:1440,height:900}}},
    {name:'webkit-tablet-portrait',use:{browserName:'webkit',...tabletPortrait}},
    {name:'webkit-tablet-landscape',use:{browserName:'webkit',...tabletLandscape}},
  ],
});
