/*
 * Sidelight DISCOVERY probe v2  (read-only, single run)
 * =====================================================
 * Finding from v1: the live Endurance designer renders the SAME side image
 * (Glazing/Side/Ornate.jpg) for EVERY Sidelight Glass pattern — pattern is a data
 * attribute, not a distinct rendered image. So the only visual distinction that
 * matters for the preview is GLAZED vs UNGLAZED.
 *
 * This v2 answers the one open question: what does an UNGLAZED sidelight render as?
 * It dumps the FULL layer stack for Glazed and for Unglazed, side by side, so nothing
 * is hidden by a geometry filter.
 *
 * HOW TO RUN  (log in, open the Door Designer / Default.aspx, F12 -> Console):
 *   1. Select a SINGLE DOOR (the canonical composite door with sidelights).
 *   2. Paste this whole file.
 *   3. Run:   await SLPROBE.run();
 *   4. Copy the JSON it prints (between the ↓↓↓ and ↑↑↑ markers) back to Claude.
 *
 * SAFE: only changes the in-progress selection to observe layers, then RESTORES the
 * original Frame Design. Never saves, never quotes. ~20-30s.
 */
(function () {
  const job = () => window.mJobState.Job;
  const opts = () => job().Options;
  const field = (h) => opts().find(o => o.Heading === h);
  const selectedOf = (f) => (f.SubOptions || []).find(s => s.ID === f.CurrentID) || null;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const cur = (h) => { const f = field(h); const s = f && selectedOf(f); return s ? s.Description : null; };

  // The richest selected-SubOption images = the full live door composite.
  function fullComposite() {
    let best = [];
    opts().forEach((o) => { const sel = selectedOf(o); const imgs = (sel && sel.Images) || []; if (imgs.length > best.length) best = imgs; });
    return best;
  }
  // Compact, COMPLETE dump — every layer, path after "Images/", with geometry.
  function dumpLayers() {
    return fullComposite().map((im) => {
      const url = String(im.ImageURL || '').replace(/\?ver=.*$/, '').replace(/^.*\/Images\//, '');
      return url + '  @cx=' + im.CX + ' cy=' + im.CY + ' w=' + im.W + ' h=' + im.H + (im.OnRightImageURL ? ' [hasRight]' : '');
    });
  }
  function sidelightFields() {
    return opts().filter((o) => /sidelight|side slab/i.test(o.Heading)).map((o) => ({
      heading: o.Heading, current: (selectedOf(o) || {}).Description, choices: (o.SubOptions || []).map((s) => s.Description)
    }));
  }

  async function waitForId(heading, id, timeout = 12000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) { await sleep(150); try { if (field(heading).CurrentID === id) return true; } catch (e) {} }
    return false;
  }
  async function setOption(cat, id, confirmHeading) { try { SelectOption(cat, id); } catch (e) {} await waitForId(confirmHeading, id); await sleep(200); }

  const SLPROBE = {};
  SLPROBE.run = async function () {
    const report = { type: cur('Door Type'), frameShape: null, states: {} };

    const fd = field('Frame Design');
    if (!fd || fd.SubOptions.length <= 1) { console.warn('[SLPROBE] No Frame Design options — select a Single Door first.'); return; }
    const baseFrameId = fd.CurrentID;

    const sidelit = fd.SubOptions.find((s) => s.Description === 'Double Sidelight')
      || fd.SubOptions.find((s) => s.Description !== 'No Sidelights' && /sidelight/i.test(s.Description));
    if (!sidelit) { console.warn('[SLPROBE] No sidelit frame shape found.'); return; }
    await setOption(fd.Category, sidelit.ID, 'Frame Design');
    await sleep(500);
    report.frameShape = sidelit.Description;

    const stype = field('Sidelight Type');

    // STATE 1 — Glazed (first glass pattern), full layer dump.
    if (stype) { const g = stype.SubOptions.find((s) => /^glazed$/i.test(s.Description)) || stype.SubOptions.find((s) => /glazed/i.test(s.Description) && !/un/i.test(s.Description)); if (g) await setOption(stype.Category, g.ID, 'Sidelight Type'); }
    const sg = field('Sidelight Glass');
    if (sg && sg.SubOptions[0]) { await setOption(sg.Category, sg.SubOptions[0].ID, 'Sidelight Glass'); }
    await sleep(300);
    report.states.glazed = { sidelightFields: sidelightFields(), layers: dumpLayers() };

    // STATE 2 — Unglazed, full layer dump (so we SEE whatever replaces the side glass).
    if (stype) {
      const u = stype.SubOptions.find((s) => /unglazed/i.test(s.Description));
      if (u) {
        await setOption(stype.Category, u.ID, 'Sidelight Type');
        await sleep(400);
        report.states.unglazed = { sidelightFields: sidelightFields(), layers: dumpLayers() };
      } else { report.states.unglazed = { note: 'No Unglazed option on Sidelight Type' }; }
    }

    // Restore.
    await setOption(fd.Category, baseFrameId, 'Frame Design');

    console.log('%c[SLPROBE] copy everything below this line to Claude ↓↓↓', 'font-weight:bold;color:#1d4f3f');
    console.log(JSON.stringify(report, null, 2));
    console.log('%c[SLPROBE] ↑↑↑ end', 'font-weight:bold;color:#1d4f3f');
    return report;
  };

  window.SLPROBE = SLPROBE;
  console.log('%c[SLPROBE v2] ready — run:  await SLPROBE.run()   (use a Single Door)', 'font-weight:bold');
})();
