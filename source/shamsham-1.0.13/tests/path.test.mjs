import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const scope = vm.createContext({ window: {} });
vm.runInContext(readFileSync(new URL('../app/path.js', import.meta.url), 'utf8'), scope);
const path = scope.window.ShamPath;
function picture(center = .5) {
  const width = 96, height = 128, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const foreground = Math.pow((x / width - center) / .19, 2) + Math.pow((y / height - .48) / .28, 2) < 1;
    const i = (y * width + x) * 4;
    data[i] = foreground ? 210 : 25; data[i + 1] = foreground ? 130 : 29; data[i + 2] = foreground ? 90 : 32; data[i + 3] = 255;
  }
  return { width, height, data };
}

test('photo pixels change the selected route while repeat generation is deterministic', () => {
  const left = path.analyze(picture(.3)), right = path.analyze(picture(.7));
  const route = path.curve(left, 1);
  assert.deepEqual(path.curve(left, 1), route);
  assert.notDeepEqual(path.curve(right, 1), route);
  assert.notDeepEqual(path.curve(left, 2), route);
  assert.ok(left.cost.every(Number.isFinite));
  assert.ok(left.cost[61 * 96 + 29] > left.cost[10 * 96 + 80]);
});

test('unreadable photos and flat images still produce finite usable curves', () => {
  assert.equal(path.analyze({ width: 96, height: 128, data: [] }), null);
  for (const map of [null, path.analyze({ width: 96, height: 128, data: new Uint8ClampedArray(96 * 128 * 4) })]) {
    const lines = path.layout(map, '今天一起去散步', 720, 960, 88, 1);
    assert.equal(lines.length, 1);
    assert.ok(lines[0].path.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
    assert.ok(lines[0].path.length > 500);
  }
});

test('preview and HD export share exactly the same normalized layout and tangents', () => {
  const map = path.analyze(picture()), text = '今天带了一本书去公园';
  const small = path.layout(map, text, 720, 960, 88, 3)[0];
  const large = path.layout(map, text, 1080, 1440, 132, 3)[0];
  for (const fraction of [0, .13, .5, .87, 1]) {
    const a = path.sample(small.path, small.path.length * fraction), b = path.sample(large.path, large.path.length * fraction);
    assert.ok(Math.abs(a.x * 1.5 - b.x) < 1e-7);
    assert.ok(Math.abs(a.y * 1.5 - b.y) < 1e-7);
    assert.ok(Math.abs(a.angle - b.angle) < 1e-7);
  }
  assert.ok(Math.abs(small.size * 1.5 - large.size) < 1e-7);
});

test('eighty characters are preserved on separate curves with increasing arc positions', () => {
  const text = '今天在公园拍照带了一本书后来走到湖边看到几只水鸟'.repeat(4).slice(0, 80);
  const lines = path.layout(path.analyze(picture()), text, 720, 960, 180, 7);
  assert.equal(lines.map(line => line.items.map(item => item.char).join('')).join(''), text);
  assert.equal(lines.length, 3);
  for (const line of lines) {
    assert.ok(line.size > 15);
    assert.ok(line.start > 0);
    assert.ok(line.start + line.width < line.path.length);
    assert.ok(line.items.every((item, i) => !i || item.distance > line.items[i - 1].distance));
    assert.ok(line.path.points.every(p => p.x > 0 && p.x < 720 && p.y > 0 && p.y < 960));
  }
});
