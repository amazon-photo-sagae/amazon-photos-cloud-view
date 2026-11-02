// Local-only preview: disposable fixture storage, no scraping or production data.
const { createPreview } = require('./photo-link-preview');
const preview = createPreview();
const server = preview.app.listen(Number(process.env.PREVIEW_PORT || 3001), '127.0.0.1', () => {
  console.log('Local test preview only. Production data is not loaded.');
  console.log(`http://127.0.0.1:${server.address().port}/`);
  console.log('Add supplied photo URLs in the local form. No scraping is performed.');
  console.log('Ctrl+C stops the preview and removes its disposable data.');
});
process.on('exit', preview.cleanup);
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => process.exit(0)));
