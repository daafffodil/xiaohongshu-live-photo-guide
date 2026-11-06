/* A small, offline H.264 / MP4 encoder using baseline I_PCM macroblocks.
   No network, workers, WebAssembly, or browser-specific video encoder needed. */
(function (root) {
  'use strict';
  const bytes = (...values) => new Uint8Array(values);
  function concat(parts) { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; parts.forEach(p => { out.set(p, at); at += p.length; }); return out; }
  const u16 = n => bytes(n >>> 8, n & 255);
  const u32 = n => bytes(n >>> 24, n >>> 16 & 255, n >>> 8 & 255, n & 255);
  const ascii = text => new Uint8Array(Array.from(text, c => c.charCodeAt(0)));
  const zero = n => new Uint8Array(n);
  const box = (type, ...parts) => { const body = concat(parts); return concat([u32(body.length + 8), ascii(type), body]); };
  const full = (type, version, flags, ...parts) => box(type, bytes(version, flags >>> 16, flags >>> 8 & 255, flags & 255), ...parts);
  const matrix = concat([u32(65536),u32(0),u32(0),u32(0),u32(65536),u32(0),u32(0),u32(0),u32(0x40000000)]);
  class Bits {
    constructor(capacity) { this.out = new Uint8Array(capacity); this.bit = 0; }
    write(value, count) { for (let k = count - 1; k >= 0; k--) { if ((value >>> k) & 1) this.out[this.bit >>> 3] |= 1 << (7 - (this.bit & 7)); this.bit++; } }
    ue(value) { value++; const n = Math.floor(Math.log2(value)); this.write(0, n); this.write(value, n + 1); }
    se(value) { this.ue(value <= 0 ? -2 * value : 2 * value - 1); }
    align() { this.bit = (this.bit + 7) & ~7; }
    byte(value) { this.out[this.bit >>> 3] = value; this.bit += 8; }
    finish() { this.write(1, 1); this.align(); return this.out.slice(0, this.bit >>> 3); }
  }
  function nal(header, rbsp) {
    const out = new Uint8Array(rbsp.length * 1.5 + 1); let at = 1, zeros = 0; out[0] = header;
    for (const value of rbsp) { if (zeros >= 2 && value <= 3) { out[at++] = 3; zeros = 0; } out[at++] = value; zeros = value === 0 ? zeros + 1 : 0; }
    return out.slice(0, at);
  }
  function parameterSets(width, height) {
    const codedWidth = Math.ceil(width / 16) * 16, codedHeight = Math.ceil(height / 16) * 16;
    const level = codedWidth * codedHeight / 256 > 3600 ? 40 : 31;
    const crop = codedWidth !== width || codedHeight !== height;
    const s = new Bits(128); s.write(66, 8); s.write(0xc0, 8); s.write(level, 8); s.ue(0); s.ue(0); s.ue(2); s.ue(1); s.write(0, 1);
    s.ue(codedWidth / 16 - 1); s.ue(codedHeight / 16 - 1); s.write(1, 1); s.write(1, 1); s.write(crop ? 1 : 0, 1);
    if (crop) { s.ue(0); s.ue((codedWidth - width) / 2); s.ue(0); s.ue((codedHeight - height) / 2); }
    s.write(0, 1);
    const p = new Bits(128); p.ue(0); p.ue(0); p.write(0, 1); p.write(0, 1); p.ue(0); p.ue(0); p.ue(0); p.write(0, 1); p.write(0, 2); p.se(0); p.se(0); p.se(0); p.write(1, 1); p.write(0, 1); p.write(0, 1);
    return { sps: nal(0x67, s.finish()), pps: nal(0x68, p.finish()), level };
  }
  function padFrame(rgba, width, height) {
    if (!(width > 0 && height > 0 && width % 2 === 0 && height % 2 === 0)) throw new Error('Video dimensions must be positive even integers');
    const codedWidth = Math.ceil(width / 16) * 16, codedHeight = Math.ceil(height / 16) * 16;
    if (codedWidth === width && codedHeight === height) return rgba;
    const frame = new Uint8Array(codedWidth * codedHeight * 4);
    for (let y = 0; y < codedHeight; y++) {
      const source = Math.min(y, height - 1) * width * 4, dest = y * codedWidth * 4;
      frame.set(rgba.subarray(source, source + width * 4), dest);
      for (let x = width; x < codedWidth; x++) frame.set(rgba.subarray(source + (width - 1) * 4, source + width * 4), dest + x * 4);
    }
    return frame;
  }
  function encodeAlignedFrame(rgba, width, height, id, previous) {
    const b = new Bits(width * height * 2 + 4096);
    const predictive = !!previous;
    b.ue(0); b.ue(predictive ? 0 : 2); b.ue(0); b.write(predictive ? id % 16 : 0, 4);
    if (predictive) { b.write(0, 1); b.write(0, 1); b.write(0, 1); }
    else { b.ue(0); b.write(0, 1); b.write(0, 1); }
    b.se(0); b.ue(1);
    const clamp = n => Math.max(0, Math.min(255, Math.round(n)));
    let skipped = 0;
    for (let my = 0; my < height; my += 16) for (let mx = 0; mx < width; mx += 16) {
      let unchanged = predictive;
      if (predictive) {
        for (let y = 0; y < 16 && unchanged; y++) for (let x = 0; x < 16; x++) {
          const at = ((my + y) * width + mx + x) * 4;
          if (rgba[at] !== previous[at] || rgba[at + 1] !== previous[at + 1] || rgba[at + 2] !== previous[at + 2]) { unchanged = false; break; }
        }
      }
      if (unchanged) { skipped++; continue; }
      if (predictive) { b.ue(skipped); skipped = 0; }
      b.ue(predictive ? 30 : 25); b.align();
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const i = ((my + y) * width + mx + x) * 4; b.byte(clamp(16 + .257 * rgba[i] + .504 * rgba[i + 1] + .098 * rgba[i + 2])); }
      for (let channel = 0; channel < 2; channel++) for (let y = 0; y < 16; y += 2) for (let x = 0; x < 16; x += 2) {
        let r = 0, g = 0, blue = 0;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const i = ((my + y + dy) * width + mx + x + dx) * 4; r += rgba[i]; g += rgba[i + 1]; blue += rgba[i + 2]; }
        r /= 4; g /= 4; blue /= 4;
        b.byte(clamp(channel === 0 ? 128 - .148 * r - .291 * g + .439 * blue : 128 + .439 * r - .368 * g - .071 * blue));
      }
    }
    if (skipped) b.ue(skipped);
    return nal(predictive ? 0x41 : 0x65, b.finish());
  }
  function encodeFrame(rgba, width, height, id, previous) {
    return encodeAlignedFrame(padFrame(rgba, width, height), Math.ceil(width / 16) * 16, Math.ceil(height / 16) * 16, id, previous ? padFrame(previous, width, height) : null);
  }
  function mux(samples, width, height, fps, predictive) {
    const { sps, pps, level } = parameterSets(width, height), count = samples.length, duration = count * 1000 / fps;
    const ftyp = box('ftyp', ascii('isom'), u32(512), ascii('isomiso2avc1mp41'));
    const mdat = box('mdat', ...samples.map(s => concat([u32(s.length), s])));
    const avcC = box('avcC', bytes(1, 66, 0xc0, level, 0xff, 0xe1), u16(sps.length), sps, bytes(1), u16(pps.length), pps);
    const avc1 = box('avc1', zero(6), u16(1), zero(16), u16(width), u16(height), u32(0x480000), u32(0x480000), zero(4), u16(1), zero(32), u16(24), u16(0xffff), avcC);
    const sync = predictive ? full('stss',0,0,u32(1),u32(1)) : new Uint8Array(0);
    const stbl = box('stbl', full('stsd',0,0,u32(1),avc1), full('stts',0,0,u32(1),u32(count),u32(1000)), full('stsc',0,0,u32(1),u32(1),u32(count),u32(1)), full('stsz',0,0,u32(0),u32(count),...samples.map(s => u32(s.length+4))), full('stco',0,0,u32(1),u32(ftyp.length+8)), sync);
    const dinf = box('dinf', full('dref',0,0,u32(1),full('url ',0,1)));
    const minf = box('minf', full('vmhd',0,1,zero(8)), dinf, stbl);
    const mdia = box('mdia', full('mdhd',0,0,zero(8),u32(fps*1000),u32(count*1000),u16(0x55c4),u16(0)), full('hdlr',0,0,u32(0),ascii('vide'),zero(12),ascii('shamsham\0')), minf);
    const tkhd = full('tkhd',0,7,zero(8),u32(1),u32(0),u32(duration),zero(8),u16(0),u16(0),u16(0),u16(0),matrix,u32(width*65536),u32(height*65536));
    const mvhd = full('mvhd',0,0,zero(8),u32(1000),u32(duration),u32(65536),u16(256),zero(10),matrix,zero(24),u32(2));
    return concat([ftyp, mdat, box('moov', mvhd, box('trak', tkhd, mdia))]);
  }
  function createEncoder(width, height) {
    let previous = null, index = 0;
    return { encode(rgba) { const frame = padFrame(rgba, width, height); const sample = encodeAlignedFrame(frame, Math.ceil(width / 16) * 16, Math.ceil(height / 16) * 16, index++, previous); previous = new Uint8Array(frame); return sample; } };
  }
  root.ShamMp4 = { encodeFrame, mux, createEncoder };
})(typeof window !== 'undefined' ? window : globalThis);
