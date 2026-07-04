/**
 * The web dashboard served at "/" by the suite server.
 *
 * A single self-contained HTML page (no build step, no CDN dependencies)
 * aimed at non-technical users: launch campaigns with a form, watch delivery
 * on a dashboard, pause/resume, review governance — no CLI, no JSON.
 *
 * Kept as a template string so it ships inside the compiled dist/ output.
 * NOTE: the embedded <script> deliberately uses string concatenation instead
 * of template literals so this outer template literal needs no escaping.
 */
export const UI_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AdCP Campaign Studio</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%232a78d6'/%3E%3Ctext x='16' y='21' font-family='sans-serif' font-size='13' font-weight='700' fill='white' text-anchor='middle'%3EAd%3C/text%3E%3C/svg%3E">
<style>
  :root {
    --surface-1: #fcfcfb;      /* chart/card surface */
    --plane: #f9f9f7;          /* page plane */
    --ink-1: #0b0b0b;          /* primary ink */
    --ink-2: #52514e;          /* secondary ink */
    --ink-3: #898781;          /* muted */
    --grid: #e1e0d9;           /* hairline */
    --baseline: #c3c2b7;
    --border: rgba(11,11,11,0.10);
    --series-1: #2a78d6;       /* categorical slot 1 (blue) */
    --series-1-soft: #cde2fb;  /* sequential step 100 */
    --good: #0ca30c;
    --warning: #fab219;
    --serious: #ec835a;
    --critical: #d03b3b;
    --good-text: #006300;
    --accent: #2a78d6;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --surface-1: #1a1a19;
      --plane: #0d0d0d;
      --ink-1: #ffffff;
      --ink-2: #c3c2b7;
      --ink-3: #898781;
      --grid: #2c2c2a;
      --baseline: #383835;
      --border: rgba(255,255,255,0.10);
      --series-1: #3987e5;
      --series-1-soft: #184f95;
      --good-text: #0ca30c;
      --accent: #3987e5;
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--plane);
    color: var(--ink-1);
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  a { color: var(--accent); text-decoration: none; }

  /* ---------- shell ---------- */
  .shell { max-width: 1080px; margin: 0 auto; padding: 20px 20px 64px; }
  header.top {
    display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
    padding: 6px 0 18px;
  }
  .logo {
    width: 34px; height: 34px; border-radius: 9px; flex: none;
    background: var(--series-1); color: #fff;
    display: grid; place-items: center; font-weight: 700; font-size: 15px;
  }
  .title { font-size: 19px; font-weight: 700; letter-spacing: -0.01em; }
  .subtitle { color: var(--ink-3); font-size: 13px; }
  nav.tabs { display: flex; gap: 4px; margin-left: auto; flex-wrap: wrap; }
  nav.tabs a {
    padding: 7px 13px; border-radius: 8px; color: var(--ink-2);
    font-weight: 550; font-size: 14px;
  }
  nav.tabs a:hover { background: var(--grid); }
  nav.tabs a.on { background: var(--series-1); color: #fff; }

  /* ---------- cards & layout ---------- */
  .card {
    background: var(--surface-1); border: 1px solid var(--border);
    border-radius: 14px; padding: 18px 20px; margin-bottom: 16px;
  }
  .card h2 { margin: 0 0 4px; font-size: 16px; }
  .card .hint { color: var(--ink-3); font-size: 13px; margin: 0 0 14px; }
  .grid { display: grid; gap: 14px; }
  .grid.tiles { grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
  .grid.two { grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
  .grid.cards { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }

  /* ---------- stat tile ---------- */
  .tile {
    background: var(--surface-1); border: 1px solid var(--border);
    border-radius: 14px; padding: 14px 16px;
  }
  .tile .k { color: var(--ink-2); font-size: 12.5px; font-weight: 550; }
  .tile .v { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; margin-top: 2px; }
  .tile .s { color: var(--ink-3); font-size: 12px; margin-top: 2px; }

  /* ---------- status pill (icon + label, never color alone) ---------- */
  .pill {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 2px 10px 2px 8px; border-radius: 999px;
    border: 1px solid var(--border); background: var(--plane);
    font-size: 12.5px; font-weight: 600; color: var(--ink-2); white-space: nowrap;
  }
  .pill .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ink-3); }
  .pill.active .dot, .pill.executed .dot { background: var(--good); }
  .pill.pending_start .dot { background: var(--warning); }
  .pill.paused .dot { background: var(--serious); }
  .pill.denied .dot, .pill.rejected .dot { background: var(--critical); }
  .pill.completed .dot { background: var(--series-1); }

  /* ---------- meters & bars ---------- */
  .meter {
    height: 8px; border-radius: 4px; background: var(--grid);
    overflow: hidden; min-width: 90px;
  }
  .meter > i { display: block; height: 100%; background: var(--series-1); border-radius: 0 4px 4px 0; }
  .meter.paused > i { background: var(--serious); }

  .hbar-row { display: grid; grid-template-columns: minmax(120px, 200px) 1fr 90px; gap: 10px; align-items: center; padding: 5px 0; }
  .hbar-row .lbl { font-size: 13px; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hbar-track { height: 14px; position: relative; }
  .hbar-fill {
    position: absolute; left: 0; top: 0; bottom: 0;
    background: var(--series-1); border-radius: 0 4px 4px 0; min-width: 2px;
  }
  .hbar-row .val { font-size: 13px; color: var(--ink-1); font-variant-numeric: tabular-nums; text-align: right; }
  .chart-title { font-size: 13.5px; font-weight: 650; color: var(--ink-2); margin: 0 0 8px; }
  .axis-note { border-top: 1px solid var(--grid); margin-top: 8px; padding-top: 6px; color: var(--ink-3); font-size: 12px; }

  /* ---------- table ---------- */
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; color: var(--ink-3); font-size: 12px; font-weight: 600;
       text-transform: uppercase; letter-spacing: 0.04em;
       padding: 8px 10px; border-bottom: 1px solid var(--grid); }
  td { padding: 10px; border-bottom: 1px solid var(--grid); vertical-align: middle; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr.rowlink { cursor: pointer; }
  tr.rowlink:hover td { background: var(--plane); }

  /* ---------- forms ---------- */
  label.f { display: block; font-size: 13px; font-weight: 600; color: var(--ink-2); margin: 14px 0 5px; }
  input[type=text], input[type=number], input[type=date], textarea, select {
    width: 100%; padding: 9px 11px; border-radius: 9px;
    border: 1px solid var(--baseline); background: var(--plane); color: var(--ink-1);
    font: inherit;
  }
  textarea { min-height: 92px; resize: vertical; }
  input:focus, textarea:focus, select:focus { outline: 2px solid var(--series-1); outline-offset: 0; border-color: transparent; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .checks { display: flex; gap: 8px; flex-wrap: wrap; }
  .checks label {
    display: inline-flex; gap: 7px; align-items: center;
    border: 1px solid var(--baseline); border-radius: 9px; padding: 7px 12px;
    cursor: pointer; font-size: 14px; background: var(--plane);
  }
  .checks label:has(input:checked) { border-color: var(--series-1); background: var(--series-1-soft); }
  .checks input { accent-color: var(--series-1); }

  button {
    font: inherit; font-weight: 650; border-radius: 10px; cursor: pointer;
    padding: 10px 16px; border: 1px solid var(--baseline);
    background: var(--surface-1); color: var(--ink-1);
  }
  button:hover { background: var(--grid); }
  button.primary { background: var(--series-1); border-color: var(--series-1); color: #fff; }
  button.primary:hover { filter: brightness(1.08); }
  button:disabled { opacity: 0.55; cursor: wait; }
  .btnrow { display: flex; gap: 10px; margin-top: 18px; flex-wrap: wrap; }

  /* ---------- timeline ---------- */
  .steps { list-style: none; margin: 0; padding: 0; }
  .steps li { display: flex; gap: 12px; padding: 7px 0; align-items: baseline; }
  .steps .ic { flex: none; width: 26px; text-align: center; }
  .steps .what { font-weight: 600; font-size: 14px; }
  .steps .msg { color: var(--ink-2); font-size: 13.5px; }

  .banner { border-radius: 12px; padding: 13px 16px; margin: 14px 0; font-size: 14px;
            border: 1px solid var(--border); display: flex; gap: 10px; align-items: baseline; }
  .banner.ok { background: color-mix(in srgb, var(--good) 9%, var(--surface-1)); }
  .banner.bad { background: color-mix(in srgb, var(--critical) 9%, var(--surface-1)); }
  .banner.info { background: color-mix(in srgb, var(--series-1) 9%, var(--surface-1)); }

  .empty { text-align: center; padding: 44px 20px; color: var(--ink-2); }
  .empty .big { font-size: 40px; }
  .empty h3 { margin: 8px 0 4px; color: var(--ink-1); }
  .kv { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; font-size: 13.5px; }
  .kv dt { color: var(--ink-3); } .kv dd { margin: 0; }
  .muted { color: var(--ink-3); } .small { font-size: 12.5px; }
  .right { margin-left: auto; }
  .crumb { font-size: 13.5px; margin-bottom: 12px; display: inline-block; }
  .spin { display: inline-block; width: 14px; height: 14px; border: 2px solid var(--grid);
          border-top-color: var(--series-1); border-radius: 50%; animation: sp 0.8s linear infinite; vertical-align: -2px; }
  @keyframes sp { to { transform: rotate(360deg); } }
  .toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
           background: var(--ink-1); color: var(--plane); border-radius: 10px;
           padding: 10px 18px; font-size: 14px; opacity: 0; transition: opacity .25s; pointer-events: none; z-index: 50; }
  .toast.show { opacity: 1; }
  @media (max-width: 640px) { .row { grid-template-columns: 1fr; } .hbar-row { grid-template-columns: 100px 1fr 80px; } }
</style>
</head>
<body>
<div class="shell">
  <header class="top">
    <div class="logo">Ad</div>
    <div>
      <div class="title">AdCP Campaign Studio</div>
      <div class="subtitle">Plan, launch and track ad campaigns — no code needed</div>
    </div>
    <nav class="tabs" id="nav"></nav>
  </header>
  <main id="view"></main>
</div>
<div class="toast" id="toast"></div>

<script>
"use strict";

/* ------------------------------ utils ------------------------------ */

var $ = function (id) { return document.getElementById(id); };
var nfmt = new Intl.NumberFormat("en-US");
function money(n) { return "$" + (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function money0(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
function num(n) { return nfmt.format(Math.round(n)); }
function pct(x) { return Math.round(x * 100) + "%"; }
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function dt(s) {
  var d = new Date(s);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function toast(msg) {
  var t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._h); toast._h = setTimeout(function () { t.classList.remove("show"); }, 2600);
}
function api(path, opts) {
  return fetch("/api" + path, opts).then(function (r) {
    return r.json().then(function (j) {
      if (!r.ok) { throw new Error((j && j.error && j.error.message) || ("Request failed (" + r.status + ")")); }
      return j;
    });
  });
}
function post(path, body) {
  return api(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
}

/* ------------------------- friendly wording ------------------------ */

var STEP_WORDS = {
  discover: ["🔎", "Searched inventory"],
  select: ["🎯", "Chose products & split the budget"],
  signals: ["📡", "Activated audience data"],
  creative: ["🎨", "Generated ad creatives"],
  govern: ["⚖️", "Governance review"],
  sync_accounts: ["🤝", "Set up the seller account"],
  sync_creatives: ["🖼️", "Sent creatives for approval"],
  create_media_buy: ["🚀", "Placed the media buy"]
};
var STATUS_WORDS = {
  active: "Running", pending_start: "Scheduled", paused: "Paused",
  completed: "Finished", rejected: "Rejected", executed: "Launched",
  denied: "Not approved", no_inventory: "No inventory matched", "—": "—"
};
function pill(status) {
  var label = STATUS_WORDS[status] || status;
  return '<span class="pill ' + esc(status) + '"><span class="dot"></span>' + esc(label) + "</span>";
}
var PRODUCT_WORDS = {
  streamhaus_sports_ctv: "Sports on Connected TV",
  streamhaus_olv_run_of_network: "Online video network",
  streamhaus_display_ros: "Display banners",
  streamhaus_audio_network: "Streaming audio"
};
function productName(id) { return PRODUCT_WORDS[id] || id; }
var CHANNEL_WORDS = { ctv: "Connected TV", olv: "Online video", display: "Display", audio: "Audio", native: "Native", social: "Social", dooh: "Digital out-of-home", retail_media: "Retail media" };
function channelName(c) { return CHANNEL_WORDS[c] || c; }

/* ------------------------------ router ----------------------------- */

var TABS = [
  ["#/dashboard", "Dashboard"],
  ["#/new", "New campaign"],
  ["#/inventory", "Inventory"],
  ["#/creatives", "Creatives"],
  ["#/signals", "Audiences"]
];
var refreshTimer = null;

function render() {
  clearInterval(refreshTimer);
  var hash = location.hash || "#/dashboard";
  var navHtml = "";
  for (var i = 0; i < TABS.length; i++) {
    var on = hash.indexOf(TABS[i][0]) === 0 || (TABS[i][0] === "#/dashboard" && hash.indexOf("#/campaign/") === 0);
    navHtml += '<a href="' + TABS[i][0] + '" class="' + (on ? "on" : "") + '">' + TABS[i][1] + "</a>";
  }
  $("nav").innerHTML = navHtml;

  if (hash.indexOf("#/campaign/") === 0) { return viewCampaign(hash.slice("#/campaign/".length)); }
  if (hash === "#/new") { return viewNew(); }
  if (hash === "#/inventory") { return viewInventory(); }
  if (hash === "#/creatives") { return viewCreatives(); }
  if (hash === "#/signals") { return viewSignals(); }
  return viewDashboard();
}
window.addEventListener("hashchange", render);

/* ----------------------------- dashboard --------------------------- */

function viewDashboard() {
  $("view").innerHTML = '<div class="muted">Loading… <span class="spin"></span></div>';
  Promise.all([api("/overview"), api("/campaigns")]).then(function (rs) {
    var o = rs[0], list = rs[1].campaigns;
    var html = "";
    html += '<div class="grid tiles">'
      + tile("Spend so far", money0(o.total_spend), "of " + money0(o.total_budget) + " budgeted")
      + tile("Impressions", num(o.impressions), "ads shown")
      + tile("Clicks", num(o.clicks), o.impressions > 0 ? (Math.round(o.clicks / o.impressions * 10000) / 100) + "% click rate" : "no delivery yet")
      + tile("Campaigns", String(o.campaigns), o.active + " running now")
      + "</div>";

    html += '<div class="card" style="margin-top:16px">';
    html += '<div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap"><h2>Your campaigns</h2>'
      + '<span class="hint" style="margin:0">updates every 15 seconds</span>'
      + '<span class="right"></span>'
      + '<button onclick="makeSample(this)">Create sample campaign</button>'
      + '<button class="primary" onclick="location.hash=\\'#/new\\'">＋ New campaign</button></div>';

    if (list.length === 0) {
      html += '<div class="empty"><div class="big">📣</div><h3>No campaigns yet</h3>'
        + "<p>Launch your first campaign in about a minute — or create a sample campaign<br>that is already mid-flight so you can explore the dashboard.</p></div>";
    } else {
      html += '<div style="overflow-x:auto"><table><thead><tr>'
        + "<th>Campaign</th><th>Status</th><th class=num>Budget</th><th>Delivery</th><th class=num>Impressions</th><th>Flight</th>"
        + "</tr></thead><tbody>";
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        var st = c.status === "executed" ? c.delivery_status : c.status;
        html += '<tr class="rowlink" onclick="location.hash=\\'#/campaign/' + esc(c.plan_id) + '\\'">'
          + "<td><strong>" + esc(c.name) + "</strong><br><span class='muted small'>" + esc(c.brand.name || c.brand.domain) + "</span></td>"
          + "<td>" + pill(st) + "</td>"
          + '<td class="num">' + money0(c.budget) + "</td>"
          + '<td><div style="display:flex;align-items:center;gap:8px"><div class="meter ' + (st === "paused" ? "paused" : "") + '" style="flex:1"><i style="width:' + Math.min(100, Math.round(c.pacing * 100)) + '%"></i></div>'
          + '<span class="small" style="font-variant-numeric:tabular-nums">' + pct(c.pacing) + "</span></div>"
          + '<div class="muted small">' + money0(c.spend) + " spent</div></td>"
          + '<td class="num">' + num(c.impressions) + "</td>"
          + '<td class="small">' + dt(c.start_time) + " → " + dt(c.end_time) + "</td></tr>";
      }
      html += "</tbody></table></div>";
    }
    html += "</div>";
    $("view").innerHTML = html;
    refreshTimer = setInterval(function () { if ((location.hash || "#/dashboard") === "#/dashboard") { viewDashboard(); } }, 15000);
  }).catch(showErr);
}

function tile(k, v, s) {
  return '<div class="tile"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div><div class="s">' + esc(s || "") + "</div></div>";
}
function showErr(e) {
  $("view").innerHTML = '<div class="banner bad">⚠️ <span>' + esc(e.message || e) + "</span></div>";
}
function makeSample(btn) {
  btn.disabled = true;
  post("/sample").then(function (d) {
    toast("Sample campaign created");
    location.hash = "#/campaign/" + d.summary.plan_id;
  }).catch(function (e) { btn.disabled = false; toast(e.message); });
}

/* ---------------------------- new campaign ------------------------- */

function viewNew() {
  var today = new Date();
  var end = new Date(today.getTime() + 30 * 86400000);
  function iso(d) { return d.toISOString().slice(0, 10); }
  var channels = ["ctv", "olv", "display", "audio"];
  var checksHtml = "";
  for (var i = 0; i < channels.length; i++) {
    checksHtml += '<label><input type="checkbox" name="ch" value="' + channels[i] + '" checked> ' + channelName(channels[i]) + "</label>";
  }
  $("view").innerHTML =
    '<div class="card" style="max-width:760px">'
    + "<h2>Launch a new campaign</h2>"
    + '<p class="hint">Describe what you want in plain English. The agents find the inventory, build the ads, get approval, and place the buy.</p>'
    + '<div class="row"><div><label class="f">Campaign name</label><input type="text" id="f_name" placeholder="Summer Sale 2026"></div>'
    + '<div><label class="f">Brand name</label><input type="text" id="f_brand" placeholder="Acme Outdoor"></div></div>'
    + '<label class="f">Brand website</label><input type="text" id="f_domain" placeholder="acmeoutdoor.com">'
    + '<label class="f">What do you want to advertise, and to whom?</label>'
    + '<textarea id="f_brief" placeholder="Example: Premium sports video inventory, targeting 25-45 year olds interested in outdoor recreation. Focus on Connected TV and online video."></textarea>'
    + '<div class="row"><div><label class="f">Total budget (USD)</label><input type="number" id="f_budget" value="25000" min="100" step="100">'
    + '<div class="muted small" style="margin-top:4px">Budgets of $20,000 or more go through an approval step automatically.</div></div>'
    + '<div><label class="f">Audience data to layer on <span class="muted">(optional)</span></label><input type="text" id="f_signal" placeholder="Outdoor enthusiasts near sporting goods stores"></div></div>'
    + '<div class="row"><div><label class="f">Start date</label><input type="date" id="f_start" value="' + iso(today) + '"></div>'
    + '<div><label class="f">End date</label><input type="date" id="f_end" value="' + iso(end) + '"></div></div>'
    + '<label class="f">Where should the ads run?</label><div class="checks">' + checksHtml + "</div>"
    + '<div class="btnrow"><button onclick="previewInventory(this)">Preview matching inventory</button>'
    + '<button class="primary" onclick="launch(this)">🚀 Launch campaign</button></div>'
    + '<div id="preview"></div><div id="launchout"></div>'
    + "</div>";
}

function formPayload() {
  var chs = [];
  var boxes = document.querySelectorAll('input[name=ch]:checked');
  for (var i = 0; i < boxes.length; i++) { chs.push(boxes[i].value); }
  var name = $("f_name").value.trim() || "Untitled campaign";
  var brandName = $("f_brand").value.trim() || "My brand";
  var domain = $("f_domain").value.trim() || (brandName.toLowerCase().replace(/[^a-z0-9]+/g, "") + ".com");
  return {
    name: name,
    brief: $("f_brief").value.trim() || name,
    brand_name: brandName,
    brand_domain: domain,
    total_budget: Number($("f_budget").value) || 1000,
    start_time: new Date($("f_start").value + "T00:00:00Z").toISOString(),
    end_time: new Date($("f_end").value + "T23:59:59Z").toISOString(),
    channels: chs,
    signal_spec: $("f_signal").value.trim() || undefined
  };
}

function previewInventory(btn) {
  var p = formPayload();
  btn.disabled = true;
  api("/products?brief=" + encodeURIComponent(p.brief) + "&budget=" + p.total_budget).then(function (d) {
    btn.disabled = false;
    var html = '<h2 style="margin-top:22px">Matching inventory</h2><p class="hint">Best matches first — the top 3 are bought automatically at launch.</p><div class="grid cards">';
    for (var i = 0; i < d.products.length; i++) { html += productCard(d.products[i], i === 0); }
    html += "</div>";
    $("preview").innerHTML = html;
  }).catch(function (e) { btn.disabled = false; toast(e.message); });
}

function productCard(prod, best) {
  var opt = prod.pricing_options[0];
  var fc = prod.forecast && prod.forecast.impressions ? num(prod.forecast.impressions.min) + " – " + num(prod.forecast.impressions.max) + " impressions" : "";
  var chs = [];
  for (var i = 0; i < prod.channels.length; i++) { chs.push(channelName(prod.channels[i])); }
  return '<div class="card" style="margin:0">' + (best ? '<div class="small" style="color:var(--good-text);font-weight:650">★ Best match</div>' : "")
    + "<strong>" + esc(prod.name) + "</strong>"
    + '<div class="muted small" style="margin:4px 0 8px">' + esc(prod.description) + "</div>"
    + '<div class="kv"><dt>Where</dt><dd>' + esc(chs.join(", ")) + "</dd>"
    + "<dt>Price</dt><dd>" + money(opt.price) + " " + esc(opt.model.toUpperCase()) + (opt.min_spend ? ' <span class="muted small">(min ' + money0(opt.min_spend) + ")</span>" : "") + "</dd>"
    + (fc ? "<dt>Forecast</dt><dd>" + fc + "</dd>" : "") + "</div></div>";
}

function launch(btn) {
  var p = formPayload();
  btn.disabled = true;
  $("launchout").innerHTML = '<div class="banner info"><span class="spin"></span><span>Working — searching inventory, building creatives, getting approval…</span></div>';
  post("/campaigns", p).then(function (d) {
    btn.disabled = false;
    var r = d.result;
    var html = "";
    if (r.status === "executed") {
      html += '<div class="banner ok">✅ <span><strong>Campaign launched.</strong> ' + esc(governanceLine(r.governance)) + "</span></div>";
    } else if (r.status === "denied") {
      html += '<div class="banner bad">🛑 <span><strong>Not approved.</strong> ' + esc(r.governance.reason || "The governance check declined this plan.") + " Adjust the brief or budget and try again.</span></div>";
    } else {
      html += '<div class="banner bad">😕 <span><strong>No inventory matched.</strong> Try different wording or channels.</span></div>';
    }
    html += '<h2 style="margin-top:20px">What the agents did</h2>' + stepsHtml(r.events);
    if (r.status === "executed") {
      html += '<div class="btnrow"><button class="primary" onclick="location.hash=\\'#/campaign/' + esc(r.plan_id) + '\\'">View campaign →</button></div>';
    }
    $("launchout").innerHTML = html;
    $("launchout").scrollIntoView({ behavior: "smooth", block: "start" });
  }).catch(function (e) {
    btn.disabled = false;
    $("launchout").innerHTML = '<div class="banner bad">⚠️ <span>' + esc(e.message) + "</span></div>";
  });
}

function governanceLine(g) {
  if (g.result === "approved") { return "Approved automatically" + (g.conditions && g.conditions.length ? " (" + g.conditions.join("; ") + ")" : "") + "."; }
  if (g.result === "escalated") { return "The budget needed a human sign-off — approved with conditions: " + (g.conditions || []).join("; ") + "."; }
  return g.reason || "";
}

function stepsHtml(events) {
  var html = '<ol class="steps">';
  for (var i = 0; i < (events || []).length; i++) {
    var e = events[i];
    var w = STEP_WORDS[e.step] || ["•", e.step];
    html += '<li><span class="ic">' + w[0] + '</span><span><span class="what">' + esc(w[1]) + '</span> — <span class="msg">' + esc(e.message) + "</span></span></li>";
  }
  return html + "</ol>";
}

/* --------------------------- campaign detail ----------------------- */

function viewCampaign(id) {
  $("view").innerHTML = '<div class="muted">Loading… <span class="spin"></span></div>';
  api("/campaigns/" + encodeURIComponent(id)).then(function (d) {
    var s = d.summary, r = d.result;
    var st = s.status === "executed" ? s.delivery_status : s.status;
    var totalDays = Math.max(1, (Date.parse(s.end_time) - Date.parse(s.start_time)) / 86400000);
    var dayIn = Math.min(totalDays, Math.max(0, (Date.now() - Date.parse(s.start_time)) / 86400000));
    var ctr = s.impressions > 0 ? (Math.round(s.clicks / s.impressions * 10000) / 100) + "%" : "—";

    var html = '<a class="crumb" href="#/dashboard">← All campaigns</a>';
    html += '<div class="card"><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">'
      + "<div><h2 style='font-size:20px'>" + esc(s.name) + "</h2>"
      + '<div class="muted small">' + esc(s.brand.name || s.brand.domain) + " · " + dt(s.start_time) + " → " + dt(s.end_time)
      + " · day " + Math.ceil(dayIn) + " of " + Math.round(totalDays) + "</div></div>"
      + '<span class="right"></span>' + pill(st);
    if (s.status === "executed") {
      if (st === "paused") { html += ' <button onclick="doAction(\\'' + esc(id) + '\\',\\'resume\\',this)">▶ Resume</button>'; }
      else if (st === "active" || st === "pending_start") { html += ' <button onclick="doAction(\\'' + esc(id) + '\\',\\'pause\\',this)">⏸ Pause</button>'; }
    }
    html += "</div>";
    html += '<div style="margin-top:12px"><div class="meter ' + (st === "paused" ? "paused" : "") + '"><i style="width:' + Math.min(100, Math.round(s.pacing * 100)) + '%"></i></div>'
      + '<div class="muted small" style="margin-top:4px">' + money(s.spend) + " of " + money0(s.budget) + " spent (" + pct(s.pacing) + ")</div></div></div>";

    html += '<div class="grid tiles">'
      + tile("Spend", money0(s.spend), "of " + money0(s.budget))
      + tile("Impressions", num(s.impressions), "ads shown")
      + tile("Clicks", num(s.clicks), ctr + " click rate")
      + tile("Conversions", String(s.conversions), "logged for attribution")
      + "</div>";

    if (d.delivery.length > 0) {
      html += '<div class="grid two" style="margin-top:16px">';
      html += '<div class="card" style="margin:0"><h2>Where the impressions went</h2><p class="hint">By product package</p>' + hbars(d.delivery, "impressions") + '<div class="axis-note">Impressions to date</div></div>';
      html += '<div class="card" style="margin:0"><h2>Where the money went</h2><p class="hint">By product package</p>' + hbars(d.delivery, "spend") + '<div class="axis-note">Spend to date (USD)</div></div>';
      html += "</div>";
    }

    if (r.media_buys && r.media_buys.length) {
      html += '<div class="card" style="margin-top:16px"><h2>Packages</h2><div style="overflow-x:auto"><table><thead><tr><th>Product</th><th>Status</th><th class=num>Budget</th><th class=num>Spent</th><th class=num>Impressions</th><th class=num>Ads</th></tr></thead><tbody>';
      for (var m = 0; m < r.media_buys.length; m++) {
        var mb = r.media_buys[m].media_buy;
        var rep = null;
        for (var q = 0; q < d.delivery.length; q++) { if (d.delivery[q].media_buy_id === mb.media_buy_id) { rep = d.delivery[q]; } }
        for (var pi = 0; pi < mb.packages.length; pi++) {
          var pk = mb.packages[pi];
          var pr = null;
          if (rep) { for (var q2 = 0; q2 < rep.by_package.length; q2++) { if (rep.by_package[q2].package_id === pk.package_id) { pr = rep.by_package[q2]; } } }
          html += "<tr><td><strong>" + esc(productName(pk.product_id)) + "</strong><br><span class='muted small'>" + esc(pk.pricing_model.toUpperCase()) + " @ " + money(pk.effective_price) + "</span></td>"
            + "<td>" + pill(pk.status) + "</td>"
            + '<td class="num">' + money0(pk.budget) + "</td>"
            + '<td class="num">' + (pr ? money0(pr.spend) : "—") + "</td>"
            + '<td class="num">' + (pr ? num(pr.impressions) : "—") + "</td>"
            + '<td class="num">' + pk.creative_ids.length + "</td></tr>";
        }
      }
      html += "</tbody></table></div></div>";
    }

    if (s.status === "executed") {
      html += '<div class="card"><h2>Actions</h2><p class="hint">Feed results back so the seller can optimize.</p><div class="btnrow">'
        + '<button onclick="logConv(\\'' + esc(id) + '\\',this)">🛒 Log a test purchase ($149.99)</button>'
        + '<select id="fb" style="width:auto"><option value="1.3">Performing well (1.3)</option><option value="1.0" selected>On target (1.0)</option><option value="0.7">Underperforming (0.7)</option></select>'
        + '<button onclick="sendFb(\\'' + esc(id) + '\\',this)">Send performance feedback</button>'
        + "</div></div>";
    }

    html += '<div class="grid two">';
    html += '<div class="card" style="margin:0"><h2>How this campaign was set up</h2>' + stepsHtml(r.events) + "</div>";
    html += '<div class="card" style="margin:0"><h2>Approval trail</h2><p class="hint">' + esc(governanceLine(r.governance)) + '</p><ol class="steps">';
    for (var a = 0; a < d.audit_log.length; a++) {
      var en = d.audit_log[a];
      html += '<li><span class="ic muted small" style="width:60px;flex:none;text-align:left">' + esc(en.timestamp.slice(11, 19)) + '</span><span><span class="what">' + esc(en.actor.replace(/_/g, " ")) + '</span> — <span class="msg">' + esc(en.action.replace(/_/g, " ")) + "</span></span></li>";
    }
    html += "</ol></div></div>";

    $("view").innerHTML = html;
    refreshTimer = setInterval(function () {
      if ((location.hash || "").indexOf("#/campaign/") === 0) { viewCampaign(id); }
    }, 15000);
  }).catch(showErr);
}

function hbars(reports, field) {
  // Flatten package rows across media buys; single-series horizontal bars,
  // direct-labeled (relief rule), 2px gaps via row padding.
  var rows = [];
  var max = 0;
  for (var i = 0; i < reports.length; i++) {
    for (var j = 0; j < reports[i].by_package.length; j++) {
      var p = reports[i].by_package[j];
      var v = field === "spend" ? p.spend : p.impressions;
      rows.push({ label: productName(p.product_id), v: v });
      if (v > max) { max = v; }
    }
  }
  if (max === 0) { return '<div class="muted small">No delivery yet — this campaign has not started serving.</div>'; }
  var html = "";
  for (var k = 0; k < rows.length; k++) {
    var w = Math.max(1, Math.round(rows[k].v / max * 100));
    var valText = field === "spend" ? money0(rows[k].v) : num(rows[k].v);
    html += '<div class="hbar-row" title="' + esc(rows[k].label) + ": " + esc(valText) + '">'
      + '<span class="lbl">' + esc(rows[k].label) + "</span>"
      + '<span class="hbar-track"><span class="hbar-fill" style="width:' + w + '%"></span></span>'
      + '<span class="val">' + esc(valText) + "</span></div>";
  }
  return html;
}

function doAction(id, action, btn) {
  btn.disabled = true;
  post("/campaigns/" + encodeURIComponent(id) + "/" + action).then(function () {
    toast(action === "pause" ? "Campaign paused" : "Campaign resumed");
    viewCampaign(id);
  }).catch(function (e) { btn.disabled = false; toast(e.message); });
}
function logConv(id, btn) {
  btn.disabled = true;
  post("/campaigns/" + encodeURIComponent(id) + "/conversions", { event_type: "purchase", value: 149.99 }).then(function (d) {
    toast("Purchase logged — " + d.total + " conversion(s) total");
    viewCampaign(id);
  }).catch(function (e) { btn.disabled = false; toast(e.message); });
}
function sendFb(id, btn) {
  btn.disabled = true;
  post("/campaigns/" + encodeURIComponent(id) + "/feedback", { performance_index: Number($("fb").value) }).then(function () {
    btn.disabled = false; toast("Feedback sent to the seller");
  }).catch(function (e) { btn.disabled = false; toast(e.message); });
}

/* ----------------------------- inventory --------------------------- */

function viewInventory() {
  $("view").innerHTML =
    '<div class="card"><h2>Browse inventory</h2><p class="hint">This is what the seller agents offer. Describe a campaign to rank the best matches first.</p>'
    + '<div style="display:flex;gap:10px;flex-wrap:wrap"><input type="text" id="q" placeholder="e.g. premium sports video for outdoor lovers" style="flex:1;min-width:220px">'
    + '<button class="primary" onclick="searchInv(this)">Search</button></div>'
    + '<div id="invout" class="grid cards" style="margin-top:16px"></div></div>';
  searchInv(null);
  $("q").addEventListener("keydown", function (e) { if (e.key === "Enter") { searchInv(null); } });
}
function searchInv(btn) {
  if (btn) { btn.disabled = true; }
  var q = $("q") ? $("q").value.trim() : "";
  api("/products" + (q ? "?brief=" + encodeURIComponent(q) : "")).then(function (d) {
    if (btn) { btn.disabled = false; }
    var html = "";
    for (var i = 0; i < d.products.length; i++) { html += productCard(d.products[i], q !== "" && i === 0); }
    $("invout").innerHTML = html || '<div class="muted">Nothing matched.</div>';
  }).catch(function (e) { if (btn) { btn.disabled = false; } toast(e.message); });
}

/* ----------------------------- creatives --------------------------- */

function viewCreatives() {
  $("view").innerHTML = '<div class="muted">Loading… <span class="spin"></span></div>';
  api("/creatives").then(function (d) {
    var html = '<div class="card"><h2>Creative library</h2><p class="hint">Ads generated by the creative agent and reviewed by the seller.</p>';
    if (d.creatives.length === 0) {
      html += '<div class="empty"><div class="big">🎨</div><h3>No creatives yet</h3><p>Launch a campaign and the creative agent will build ads for every format automatically.</p></div>';
    } else {
      html += '<div class="grid cards">';
      for (var i = 0; i < d.creatives.length; i++) {
        var c = d.creatives[i];
        var kinds = [];
        for (var k in c.assets) { if (Object.prototype.hasOwnProperty.call(c.assets, k)) { kinds.push(k); } }
        html += '<div class="card" style="margin:0"><div style="display:flex;gap:8px;align-items:center"><strong style="flex:1">' + esc(c.name) + "</strong>" + pill(c.status) + "</div>"
          + '<div class="muted small" style="margin-top:6px">Format: ' + esc(c.format_id.id) + "</div>"
          + '<div class="muted small">Assets: ' + esc(kinds.join(", ")) + "</div>"
          + (c.status_reason ? '<div class="small" style="color:var(--critical);margin-top:6px">' + esc(c.status_reason) + "</div>" : "")
          + "</div>";
      }
      html += "</div>";
    }
    $("view").innerHTML = html + "</div>";
  }).catch(showErr);
}

/* ------------------------------ signals ---------------------------- */

function viewSignals() {
  $("view").innerHTML =
    '<div class="card"><h2>Audience data</h2><p class="hint">Third-party targeting segments you can layer onto campaigns. Describe who you want to reach.</p>'
    + '<div style="display:flex;gap:10px;flex-wrap:wrap"><input type="text" id="sq" placeholder="e.g. outdoor enthusiasts near sporting goods stores" style="flex:1;min-width:220px">'
    + '<button class="primary" onclick="searchSig(this)">Search</button></div>'
    + '<div id="sigout" class="grid cards" style="margin-top:16px"></div></div>';
  searchSig(null);
  $("sq").addEventListener("keydown", function (e) { if (e.key === "Enter") { searchSig(null); } });
}
function searchSig(btn) {
  if (btn) { btn.disabled = true; }
  var q = $("sq") ? $("sq").value.trim() : "";
  api("/signals" + (q ? "?spec=" + encodeURIComponent(q) : "")).then(function (d) {
    if (btn) { btn.disabled = false; }
    var html = "";
    for (var i = 0; i < d.signals.length; i++) {
      var s = d.signals[i];
      html += '<div class="card" style="margin:0">' + (q && i === 0 && s.relevance > 0 ? '<div class="small" style="color:var(--good-text);font-weight:650">★ Best match</div>' : "")
        + "<strong>" + esc(s.name) + "</strong>"
        + '<div class="muted small" style="margin:4px 0 10px">' + esc(s.description) + "</div>"
        + '<div style="display:flex;align-items:center;gap:8px"><div class="meter" style="flex:1"><i style="width:' + Math.round(s.coverage_pct) + '%"></i></div>'
        + '<span class="small" style="font-variant-numeric:tabular-nums">' + Math.round(s.coverage_pct) + "% reach</span></div>"
        + '<div class="muted small" style="margin-top:8px">' + money(s.pricing.amount) + " CPM data fee</div></div>";
    }
    $("sigout").innerHTML = html || '<div class="muted">Nothing matched.</div>';
  }).catch(function (e) { if (btn) { btn.disabled = false; } toast(e.message); });
}

render();
</script>
</body>
</html>
`;
