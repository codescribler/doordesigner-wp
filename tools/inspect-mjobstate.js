/*
 * Endurance Designer — mJobState structure probe (READ-MOSTLY, 30 seconds)
 * ======================================================================
 * Purpose: confirm how the LIVE door composite is represented so we can build a
 * faithful layer-compositing extractor in a single re-run. This does NOT save or
 * request a quote. `dump()` is read-only. `probe()` makes ONE harmless option
 * change (Door Colour) to locate the live-render layer source, then you can change
 * it back in the UI.
 *
 * HOW TO RUN
 *   1. Log in to the trade portal, open the Door Designer (Default.aspx).
 *   2. F12 → Console. Paste this whole file, press Enter.
 *   3. Run:  HDDIAG.dump();      // paste the printed JSON back to Claude
 *   4. Run:  await HDDIAG.probe();   // paste that output too
 */
(function () {
  const D = {};
  const job = () => window.mJobState && window.mJobState.Job;
  const field = (h) => job().Options.find(o => o.Heading === h);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Compact a value for printing (avoid dumping megabytes).
  const trim = (v, n = 200) => {
    try { const s = typeof v === 'string' ? v : JSON.stringify(v); return s.length > n ? s.slice(0, n) + '…' : s; }
    catch (e) { return String(v); }
  };

  D.dump = function () {
    const j = job();
    const out = {};
    out.origin = location.origin;                         // asset base for mirroring
    out.mJobStateKeys = Object.keys(window.mJobState || {});
    out.jobKeys = j ? Object.keys(j) : null;
    out.jobArrayProps = j ? Object.keys(j).filter(k => Array.isArray(j[k])).map(k => k + '[' + j[k].length + ']') : null;
    out.jobObjectProps = j ? Object.keys(j).filter(k => j[k] && typeof j[k] === 'object' && !Array.isArray(j[k])).slice(0, 40) : null;
    out.segmentKeys = j ? Object.keys(j).filter(k => /segment|sidelight|topbox|leaf/i.test(k)) : null;

    // Sample a field + a SubOption + an Image to confirm geometry field names/casing.
    const f = field('Door Colour (External)') || j.Options[0];
    const so = (f.SubOptions || [])[0] || {};
    const img = (so.Images || [])[0] || null;
    out.optionCount = j.Options.length;
    out.sampleField = { heading: f.Heading, category: f.Category, currentID: f.CurrentID, subOptionKeys: Object.keys(so) };
    out.sampleImageKeys = img ? Object.keys(img) : null;
    out.sampleImage = img;                                 // full object → confirms CX/CY/W/H/Rotation/FlipH

    // Does the door have a global render layer list anywhere obvious?
    if (j) {
      out.layerLikeProps = Object.keys(j)
        .filter(k => /image|layer|render|composit|preview/i.test(k))
        .map(k => k + ' = ' + trim(j[k], 120));
    }
    console.log('[HDDIAG.dump]\n' + JSON.stringify(out, null, 2));
    return out;
  };

  // Make ONE option change and report what moved, to locate the live composite source.
  D.probe = async function () {
    const j = job();
    const dc = field('Door Colour (External)');
    const dd = field('Door Design');

    const before = {
      selectedDoorColourImages: (dc.SubOptions.find(s => s.ID === dc.CurrentID) || {}).Images || null,
      selectedDoorDesignImages: (dd.SubOptions.find(s => s.ID === dd.CurrentID) || {}).Images || null,
    };

    const target = dc.SubOptions.find(s => s.ID !== dc.CurrentID) || dc.SubOptions[1];
    console.log('[HDDIAG.probe] selecting Door Colour →', target.Description);
    SelectOption(dc.Category, target.ID);
    await sleep(1800);

    const j2 = job();
    const dc2 = j2.Options.find(o => o.Heading === 'Door Colour (External)');
    const dd2 = j2.Options.find(o => o.Heading === 'Door Design');
    const after = {
      selectedDoorColourImages: (dc2.SubOptions.find(s => s.ID === dc2.CurrentID) || {}).Images || null,
      selectedDoorDesignImages: (dd2.SubOptions.find(s => s.ID === dd2.CurrentID) || {}).Images || null,
    };

    const first = (arr) => Array.isArray(arr) && arr[0] ? (arr[0].ImageURL || arr[0].OnRightImageURL) : null;
    const report = {
      changedDoorColourTo: target.Description,
      selectedDoorColour_firstImage_before: first(before.selectedDoorColourImages),
      selectedDoorColour_firstImage_after: first(after.selectedDoorColourImages),
      selectedDoorDesign_firstImage_before: first(before.selectedDoorDesignImages),
      selectedDoorDesign_firstImage_after: first(after.selectedDoorDesignImages),
      // Did the SELECTED door-design's layer stack change when we changed colour?
      // If yes → reading the selected SubOption.Images after each SelectOption gives the live composite.
      selectedDoorDesignImages_changed:
        JSON.stringify(before.selectedDoorDesignImages) !== JSON.stringify(after.selectedDoorDesignImages),
      doorDesign_layerCount: (after.selectedDoorDesignImages || []).length,
    };
    console.log('[HDDIAG.probe]\n' + JSON.stringify(report, null, 2));
    console.log('[HDDIAG.probe] You can set the Door Colour back to its original value in the UI.');
    return report;
  };

  window.HDDIAG = D;
  console.log('[HDDIAG] ready. Run:  HDDIAG.dump();   then   await HDDIAG.probe();');
})();
