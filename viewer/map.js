// 地域データ（中心点の座標・地形・標高・魔力）から地図を描く
const WorldMap = (() => {
  const COLORS = {
    ocean: [22, 48, 78], sea: [34, 72, 108], lake: [52, 98, 138], coast: [201, 185, 138],
    plains: [150, 172, 102], grassland: [166, 190, 108], forest: [72, 114, 66], jungle: [50, 102, 58],
    mountains: [128, 118, 108], hills: [158, 148, 114], desert: [214, 190, 134], tundra: [176, 188, 178],
    ice: [228, 236, 240], swamp: [92, 108, 74], volcano: [112, 56, 46],
  };
  const WATER = new Set(["ocean", "sea", "lake"]);

  function hashColor(s) {
    let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const hue = h % 360, sat = 0.35, lit = 0.5;
    const f = (n) => { const k = (n + hue / 30) % 12; const a = sat * Math.min(lit, 1 - lit);
      return Math.round(255 * (lit - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return [f(0), f(8), f(4)];
  }
  const colorOf = (t) => COLORS[t] || hashColor(String(t || "unknown"));

  // なめらかなノイズ（海岸線を自然に揺らす）
  function noise(x, y) {
    const s = (i, j) => { const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return n - Math.floor(n); };
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = s(xi, yi), b = s(xi + 1, yi), c = s(xi, yi + 1), d = s(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const fbm = (x, y) => noise(x, y) * 0.6 + noise(x * 2.1, y * 2.1) * 0.3 + noise(x * 4.3, y * 4.3) * 0.1;

  let state = { regions: [], settlements: [], W: 0, H: 0 };

  function nearest(px, py) {
    let best = null, bd = Infinity, second = Infinity;
    for (const r of state.regions) {
      const dx = px - r.x, dy = py - r.y, d = dx * dx + dy * dy;
      if (d < bd) { second = bd; bd = d; best = r; } else if (d < second) second = d;
    }
    return { r: best, d: Math.sqrt(bd), d2: Math.sqrt(second) };
  }

  function draw(canvas, regions, settlements, opts = {}) {
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    state = {
      regions: (regions || []).filter(r => typeof r.x === "number" && typeof r.y === "number"),
      settlements: settlements || [], W, H,
    };
    if (!state.regions.length) return drawVoid(ctx, W, H);

    const scale = 2; // 計算は半分の解像度で行い拡大する
    const w = Math.ceil(W / scale), h = Math.ceil(H / scale);
    const img = ctx.createImageData(w, h);
    const aspect = W / H;
    const reach = Math.max(0.09, 0.55 / Math.sqrt(state.regions.length));

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const px = x / w, py = y / h;
        const jx = px + (fbm(px * 9, py * 9) - 0.5) * 0.05;
        const jy = py + (fbm(px * 9 + 50, py * 9 + 50) - 0.5) * 0.05;
        const { r, d, d2 } = nearest(jx, jy);
        let col, k = 1;
        const far = d * Math.min(aspect, 1.6) > reach;
        if (far || !r) {
          col = [12, 26, 46]; k = 0.85 + fbm(px * 30, py * 30) * 0.2;
        } else {
          col = colorOf(r.terrain);
          const elev = typeof r.elevation === "number" ? r.elevation : 0.4;
          const tex = fbm(px * 40, py * 40);
          k = WATER.has(r.terrain) ? 0.85 + tex * 0.15 : 0.7 + elev * 0.35 + (tex - 0.5) * 0.25;
          if (d2 - d < 0.004) k *= 0.82; // 境界線
        }
        let [cr, cg, cb] = col.map(c => c * k);
        if (opts.layer === "magic" && r && !far) {
          const m = Math.max(0, Math.min(1, r.magic ?? 0));
          const glow = m * (0.55 + fbm(px * 14 + 9, py * 14) * 0.45);
          const gray = (cr + cg + cb) / 3 * 0.45;
          cr = gray + (155 - gray) * glow; cg = gray + (110 - gray) * glow * 0.8; cb = gray + (230 - gray) * glow;
        }
        const i = (y * w + x) * 4;
        img.data[i] = cr; img.data[i + 1] = cg; img.data[i + 2] = cb; img.data[i + 3] = 255;
      }
    }
    const tmp = document.createElement("canvas"); tmp.width = w; tmp.height = h;
    tmp.getContext("2d").putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tmp, 0, 0, W, H);

    // 外枠の陰影
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // 集落
    for (const s of state.settlements) {
      if (typeof s.x !== "number") continue;
      const X = s.x * W, Y = s.y * H, rad = 3 + (s.size || 1) * 1.6;
      ctx.beginPath(); ctx.arc(X, Y, rad, 0, Math.PI * 2);
      ctx.fillStyle = "#f4e3b0"; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "#3b2a10"; ctx.stroke();
      if (opts.labels) label(ctx, s.name, X + rad + 4, Y + 4, 20, "#fff4d0", "left");
    }
    // 地名
    if (opts.labels) {
      for (const r of state.regions) {
        const water = WATER.has(r.terrain);
        label(ctx, r.name, r.x * W, r.y * H, water ? 19 : 21, water ? "#a9c6e6" : "#f2ead6", "center", water);
      }
    }
  }

  function label(ctx, text, x, y, size, color, align, italic) {
    if (!text) return;
    ctx.font = `${italic ? "italic " : ""}700 ${size}px "Shippori Mincho", serif`;
    ctx.textAlign = align;
    ctx.lineWidth = 4; ctx.strokeStyle = "rgba(10,14,24,0.75)"; ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }

  function drawVoid(ctx, W, H) {
    ctx.fillStyle = "#070a12"; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 260; i++) {
      const x = noise(i * 3.1, 7) * W * 1.7 % W, y = noise(9, i * 2.7) * H * 1.9 % H;
      ctx.fillStyle = `rgba(233,226,208,${0.2 + (i % 7) / 10})`;
      ctx.fillRect(x, y, i % 11 === 0 ? 2 : 1, i % 11 === 0 ? 2 : 1);
    }
    ctx.font = '700 34px "Shippori Mincho", serif'; ctx.textAlign = "center";
    ctx.fillStyle = "#d6b25e"; ctx.fillText("大地はまだ、形を持たない", W / 2, H / 2);
    ctx.font = '500 20px "Shippori Mincho", serif'; ctx.fillStyle = "#a9a291";
    ctx.fillText("第2期「大地の創造」で、ここに世界が現れます", W / 2, H / 2 + 44);
  }

  function pick(fx, fy) {
    if (!state.regions.length) return null;
    const { r } = nearest(fx, fy);
    return r;
  }

  return { draw, pick };
})();
