// Shared drawing for the iPad mockups: the drum colours, the web app's kit drawing (src/ui/KitView.tsx) adapted to
// touch, and the note highway in both directions. Everything is returned as inline SVG strings.
const INK = '#141414', POP = '#FFE14D', FONT = '"Arial Black","Archivo Black","Inter Display",Impact,sans-serif';
// One colour per drum: the web kit's colours, moved off green / orange / red, which mean on it / early-late / missed.
const DC = { hihat: '#FFE14D', crash: '#FF5FA2', ride: '#7FD3FF', snare: '#2DE1C2', tom1: '#2F6FE4', tom2: '#8C5CFF', floor: '#9C6B4A', kick: '#FFFFFF' };
const RES = { ok: '#4BE08A', off: '#FF9F1C', miss: '#FF5A4F' }; // the result colours, bright for the black panel
const NAME = { hihat: 'Hi-hat', crash: 'Crash', ride: 'Ride', snare: 'Snare', tom1: 'Tom 1', tom2: 'Tom 2', floor: 'Floor tom', kick: 'Kick' };
const STICK = { hihat: 'R', snare: 'L', kick: 'K' };

/** The money beat: hi-hat 8ths, kick on 1 and 3, snare on 2 and 4; t = eighths from the first note. */
function moneyBeat(bars) {
  const n = [];
  for (let b = 0; b < bars; b++) for (let e = 0; e < 8; e++) {
    n.push({ lane: 'hihat', t: b * 8 + e });
    if (e === 0 || e === 4) n.push({ lane: 'kick', t: b * 8 + e });
    if (e === 2 || e === 6) n.push({ lane: 'snare', t: b * 8 + e });
  }
  return n;
}

function kitDefs(id = 'k') {
  return `<defs>
    <filter id="${id}sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="6" dy="6" stdDeviation="0" flood-color="#FF5FA2" flood-opacity="1"/></filter>
    <pattern id="${id}dots" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="${POP}"/><circle cx="6" cy="6" r="2.4" fill="${INK}"/></pattern>
    <pattern id="${id}bg" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="${INK}"/><circle cx="7" cy="7" r="1.5" fill="#ffffff14"/></pattern>
  </defs>`;
}

/**
 * One pad in the web kit's style. p = { id, x, y, r, w?, h? (kick / pedal as a rect when w is set) };
 * st = { dim, done, now, hit (a result colour ring), word (comic burst), label (override), labelSize }.
 */
