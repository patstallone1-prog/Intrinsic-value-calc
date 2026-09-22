// Standalone screener site: loads the recorded valuation of every screened public company and
// gives the reader filters, sorting, a per-company detail drawer, fill-in of unfilled inputs
// (recomputed in the browser with the inlined engine), and CSV export. The engine source is
// inlined ahead of this file by scripts/build-screener.mjs.

const FIELD_LABELS = {
  revenue: ["Revenue", "money"], revenueGrowth: ["Revenue growth", "percent"], grossMargin: ["Gross margin", "percent"],
  marginChangeYoy: ["Margin change YoY", "percent"], opexRatio: ["Opex ratio", "percent"], rdPct: ["R&D % of revenue", "percent"],
  cash: ["Cash", "money"], debt: ["Debt", "money"], capexPct: ["Capex % of revenue", "percent"], inventory: ["Inventory", "money"],
  ar: ["Accounts receivable", "money"], ap: ["Accounts payable", "money"], tangibleBookValue: ["Tangible book value", "money"],
  assetBackingValue: ["Asset backing / equity", "money"], roe: ["ROE", "percent"], rotce: ["ROTCE", "percent"],
  buybackYield: ["Buyback yield", "percent"], dividendYield: ["Dividend yield", "percent"], eps: ["EPS", "number"],
  sharePrice: ["Share price", "number"], sharesOutstanding: ["Shares outstanding", "number"], marketCapOverride: ["Market cap override", "money"],
  asset1Value: ["Asset 1 value", "money"], asset2Value: ["Asset 2 value", "money"],
}
const OVERRIDES_KEY = "intrinsic-value-screener-overrides"
const PAGE_SIZE = 100
const SORTS = {
  upside: ["impliedVsMarketPct", "desc", "Highest implied upside"],
  downside: ["impliedVsMarketPct", "asc", "Most overvalued"],
  cap: ["observedMarketCap", "desc", "Largest market cap"],
  capAsc: ["observedMarketCap", "asc", "Smallest market cap"],
  confidence: ["confidence", "desc", "Highest confidence"],
  coverage: ["coveragePct", "desc", "Most complete data"],
  name: ["companyName", "asc", "Company A-Z"],
}
const CAP_PRESETS = [["Mega", 200000, ""], ["Large", 10000, 200000], ["Mid", 2000, 10000], ["Small", 300, 2000], ["Micro", 0, 300]]

const state = {
  rows: [], raw: [], overrides: {}, sortKey: "upside", sortField: "impliedVsMarketPct", sortDir: "desc", page: 1, selected: null,
  filters: { q: "", sector: "", minCapM: 100, maxCapM: "", minUpside: "", maxUpside: "", minCoverage: 60, minConfidence: "", basis: "", onlyComplete: false, hideSuspect: true, inRange: "" },
}

const $ = (sel) => document.querySelector(sel)
const esc = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
const money = (v) => {
  if (!Number.isFinite(v)) return "n/a"
  const a = Math.abs(v)
  const s = a >= 1e12 ? (v / 1e12).toFixed(2) + "T" : a >= 1e9 ? (v / 1e9).toFixed(1) + "B" : a >= 1e6 ? (v / 1e6).toFixed(1) + "M" : a >= 1e3 ? (v / 1e3).toFixed(1) + "K" : v.toFixed(2)
  return "$" + s
}
const pct = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) + "%" : "n/a")
const signed = (text, v) => (v < 0 ? `<span class="neg">${text}</span>` : v > 0 ? `<span class="pos">${text}</span>` : text)
const basisLabel = (b) => (b === "ttm" ? "TTM" : b === "quarterly-annualized" ? "Q x4" : "Annual")

function loadOverrides() {
  try { return JSON.parse(localStorage.getItem(OVERRIDES_KEY) || "{}") || {} } catch { return {} }
}
function saveOverrides() {
  try { localStorage.setItem(OVERRIDES_KEY, JSON.stringify(state.overrides)) } catch { /* per-browser convenience only */ }
}

