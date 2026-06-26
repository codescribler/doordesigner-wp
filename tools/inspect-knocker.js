/*
 * Endurance Designer — knocker-by-style probe (10 seconds)
 * ========================================================
 * Determines HOW "knocker greyed on some styles" is represented, so we can
 * capture per-style knocker availability correctly in one pass.
 *
 * It selects a spread of styles and reports, for each, the Knocker option count
 * + labels, plus the schema/flags on a knocker SubOption. Read-only except for
 * changing the selected style (harmless; set it back in the UI after).
 *
 * RUN (logged in, Door Designer open, on a SINGLE door type):
 *   paste this file → await HDKNOCK.run();  → paste the console output back.
 */
(function () {
  const HDKNOCK = {};
  const job = () => window.mJobState.Job;
  const field = (h) => job().Options.find(o => o.Heading === h);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function selectStyle(s) {
    const dd = field('Door Design');
    SelectOption(dd.Category, s.ID);
    const t0 = Date.now();
    while (Date.now() - t0 < 9000) { await sleep(150); try { if (field('Door Design').CurrentID === s.ID) break; } catch (e) {} }
    await sleep(300);
  }

  HDKNOCK.run = async function () {
    const k0 = field('Knocker');
    if (!k0) { console.log('[knock] no Knocker field on this door type'); return; }

    const out = {};
    out.knockerFieldKeys = Object.keys(k0);
    out.subOptionKeys = Object.keys(k0.SubOptions[0] || {});
    out.booleanKeysOnSubOption = Object.keys(k0.SubOptions[0] || {}).filter((key) => typeof k0.SubOptions[0][key] === 'boolean');

    const dd = field('Door Design');
    const idxs = [0, 10, 20, 30, 40, 50, 70, dd.SubOptions.length - 1];
    const picks = idxs.map((i) => dd.SubOptions[i]).filter(Boolean);
    const perStyle = [];
    for (const s of picks) {
      await selectStyle(s);
      const k = field('Knocker');
      const subs = (k && k.SubOptions) || [];
      perStyle.push({
        style: s.Description,
        knockerCount: subs.length,
        firstFive: subs.slice(0, 5).map((x) => x.Description),
        // surface any per-suboption boolean values that vary (possible "enabled" flag)
        boolSample: subs[0] ? Object.keys(subs[0]).filter((key) => typeof subs[0][key] === 'boolean').map((key) => key + '=' + subs[0][key]) : []
      });
    }
    out.perStyle = perStyle;
    out.countsVaryByStyle = new Set(perStyle.map((p) => p.knockerCount)).size > 1;

    console.log('[HDKNOCK]\n' + JSON.stringify(out, null, 1));
    console.log('[HDKNOCK] countsVaryByStyle =', out.countsVaryByStyle, '(true → per-style list; false → greying is elsewhere)');
    return out;
  };

  window.HDKNOCK = HDKNOCK;
  console.log('[HDKNOCK] ready. Run:  await HDKNOCK.run();');
})();
