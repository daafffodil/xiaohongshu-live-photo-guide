// Keep the editor at its fixed scale while preserving one-finger scrolling.
['gesturestart', 'gesturechange'].forEach(name => document.addEventListener(name, event => event.preventDefault(), { passive: false }));
['touchstart', 'touchmove'].forEach(name => document.addEventListener(name, event => {
  if (event.touches.length > 1) event.preventDefault();
}, { passive: false }));
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const TAU = Math.PI * 2;
const defaults = { text: window.ShamCaptions.random(), mode: 'path', color: '#fff6dc', size: 88, font: 'xiaolai', seed: 1, ratio: '3:4', captionEdited: false };
let photoPalette = '';
let state = Object.assign({}, defaults), photo = new Image(), photoSource = null;
let pathPhoto = null, pathAnalysis = null, pathLayoutCache = null;
let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
let time = 0, last = performance.now(), exporting = false;
const canvas = $('#preview'), ctx = canvas.getContext('2d');
function fitStage() {
  const box = $('#dropzone'), style = getComputedStyle(box);
  const availableWidth = box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const availableHeight = box.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const ratio = canvas.width / canvas.height, width = Math.min(availableWidth - 2, (availableHeight - 2) * ratio);
  $('#stage').style.width = width + 2 + 'px'; $('#stage').style.height = width / ratio + 2 + 'px';
}
if (window.ResizeObserver) new ResizeObserver(fitStage).observe($('#dropzone'));
else window.addEventListener('resize', fitStage);
const palette = ['#fff6dc', '#20211f', '#f8d949', '#eda4bc', '#6c927d', '#f16a24'];
const colorNames = ['米白', '黑色', '黄色', '粉色', '绿色', '橙色'];
const fonts = { xiaolai: '"ShamXiaolai", sans-serif', yozai: '"ShamYozai", sans-serif', chenyu: '"ShamChenyu", cursive' };
function prepareFont() {
  if (!document.fonts || typeof document.fonts.load !== 'function') return Promise.resolve();
  return document.fonts.load(`400 48px ${fonts[state.font]}`, state.text || '文字').then(() => { pathLayoutCache = null; });
}
if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => { pathLayoutCache = null; sync(); });
palette.forEach((color, i) => {
  const b = document.createElement('button'); b.className = 'swatch';
  b.style.background = color; b.setAttribute('aria-label', colorNames[i]);
  b.dataset.color = color; b.addEventListener('click', () => { state.color = color; sync(); });
  $('.colors').append(b);
});
function toast(text) {
  $('#toast').textContent = text; $('#toast').classList.add('visible');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => $('#toast').classList.remove('visible'), 2800);
}
function imageReady(img) {
  if (typeof img.decode === 'function') return img.decode();
  if (img.complete && img.naturalWidth) return Promise.resolve();
  return new Promise((resolve, reject) => { img.addEventListener('load', resolve, { once: true }); img.addEventListener('error', reject, { once: true }); });
}
function random(n) { const x = Math.sin((n + state.seed * 9.34) * 127.1) * 43758.5453; return x - Math.floor(x); }
$$('.tab').forEach(button => button.addEventListener('click', () => {
  $$('.tab').forEach(b => { const active = b === button; b.classList.toggle('active', active); b.setAttribute('aria-selected', active); });
  $$('.tool-panel').forEach(panel => panel.hidden = panel.id !== 'panel-' + button.dataset.tab);
}));
$$('[data-font]').forEach(button => button.addEventListener('click', () => { state.font = button.dataset.font; sync(); prepareFont().then(sync).catch(() => toast('字体加载失败，请重试')); }));
function sync() {
  $('#words').value = state.text;
  for (const key of ['size', 'color']) $(`#${key}`).value = state[key];
  $$('.mode').forEach(b => { const active = b.dataset.mode === state.mode; b.classList.toggle('active', active); b.setAttribute('aria-pressed', active); });
  $$('.swatch').forEach(b => b.setAttribute('aria-pressed', b.dataset.color === state.color));
  $$('[data-font]').forEach(b => b.setAttribute('aria-pressed', b.dataset.font === state.font));
  state.ratio = '3:4';
  const height = 960;
  if (canvas.height !== height) { canvas.height = height; $('#stage').style.aspectRatio = state.ratio.replace(':', '/'); }
  fitStage();
  $$('input[type=range]').forEach(fillRange);
  draw(ctx, canvas.width, canvas.height, time);
}
function fillRange(el) { const p = (el.value - Number(el.min)) / (Number(el.max) - Number(el.min)) * 100; el.style.setProperty('--fill', `${p}%`); }
function background(c, w, h) {
  if (photo.complete && photo.naturalWidth) {
    const scale = Math.max(w / photo.naturalWidth, h / photo.naturalHeight);
    const dw = photo.naturalWidth * scale, dh = photo.naturalHeight * scale;
    c.drawImage(photo, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#99b8c3'); g.addColorStop(.5, '#486e78'); g.addColorStop(1, '#263d41'); c.fillStyle = g; c.fillRect(0, 0, w, h);
  }
  c.fillStyle = 'rgba(13,24,32,.12)'; c.fillRect(0, 0, w, h);
}
function lettering(index) {
  // A stable arrangement per character: animation never rerolls the layout.
  return { x: (random(index + 101) - .5) * .32, y: (random(index + 211) - .5) * .8,
    angle: (random(index + 307) - .5) * .5, scale: .72 + random(index + 401) * .6 };
}
function glyph(c, char, x, y, angle = 0, opacity = 1, scale = 1, index = 0, irregular = true) {
  const arrangement = irregular ? lettering(index) : { x: 0, y: 0, angle: 0, scale: 1 }, size = Number(/([\d.]+)px/.exec(c.font)[1]);
  const actualScale = scale * arrangement.scale;
  c.save(); c.translate(x + arrangement.x * size, y + arrangement.y * size);
  c.rotate(angle + arrangement.angle); c.scale(actualScale, actualScale); c.globalAlpha = opacity;
  c.fillStyle = state.color; c.shadowColor = 'rgba(16,32,33,0.3333)'; c.shadowBlur = 5; c.shadowOffsetY = 1;
  c.fillText(char, 0, 0); c.restore();
}
function phraseLayout(chars, w, h, size) {
  let rows;
  for (let attempt = 0; attempt < 30; attempt++) {
    rows = [{ items: [], width: 0, height: 0 }];
    chars.forEach((char, i) => {
      // Neighbouring letters share a line, with large and small handwritten forms.
      const scale = .58 + random(i + 401) * 1.18, advance = size * scale * 1.1;
      let row = rows[rows.length - 1];
      if (row.items.length && row.width + advance > w * .82) {
        row = { items: [], width: 0, height: 0 }; rows.push(row);
      }
      row.items.push({ char, index: i, scale, x: row.width + advance / 2 });
      row.width += advance; row.height = Math.max(row.height, size * scale * 1.55);
    });
    if (rows.reduce((sum, row) => sum + row.height, 0) < h * .7) break;
    size *= .9;
  }
  const totalHeight = rows.reduce((sum, row) => sum + row.height, 0), items = [];
  let top = Math.max(h * .12, (h - totalHeight) * .28);
  rows.forEach((row, rowIndex) => {
    const left = (w - row.width) / 2 + (rowIndex % 2 ? size * .12 : -size * .12);
    row.items.forEach(item => items.push(Object.assign({}, item, {
      x: left + item.x,
      y: top + row.height / 2 + (random(item.index + 211) - .5) * size * .66,
      angle: (random(item.index + 307) - .5) * .46
    })));
    top += row.height;
  });
  return { size, items };
}
function drawPath(c, w, h, t) {
  if (pathPhoto !== photo && photo.complete && photo.naturalWidth) {
    pathAnalysis = null; pathLayoutCache = null; pathPhoto = photo;
    try {
      const small = document.createElement('canvas'); small.width = 96; small.height = 128;
      const context = small.getContext('2d'), scale = Math.max(96 / photo.naturalWidth, 128 / photo.naturalHeight);
      context.drawImage(photo, (96 - photo.naturalWidth * scale) / 2, (128 - photo.naturalHeight * scale) / 2, photo.naturalWidth * scale, photo.naturalHeight * scale);
      pathAnalysis = window.ShamPath.analyze(context.getImageData(0, 0, 96, 128));
    } catch (_) { /* A quiet seeded curve remains available if pixels cannot be read. */ }
  }
  const key = [w, h, state.text, state.size, state.font, state.seed].join('|');
  if (!pathLayoutCache || pathLayoutCache.key !== key) {
    c.font = `400 100px ${fonts[state.font]}`;
    const lines = window.ShamPath.layout(pathAnalysis, state.text, w, h, state.size * w / 720, state.seed,
      char => { const metrics = c.measureText(char); return metrics && metrics.width / 100; });
    pathLayoutCache = { key, lines };
  }
  const pose = window.ShamMotion.sample('path', t);
  pathLayoutCache.lines.forEach(line => {
    const shift = (1 - pose.travel) * (line.width + line.start + line.size);
    const begin = Math.max(0, line.start - line.size * .5 - shift);
    const end = Math.min(line.path.length, line.start + line.width + line.size * .5 - shift);
    if (end > begin && pose.alpha > .001) {
      c.save(); c.beginPath();
      const steps = Math.max(2, Math.ceil((end - begin) / (w / 180)));
      for (let i = 0; i <= steps; i++) {
        const p = window.ShamPath.sample(line.path, begin + (end - begin) * i / steps);
        if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y);
      }
      c.strokeStyle = state.color; c.lineWidth = Math.max(.6, w / 720 * 1.7); c.lineCap = 'round'; c.lineJoin = 'round';
      c.globalAlpha = pose.alpha * .8; c.shadowColor = 'rgba(16,32,33,.28)'; c.shadowBlur = w / 360;
      c.stroke(); c.restore();
    }
    c.font = `400 ${line.size}px ${fonts[state.font]}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    line.items.forEach(item => {
      const distance = line.start + item.distance * line.size - shift;
      if (distance < 0 || distance > line.path.length || pose.alpha <= .001) return;
      const p = window.ShamPath.sample(line.path, distance), lift = line.size * (.78 + item.rise);
      const opacity = pose.alpha * Math.min(1, distance / (line.size * .65));
      glyph(c, item.char, p.x + Math.sin(p.angle) * lift, p.y - Math.cos(p.angle) * lift,
        p.angle + item.tilt, opacity, item.scale, item.index, false);
    });
  });
}
function draw(c, w, h, t) {
  c.clearRect(0, 0, w, h); background(c, w, h);
  const chars = Array.from(state.text.replace(/\n/g, '　')); if (!chars.length) return;
  if (state.mode === 'path') { drawPath(c, w, h, t); return; }
  const a = .5;
  let s = state.size * w / 720;
  if (state.mode === 'wave') {
    // Fit complete paragraphs, including the motion envelope, inside the image.
    for (let attempt = 0; attempt < 24; attempt++) {
      const columns = Math.max(3, Math.floor(w * .8 / (s * 1.2)));
      const rows = Math.ceil(chars.length / columns);
      if ((rows - 1) * s * 2.6 + s * (1.4 + 2.1 * a) <= h * .8) break;
      s *= .9;
    }
  } else if (state.mode === 'float') {
    const columns = Math.max(3, Math.min(8, Math.ceil(Math.sqrt(chars.length * 1.7))));
    s = Math.min(s, w * .82 / columns, h * .48 / Math.ceil(chars.length / columns));
  } else if (state.mode === 'orbit') {
    const groups = Math.ceil(chars.length / 25);
    for (let ring = 0; ring < groups; ring++) {
      const count = Math.min(25, chars.length - ring * 25);
      s = Math.min(s, w * (.33 - ring * .07) * TAU / count * .7);
    }
  }
  c.font = `400 ${s}px ${fonts[state.font]}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  if (state.mode === 'flow') {
    const layout = phraseLayout(chars, w, h, s);
    c.font = `400 ${layout.size}px ${fonts[state.font]}`;
    const phase = ((t % 3) + 3) % 3;
    const visible = a ? Math.min(chars.length, Math.floor(phase / 2.2 * chars.length) + 1) : chars.length;
    layout.items.slice(0, visible).forEach(item => glyph(c, item.char, item.x, item.y, item.angle, 1, item.scale, item.index, false));
  } else if (['breathe', 'sway', 'bounce'].includes(state.mode)) {
    // Keep the complete phrase together; only the pose changes over time.
    const layout = phraseLayout(chars, w, h, s * .9);
    c.font = `400 ${layout.size}px ${fonts[state.font]}`;
    layout.items.forEach(item => {
      const offset = state.mode === 'bounce' ? -item.index * .045 : 0;
      const pose = window.ShamMotion.sample(state.mode, t, offset);
      const lift = state.mode === 'bounce' ? pose.y * layout.size * .32 : 0;
      const angle = state.mode === 'sway' ? pose.angle * .12 : 0;
      const scale = state.mode === 'breathe' ? pose.breath : 1;
      glyph(c, item.char, item.x, item.y + lift, item.angle + angle, 1, item.scale * scale, item.index, false);
    });

  } else if (state.mode === 'float') {
    const columns = Math.max(3, Math.min(8, Math.ceil(Math.sqrt(chars.length * 1.7))));
    const rows = Math.ceil(chars.length / columns);
    chars.forEach((char, i) => {
      const col = i % columns, row = Math.floor(i / columns);
      const pose = window.ShamMotion.sample('float', a ? t : 0, random(i + 10));
      const x = w * (.14 + .72 * (col + .5) / columns) + (random(i + 67) - .5) * w * .26 / columns + pose.x * w * .045 * a;
      const y = h * (.25 + .5 * (row + .5) / rows) + (random(i + 40) - .5) * h * .19 / rows + pose.y * h * .055 * a;
      glyph(c, char, x, y, pose.angle * .09 * a, .94, 1 + (pose.breath - 1) * a, i);
    });
  } else if (state.mode === 'wave') {
    const maxPerLine = Math.max(3, Math.floor(w * .8 / (s * 1.2))), lines = Math.ceil(chars.length / maxPerLine);
    chars.forEach((char, i) => {
      const row = Math.floor(i / maxPerLine), col = i % maxPerLine;
      const count = Math.min(maxPerLine, chars.length - row * maxPerLine);
      const x = w / 2 + (col - (count - 1) / 2) * s * 1.2;
      const offset = col * .065 + row * .13 + random(10);
      const pose = window.ShamMotion.sample('wave', a ? t : 0, offset);
      const next = window.ShamMotion.sample('wave', a ? t + .015 : 0, offset);
      const y = h * .5 + (row - (lines - 1) / 2) * s * 2.6 + pose.y * s * .8 * a;
      glyph(c, char, x + pose.x * s * .08 * a, y, (next.y - pose.y) * 1.8 * a, 1, 1, i);
    });
  } else {
    const groups = Math.ceil(chars.length / 25);
    chars.forEach((char, i) => {
      const ring = Math.floor(i / 25), count = Math.min(25, chars.length - ring * 25);
      const phase = window.ShamMotion.sample('orbit', a ? t : 0).phase;
      const angle = i % 25 / Math.max(count, 1) * TAU - Math.PI / 2 + random(10) * TAU + phase * TAU * (ring % 2 ? -1 : 1);
      const rx = w * (.33 - ring * .07), ry = h * (.17 - ring * .025);
      const x = w / 2 + Math.cos(angle) * rx, y = h / 2 + Math.sin(angle) * ry;
      const depth = (Math.sin(angle) + 1) / 2;
      glyph(c, char, x, y, Math.cos(angle) * .09 * a, .55 + depth * .45, (groups > 1 ? .78 : .9) + depth * .15 * a, i);
    });
  }
}
function frame(now) {
  const delta = Math.min((now - last) / 1000, .1); last = now;
  if (playing && !document.hidden && !exporting) time = (time + delta) % 3;
  if (!exporting) draw(ctx, canvas.width, canvas.height, time);
  requestAnimationFrame(frame);
}
function syncPlay() { $('#play use').setAttribute('href', playing ? '#i-pause' : '#i-play'); $('#play').setAttribute('aria-label', playing ? '暂停预览' : '播放预览'); }
$('#play').addEventListener('click', () => { if (!playing && state.mode === 'flow' && time >= 3) time = 0; playing = !playing; syncPlay(); });
function updateWords(value) {
  const characters = Array.from(value);
  if (characters.length > 80) toast('最多输入80个字');
  state.text = characters.slice(0, 80).join(''); state.captionEdited = true; time = 0;
  if (state.mode === 'flow') { playing = true; syncPlay(); } sync();
}
$('#words').addEventListener('input', e => { if (!e.isComposing) updateWords(e.target.value); });
$('#words').addEventListener('compositionend', e => updateWords(e.target.value));
$('#suggest').addEventListener('click', () => { state.captionEdited = false; state.text = window.ShamCaptions.random(state.text); time = 0; if (state.mode === 'flow') { playing = true; syncPlay(); } sync(); });
for (const key of ['size', 'color']) $(`#${key}`).addEventListener('input', e => { state[key] = key === 'size' ? Number(e.target.value) : e.target.value; sync(); });
$$('.mode').forEach(b => b.addEventListener('click', () => { state.mode = b.dataset.mode; time = 0; playing = true; syncPlay(); sync(); }));
$('#shuffle').addEventListener('click', () => { state.seed++; time = 0; if (state.mode === 'flow') { playing = true; syncPlay(); } sync(); toast('已重新排布'); });
$('#replace').addEventListener('click', () => $('#photo').click());
let photoLoadId = 0;
async function loadPhoto(file) {
  if (!file || !/^image\/(jpeg|png|webp|avif)$/.test(file.type)) { toast('请选择 JPG、PNG、WebP 或 AVIF 照片'); return; }
  if (file.size > 25 * 1024 * 1024) { toast('请选择小于 25 MB 的照片'); return; }
  const loadId = ++photoLoadId, url = URL.createObjectURL(file), img = new Image();
  try {
    img.src = url; await imageReady(img);
    const scratch = document.createElement('canvas');
    const cropWidth = Math.min(img.naturalWidth, img.naturalHeight * .75), cropHeight = cropWidth / .75;
    scratch.width = Math.max(3, Math.floor(Math.min(1080, cropWidth) / 3) * 3); scratch.height = scratch.width / 3 * 4;
    scratch.getContext('2d').drawImage(img, (img.naturalWidth - cropWidth) / 2, (img.naturalHeight - cropHeight) / 2, cropWidth, cropHeight, 0, 0, scratch.width, scratch.height);
    const source = scratch.toDataURL('image/jpeg', .92), normalized = new Image(); normalized.src = source; await imageReady(normalized);
    if (loadId !== photoLoadId) return;
    photoSource = source; photo = normalized; state.ratio = '3:4';
    photoPalette = window.ShamCaptions.palette(scratch.getContext('2d'), scratch.width, scratch.height);
    if (!state.captionEdited || !state.text.trim()) { state.captionEdited = false; state.text = window.ShamCaptions.random(state.text); }
    time = 0; if (state.mode === 'flow') { playing = true; syncPlay(); } sync(); toast('照片已更新');
  } catch (_) { toast('照片无法读取，请换一张照片'); } finally { URL.revokeObjectURL(url); $('#photo').value = ''; }
}
$('#photo').addEventListener('change', e => loadPhoto(e.target.files[0]));
for (const event of ['dragenter', 'dragover']) $('#dropzone').addEventListener(event, e => { e.preventDefault(); $('#dropzone').classList.add('dragging'); });
$('#dropzone').addEventListener('dragleave', () => $('#dropzone').classList.remove('dragging'));
$('#dropzone').addEventListener('drop', e => { e.preventDefault(); $('#dropzone').classList.remove('dragging'); loadPhoto(e.dataTransfer.files[0]); });
async function openExport() {
  if (!state.text.trim()) { toast('请先输入文字'); $('#tab-text').click(); $('#words').focus(); return; }
  const sdk = miniTool();
  if (sdk) {
    if (typeof sdk.saveImageToPhotosAlbum !== 'function') { toast('请更新小红书后重试'); return; }
    let action = '图片生成';
    try {
      await prepareFont(); draw(ctx, canvas.width, canvas.height, time);
      action = '图片写入';
      if (typeof sdk.writeTempFile !== 'function') throw new Error('unsupported');
      const image = await sdk.writeTempFile({ data: canvas.toDataURL('image/jpeg', .92) });
      if (!image.filePath) throw new Error('missing file path');
      action = '图片保存';
      await sdk.saveImageToPhotosAlbum({ filePath: image.filePath }); toast('图片已保存');
    } catch (error) { toast(mediaError(error, action)); }
    return;
  }
  toast('请在小红书内打开后保存');
}
$('#export').addEventListener('click', openExport);
function miniTool() { return window.xhs && window.xhs.miniTool; }
async function fitHostHeader() {
  const sdk = miniTool();
  if (!sdk || typeof sdk.getWindowInfo !== 'function' || await buildVersion() < 9490) return;
  try {
    const info = await sdk.getWindowInfo();
    let top = Math.max(0, Number(info.safeArea && info.safeArea.top) || 0) + 4;
    const brand = $('.brand').getBoundingClientRect();
    const buttons = info.menuButtons || {};
    ['back', 'me', 'share'].forEach(name => {
      const button = buttons[name];
      if (button && button.right > brand.left - 8 && button.left < brand.right + 8) top = Math.max(top, Number(button.bottom) + 4 || 0);
    });
    document.documentElement.style.setProperty('--header-top-space', Math.ceil(top) + 'px');
    fitStage();
  } catch (_) {}
}
window.addEventListener('resize', fitHostHeader);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitHostHeader);
fitHostHeader();
async function buildVersion() {
  const xhs = window.xhs, launch = xhs && xhs.launchOptions;
  let version = Number(launch && launch.miniToolEnv && launch.miniToolEnv.buildVersion) || 0;
  const sdk = miniTool();
  if (!version && sdk && typeof sdk.getLaunchOptions === 'function') {
    try { const result = await sdk.getLaunchOptions(); version = Number(result && result.miniToolEnv && result.miniToolEnv.buildVersion) || 0; } catch (_) {}
  }
  return Math.floor(version / 1000);
}
function readBlob(blob) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('素材读取失败')); reader.readAsDataURL(blob); });
}
function mediaError(error, action) {
  const message = String(error && (error.errMsg || error.message) || '');
  console.error(action, error);
  if (/cancel/i.test(message)) return '已取消';
  if (/permission|authorize|authorization|denied|权限|未授权/i.test(message)) return '请在系统设置中允许小红书访问相册';
  if (error && error.code === 'PUBLISH_TIMEOUT') return action + '超时，请重试';
  if (!/发布页/.test(action)) return action + '失败，请重试';
  const code = error && error.errCode != null ? '（' + String(error.errCode).slice(0,30) + '）' : '';
  const detail = message.replace(/data:[^\s]+/g, '[素材]').replace(/(?:https?:|xhsfile:|file:)[^\s]+/g, '[路径]').slice(0,180);
  return action + '失败' + code + (detail ? '：' + detail : '，请重试');
}
function publishStage(name, text) {
  if (window.ShamPublishEntry) window.ShamPublishEntry.stage(name, text);
}
function prepareStep(task, milliseconds) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error('preparation timeout'); error.code = 'PUBLISH_TIMEOUT'; reject(error);
    }, milliseconds);
    Promise.resolve().then(task).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}
