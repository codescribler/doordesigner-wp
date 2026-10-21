// Turns the compact capture (read off the Endurance page on 2026-10-21) into
// data/endurance-toplights.json and mirrors the top-light frame + glass images.
const fs = require('fs'), path = require('path'), https = require('https');
const ROOT = path.join(__dirname, "..");
const IMG = 'Assets/CompositeDoors/Images/';
const LABELS = {11:'Toplight',12:'Toplight with Sidelight Left',13:'Toplight with Sidelight Left with Midrail',14:'Toplight with Half Flag Left',15:'Toplight with Sidelight Right',16:'Toplight with Sidelight Right with Midrail',17:'Toplight with Half Flag Right',18:'Toplight with Sidelight Both',19:'Toplight with Sidelights Both with Midrails',20:'Toplight with Half Flag Both',30:'Toplight (full)',31:'Toplight with Half Flag Left',32:'Toplight with Half Flag Right',33:'Toplight with Half Flag Both'};
const RAW = `11 > B:77.625,201.6,138.15,307.5 | T:76.8,24.75,136.5,32.4 | FT:77.625,181.5,155.25,363
12 > B:145.125,201.6,138.15,307.5 | S:32.55,24.75,48,32.4 | S:32.55,203.175,48,308.25 | T:144.375,24.75,136.65,32.4 | FLeftST:111.375,181.5,222.75,363
13 > B:145.125,201.6,138.15,307.5 | S:32.55,24.75,48,32.4 | S:32.55,135.525,48,172.95 | S:32.55,293.4,48,127.8 | T:144.375,24.75,136.65,32.4 | FLeftSMidrailT:111.375,181.5,222.75,363
14 > B:145.125,201.6,138.15,307.5 | S:32.55,24.75,48,32.4 | S:32.55,120.675,48,143.25 | T:144.375,24.75,136.65,32.4 | FLeftSHalfFlagT:111.375,181.5,222.75,363
15 > B:77.625,201.6,138.15,307.5 | S:186.15,24.75,48,32.4 | S:186.15,203.175,48,308.25 | T:76.875,24.75,136.65,32.4 | FRightST:111.375,181.5,222.75,363
16 > B:77.625,201.6,138.15,307.5 | S:186.15,24.75,48,32.4 | S:186.15,135.525,48,172.95 | S:186.15,293.4,48,127.8 | T:76.875,24.75,136.65,32.4 | FRightSMidrailT:111.375,181.5,222.75,363
17 > B:77.625,201.6,138.15,307.5 | S:186.15,24.75,48,32.4 | S:186.15,120.675,48,143.25 | T:76.875,24.75,136.65,32.4 | FRightSHalfFlagT:111.375,181.5,222.75,363
18 > B:145.125,201.6,138.15,307.5 | S:32.625,24.75,48.15,32.4 | S:32.625,203.175,48.15,308.25 | S:253.725,24.75,48.15,32.4 | S:253.725,203.175,48.15,308.25 | T:144.375,24.75,136.65,32.4 | FBothS2T:145.125,181.5,290.25,363
19 > B:145.125,201.6,138.15,307.5 | S:32.625,24.75,48.15,32.4 | S:32.625,135.525,48.15,172.95 | S:32.625,293.4,48.15,127.8 | S:253.725,24.75,48.15,32.4 | S:253.725,135.525,48.15,172.95 | S:253.725,293.4,48.15,127.8 | T:144.375,24.75,136.65,32.4 | FBothS2MidrailT:145.125,181.5,290.25,363
20 > B:145.125,201.6,138.15,307.5 | S:32.625,24.75,48.15,32.4 | S:32.625,120.675,48.15,143.25 | S:253.725,24.75,48.15,32.4 | S:253.725,120.675,48.15,143.25 | T:144.375,24.75,136.65,32.4 | FBothS2HalfFlagT:145.125,181.5,290.25,363
30 > B:77.625,201.6,138.15,307.5 | T:76.8,24.75,136.5,32.4 | FT:77.625,181.5,155.25,363
31 > B:145.125,201.6,138.15,307.5 | S:32.55,100.425,48,183.75 | T:144.375,24.75,136.65,32.4 | FLeftSHalfFlagT:111.375,181.5,222.75,363
32 > B:77.625,201.6,138.15,307.5 | S:186.15,100.425,48,183.75 | T:76.875,24.75,136.65,32.4 | FRightSHalfFlagT:111.375,181.5,222.75,363
33 > B:145.125,201.6,138.15,307.5 | S:32.625,100.425,48.15,183.75 | S:253.725,100.425,48.15,183.75 | T:144.375,24.75,136.65,32.4 | FBothS2HalfFlagT:145.125,181.5,290.25,363`;

