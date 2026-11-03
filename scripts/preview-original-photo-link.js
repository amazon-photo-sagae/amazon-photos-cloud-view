// Local-only preview: disposable fixture storage, no scraping or production data.
const { createPreview } = require('./photo-link-preview');
const port = Number(process.env.PREVIEW_PORT || 3001);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('PREVIEW_PORTには0〜65535の整数を指定してください。');
const preview = createPreview();
const server = preview.app.listen(port, preview.bindHost, () => {
  console.log('ローカルテストです。本番データは読み込みません。');
  console.log(`http://${preview.bindHost}:${server.address().port}/`);
  console.log('画像はローカルサンプルです。Amazonへの自動アクセスは行いません。');
  console.log('終了するには Ctrl+C を押してください。一時データは削除されます。');
});
process.on('exit', preview.cleanup);
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => process.exit(0)));