async function writeVideoFile(sdk, blob) {
  // Publishing output must use the opaque handle returned by the platform.
  // HD exports are larger than 4 MiB; do not switch them to constructed paths.
  const data = await prepareStep(() => readBlob(blob), 15000);
  const result = await prepareStep(() => sdk.writeTempFile({ data }), 30000);
  if (!result || typeof result.filePath !== 'string' || !result.filePath) throw new Error('视频写入失败');
  return result;
}
function verifyLiveMedia(media) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    let done = false;
    const timer = setTimeout(() => finish(new Error('视频读取超时，请重新生成')), 15000);
    function finish(error) {
      if (done) return; done = true; clearTimeout(timer);
      video.onloadeddata = null; video.onerror = null;
      video.removeAttribute('src'); video.load();
      if (error) reject(error); else resolve();
    }
    video.muted = true; video.playsInline = true; video.preload = 'auto';
    video.onloadeddata = () => {
      if (!(video.videoWidth > 0 && video.videoHeight > 0 && Number.isFinite(video.duration) && video.duration > 0)) return finish(new Error('视频内容无效，请重新生成'));
      finish();
    };
    video.onerror = () => finish(new Error('小红书无法读取生成的视频，请重新生成'));
    video.src = media.video_url; video.load();
  });
}
async function offlineVideo(c, onProgress) {
  if (!window.ShamMp4) throw new Error('视频组件未加载，请重新打开');
  const context = c.getContext('2d', { willReadFrequently: true }), samples = [];
  const encoder = window.ShamMp4.createEncoder ? window.ShamMp4.createEncoder(c.width, c.height) : null;
  const fps = 12, count = 36;
  for (let n = 0; n < count; n++) {
    draw(context, c.width, c.height, n / fps);
    const pixels = context.getImageData(0, 0, c.width, c.height).data;
    samples.push(encoder ? encoder.encode(pixels) : window.ShamMp4.encodeFrame(pixels, c.width, c.height, n));
    onProgress(Math.round((n + 1) / count * 90));
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return new Blob([window.ShamMp4.mux(samples, c.width, c.height, fps, !!encoder)], { type: 'video/mp4' });
}
let liveBusy = false, preparedLive = null;
function liveKey() { return JSON.stringify(state) + ':' + photoLoadId; }
async function publishLive() {
  if (liveBusy) return;
  if (!state.text.trim()) { closeDialog($('#publish-dialog')); toast('请先输入文字'); $('#tab-text').click(); $('#words').focus(); return; }
  showDialog('#publish-dialog'); $('#publish-error').textContent = '';
  const sdk = miniTool(), native = sdk && typeof sdk.postNote === 'function' && typeof sdk.writeTempFile === 'function';
  if (!native) {
    publishStage('unavailable', '生成live图并发布');
    $('#publish-info').textContent = '当前小红书版本暂不支持发布，请更新后重试';
    $('#publish-export').disabled = true;
    return;
  }
  $('#publish-export').disabled = false;
  $('#publish-info').textContent = native ? '生成后打开小红书发布页。' : '请在小红书内打开后发布。';
  $('#publish-export').textContent = native ? '生成并打开发布页' : '预览发布素材';
  if (native) return generateLive();
}
function beginPublish() {
  return publishLive().catch(error => {
    console.error('发布入口', error);
    $('#publish-error').textContent = '发布未能启动，请重新打开小工具';
    toast('发布未能启动，请重新打开小工具');
  });
}
if (window.ShamPublishEntry) window.ShamPublishEntry.connect(beginPublish);
else $('#publish').addEventListener('click', beginPublish);
$('#publish-export').addEventListener('click', retryPreparedPublisher);
let publishMediaField = 'live_photo_sources';
let publishPageType = 'slides_edit';
function openPreparedPublisher(sdk, media) {
  const note = window.ShamCaptions.note(state);
  if (!media || typeof media.url !== 'string' || !media.url || typeof media.video_url !== 'string' || !media.video_url) throw new Error('发布素材路径无效，请重新生成');
  const alternate = publishMediaField === 'live_photo_resources' ? 'live_photo_sources' : 'live_photo_resources';
  const otherPage = publishPageType === 'slides_edit' ? 'photo_publish' : 'slides_edit';
  const routes = [[publishPageType, publishMediaField], [publishPageType, alternate], [otherPage, publishMediaField], [otherPage, alternate]];
  function attempt(index) {
    const pageType = routes[index][0], field = routes[index][1];
    const resources = {}; resources[field] = [{ url: media.url, video_url: media.video_url }];
    // The injected SDK serializes mediaInfo. Do not double-serialize it.
    function rejected(error) {
      const message = String(error && (error.errMsg || error.message) || '');
      const rejectedMedia = /media[_\s]?info/i.test(message) || /slides[\s_]+resources?[\s_]+too[\s_]+few/i.test(message);
      console.warn('live图参数检查', pageType, field, error && error.errCode, message);
      // Only local validation failures permit another route. Never retry cancellation,
      // a pending editor, network errors, or unknown failures. Never add static media.
      if (index + 1 >= routes.length || Number(error && error.errCode) !== 10001 || !/invalid\s*param/i.test(message) || !rejectedMedia) throw error;
      return attempt(index + 1);
    }
    let result;
    // Keep visible hashtags in content: some native clients ignore the tags field.
    try { result = sdk.postNote({title: note.title, content: note.content, tags: note.tags.join(','), pageType, mediaInfo: resources}); }
    catch (error) { return rejected(error); }
    return Promise.resolve(result).then(value => { publishMediaField = field; publishPageType = pageType; return value; }, rejected);
  }
  return attempt(0);
}
async function publishStatic() {
  if (liveBusy) return;
  if (!state.text.trim()) { toast('请先输入文字'); return; }
  const sdk = miniTool();
  if (!sdk || typeof sdk.postNote !== 'function' || typeof sdk.writeTempFile !== 'function') { toast('请在小红书内打开后发布'); return; }
  liveBusy = true; exporting = true;
  $('#publish').disabled = true; $('#publish-export').disabled = true; $('#publish-static').disabled = true;
  $$('#publish-dialog .close-dialog').forEach(b => b.disabled = true);
  $('#publish-error').textContent = ''; $('#publish-static').textContent = '正在生成静态图';
  let action = '静态图生成';
  try {
    await prepareStep(() => imageReady(photo), 15000); await prepareStep(prepareFont, 15000);
    const c = document.createElement('canvas'); c.width = 720; c.height = 960;
    draw(c.getContext('2d'), c.width, c.height, state.mode === 'flow' ? 2.5 : time);
    action = '静态图写入';
    const image = await prepareStep(() => sdk.writeTempFile({data:c.toDataURL('image/jpeg', .95)}), 20000);
    if (!image || typeof image.filePath !== 'string' || !image.filePath) throw new Error('静态图路径无效');
    const note = window.ShamCaptions.note(Object.assign({},state,{output:'static'}));
    action = '打开静态图发布页'; $('#publish-static').textContent = '正在打开发布页';
    await sdk.postNote({title:note.title, content:note.content, tags:note.tags.join(','), pageType:'photo_publish', mediaInfo:{image_resources:[{url:image.filePath}]}});
    $('#publish-info').textContent = '已返回小工具，请在小红书查看笔记状态。';
  } catch (error) { $('#publish-error').textContent = mediaError(error, action); }
  finally {
    liveBusy = false; exporting = false;
    $('#publish').disabled = false; $('#publish-export').disabled = false; $('#publish-static').disabled = false; $('#publish-static').textContent = '发布静态图';
    $$('#publish-dialog .close-dialog').forEach(b => b.disabled = false);
  }
}
$('#publish-static').addEventListener('click', publishStatic);
function retryPreparedPublisher() {
  const sdk = miniTool();
  if (!sdk || !preparedLive || preparedLive.key !== liveKey()) return generateLive();
  if (liveBusy) return Promise.resolve();
  liveBusy = true; exporting = true; $('#publish').disabled = true; $('#publish-static').disabled = true;
  const button = $('#publish-export'); button.disabled = true; button.textContent = '正在打开发布页';
  $('#publish-error').textContent = ''; publishStage('publisher', '正在打开发布页');
  $$('#publish-dialog .close-dialog').forEach(b => b.disabled = true);
  let result;
  try { result = openPreparedPublisher(sdk, preparedLive.media); }
  catch (error) { result = Promise.reject(error); }
  return Promise.resolve(result).then(() => {
    publishStage('returned', '生成live图并发布');
    $('#publish-info').textContent = '已返回小工具，请在小红书查看笔记状态。';
  }, error => {
    publishStage('failed', '生成live图并发布');
    $('#publish-error').textContent = mediaError(error, '打开发布页');
  }).then(() => {
    liveBusy = false; exporting = false; $('#publish').disabled = false; $('#publish-static').disabled = false;
    button.disabled = false; button.textContent = '打开小红书发布页';
    $$('#publish-dialog .close-dialog').forEach(b => b.disabled = false);
  });
}

async function generateLive() {
  if (liveBusy) return;
  if (preparedLive && preparedLive.key === liveKey() && miniTool()) return retryPreparedPublisher();
  const sdk = miniTool(), native = sdk && typeof sdk.postNote === 'function' && typeof sdk.writeTempFile === 'function';
  liveBusy = true; exporting = true; $('#publish').disabled = true; $('#publish-static').disabled = true;
  const button = $('#publish-export'); button.disabled = true; button.textContent = '正在生成';
  let action = '素材生成';
  $$('#publish-dialog .close-dialog').forEach(b => b.disabled = true);
  $('#publish-progress').hidden = false; $('#publish-progress').value = 0; $('#publish-error').textContent = '';
  try {
    publishStage('checking', '正在准备live图');
    action = '客户端检查';
    if (native) { const version = await prepareStep(buildVersion, 10000); if (version && version < 9430) throw new Error('请将小红书更新到 9.43 或以上版本'); }
    let cover, blob, media = native && preparedLive && preparedLive.key === liveKey() ? preparedLive.media : null;
    if (!media) {
      action = '图片加载'; publishStage('image', '正在加载图片');
      await prepareStep(() => imageReady(photo), 15000);
      action = '字体加载'; publishStage('font', '正在加载字体');
      await prepareStep(prepareFont, 15000);
      action = '素材生成'; publishStage('encoding', '正在生成live图');
      await new Promise(resolve => setTimeout(resolve, 0));
      const c = document.createElement('canvas');
      c.width = 1080; c.height = 1440;
      draw(c.getContext('2d'), c.width, c.height, 0);
      cover = c.toDataURL('image/jpeg', .95);
      blob = await offlineVideo(c, value => $('#publish-progress').value = value);
      if (native) {
        action = '封面写入'; button.textContent = '正在写入封面'; publishStage('cover', '正在写入封面');
        const coverFile = await prepareStep(() => sdk.writeTempFile({ data: cover }), 20000);
        action = '视频写入'; button.textContent = '正在写入视频'; publishStage('video', '正在写入视频');
        const videoFile = await writeVideoFile(sdk, blob);
        if (!coverFile.filePath || !videoFile.filePath) throw new Error('发布素材写入失败');
        media = { url: coverFile.filePath, video_url: videoFile.filePath };
        action = '视频读取'; publishStage('verify', '正在检查视频');
        await verifyLiveMedia(media);
        preparedLive = { key: liveKey(), media };
      }
    }
    if (native) {
      button.textContent = '正在打开发布页';
      $('#publish-progress').value = 100;
      action = '打开发布页'; publishStage('publisher', '正在打开发布页');
      await openPreparedPublisher(sdk, media);
      publishStage('returned', '生成live图并发布');
      $('#publish-info').textContent = '已返回小工具，请在小红书查看笔记状态。';
    }
  } catch (error) { publishStage('failed', '生成live图并发布'); $('#publish-error').textContent = /9\.43/.test(error && error.message || '') ? error.message : mediaError(error, action); }
  finally {
    liveBusy = false; exporting = false; $('#publish').disabled = false; $('#publish-static').disabled = false; button.disabled = false; button.textContent = native ? preparedLive && preparedLive.key === liveKey() ? '打开小红书发布页' : '重新生成并发布' : '重新生成预览';
    $('#publish-progress').hidden = true; $$('#publish-dialog .close-dialog').forEach(b => b.disabled = false);
  }
}
function showDialog(selector) {
  $(selector).hidden = false;
  if (document.body) document.body.classList.add('modal-open');
}
function closeDialog(dialog) {
  dialog.hidden = true;
  if (document.body) document.body.classList.remove('modal-open');
}
$$('.close-dialog').forEach(b => b.addEventListener('click', () => closeDialog(b.closest('.dialog-layer'))));
$$('.dialog-layer').forEach(dialog => dialog.addEventListener('click', event => {
  if (event.target === dialog && !exporting && !liveBusy) closeDialog(dialog);
}));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !exporting && !liveBusy) $$('.dialog-layer').forEach(closeDialog);
});
photo.addEventListener('load', () => { pathPhoto = null; pathLayoutCache = null; sync(); }); photo.addEventListener('error', () => toast('示例照片加载失败，请上传照片')); photo.src = 'assets/default.jpg';
sync(); syncPlay(); requestAnimationFrame(frame);
