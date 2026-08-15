#!/usr/bin/env python3
"""Inline the site's photographs into the design-directions page.

The directions page is shared as a standalone HTML file, so every image has to
travel inside it as a data URI. Run from the repository root:

    python3 redesign/build-directions.py

Writes redesign/directions.html, which is deliberately not committed: it is
~2 MB of base64 rebuilt from files/gimgs/ in seconds.
"""

import base64
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES = os.path.join(ROOT, "files", "gimgs")
TEMPLATE = os.path.join(ROOT, "redesign", "directions.template.html")
OUTPUT = os.path.join(ROOT, "redesign", "directions.html")

missing = []


def inline(match):
    name = match.group(1)
    path = os.path.join(IMAGES, name)
    if not os.path.exists(path):
        missing.append(name)
        return ""
    with open(path, "rb") as handle:
        encoded = base64.b64encode(handle.read()).decode()
    return "data:image/jpeg;base64," + encoded


with open(TEMPLATE) as handle:
    page = re.sub(r"\{\{IMG:([^}]+)\}\}", inline, handle.read())

if missing:
    sys.exit("Missing images in files/gimgs/: " + ", ".join(missing))

with open(OUTPUT, "w") as handle:
    handle.write(page)

print("Wrote %s (%.2f MB)" % (OUTPUT, len(page.encode()) / 1048576))
