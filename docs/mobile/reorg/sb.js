// Draws the proposed 4-item sidebar (expanded) or its icon rail (collapsed): <div data-sb="journey|practice|you|setup" data-rail>
// Builds DOM nodes (no HTML strings), as the repo's lint rule asks.
const ITEMS = [['journey', '🗺️', 'Journey'], ['practice', '🎯', 'Practice'], ['you', '📈', 'You'], ['setup', '⚙️', 'Setup']];

function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'style') node.style.cssText = v;
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

for (const el of document.querySelectorAll('[data-sb]')) {
  const cur = el.dataset.sb;
  if (el.hasAttribute('data-rail')) {
    el.className = 'rail';
    el.replaceChildren(
      h('span', { class: 'logo' }),
      ...ITEMS.map(([k, e]) => h('i', { class: k === cur ? 'on' : '' }, e)),
      h('span', { class: 'exp', title: 'Show the sidebar (key \\)' }, '»'),
      h('span', { class: 'kd' }, h('span', { class: 'dot' })),
    );
  } else {
    el.className = 'sb sb4';
    el.replaceChildren(
      h('div', { class: 'brand' }, h('span', { class: 'logo' }), 'Drum Coach'),
      ...ITEMS.map(([k, e, l]) => h('a', { class: `sbItem ${k === cur ? 'on' : ''}` }, h('span', { class: 'em' }, e), l)),
      h('div', { class: 'sbCollapse' }, h('b', {}, '«'), 'Hide sidebar (key \\)'),
      h('div', { class: 'kitOne' }, h('span', { class: 'dot' }), h('b', {}, 'e-Drum'),
        h('span', { style: 'margin-left:auto;color:#4A4A4A;font-size:12.5px' }, 'ready')),
    );
  }
}
