/* ============================================================================
   BookingBridge BI — DATA LAYER (placeholder, row-level)
   Generates real ROW-LEVEL tables once, then derives the dashboard aggregates
   AND powers the Explore query-builder + SQL editor from the same rows. Every
   number is fake. To go live: set USING_MOCK=false and implement fetchLive().
   ========================================================================= */

const USING_MOCK = true;

/* ---- seeded RNG ---- */
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const R = rng(20260628);
const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
const pick = (arr) => arr[Math.floor(R() * arr.length)];
const money = (n) => Math.round(n);
const iso = (d) => d.toISOString().slice(0, 10);
const isoT = (d) => d.toISOString().slice(0, 19);

const TODAY = new Date(2026, 5, 28);
const PROPERTY_NAMES = [
  "Moana Crest Estate", "Hale Kolea", "Makai Vista Estate", "Koa Point",
  "Hidden Cove", "The Blue House at Waimea", "Hale Nai'a", "Kai Nalu Beach Estate",
  "Lani Ridge", "Waimea Bay Hale", "Nalu Moku", "Sea Glass",
];
const CAMPAIGNS = [
  { id: "39097788", name: "Kai Nalu Main (Geo)" },
  { id: "21399528661", name: "Brand" },
  { id: "44120355", name: "Luxury Villas Hawaii" },
  { id: "51883204", name: "North Shore Prospecting" },
  { id: "60221947", name: "Competitor Conquest" },
];
const FIRST = ["Aliona", "Grazia", "Stacey", "Aoife", "Chris", "Marco", "Priya", "Devon", "Lena", "Hugo", "Mara", "Theo", "Nina", "Owen", "Carla", "Raj"];
const LAST = ["Sokolova", "Romano", "Volkov", "Walsh", "Reed", "Bianchi", "Shah", "Murphy", "Park", "Lindqvist", "Quinn", "Nakamura"];
const SOURCES = ["google", "google", "google", "direct", "referral", "bing"];
const EVIDENCE_DEF = {
  gclid: { label: "Click ID verified", cls: "proven", ad: true },
  gad_source_only: { label: "Google Ads URL evidence", cls: "url", ad: true },
  contact_only: { label: "Contact match", cls: "contact", ad: false },
};

function email(f, l) { return (f + "." + l).toLowerCase().replace(/[^a-z.]/g, "") + pick(["@gmail.com", "@yahoo.com", "@me.com", "@outlook.com"]); }
function phone() { return "+1" + ri(200, 989) + ri(2000000, 9999999); }
function dateBack(maxDays) { const d = new Date(TODAY); d.setDate(d.getDate() - ri(0, maxDays)); d.setHours(ri(0, 23), ri(0, 59), ri(0, 59), 0); return d; }