function pad(p, st = {}, id = 'k') {
  const c = DC[p.id] ?? '#ccc', dim = st.dim ? ' opacity=".42"' : '';
  const fill = st.done ? '#1E9E5A' : st.now ? POP : c;
  let s = `<g${dim} filter="url(#${id}sh)">`;
  if (p.w) { // the kick or a pedal, as a big touch target
    s += `<rect x="${p.x - p.w / 2}" y="${p.y - p.h / 2}" width="${p.w}" height="${p.h}" rx="14" fill="${st.done ? '#1E9E5A' : p.id === 'kick' ? `url(#${id}dots)` : '#2F6FE4'}" stroke="${INK}" stroke-width="4"/>`;
  } else if (['hihat', 'crash', 'ride'].includes(p.id)) { // a cymbal: rings and a bell
    s += `<circle cx="${p.x}" cy="${p.y}" r="${p.r}" fill="${fill}" stroke="${INK}" stroke-width="4"/>`;
    for (let k = 1; k <= 4; k++) s += `<circle cx="${p.x}" cy="${p.y}" r="${p.r * (0.3 + k * 0.15)}" fill="none" stroke="${INK}" stroke-width="1.5" opacity=".3"/>`;
    s += `<circle cx="${p.x}" cy="${p.y}" r="${p.r * 0.2}" fill="#FFF6CC" stroke="${INK}" stroke-width="3"/>`;
  } else { // a drum: coloured shell, white lugs, white head
    s += `<circle cx="${p.x}" cy="${p.y}" r="${p.r}" fill="${fill}" stroke="${INK}" stroke-width="4"/>`;
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; s += `<circle cx="${p.x + Math.cos(a) * (p.r - 4)}" cy="${p.y + Math.sin(a) * (p.r - 4)}" r="3.4" fill="#fff" stroke="${INK}" stroke-width="1.5"/>`; }
    s += `<circle cx="${p.x}" cy="${p.y}" r="${p.r * 0.84}" fill="${st.now ? '#FFF6CC' : '#fff'}" stroke="${INK}" stroke-width="3"/>`;
  }
  s += `</g>`;
  if (st.hit) s += p.w
    ? `<rect x="${p.x - p.w / 2 - 8}" y="${p.y - p.h / 2 - 8}" width="${p.w + 16}" height="${p.h + 16}" rx="18" fill="none" stroke="${st.hit}" stroke-width="6"/>`
    : `<circle cx="${p.x}" cy="${p.y}" r="${p.r + 9}" fill="none" stroke="${st.hit}" stroke-width="6"/>`;
  const label = st.label ?? (st.done ? '✓ ' : '') + NAME[p.id];
  const fs = st.labelSize ?? Math.max(12, Math.min(22, (p.r ?? p.h / 2) * 0.32));
  const ly = p.w ? p.y + fs * 0.36 : ['hihat', 'crash', 'ride'].includes(p.id) ? p.y + (p.r * 0.2) + fs + 2 : p.y + fs * 0.36;
  s += `<text x="${p.x}" y="${ly}" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="${fs}" fill="${INK}" stroke="#fff" stroke-width="${p.w ? 5 : 4}" paint-order="stroke"${dim}>${label}</text>`;
  if (st.word) s += `<text x="${p.x + (p.r ?? 40) * .35}" y="${p.y - (p.r ?? p.h / 2) * .78}" text-anchor="middle" transform="rotate(-8 ${p.x} ${p.y})" font-family="${FONT}" font-weight="900" font-size="${st.wordSize ?? 24}" fill="${['hihat', 'crash', 'ride'].includes(p.id) ? '#FF5FA2' : POP}" stroke="${INK}" stroke-width="5" paint-order="stroke">${st.word}</text>`;
  return s;
}

/** A whole kit: pads = [[p, st], ...]. */
function kit(W, H, pads, id = 'k', bg = true) {
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">${kitDefs(id)}`;
  if (bg) s += `<rect width="${W}" height="${H}" fill="url(#${id}bg)"/>`;
  for (const [p, st] of pads) s += pad(p, st, id);
  return s + `</svg>`;
}

/** A gem on the highway: a drum-coloured disc (the kick a block) with an ink outline; judged notes take the result colour. */
function gem(lane, cx, cy, size, judged, letter) {
  const fill = judged === 'ok' ? RES.ok : judged === 'off' ? RES.off : judged === 'miss' ? 'none' : DC[lane];
  const stroke = judged === 'miss' ? `stroke="${RES.miss}" stroke-width="3.5" stroke-dasharray="5 4"` : `stroke="${INK}" stroke-width="3"`;
  let s = lane === 'kick'
    ? `<rect x="${cx - size * 1.15}" y="${cy - size * .85}" width="${size * 2.3}" height="${size * 1.7}" rx="6" fill="${fill}" ${stroke}/>`
    : `<circle cx="${cx}" cy="${cy}" r="${size}" fill="${fill}" ${stroke}/>`;
  const txt = judged === 'ok' ? '✓' : judged === 'off' ? '›' : judged === 'miss' ? '✕' : letter;
  if (txt) s += `<text x="${cx}" y="${cy + size * .36}" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="${size}" fill="${judged === 'miss' ? RES.miss : INK}">${txt}</text>`;
  return s;
}

/**
 * The left-to-right highway on the black panel: lanes stacked like notation (cymbals on top, kick below), the now line,
 * the count under it with the beat ball. judged: { 'hihat17': 'off', ... } marks notes behind the line; flash: lanes that just hit.
 */
