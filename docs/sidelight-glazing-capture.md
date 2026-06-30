# Sidelight glazing capture (live Endurance retail designer)

Read-only capture from `mJobState.Job.Drawing.Elements` to fix the plugin's side-panel
glazing. The plugin currently always paints `Glazing/Side/Ornate.jpg`; Endurance renders the
door's glazing **design** into the side apertures when the sidelight type is "copy glazing".

## Mechanism

- **Sidelight Type = obscure / not "copy glazing"** (or `Side Slab Glass Design` = null):
  side paints one overlay `Glazing/Side/Ornate.jpg` covering the panel. ← what the plugin does today (correct for this case).
- **Sidelight Type = "copy glazing"**: `Side Slab Glass Design` auto-copies `Door Glass`, and the
  side paints `DoorGlazing/<design>/<key>.png` per aperture — the same leaded pattern as the door.

## Capture 1 — "Sidelight Left", door glass = Clarence, copy-glazing ON

- Canvas: 1474 × 2120 (Endurance units; X is element CENTRE).
- Door blank:  `DoorBlanks/Door Mould 10/White.jpg`  X=962 Y=1070 W=921 H=2050
- Side blank:  `DoorBlanks/Side Mould 10/White.jpg`  X=217 Y=1082 W=499 H=2050
- Side apertures: 4 × `DoorGlazing/Clarence/K1.png`  X=217  Y=[310,780,1250,1721]  W=202 H=151
- Door apertures: 4 × `DoorGlazing/Clarence/K1.png`  X=962  Y=[310,780,1250,1721]  W=202 H=151

**Key finding:** the side apertures are the door's apertures (same key K1, same Y, same W/H),
translated horizontally from the door centre (X=962) to the side-panel centre (X=217), i.e. a
pure X shift of −745. The narrower side blank (W=499 vs 921) does NOT scale the apertures.

## Capture 2 — door design = "Ainos" (staggered), copy-glazing ON

- Door apertures: 3 × `DoorGlazing/Clarence/K15` STAGGERED — X=[785,1138,785] Y=[573,1030,1490] W=198 H=604
- Side apertures: **1** × `DoorGlazing/Adina/K2` — X=217 Y=978 W=202 H=912 (one tall aperture)

**Decisive finding:** the side does NOT mirror the door. Door = Ainos / 3 staggered / Clarence;
side = its own design (Adina) / single K2 aperture. The earlier "both Clarence, 4 apertures"
match was a coincidence of that particular door design.

## Conclusion

Side-panel glazing is an INDEPENDENT subsystem in Endurance:
- `Side Slab Design` (82 options) → the side's own aperture layout (independent of the door).
- `Side Slab Glass Design` (38 options) → the side's glass pattern.
- "Copy glazing" sidelight type syncs the side GLASS to the door glass in some cases, but the
  side LAYOUT follows the Side Slab Design, not the door.

So the plugin's fixed `Glazing/Side/Ornate.jpg`:
- is correct for the obscure/default sidelight,
- is a simplification (not a faithful match) for a decorative sidelight.

Faithfully replicating this = building a second design subsystem for side panels (82 layouts).

**DECISION (Daniel, 2026-06-30): full faithful rebuild.**

## The side catalogue (read live from Side Slab Design, 82 options)

Naming: every side design is `<DoorDesign> Infill Side [L/R]` (glazed) or `<DoorDesign> Solid Side`
(solid) — i.e. each side design is PAIRED with a door design. Solid-door designs (Ben Nevis, Mayon,
McKinley, Mardale, Grasmoor) have no glass key (`-`).

**Only 6 distinct cassette keys across all 82:** K1 (32), K2 (24), K15 (14), 764 (8), 848 (4),
Diamond (4). So aperture SHAPE is driven by ~6 keys; aperture POSITIONS follow the design.
Multi-key designs exist (Diran K2+K1, Elbrus/Algas/Esk K1+K15, Bowmont K1+K2).

`Side Slab Glass Design` (the PATTERN, 38 options, e.g. Clarence/Opal/Adina) is the same glazing
family the door uses → already renderable via `DoorGlazing/<pattern>/<key>.png`.

## Geometry samples captured (Endurance units, X = element centre, canvas 1474×2120)

- Side, "Sidelight Left", copy-glazing, Clarence: 4 × K1 apertures, X=217, Y=[310,780,1250,1721], W=202 H=151.
- Side, door=Ainos design, glass=Adina: 1 × K2 aperture, X=217, Y=978, W=202 H=912.
- Door Ainos (our model): Door Mould 1, K15, 3 staggered apertures — MATCHES Endurance's door render.

## Open question that decides effort

Is `<X> Infill Side` geometry == door design `<X>` geometry transformed into the side frame?

**ANSWERED: NO.** Side "Apo Infill Side R" = 1 tall K2 aperture (W=250 H=965 Endurance units),
but our door "Apo" = 2 staggered K2 apertures (w=30 h=137 each). The side "Infill" designs are
side-specific SIMPLIFIED layouts, not the door layout. So the 82 side geometries must be captured
from Endurance; they cannot be derived from the 88 door geometries.

Note: the door→default-side pairing is NOT name-identical either (door "Ainos" had side
"Apo Infill Side R" selected — likely a leftover, mapping unconfirmed).

## Remaining work for the rebuild

1. CAPTURE the 82 side-design geometries (aperture positions+keys in the side frame) — gating data.
   Method TBD: hand-drive in Endurance vs extend the original catalogue-capture tooling.
2. Side glass pattern (38) reuses `DoorGlazing/<pattern>/<key>` — already rendered for the door.
3. Render-model: add side-design layouts; assemble() paints them in the side panel per shape.
4. Wizard UX: decide whether the customer picks a side design / side glass, or it derives.
5. Scale Endurance units → our stage (door blank W=921 Endurance ≈ 155.25 ours; factor ≈ 0.1686).
