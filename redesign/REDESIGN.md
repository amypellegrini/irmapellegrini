# Redesign — handoff

Working branch: `redesign/vitrine`. Nothing here is live; GitHub Pages builds
from `main` at `/docs`, so this branch cannot affect irmapellegrini.co.uk until
it is merged.

## Decision

**Vitrine** was chosen from three directions.

Museum lighting: a dark warm ground, one object at a time, each piece lit inside
its case. This was picked because most of the collection is white-on-white —
white painted frames, pale figures photographed against white walls — and a dark
ground is what makes those pieces read. The two rejected directions were **Wall**
(warm limewash, work hung with a shadow, modular square grid echoing the 576
blocks) and **Catalogue** (a monograph with a margin rail of dates and a works
index). Both are preserved in `directions.template.html` if any part is wanted
later.

### Tokens

| Role | Value | Note |
| --- | --- | --- |
| Ground | `#16130F` | warm near-black, not neutral |
| Raised / case | `#211D17` | with `inset 0 0 5rem rgba(0,0,0,.55)` |
| Ink | `#E9E3D7` | bone, not white |
| Muted | `#948B7C` | |
| Accent | `#C2924E` | honey; hairlines and labels only |
| Line | `#353026` | |

Display type is Didot / Hoefler Text at light weight; body is Helvetica Neue;
labels are uppercase at `0.18em` tracking. **The fonts in the prototype are
system faces and are placeholders** — the artifact sandbox blocked font CDNs, so
they were chosen for availability, not fit. Pick and self-host real faces during
the build; the layout assumes a high-contrast light serif for display.

### Known weakness

The `1986–2009` archive photographs are already dark and warm-toned, so they have
the least room to breathe on a dark ground. That section needs its own treatment
— likely a lighter inset panel, or generous matting around each image.

## Viewing the directions

The three directions are at
<https://claude.ai/code/artifact/2e245fec-b2c2-47d5-a928-b85e1708cd74>.

To rebuild locally:

```sh
python3 redesign/build-directions.py   # writes redesign/directions.html (~2 MB)
```

`directions.html` is generated and intentionally uncommitted; the template plus
the images already in `files/gimgs/` are the source of truth.

## State of the current site

`.eleventy.js` sets input `.` and output `docs/`, but there are **no layouts, no
templates and no data files**. Eleventy is acting as a file copier. Every page
carries its own duplicated `<head>` and markup.

Two eras are mixed together:

- `index.html` — a recent standalone landing page ("The Little Wooden People"),
  self-contained styles, loads Google Fonts.
- Everything else — salvaged output from **Indexhibit**, a ~2010 CMS. XHTML 1.0
  Transitional, jQuery + Thickbox, horizontal-scrolling galleries with hardcoded
  widths (`#img-container { width: 7631px }`), and sidebar navigation that is
  almost entirely commented out.

### Live bugs, verified against irmapellegrini.co.uk

1. **Six pages render with no stylesheet at all.** They link
   `ndxz-studio/site/sample/style.css`, a directory that does not exist anywhere
   in the repo. Confirmed live: `/ongoing/leaves/` returns 200 while its
   stylesheet returns 404. Affected: `legacy/`, `project/1986-to-2009/`,
   `ongoing/art-corner--the-coffee-point/`, `ongoing/leaves/`,
   `ongoing/tribute-to-valentine/`, `news/pizarras/`.
2. **`shop/` loads its stylesheet but all four scripts 404** (same `ndxz-studio`
   path), so the Thickbox lightbox is dead.
3. **`ongoing/movements-of-living/` has the wrong depth on its scripts** —
   `../assets/site/js/…` from a two-level-deep page; needs `../../`.
4. **Mixed content**: every legacy page embeds a Creative Commons badge over
   plain `http://i.creativecommons.org/…`, which browsers block on HTTPS.
5. **Wrong canonicals**: `ongoing/movements-of-living/` declares
   `http://www.ipellegrini.com/` — a different domain. Others point at the
   homepage rather than themselves.
6. **Unoptimised images**: 53 JPEGs, 7.2 MB, no responsive sizes. Phones are
   served full-size photographs.

Since the rebuild replaces these pages wholesale, the fixes come for free —
but if the rebuild slips, items 1 and 3 are worth a standalone patch to `main`.

## Content inventory

All copy is recoverable from the existing pages; the prototype already
transcribes most of it.

| Series | Source page | Images |
| --- | --- | --- |
| Movements of Living | `ongoing/movements-of-living/` | `18_01`–`18_12` |
| Leaves | `ongoing/leaves/` | `17_14hojas1`–`5`, `13_hojitas*` |
| Tribute to Valentine | `ongoing/tribute-to-valentine/` | `20_112irma1`–`4email` |
| Art Corner @ The Coffee Point | `ongoing/art-corner--the-coffee-point/` | `26_1irma001`–`006` |
| On The Way To… (Taipei, 2012) | `news/pizarras/` | none |
| Previous work 1986–2009 | `project/1986-to-2009/` | `9_archive001`–`019` |
| Bio | `about/` | reuses `9_archive*` |

Hero image is `1_irmabricklane-2.jpg` (2048×1365) — the only large photograph in
the set, and the only one shot in natural light.

Details to preserve: materials are named per work (*rauli, palo santo, alerce,
cypress, alamo, cancharana*); provenance lines are worth keeping verbatim
("recycled pieces of an old wood frame from Irma's father's shed", "sold at
Camden Lock Market in 2004"). Contact is irmapellegrini@gmail.com and
+44 (0) 7777625504. Currently showing at Artisan, 85 Brick Lane, E1 6QL,
Thursday–Saturday 11am–6pm and Sunday 10am–6pm.

The Tribute to Valentine page carries a six-step "game rules" list for swapping a
gift — unusual and worth keeping rather than trimming.

## Build plan

Agreed scope is a **full rebuild** on Eleventy, keeping all content and URLs:

```
_includes/base.njk          one shared layout
_includes/series.njk        gallery layout
content/about.md
content/series/*.md         one file per series
assets/css/site.css         single stylesheet, Vitrine tokens
assets/img/                 resized, responsive
```

1. Add layouts and move page content into markdown with front matter.
2. Implement the Vitrine tokens as CSS custom properties; single stylesheet.
3. Generate responsive image sizes (`@11ty/eleventy-img`) and lazy-load.
4. Keep existing URLs so nothing already linked breaks.
5. Delete the `ndxz-studio` references, jQuery, Thickbox and the XHTML doctypes.
6. Rebuild `docs/` and merge to `main` — that is what publishes.

## Open questions

1. **Which name leads the site** — "The Little Wooden People", or Irma
   Pellegrini? The domain, logo and every inner page currently say the latter;
   only the landing page says the former.
2. **Should the shop take payment online**, or keep directing people to Brick
   Lane on a Sunday? `shop/` is currently a "How to buy" page, not a shop.

## Housekeeping

- `.DS_Store` and `yarn-error.log` are tracked and should be removed and
  gitignored. Left alone here to keep this branch focused on the redesign.
- The repo has no `package.json` at root despite `.eleventy.js` expecting
  Eleventy; the rebuild needs one.
- The TLS certificate for the custom domain expires 2026-09-28. GitHub renews it
  automatically while the DNS stays put — no action unless the domain moves.
