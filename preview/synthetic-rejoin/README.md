# Synthetic hang→spine rejoin previews

Offline Mainline diagrams for the four verified stages-off route classes.

These are **synthetic / not shipped examples**. Each HTML page bakes in
`window.__ANTU_PRESET__ = { fields: { engine: 'mainline', stages: false } }`
so it opens already on stages-off Mainline. Hard-refresh after open if a
browser cached an older build.

## Layout

| Path | Role |
|------|------|
| `fixtures/*.json` | Procedure specs |
| `html/*-mainline.html` | Generated diagrams |

## Route classes

| File | Focus edge | Expected route class |
|------|------------|----------------------|
| `S1-hang-lane-clear` | n-5→n-3「回并」 | hang-lane (clear) |
| `S2-gutter-blocked-lane` | n-9→n-6「是」 | inward gutter |
| `S3-outer-gutter-blocked` | n-21→n-3「回并」 | branch regions: contained hang inner lane → inward gutter (was outer cutting boxes) |
| `S4-hang-lane-upward` | n-7→n-2 | hang-lane upward |

## HTML outputs

- `html/S1-hang-lane-clear-mainline.html`
- `html/S2-gutter-blocked-lane-mainline.html`
- `html/S3-outer-gutter-blocked-mainline.html`
- `html/S4-hang-lane-upward-mainline.html`

## Same-row demo (manual)

| File | Note |
|------|------|
| `html/S2-same-row-demo-mainline.html` | Manual snap:「协商是否成功」aligned with「甲方付款」→「是」is a straight horizontal. Hang boxes above were pushed up. **Preview-only** (engine patch baked into this HTML; source tree unchanged). |

## Spine-gap demo (manual)

| File | Note |
|------|------|
| `html/S2-spine-gap-demo-mainline.html` | Experiment: lengthen spine「合格」(n-5→n-6) so hang can keep **both** fork leave same-row and rejoin same-row. Preview-only; source unchanged. |
