/*
 * Endurance Retail Door Designer — Catalogue + LAYER-MODEL Extractor (v3)
 * =====================================================================
 * Produces the data backbone AND a faithful door-preview layer model. For every
 * customer choice it drives the live designer and records the layers that choice
 * CONTRIBUTES (the delta vs a baseline composite), each with full geometry
 * (CX, CY, W, H, Rotation, FlipH, DrawOnLeftSlab, OnRightImageURL).
 *
 * v3 FIX: the full composite must be read from a field whose SubOptions expose the
 * WHOLE door (Handle/Frame Colour/Glass/Knocker carry all ~16 layers), NOT from
 * 'Door Design' (which only exposes the door slab — that was the v2 bug). v3 reads
 * each walked field's OWN selected SubOption images, and takes the richest field's
 * images as the baseline composite. Run EXT.validate() first to confirm (15s).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW TO RUN  (log in, open the Door Designer / Default.aspx, F12 → Console)
 *   Paste this whole file, then:
 *       await EXT.validate();          // 15s sanity check — paste the output to Claude
 *       await EXT.captureAllTypes();   // the real capture — several minutes
 *       EXT.download();                // saves endurance-catalogue-full.json
 *
 *   …or one type at a time:
 *       EXT.selectType('Single Door'); await EXT.captureCurrentType(); EXT.download();
 *
 * NOTES
 *   • Safe: only changes the in-progress design. Never click Quote/Order while it runs.
 *   • It drives hundreds of options per type (restoring baselines), so it's slow and
 *     hits their server hard. Watch the console; run per-type if preferred.
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function () {
  const EXT = {};
  const job = () => window.mJobState.Job;
  const opts = () => job().Options;
  const field = (h) => opts().find(o => o.Heading === h);
  const selectedOf = (f) => (f.SubOptions || []).find(s => s.ID === f.CurrentID) || null;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const folderOf = (u) => { const m = String(u).match(/Images\/([^\/]+)\//); return m ? m[1] : '?'; };

  const CUSTOMER = [
    'Frame Design', 'Door Design', 'Door Colour (External)', 'Door Colour (Internal)',
    'Door Hinged On', 'Master Leaf', 'Hardware Type', 'Handle', 'Letterplate', 'Knocker', 'Frame Colour'
  ];

  function readImage(im) {
    if (!im || !im.ImageURL) return null;
    return {
      url: im.ImageURL, urlRight: im.OnRightImageURL || '',
      cx: im.CX, cy: im.CY, w: im.W, h: im.H,
      rotation: im.Rotation || 0, flipH: !!im.FlipH,
      leftSlab: im.DrawOnLeftSlab !== false, excludeDouble: !!im.ExcludeFromDoubleDoorSelector
    };
  }

  // Layers of one field's currently-selected SubOption (full composite for the
  // "rich" fields; slab only for Door Design / Door Colour).
  function fieldComposite(heading) {
    const f = field(heading);
    const sel = f ? selectedOf(f) : null;
    return ((sel && sel.Images) || []).map(readImage).filter(Boolean);
  }

  // The richest selected-SubOption images across all fields = the full live door.
  function fullComposite() {
    let best = [];
    opts().forEach(o => {
      const sel = selectedOf(o);
      const imgs = ((sel && sel.Images) || []);
      if (imgs.length > best.length) { best = imgs; }
    });
    return best.map(readImage).filter(Boolean);
  }

  // The actual RENDERED layer stack (Job.Drawing.Elements) in full render coordinates — door and
  // sidelight cleanly separated by X (door centre ≈ right, side panel ≈ left). SubOption.Images
  // are in a smaller thumbnail space and don't reliably include the side panel, so side-design
  // geometry is read from here. X/Y are element centres; W/H the size.
  function drawingLayers() {
    const els = (job().Drawing && job().Drawing.Elements) || [];
    return els.filter(e => e.ImgFile).map(e => ({
      url: e.ImgFile, cx: e.X, cy: e.Y, w: e.W, h: e.H, rotation: e.Rotation || 0, flipH: !!e.FlipH
    }));
  }

  async function waitForId(heading, id, timeout = 12000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      await sleep(150);
      try { if (field(heading).CurrentID === id) return true; } catch (e) {}
    }
    return false;
  }
  async function setOption(category, id, confirmHeading) {
    try { SelectOption(category, id); } catch (e) {}
    await waitForId(confirmHeading, id);
    await sleep(120);
  }

  EXT.selectType = function (name) {
    const dt = field('Door Type');
    const t = dt.SubOptions.find(s => s.Description === name);
    if (!t) { console.warn('[EXT] type not found:', name); return false; }
    SelectOption(dt.Category, t.ID);
    return true;
  };

  // ── Quick correctness check (run BEFORE the long capture) ──────────────────
  EXT.validate = async function () {
    const report = {};
    const probe = async (heading, expectFolder) => {
      const f = field(heading);
      if (!f || f.SubOptions.length < 2) { return { heading, skipped: true }; }
      const base = f.CurrentID;
      const pick = f.SubOptions.filter(s => s.ID !== base).slice(0, 2);
      const seen = [];
      for (const s of pick) {
        await setOption(f.Category, s.ID, heading);
        const comp = fieldComposite(heading);
        const layer = comp.find(l => folderOf(l.url) === expectFolder);
        seen.push({ choice: s.Description, layers: comp.length, folders: [...new Set(comp.map(l => folderOf(l.url)))], expectedLayerUrl: layer ? layer.url : null });
      }
      await setOption(f.Category, base, heading);
      return { heading, expectFolder, hasExpectedFolder: seen.every(x => !!x.expectedLayerUrl), varies: seen.length === 2 && seen[0].expectedLayerUrl !== seen[1].expectedLayerUrl, seen };
    };
    report.fullComposite = { layers: fullComposite().length, folders: [...new Set(fullComposite().map(l => folderOf(l.url)))] };
    report.frameColour = await probe('Frame Colour', 'DoorFrames');
    report.handle = await probe('Handle', 'Handles');
    report.glass = await probe('Door Glass', 'DoorGlazing');
    console.log('[EXT.validate]\n' + JSON.stringify(report, null, 2));
    return report;
  };

  // ── Capture ────────────────────────────────────────────────────────────────
  // Walk a field; per choice record the DELTA layers vs the baseline composite.
  EXT.walkField = async function (heading, baseUrls) {
    const f = field(heading);
    if (!f) return null;
    const cat = f.Category, baseId = f.CurrentID, list = f.SubOptions || [];
    const choices = [];
    const sigs = new Set();
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      await setOption(cat, s.ID, heading);
      // Most fields expose the full door on their own SubOptions; a few (Letterplate,
      // Frame Design, Door Hinged On) carry none — fall back to the live composite so
      // their contributed layer (e.g. the letterplate) is still captured.
      let comp = fieldComposite(heading);
      if (!comp.length) { comp = fullComposite(); }
      const delta = comp.filter(l => !baseUrls.has(l.url));
      choices.push({ label: s.Description, id: s.ID, delta });
      sigs.add(delta.map(l => l.url).join('|'));
      if ((i + 1) % 12 === 0 || i === list.length - 1) console.log('[EXT]   ' + heading + ' ' + (i + 1) + '/' + list.length);
    }
    await setOption(cat, baseId, heading);
    if (sigs.size <= 1 && list.length > 2) console.warn('[EXT] ⚠ ' + heading + ': all choices produced the same layers — check this field.');
    return { heading: f.Heading, category: cat, baselineId: baseId, choices };
  };

  // Walk every style once, capturing BOTH the per-style glazing list AND the
  // per-style knocker list (empty list = that style offers no knocker — e.g. Kit,
  // Sanford Georgian, Wentwood). Piggybacks on one style walk, no extra cost.
  EXT.walkPerStyle = async function () {
    const dd = field('Door Design');
    const cat = dd.Category, baseId = dd.CurrentID;
    const styles = dd.SubOptions.map(s => ({ id: s.ID, label: s.Description }));
    const readList = (h) => { const f = field(h); return f ? (f.SubOptions || []).map(s => ({ label: s.Description, id: s.ID })) : []; };
    const glazingByStyle = {}, knockerByStyle = {};
    for (let i = 0; i < styles.length; i++) {
      await setOption(cat, styles[i].id, 'Door Design');
      glazingByStyle[styles[i].label] = readList('Door Glass');
      knockerByStyle[styles[i].label] = readList('Knocker');
      if ((i + 1) % 15 === 0 || i === styles.length - 1) console.log('[EXT]   per-style ' + (i + 1) + '/' + styles.length);
    }
    await setOption(cat, baseId, 'Door Design');
    return { glazingByStyle, knockerByStyle };
  };

  // One representative style: drive each glass, record the glazing delta → derive
  // the DoorGlazing URL convention for every style offline.
  EXT.sampleGlazingLayers = async function (baseUrls) {
    const dg = field('Door Glass');
    if (!dg) return null;
    const style = field('Door Design').CurrentOption;
    const cat = dg.Category, baseId = dg.CurrentID, list = dg.SubOptions || [];
    const samples = [];
    for (let i = 0; i < list.length; i++) {
      await setOption(cat, list[i].ID, 'Door Glass');
      const comp = fieldComposite('Door Glass');
      samples.push({ label: list[i].Description, id: list[i].ID, delta: comp.filter(l => !baseUrls.has(l.url)) });
    }
    await setOption(cat, baseId, 'Door Glass');
    console.log('[EXT]   glazing-layer samples on "' + style + '": ' + samples.length);
    return { style, samples };
  };

  EXT.captureSidelights = async function (baseUrls) {
    const fd = field('Frame Design');
    if (!fd || fd.SubOptions.length <= 1) return null;
    const baseId = fd.CurrentID;
    // Pick a REAL sidelit shape — must exclude "No Sidelights" (which also matches /sidelight/i).
    const sidelit = fd.SubOptions.find(s => s.Description === 'Double Sidelight')
      || fd.SubOptions.find(s => s.Description !== 'No Sidelights' && /sidelight|half flag/i.test(s.Description));
    if (!sidelit) return null;
    await setOption(fd.Category, sidelit.ID, 'Frame Design');
    await sleep(500); // let the sidelight fields + layers appear

    // Capture EVERY sidelight-related field that surfaces (Sidelight Type, Sidelight
    // Glass, Side Slab Required, …) — keyed by heading so nothing is missed.
    const slFields = {};
    opts().forEach(o => {
      if (/sidelight|side slab/i.test(o.Heading)) {
        slFields[o.Heading] = { heading: o.Heading, category: o.Category, choices: (o.SubOptions || []).map(s => ({ label: s.Description, id: s.ID })) };
      }
    });
    const comp = fullComposite();
    const out = {
      frameShapeUsed: sidelit.Description,
      fields: slFields,
      // convenience aliases (back-compat with the customer view)
      sidelightType: slFields['Sidelight Type'] || { choices: [] },
      sidelightGlass: slFields['Sidelight Glass'] || { choices: [] },
      delta: comp.filter(l => !baseUrls.has(l.url))
    };
    await setOption(fd.Category, baseId, 'Frame Design');
    console.log('[EXT]   sidelights (' + sidelit.Description + '): fields [' + Object.keys(slFields).join(', ') + '], ' + out.delta.length + ' layers');
    return out;
  };

  // Capture the FULL composite (not a delta) for each sidelit frame shape, so the
  // renderer has the door's SHIFTED position + the sidelight panels + the wide
  // frame. Covers the pure-sidelight shapes (Left/Right/Double + midrail/half-flag);
  // toplight variants are skipped for now.
  EXT.captureSidelitComposites = async function () {
    const fd = field('Frame Design');
    if (!fd || fd.SubOptions.length <= 1) return null;
    const baseId = fd.CurrentID;
    const wanted = fd.SubOptions.filter(s => !/toplight/i.test(s.Description) && /sidelight|flag/i.test(s.Description));
    const out = {};
    for (const s of wanted) {
      await setOption(fd.Category, s.ID, 'Frame Design');
      await sleep(450);
      out[s.Description] = fullComposite();
    }
    await setOption(fd.Category, baseId, 'Frame Design');
    console.log('[EXT]   sidelit composites: ' + Object.keys(out).length + ' shapes [' + Object.keys(out).join(', ') + ']');
    return out;
  };

  function segmentDims(seg) {
    if (!seg || typeof seg !== 'object') return null;
    const out = {};
    Object.keys(seg).forEach(k => { if (typeof seg[k] === 'number') out[k] = seg[k]; });
    return out;
  }

  EXT.captureCurrentType = async function () {
    const type = field('Door Type').CurrentOption;
    console.log('[EXT] capturing ' + type + ' …');

    const baseComposite = fullComposite();
    const baseUrls = new Set(baseComposite.map(l => l.url));
    const baseSelection = {};
    opts().forEach(o => { const s = selectedOf(o); if (s) baseSelection[o.Heading] = { label: s.Description, id: s.ID }; });
    console.log('[EXT]   baseline composite: ' + baseComposite.length + ' layers (' + [...new Set(baseComposite.map(l => folderOf(l.url)))].join(', ') + ')');

    const fields = {};
    for (const h of CUSTOMER) {
      const res = await EXT.walkField(h, baseUrls);
      if (res) fields[h] = res;
    }
    const perStyle = await EXT.walkPerStyle();
    const glazingLayerSamples = await EXT.sampleGlazingLayers(baseUrls);
    const sidelights = await EXT.captureSidelights(baseUrls);

    const j = job();
    const out = {
      doorType: type, capturedAt: new Date().toISOString(),
      baseSelection, baseComposite, fields,
      glazingByStyle: perStyle.glazingByStyle,
      knockerByStyle: perStyle.knockerByStyle,
      glazingLayerSamples, sidelights,
      segments: { door: segmentDims(j.SegmentDoor), sidelightL: segmentDims(j.SegmentSidelight_L), sidelightR: segmentDims(j.SegmentSidelight_R), topBox: segmentDims(j.SegmentTopBox) }
    };
    window.__enduranceCatalogue = window.__enduranceCatalogue || {};
    window.__enduranceCatalogue[type] = out;
    console.log('[EXT] captured ' + type + ' — ' + Object.keys(fields).length + ' fields, ' + Object.keys(perStyle.glazingByStyle).length + ' styles');
    return out;
  };

  EXT.captureAllTypes = async function () {
    const types = field('Door Type').SubOptions.map(s => s.Description);
    for (const tName of types) {
      console.log('[EXT] switching to ' + tName);
      EXT.selectType(tName);
      const tid = field('Door Type').SubOptions.find(s => s.Description === tName).ID;
      await waitForId('Door Type', tid);
      await sleep(800);
      await EXT.captureCurrentType();
    }
    console.log('[EXT] done. Run EXT.download() to save.');
    return window.__enduranceCatalogue;
  };

  // ── INCREMENTAL "patch" capture ─────────────────────────────────────────────
  // Grabs ONLY what was missing/broken last time (per-style knocker, sidelights,
  // letterplate layers) so you don't re-walk the whole catalogue. Merge into the
  // existing data with:  node tools/merge-patch.js  (then build-render-model).
  EXT.capturePatchForType = async function () {
    const type = field('Door Type').CurrentOption;
    console.log('[EXT-patch] ' + type + ' …');
    const baseComposite = fullComposite();
    const baseUrls = new Set(baseComposite.map(l => l.url));
    const out = { doorType: type };

    // Per-style knocker (+ refresh glazing for free). Gate on the TYPE, not the
    // baseline style: a Single Door can default to a style with no knocker field,
    // which would wrongly skip the whole walk. Single/Stable offer knockers; the
    // per-style walk records [] for the styles that don't (e.g. Sanford Georgian).
    const KNOCKER_TYPES = ['Single Door', 'Stable Door'];
    if (KNOCKER_TYPES.indexOf(type) !== -1 || field('Knocker')) {
      const perStyle = await EXT.walkPerStyle();
      out.knockerByStyle = perStyle.knockerByStyle;
      out.glazingByStyle = perStyle.glazingByStyle;
    }
    // Sidelights (fixed) — only where the door supports them.
    out.sidelights = await EXT.captureSidelights(baseUrls);
    // Letterplate layers (its own SubOptions carry none → captured via the fallback).
    const lp = await EXT.walkField('Letterplate', baseUrls);
    if (lp) { out.letterplate = lp; }

    console.log('[EXT-patch] ' + type + ' — knockerStyles ' + (out.knockerByStyle ? Object.keys(out.knockerByStyle).length : 0) +
      ', sidelight fields ' + (out.sidelights ? Object.keys(out.sidelights.fields || {}).length : 0) +
      ', letterplate choices ' + (out.letterplate ? out.letterplate.choices.length : 0));
    return out;
  };

  EXT.capturePatch = async function (onlyTypes) {
    const all = field('Door Type').SubOptions.map(s => s.Description);
    const types = (onlyTypes && onlyTypes.length) ? all.filter(t => onlyTypes.indexOf(t) !== -1) : all;
    window.__patch = window.__patch || { _schema: 'patch-v1' };
    for (const tName of types) {
      EXT.selectType(tName);
      const tid = field('Door Type').SubOptions.find(s => s.Description === tName).ID;
      await waitForId('Door Type', tid);
      await sleep(800);
      window.__patch[tName] = await EXT.capturePatchForType();
    }
    console.log('[EXT-patch] done. Run EXT.downloadPatch().');
    return window.__patch;
  };

  // Sidelight-rendering capture: full composites per sidelit shape, per type.
  EXT.capturePatchSidelights = async function (onlyTypes) {
    const all = field('Door Type').SubOptions.map(s => s.Description);
    const types = (onlyTypes && onlyTypes.length) ? all.filter(t => onlyTypes.indexOf(t) !== -1) : all;
    window.__patch = window.__patch || { _schema: 'patch-v1' };
    for (const tName of types) {
      EXT.selectType(tName);
      const tid = field('Door Type').SubOptions.find(s => s.Description === tName).ID;
      await waitForId('Door Type', tid);
      await sleep(800);
      const sc = await EXT.captureSidelitComposites();
      if (sc) {
        window.__patch[tName] = window.__patch[tName] || { doorType: tName };
        window.__patch[tName].sidelitComposites = sc;
      }
      console.log('[EXT-patch] ' + tName + ' sidelit composites: ' + (sc ? Object.keys(sc).length + ' shapes' : 'n/a'));
    }
    console.log('[EXT-patch] sidelight composites done. Run EXT.downloadPatch().');
    return window.__patch;
  };

  // ── Side-slab DESIGN capture ────────────────────────────────────────────────
  // The plugin paints one generic Glazing/Side/Ornate.jpg overlay; Endurance gives each
  // "Side Slab Design" its OWN aperture layout (82 designs, 6 cassette keys). This activates a
  // sidelit frame, then walks Side Slab Design recording each design's side-panel layers
  // (cassettes/glazing) WITH geometry — captured on ONE shape ("Sidelight Left"); the per-shape
  // POSITION comes from the existing sidelitComposites. Run on Single Door (its sidelight feature).
  EXT.captureSideSlabDesigns = async function (shapeName) {
    const fd = field('Frame Design');
    if (!fd) return null;
    const baseFrame = fd.CurrentID;
    const shape = fd.SubOptions.find(s => s.Description === (shapeName || 'Sidelight Left'))
      || fd.SubOptions.find(s => s.Description !== 'No Sidelights' && /sidelight/i.test(s.Description));
    if (!shape) { console.warn('[EXT] no sidelit frame shape available'); return null; }
    await setOption(fd.Category, shape.ID, 'Frame Design');
    await sleep(600); // let the side fields + layers appear
    const ssd = field('Side Slab Design');
    const ssg = field('Side Slab Glass Design');
    if (!ssd) { await setOption(fd.Category, baseFrame, 'Frame Design'); console.warn('[EXT] no Side Slab Design field'); return null; }

    // Split door vs side by X (full render coords): the side panel sits left of the door blank's
    // left edge. Read from Drawing.Elements (drawingLayers), NOT SubOption.Images.
    const doorBlankOf = (comp) => comp.find(l => /DoorBlanks\/Door Mould/i.test(l.url));
    const sideBlankOf = (comp) => comp.find(l => /DoorBlanks\/Side Mould/i.test(l.url));
    const db0 = doorBlankOf(drawingLayers());
    const doorLeft = db0 ? (db0.cx - db0.w / 2) : 600;
    const isSide = (l) => (l.cx != null) && (l.cx < doorLeft) && /(DoorCassettes|DoorGlazing|Glazing\/Side)/.test(l.url);

    const cat = ssd.Category, baseId = ssd.CurrentID, list = ssd.SubOptions || [];
    const designs = [];
    for (let i = 0; i < list.length; i++) {
      await setOption(cat, list[i].ID, 'Side Slab Design');
      const comp = drawingLayers();
      const sb = sideBlankOf(comp);
      designs.push({ label: list[i].Description, id: list[i].ID, sideBlank: sb || null, layers: comp.filter(isSide) });
      if ((i + 1) % 12 === 0 || i === list.length - 1) console.log('[EXT]   side slab design ' + (i + 1) + '/' + list.length);
    }
    await setOption(cat, baseId, 'Side Slab Design');
    await setOption(fd.Category, baseFrame, 'Frame Design');
    const withApertures = designs.filter(d => d.layers.length).length;
    console.log('[EXT]   side slab designs: ' + designs.length + ' (' + withApertures + ' with aperture layers) on "' + shape.Description + '"');
    if (!withApertures) console.warn('[EXT] ⚠ no aperture layers captured — the side layers may live in Drawing.Elements, not SubOption.Images. Paste this log to Claude.');
    return { shape: shape.Description, doorLeft, sideGlassChoices: ssg ? (ssg.SubOptions || []).map(s => ({ label: s.Description, id: s.ID })) : [], designs };
  };

  EXT.capturePatchSideDesigns = async function (onlyTypes) {
    const all = field('Door Type').SubOptions.map(s => s.Description);
    const types = (onlyTypes && onlyTypes.length) ? all.filter(t => onlyTypes.indexOf(t) !== -1) : ['Single Door'];
    window.__patch = window.__patch || { _schema: 'patch-v1' };
    for (const tName of types) {
      EXT.selectType(tName);
      const tid = field('Door Type').SubOptions.find(s => s.Description === tName).ID;
      await waitForId('Door Type', tid);
      await sleep(800);
      const sd = await EXT.captureSideSlabDesigns();
      if (sd) {
        window.__patch[tName] = window.__patch[tName] || { doorType: tName };
        window.__patch[tName].sideSlabDesigns = sd;
      }
      console.log('[EXT-patch] ' + tName + ' side designs: ' + (sd ? sd.designs.length : 'n/a'));
    }
    console.log('[EXT-patch] side designs done. Run EXT.downloadPatch().');
    return window.__patch;
  };

  // ── Door→side mapping capture ───────────────────────────────────────────────
  // Walks every Door Design on a sidelit frame and records which Side Slab Design + Side Slab
  // Glass the designer shows for it. Reveals whether the side AUTO-pairs with the door (a real
  // map to honour) or stays constant (independent — there is no map, the side is a free choice).
  // TIP: before running, set the sidelight to "copy glazing" so any door→side coupling is active.
  EXT.captureSideMapping = async function () {
    EXT.selectType('Single Door');
    await waitForId('Door Type', field('Door Type').SubOptions.find(s => s.Description === 'Single Door').ID);
    await sleep(600);
    const fd = field('Frame Design');
    const baseFrame = fd.CurrentID;
    const shape = fd.SubOptions.find(s => s.Description === 'Sidelight Left')
      || fd.SubOptions.find(s => s.Description !== 'No Sidelights' && /sidelight/i.test(s.Description));
    if (shape && fd.CurrentID !== shape.ID) { await setOption(fd.Category, shape.ID, 'Frame Design'); await sleep(500); }

    const dd = field('Door Design');
    const cat = dd.Category, baseId = dd.CurrentID, list = dd.SubOptions || [];
    const cur = (h) => { const f = field(h); const s = f && (f.SubOptions || []).find(z => z.ID === f.CurrentID); return s ? s.Description : null; };
    const map = {};
    for (let i = 0; i < list.length; i++) {
      await setOption(cat, list[i].ID, 'Door Design');
      map[list[i].Description] = { sideDesign: cur('Side Slab Design'), sideGlass: cur('Side Slab Glass Design'), doorGlass: cur('Door Glass') };
      if ((i + 1) % 15 === 0 || i === list.length - 1) console.log('[EXT]   side-map ' + (i + 1) + '/' + list.length);
    }
    await setOption(cat, baseId, 'Door Design');
    await setOption(fd.Category, baseFrame, 'Frame Design');
    const distinctSide = new Set(Object.values(map).map(v => v.sideDesign));
    const glassFollows = Object.values(map).filter(v => v.sideGlass === v.doorGlass).length;
    window.__patch = window.__patch || { _schema: 'patch-v1' };
    window.__patch['Single Door'] = window.__patch['Single Door'] || { doorType: 'Single Door' };
    window.__patch['Single Door'].sideMapping = map;
    console.log('[EXT] side mapping: ' + Object.keys(map).length + ' door designs, ' + distinctSide.size +
      ' distinct side designs (1 = no auto-map), side-glass==door-glass on ' + glassFollows + '/' + Object.keys(map).length + '.');
    console.log('[EXT] Run EXT.downloadPatch("endurance-side-map.json").');
    return map;
  };

  // ── Per-finish furniture availability ───────────────────────────────────────
  // Endurance FILTERS the Handle + Letterplate lists by the chosen Hardware Type (finish): e.g.
  // Forged Black drops the 26 handles to 18 (recolourable ones removed). Walk Hardware Type on a
  // plain (non-sidelit) door and record the exact Handle + Letterplate list per finish, so the
  // wizard can offer precisely what Endurance offers — guaranteeing every finish×furniture pair
  // it lets a customer pick is orderable. Run on Single Door.
  EXT.captureFinishFurniture = async function () {
    EXT.selectType('Single Door');
    await waitForId('Door Type', field('Door Type').SubOptions.find(s => s.Description === 'Single Door').ID);
    await sleep(600);
    // keep it simple: a plain door (no sidelight) so only the finish varies.
    const fd = field('Frame Design');
    const plain = fd && fd.SubOptions.find(s => /^no sidelights$/i.test(s.Description));
    if (plain && fd.CurrentID !== plain.ID) { await setOption(fd.Category, plain.ID, 'Frame Design'); await sleep(400); }

    const hw = field('Hardware Type');
    const cat = hw.Category, baseId = hw.CurrentID, list = hw.SubOptions || [];
    const readList = (h) => { const ff = field(h); return ff ? (ff.SubOptions || []).map(s => s.Description) : []; };
    const byFinish = {};
    for (let i = 0; i < list.length; i++) {
      await setOption(cat, list[i].ID, 'Hardware Type');
      byFinish[list[i].Description] = { handles: readList('Handle'), letterplates: readList('Letterplate') };
      console.log('[EXT]   finish ' + (i + 1) + '/' + list.length + ' ' + list[i].Description +
        ': ' + byFinish[list[i].Description].handles.length + ' handles, ' + byFinish[list[i].Description].letterplates.length + ' letterplates');
    }
    await setOption(cat, baseId, 'Hardware Type');
    window.__patch = window.__patch || { _schema: 'patch-v1' };
    window.__patch['Single Door'] = window.__patch['Single Door'] || { doorType: 'Single Door' };
    window.__patch['Single Door'].finishFurniture = byFinish;
    console.log('[EXT] per-finish furniture captured for ' + Object.keys(byFinish).length + ' finishes. Run EXT.downloadPatch("endurance-finish-furniture.json").');
    return byFinish;
  };

  // ── Finish-specific letterplates ────────────────────────────────────────────
  // Endurance offers letterplate PRODUCTS that only appear at certain finishes — "Stainless Steel
  // Letterplate", "Premium Matt Black Letterplate", etc. — which our catalogue (captured at Chrome)
  // doesn't have. Walk the Letterplate field AT each of those finishes and capture each letterplate's
  // layer (image + geometry), so the build can add them and the wizard can offer them there.
  EXT.captureSpecialtyLetterplates = async function () {
    EXT.selectType('Single Door');
    await waitForId('Door Type', field('Door Type').SubOptions.find(s => s.Description === 'Single Door').ID);
    await sleep(600);
    const fd = field('Frame Design');
    const plain = fd && fd.SubOptions.find(s => /^no sidelights$/i.test(s.Description));
    if (plain && fd.CurrentID !== plain.ID) { await setOption(fd.Category, plain.ID, 'Frame Design'); await sleep(400); }

    const hw = field('Hardware Type');
    const baseFin = hw.CurrentID;
    const out = {};
    for (const finishLabel of ['Stainless Steel', 'Matt Black', 'Satin Brass']) {
      const fopt = hw.SubOptions.find(s => s.Description === finishLabel);
      if (!fopt) { continue; }
      await setOption(hw.Category, fopt.ID, 'Hardware Type');
      await sleep(300);
      const baseUrls = new Set(fullComposite().map((l) => l.url));
      out[finishLabel] = await EXT.walkField('Letterplate', baseUrls);
      console.log('[EXT]   ' + finishLabel + ': ' + (out[finishLabel] ? out[finishLabel].choices.length : 0) + ' letterplate choices captured');
    }
    await setOption(hw.Category, baseFin, 'Hardware Type');
    window.__patch = window.__patch || { _schema: 'patch-v1' };
    window.__patch['Single Door'] = window.__patch['Single Door'] || { doorType: 'Single Door' };
    window.__patch['Single Door'].specialtyLetterplates = out;
    console.log('[EXT] specialty letterplates captured for ' + Object.keys(out).length + ' finishes. Run EXT.downloadPatch("endurance-specialty-letterplates.json").');
    return out;
  };

  EXT.downloadPatch = function (filename) {
    const data = window.__patch || {};
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename || 'endurance-patch.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    console.log('[EXT-patch] downloaded ' + a.download);
  };

  EXT.collectImageUrls = function (data) {
    const set = new Set();
    const eat = (layers) => (layers || []).forEach(l => { if (l && l.url) set.add(l.url); if (l && l.urlRight) set.add(l.urlRight); });
    Object.keys(data || {}).forEach(type => {
      const t = data[type]; if (!t || typeof t !== 'object' || type.charAt(0) === '_') return;
      eat(t.baseComposite);
      Object.values(t.fields || {}).forEach(f => (f.choices || []).forEach(c => eat(c.delta)));
      if (t.glazingLayerSamples) (t.glazingLayerSamples.samples || []).forEach(s => eat(s.delta));
      if (t.sidelights) eat(t.sidelights.delta);
    });
    return Array.from(set).sort();
  };

  EXT.download = function (filename) {
    const data = window.__enduranceCatalogue || {};
    data._assetBase = location.origin;
    data._imageUrls = EXT.collectImageUrls(data);
    data._capturedAt = new Date().toISOString();
    data._schema = 'v3-delta';
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename || 'endurance-catalogue-full.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    console.log('[EXT] downloaded ' + a.download + ' — ' + data._imageUrls.length + ' unique image URLs to mirror');
  };

  window.EXT = EXT;
  console.log('%c[EXT v3.7 — specialty letterplates] ready.', 'font-weight:bold');
  console.log('  SPECIALTY LETTERPLATES (this step): await EXT.captureSpecialtyLetterplates();  then  EXT.downloadPatch("endurance-specialty-letterplates.json");');
  console.log('  SIDE DESIGNS (done):  await EXT.capturePatchSideDesigns();  then  EXT.downloadPatch("endurance-side-designs.json");');
  console.log('  SIDELIGHT composites:     await EXT.capturePatchSidelights();   then  EXT.downloadPatch();');
  console.log('  LIGHT (missing option data): await EXT.capturePatch();   then  EXT.downloadPatch();');
  console.log('  FULL (re-walk everything):   await EXT.captureAllTypes(); then  EXT.download();');
})();
