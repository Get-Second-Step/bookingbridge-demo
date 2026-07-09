/* ============================================================================
   BookingBridge BI — app engine
   View routing, ECharts rendering (brand-themed), range control, live
   white-label editor. All data comes from getData() in data.js.
   ========================================================================= */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---------- state ---------- */
  let RANGE = 120;
  let DATA = null;
  let CURRENT = "home";
  const charts = {};

  /* ---------- formatting ---------- */
  const fmtCompact = (n) => {
    const a = Math.abs(n);
    if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1) + "M";
    if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e4 ? 0 : 1) + "K";
    return String(Math.round(n));
  };
  const usd = (n) => "$" + fmtCompact(n);
  const usdFull = (n) => "$" + Math.round(n).toLocaleString("en-US");
  const pct = (n) => Math.round(n * 100) + "%";

  /* ---------- color utils (for live re-brand) ---------- */
  const cssvar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  function hexToRgb(h) { h = h.replace("#", ""); if (h.length === 3) h = h.split("").map(c => c + c).join(""); const i = parseInt(h, 16); return [(i >> 16) & 255, (i >> 8) & 255, i & 255]; }
  function darken(hex, amt) { const [r, g, b] = hexToRgb(hex).map(v => Math.round(v * (1 - amt))); return `rgb(${r},${g},${b})`; }
  function rgba(hex, a) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }

  function applyBrand({ name, accent } = {}) {
    const root = document.documentElement.style;
    if (accent) {
      root.setProperty("--brand", accent);
      root.setProperty("--brand-600", darken(accent, 0.12));
      root.setProperty("--brand-700", darken(accent, 0.26));
      root.setProperty("--brand-tint", rgba(accent, 0.08));
      root.setProperty("--brand-tint-strong", rgba(accent, 0.16));
      root.setProperty("--c1", accent);
    }
    if (name) { $("#brandName").textContent = name; }
  }
  function loadBrand() {
    try {
      const saved = JSON.parse(localStorage.getItem("bb_brand") || "{}");
      applyBrand(saved);
      return saved;
    } catch { return {}; }
  }
  function saveBrand(b) { localStorage.setItem("bb_brand", JSON.stringify(b)); }

  /* ---------- ECharts shared base ---------- */
  function baseGrid(extra = {}) { return Object.assign({ left: 8, right: 14, top: 16, bottom: 6, containLabel: true }, extra); }
  function axisText() { return { color: cssvar("--faint"), fontFamily: "Spline Sans Mono, monospace", fontSize: 10.5 }; }
  function splitLine() { return { lineStyle: { color: cssvar("--line-2"), type: "dashed" } }; }
  function tooltip(extra = {}) {
    return Object.assign({
      backgroundColor: "#0f1b1a", borderWidth: 0, padding: [9, 12],
      textStyle: { color: "#fff", fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: 12 },
      extraCssText: "border-radius:10px;box-shadow:0 8px 24px rgba(15,27,26,.25);",
    }, extra);
  }
  function mk(id, opt) {
    const node = document.getElementById(id);
    if (!node) return;
    if (charts[id]) charts[id].dispose();
    const c = echarts.init(node, null, { renderer: "canvas" });
    c.setOption(opt);
    charts[id] = c;
    // A ResizeObserver fires once on observe() with the current size and again
    // on any change — this reliably forces the series to lay out once the card
    // has its final dimensions, fixing the "axes-only / compressed series" race.
    if (node._ro) node._ro.disconnect();
    node._ro = new ResizeObserver(() => { const inst = charts[id]; if (inst) inst.resize(); });
    node._ro.observe(node);
    // belt-and-suspenders: some nav paths leave the series unlaid-out until a
    // resize is forced after paint. Fire a few across the next ~300ms.
    [40, 140, 320].forEach((ms) => setTimeout(() => { const inst = charts[id]; if (inst) inst.resize(); }, ms));
  }
  function resizeAll() { Object.values(charts).forEach(c => c.resize()); }
  window.addEventListener("resize", resizeAll);

  /* =========================================================================
     CHART OPTIONS
     ====================================================================== */
  function optSpendRevenue(d) {
    const accent = cssvar("--brand");
    return {
      grid: baseGrid({ right: 18 }),
      tooltip: tooltip({ trigger: "axis", axisPointer: { type: "line", lineStyle: { color: cssvar("--line") } },
        valueFormatter: (v) => usd(v) }),
      legend: { show: false },
      xAxis: { type: "category", data: d.series.map(p => p.date),
        axisLine: { lineStyle: { color: cssvar("--line") } }, axisTick: { show: false },
        axisLabel: Object.assign(axisText(), { formatter: (v) => v.slice(5), interval: Math.floor(d.series.length / 6) }) },
      yAxis: [
        { type: "value", name: "spend", nameTextStyle: Object.assign(axisText(), { align: "left" }), position: "left",
          axisLabel: Object.assign(axisText(), { formatter: usd }), axisLine: { show: false }, axisTick: { show: false }, splitLine: splitLine() },
        { type: "value", name: "revenue", nameTextStyle: Object.assign(axisText(), { align: "right" }), position: "right",
          axisLabel: Object.assign(axisText(), { formatter: usd }), axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false } },
      ],
      series: [
        { name: "Proven revenue", type: "bar", yAxisIndex: 1, data: d.series.map(p => p.revenue), barWidth: "55%",
          itemStyle: { color: cssvar("--c3"), borderRadius: [3, 3, 0, 0] }, z: 2 },
        { name: "Ad spend", type: "line", yAxisIndex: 0, smooth: 0.4, symbol: "none", data: d.series.map(p => p.spend),
          lineStyle: { color: accent, width: 2.4 }, z: 3,
          areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: rgba(accent, 0.22) }, { offset: 1, color: rgba(accent, 0.01) }]) } },
      ],
    };
  }
  function optEvidence(d) {
    const map = { proven: cssvar("--good"), url: cssvar("--brand"), contact: cssvar("--warn") };
    const total = d.evidence.reduce((a, b) => a + b.value, 0);
    return {
      tooltip: tooltip({ trigger: "item", formatter: (p) => `${p.name}<br/><b>${p.value}</b> bookings (${p.percent}%)` }),
      series: [{
        type: "pie", radius: ["58%", "82%"], center: ["50%", "50%"], avoidLabelOverlap: true,
        itemStyle: { borderColor: "#fff", borderWidth: 3 }, label: { show: false },
        data: d.evidence.map(e => ({ name: e.name, value: e.value, itemStyle: { color: map[e.cls] } })),
      }],
      graphic: [
        { type: "text", left: "center", top: "42%", style: { text: String(total), font: "600 26px Spline Sans Mono", fill: cssvar("--ink") } },
        { type: "text", left: "center", top: "57%", style: { text: "matches", font: "500 11px Plus Jakarta Sans", fill: cssvar("--faint") } },
      ],
    };
  }
  function optMonthly(d) {
    return {
      grid: baseGrid(),
      tooltip: tooltip({ trigger: "axis", valueFormatter: usd }),
      xAxis: { type: "category", data: d.months.map(m => m.month), axisTick: { show: false },
        axisLine: { lineStyle: { color: cssvar("--line") } }, axisLabel: axisText() },
      yAxis: { type: "value", axisLabel: Object.assign(axisText(), { formatter: usd }), axisLine: { show: false }, axisTick: { show: false }, splitLine: splitLine() },
      series: [{ type: "bar", data: d.months.map(m => m.revenue), barWidth: "58%",
        itemStyle: { color: cssvar("--brand"), borderRadius: [4, 4, 0, 0] },
        emphasis: { itemStyle: { color: cssvar("--brand-700") } } }],
    };
  }
  function optProps(d) {
    const rows = [...d.props].reverse();
    return {
      grid: baseGrid({ left: 4, right: 40, top: 6, bottom: 4 }),
      tooltip: tooltip({ trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: usd }),
      xAxis: { type: "value", axisLabel: Object.assign(axisText(), { formatter: usd }), splitLine: splitLine(), axisLine: { show: false }, axisTick: { show: false } },
      yAxis: { type: "category", data: rows.map(p => p.name), axisTick: { show: false },
        axisLine: { show: false }, axisLabel: { color: cssvar("--ink-2"), fontSize: 11.5, fontFamily: "Plus Jakarta Sans" } },
      series: [{ type: "bar", data: rows.map(p => p.revenue), barWidth: 13,
        itemStyle: { color: cssvar("--brand"), borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: "right", formatter: (p) => usd(p.value), color: cssvar("--faint"), fontFamily: "Spline Sans Mono", fontSize: 10.5 } }],
    };
  }
  function optLag(d) {
    return {
      grid: baseGrid({ top: 10 }),
      tooltip: tooltip({ trigger: "axis", axisPointer: { type: "shadow" } }),
      xAxis: { type: "category", data: d.lag.map(l => l.bucket), axisTick: { show: false }, axisLine: { lineStyle: { color: cssvar("--line") } }, axisLabel: Object.assign(axisText(), { fontSize: 10 }) },
      yAxis: { type: "value", axisLabel: axisText(), splitLine: splitLine(), axisLine: { show: false }, axisTick: { show: false } },
      series: [{ type: "bar", data: d.lag.map((l, i) => ({ value: l.n, itemStyle: { color: i === 0 ? cssvar("--brand") : cssvar("--c5"), borderRadius: [4, 4, 0, 0] } })), barWidth: "52%" }],
    };
  }
  function optSpark(series) {
    return {
      grid: { left: 0, right: 0, top: 2, bottom: 2 },
      xAxis: { type: "category", show: false, data: series.map((_, i) => i) },
      yAxis: { type: "value", show: true, min: 0, max: 0.6, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false } },
      series: [
        { type: "line", data: series, smooth: 0.5, symbol: "none", lineStyle: { color: cssvar("--brand"), width: 2 },
          areaStyle: { color: rgba(cssvar("--brand"), 0.12) }, markLine: { silent: true, symbol: "none", data: [{ yAxis: 0.6 }], lineStyle: { color: cssvar("--faint"), type: "dotted", width: 1 }, label: { show: false } } },
      ],
    };
  }
  function optCampaign(d) {
    return {
      grid: baseGrid({ bottom: 4 }),
      tooltip: tooltip({ trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: usd }),
      legend: { data: ["Ad spend", "Proven revenue"], bottom: 0, icon: "roundRect", itemWidth: 10, itemHeight: 10, textStyle: { color: cssvar("--muted"), fontSize: 11.5 } },
      xAxis: { type: "category", data: d.campaigns.map(c => c.name), axisTick: { show: false }, axisLine: { lineStyle: { color: cssvar("--line") } }, axisLabel: Object.assign(axisText(), { interval: 0, width: 80, overflow: "truncate" }) },
      yAxis: { type: "value", axisLabel: Object.assign(axisText(), { formatter: usd }), splitLine: splitLine(), axisLine: { show: false }, axisTick: { show: false } },
      series: [
        { name: "Ad spend", type: "bar", data: d.campaigns.map(c => c.spend), barWidth: 16, itemStyle: { color: cssvar("--c5"), borderRadius: [3, 3, 0, 0] } },
        { name: "Proven revenue", type: "bar", data: d.campaigns.map(c => c.provenRevenue), barWidth: 16, itemStyle: { color: cssvar("--brand"), borderRadius: [3, 3, 0, 0] } },
      ],
    };
  }

  /* =========================================================================
     ICONS
     ====================================================================== */
  const I = {
    spend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    rev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17l6-6 4 4 8-8"/><path d="M21 7v5h-5"/></svg>',
    roas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 6v6l4 2"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h13a2 2 0 0 1 2 2v14l-4-2-4 2-4-2-3 1.5z"/></svg>',
    cap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12a10 10 0 0 1 20 0"/><circle cx="12" cy="12" r="2.5"/></svg>',
    arrowUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
    arrowDn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
    go: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  };
  const delta = (v, goodUp = true) => {
    const up = v >= 0; const good = up === goodUp;
    return `<span class="delta ${good ? "up" : "down"}">${up ? I.arrowUp : I.arrowDn}${Math.abs(v)}%</span>`;
  };

  /* ---- plain-English explanations (the "easy for the customer" layer) ---- */
  const EXPLAIN = {
    spend: "What you paid Google Ads in this period.",
    revenue: "Booking revenue we can PROVE came from a Google ad click. Conservative on purpose: counted only when there is hard evidence.",
    roas: "Return on ad spend using only proven revenue: dollars earned per $1 spent. Google reports a higher number because it also counts conversions it only models.",
    bookings: "Bookings tied to a Google ad with hard evidence (a click ID or an ad-URL signal).",
    capture: "Share of inquiries where we captured the Google click ID. Higher means more bookings we can later prove. Target is 60%.",
    spendrev: "The line is daily ad spend. The bars are proven booking revenue, placed on the day each booking was made.",
    evidence: "How each matched booking was proven. Click ID is the strongest. Contact match is softer: same guest email, but no ad click was captured.",
    props: "Total booked revenue per property, all-time. Your best earners at a glance.",
    monthly: "Booked revenue by month, so you can see seasonality.",
    lag: "How long after the first inquiry a booking happens. Bars past 7 days are why a durable tracking cookie matters.",
    bookingsTbl: "Each proven and contact-matched booking, strongest evidence first.",
  };
  const infoDot = (key, left) => EXPLAIN[key] ? `<span class="info ${left ? "left" : ""}" data-tip="${EXPLAIN[key].replace(/"/g, "&quot;")}">?</span>` : "";
  const usdExact = (n) => "$" + Math.round(n).toLocaleString("en-US");
  const vsPrev = () => `<span style="color:var(--faint);font-weight:500"> vs prev ${RANGE}d</span>`;

  /* =========================================================================
     VIEW RENDERERS
     ====================================================================== */
  function kpiCard(label, icon, val, unit, metaHtml, opts = {}) {
    const exact = opts.exact != null ? ` data-exact title="${usdExact(opts.exact)}"` : "";
    return `<div class="card hover kpi">
      <div class="label"><span class="ic">${icon}</span>${label}${infoDot(opts.tip)}</div>
      <div class="val num"${exact}>${val}${unit ? `<span class="unit">${unit}</span>` : ""}</div>
      ${opts.plain ? `<div class="plain">${opts.plain}</div>` : ""}
      <div class="meta">${metaHtml}</div>
    </div>`;
  }

  function renderHome() {
    const d = DATA;
    $("#view-home").innerHTML = `
      <div class="hero">
        <div class="glyph"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M2 16c3.2 0 3.2-4 6.4-4s3.2 4 6.4 4 3.2-4 6.4-4"/><path d="M2 11c3.2 0 3.2-4 6.4-4s3.2 4 6.4 4 3.2-4 6.4-4" opacity=".55"/></svg></div>
        <div><h1>Good to see you, Shivendra</h1><p>Pure Kauai attribution at a glance. <span class="mock-flag">● demo data</span></p></div>
      </div>
      <div class="grid kpis stagger" style="grid-template-columns:repeat(3,1fr)">
        ${kpiCard("Proven revenue", I.rev, usd(d.kpis.provenRevenue), "", `${delta(d.kpis.deltas.revenue)} vs prev ${RANGE}d`)}
        ${kpiCard("Ad spend", I.spend, usd(d.kpis.spend), "", `${delta(d.kpis.deltas.spend, false)} vs prev ${RANGE}d`)}
        ${kpiCard("Proven ROAS", I.roas, d.kpis.roas, "x", `${delta(d.kpis.deltas.roas)} efficiency`)}
      </div>
      <div class="page-head" style="margin-top:26px"><h1 style="font-size:16px">Pick up where you left off</h1></div>
      <div class="grid tiles stagger">
        ${homeTile("dashboard", "Attribution Dashboard", "Spend vs proven revenue, evidence mix, the full attribution story.", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/></svg>')}
        ${homeTile("bookings", "Bookings", "Every booking with its match status and evidence label.", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h16M4 12h16M4 19h16"/></svg>')}
        ${homeTile("campaigns", "Campaigns", "Per-campaign spend vs proven revenue and ROAS.", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg>')}
      </div>`;
  }
  function homeTile(view, title, desc, icon) {
    return `<div class="card hover tile" data-jump="${view}">
      <div class="ic">${icon}</div><h4>${title}</h4><p>${desc}</p>
      <div class="go">Open ${I.go}</div></div>`;
  }

  function introStrip() {
    if (localStorage.getItem("bb_intro") === "1") return "";
    return `<div class="intro" id="introStrip">
      <div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M12 16v-5M12 8h.01"/><circle cx="12" cy="12" r="9"/></svg></div>
      <div>This dashboard answers one question: <b>which bookings did your Google ads actually create?</b> Numbers marked <b>proven</b> are counted only when there is hard evidence, so they are conservative and defensible. Hover any small <span class="info" data-tip="Like this. Every metric explains itself in plain English.">?</span> to see what a number means.</div>
      <span class="x" id="introX" title="Dismiss">✕</span></div>`;
  }
  function renderDashboard() {
    const d = DATA; const claimedX = d.kpis.spend ? (d.kpis.googleClaimed / d.kpis.spend).toFixed(1) : "0";
    $("#view-dashboard").innerHTML = `
      <div class="page-head">
        <div><h1>Attribution Dashboard</h1><p>Proving which bookings Google Ads actually drove · last ${RANGE} days <span class="mock-flag">● demo data</span></p></div>
        <div class="segmented"><button class="on">Overview</button><button>By campaign</button><button>By property</button></div>
      </div>
      ${introStrip()}
      <div class="grid kpis stagger">
        ${kpiCard("Ad spend", I.spend, usd(d.kpis.spend), "", `${delta(d.kpis.deltas.spend, false)}${vsPrev()}`, { tip: "spend", exact: d.kpis.spend, plain: "paid to Google" })}
        ${kpiCard("Proven revenue", I.rev, usd(d.kpis.provenRevenue), "", `${delta(d.kpis.deltas.revenue)}${vsPrev()}`, { tip: "revenue", exact: d.kpis.provenRevenue, plain: "we can prove came from ads" })}
        ${kpiCard("Proven ROAS", I.roas, d.kpis.roas, "x", `Google claims ${claimedX}x`, { tip: "roas", plain: "earned per $1 spent" })}
        ${kpiCard("Proven bookings", I.book, d.kpis.provenBookings, "", `${delta(d.kpis.deltas.bookings)} ad-verified`, { tip: "bookings", plain: "with hard ad evidence" })}
        ${kpiCardCapture(d)}
      </div>
      <div class="grid cols-2 stagger">
        ${chartCard("Spend vs proven revenue", `last ${RANGE} days`, "c-spendrev", "h-tall", legend([["--brand", "Ad spend"], ["--c3", "Proven revenue"]]), "spendrev", "Spend is steady; proven revenue lands in lumps when a tracked booking closes.")}
        ${chartCard("Evidence mix", "how matches are proven", "c-evidence", "h-tall", legend([["--good", "Click ID"], ["--brand", "Ads URL"], ["--warn", "Contact"]]), "evidence", "More green and teal = stronger, harder-to-dispute proof.")}
      </div>
      <div class="grid cols-2 stagger" style="margin-top:16px">
        ${chartCard("Top properties by booked revenue", "all-time", "c-props", "h-tall", "", "props", "Hover a bar for the exact figure.")}
        ${chartCard("Monthly booked revenue", "trailing 12 months", "c-monthly", "h-tall", "", "monthly", "Taller bars are your busy months.")}
      </div>
      <div class="grid cols-2 stagger" style="margin-top:16px;grid-template-columns:1.55fr 1fr">
        ${bookingsCard(d.bookings.slice(0, 7))}
        ${chartCard("Inquiry → booking lag", "how long guests take to book", "c-lag", "h-tall", "", "lag", "Most book within a week, but the long tail is real revenue at risk without durable tracking.")}
      </div>`;
    const x = $("#introX"); if (x) x.onclick = () => { localStorage.setItem("bb_intro", "1"); const s = $("#introStrip"); if (s) s.remove(); };
  }
  function kpiCardCapture(d) {
    return `<div class="card hover kpi">
      <div class="label"><span class="ic">${I.cap}</span>Capture rate${infoDot("capture")}</div>
      <div class="val num">${pct(d.kpis.captureRate)}</div>
      <div class="plain">of inquiries had a Google click ID</div>
      <div class="meta">target 60% · ${delta(d.kpis.deltas.capture)}</div>
      <div class="spark" id="c-spark"></div></div>`;
  }
  function legend(items) {
    return `<div class="legend">${items.map(([v, l]) => `<span><i style="background:var(${v})"></i>${l}</span>`).join("")}</div>`;
  }
  function chartCard(title, sub, id, h, footer, tip, cap) {
    return `<div class="card hover">
      <div class="card-h"><div><h3>${title}${infoDot(tip)}</h3></div><span class="sub">${sub}</span></div>
      <div class="card-body"><div class="chart ${h}" id="${id}"></div>${footer || ""}${cap ? `<div class="cap">${cap}</div>` : ""}</div></div>`;
  }
  function evPill(cls, label) {
    const k = cls === "proven" ? "proven" : cls === "url" ? "url" : cls === "contact" ? "contact" : "soft";
    return `<span class="pill ${k}">${label}</span>`;
  }
  function bookingsCard(rows) {
    return `<div class="card hover">
      <div class="card-h"><h3>Matched bookings${infoDot("bookingsTbl")}</h3><span class="sub">proven first</span></div>
      <div class="card-body" style="padding-top:4px"><div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Date</th><th>Property</th><th class="r">Amount</th><th>Evidence</th></tr></thead>
        <tbody>${rows.map(b => `<tr>
          <td class="num" style="color:var(--muted)">${b.date.slice(5)}</td>
          <td class="strong">${b.property}</td>
          <td class="r num strong">${usdFull(b.amount)}</td>
          <td>${evPill(b.cls, b.evidence)}</td></tr>`).join("")}</tbody>
      </table></div></div></div>`;
  }

  function renderBookings() {
    const d = DATA;
    $("#view-bookings").innerHTML = `
      <div class="page-head">
        <div><h1>Bookings</h1><p>Every booking with match status and evidence <span class="mock-flag">● demo data</span></p></div>
        <div class="segmented" id="bkFilter"><button class="on" data-f="all">All</button><button data-f="proven">Ad-proven</button><button data-f="contact">Contact</button></div>
      </div>
      <div class="card"><div class="card-body" style="padding:6px 6px"><div class="tbl-wrap"><table class="tbl" id="bkTable">
        <thead><tr><th>Date</th><th>Guest</th><th>Property</th><th class="r">Amount</th><th>Evidence</th><th>Campaign</th></tr></thead>
        <tbody></tbody></table></div></div></div>`;
    const draw = (f) => {
      const rows = d.bookings.filter(b => f === "all" ? true : f === "proven" ? (b.cls === "proven" || b.cls === "url") : b.cls === "contact");
      $("#bkTable tbody").innerHTML = rows.map(b => `<tr>
        <td class="num" style="color:var(--muted)">${b.date}</td>
        <td>${b.guest}</td><td class="strong">${b.property}</td>
        <td class="r num strong">${usdFull(b.amount)}</td>
        <td>${evPill(b.cls, b.evidence)}</td>
        <td style="color:var(--muted)">${b.campaign}</td></tr>`).join("");
    };
    draw("all");
    $$("#bkFilter button").forEach(btn => btn.onclick = () => {
      $$("#bkFilter button").forEach(b => b.classList.remove("on")); btn.classList.add("on"); draw(btn.dataset.f);
    });
  }

  function renderCampaigns() {
    const d = DATA;
    $("#view-campaigns").innerHTML = `
      <div class="page-head"><div><h1>Campaigns</h1><p>Spend vs proven revenue by campaign <span class="mock-flag">● demo data</span></p></div></div>
      <div class="card hover" style="margin-bottom:16px">
        <div class="card-h"><h3>Spend vs proven revenue</h3><span class="sub">per campaign</span></div>
        <div class="card-body"><div class="chart h-med" id="c-campaign"></div></div></div>
      <div class="card"><div class="card-body" style="padding:6px 6px"><div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Campaign</th><th class="r">Spend</th><th class="r">Clicks</th><th class="r">Google claims</th><th class="r">Proven bookings</th><th class="r">Proven revenue</th><th class="r">ROAS</th></tr></thead>
        <tbody>${d.campaigns.map(c => `<tr>
          <td class="strong">${c.name}</td>
          <td class="r num">${usdFull(c.spend)}</td>
          <td class="r num" style="color:var(--muted)">${c.clicks.toLocaleString()}</td>
          <td class="r num" style="color:var(--muted)">${usdFull(c.claimed)}</td>
          <td class="r num">${c.provenBookings}</td>
          <td class="r num strong">${usdFull(c.provenRevenue)}</td>
          <td class="r num">${c.roas ? c.roas + "x" : "—"}</td></tr>`).join("")}</tbody>
      </table></div></div></div>`;
  }

  function renderBrowse() {
    const tables = [
      ["bookings", "1,494 rows", "Hostfully bookings synced every 15 min"],
      ["inquiries", "201 rows", "Identity captured at form submit"],
      ["booking_matches", "28 rows", "Booking ↔ inquiry evidence links"],
      ["google_ads_spend", "649 rows", "Daily campaign spend + clicks"],
      ["properties", "47 rows", "Property name lookup"],
      ["identities", "193 rows", "Email / phone identity graph"],
    ];
    $("#view-browse").innerHTML = `
      <div class="page-head"><div><h1>Browse data</h1><p>BookingBridge (Pure Kauai) · SQLite</p></div></div>
      <div class="grid cols-3 stagger">${tables.map(([n, c, desc]) => `
        <div class="card hover tile">
          <div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg></div>
          <h4>${n}</h4><p>${desc}</p><div class="go">${c}</div></div>`).join("")}</div>`;
  }

  function renderSettings() {
    const b = loadBrand();
    const swatches = ["#0e7c7b", "#11314b", "#c2603f", "#7c5cff", "#1f9d6b", "#d4892a"];
    const cur = b.accent || "#0e7c7b";
    $("#view-settings").innerHTML = `
      <div class="page-head"><div><h1>Appearance</h1><p>White-label the whole tool. Changes apply live and persist on this device.</p></div></div>
      <div class="card" style="max-width:720px"><div class="card-body">
        <div class="set-row">
          <div class="lbl"><b>Brand name</b><p>Shown in the sidebar and on shared reports.</p></div>
          <input class="field" id="setName" value="${(b.name || "BookingBridge").replace(/"/g, "&quot;")}" />
        </div>
        <div class="set-row">
          <div class="lbl"><b>Accent color</b><p>Drives buttons, highlights, and every chart's primary series.</p></div>
          <div class="swatches" id="setSwatches">
            ${swatches.map(c => `<div class="swatch ${c === cur ? "on" : ""}" data-c="${c}" style="background:${c}"></div>`).join("")}
            <input type="color" class="swatch" id="setCustom" value="${cur}" title="Custom color" />
          </div>
        </div>
        <div class="set-row">
          <div class="lbl"><b>Logo</b><p>Swap the placeholder mark for your own SVG/PNG. (wired in the build; demo uses the default mark.)</p></div>
          <button class="btn">Upload logo</button>
        </div>
        <div class="set-row">
          <div class="lbl"><b>Reset</b><p>Restore the default BookingBridge theme.</p></div>
          <button class="btn" id="setReset">Reset to default</button>
        </div>
      </div></div>
      <p class="note" style="margin-top:14px">This is a full white-label layer. Because the tool is yours, there's no per-feature license gate, unlike the Metabase open-source edition.</p>`;

    const commit = (patch) => { const next = Object.assign(loadBrand(), patch); saveBrand(next); applyBrand(next); rerenderChartsFor(CURRENT); };
    $("#setName").oninput = (e) => commit({ name: e.target.value || "BookingBridge" });
    $$("#setSwatches .swatch[data-c]").forEach(s => s.onclick = () => {
      $$("#setSwatches .swatch").forEach(x => x.classList.remove("on")); s.classList.add("on");
      $("#setCustom").value = s.dataset.c; commit({ accent: s.dataset.c });
    });
    $("#setCustom").oninput = (e) => { $$("#setSwatches .swatch").forEach(x => x.classList.remove("on")); commit({ accent: e.target.value }); };
    $("#setReset").onclick = () => { localStorage.removeItem("bb_brand"); location.reload(); };
  }

  /* =========================================================================
     CHART MOUNTING (after a view is visible)
     ====================================================================== */
  function rerenderChartsFor(view) {
    if (view === "dashboard") {
      mk("c-spendrev", optSpendRevenue(DATA));
      mk("c-evidence", optEvidence(DATA));
      mk("c-props", optProps(DATA));
      mk("c-monthly", optMonthly(DATA));
      mk("c-lag", optLag(DATA));
      mk("c-spark", optSpark(DATA.capture));
    } else if (view === "campaigns") {
      mk("c-campaign", optCampaign(DATA));
    }
  }

  /* =========================================================================
     QUERY ENGINE (alasql) + generic renderers
     ====================================================================== */
  function registerSQL() {
    if (!window.alasql || !window.DB) return;
    Object.entries(window.DB).forEach(([t, rows]) => {
      try { alasql("DROP TABLE IF EXISTS " + t); alasql("CREATE TABLE " + t); alasql.tables[t].data = rows; } catch (e) { /* ignore */ }
    });
  }
  const palette = (i) => [cssvar("--c1"), cssvar("--c2"), cssvar("--c3"), cssvar("--c4"), cssvar("--c5"), cssvar("--c6")][i % 6];

  function chartFromRows(id, rows, xKey, yKey, viz) {
    const accent = cssvar("--brand");
    const cats = rows.map((r) => String(r[xKey]));
    const vals = rows.map((r) => Number(r[yKey]) || 0);
    let opt;
    if (viz === "pie") {
      opt = { tooltip: tooltip({ trigger: "item", formatter: (p) => `${p.name}<br/><b>${p.value.toLocaleString()}</b> (${p.percent}%)` }),
        series: [{ type: "pie", radius: ["50%", "80%"], itemStyle: { borderColor: cssvar("--surface"), borderWidth: 3 }, label: { color: cssvar("--muted"), fontSize: 11 },
          data: rows.map((r, i) => ({ name: String(r[xKey]), value: Number(r[yKey]) || 0, itemStyle: { color: palette(i) } })) }] };
    } else if (viz === "line") {
      opt = { grid: baseGrid(), tooltip: tooltip({ trigger: "axis" }),
        xAxis: { type: "category", data: cats, axisLabel: axisText(), axisLine: { lineStyle: { color: cssvar("--line") } }, axisTick: { show: false } },
        yAxis: { type: "value", axisLabel: axisText(), splitLine: splitLine(), axisLine: { show: false }, axisTick: { show: false } },
        series: [{ type: "line", smooth: 0.4, symbol: "none", data: vals, lineStyle: { color: accent, width: 2.4 }, areaStyle: { color: rgba(accent, 0.14) } }] };
    } else {
      opt = { grid: baseGrid({ bottom: 4 }), tooltip: tooltip({ trigger: "axis", axisPointer: { type: "shadow" } }),
        xAxis: { type: "category", data: cats, axisLabel: Object.assign(axisText(), { interval: 0, rotate: cats.length > 6 ? 28 : 0, width: 90, overflow: "truncate" }), axisLine: { lineStyle: { color: cssvar("--line") } }, axisTick: { show: false } },
        yAxis: { type: "value", axisLabel: axisText(), splitLine: splitLine(), axisLine: { show: false }, axisTick: { show: false } },
        series: [{ type: "bar", data: vals, barWidth: "55%", itemStyle: { color: accent, borderRadius: [4, 4, 0, 0] } }] };
    }
    mk(id, opt);
  }
  function fmtCell(v) {
    if (v == null || v === "") return '<span style="color:var(--faint)">—</span>';
    if (typeof v === "number") return `<span class="num">${Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>`;
    return String(v);
  }
  function tableFromRows(rows, cols) {
    cols = cols || (rows[0] ? Object.keys(rows[0]) : []);
    if (!rows.length) return `<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3-3"/></svg><h4>No rows</h4><p>This query returned nothing.</p></div>`;
    return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${rows.slice(0, 200).map((r) => `<tr>${cols.map((c) => `<td>${fmtCell(r[c])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  /* ---------- toast ---------- */
  function toast(msg) {
    let t = $("#toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2200);
  }

  /* ---------- saved questions (localStorage) ---------- */
  const QKEY = "bb_questions";
  const getQuestions = () => { try { return JSON.parse(localStorage.getItem(QKEY) || "[]"); } catch { return []; } };
  function saveQuestion(q) { const all = getQuestions(); q.id = "q" + Date.now(); q.created = new Date(2026, 5, 28).toISOString().slice(0, 10); all.unshift(q); localStorage.setItem(QKEY, JSON.stringify(all)); updateSavedCount(); return q; }
  function deleteQuestion(id) { localStorage.setItem(QKEY, JSON.stringify(getQuestions().filter((q) => q.id !== id))); updateSavedCount(); }
  function updateSavedCount() { const el = $("#navSavedCount"); if (el) el.textContent = getQuestions().length || ""; }

  /* =========================================================================
     EXPLORE — visual query builder
     ====================================================================== */
  let exploreState = null;
  const VIZ_ICONS = {
    bar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    line: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17l5-6 4 3 6-8M3 21h18"/></svg>',
    pie: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v9l8 4A9 9 0 1 0 12 3z"/></svg>',
    table: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/></svg>',
  };
  function runExplore(s) {
    const sc = SCHEMA[s.table]; const meas = sc.measures[s.measureIdx] || sc.measures[0];
    const aggExpr = meas.agg === "count" ? "COUNT(*)" : `SUM([${meas.col}])`;
    let sql;
    // `value`/`label` are reserved in alasql, so bracket-quote the dimension and
    // use a safe measure alias.
    if (s.dim === "(none)") sql = `SELECT ${aggExpr} AS [metric] FROM ${s.table}`;
    else sql = `SELECT [${s.dim}], ${aggExpr} AS [metric] FROM ${s.table} GROUP BY [${s.dim}] ORDER BY [metric] DESC`;
    let rows = [];
    try { rows = alasql(sql); } catch (e) { return { error: e.message, sql }; }
    return { rows, sql, meas, dim: s.dim };
  }
  function renderExplore() {
    if (!exploreState) { const t = "bookings"; exploreState = { table: t, measureIdx: 0, dim: SCHEMA[t].dims[0], viz: "bar" }; }
    drawExplore();
  }
  function drawExplore() {
    const s = exploreState; const sc = SCHEMA[s.table];
    const dimOpts = ["(none)"].concat(sc.dims);
    const vizList = s.dim === "(none)" ? ["table"] : ["bar", "line", "pie", "table"];
    if (!vizList.includes(s.viz)) s.viz = vizList[0];
    $("#view-explore").innerHTML = `
      <div class="page-head"><div><h1>Explore</h1><p>Ask a question of your data, no SQL required <span class="mock-flag">● demo data</span></p></div>
        <button class="btn primary" id="expSave"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h7"/></svg>Save question</button></div>
      <div class="card" style="margin-bottom:16px"><div class="builder">
        <div class="bfield"><label>Data</label><select class="seg-select" id="expTable">${Object.entries(SCHEMA).map(([k, v]) => `<option value="${k}" ${k === s.table ? "selected" : ""}>${v.label}</option>`).join("")}</select></div>
        <div class="bfield"><label>Measure</label><select class="seg-select" id="expMeas">${sc.measures.map((m, i) => `<option value="${i}" ${i === s.measureIdx ? "selected" : ""}>${m.label}</option>`).join("")}</select></div>
        <div class="bfield"><label>Group by</label><select class="seg-select" id="expDim">${dimOpts.map((d) => `<option value="${d}" ${d === s.dim ? "selected" : ""}>${d === "(none)" ? "— none —" : d}</option>`).join("")}</select></div>
        <div class="bfield"><label>Visualize</label><div class="viz-pick" id="expViz">${vizList.map((v) => `<button data-v="${v}" class="${v === s.viz ? "on" : ""}" title="${v}">${VIZ_ICONS[v]}</button>`).join("")}</div></div>
      </div></div>
      <div class="card hover"><div class="card-h"><h3 id="expTitle"></h3><span class="sub" id="expSub"></span></div>
        <div class="card-body" id="expResult"></div></div>`;
    // wire controls
    $("#expTable").onchange = (e) => { s.table = e.target.value; s.measureIdx = 0; s.dim = SCHEMA[s.table].dims[0]; drawExplore(); };
    $("#expMeas").onchange = (e) => { s.measureIdx = +e.target.value; drawExplore(); };
    $("#expDim").onchange = (e) => { s.dim = e.target.value; drawExplore(); };
    $$("#expViz button").forEach((b) => b.onclick = () => { s.viz = b.dataset.v; drawExplore(); });
    $("#expSave").onclick = () => { const name = prompt("Name this question:", `${sc.measures[s.measureIdx].label}${s.dim !== "(none)" ? " by " + s.dim : ""}`); if (name) { saveQuestion({ type: "explore", name, spec: { ...s } }); toast("Saved to Collections"); } };
    runExploreInto("expResult", "expTitle", "expSub", s);
  }
  function runExploreInto(resultId, titleId, subId, s, chartId) {
    const out = runExplore(s); const sc = SCHEMA[s.table];
    if ($("#" + titleId)) $("#" + titleId).textContent = `${sc.measures[s.measureIdx].label}${s.dim !== "(none)" ? " by " + s.dim : ""}`;
    if ($("#" + subId)) $("#" + subId).textContent = `${sc.label} · ${sc.rows} rows`;
    const box = $("#" + resultId); if (!box) return;
    if (out.error) { box.innerHTML = `<div class="err">${out.error}</div>`; return; }
    const cid = chartId || resultId + "-chart";
    if (s.viz === "table" || s.dim === "(none)") { box.innerHTML = tableFromRows(out.rows); }
    else { box.innerHTML = `<div class="chart h-tall" id="${cid}"></div>`; requestAnimationFrame(() => chartFromRows(cid, out.rows, s.dim, "metric", s.viz)); }
  }

  /* =========================================================================
     SQL EDITOR (real, via alasql)
     ====================================================================== */
  let sqlState = null;
  const SQL_SAMPLES = [
    "SELECT property_name, COUNT(*) AS bookings, ROUND(SUM(amount)) AS revenue\nFROM bookings WHERE stage='booked'\nGROUP BY property_name ORDER BY revenue DESC",
    "SELECT evidence, COUNT(*) AS n FROM booking_matches GROUP BY evidence",
    "SELECT campaign_name, ROUND(SUM(cost_usd)) AS spend, SUM(clicks) AS clicks\nFROM google_ads_spend GROUP BY campaign_name ORDER BY spend DESC",
    "SELECT utm_source, COUNT(*) AS inquiries FROM inquiries GROUP BY utm_source ORDER BY inquiries DESC",
  ];
  function renderSQL(initialSql) {
    sqlState = { sql: initialSql || sqlState?.sql || SQL_SAMPLES[0], viz: "table", rows: null, cols: null, error: null };
    $("#view-sql").innerHTML = `
      <div class="page-head"><div><h1>SQL editor</h1><p>Runs real SQL against the in-browser dataset <span class="mock-flag">● demo data</span></p></div>
        <button class="btn primary" id="sqlSave"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h7"/></svg>Save question</button></div>
      <div class="card"><div class="card-body">
        <textarea class="sql-area" id="sqlInput" spellcheck="false">${sqlState.sql.replace(/</g, "&lt;")}</textarea>
        <div class="sql-bar">
          <button class="btn primary" id="sqlRun"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l14 8-14 8z"/></svg>Run <span class="note" style="color:#fff;opacity:.7;font-weight:500">⌘↵</span></button>
          <span class="hint">tables:</span>
          ${Object.keys(window.DB).map((t) => `<span class="sql-chip" data-t="${t}">${t}</span>`).join("")}
        </div>
      </div></div>
      <div class="card hover" style="margin-top:16px"><div class="card-h"><h3>Result</h3><span class="sub" id="sqlMeta"></span></div>
        <div class="card-body" id="sqlResult"><div class="result-meta">Run a query to see results.</div></div></div>`;
    const run = () => {
      const sql = $("#sqlInput").value.trim(); sqlState.sql = sql;
      let rows;
      try { rows = alasql(sql); } catch (e) { $("#sqlResult").innerHTML = `<div class="err">${e.message}</div>`; $("#sqlMeta").textContent = "error"; return; }
      if (!Array.isArray(rows)) { $("#sqlResult").innerHTML = `<div class="result-meta">Statement OK.</div>`; $("#sqlMeta").textContent = ""; return; }
      sqlState.rows = rows; sqlState.cols = rows[0] ? Object.keys(rows[0]) : [];
      $("#sqlMeta").textContent = `${rows.length} row${rows.length === 1 ? "" : "s"}`;
      drawSqlResult();
    };
    $("#sqlRun").onclick = run;
    $("#sqlInput").addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); run(); } });
    $$("#view-sql .sql-chip").forEach((c) => c.onclick = () => { const ta = $("#sqlInput"); ta.value = `SELECT * FROM ${c.dataset.t} LIMIT 20`; ta.focus(); });
    $("#sqlSave").onclick = () => { if (!sqlState.sql) return; const name = prompt("Name this question:", "SQL query"); if (name) { saveQuestion({ type: "sql", name, spec: { sql: sqlState.sql } }); toast("Saved to Collections"); } };
    run();
  }
  function drawSqlResult() {
    const box = $("#sqlResult"); const rows = sqlState.rows, cols = sqlState.cols;
    const canChart = cols.length === 2 && rows.length && typeof rows[0][cols[1]] === "number";
    const vizBtns = canChart ? `<div class="viz-pick" id="sqlViz" style="margin-bottom:12px">${["table", "bar", "line", "pie"].map((v) => `<button data-v="${v}" class="${v === sqlState.viz ? "on" : ""}">${VIZ_ICONS[v]}</button>`).join("")}</div>` : "";
    if (sqlState.viz !== "table" && canChart) {
      box.innerHTML = vizBtns + `<div class="chart h-tall" id="sqlChart"></div>`;
      requestAnimationFrame(() => chartFromRows("sqlChart", rows, cols[0], cols[1], sqlState.viz));
    } else {
      box.innerHTML = vizBtns + tableFromRows(rows, cols);
    }
    $$("#sqlViz button").forEach((b) => b.onclick = () => { sqlState.viz = b.dataset.v; drawSqlResult(); });
  }

  /* =========================================================================
     COLLECTIONS + open a saved question
     ====================================================================== */
  let LAST_Q = null;
  function renderCollections() {
    const qs = getQuestions();
    const head = `<div class="page-head"><div><h1>Collections</h1><p>Your saved questions</p></div></div>`;
    if (!qs.length) {
      $("#view-collections").innerHTML = head + `<div class="card"><div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg><h4>Nothing saved yet</h4><p>Build a question in Explore or the SQL editor, then Save it.</p></div></div>`;
      return;
    }
    $("#view-collections").innerHTML = head + `<div class="grid cols-3 stagger">${qs.map((q) => `
      <div class="card hover q-card" data-q="${q.id}">
        <div class="q-ic">${q.type === "sql" ? VIZ_ICONS.table : VIZ_ICONS.bar}</div>
        <h4>${q.name}</h4>
        <div class="q-meta"><span>${q.type === "sql" ? "SQL" : "Question"}</span><span>·</span><span>${q.created}</span></div>
      </div>`).join("")}</div>`;
    $$("#view-collections .q-card").forEach((c) => c.onclick = () => openQuestion(getQuestions().find((q) => q.id === c.dataset.q)));
  }
  function openQuestion(q) {
    if (!q) return; LAST_Q = q; CURRENT = "question";
    const v = $("#view-question");
    v.innerHTML = `
      <div class="page-head"><div><h1>${q.name}</h1><p>${q.type === "sql" ? "SQL question" : "Saved question"} · saved ${q.created}</p></div>
        <div style="display:flex;gap:8px"><button class="btn" id="qEdit">Edit</button><button class="btn" id="qDel">Delete</button></div></div>
      <div class="card hover"><div class="card-body" id="qBody"></div></div>`;
    $$(".view").forEach((x) => x.classList.remove("active")); v.classList.add("active");
    $$("#nav a").forEach((a) => a.classList.remove("active"));
    $("#topTitle").childNodes[0].nodeValue = q.name; $("#topSub").textContent = "Saved question";
    if (q.type === "sql") {
      let rows; try { rows = alasql(q.spec.sql); } catch (e) { $("#qBody").innerHTML = `<div class="err">${e.message}</div>`; }
      if (rows) { const cols = rows[0] ? Object.keys(rows[0]) : []; const canChart = cols.length === 2 && typeof rows[0]?.[cols[1]] === "number";
        if (canChart) { $("#qBody").innerHTML = `<div class="chart h-tall" id="qChart"></div>`; requestAnimationFrame(() => chartFromRows("qChart", rows, cols[0], cols[1], "bar")); }
        else $("#qBody").innerHTML = tableFromRows(rows, cols); }
      $("#qEdit").onclick = () => { showView("sql"); renderSQL(q.spec.sql); };
    } else {
      runExploreInto("qBody", null, null, q.spec, "qChart2");
      $("#qEdit").onclick = () => { exploreState = { ...q.spec }; showView("explore"); };
    }
    $("#qDel").onclick = () => { deleteQuestion(q.id); toast("Deleted"); showView("collections"); };
  }

  /* =========================================================================
     THEME
     ====================================================================== */
  function applyTheme(t) { document.body.classList.toggle("dark", t === "dark"); localStorage.setItem("bb_theme", t); }
  function toggleTheme() {
    const next = document.body.classList.contains("dark") ? "light" : "dark";
    applyTheme(next);
    if (CURRENT === "question" && LAST_Q) openQuestion(LAST_Q); else showView(CURRENT);
  }

  /* =========================================================================
     ROUTING
     ====================================================================== */
  const RENDER = { home: renderHome, dashboard: renderDashboard, explore: renderExplore, sql: () => renderSQL(), collections: renderCollections, question: () => { if (LAST_Q) openQuestion(LAST_Q); }, bookings: renderBookings, campaigns: renderCampaigns, browse: renderBrowse, settings: renderSettings };
  const TITLES = {
    home: ["Home", "Welcome back"],
    dashboard: ["Attribution Dashboard", "Pure Kauai · Google Ads"],
    explore: ["Explore", "Ask a question"],
    sql: ["SQL editor", "Run queries"],
    collections: ["Collections", "Saved questions"],
    question: ["Question", "Saved"],
    bookings: ["Bookings", "Match status & evidence"],
    campaigns: ["Campaigns", "Spend vs proven revenue"],
    browse: ["Browse data", "BookingBridge · SQLite"],
    settings: ["Appearance", "White-label"],
  };
  function showView(name) {
    CURRENT = name;
    RENDER[name]();
    $$(".view").forEach(v => v.classList.remove("active"));
    $(`#view-${name}`).classList.add("active");
    $$("#nav a").forEach(a => a.classList.toggle("active", a.dataset.view === name));
    $("#topTitle").childNodes[0].nodeValue = TITLES[name][0];
    $("#topSub").textContent = TITLES[name][1];
    // The view is already display-visible here, so containers have their size.
    rerenderChartsFor(name);
    [50, 180, 420, 800].forEach((ms) => setTimeout(resizeAll, ms));
  }

  /* =========================================================================
     BOOT
     ====================================================================== */
  async function reload() { DATA = await getData(RANGE); showView(CURRENT); }

  async function init() {
    loadBrand();
    applyTheme(localStorage.getItem("bb_theme") || "light");
    registerSQL();
    updateSavedCount();
    DATA = await getData(RANGE);
    // nav
    $("#nav").addEventListener("click", (e) => {
      const a = e.target.closest("a[data-view]"); if (!a) return;
      e.preventDefault(); showView(a.dataset.view);
    });
    // home tiles + jumps
    document.body.addEventListener("click", (e) => {
      const j = e.target.closest("[data-jump]"); if (j) showView(j.dataset.jump);
    });
    // range
    $("#rangeCtl").addEventListener("click", async (e) => {
      const b = e.target.closest("button[data-range]"); if (!b) return;
      $$("#rangeCtl button").forEach(x => x.classList.remove("on")); b.classList.add("on");
      RANGE = +b.dataset.range; await reload();
    });
    // theme toggle
    $("#themeToggle").addEventListener("click", toggleTheme);
    // +New menu
    const panel = $("#newMenuPanel");
    $("#newBtn").addEventListener("click", (e) => { e.stopPropagation(); panel.hidden = !panel.hidden; });
    document.addEventListener("click", () => { panel.hidden = true; });
    panel.addEventListener("click", (e) => {
      const a = e.target.closest("a[data-new]"); if (!a) return;
      panel.hidden = true;
      const k = a.dataset.new;
      if (k === "explore") { exploreState = null; showView("explore"); }
      else if (k === "sql") { showView("sql"); }
      else if (k === "dashboard-new") showView("dashboard");
    });
    showView("home");
  }
  document.addEventListener("DOMContentLoaded", init);
})();
