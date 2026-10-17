# Assembly Line Chaos — Concept Art

Style explorations for [Assembly Line Chaos](https://github.com/Donkie/AssemblyLineChaos): style
directions, Krea 2 prompts, and the renders made from them, with a small web page for browsing
them. None of it is an approved art decision for the game.

**Browse:** https://auuep.github.io/AssemblyLineChaos-ConceptArt/

Prompts are written with the game repo's `krea-concept-prompts` skill, which reads the game's
style-neutral description (`Concept/baseline.md` in the game repo) and saves its output here.

## Layout

| Path | What |
|---|---|
| `styles/<slug>.md` | A style direction: frontmatter `name`, `slug`, `folder` (its render folder), then `## Style block` and `## Intent` |
| `prompts/<date>-<slug>.md` | A batch of prompts: frontmatter `style`, `subject`; each prompt under a `## <label> (<ratio>)` heading in a fenced `text` block |
| `<group>/` | Renders, one top-level folder per group (e.g. `grimy/`, `cute/`). The folder name is the group shown on the page. File names don't matter and are never shown |
| `site/` | The page: `index.html`, `app.js`, `style.css` (no framework) |
| `tools/build.py` | Builds `_site/` from all of the above |

## Adding renders

Drop the PNGs from ComfyUI into a group folder, then commit and push. Every ComfyUI PNG carries its
workflow, so the build reads the prompt out of each image and files it under the prompt it came
from. Nothing needs tagging by hand. A render whose prompt isn't in `prompts/` shows under "Other
renders" in its group, and images loose at the root go to "Unsorted". A group links to a style
when the style's `folder` (or `slug`) matches the folder name.

## Preview locally

```bash
pip install pillow
python tools/build.py
python -m http.server 8765 -d _site
```

Then open http://localhost:8765.

## Publishing

Pushing to `main` runs `.github/workflows/pages.yml`, which builds the site and deploys it to
GitHub Pages. Renders are plain git files (about 1.4 MB each). If the repo grows past roughly
500 MB, move them to Git LFS and set `lfs: true` on the workflow's checkout.