const variantName = (code) => 'Single' + code.replace('S2', 'Sidelights').replace(/S(?=Midrail|HalfFlag|T$)/, 'Sidelight').replace(/T$/, 'TopLight');
const num = (s) => s.split(',').map(Number);

function shapes(blankShift) {
  const out = {};
  RAW.split('\n').forEach((line) => {
    const [id, rest] = line.split(' > ');
    const parts = rest.split(' | ').map((p) => { const [k, g] = p.split(':'); return { k, g: num(g) }; });
    const geom = ([cx, cy, w, h]) => ({ cx, cy, w, h });
    const blank = parts.find((p) => p.k === 'B');
    const frame = parts.find((p) => p.k[0] === 'F');
    const bg = blankShift ? blankShift(blank.g) : blank.g;
    out[id] = {
      label: LABELS[id],
      doorBlank: geom(bg),
      frameVariant: variantName(frame.k.slice(1)),
      frameGeom: geom(frame.g),
      top: parts.filter((p) => p.k === 'T').map((p) => ({ url: IMG + 'Glazing/Top/Ornate.jpg', geom: geom(p.g) })),
      panels: parts.filter((p) => p.k === 'S').map((p) => ({ url: IMG + 'Glazing/Side/Ornate.jpg', geom: geom(p.g), side: p.g[0] < bg[0] ? 'left' : 'right' })),
      canvas: { width: Math.ceil(frame.g[0] + frame.g[2] / 2), height: Math.ceil(frame.g[1] + frame.g[3] / 2) }
    };
  });
  return out;
}

const single = shapes();
const avantal = shapes(([cx, cy]) => [Math.round((cx - 0.075) * 1000) / 1000, cy, 138, 307.5]);
const data = {
  _schema: 'toplights-v1',
  capturedAt: '2026-10-21T12:31:48.838Z',
  source: 'Endurance retail designer, Frame Design walked by id (SubOption thumbnail space, same space as sidelitComposites). Stable Door matched Single Door exactly; Avantal differs only in the door blank (138 wide, 0.075 further left). Endurance draws 30 "Toplight (full)" identically to 11 "Toplight", and 31-33 use the same frame artwork as 14/17/20 with one tall side pane instead of two.',
  'Single Door': single, 'Stable Door': single, Avantal: avantal
};
fs.writeFileSync(path.join(ROOT, 'data/endurance-toplights.json'), JSON.stringify(data, null, 1) + '\n');

const variants = [...new Set(Object.values(single).map((s) => s.frameVariant))];
const colours = fs.readdirSync(path.join(ROOT, 'assets/img/endurance', IMG, 'DoorFrames/Single')).filter((f) => f.endsWith('.png'));
const jobs = [IMG + 'Glazing/Top/Ornate.jpg'];
variants.forEach((v) => colours.forEach((c) => jobs.push(IMG + 'DoorFrames/' + v + '/' + c)));
console.log('variants', variants.join(', '), '| colours', colours.length, '| files', jobs.length);

const BASE = 'https://bmapprocaldoorportalretail.azurewebsites.net/';
function get(rel) {
  const dest = path.join(ROOT, 'assets/img/endurance', rel);
  if (fs.existsSync(dest)) return Promise.resolve('have');
  return new Promise((res) => {
    https.get(BASE + rel.split('/').map(encodeURIComponent).join('/'), (r) => {
      if (r.statusCode !== 200) { r.resume(); return res('HTTP ' + r.statusCode + ' ' + rel); }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const out = fs.createWriteStream(dest); r.pipe(out); out.on('finish', () => res('ok'));
    }).on('error', (e) => res('ERR ' + e.message + ' ' + rel));
  });
}
(async () => {
  const results = {};
  for (let i = 0; i < jobs.length; i += 8) {
    (await Promise.all(jobs.slice(i, i + 8).map(get))).forEach((r) => { const k = r.startsWith('HTTP') || r.startsWith('ERR') ? r : r; results[k] = (results[k] || 0) + 1; });
  }
  console.log(results);
})();
