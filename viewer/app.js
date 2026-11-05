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
    $("#latest-report").innerHTML = `<h2>最新の月報</h2><p class="muted">最初の月報は、世界の1か月（現実の1日）が過ぎると届きます。</p>`;
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
  sel.innerHTML = reps.map((k) => `<option value="${k}">${k.replace(/Y0*(\d+)-M0*(\d+)/, "創世暦$1年 $2月")}</option>`).join("");
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
  history.replaceState(null, "", `#${view}`);
}
document.querySelectorAll("#tabs button").forEach((b) => b.addEventListener("click", () => show(b.dataset.view)));

load().then(() => { const h = location.hash.slice(1); if (h && $(`#view-${h}`)) show(h); });
