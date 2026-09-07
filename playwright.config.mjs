import { defineConfig, devices } from '@playwright/test';

const baseURL = `http://127.0.0.1:${process.env.PORT || 8080}`;

export default defineConfig({
  testDir:'./tests/e2e',
  timeout:30_000,
  fullyParallel:true,
  reporter:'line',
  use:{baseURL,trace:'retain-on-failure'},
  webServer:{command:'npm run serve',url:baseURL,reuseExistingServer:false,timeout:20_000},
  projects:[
    {name:'desktop-1440',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:900}}},
    {name:'phone-360',use:{...devices['Desktop Chrome'],viewport:{width:360,height:800},isMobile:true,hasTouch:true}},
    {name:'phone-landscape',use:{...devices['Desktop Chrome'],viewport:{width:800,height:360},isMobile:true,hasTouch:true}},
  ],
});
