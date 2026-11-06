// 世界観測所：world/ 以下のデータを読み込んで表示する
const PHASES = ["法則の創造", "大地の創造", "生命の創造", "種族と文明の誕生", "歴史の時代"];
const PHASE_MIN = [6, 8, 8, 8, null];
const D = { index: null, data: {}, timeline: [], creations: [], events: [], canon: {} };
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const md = (s) => {
  s = String(s || "");
  if (window.marked && window.DOMPurify) return DOMPurify.sanitize(marked.parse(s));
  // 外部ライブラリが読めないときの簡易表示
  return esc(s).replace(/^### (.*)$/gm, "<h3>$1</h3>").replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/^- (.*)$/gm, "• $1").replace(/\n/g, "<br>");
};

let bust = Date.now();
async function get(path, type = "json") {
  try {
    const r = await fetch(`world/${path}?t=${bust}`);
    if (!r.ok) return null;
    return type === "json" ? r.json() : r.text();
  } catch { return null; }
}

async function load() {
  D.index = await get("index.json");
  if (!D.index) {
    $("#latest-creation").innerHTML = `<div class="empty">世界はまだ眠っています。<br>最初の創造を待っています。</div>`;
    renderPhases({ phase: 1, creation_count: 0 });
    return;
  }
  bust = D.index.updated_at || bust;
  const [regions, species, peoples, settlements, magic, timeline] = await Promise.all(
    ["regions", "species", "peoples", "settlements", "magic"].map((c) => get(`data/${c}.json`)).concat([get("timeline.json")])
  );
  D.data = { regions: regions || [], species: species || [], peoples: peoples || [], settlements: settlements || [], magic: magic || [] };
  D.timeline = timeline || [];
  const cr = await Promise.all((D.index.creations || []).map((k) => get(`creations/${k}.json`)));
  D.creations = cr.flat().filter(Boolean);
  const logs = (D.index.logs || []).slice(-2);
  D.events = (await Promise.all(logs.map((k) => get(`log/${k}.json`)))).flat().filter(Boolean);
  renderAll();
}

function renderAll() {
  const ix = D.index;
  $("#world-name").textContent = ix.world_name || "名もなき世界";
  $("#world-date").textContent = `${ix.date} ・ 第${ix.phase}期「${ix.phase_name}」`;
  document.title = `${ix.world_name || "名もなき世界"} — 世界観測所`;
  renderPhases(ix);
  renderHome();
  renderMap();
  renderReports();
  renderGenesis();
  renderCodex("species");
  renderTimeline();
  renderCanonTabs();
}

function renderPhases(ix) {
  const cur = ix.phase || 1;
  const cnt = D.creations.filter((c) => c.phase === cur && c.kind !== "epoch").length;
  $("#phases").innerHTML = PHASES.map((n, i) => {
    const p = i + 1;
    const cls = p < cur ? "done" : p === cur ? "now" : "";
    const pct = p === cur && PHASE_MIN[i] ? Math.min(100, (cnt / PHASE_MIN[i]) * 100) : 0;
    return `<div class="phase ${cls}">${pct ? `<div class="bar" style="width:${pct}%"></div>` : ""}<b>第${p}期</b>${n}</div>`;
  }).join("");
}

function eventList(list) {
  if (!list.length) return `<p class="muted">まだ記録はありません。</p>`;
  return `<ul class="events">${list.map((e) => `<li class="imp-${e.importance}"><span class="d">${esc(e.date)}</span><span class="t">${esc(e.title)}</span> ${esc(e.text)}</li>`).join("")}</ul>`;
}

function nextCreationNote() {
  const n = D.index.next_creation_in;
  if (!n) return "";
  return `<p class="next-note">創造は世界の${D.index.creation_every}日（現実の${D.index.creation_every}時間）ごとに行われます。次の創造まで あと${n}日（約${n}時間）。</p>`;
}

function renderHome() {
  const last = D.creations[D.creations.length - 1];
  $("#latest-creation").innerHTML = last
    ? `<p class="stamp">${esc(last.date)}に行われた創造 ・ ${esc(last.phase_name)}${last.kind === "oracle" ? " ・ 神託による創造" : last.kind === "epoch" ? " ・ 時代の節目" : ""}</p><h2>最新の創造</h2><div class="narrative">${esc(last.narrative)}</div>${nextCreationNote()}`
    : `<div class="empty">最初の創造を待っています。</div>`;
  const reps = D.index.reports || [];
  if (reps.length) {
    get(`chronicle/${reps[reps.length - 1]}.md`, "text").then((t) => {
      const head = (t || "").split("\n").find((l) => l.startsWith("# ")) || "";
      $("#latest-report").innerHTML = `<h2>最新の月報</h2><p style="font-family:var(--serif);font-size:18px">${esc(head.slice(2))}</p><p><a href="#" style="color:var(--gold)" onclick="show('reports');return false">月報を読む →</a></p>`;
    });
  } else {
    $("#latest-report").innerHTML = `<h2>最新の月報</h2><p class="muted">最初の月報は、世界の1か月（29日＝現実の約29時間）が過ぎると届きます。</p>`;
  }
  $("#recent-events").innerHTML = `<h2>最近の出来事</h2>${eventList(D.events.slice(-8).reverse())}`;
  const u = D.index.usage || {};
  $("#meta").textContent = `創造 ${D.index.creation_count} 回 ・ 今月のAI利用額 $${(u.cost_usd || 0).toFixed(2)} ・ 最終更新 ${new Date(D.index.updated_at).toLocaleString("ja-JP")}`;
}

function renderMap() {
  const layer = document.querySelector("input[name=layer]:checked").value;
  WorldMap.draw($("#map"), D.data.regions, D.data.settlements, { layer, labels: $("#show-labels").checked });
}

$("#map").addEventListener("click", (ev) => {
  const rect = ev.target.getBoundingClientRect();
  const r = WorldMap.pick((ev.clientX - rect.left) / rect.width, (ev.clientY - rect.top) / rect.height);
  if (!r) return;
  const life = D.data.species.filter((s) => (s.habitat || []).includes(r.id));
  const towns = D.data.settlements.filter((s) => s.region === r.id);
  $("#region-info").innerHTML = `<h2>${esc(r.name)}</h2>
    <p class="muted">地形：${esc(terrainName(r.terrain))} ・ 標高 ${fmt(r.elevation)} ・ 魔力 ${fmt(r.magic)}${r.climate ? ` ・ ${esc(r.climate)}` : ""}</p>
    <p>${esc(r.description)}</p>
    ${life.length ? `<p><b>棲む生き物：</b>${life.map((s) => esc(s.name)).join("、")}</p>` : ""}
    ${towns.length ? `<p><b>集落：</b>${towns.map((s) => esc(s.name)).join("、")}</p>` : ""}`;
});
const TERRAIN_JA = { ocean: "大洋", sea: "海", lake: "湖", coast: "海岸", plains: "平原", grassland: "草原", forest: "森林",
  jungle: "密林", mountains: "山脈", hills: "丘陵", desert: "砂漠", tundra: "凍原", ice: "氷原", swamp: "湿地", volcano: "火山" };
const terrainName = (t) => TERRAIN_JA[t] || t || "—";
const fmt = (v) => (typeof v === "number" ? v.toFixed(2) : "—");
document.querySelectorAll("input[name=layer], #show-labels").forEach((el) => el.addEventListener("change", renderMap));

async function renderReports() {
  const reps = [...(D.index.reports || [])].reverse();
  const sel = $("#report-select");
  if (!reps.length) {
    sel.style.display = "none";
    $("#report-body").innerHTML = `<div class="empty" style="color:#6b5f48">まだ月報はありません。</div>`;
    return;
  }
  const mn = D.index.month_names || [];
  const label = (k) => {
    const [, y, m] = k.match(/Y0*(\d+)-M0*(\d+)/) || [];
    if (!y) return k;
    const name = Number(m) > 12 ? "無名日" : mn[m - 1] || `${m}月`;
    return `創世暦${y}年 ${name}`;
  };
  sel.innerHTML = reps.map((k) => `<option value="${k}">${label(k)}</option>`).join("");
  const showRep = async () => { $("#report-body").innerHTML = md(await get(`chronicle/${sel.value}.md`, "text")); };
  sel.onchange = showRep;
  showRep();
}

function renderGenesis() {
  const list = [...D.creations].reverse();
  $("#genesis-list").innerHTML = list.length
    ? list.map((c) => `<article class="card gen"><p class="stamp">${esc(c.date)} ・ ${esc(c.phase_name)}${c.kind === "oracle" ? " ・ 神託" : c.kind === "epoch" ? " ・ 時代の節目" : ""}</p><div class="narrative">${esc(c.narrative)}</div></article>`).join("")
    : `<div class="empty">まだ何も創られていません。</div>`;
}

const CODEX_FIELDS = {
  species: (x) => [x.kind, x.size].filter(Boolean),
  peoples: (x) => [x.population ? `人口 ${Number(x.population).toLocaleString()}` : "", x.language, x.belief].filter(Boolean),
  settlements: (x) => [x.size ? `規模 ${x.size}` : "", nameOf("peoples", x.people), nameOf("regions", x.region)].filter(Boolean),
  magic: (x) => [x.cost ? `代償：${x.cost}` : "", x.discovered_by].filter(Boolean),
  regions: (x) => [terrainName(x.terrain), x.climate].filter(Boolean),
};
const nameOf = (c, id) => (D.data[c] || []).find((x) => x.id === id)?.name || "";

function renderCodex(c) {
  document.querySelectorAll("#codex-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.c === c));
  const items = D.data[c] || [];
  $("#codex").innerHTML = items.length
    ? items.map((x) => {
        const tags = [...(x.traits || [])];
        return `<div class="entry"><div class="kind">${esc(CODEX_FIELDS[c](x).join(" ・ "))}</div><h3>${esc(x.name)}</h3><p>${esc(x.description)}</p>${tags.length ? `<div class="tags">${tags.map((t) => `<span>${esc(t)}</span>`).join("")}</div>` : ""}</div>`;
      }).join("")
    : `<div class="empty">まだ記録がありません。</div>`;
}
document.querySelectorAll("#codex-tabs button").forEach((b) => b.addEventListener("click", () => renderCodex(b.dataset.c)));

function renderTimeline() {
  const tl = [...D.timeline].reverse();
  $("#timeline").innerHTML = tl.length
    ? tl.map((t) => `<li class="imp-${t.importance} k-${t.kind}"><span class="d">${esc(t.date)}</span><span class="t">${esc(t.title)}</span><p>${esc(t.summary)}</p></li>`).join("")
    : `<div class="empty">年表はまだ白紙です。</div>`;
}

function renderCanonTabs() {
  const canon = D.index.canon || [];
  $("#canon-tabs").innerHTML = canon.map(([k, t], i) => `<button data-k="${k}" class="${i ? "" : "on"}">${esc(t)}</button>`).join("");
  document.querySelectorAll("#canon-tabs button").forEach((b) => b.addEventListener("click", () => showCanon(b.dataset.k)));
  if (canon.length) showCanon(canon[0][0]);
}
async function showCanon(k) {
  document.querySelectorAll("#canon-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.k === k));
  const t = await get(`canon/${k}.md`, "text");
  $("#canon-body").innerHTML = t && t.trim() ? md(t) : `<div class="empty">まだ定められていません。</div>`;
}

function show(view) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("on", v.id === `view-${view}`));
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.view === view));
  if (view === "map") renderMap();
  if (view === "search") {
    if (!$("#search-input").value) { try { $("#search-input").value = localStorage.getItem("lastSearch") || ""; } catch {} }
    buildSearch().then(runSearch);
    setTimeout(() => $("#search-input").focus(), 50);
  }
  history.replaceState(null, "", `#${view}`);
}
document.querySelectorAll("#tabs button").forEach((b) => b.addEventListener("click", () => show(b.dataset.view)));

