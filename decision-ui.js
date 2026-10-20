import { dishVisual } from './dish-media.js';
import { OBJECTIVES, shiftClock } from './decision.js';
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const money = (n) => `¥${Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
const colors = ['#eeb298', '#cbd8a2', '#efd28b', '#a9cbb6', '#dca79e', '#ddd0a9', '#b5c894', '#d8b9a4'];

export function createDecisionUI({ getTiming, getFilters, onChange, onDeparture, onNow, onPick }) {
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
  $('#ts-departure').insertAdjacentHTML('afterend', '<button class="text-button ts-now" id="ts-now" type="button" aria-pressed="false">现在出发 ↗</button>');
  $('#ts-plans').insertAdjacentHTML('beforebegin', '<p id="ts-comparison" class="ts-comparison" role="status"></p>');
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
  $('#ts-now').addEventListener('click', () => { stopDemo(); onNow(); });
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
    $('#ts-now').textContent = timing.liveStart ? '使用计划时间' : '现在出发 ↗';
    $('#ts-now').setAttribute('aria-pressed', String(timing.liveStart));
    $('#ts-departure').readOnly = timing.liveStart;
    $('#ts-data-label').textContent = timing.liveStart ? '当前时间 · 每30秒重算' : '计划时间 · 按适用报数和历史记录重算';
    $('#ts-comparison').textContent = result.plans.length ? `预算 ${money(filters.budget)} · ${timing.enabled ? `最多 ${timing.available} 分钟` : '不限总用时'} · ${result.choiceCount} 道可选，列出 ${result.plans.length} 道不同菜品${result.sameWinner ? '；首选同时最快、最省钱' : ''}` : '';
    const fast = result.plans.find((item) => item.kind === 'fast'), cheap = result.plans.find((item) => item.kind === 'cheap');
    $('#ts-plans').innerHTML = result.plans.length ? result.plans.map((item) => {
      const timeDifference = fast ? item.elapsed - fast.elapsed : 0;
      const costDifference = cheap ? item.price - cheap.price : 0;
      let reason = item.basis === 'fastest'
        ? result.sameWinner ? '当前最低价，也能最早返回。' : result.fastestCount > 1 ? `最快用时 ${item.elapsed} 分钟，${result.fastestCount} 道菜并列；这张提供另一道选择。` : `比省钱方案早 ${Math.max(0, (cheap?.elapsed ?? item.elapsed) - item.elapsed)} 分钟返回。`
        : item.basis === 'cheapest' ? `当前最低价，比赶时间方案省 ${money(Math.max(0, fast.price - item.price))}。`
        : item.basis === 'cheap-alternative' ? `换一道菜，多花 ${money(item.price - result.cheapestPrice)}${timeDifference > 0 ? `，多用 ${timeDifference} 分钟` : '，用时相同'}。`
        : `在另外的菜中比较时间、价格和偏好${item.personalRating ? `；你曾评 ${item.personalRating} 星` : timing.favorite !== 'all' && timing.favorite === item.taste ? `；符合${item.taste}口味` : ''}。`;
      const comparison = item.kind === 'balanced' && cheap ? `较省钱方案${Math.abs(costDifference) < 0.001 ? '价格相同' : costDifference > 0 ? `多 ${money(costDifference)}` : `省 ${money(-costDifference)}`}，${timeDifference === 0 ? '与赶时间方案同样快' : `比赶时间方案多 ${timeDifference} 分钟`}` : '';
      const parts = [...(item.delay ? [['出发前', item.delay, 'delay']] : []), ...['步行', item.wait.includesPickup?'等至取餐':'排队', '出餐', '用餐', '返回'].map((label, i) => [label, item.breakdown[i], `part-${i}`])].filter(([,value])=>value>0);
      return `<article class="ts-plan ${item.kind}"><div class="ts-plan-heading"><span>${escape(item.title)}</span><small>${item.delay ? `${item.delay} 分钟后出发` : '按选定时刻出发'}</small></div><h3>${dishVisual(item)} ${escape(item.name)}</h3><p class="ts-window">${escape(item.windowName)}</p><div class="ts-plan-numbers"><strong>${item.elapsed}<small> 分钟</small></strong><span>${money(item.price)}</span></div><p class="ts-return">${item.departure} → ${item.returnAt} 返回${timing.enabled ? ` · 余 ${item.slack} 分钟` : ''} · 预算余 ${money(filters.budget - item.price)}</p><div class="ts-timeline" aria-hidden="true">${parts.map(([label, value, className]) => `<span class="${className}" style="flex:${value}" title="${label}${value}分钟"></span>`).join('')}</div><p class="ts-breakdown">${parts.map(([label, value]) => `${label}${value}`).join(' · ')}</p><p class="ts-source">等待：${escape(item.wait.sourceLabel)}${item.wait.updatedAt ? ` · ${new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(item.wait.updatedAt))}` : ''}</p><p class="ts-reason">${reason}${comparison ? `<small>${comparison}</small>` : ''}</p><button class="text-button" data-ts-plan="${item.kind}">就选${escape(item.title)} →</button></article>`;
    }).join('') : `<div class="ts-empty"><strong>${result.minimum ? `最短需要 ${result.minimum} 分钟` : '暂时没有合适方案'}</strong><p>${result.minimum ? `当前有 ${timing.available} 分钟，增加用时或调整出发时刻。` : '试试换个时刻、窗口或筛选条件。'}</p></div>`;
    $('#ts-excluded').innerHTML = result.excluded.length ? `<details class="ts-excluded"><summary>${result.excluded.length} 道菜超时，已移出卡池</summary><div>${result.excluded.map((item) => `<p><span>${escape(item.name)}</span><strong>${item.elapsed} 分钟 <small>超出 ${-item.slack} 分钟</small></strong></p>`).join('')}</div></details>` : '';
    $('#ts-status').textContent = timer ? `时间变化演示 · 可用 ${timing.available} 分钟 · 当前 ${pool.length} 道入池` : `${OBJECTIVES[timing.objective].label} · 当前 ${pool.length} 道入池${timing.favorite !== 'all' ? ` · 偏爱${timing.favorite}` : ''}`;
    $('#card-probabilities-summary').textContent = `查看本轮 ${pool.length} 道菜的概率`;
    $('#card-probabilities').innerHTML = pool.map(item => `<div><span>${escape(item.name)}<small>${item.personalRating ? `我评 ${item.personalRating} 星 · 权重 ×${item.preferenceFactor}` : '未评价 · 权重 ×1'}</small></span><strong>${item.percent}%</strong></div>`).join('');
  }
  return { render, stopDemo };
}
