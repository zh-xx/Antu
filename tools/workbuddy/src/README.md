# WorkBuddy market assets

- `icon.svg` — design source (not shipped in the zip; the market rejects SVG).
- `icon.png` — 512×512 PNG ≤ 500 KB, shipped as `antu/icon.png`. Regenerate with:

```bash
python3 - <<'PY'
import cairosvg
from pathlib import Path
Path('icon.png').write_bytes(
  cairosvg.svg2png(url='icon.svg', output_width=512, output_height=512)
)
PY
```