// ---------- 検索 ----------
const SEARCH = { built: false, items: [], filter: "all" };
const SRC = { term: "用語辞典", canon: "聖典", genesis: "創世記", event: "出来事", timeline: "年表", codex: "図鑑", report: "月報" };
const kata2hira = (t) => t.replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const norm = (t) => kata2hira(String(t || "").toLowerCase());

async function buildSearch() {
  if (SEARCH.built) return;
  const items = [];
  // 聖典（用語辞典は1語ずつ）
  for (const [k, title] of D.index.canon || []) {
    const t = (await get(`canon/${k}.md`, "text")) || "";
    if (k === "glossary") {
      let cat = "";
      for (const line of t.split("\n")) {
        if (line.startsWith("## ")) { cat = line.slice(3).trim(); continue; }
        const m = line.match(/^-\s*\*\*(.+?)\*\*\s*[：:]\s*(.*)$/);
        if (m) {
          const yomi = (m[1].match(/[（(](.+?)[）)]/) || [])[1] || "";
          items.push({ src: "term", title: m[1], text: m[2], extra: yomi, sub: cat, go: () => { show("canon"); showCanon("glossary"); } });
        }
      }
      continue;
    }
    // 見出しごとに区切る
    let head = title, buf = [];
    const flush = () => { if (buf.join("").trim()) items.push({ src: "canon", title: head, text: buf.join("\n"), sub: title, go: () => { show("canon"); showCanon(k); } }); buf = []; };
    for (const line of t.split("\n")) {
      if (/^#{1,3} /.test(line)) { flush(); head = line.replace(/^#+\s*/, ""); } else buf.push(line.replace(/\*\*/g, ""));
    }
    flush();
  }
  for (const c of D.creations) items.push({ src: "genesis", title: `${c.date}の創造`, text: c.narrative, sub: c.phase_name, go: () => show("genesis") });
  const logs = (await Promise.all((D.index.logs || []).map((k) => get(`log/${k}.json`)))).flat().filter(Boolean);
  for (const e of logs) items.push({ src: "event", title: e.title, text: e.text, sub: e.date, go: () => show("home") });
  for (const t of D.timeline) items.push({ src: "timeline", title: t.title, text: t.summary, sub: t.date, go: () => show("timeline") });
  for (const [c, label] of [["species", "生き物"], ["peoples", "種族"], ["settlements", "集落"], ["magic", "法則と魔法"], ["regions", "地域"]])
    for (const x of D.data[c] || []) items.push({ src: "codex", title: x.name, text: [x.description, x.cost ? `代償：${x.cost}` : ""].filter(Boolean).join(" "), sub: label, go: () => { show("codex"); renderCodex(c); } });
  for (const k of D.index.reports || []) {
    const t = (await get(`chronicle/${k}.md`, "text")) || "";
    const head = (t.split("\n").find((l) => l.startsWith("# ")) || k).slice(2);
    items.push({ src: "report", title: head, text: t.replace(/[#*]/g, ""), sub: k, go: () => { show("reports"); $("#report-select").value = k; $("#report-select").onchange(); } });
  }
  items.forEach((it) => { it.n = norm(`${it.title} ${it.extra || ""} ${it.text}`); it.nt = norm(`${it.title} ${it.extra || ""}`); });
  SEARCH.items = items;
  SEARCH.built = true;
}

function snippet(text, words) {
  const t = String(text || "").replace(/\s+/g, " ");
  const nt = norm(t);
  let pos = -1;
  for (const w of words) { pos = nt.indexOf(w); if (pos >= 0) break; }
  const start = Math.max(0, pos - 40);
  let s = (start > 0 ? "…" : "") + t.slice(start, start + 140) + (start + 140 < t.length ? "…" : "");
  return highlight(s, words);
}
function highlight(s, words) {
  let out = esc(s);
  for (const w of words) {
    if (!w) continue;
    // ひらがな・カタカナの違いを無視して強調
    const pat = [...w].map((ch) => {
      const k = /[\u3041-\u3096]/.test(ch) ? String.fromCharCode(ch.charCodeAt(0) + 0x60) : "";
      const e = ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return k ? `[${e}${k}]` : e;
    }).join("");
    try { out = out.replace(new RegExp(`(${pat})`, "gi"), "<mark>$1</mark>"); } catch {}
  }
  return out;
}

function runSearch() {
  const q = $("#search-input").value.trim();
  const words = norm(q).split(/[\s　]+/).filter(Boolean);
  if (!words.length) { $("#search-results").innerHTML = `<div class="empty">調べたい言葉を入力してください。</div>`; $("#search-count").textContent = ""; $("#search-filters").innerHTML = ""; return; }
  // 読み仮名で入力されたら、用語辞典の漢字表記でも探す（例：おくせき → 憶石）
  const groups = words.map((w) => {
    const alts = [w];
    for (const it of SEARCH.items) if (it.src === "term" && it.extra && norm(it.extra) === w) alts.push(norm(it.title.replace(/[（(].*$/, "")));
    return alts;
  });
  const has = (txt, g) => g.some((a) => txt.includes(a));
  words.splice(0, words.length, ...groups.flat());
  let hits = SEARCH.items.filter((it) => groups.every((g) => has(it.n, g)));
  hits.forEach((it) => { it.score = (it.src === "term" ? 100 : 0) + (groups.every((g) => has(it.nt, g)) ? 50 : 0); });
  hits.sort((a, b) => b.score - a.score);
  const counts = {};
  hits.forEach((h) => (counts[h.src] = (counts[h.src] || 0) + 1));
  $("#search-filters").innerHTML = [["all", `すべて ${hits.length}`], ...Object.keys(SRC).filter((k) => counts[k]).map((k) => [k, `${SRC[k]} ${counts[k]}`])]
    .map(([k, l]) => `<button data-f="${k}" class="${SEARCH.filter === k ? "on" : ""}">${l}</button>`).join("");
  $("#search-filters").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { SEARCH.filter = b.dataset.f; runSearch(); }));
  if (SEARCH.filter !== "all") hits = hits.filter((h) => h.src === SEARCH.filter);
  $("#search-count").textContent = hits.length ? "" : "見つかりませんでした。";
  $("#search-results").innerHTML = hits.slice(0, 80).map((h, i) => `<article class="hit ${h.src === "term" ? "term" : ""}" data-i="${i}">
      <div class="src">${SRC[h.src]}${h.sub ? ` ・ ${esc(h.sub)}` : ""}</div>
      <h3>${highlight(h.title, words)}</h3>
      <p>${h.src === "term" ? highlight(h.text, words) : snippet(h.text, words)}</p></article>`).join("");
  $("#search-results").querySelectorAll(".hit").forEach((el) => el.addEventListener("click", () => hits[+el.dataset.i].go()));
}

let searchTimer;
$("#search-input").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => { SEARCH.filter = "all"; await buildSearch(); runSearch(); try { localStorage.setItem("lastSearch", $("#search-input").value); } catch {} }, 180);
});

load().then(() => { const h = location.hash.slice(1); if (h && $(`#view-${h}`)) show(h); });