function decorate(row) {
  const manual = state.overrides[row.ticker] || {}
  const merged = { ...(row.inputs || {}) }
  const filled = []
  for (const [k, v] of Object.entries(manual)) { if (k !== "submittedAt" && FIELD_LABELS[k]) { merged[k] = v; filled.push(k) } }
  const missing = (row.missing || []).filter((k) => !filled.includes(k))
  const estimatedKeys = Object.keys(row.estimated || {}).filter((k) => !filled.includes(k))
  const out = { ...row, missing, unfilledCount: missing.length, estimatedCount: estimatedKeys.length, manualFilled: filled }
  if (filled.length && typeof computeValuation === "function") {
    try {
      const result = computeValuation(normalizeInputs({ ...AUTOMATED_BASE_INPUTS, companyName: row.companyName, sector: row.sector, businessModel: row.businessModel, ...merged }))
      const fair = result.outputs.fairCommonEquity
      const observed = row.observedMarketCap || 0
      out.fairCommonEquity = fair
      out.fairValueLow = result.bands.final.low
      out.fairValueHigh = result.bands.final.high
      out.impliedVsMarketPct = observed > 0 ? ((fair - observed) / observed) * 100 : row.impliedVsMarketPct
      out.confidence = result.bands.quality
      const total = Math.max(row.applicableCount || 0, (row.missing || []).length, 1)
      out.coveragePct = ((total - missing.length) / total) * 100
    } catch { /* keep the recorded valuation */ }
  }
  const observed = out.observedMarketCap || 0, fair = out.fairCommonEquity || 0
  const ratio = observed > 0 && fair > 0 ? fair / observed : 1
  out.suspect = observed <= 0 || ratio > 5 || ratio < 0.2
  out.inRange = out.fairValueLow <= observed && observed <= out.fairValueHigh
  return out
}

function filtered() {
  const f = state.filters
  const q = f.q.trim().toLowerCase()
  const minCap = f.minCapM === "" ? 0 : Number(f.minCapM) * 1e6
  const maxCap = f.maxCapM === "" ? Infinity : Number(f.maxCapM) * 1e6
  const num = (v, d) => (v === "" || v === null || v === undefined ? d : Number(v))
  const minUp = num(f.minUpside, -Infinity), maxUp = num(f.maxUpside, Infinity)
  const minCov = num(f.minCoverage, 0), minConf = num(f.minConfidence, 0) / 100
  return state.rows.filter((r) => {
    if (q && !(r.ticker.toLowerCase().includes(q) || (r.companyName || "").toLowerCase().includes(q) || (r.sector || "").toLowerCase().includes(q))) return false
    if (f.sector && r.sector !== f.sector) return false
    if (f.basis && r.periodBasis !== f.basis) return false
    const cap = r.observedMarketCap || 0
    if (cap < minCap || cap > maxCap) return false
    if ((r.coveragePct || 0) < minCov) return false
    if ((r.confidence || 0) < minConf) return false
    if (f.onlyComplete && r.unfilledCount > 0) return false
    if (f.hideSuspect && r.suspect) return false
    if (f.inRange === "in" && !r.inRange) return false
    if (f.inRange === "out" && r.inRange) return false
    const up = r.impliedVsMarketPct
    if (minUp !== -Infinity && !(up >= minUp)) return false
    if (maxUp !== Infinity && !(up <= maxUp)) return false
    return true
  })
}

function sorted(rows) {
  const { sortField: field, sortDir: dir } = state
  return [...rows].sort((a, b) => {
    const av = a[field], bv = b[field]
    if (av === null || av === undefined || Number.isNaN(av)) return 1
    if (bv === null || bv === undefined || Number.isNaN(bv)) return -1
    if (typeof av === "string") return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av)
    return dir === "asc" ? av - bv : bv - av
  })
}

const median = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN }

