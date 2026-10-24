#!/usr/bin/env python3
"""Make an Antu diagram page from a JSON file, with nothing but the standard library.

    python3 make_html.py spec.json -o diagram.html

The page is assets/viewer.html (the engine, with the place for the data left empty) with the data put in.
The same page `node tools/make-html.mjs` would make. The one difference is the static <title> in the file: the
page sets the tab's title itself from the data when it opens (src/App.jsx), so both ways give the same tab.
"""
import argparse
import gzip
import json
import pathlib
import sys

MARKER = "/*ANTU_SPEC*/null"
TYPES = ("fact", "procedure", "relationship", "justification")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("spec", help="the diagram's JSON file")
    ap.add_argument("-o", "--out", help="the HTML file to write (default: next to the JSON)")
    args = ap.parse_args()

    spec_path = pathlib.Path(args.spec)
    try:
        spec = json.loads(spec_path.read_text(encoding="utf-8-sig"))  # utf-8-sig: a byte-order mark is dropped
    except (OSError, ValueError) as e:
        print(f"cannot read {spec_path} as JSON: {e}", file=sys.stderr)
        return 1
    if not isinstance(spec, dict) or spec.get("type") not in TYPES:
        print(f'"type" must be one of {", ".join(TYPES)}; got {spec.get("type")!r}' if isinstance(spec, dict) else "the JSON must be an object", file=sys.stderr)
        return 1

    assets = pathlib.Path(__file__).resolve().parent.parent / "assets"
    viewer = assets / "viewer.html"
    if viewer.exists():
        html = viewer.read_text(encoding="utf-8")
    else:
        # a package that has to stay small ships the page compressed (WorkBuddy takes a skill of 3 MB at most)
        viewer = assets / "viewer.html.gz"
        try:
            html = gzip.decompress(viewer.read_bytes()).decode("utf-8")
        except OSError as e:
            print(f"cannot find the viewer page in {assets} (viewer.html or viewer.html.gz): {e}", file=sys.stderr)
            return 1
    if html.count(MARKER) != 1:
        print(f"{viewer} does not hold exactly one {MARKER}; it is not a viewer template", file=sys.stderr)
        return 1

    # `<` as \u003c so that a "</script" in the data cannot close the script block; the rest as JSON has it
    data = json.dumps(spec, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    # U+2028 / U+2029 are fine in JSON but were not valid inside a JavaScript string on older engines
    data = data.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")

    out = pathlib.Path(args.out) if args.out else spec_path.with_suffix(".html")
    try:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(html.replace(MARKER, data), encoding="utf-8")
    except OSError as e:
        print(f"cannot write {out}: {e}", file=sys.stderr)
        return 1
    print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
