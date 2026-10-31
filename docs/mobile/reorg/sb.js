// Draws the proposed 4-item sidebar (expanded) or its icon rail (collapsed): <div data-sb="journey|practice|you|setup" data-rail>
const ITEMS = [['journey', '🗺️', 'Journey'], ['practice', '🎯', 'Practice'], ['you', '📈', 'You'], ['setup', '⚙️', 'Setup']];
for (const el of document.querySelectorAll('[data-sb]')) {
  const cur = el.dataset.sb;
  if (el.hasAttribute('data-rail')) {
    el.className = 'rail';
    el.innerHTML = '<span class="logo"></span>' + ITEMS.map(([k, e]) => `<i class="${k === cur ? 'on' : ''}">${e}</i>`).join('') +
      '<span class="exp" title="Show the sidebar (key \\)">»</span><span class="kd"><span class="dot"></span></span>';
  } else {
    el.className = 'sb sb4';
    el.innerHTML = '<div class="brand"><span class="logo"></span>Drum Coach</div>' +
      ITEMS.map(([k, e, l]) => `<a class="sbItem ${k === cur ? 'on' : ''}"><span class="em">${e}</span>${l}</a>`).join('') +
      '<div class="sbCollapse"><b>«</b>Hide sidebar (key \\)</div>' +
      '<div class="kitOne"><span class="dot"></span><b>e-Drum</b><span style="margin-left:auto;color:#4A4A4A;font-size:12.5px">ready</span></div>';
  }
}