function render() {
  const rows = sorted(filtered())
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  state.page = Math.min(state.page, pages)
  const slice = rows.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE)
  const f = state.filters

  $("#stats").innerHTML = [
    [state.rows.length.toLocaleString(), "companies screened"],
    [rows.length.toLocaleString(), "match your filters"],
    [pct(median(rows.map((r) => r.impliedVsMarketPct)), 1), "median implied upside (filtered)"],
    [rows.filter((r) => r.inRange).length.toLocaleString(), "trading inside their fair-value range"],
    [state.rows.filter((r) => r.unfilledCount === 0).length.toLocaleString(), "with every input filled"],
  ].map(([n, l]) => `<div class="stat"><span class="n">${n}</span><span class="l">${l}</span></div>`).join("")

  const sectors = [...new Set(state.rows.map((r) => r.sector).filter(Boolean))].sort()
  $("#rail").innerHTML = `
    <h2>Filters</h2>
    <label class="field"><span>Search</span><input type="search" data-f="q" value="${esc(f.q)}" placeholder="Ticker, company, industry" /></label>
    <label class="field"><span>Sort</span><select data-sort>${Object.entries(SORTS).map(([k, [, , label]]) => `<option value="${k}" ${state.sortKey === k ? "selected" : ""}>${label}</option>`).join("")}</select></label>
    <label class="field"><span>Industry</span><select data-f="sector"><option value="">All industries</option>${sectors.map((s) => `<option value="${esc(s)}" ${f.sector === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></label>
    <div class="field"><span>Market cap ($ millions)</span>
      <div class="pair"><input type="number" min="0" step="50" data-f="minCapM" value="${esc(f.minCapM)}" placeholder="min" /><input type="number" min="0" step="50" data-f="maxCapM" value="${esc(f.maxCapM)}" placeholder="max" /></div>
      <div class="chips" style="margin-top:6px">${CAP_PRESETS.map(([l, a, b]) => `<button class="chip ${String(f.minCapM) === String(a) && String(f.maxCapM) === String(b) ? "active" : ""}" data-cap="${a}|${b}">${l}</button>`).join("")}</div>
    </div>
    <div class="field"><span>Implied upside (%)</span><div class="pair"><input type="number" step="5" data-f="minUpside" value="${esc(f.minUpside)}" placeholder="min" /><input type="number" step="5" data-f="maxUpside" value="${esc(f.maxUpside)}" placeholder="max" /></div></div>
    <div class="field"><span>Quality floors</span><div class="pair"><input type="number" min="0" max="100" step="10" data-f="minCoverage" value="${esc(f.minCoverage)}" placeholder="coverage %" title="Minimum data coverage %" /><input type="number" min="0" max="100" step="5" data-f="minConfidence" value="${esc(f.minConfidence)}" placeholder="confidence %" title="Minimum model confidence %" /></div></div>
    <label class="field"><span>Market vs fair range</span><select data-f="inRange"><option value="">Any</option><option value="in" ${f.inRange === "in" ? "selected" : ""}>Trading inside fair range</option><option value="out" ${f.inRange === "out" ? "selected" : ""}>Outside fair range</option></select></label>
    <label class="field"><span>Period basis</span><select data-f="basis"><option value="">Any</option><option value="annual" ${f.basis === "annual" ? "selected" : ""}>Annual filing</option><option value="ttm" ${f.basis === "ttm" ? "selected" : ""}>Trailing twelve months</option></select></label>
    <label class="check"><input type="checkbox" data-f="onlyComplete" ${f.onlyComplete ? "checked" : ""} /> Only fully filled companies</label>
    <label class="check"><input type="checkbox" data-f="hideSuspect" ${f.hideSuspect ? "checked" : ""} /> Hide likely data errors (&gt;5x off market)</label>
    <div class="chips"><button class="ghost" data-reset>Reset</button><button class="ghost" data-export>Export CSV (${rows.length.toLocaleString()})</button></div>
  `

  const cols = [
    ["ticker", "Ticker"], ["companyName", "Company"], ["sector", "Industry"], ["currentPrice", "Price", "num"], ["observedMarketCap", "Market cap", "num"],
    ["fairCommonEquity", "Fair value", "num"], ["impliedVsMarketPct", "Implied upside", "num"], ["confidence", "Confidence", "num"], ["coveragePct", "Coverage", "num"],
    ["unfilledCount", "Unfilled", "num"], ["periodBasis", "Basis"],
  ]
  $("#results").innerHTML = `
    <div class="results-head"><span class="count">${rows.length.toLocaleString()} companies - sorted by ${esc(SORTS[state.sortKey]?.[2] || state.sortField)} - page ${state.page} of ${pages}</span><span class="note">Click a row for the full breakdown and to fill in missing inputs.</span></div>
    <div class="table-scroll"><table><thead><tr>${cols.map(([k, l, c]) => `<th class="${c || ""} ${state.sortField === k ? "active" : ""}" data-col="${k}">${l}${state.sortField === k ? (state.sortDir === "asc" ? " ^" : " v") : ""}</th>`).join("")}</tr></thead>
    <tbody>${slice.length ? slice.map((r) => `
      <tr data-ticker="${esc(r.ticker)}">
        <td class="tk">${esc(r.ticker)}${r.suspect ? ' <span class="tag warn" title="Fair value more than 5x off market - probably a share-count, ADR-ratio or currency mismatch">check</span>' : ""}</td>
        <td class="name" title="${esc(r.companyName)}">${esc(r.companyName)}</td>
        <td>${esc(r.sector)}</td>
        <td class="num">${money(r.currentPrice)}</td>
        <td class="num">${money(r.observedMarketCap)}</td>
        <td class="num">${money(r.fairCommonEquity)}</td>
        <td class="num">${signed(pct(r.impliedVsMarketPct), r.impliedVsMarketPct)}</td>
        <td class="num">${pct((r.confidence || 0) * 100, 0)}</td>
        <td class="num">${pct(r.coveragePct, 0)}</td>
        <td class="num">${r.unfilledCount ? `<span class="tag warn">${r.unfilledCount}</span>` : r.manualFilled?.length ? '<span class="tag ok">filled</span>' : "0"}</td>
        <td><span class="tag">${basisLabel(r.periodBasis)}</span></td>
      </tr>`).join("") : `<tr><td colspan="11" class="empty">No companies match these filters.</td></tr>`}</tbody></table></div>
    <div class="pager"><button class="ghost" data-page="-1" ${state.page <= 1 ? "disabled" : ""}>Previous</button><span>Page ${state.page} / ${pages}</span><button class="ghost" data-page="1" ${state.page >= pages ? "disabled" : ""}>Next</button></div>
  `
}

function openDrawer(ticker) {
  const r = state.rows.find((x) => x.ticker === ticker)
  if (!r) return
  state.selected = ticker
  const inputs = { ...(r.inputs || {}), ...Object.fromEntries(Object.entries(state.overrides[ticker] || {}).filter(([k]) => FIELD_LABELS[k])) }
  const fmt = (k, v) => { const t = FIELD_LABELS[k]?.[1]; return t === "money" ? money(v) : t === "percent" ? pct(v * 100, 1) : typeof v === "number" ? v.toLocaleString(undefined, { maximumFractionDigits: 4 }) : esc(v) }
  $("#drawer").innerHTML = `
    <button class="ghost close" data-close>Close</button>
    <p class="eyebrow">${esc(r.sector)} / ${esc(r.businessModel)}</p>
    <h2>${esc(r.companyName)} <span class="tk">${esc(r.ticker)}</span></h2>
    <p class="note">${basisLabel(r.periodBasis) === "Annual" ? "Annual filing" : basisLabel(r.periodBasis) === "TTM" ? "Trailing twelve months (10-K + later 10-Qs)" : basisLabel(r.periodBasis)} - sources: ${esc((r.providers || []).join(", "))} - recorded ${r.processedAt ? new Date(r.processedAt).toLocaleDateString() : ""}${r.manualFilled?.length ? " - includes your fill-ins" : ""}</p>
    <h3>Valuation</h3>
    <dl class="kv">
      <dt>Estimated fair value</dt><dd>${money(r.fairCommonEquity)}</dd>
      <dt>Fair-value range</dt><dd>${money(r.fairValueLow)} - ${money(r.fairValueHigh)}</dd>
      <dt>Current market value</dt><dd>${money(r.observedMarketCap)}</dd>
      <dt>Implied upside</dt><dd>${signed(pct(r.impliedVsMarketPct), r.impliedVsMarketPct)}</dd>
      <dt>Market inside fair range</dt><dd>${r.inRange ? "Yes" : "No"}</dd>
      <dt>Model confidence</dt><dd>${pct((r.confidence || 0) * 100, 0)}</dd>
      <dt>Data coverage</dt><dd>${pct(r.coveragePct, 0)}</dd>
      <dt>Share price</dt><dd>${money(r.currentPrice)}</dd>
      <dt>Shares outstanding</dt><dd>${Number(r.sharesOutstanding || 0).toLocaleString()}</dd>
    </dl>
    ${r.suspect ? `<p class="note" style="color:var(--warn)">Flagged: fair value is more than 5x away from market value. This usually means a share-count, ADR-ratio or currency mismatch in the inputs rather than a real mispricing - check the figures below before relying on it.</p>` : ""}
    <h3>Inputs used</h3>
    <dl class="kv">${Object.entries(inputs).filter(([k]) => FIELD_LABELS[k]).map(([k, v]) => `<dt>${FIELD_LABELS[k][0]}${(state.overrides[ticker] || {})[k] !== undefined ? ' <span class="tag ok">yours</span>' : r.estimated?.[k] ? ` <span class="tag warn" title="No source reported this; industry median of ${(r.estimated[k].ratio * 100).toFixed(1)}% of market value across ${r.estimated[k].peers} ${r.estimated[k].basis} peers, scaled to this company">est.</span>` : ""}</dt><dd class="${typeof v === "number" && v < 0 ? "neg" : ""}">${fmt(k, v)}</dd>`).join("")}</dl>
    ${r.estimatedCount ? `<p class="note">${r.estimatedCount} balance-sheet input${r.estimatedCount === 1 ? " is" : "s are"} industry-peer estimates (marked est.) because no source reported them. Override below if you know the figure.</p>` : ""}
    ${(() => {
      const est = Object.keys(r.estimated || {}).filter((k) => (state.overrides[ticker] || {})[k] === undefined)
      const fillable = [...r.missing, ...est]
      const heading = r.unfilledCount ? `${r.unfilledCount} input${r.unfilledCount === 1 ? "" : "s"} no source could fill` : est.length ? "Override the estimates if you know the figures" : "Every applicable input is filled"
      const form = fillable.length ? `
        <p class="note">Enter what you know (money in USD, percentages as e.g. 12.5) and save - the valuation is recomputed here in the browser and your entries stay in this browser.</p>
        <div class="fill">${fillable.map((k) => `<label class="field"><span>${FIELD_LABELS[k]?.[0] || k}${FIELD_LABELS[k]?.[1] === "percent" ? " %" : FIELD_LABELS[k]?.[1] === "money" ? " $" : ""}${r.estimated?.[k] ? " (est.)" : ""}</span><input type="number" step="any" data-fill="${k}" placeholder="${r.estimated?.[k] ? esc(fmt(k, r.estimated[k].value)) : ""}" /></label>`).join("")}</div>
        <div class="chips" style="margin-top:10px"><button class="primary" data-save="${esc(ticker)}">Save and recompute</button>${r.manualFilled?.length ? `<button class="ghost" data-clear="${esc(ticker)}">Clear my fill-ins</button>` : ""}</div>
        <div class="status" id="fill-status"></div>` : r.manualFilled?.length ? `<div class="chips"><button class="ghost" data-clear="${esc(ticker)}">Clear my fill-ins</button></div>` : ""
      return `<h3>${heading}</h3>${form}`
    })()}
  `
  $("#drawer").classList.add("open")
}

function saveFill(ticker) {
  const entries = {}
  document.querySelectorAll("#drawer [data-fill]").forEach((input) => {
    if (input.value === "") return
    const k = input.dataset.fill
    const n = Number(input.value)
    if (!Number.isFinite(n)) return
    entries[k] = FIELD_LABELS[k]?.[1] === "percent" ? n / 100 : n
  })
  if (!Object.keys(entries).length) { $("#fill-status").textContent = "Type a value in at least one box first."; return }
  state.overrides[ticker] = { ...(state.overrides[ticker] || {}), ...entries, submittedAt: new Date().toISOString() }
  saveOverrides()
  state.rows = state.raw.map(decorate)
  render()
  openDrawer(ticker)
}

function exportCsv(rows) {
  const cols = ["ticker", "companyName", "sector", "businessModel", "currentPrice", "observedMarketCap", "fairCommonEquity", "fairValueLow", "fairValueHigh", "impliedVsMarketPct", "confidence", "coveragePct", "unfilledCount", "periodBasis", "processedAt"]
  const line = (vals) => vals.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",")
  const csv = [line(cols), ...rows.map((r) => line(cols.map((c) => r[c])))].join("\n")
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
  const a = document.createElement("a")
  a.href = url
  a.download = `intrinsic-value-screener-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

document.addEventListener("input", (e) => {
  const t = e.target
  if (t.dataset.f === "q") { state.filters.q = t.value; state.page = 1; render(); const el = $('[data-f="q"]'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length) } }
})
document.addEventListener("change", (e) => {
  const t = e.target
  if (t.dataset.sort !== undefined) { const [field, dir] = SORTS[t.value]; state.sortKey = t.value; state.sortField = field; state.sortDir = dir; state.page = 1; render(); return }
  if (t.dataset.f && t.dataset.f !== "q") { state.filters[t.dataset.f] = t.type === "checkbox" ? t.checked : t.value; state.page = 1; render() }
})
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-cap], [data-reset], [data-export], [data-col], [data-page], [data-ticker], [data-close], [data-save], [data-clear]")
  if (!t) return
  if (t.dataset.cap !== undefined) { const [a, b] = t.dataset.cap.split("|"); state.filters.minCapM = a === "" ? "" : Number(a); state.filters.maxCapM = b === "" ? "" : Number(b); state.page = 1; render(); return }
  if (t.dataset.reset !== undefined) { state.filters = { q: "", sector: "", minCapM: "", maxCapM: "", minUpside: "", maxUpside: "", minCoverage: 0, minConfidence: "", basis: "", onlyComplete: false, hideSuspect: true, inRange: "" }; state.page = 1; render(); return }
  if (t.dataset.export !== undefined) { exportCsv(sorted(filtered())); return }
  if (t.dataset.col) { const col = t.dataset.col; if (state.sortField === col) state.sortDir = state.sortDir === "asc" ? "desc" : "asc"; else { state.sortField = col; state.sortDir = ["ticker", "companyName", "sector", "periodBasis"].includes(col) ? "asc" : "desc" } state.sortKey = Object.entries(SORTS).find(([, [f, d]]) => f === state.sortField && d === state.sortDir)?.[0] || ""; render(); return }
  if (t.dataset.page) { state.page += Number(t.dataset.page); render(); window.scrollTo({ top: 0 }); return }
  if (t.dataset.ticker) { openDrawer(t.dataset.ticker); return }
  if (t.dataset.close !== undefined) { $("#drawer").classList.remove("open"); return }
  if (t.dataset.save) { saveFill(t.dataset.save); return }
  if (t.dataset.clear) { delete state.overrides[t.dataset.clear]; saveOverrides(); state.rows = state.raw.map(decorate); render(); openDrawer(t.dataset.clear) }
})
document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("#drawer").classList.remove("open") })

async function boot() {
  $("#results").innerHTML = '<div class="empty">Loading every screened company...</div>'
  let rows = []
  for (const url of ["../screener-results.json", "screener-results.json", "/api/screener"]) {
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const payload = await res.json()
      rows = Array.isArray(payload) ? payload : payload.results || []
      if (rows.length) break
    } catch { /* try the next location */ }
  }
  state.overrides = loadOverrides()
  state.raw = rows
  state.rows = rows.map(decorate)
  const latest = rows.reduce((m, r) => (r.processedAt > m ? r.processedAt : m), "")
  $("#meta").textContent = rows.length ? `${rows.length.toLocaleString()} companies - last screened ${latest ? new Date(latest).toLocaleDateString() : "n/a"}` : "No screener data found."
  render()
}
boot()
