const { test } = require('node:test');
const assert = require('node:assert/strict');
const { previewHost } = require('../scripts/preview-network');
const os = require('node:os');
const http = require('node:http');
const { createPreview } = require('../scripts/photo-link-preview');
const interfaces = { wifi: [{ address: '192.168.1.110', internal: false }] };

test('LAN is opt-in and binds only an assigned private IPv4 address', () => {
  assert.equal(previewHost('', interfaces), '127.0.0.1');
  assert.equal(previewHost('192.168.1.110', interfaces), '192.168.1.110');
  for (const ip of ['0.0.0.0', '::', 'localhost', '8.8.8.8', '127.0.0.1', '192.168.1.111', '192.168.1.110:3001']) assert.throws(() => previewHost(ip, interfaces));
});

test('explicit LAN configuration accepts only its configured Host and actual port, including local forms', async () => {
  const previousIp = process.env.PREVIEW_LAN_IP;
  const originalInterfaces = os.networkInterfaces;
  let preview;
  try {
    os.networkInterfaces = () => interfaces;
    process.env.PREVIEW_LAN_IP = '192.168.1.110';
    preview = createPreview();
  } finally {
    os.networkInterfaces = originalInterfaces;
    if (previousIp === undefined) delete process.env.PREVIEW_LAN_IP;
    else process.env.PREVIEW_LAN_IP = previousIp;
  }
  assert.equal(preview.bindHost, '192.168.1.110');
  // Simulate LAN Host headers over loopback; never expose the test listener.
  const server = preview.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port;
  const request = (host, body) => new Promise((resolve, reject) => {
    const req = http.request(`http://127.0.0.1:${port}${body ? '/results' : '/'}`, {
      method: body ? 'POST' : 'GET', headers: { host, ...(body ? { origin: `http://${host}`, 'content-type': 'application/x-www-form-urlencoded' } : {}) }
    }, response => {
      let data = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { data += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, data }));
    });
    req.on('error', reject);
    req.end(body);
  });
  try {
    const host = `192.168.1.110:${port}`;
    const home = await request(host);
    assert.equal(home.status, 200);
    const csrf = /name="csrf" value="([^"]+)"/.exec(home.data)[1];
    const body = new URLSearchParams({ csrf, index: '0', result: '未確認' }).toString();
    assert.equal((await request(host, body)).status, 303);
    for (const invalid of [`localhost:${port}`, `127.0.0.1:${port}`, `192.168.1.111:${port}`, '192.168.1.110:1', `evil.example:${port}`]) assert.equal((await request(invalid)).status, 403);
    assert.equal(preview.audit.fetchAttempts, 0);
    assert.equal(preview.audit.writeAttempts, 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
    preview.cleanup();
  }
});
