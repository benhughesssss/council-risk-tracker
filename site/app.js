// Council Financial Risk Tracker — vanilla JS, no build step, no deps.
// Reads ./data/risk.json (written by pipeline/parse_rs_data.py).

const FOCUS_AUTHORITIES = ["Manchester", "Trafford"];

const STATUS = {
  critical: getVar("--status-critical"),
  serious:  getVar("--status-serious"),
  warning:  getVar("--status-warning"),
  good:     getVar("--status-good"),
};

function getVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#999";
}

// risk_band strings start with one of these — map to status class + rank
// (rank: lower = more severe, used for sorting).
function classifyBand(band) {
  if (band.startsWith("High"))     return { cls: "critical", rank: 0, label: "High" };
  if (band.startsWith("Elevated")) return { cls: "serious",  rank: 1, label: "Elevated" };
  if (band.startsWith("Watch"))    return { cls: "warning",  rank: 2, label: "Watch" };
  if (band.startsWith("Lower"))    return { cls: "good",     rank: 3, label: "Lower risk" };
  return { cls: "good", rank: 4, label: band };
}

function fmtPct(v) {
  return v === null || v === undefined ? "—" : `${v.toFixed(1)}%`;
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v; // always textContent — labels are untrusted data
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) node.appendChild(c);
  return node;
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

async function main() {
  const res = await fetch("data/risk.json");
  const data = await res.json();
  const authorities = data.authorities.filter(a => !a.error);

  document.getElementById("meta-line").textContent =
    `${authorities.length} authorities · financial years ${data.years_covered} · generated from ${data.generated_from}`;
  document.getElementById("footer-date").textContent = data.generated_at;

  renderKPIs(authorities);
  renderBarChart(authorities);
  renderLineChart(authorities);
  renderTable(authorities);
  wireThemeToggle();
}

function renderKPIs(authorities) {
  const onEFS = authorities.filter(a => a.exceptional_financial_support.length > 0);
  const everS114 = authorities.filter(a => a.section_114_notices.length > 0);
  const thinnest = [...authorities].sort((a, b) => a.reserves_pct_latest - b.reserves_pct_latest)[0];

  const tiles = [
    { label: "Authorities tracked", value: String(authorities.length), small: "GM + Gloucestershire" },
    { label: "Ever needed EFS (2022–27)", value: String(onEFS.length), small: onEFS.map(a => a.authority).join(", ") || "none" },
    { label: "Section 114 notices, ever", value: String(everS114.length), small: everS114.length ? everS114.map(a => a.authority).join(", ") : "none in scope" },
    { label: "Thinnest 2024–25 reserves", value: fmtPct(thinnest.reserves_pct_latest), small: thinnest.authority },
  ];

  const row = document.getElementById("kpi-row");
  row.innerHTML = "";
  for (const t of tiles) {
    row.appendChild(el("div", { class: "kpi-tile" }, [
      el("div", { class: "label", text: t.label }),
      el("div", { class: "value" }, [
        document.createTextNode(t.value + " "),
        el("small", { text: t.small }),
      ]),
    ]));
  }
}

function renderBarChart(authorities) {
  const sorted = [...authorities].sort((a, b) => a.reserves_pct_latest - b.reserves_pct_latest);
  const max = Math.max(...sorted.map(a => a.reserves_pct_latest)) * 1.08;

  const legend = document.getElementById("bar-legend");
  legend.innerHTML = "";
  const legendItems = [
    ["High", STATUS.critical], ["Elevated", STATUS.serious],
    ["Watch", STATUS.warning], ["Lower risk", STATUS.good],
  ];
  for (const [label, color] of legendItems) {
    legend.appendChild(el("span", { class: "item" }, [
      el("span", { class: "swatch", style: `background:${color}` }),
      el("span", { text: label }),
    ]));
  }

  const chart = document.getElementById("bar-chart");
  chart.innerHTML = "";
  for (const a of sorted) {
    const { cls } = classifyBand(a.risk_band);
    const isFocus = FOCUS_AUTHORITIES.includes(a.authority);
    const pctWidth = (a.reserves_pct_latest / max) * 100;

    const row = el("div", { class: "bar-row" + (isFocus ? " is-focus" : "") });
    row.appendChild(el("div", { class: "bar-label", text: a.authority, title: a.authority }));
    const track = el("div", { class: "bar-track" });
    const fill = el("div", {
      class: "bar-fill",
      style: `width:${pctWidth}%; background:${STATUS[cls]}`,
      tabindex: "0",
      role: "img",
      "aria-label": `${a.authority}: ${fmtPct(a.reserves_pct_latest)} of net spend, ${classifyBand(a.risk_band).label} risk`,
      title: `${a.authority}: ${fmtPct(a.reserves_pct_latest)} (${classifyBand(a.risk_band).label})`,
    });
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(el("div", { class: "bar-value", text: fmtPct(a.reserves_pct_latest) }));
    chart.appendChild(row);
  }
}

