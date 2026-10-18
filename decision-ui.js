import { OBJECTIVES, shiftClock } from './decision.js';
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const money = (n) => `¥${Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
const colors = ['#eeb298', '#cbd8a2', '#efd28b', '#a9cbb6', '#dca79e', '#ddd0a9', '#b5c894', '#d8b9a4'];

export function createDecisionUI({ getTiming, getFilters, onChange, onDeparture, onPick }) {
  const $ = (query) => document.querySelector(query);
  let snapshot = null, timer = null, beforeDemo = null;
  $('#page-student .workspace').insertAdjacentHTML('beforebegin', `
    <section class="timeshift card" id="timeshift" aria-labelledby="timeshift-title">
      <div class="ts-header"><div><p class="eyebrow">TIMESHIFT · 把时间也算进去</p><h2 id="timeshift-title">这顿饭，怎么安排更合适？</h2></div><button class="ts-play" id="ts-play">播放时间变化 <span aria-hidden="true">▷</span></button></div>
      <div class="ts-controls"><div class="ts-time-control"><label for="ts-available">这次有多少时间？ <strong><output id="ts-available-value">45</output><small> 分钟</small></strong></label><input id="ts-available" type="range" min="1" max="120" step="1" value="45"><div class="range-labels"><span>速战速决</span><span>慢慢吃</span></div></div><div class="ts-departure"><label for="ts-departure">计划出发</label><input id="ts-departure" type="time" required><p id="ts-deadline"></p></div><div class="ts-budget"><small>这顿预算</small><strong id="ts-budget"></strong><button class="text-button" id="ts-edit-budget">修改预算 ↗</button></div></div>
      <div class="ts-personal"><div><span class="ts-label">这次更看重</span><div class="ts-objectives" id="ts-objectives">${Object.entries(OBJECTIVES).map(([key, item]) => `<button data-objective="${key}" aria-pressed="false">${item.label}</button>`).join('')}</div></div><div class="ts-favorite"><label for="ts-favorite">偏爱口味</label><select id="ts-favorite"><option value="all">都喜欢</option><option value="清淡">清淡</option><option value="微辣">微辣</option><option value="香辣">香辣</option></select></div></div>
      <div class="ts-tools"><label class="check-label"><input id="ts-enabled" type="checkbox" checked>按返回时间筛选</label><details class="ts-settings"><summary>用时设置</summary><div class="ts-setting-grid">${[['walkOut', '去程步行', 0, 30], ['pickup', '默认出餐', 0, 30], ['eat', '用餐', 1, 60], ['walkBack', '返回步行', 0, 30]].map(([key, label, min, max]) => `<div><label for="ts-${key}">${label} / 分钟</label><input id="ts-${key}" data-timing="${key}" type="number" min="${min}" max="${max}" step="1"></div>`).join('')}<div><label for="ts-lookAhead">比较稍后出发</label><select id="ts-lookAhead" data-timing="lookAhead"><option value="0">只看现在</option><option value="5">未来5分钟</option><option value="15">未来15分钟</option><option value="30">未来30分钟</option></select></div></div><p>步行、用餐和默认出餐为可调设置；已含出餐的记录不重复计时。</p></details><span class="ts-data-label" id="ts-data-label"></span></div>
      <div class="ts-plans" id="ts-plans" aria-live="polite"></div><div id="ts-excluded"></div><p class="ts-status" id="ts-status" role="status"></p>
    </section>`);
  $('#draw-result').insertAdjacentHTML('afterend', '<details class="draw-probabilities"><summary id="card-probabilities-summary">查看本轮概率</summary><p>最终概率＝当前权重 ÷ 卡池总权重。系数调整权重，再统一计算概率。</p><div class="probability-list" id="card-probabilities"></div></details>');

  function stopDemo(restore = true) {
    if (!timer) return;
    clearInterval(timer); timer = null;
    if (restore && beforeDemo !== null) onChange({ available: beforeDemo }, true);
    beforeDemo = null; $('#ts-play').innerHTML = '播放时间变化 <span aria-hidden="true">▷</span>';
  }
  const change = (next) => { stopDemo(); onChange(next, false); };
  $('#ts-available').addEventListener('input', (event) => change({ available: Number(event.target.value) }));
  $('#ts-departure').addEventListener('change', (event) => { const value = event.target.value; stopDemo(); onDeparture(value); });
  $('#ts-enabled').addEventListener('change', (event) => change({ enabled: event.target.checked }));
  $('#ts-favorite').addEventListener('change', (event) => change({ favorite: event.target.value }));
  $('#ts-objectives').addEventListener('click', (event) => { const button = event.target.closest('[data-objective]'); if (button) change({ objective: button.dataset.objective }); });
  $('.ts-settings').addEventListener('change', (event) => { const key = event.target.dataset.timing; if (key) change({ [key]: Number(event.target.value) }); });
  $('#ts-edit-budget').addEventListener('click', () => { $('#meal-budget').focus(); $('#meal-budget').select(); });
  $('#ts-plans').addEventListener('click', (event) => { const button = event.target.closest('[data-ts-plan]'); if (!button) return; const plan = snapshot.plans.find((item) => item.kind === button.dataset.tsPlan); stopDemo(false); if (plan) onPick(plan); });
  $('#ts-play').addEventListener('click', () => {
    if (timer) { stopDemo(); return; }
    beforeDemo = getTiming().available;
    const steps = [60, 45, 35, 25, beforeDemo]; let index = 0;
    $('#ts-play').textContent = '停止演示 ▪'; onChange({ available: steps[index++] }, true);
    timer = setInterval(() => { if (index >= steps.length) { stopDemo(); return; } onChange({ available: steps[index++] }, true); }, 1700);
  });

  function render(result, pool) {
    snapshot = result;
    const timing = getTiming(), filters = getFilters();
    $('#ts-available').value = timing.available; $('#ts-available-value').textContent = timing.available;
    $('#ts-departure').value = shiftClock(filters.time, -timing.walkOut);
    $('#ts-deadline').textContent = result.deadline ? `${result.deadline} 前返回` : '请选择出发时间';
    $('#ts-budget').textContent = money(filters.budget);
    $('#ts-enabled').checked = timing.enabled; $('#ts-favorite').value = timing.favorite;
    document.querySelectorAll('[data-timing]').forEach((input) => { input.value = timing[input.dataset.timing]; });
    document.querySelectorAll('[data-objective]').forEach((button) => { const active = button.dataset.objective === timing.objective; button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active)); });
    $('#ts-data-label').textContent = result.current.some((item) => !item.verified) || result.plans.some((item) => !item.verified) ? '演示菜单 · 演示用时' : '采集菜价 · 用时来源见方案';
    const names = { fast: '最快吃好', cheap: '最省饭钱', balanced: '综合推荐' };
    const fast = result.plans.find((item) => item.kind === 'fast'), cheap = result.plans.find((item) => item.kind === 'cheap');
    $('#ts-plans').innerHTML = result.plans.length ? result.plans.map((item) => {
      let reason = item.kind === 'fast' ? cheap && cheap.elapsed > item.elapsed ? `比省钱方案早 ${cheap.elapsed - item.elapsed} 分钟返回` : '当前最早返回的选择' : item.kind === 'cheap' ? fast && fast.price > item.price ? `比最快方案省 ${money(fast.price - item.price)}` : '当前最低价的选择' : timing.favorite !== 'all' && timing.favorite === item.taste ? `${item.taste}合口味，${Math.round(item.occupied)} 分钟完成用餐往返` : `兼顾饭钱、用时和口味`;
      const duplicate = item.kind === 'balanced' && fast?.key === item.key ? ' · 与最快相同' : item.kind === 'balanced' && cheap?.key === item.key ? ' · 与省钱相同' : '';
      const parts = [...(item.delay ? [['出发前', item.delay, 'delay']] : []), ...['步行', item.wait.includesPickup?'等至取餐':'排队', '出餐', '用餐', '返回'].map((label, i) => [label, item.breakdown[i], `part-${i}`])].filter(([,value])=>value>0);
      return `<article class="ts-plan ${item.kind}"><div class="ts-plan-heading"><span>${names[item.kind]}</span><small>${item.delay ? `${item.delay} 分钟后出发` : '现在出发'}</small></div><h3>${escape(item.emoji || '🍚')} ${escape(item.name)}</h3><p class="ts-window">${escape(item.windowName)}</p><div class="ts-plan-numbers"><strong>${item.elapsed}<small> 分钟</small></strong><span>${money(item.price)}</span></div><p class="ts-return">${item.departure} → ${item.returnAt} 返回${timing.enabled ? ` · 余 ${item.slack} 分钟` : ''}</p><div class="ts-timeline" aria-hidden="true">${parts.map(([label, value, className]) => `<span class="${className}" style="flex:${value}" title="${label}${value}分钟"></span>`).join('')}</div><p class="ts-breakdown">${parts.map(([label, value]) => `${label}${value}`).join(' · ')}</p><p class="ts-source">等待：${escape(item.wait.sourceLabel)}</p><p class="ts-reason">${reason}${duplicate}</p><button class="text-button" data-ts-plan="${item.kind}">采用${names[item.kind]}方案 →</button></article>`;
    }).join('') : `<div class="ts-empty"><strong>${result.minimum ? `最短需要 ${result.minimum} 分钟` : '暂时没有合适方案'}</strong><p>${result.minimum ? `当前有 ${timing.available} 分钟，增加用时或调整出发时刻。` : '试试换个时刻、窗口或筛选条件。'}</p></div>`;
    $('#ts-excluded').innerHTML = result.excluded.length ? `<details class="ts-excluded"><summary>${result.excluded.length} 道菜超时，已移出卡池</summary><div>${result.excluded.map((item) => `<p><span>${escape(item.name)}</span><strong>${item.elapsed} 分钟 <small>超出 ${-item.slack} 分钟</small></strong></p>`).join('')}</div></details>` : '';
    $('#ts-status').textContent = timer ? `时间变化演示 · 可用 ${timing.available} 分钟 · 当前 ${pool.length} 道入池` : `${OBJECTIVES[timing.objective].label} · 当前 ${pool.length} 道入池${timing.favorite !== 'all' ? ` · 偏爱${timing.favorite}` : ''}`;
    $('#card-probabilities-summary').textContent = `查看本轮 ${pool.length} 道菜的概率`;
    $('#card-probabilities').innerHTML = pool.map(item => `<div><span>${escape(item.name)}<small>${item.personalRating ? `我评 ${item.personalRating} 星 · 权重 ×${item.preferenceFactor}` : '未评价 · 权重 ×1'}</small></span><strong>${item.percent}%</strong></div>`).join('');
  }
  return { render, stopDemo };
}
