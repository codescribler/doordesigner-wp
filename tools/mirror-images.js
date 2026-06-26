'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

function mirrorPlan(data) {
  var base = (data._assetBase || '').replace(/\/$/, '');
  return (data._imageUrls || []).map(function (u) {
    var clean = u.replace(/\?.*$/, '');
    var after = clean.replace(/^.*\/Images\//, '');
    return { url: base + '/' + u, localPath: 'assets/img/endurance/' + after };
  });
}

function download(url, dest) {
  return new Promise(function (resolve) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    var file = fs.createWriteStream(dest);
    https.get(encodeURI(url), function (res) {
      if (res.statusCode !== 200) { file.close(); fs.unlink(dest, function () {}); return resolve({ url: url, ok: false, code: res.statusCode }); }
      res.pipe(file); file.on('finish', function () { file.close(function () { resolve({ url: url, ok: true }); }); });
    }).on('error', function () { resolve({ url: url, ok: false }); });
  });
}

async function main() {
  const ROOT = path.join(__dirname, '..');
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/endurance-catalogue-full.json'), 'utf8'));
  const plan = mirrorPlan(data);
  let ok = 0, fail = 0;
  for (const item of plan) {
    const r = await download(item.url, path.join(ROOT, item.localPath));
    r.ok ? ok++ : fail++;
  }
  console.log('mirrored ' + ok + ' images, ' + fail + ' failed → assets/img/endurance/');
}

module.exports = { mirrorPlan, download };
if (require.main === module) { main(); }