function renderLineChart(authorities) {
  const byName = Object.fromEntries(authorities.map(a => [a.authority, a]));
  const manchester = byName["Manchester"];
  const trafford = byName["Trafford"];
  if (!manchester || !trafford) return;

  const years = manchester.series.map(p => p.year);
  const seriesDefs = [
    { name: "Manchester", color: "var(--series-1)", data: manchester.series.map(p => p.unallocated_reserves_pct_of_net_expenditure) },
    { name: "Trafford", color: "var(--series-2)", data: trafford.series.map(p => p.unallocated_reserves_pct_of_net_expenditure) },
  ];

  const W = 880, H = 260, M = { top: 16, right: 84, bottom: 30, left: 36 };
  const plotW = W - M.left - M.right, plotH = H - M.top - M.bottom;
  const allVals = seriesDefs.flatMap(s => s.data);
  const yMax = Math.ceil(Math.max(...allVals) * 1.15);
  const x = i => M.left + (i / (years.length - 1)) * plotW;
  const y = v => M.top + plotH - (v / yMax) * plotH;

  const wrap = document.getElementById("line-chart");
  wrap.innerHTML = "";
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Manchester vs Trafford unallocated reserves, 2017-18 to 2024-25" });

  // gridlines (0%, and evenly spaced steps)
  const steps = 4;
  for (let s = 0; s <= steps; s++) {
    const v = (yMax / steps) * s;
    const gy = y(v);
    svg.appendChild(svgEl("line", { x1: M.left, x2: W - M.right, y1: gy, y2: gy, stroke: "var(--gridline)", "stroke-width": 1 }));
    const label = svgEl("text", { x: M.left - 8, y: gy + 4, "text-anchor": "end", fill: "var(--text-muted)", "font-size": 11 });
    label.textContent = `${v.toFixed(0)}%`;
    svg.appendChild(label);
  }

  // x-axis year labels (every other year to avoid crowding)
  years.forEach((yr, i) => {
    if (i % 2 !== 0 && i !== years.length - 1) return;
    const label = svgEl("text", { x: x(i), y: H - 8, "text-anchor": "middle", fill: "var(--text-muted)", "font-size": 11 });
    label.textContent = yr;
    svg.appendChild(label);
  });

  // lines
  for (const s of seriesDefs) {
    const points = s.data.map((v, i) => `${x(i)},${y(v)}`).join(" ");
    svg.appendChild(svgEl("polyline", { points, fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    s.data.forEach((v, i) => {
      svg.appendChild(svgEl("circle", { cx: x(i), cy: y(v), r: 4, fill: s.color, stroke: "var(--surface-1)", "stroke-width": 2 }));
    });
    // direct end-label
    const endLabel = svgEl("text", {
      x: x(s.data.length - 1) + 10, y: y(s.data[s.data.length - 1]) + 4,
      fill: s.color, "font-size": 12.5, "font-weight": 600,
    });
    endLabel.textContent = s.name;
    svg.appendChild(endLabel);
  }

  // Trafford's EFS awards (2025-26 AND 2026-27 — two consecutive years)
  // landed just after the last data point shown here (2024-25 outturn)
  // — mark it with a short dashed tick, since those award years aren't
  // in this reserves dataset yet.
  {
    const traffordLast = seriesDefs[1].data[seriesDefs[1].data.length - 1];
    const ex = x(seriesDefs[1].data.length - 1);
    const topY = y(traffordLast) - 34;
    svg.appendChild(svgEl("line", {
      x1: ex, x2: ex, y1: y(traffordLast) - 8, y2: topY,
      stroke: "var(--series-2)", "stroke-width": 1.5, "stroke-dasharray": "3,3",
    }));
    const efsLabel = svgEl("text", {
      x: ex, y: topY - 6, "text-anchor": "middle", fill: "var(--text-secondary)", "font-size": 11,
    });
    efsLabel.textContent = "EFS ×2 →";
    svg.appendChild(efsLabel);
  }

  // crosshair (hidden until hover)
  const crosshair = svgEl("line", { x1: 0, x2: 0, y1: M.top, y2: M.top + plotH, stroke: "var(--baseline)", "stroke-width": 1, opacity: 0 });
  svg.appendChild(crosshair);

  wrap.appendChild(svg);
  const tooltip = el("div", { class: "line-tooltip" });
  wrap.appendChild(tooltip);

  // hit layer: invisible full-height rects per year for crosshair snapping
  years.forEach((yr, i) => {
    const bandW = plotW / years.length;
    const hit = svgEl("rect", {
      x: M.left + i * bandW, y: M.top, width: bandW, height: plotH,
      fill: "transparent",
    });
    hit.addEventListener("pointerenter", () => showTooltip(i));
    hit.addEventListener("pointermove", () => showTooltip(i));
    hit.addEventListener("focus", () => showTooltip(i));
    hit.setAttribute("tabindex", "0");
    hit.setAttribute("role", "img");
    hit.setAttribute("aria-label", `${yr}: Manchester ${fmtPct(seriesDefs[0].data[i])}, Trafford ${fmtPct(seriesDefs[1].data[i])}`);
    svg.appendChild(hit);
  });
  svg.addEventListener("pointerleave", hideTooltip);

  function showTooltip(i) {
    crosshair.setAttribute("x1", x(i));
    crosshair.setAttribute("x2", x(i));
    crosshair.setAttribute("opacity", 1);

    tooltip.innerHTML = "";
    tooltip.appendChild(el("div", { class: "t-year", text: years[i] }));
    for (const s of seriesDefs) {
      const row = el("div", { class: "t-row" });
      row.appendChild(el("span", { class: "t-key", style: `background:${s.color}` }));
      row.appendChild(el("span", { class: "t-val", text: fmtPct(s.data[i]) }));
      row.appendChild(el("span", { class: "t-name", text: s.name }));
      tooltip.appendChild(row);
    }
    const leftPct = (x(i) / W) * 100;
    tooltip.style.left = `${leftPct}%`;
    tooltip.style.top = `8px`;
    tooltip.style.transform = leftPct > 65 ? "translateX(-105%)" : "translateX(12px)";
    tooltip.style.opacity = 1;
  }
  function hideTooltip() {
    crosshair.setAttribute("opacity", 0);
    tooltip.style.opacity = 0;
  }
}

function renderSparkline(series) {
  const vals = series.map(p => p.unallocated_reserves_pct_of_net_expenditure);
  const w = 76, h = 24, pad = 3;
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const x = i => pad + (i / (vals.length - 1)) * (w - pad * 2);
  const y = v => h - pad - ((v - min) / range) * (h - pad * 2);

  const svg = svgEl("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}`, "aria-hidden": "true" });
  const points = vals.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  svg.appendChild(svgEl("polyline", { points, fill: "none", stroke: "var(--text-muted)", "stroke-width": 1.5, "stroke-linejoin": "round", "stroke-linecap": "round" }));
  svg.appendChild(svgEl("circle", { cx: x(vals.length - 1), cy: y(vals[vals.length - 1]), r: 2.5, fill: "var(--series-1)" }));
  return svg;
}

let currentSort = { key: "reserves_pct_8yr_mean", dir: "asc" };

function renderTable(authorities) {
  const rows = authorities.map(a => ({ ...a, risk_rank: classifyBand(a.risk_band).rank }));

  function sortAndRender() {
    const { key, dir } = currentSort;
    const sorted = [...rows].sort((a, b) => {
      let av = a[key], bv = b[key];
      if (typeof av === "string") { av = av.toLowerCase(); bv = bv.toLowerCase(); }
      if (av < bv) return dir === "asc" ? -1 : 1;
      if (av > bv) return dir === "asc" ? 1 : -1;
      return 0;
    });

    const tbody = document.getElementById("table-body");
    tbody.innerHTML = "";
    for (const a of sorted) {
      const band = classifyBand(a.risk_band);
      const flags = [];
      for (const award of a.exceptional_financial_support) {
        flags.push(`EFS ${award.year} (£${award.amount_gbp_m}m)`);
      }
      if (a.section_114_notices.length) flags.push(`S114 ×${a.section_114_notices.length}`);

      const tr = el("tr");
      tr.appendChild(el("td", { text: a.authority }));
      tr.appendChild(el("td", { text: a.region }));
      tr.appendChild(el("td", { class: "num", text: fmtPct(a.reserves_pct_8yr_mean) }));
      tr.appendChild(el("td", { class: "num", text: fmtPct(a.reserves_pct_latest) }));
      const sparkTd = el("td");
      sparkTd.appendChild(renderSparkline(a.series));
      tr.appendChild(sparkTd);
      const badgeTd = el("td");
      badgeTd.appendChild(el("span", { class: `badge b-${band.cls}` }, [
        el("span", { class: `dot b-${band.cls}` }),
        document.createTextNode(band.label),
      ]));
      tr.appendChild(badgeTd);
      tr.appendChild(el("td", { class: "flag-note", text: flags.join(" · ") || "—" }));
      tbody.appendChild(tr);
    }
  }

  document.querySelectorAll("#risk-table th[data-key]").forEach(th => {
    th.addEventListener("click", () => {
      const key = th.dataset.key;
      if (currentSort.key === key) currentSort.dir = currentSort.dir === "asc" ? "desc" : "asc";
      else currentSort = { key, dir: "asc" };
      document.querySelectorAll("#risk-table th").forEach(h => h.classList.remove("sorted"));
      th.classList.add("sorted");
      th.querySelector(".arrow").textContent = currentSort.dir === "asc" ? "↑" : "↓";
      sortAndRender();
    });
  });

  sortAndRender();
}

function wireThemeToggle() {
  const btn = document.getElementById("theme-toggle");
  const stored = localStorage.getItem("theme");
  if (stored) document.documentElement.setAttribute("data-theme", stored);
  btn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme")
      || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  });
}

main().catch(err => {
  document.getElementById("meta-line").textContent = "Failed to load data — see console.";
  console.error(err);
});