/* ===================== build the row-level tables once ==================== */
function buildTables() {
  const properties = PROPERTY_NAMES.map((name, i) => ({ property_uid: "P" + String(i + 1).padStart(3, "0"), name }));

  // google_ads_spend: one row per campaign per day, ~120 days
  const google_ads_spend = [];
  for (let day = 0; day < 120; day++) {
    const d = new Date(TODAY); d.setDate(d.getDate() - day);
    for (const c of CAMPAIGNS) {
      if (R() < 0.15) continue; // some campaigns dark some days
      const cost = money(20 + R() * 160);
      google_ads_spend.push({
        date: iso(d), campaign_id: c.id, campaign_name: c.name,
        cost_usd: cost, clicks: money(cost * (0.6 + R() * 1.4)),
        impressions: money(cost * (8 + R() * 30)),
        conversions: +(R() * 0.6).toFixed(2), conv_value_usd: R() < 0.2 ? money(R() * 40000) : 0,
      });
    }
  }

  // identities + inquiries: ~210
  const identities = [];
  const inquiries = [];
  for (let i = 1; i <= 210; i++) {
    const f = pick(FIRST), l = pick(LAST);
    const em = email(f, l), ph = phone();
    identities.push({ id: i, org_id: 1, email: em, phone: ph, created_at: isoT(dateBack(150)) });
    const src = pick(SOURCES);
    const isGoogle = src === "google";
    const camp = pick(CAMPAIGNS);
    inquiries.push({
      id: i, identity_id: i, created_at: isoT(dateBack(150)),
      email: em, phone: ph,
      gclid: isGoogle && R() < 0.5 ? "Cj0K" + ri(1e6, 9e6) : null,
      gad_campaignid: isGoogle ? camp.id : null,
      utm_source: src, utm_campaign: isGoogle ? camp.name : null,
      landing_page: pick(["/", "/villas", "/anini-beach", "/contact", "/hanalei"]),
      capture_source: isGoogle ? "gclid" : "none",
    });
  }

  // bookings: ~400, stages
  const bookings = [];
  let bid = 1;
  for (let i = 0; i < 430; i++) {
    const f = pick(FIRST), l = pick(LAST);
    const prop = pick(properties);
    const stageRoll = R();
    const stage = stageRoll < 0.84 ? "booked" : stageRoll < 0.97 ? "cancelled" : "inquiry";
    const bookedAt = dateBack(330);
    const ci = new Date(bookedAt); ci.setDate(ci.getDate() + ri(20, 180));
    const co = new Date(ci); co.setDate(co.getDate() + ri(3, 14));
    // ~12% reuse an inquiry identity (so they can match)
    const reuse = R() < 0.12 ? pick(identities) : null;
    bookings.push({
      id: bid++, hostfully_uid: "HF" + ri(10000, 99999),
      booked_at: isoT(bookedAt), stage,
      guest_email: reuse ? reuse.email : email(f, l),
      guest_phone: reuse ? reuse.phone : phone(),
      property_uid: prop.property_uid, property_name: prop.name,
      amount: money(14000 + R() * 460000), currency: "USD",
      check_in: iso(ci), check_out: iso(co),
      _identity_id: reuse ? reuse.id : null,
    });
  }

  // booking_matches: for bookings whose guest reused an identity, attach evidence
  const booking_matches = [];
  let mid = 1;
  for (const b of bookings) {
    if (b.stage !== "booked" || !b._identity_id) continue;
    if (R() < 0.55) continue; // not all reused ones match
    const inq = inquiries.find((q) => q.identity_id === b._identity_id);
    let ev = "contact_only";
    if (inq && inq.gclid) ev = R() < 0.5 ? "gclid" : "gad_source_only";
    else if (inq && inq.gad_campaignid && R() < 0.3) ev = "gad_source_only";
    booking_matches.push({
      id: mid++, booking_id: b.id, identity_id: b._identity_id,
      evidence: ev, evidence_inquiry_id: inq ? inq.id : null, matched_at: isoT(dateBack(60)),
    });
  }
  bookings.forEach((b) => delete b._identity_id);

  return { properties, google_ads_spend, identities, inquiries, bookings, booking_matches };
}

const DB = buildTables();
// expose for the query engine + SQL editor
if (typeof window !== "undefined") window.DB = DB;

/* ===================== derive dashboard aggregates ====================== */
function withinDays(dateStr, days) {
  const d = new Date(dateStr); const cutoff = new Date(TODAY); cutoff.setDate(cutoff.getDate() - days);
  return d >= cutoff;
}
function provenMatches() {
  return DB.booking_matches.filter((m) => EVIDENCE_DEF[m.evidence] && EVIDENCE_DEF[m.evidence].ad);
}

