'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

// A real image URL must end in an actual filename. The capture occasionally collects
// a bare folder reference (e.g. ".../Images/Handles/" for a "no handle" layer), which
// would collide with the real Handles/ directory — skip anything that isn't a file.
function isFileUrl(after) {
  if (!after || after.charAt(after.length - 1) === '/') { return false; }
  var last = after.split('/').pop();
  return /\.[a-z0-9]+$/i.test(last);
}

function mirrorPlan(data) {
  var base = (data._assetBase || '').replace(/\/$/, '');
  var plan = [];
  (data._imageUrls || []).forEach(function (u) {
    var clean = u.replace(/\?.*$/, '');
    var after = clean.replace(/^.*\/Images\//, '');
    if (!isFileUrl(after)) { return; }
    plan.push({ url: base + '/' + u, localPath: 'assets/img/endurance/' + after });
  });
  return plan;
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
  const total = (data._imageUrls || []).length;
  const plan = mirrorPlan(data);
  const skipped = total - plan.length;
  let ok = 0, fail = 0;
  const failures = [];
  for (const item of plan) {
    const r = await download(item.url, path.join(ROOT, item.localPath));
    if (r.ok) { ok++; } else { fail++; failures.push(item.url + (r.code ? ' (HTTP ' + r.code + ')' : '')); }
  }
  console.log('mirrored ' + ok + ' images, ' + fail + ' failed, ' + skipped + ' skipped (non-file URLs) → assets/img/endurance/');
  if (failures.length) { console.log('failed URLs:\n  ' + failures.join('\n  ')); }
}

module.exports = { mirrorPlan, download };
if (require.main === module) { main(); }
