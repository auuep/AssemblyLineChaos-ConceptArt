"""Build the concept art browser into _site/.

Groups are the top-level folders of renders. Each render is linked to the prompt it was made from
by reading the ComfyUI workflow embedded in the PNG, so nothing needs tagging by hand.

    python tools/build.py
    python -m http.server -d _site
"""

import difflib
import hashlib
import json
import re
import shutil
import struct
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "_site"
RESERVED = {"styles", "prompts", "site", "tools", "_site"}
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}
THUMB_WIDTH = 640
FUZZY_MATCH = 0.9


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "group"


def normalise(text):
    return re.sub(r"\s+", " ", text).strip().lower()


def split_frontmatter(text):
    """Returns (dict, body) for a file that may start with a --- block of key: value lines."""
    meta = {}
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            for line in text[3:end].splitlines():
                if ":" in line:
                    key, value = line.split(":", 1)
                    meta[key.strip()] = value.strip()
            text = text[end + 4:]
    return meta, text


def sections(body):
    """Returns [(heading, content)] for every '## heading' in a markdown body."""
    parts = re.split(r"^## +(.+?)\s*$", body, flags=re.M)
    return [(parts[i].strip(), parts[i + 1].strip()) for i in range(1, len(parts), 2)]


def load_styles():
    styles = {}
    for path in sorted((ROOT / "styles").glob("*.md")):
        meta, body = split_frontmatter(path.read_text(encoding="utf-8"))
        found = dict(sections(body))
        slug = meta.get("slug") or path.stem
        styles[slug] = {
            "slug": slug,
            "name": meta.get("name") or slug,
            "folder": meta.get("folder", ""),
            "block": found.get("Style block", ""),
            "intent": found.get("Intent", ""),
        }
    return styles


def load_prompts():
    prompts = []
    for path in sorted((ROOT / "prompts").glob("*.md")):
        meta, body = split_frontmatter(path.read_text(encoding="utf-8"))
        title = re.search(r"^# +(.+)$", body, flags=re.M)
        for index, (heading, content) in enumerate(sections(body)):
            block = re.search(r"```text\s*\n(.*?)```", content, flags=re.S)
            if not block:
                continue
            label, ratio = heading, ""
            ratio_match = re.match(r"(.*?)\s*\(([^)]*)\)\s*$", heading)
            if ratio_match:
                label, ratio = ratio_match.group(1), ratio_match.group(2)
            prompts.append({
                "id": f"{path.stem}/{index}",
                "label": label,
                "ratio": ratio,
                "text": block.group(1).strip(),
                "style": meta.get("style", ""),
                "subject": meta.get("subject", ""),
                "batch": title.group(1).strip() if title else path.stem,
            })
    return prompts


def png_workflow(path):
    """The ComfyUI 'prompt' graph embedded in a PNG, or None."""
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    i = 8
    while i + 8 <= len(data):
        length = struct.unpack(">I", data[i:i + 4])[0]
        kind = data[i + 4:i + 8]
        if kind == b"tEXt":
            key, _, value = data[i + 8:i + 8 + length].partition(b"\0")
            if key == b"prompt":
                try:
                    return json.loads(value.decode("utf-8", "replace"))
                except json.JSONDecodeError:
                    return None
        if kind == b"IEND":
            break
        i += 12 + length
    return None


def generation_info(graph):
    """Long text inputs (prompt candidates), seed and steps from a ComfyUI graph."""
    texts, seed, steps = [], None, None
    for node in (graph or {}).values():
        inputs = node.get("inputs", {})
        for key, value in inputs.items():
            if isinstance(value, str) and len(value) >= 40:
                texts.append(value)
        if node.get("class_type", "").startswith("KSampler"):
            seed = inputs.get("seed", inputs.get("noise_seed", seed))
            steps = inputs.get("steps", steps)
    # The expansion system prompt is a candidate too; it never matches a prompt file.
    return texts, seed if isinstance(seed, int) else None, steps if isinstance(steps, int) else None


def match_prompt(texts, prompts):
    best, best_ratio = None, 0.0
    for text in texts:
        candidate = normalise(text)
        for prompt in prompts:
            target = prompt["norm"]
            if candidate == target or target in candidate:
                return prompt
            matcher = difflib.SequenceMatcher(None, candidate, target, autojunk=False)
            if matcher.real_quick_ratio() < FUZZY_MATCH or matcher.quick_ratio() < FUZZY_MATCH:
                continue
            ratio = matcher.ratio()
            if ratio > best_ratio:
                best, best_ratio = prompt, ratio
    return best if best_ratio >= FUZZY_MATCH else None


