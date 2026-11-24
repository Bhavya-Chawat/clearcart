// Run: npx playwright test   (starts the demo server automatically)
module.exports = {
  testDir: '.',
  timeout: 90000,
  workers: 1,
  reporter: 'list',
  webServer: {
    command: 'python -m http.server 8000 --directory ../demo-sites',
    port: 8000,
    reuseExistingServer: true
  }
};
