# BookingBridge BI

A refined, self-hosted, white-label business-intelligence tool — the sellable
product layer for BookingBridge attribution. Metabase-class polish, 100% yours,
no per-feature license gate.

**Status: front-end built with placeholder data.** Every number is fake right
now. Wiring the real BookingBridge API is a one-flag change (see below).

## Run locally
No build step. From this folder:

```bash
python3 -m http.server 4173
# then open http://localhost:4173
```

(or any static server; or just open `index.html` — charts load from a CDN so
you need internet the first time.)

## What's in it
- **Home** — greeting + headline KPIs + quick links.
- **Attribution Dashboard** — 5 KPI scalars (spend, proven revenue, ROAS,
  proven bookings, capture rate w/ sparkline) + 6 charts: spend vs proven
  revenue, evidence mix donut, top properties, monthly booked revenue, matched
  bookings table, inquiry→booking lag.
- **Bookings** — full table with All / Ad-proven / Contact filters + evidence pills.
- **Campaigns** — spend-vs-proven bar + per-campaign table with ROAS.
- **Browse data** — schema overview (Metabase-style).
- **Appearance** — live white-label: change brand name + accent color and the
  whole app (including every chart) recolors instantly; persists per device.

## Theming / white-label
- Default brand: ocean teal, "BookingBridge". Change it live in **Appearance**,
  or edit the `--brand` token in `assets/theme.css` for a new default.
- Logo: swap the inline SVG in `index.html` (`#brandMark`) and the hero glyph.

## Connect real data later (one place)
All data flows through `getData()` in `assets/data.js`.
1. Set `const USING_MOCK = false;`
2. Implement `fetchLive(rangeDays)` (a commented stub is already there) to call
   `/api/report`, `/api/bookings`, `/api/metrics/*` on the BookingBridge host
   with a bearer token, and map the response to the same shape `buildMock()`
   returns. Nothing else in the app changes.

## Stack
Plain HTML/CSS/JS + ECharts (CDN). No framework, no build, no dependencies to
maintain — deliberately lightweight so it is trivial to host anywhere and own
outright.
