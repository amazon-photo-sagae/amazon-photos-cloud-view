const os = require('node:os');
const net = require('node:net');

// Preserve the branch's explicit LAN opt-in, without wildcard/public binds.
function previewHost(lanIp = process.env.PREVIEW_LAN_IP, interfaces = os.networkInterfaces()) {
  if (!lanIp) return '127.0.0.1';
  if (typeof lanIp !== 'string' || net.isIP(lanIp) !== 4) throw Error('PREVIEW_LAN_IPには、このPCのプライベートIPv4アドレスを指定してください。');
  const [a, b] = lanIp.split('.').map(Number);
  if (!(a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168))) throw Error('公開IPや全アドレスでの待ち受けは許可しません。');
  if (!Object.values(interfaces).flat().some(entry => entry && entry.address === lanIp && !entry.internal)) throw Error('PREVIEW_LAN_IPがこのPCに割り当てられていません。');
  return lanIp;
}

module.exports = { previewHost };