function deriveDashboard(rangeDays) {
  const spendRows = DB.google_ads_spend.filter((r) => withinDays(r.date, rangeDays));
  const spendTotal = spendRows.reduce((a, r) => a + r.cost_usd, 0);
  const clicks = spendRows.reduce((a, r) => a + r.clicks, 0);
  const claimed = spendRows.reduce((a, r) => a + r.conv_value_usd, 0);

  const bookedById = Object.fromEntries(DB.bookings.map((b) => [b.id, b]));
  const proven = provenMatches()
    .map((m) => ({ m, b: bookedById[m.booking_id] }))
    .filter((x) => x.b && x.b.stage === "booked" && withinDays(x.b.booked_at, rangeDays));
  const provenRevenue = proven.reduce((a, x) => a + x.b.amount, 0);
  const provenBookings = proven.length;

  // daily series
  const byDate = {};
  spendRows.forEach((r) => { (byDate[r.date] = byDate[r.date] || { spend: 0, revenue: 0 }).spend += r.cost_usd; });
  proven.forEach((x) => { const d = x.b.booked_at.slice(0, 10); (byDate[d] = byDate[d] || { spend: 0, revenue: 0 }).revenue += x.b.amount; });
  const series = Object.keys(byDate).sort().map((date) => ({ date, spend: byDate[date].spend, revenue: byDate[date].revenue }));

  // evidence mix
  const evCount = {};
  DB.booking_matches.forEach((m) => { const def = EVIDENCE_DEF[m.evidence]; if (def) evCount[def.cls] = (evCount[def.cls] || 0) + 1; });
  const evidence = [
    { name: "Click ID verified", value: evCount.proven || 0, cls: "proven" },
    { name: "Google Ads URL evidence", value: evCount.url || 0, cls: "url" },
    { name: "Contact match", value: evCount.contact || 0, cls: "contact" },
  ].filter((e) => e.value > 0);

  // top properties by booked revenue (all-time)
  const propRev = {};
  DB.bookings.filter((b) => b.stage === "booked").forEach((b) => { propRev[b.property_name] = (propRev[b.property_name] || 0) + b.amount; });
  const props = Object.entries(propRev).map(([name, revenue]) => ({ name, revenue })).sort((a, b) => b.revenue - a.revenue).slice(0, 8);

  // monthly booked revenue (12 mo)
  const monthRev = {};
  DB.bookings.filter((b) => b.stage === "booked").forEach((b) => { const k = b.booked_at.slice(0, 7); monthRev[k] = (monthRev[k] || 0) + b.amount; });
  const months = Object.keys(monthRev).sort().slice(-12).map((k) => {
    const [y, m] = k.split("-"); const d = new Date(+y, +m - 1, 1);
    return { month: d.toLocaleString("en", { month: "short", year: "2-digit" }), revenue: monthRev[k] };
  });

  // inquiry -> booking lag
  const lagBuckets = { "0-7 days": 0, "8-30 days": 0, "31-60 days": 0, "61+ days": 0 };
  DB.booking_matches.forEach((m) => {
    const b = bookedById[m.booking_id]; const inq = DB.inquiries.find((q) => q.id === m.evidence_inquiry_id);
    if (!b || !inq) return;
    const days = Math.round((new Date(b.booked_at) - new Date(inq.created_at)) / 86400000);
    if (days < 0) return;
    if (days <= 7) lagBuckets["0-7 days"]++; else if (days <= 30) lagBuckets["8-30 days"]++; else if (days <= 60) lagBuckets["31-60 days"]++; else lagBuckets["61+ days"]++;
  });
  const lag = Object.entries(lagBuckets).map(([bucket, n]) => ({ bucket, n }));

  // capture trend (weekly: inquiries w/ gclid / inquiries)
  const capture = [];
  for (let w = 9; w >= 0; w--) {
    const end = new Date(TODAY); end.setDate(end.getDate() - w * 7);
    const start = new Date(end); start.setDate(start.getDate() - 7);
    const wk = DB.inquiries.filter((q) => { const d = new Date(q.created_at); return d >= start && d < end; });
    capture.push(wk.length ? +((wk.filter((q) => q.gclid).length / wk.length)).toFixed(2) : 0);
  }

  // matched-bookings table
  const bookings = provenMatches().concat(DB.booking_matches.filter((m) => !EVIDENCE_DEF[m.evidence].ad))
    .map((m) => { const b = bookedById[m.booking_id]; const def = EVIDENCE_DEF[m.evidence]; const inq = DB.inquiries.find((q) => q.id === m.evidence_inquiry_id); return b ? {
      date: b.booked_at.slice(0, 10), guest: b.guest_email, property: b.property_name, amount: b.amount,
      evidence: def.label, cls: def.cls, campaign: inq && inq.utm_campaign ? inq.utm_campaign : "—",
    } : null; }).filter(Boolean).sort((a, b) => (a.cls === "contact") - (b.cls === "contact") || b.amount - a.amount);

  // per-campaign
  const campMap = {};
  spendRows.forEach((r) => { const c = (campMap[r.campaign_name] = campMap[r.campaign_name] || { name: r.campaign_name, spend: 0, clicks: 0, claimed: 0, provenBookings: 0, provenRevenue: 0 }); c.spend += r.cost_usd; c.clicks += r.clicks; c.claimed += r.conv_value_usd; });
  proven.forEach((x) => { const inq = DB.inquiries.find((q) => q.id === x.m.evidence_inquiry_id); const nm = inq && inq.utm_campaign; if (nm && campMap[nm]) { campMap[nm].provenBookings++; campMap[nm].provenRevenue += x.b.amount; } });
  const campaigns = Object.values(campMap).map((c) => ({ ...c, spend: money(c.spend), clicks: money(c.clicks), claimed: money(c.claimed), roas: c.spend ? +(c.provenRevenue / c.spend).toFixed(2) : 0 })).sort((a, b) => b.spend - a.spend);

  const lastCap = capture[capture.length - 1] || 0, prevCap = capture[capture.length - 2] || 0;
  return {
    range: rangeDays,
    kpis: {
      spend: money(spendTotal), provenRevenue: money(provenRevenue), provenBookings,
      roas: spendTotal ? +(provenRevenue / spendTotal).toFixed(2) : 0,
      captureRate: lastCap, googleClaimed: money(claimed || provenRevenue * 4),
      deltas: { spend: +(R() * 12 - 3).toFixed(1), revenue: +(R() * 26 - 4).toFixed(1), roas: +(R() * 18 - 6).toFixed(1), bookings: ri(-1, 2), capture: +((lastCap - prevCap) * 100).toFixed(1) },
    },
    series, months, evidence, props, lag, capture, bookings,
    campaigns: campaigns.slice(0, 5),
    hostfully: { total: DB.bookings.filter((b) => b.stage === "booked").length, matched: DB.booking_matches.length },
  };
}

