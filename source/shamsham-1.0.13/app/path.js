(function (root) {
  'use strict';
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  function random(seed, index) {
    const n = Math.sin((index + seed * 9.34) * 127.1) * 43758.5453;
    return n - Math.floor(n);
  }

  // Small, local image statistics, not object detection or semantic segmentation.
  // Analysis runs once per photo; the animation only samples the resulting curve.
  function analyze(image) {
    if (!image || !image.width || !image.height || image.data.length !== image.width * image.height * 4) return null;
    const w = image.width, h = image.height, data = image.data;
    const luminance = new Float32Array(w * h), raw = new Float32Array(w * h);
    const border = [0, 0, 0]; let count = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, p = i * 4;
      luminance[i] = (data[p] * .2126 + data[p + 1] * .7152 + data[p + 2] * .0722) / 255;
      if (x < w * .07 || x > w * .93 || y < h * .07 || y > h * .93) {
        for (let c = 0; c < 3; c++) border[c] += data[p + c] / 255;
        count++;
      }
    }
    for (let c = 0; c < 3; c++) border[c] /= count;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, p = i * 4;
      const r = data[p] / 255, g = data[p + 1] / 255, b = data[p + 2] / 255;
      const edge = Math.abs(luminance[y * w + Math.min(w - 1, x + 1)] - luminance[y * w + Math.max(0, x - 1)])
        + Math.abs(luminance[Math.min(h - 1, y + 1) * w + x] - luminance[Math.max(0, y - 1) * w + x]);
      const contrast = (Math.abs(r - border[0]) + Math.abs(g - border[1]) + Math.abs(b - border[2])) / 3;
      raw[i] = Math.min(1, edge * 2.8 + contrast * .7 + (Math.max(r, g, b) - Math.min(r, g, b)) * .32);
    }
    // A summed-area table gives a broad clearance around texture and strong edges.
    const stride = w + 1, integral = new Float32Array(stride * (h + 1));
    for (let y = 0; y < h; y++) {
      let sum = 0;
      for (let x = 0; x < w; x++) {
        sum += raw[y * w + x];
        integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + sum;
      }
    }
    const cost = new Float32Array(w * h), radius = Math.max(2, Math.round(w * .045));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius), x1 = Math.min(w, x + radius + 1);
      const y0 = Math.max(0, y - radius), y1 = Math.min(h, y + radius + 1);
      cost[y * w + x] = (integral[y1 * stride + x1] - integral[y0 * stride + x1]
        - integral[y1 * stride + x0] + integral[y0 * stride + x0]) / ((x1 - x0) * (y1 - y0));
    }
    return { width: w, height: h, cost };
  }
  function at(map, x, y) {
    if (!map) return 0;
    return map.cost[Math.round(clamp(y, 0, 1) * (map.height - 1)) * map.width + Math.round(clamp(x, 0, 1) * (map.width - 1))];
  }
  function curve(map, seed) {
    const candidates = [];
    // Broad arches, scoops and soft S curves compete for the quieter image areas.
    for (let i = 0; i < 72; i++) {
      const baseline = .32 + random(seed, i * 7 + 1) * .4;
      const center = .3 + random(seed, i * 7 + 2) * .4;
      const spread = .15 + random(seed, i * 7 + 3) * .14;
      const amplitude = (.13 + random(seed, i * 7 + 4) * .12) * (i % 3 === 1 ? 1 : -1);
      const tilt = (random(seed, i * 7 + 5) - .5) * .17;
      const points = []; let score = 0;
      for (let j = 0; j <= 24; j++) {
        const u = j / 24, x = .085 + u * .83;
        const shape = i % 3 === 2 ? Math.sin(u * Math.PI * 2 - .6) * .65 : Math.exp(-Math.pow((u - center) / spread, 2) * .5);
        const y = clamp(baseline + amplitude * shape + tilt * (u - .5), .16, .82);
        points.push({ x, y });
        score += (at(map, x, y - .025) + at(map, x, y + .025)) * .5;
      }
      score = score / points.length + Math.abs(baseline - .49) * .16;
      candidates.push({ points, score });
    }
    candidates.sort((a, b) => a.score - b.score);
    const chosen = candidates[0].points;
    let points = chosen.map(p => {
      let best = p.y, score = Infinity;
      for (let step = -4; step <= 4; step++) {
        const y = clamp(p.y + step * .012, .15, .83);
        const trial = at(map, p.x, y) + Math.pow(y - p.y, 2) * 24;
        if (trial < score) { score = trial; best = y; }
      }
      return { x: p.x, y: best };
    });
    for (let pass = 0; pass < 4; pass++) points = points.map((p, i) => ({ x: p.x,
      y: (points[Math.max(0, i - 1)].y + p.y * 2 + points[Math.min(points.length - 1, i + 1)].y) / 4 }));
    return points;
  }
  function route(anchors, width, height, seed, row, rows) {
    const points = [], lengths = [0]; let length = 0;
    const meanY = anchors.reduce((sum, p) => sum + p.y, 0) / anchors.length;
    for (let i = 0; i <= 240; i++) {
      const u = i / 240 * (anchors.length - 1), j = Math.min(anchors.length - 2, Math.floor(u)), t = u - j;
      const a = anchors[Math.max(0, j - 1)], b = anchors[j], c = anchors[j + 1], d = anchors[Math.min(anchors.length - 1, j + 2)];
      let y = .5 * (2 * b.y + (-a.y + c.y) * t + (2 * a.y - 5 * b.y + 4 * c.y - d.y) * t * t + (-a.y + 3 * b.y - 3 * c.y + d.y) * t * t * t);
      if (rows > 1) y = .23 + row * .55 / (rows - 1) + (y - meanY) * Math.min(.65, 1.5 / rows);
      // Spatial noise is seeded and independent of time, so it never flickers.
      y += Math.sin(i / 240 * Math.PI * 9 + random(seed, 801) * 6) * .0025
        + Math.sin(i / 240 * Math.PI * 19 + random(seed, 802) * 6) * .0012;
      const p = { x: (b.x + (c.x - b.x) * t) * width, y: y * height };
      if (i) { const prev = points[i - 1]; length += Math.hypot(p.x - prev.x, p.y - prev.y); lengths.push(length); }
      points.push(p);
    }
    return { points, lengths, length };
  }
  function sample(path, distance) {
    const s = clamp(distance, 0, path.length); let lo = 0, hi = path.lengths.length - 1;
    while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (path.lengths[mid] < s) lo = mid; else hi = mid; }
    const a = path.points[lo], b = path.points[hi];
    const f = (s - path.lengths[lo]) / (path.lengths[hi] - path.lengths[lo] || 1);
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, angle: Math.atan2(b.y - a.y, b.x - a.x) };
  }
  function layout(map, text, width, height, size, seed, measure) {
    const chars = Array.from(text.replace(/\n/g, '　'));
    if (!chars.length) return [];
    const rows = Math.ceil(chars.length / 28), perRow = Math.ceil(chars.length / rows);
    const anchors = curve(map, seed), result = [];
    for (let row = 0; row < rows; row++) {
      const path = route(anchors, width, height, seed, row, rows);
      let advance = 0;
      const items = chars.slice(row * perRow, (row + 1) * perRow).map((char, i) => {
        const index = row * perRow + i, scale = .82 + random(seed, index + 401) * .38;
        const measured = measure ? measure(char) : 1;
        const unit = (Number.isFinite(measured) ? Math.max(.45, measured) : 1) * scale * 1.16;
        const item = { char, index, scale, unit, distance: advance + unit / 2,
          rise: (random(seed, index + 211) - .5) * .16, tilt: (random(seed, index + 307) - .5) * .14 };
        advance += unit;
        return item;
      });
      const fitted = Math.min(size, path.length / (advance + 1.8), height * .12 / rows);
      result.push({ path, items, size: fitted, width: advance * fitted, start: (path.length - advance * fitted) / 2 });
    }
    return result;
  }
  root.ShamPath = { analyze, curve, layout, sample };
})(window);
