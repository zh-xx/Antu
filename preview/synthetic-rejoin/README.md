# Synthetic hang→spine rejoin previews

Offline Mainline diagrams for the four verified stages-off route classes.

These are **synthetic / not shipped examples**. HTML is **local preview only**
(gitignored under `preview/**/*.html`). Fixtures stay in the repo for tests.

Each page bakes in
`window.__ANTU_PRESET__ = { fields: { engine: 'mainline', stages: false } }`
so it opens already on stages-off Mainline. Hard-refresh after open if a
browser cached an older build.

## Layout

| Path | Role |
|------|------|
| `fixtures/*.json` | Procedure specs (tracked) |
| `html/*-mainline.html` | Generated locally — not committed |

## Regenerate HTML

```bash
node --input-type=module <<'JS'
import { readFileSync, mkdirSync } from 'node:fs'
import { renderToFile } from './tools/lib/make-html.mjs'
mkdirSync('preview/synthetic-rejoin/html', { recursive: true })
const preset = { fields: { engine: 'mainline', stages: false } }
for (const name of [
  'S1-hang-lane-clear',
  'S2-gutter-blocked-lane',
  'S3-outer-gutter-blocked',
  'S4-hang-lane-upward',
]) {
  const spec = JSON.parse(readFileSync(`preview/synthetic-rejoin/fixtures/${name}.zh-CN.json`, 'utf8'))
  renderToFile(spec, {
    outPath: `preview/synthetic-rejoin/html/${name}-mainline.html`,
    preset,
    quiet: true,
  })
  console.log('wrote', name)
}
JS
```

## Route classes

| File | Focus edge | Expected route class |
|------|------------|----------------------|
| `S1-hang-lane-clear` | n-5→n-3「回并」 | hang-lane (clear) |
| `S2-gutter-blocked-lane` | n-9→n-6「是」 | inward gutter |
| `S3-outer-gutter-blocked` | n-21→n-3「回并」 | nested auto side-flip: 外挂 left, 内挂 right; 回并 leaves west (was same-side / far-outer cutting boxes) |
| `L1-litigation-nested-hang` | n-19→n-4「回并」 | DeepSeek-authored 买卖合同一审: 管辖异议 long dead hang (right) contains 财产保全 short rejoin hang (auto-flips left); upward back-edge rejoin |
| `L2-labour-arbitration-nested` | n-19→n-5「回并」 | DeepSeek: 劳动争议仲裁·加班工资 — nested hang + side-end |
| `L3-admin-reconsider-nested` | n-15→n-12「回并」 | DeepSeek: 行政处罚复议·环保罚款 — nested hang + side-end |
| `L4-enforcement-objection-nested` | n-15→n-13「回并」 | DeepSeek: 执行异议·房屋买卖 — nested hang + side-end |
| `S4-hang-lane-upward` | n-7→n-2 | hang-lane upward |

## HTML outputs

- `html/S1-hang-lane-clear-mainline.html`
- `html/S2-gutter-blocked-lane-mainline.html`
- `html/S3-outer-gutter-blocked-mainline.html`
- `html/L1-litigation-nested-hang-mainline.html` (local)
- `html/L2-labour-arbitration-nested-mainline.html` (local)
- `html/L3-admin-reconsider-nested-mainline.html` (local)
- `html/L4-enforcement-objection-nested-mainline.html` (local)
- `html/S4-hang-lane-upward-mainline.html`

## Same-row demo (manual)

| File | Note |
|------|------|
| `html/S2-same-row-demo-mainline.html` | Manual snap:「协商是否成功」aligned with「甲方付款」→「是」is a straight horizontal. Hang boxes above were pushed up. **Preview-only** (engine patch baked into this HTML; source tree unchanged). |

## Spine-gap demo (manual)

| File | Note |
|------|------|
| `html/S2-spine-gap-demo-mainline.html` | Experiment: lengthen spine「合格」(n-5→n-6) so hang can keep **both** fork leave same-row and rejoin same-row. Preview-only; source unchanged. |