/* ---- the entry point the dashboard uses ---- */
async function getData(rangeDays = 120) {
  if (USING_MOCK) return deriveDashboard(rangeDays);
  return fetchLive(rangeDays);
}

/* ---- table metadata for the Explore builder ---- */
const SCHEMA = {
  bookings: { label: "Bookings", rows: DB.bookings.length,
    dims: ["stage", "property_name", "currency"], dates: ["booked_at", "check_in"], measures: [{ col: "amount", label: "Sum of amount", agg: "sum" }, { col: "*", label: "Count", agg: "count" }] },
  inquiries: { label: "Inquiries", rows: DB.inquiries.length,
    dims: ["utm_source", "utm_campaign", "capture_source", "landing_page"], dates: ["created_at"], measures: [{ col: "*", label: "Count", agg: "count" }] },
  google_ads_spend: { label: "Google Ads spend", rows: DB.google_ads_spend.length,
    dims: ["campaign_name"], dates: ["date"], measures: [{ col: "cost_usd", label: "Sum of cost", agg: "sum" }, { col: "clicks", label: "Sum of clicks", agg: "sum" }, { col: "*", label: "Count", agg: "count" }] },
  booking_matches: { label: "Booking matches", rows: DB.booking_matches.length,
    dims: ["evidence"], dates: ["matched_at"], measures: [{ col: "*", label: "Count", agg: "count" }] },
  properties: { label: "Properties", rows: DB.properties.length, dims: ["name"], dates: [], measures: [{ col: "*", label: "Count", agg: "count" }] },
};
if (typeof window !== "undefined") window.SCHEMA = SCHEMA;

/* ---- LATER: real wiring (stub) ----
async function fetchLive(rangeDays) {
  const BASE = "https://bookingbridge-production.up.railway.app";
  const headers = { Authorization: "Bearer " + window.BB_TOKEN };
  const report = await fetch(`${BASE}/api/report?days=${rangeDays}`, { headers }).then(r => r.json());
  const bookings = await fetch(`${BASE}/api/bookings?limit=100`, { headers }).then(r => r.json());
  return adapt(report, bookings); // map to the deriveDashboard() shape
}
*/