def build_image(path, prompts):
    data = path.read_bytes()
    image_id = hashlib.sha1(data).hexdigest()[:12]
    ext = path.suffix.lower()
    shutil.copyfile(path, OUT / "img" / f"{image_id}{ext}")
    with Image.open(path) as image:
        width, height = image.size
        thumb = image.convert("RGB")
        thumb.thumbnail((THUMB_WIDTH, THUMB_WIDTH * 4))
        thumb.save(OUT / "thumb" / f"{image_id}.webp", "WEBP", quality=80)
    texts, seed, steps = generation_info(png_workflow(path)) if ext == ".png" else ([], None, None)
    prompt = match_prompt(texts, prompts)
    embedded = ""
    if not prompt:
        # Show the most prompt-like text it carries: the longest that isn't the expansion system prompt.
        others = [t for t in texts if not t.startswith("You are an expert prompt engineer")]
        embedded = max(others, key=len) if others else ""
    return {
        "id": image_id,
        "full": f"img/{image_id}{ext}",
        "thumb": f"thumb/{image_id}.webp",
        "w": width,
        "h": height,
        "seed": seed,
        "steps": steps,
        "prompt": prompt["id"] if prompt else None,
        "embedded": embedded,
        "_order": path.name,
    }


def images_in(folder):
    return sorted(p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTS)


def build():
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / "img").mkdir(parents=True)
    (OUT / "thumb").mkdir()

    styles = load_styles()
    prompts = load_prompts()
    for prompt in prompts:
        prompt["norm"] = normalise(prompt["text"])
    by_folder = {slugify(s["folder"]): s for s in styles.values() if s["folder"]}

    folders = sorted(
        p for p in ROOT.iterdir()
        if p.is_dir() and not p.name.startswith(".") and p.name not in RESERVED and images_in(p)
    )
    groups = []
    for folder in folders:
        slug = slugify(folder.name)
        style = by_folder.get(slug) or styles.get(slug)
        groups.append({"slug": slug, "name": folder.name, "style": style, "images": [
            build_image(p, prompts) for p in images_in(folder)]})
    loose = images_in(ROOT)
    if loose:
        groups.append({"slug": "unsorted", "name": "Unsorted", "style": None,
                       "images": [build_image(p, prompts) for p in loose]})
    linked = {g["style"]["slug"] for g in groups if g["style"]}
    for style in styles.values():
        if style["slug"] not in linked:
            groups.append({"slug": style["slug"], "name": style["name"], "style": style, "images": []})

    prompt_by_id = {p["id"]: p for p in prompts}
    out_groups, used_prompts = [], set()
    for group in groups:
        style = group["style"]
        order = [p["id"] for p in prompts if style and p["style"] == style["slug"]]
        for image in group["images"]:
            if image["prompt"] and image["prompt"] not in order:
                order.append(image["prompt"])
        used_prompts.update(order)
        images = [{k: v for k, v in i.items() if k != "_order"} for i in group["images"]]
        cover = next((i["id"] for i in images if i["prompt"]), images[0]["id"] if images else None)
        out_groups.append({
            "slug": group["slug"],
            "name": group["name"],
            "style": {k: style[k] for k in ("slug", "name", "block", "intent")} if style else None,
            "prompts": order,
            "images": images,
            "cover": cover,
        })

    data = {
        "groups": out_groups,
        "prompts": {pid: {k: v for k, v in prompt_by_id[pid].items() if k != "norm"}
                    for pid in sorted(used_prompts)},
    }
    (OUT / "data.json").write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
    for path in (ROOT / "site").iterdir():
        if path.is_file():
            shutil.copyfile(path, OUT / path.name)
    (OUT / ".nojekyll").write_text("")

    for group in out_groups:
        matched = sum(1 for i in group["images"] if i["prompt"])
        print(f"{group['name']}: {len(group['images'])} renders, {matched} linked to a prompt"
              f"{', style ' + group['style']['name'] if group['style'] else ', no style'}")
    return 0


if __name__ == "__main__":
    sys.exit(build())