function highway({ W, H, pos, px, nowX, judged, flash = [], lanes = ['hihat', 'snare', 'kick'], label = 18, countIn = 'COUNT-IN', size = 18, lateText = '+48 ms', top = 46, countH = 52 }) {
  const left = 128, laneH = (H - top - countH - 22) / lanes.length;
  const x = t => nowX + (t - pos) * px, y = i => top + laneH * i + laneH / 2;
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}"><defs><clipPath id="hwc"><rect x="${left}" y="0" width="${W - left}" height="${H}"/></clipPath>
    <linearGradient id="hwf" x1="0" x2="1"><stop offset="0" stop-color="${INK}" stop-opacity=".9"/><stop offset="1" stop-color="${INK}" stop-opacity="0"/></linearGradient></defs>`;
  lanes.forEach((l, i) => {
    s += `<rect x="${left}" y="${y(i) - laneH / 2 + 3}" width="${W - left - 12}" height="${laneH - 6}" fill="${i % 2 ? '#ffffff0d' : '#ffffff17'}"/>`;
    s += `<circle cx="22" cy="${y(i)}" r="9" fill="${DC[l]}" stroke="#fff" stroke-width="2"/><text x="38" y="${y(i) + label * .36}" font-size="${label}" font-weight="900" fill="#fff">${NAME[l]}</text>`;
  });
  s += `<g clip-path="url(#hwc)">`;
  for (let t = Math.floor(pos - 10); t < pos + 30; t++) {
    if (t < -8 || t % 2) continue;
    const bar = ((t % 8) + 8) % 8 === 0;
    s += `<line x1="${x(t)}" x2="${x(t)}" y1="${top - 4}" y2="${top + laneH * lanes.length}" stroke="${bar ? '#ffffff88' : '#ffffff22'}" stroke-width="${bar ? 3 : 1.5}"/>`;
    if (bar) s += `<text x="${x(t) + 8}" y="${top - 10}" font-size="13" font-weight="900" fill="${POP}">${t >= 0 ? 'BAR ' + (t / 8 + 1) : countIn}</text>`;
  }
  for (const n of moneyBeat(4)) {
    const cx = x(n.t); if (cx < left - 40 || cx > W + 40 || !lanes.includes(n.lane)) continue;
    const past = judged && n.t < pos + 0.01, j = past ? (judged[n.lane + n.t] ?? 'ok') : null;
    s += gem(n.lane, cx, y(lanes.indexOf(n.lane)), size, j, STICK[n.lane]);
    if (j === 'off') s += `<text x="${cx}" y="${y(lanes.indexOf(n.lane)) + size + 18}" text-anchor="middle" font-size="12" font-weight="900" fill="${RES.off}">${lateText}</text>`;
  }
  for (const l of flash) { const cy = y(lanes.indexOf(l)); s += `<circle cx="${nowX}" cy="${cy}" r="${size + 12}" fill="none" stroke="${RES.ok}" stroke-width="5"/>`; }
  s += `</g><rect x="${left}" y="0" width="70" height="${H}" fill="url(#hwf)"/>`;
  s += `<rect x="${nowX - 3}" y="${top - 14}" width="6" height="${laneH * lanes.length + 18}" fill="${POP}" stroke="${INK}" stroke-width="1.5"/>`;
  // the count, with the beat ball landing on the number
  const cy = H - countH / 2 - 6;
  s += `<rect x="${left}" y="${cy - countH / 2 + 2}" width="${W - left - 12}" height="${countH - 4}" fill="#ffffff12"/>`;
  s += `<text x="22" y="${cy + 6}" font-size="14" font-weight="900" fill="#ffffffaa">COUNT</text><g clip-path="url(#hwc)">`;
  for (let t = Math.floor(pos - 8); t < pos + 28; t++) {
    const e = ((t % 8) + 8) % 8, isNum = e % 2 === 0; if (t < 0 && !isNum) continue;
    const cur = Math.abs(t - pos) < .01;
    s += `<text x="${x(t)}" y="${cy + 9}" text-anchor="middle" font-size="${cur ? 32 : 24}" font-weight="900" fill="${cur ? POP : t < 0 ? '#ffffff77' : isNum ? '#fff' : '#8FB4FF'}" opacity="${t < pos - .01 ? .4 : 1}">${isNum ? e / 2 + 1 : '&amp;'}</text>`;
  }
  s += `</g><circle cx="${nowX}" cy="${cy - countH / 2 - 4}" r="11" fill="${POP}" stroke="${INK}" stroke-width="3"/>`;
  return s + `</svg>`;
}

/** The web's falling highway: lanes left to right in kit order, notes fall to the hit line near the bottom. */
function fallingHighway({ W, H, pos, px, judged = {}, flash = [], lanes = ['hihat', 'crash', 'snare', 'tom1', 'tom2', 'floor', 'ride', 'kick'], active = ['hihat', 'snare', 'kick'] }) {
  const left = 112, laneW = (W - left - 12) / lanes.length, hitY = H - 66, lx = i => left + laneW * i + laneW / 2, y = t => hitY - (t - pos) * px;
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}"><defs><clipPath id="fc"><rect x="${left}" y="0" width="${W - left}" height="${hitY + 30}"/></clipPath></defs>`;
  lanes.forEach((l, i) => {
    const on = active.includes(l);
    s += `<rect x="${left + laneW * i + 2}" y="8" width="${laneW - 4}" height="${hitY + 22}" fill="${on ? '#ffffff17' : '#ffffff06'}"/>`;
    s += `<circle cx="${lx(i) - (NAME[l].length * 4.6)}" cy="${H - 26}" r="7" fill="${DC[l]}" stroke="#fff" stroke-width="2" opacity="${on ? 1 : .35}"/>`;
    s += `<text x="${lx(i) + 6}" y="${H - 21}" text-anchor="middle" font-size="14" font-weight="900" fill="#fff" opacity="${on ? 1 : .35}">${NAME[l]}</text>`;
  });
  s += `<g clip-path="url(#fc)">`;
  let count = ''; // the count runs down the left, outside the lanes
  for (let t = Math.floor(pos - 2); t < pos + 12; t++) {
    if (t < 0) continue;
    const e = t % 8, bar = e === 0;
    if (e % 2 === 0) s += `<line x1="${left}" x2="${W - 12}" y1="${y(t)}" y2="${y(t)}" stroke="${bar ? '#ffffff88' : '#ffffff22'}" stroke-width="${bar ? 3 : 1.5}"/>`;
    const cur = Math.abs(t - pos) < .01;
    if (y(t) < 50 || y(t) > hitY + 20) continue;
    count += `<text x="${left - 22}" y="${y(t) + 8}" text-anchor="end" font-size="${cur ? 30 : 21}" font-weight="900" fill="${cur ? POP : e % 2 ? '#8FB4FF' : '#fff'}" opacity="${t < pos - .01 ? .4 : 1}">${e % 2 ? '&amp;' : e / 2 + 1}</text>`;
    if (bar) count += `<text x="14" y="${y(t) + 6}" font-size="12" font-weight="900" fill="${POP}">BAR ${t / 8 + 1}</text>`;
  }
  for (const n of moneyBeat(4)) {
    const cy = y(n.t); if (cy < -30 || cy > hitY + 40) continue;
    const past = n.t < pos + 0.01, j = past ? (judged[n.lane + n.t] ?? 'ok') : null;
    s += gem(n.lane, lx(lanes.indexOf(n.lane)), cy, 19, j, STICK[n.lane]);
  }
  for (const l of flash) s += `<circle cx="${lx(lanes.indexOf(l))}" cy="${hitY}" r="31" fill="none" stroke="${RES.ok}" stroke-width="5"/>`;
  s += `</g>${count}<rect x="${left}" y="${hitY - 3}" width="${W - left - 12}" height="6" fill="${POP}" stroke="${INK}" stroke-width="1.5"/>`;
  s += `<circle cx="${left - 10}" cy="${hitY - 22}" r="8" fill="${POP}" stroke="${INK}" stroke-width="3"/>`;
  return s + `</svg>`;
}

// The pages call these from inline scripts.
Object.assign(window, { kit, highway, fallingHighway });
