#!/usr/bin/env python3
"""Shrink the gallery photos that are already in Supabase storage.

Photos uploaded straight from a phone are ~4000px wide and 1-2MB each, which
is fine for the lightbox and far too heavy for the header slider — the site
sits on its built-in fallback image until the first slide finishes arriving.

This re-encodes each one in place: same bucket, same filename, same format, so
public_url never changes and nothing in the database needs touching.

    python scripts/compress-gallery.py               # dry run, shows what it would do
    python scripts/compress-gallery.py --apply       # actually replace them
    python scripts/compress-gallery.py --apply --only-hero

Originals are downloaded to backups/gallery-originals/ before anything is
overwritten, so a bad run can be put back.

Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env (the service key is
required to overwrite storage objects), and Pillow: pip install pillow
"""

import argparse
import io
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("Pillow is missing. Install it with:  pip install pillow")

ROOT = Path(__file__).resolve().parent.parent
BUCKET = "gallery-images"
STORAGE_MARKER = f"/storage/v1/object/public/{BUCKET}/"
BACKUP_DIR = ROOT / "backups" / "gallery-originals"

# Re-encoding is only worth the churn if it actually saves something.
MIN_SAVING = 0.15


def load_env():
    """Read .env without adding a dependency on python-dotenv."""
    env = {}
    env_path = ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, _, value = line.partition("=")
            env[name.strip()] = value.strip().strip('"').strip("'")

    url = os.environ.get("SUPABASE_URL") or env.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env")
    return url.rstrip("/"), key


def fetch_rows(url, key, only_hero):
    query = "select=id,public_url,sort_order,visible,hero_slide&order=sort_order.asc"
    if only_hero:
        query += "&hero_slide=eq.true"
    req = urllib.request.Request(
        f"{url}/rest/v1/gallery_images?{query}",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def recompress(raw, ext, max_width, quality):
    """Returns the re-encoded bytes, plus the old and new pixel dimensions."""
    img = Image.open(io.BytesIO(raw))
    # Phone photos carry their rotation in EXIF; bake it in before resizing,
    # or the picture comes back sideways with the tag stripped.
    img = ImageOps.exif_transpose(img)
    before = img.size

    if img.width > max_width:
        height = round(img.height * max_width / img.width)
        img = img.resize((max_width, height), Image.LANCZOS)

    out = io.BytesIO()
    if ext == "webp":
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA" if "A" in img.mode else "RGB")
        img.save(out, "WEBP", quality=quality, method=6)
    else:
        img.save(out, "JPEG", quality=quality, optimize=True, progressive=True)
    return out.getvalue(), before, img.size


def upload(url, key, path, data, content_type):
    req = urllib.request.Request(
        f"{url}/storage/v1/object/{BUCKET}/{urllib.request.quote(path)}",
        data=data,
        method="PUT",
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": content_type,
            "x-upsert": "true",
            "cache-control": "3600",
        },
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        return resp.status


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="replace the files (default is a dry run)")
    parser.add_argument("--only-hero", action="store_true", help="only the photos ticked for the header slider")
    parser.add_argument("--max-width", type=int, default=2000, help="longest edge in pixels (default 2000)")
    parser.add_argument("--quality", type=int, default=78, help="encoder quality 1-100 (default 78)")
    parser.add_argument("--min-kb", type=int, default=300, help="leave files already under this alone (default 300)")
    args = parser.parse_args()

    url, key = load_env()
    rows = fetch_rows(url, key, args.only_hero)
    print(f"{len(rows)} photo(s) in the gallery{' flagged for the header' if args.only_hero else ''}\n")

    if args.apply:
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    total_before = total_after = 0
    changed = skipped = failed = 0

    for row in rows:
        public_url = row["public_url"]
        if STORAGE_MARKER not in public_url:
            print(f"  skip   {public_url[-42:]:<44} not in Supabase storage")
            skipped += 1
            continue

        path = urllib.request.unquote(public_url.split(STORAGE_MARKER, 1)[1])
        name = path.rsplit("/", 1)[-1]
        ext = name.rsplit(".", 1)[-1].lower()
        if ext == "jpeg":
            ext = "jpg"
        if ext not in ("jpg", "webp", "png"):
            print(f"  skip   {name[-42:]:<44} unsupported format")
            skipped += 1
            continue

        try:
            raw = urllib.request.urlopen(public_url, timeout=120).read()
        except Exception as err:  # noqa: BLE001 - one bad file shouldn't stop the run
            print(f"  FAIL   {name[-42:]:<44} download: {err}")
            failed += 1
            continue

        total_before += len(raw)

        if len(raw) <= args.min_kb * 1024:
            print(f"  ok     {name[-42:]:<44} {len(raw)//1024:>5} KB already small")
            total_after += len(raw)
            skipped += 1
            continue

        try:
            new, before_size, after_size = recompress(raw, ext, args.max_width, args.quality)
        except Exception as err:  # noqa: BLE001
            print(f"  FAIL   {name[-42:]:<44} encode: {err}")
            total_after += len(raw)
            failed += 1
            continue

        saving = 1 - len(new) / len(raw)
        if saving < MIN_SAVING:
            print(f"  ok     {name[-42:]:<44} {len(raw)//1024:>5} KB, only {saving:.0%} to gain")
            total_after += len(raw)
            skipped += 1
            continue

        arrow = (
            f"{len(raw)//1024:>5} KB -> {len(new)//1024:>5} KB  "
            f"({before_size[0]}x{before_size[1]} -> {after_size[0]}x{after_size[1]})"
        )

        if not args.apply:
            print(f"  would  {name[-42:]:<44} {arrow}")
            total_after += len(new)
            changed += 1
            continue

        (BACKUP_DIR / name).write_bytes(raw)
        try:
            upload(url, key, path, new, "image/webp" if ext == "webp" else "image/jpeg")
        except urllib.error.HTTPError as err:
            print(f"  FAIL   {name[-42:]:<44} upload {err.code}: {err.read().decode(errors='replace')[:120]}")
            total_after += len(raw)
            failed += 1
            continue

        print(f"  done   {name[-42:]:<44} {arrow}")
        total_after += len(new)
        changed += 1

    print(
        f"\n  {'would change' if not args.apply else 'changed'}: {changed}   "
        f"left alone: {skipped}   failed: {failed}"
    )
    if total_before:
        print(
            f"  gallery weight: {total_before//1024} KB -> {total_after//1024} KB "
            f"({100 - total_after * 100 // total_before}% smaller)"
        )
    if not args.apply and changed:
        print("\n  This was a dry run. Re-run with --apply to replace them.")
    elif args.apply and changed:
        print(f"\n  Originals saved in {BACKUP_DIR.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
