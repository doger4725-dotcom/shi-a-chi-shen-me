import { dishVisual } from './dish-media.js';
import { CANTEENS, DISHES, PERIODS, estimateWait, getCandidates, monthlyBudget, budgetHint, waitHint } from './model.js';
import { menuDishFromInput, historySampleFromInput } from './collection.js';
import { createCommunity } from './community.js';
import { createNutrition } from './nutrition-ui.js';
import { normalizeTiming, decisionOptions, weightedPool, chooseWeighted, shiftClock, OBJECTIVES } from './decision.js';
import { personalizeCandidates, validRating, ratingOutcome } from './preferences.js';
import { createPreferencesUI } from './preferences-ui.js';
import { createDecisionUI } from './decision-ui.js';
import { createSurvey } from './survey.js';
import { CAMPUS_MENU, CAMPUS_OBSERVATIONS, CAMPUS_EXTRAS, CAMPUS_PENDING } from './canteen-data.js';

// 页面只负责收集输入和显示结果；筛选、排队与预算公式都在 model.js。
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const money = (value) => '¥' + Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const STORAGE_KEY = 'chi-shen-me-v1';
const defaultTimes = { breakfast: '07:50', lunch: '11:30', dinner: '18:10' };
const dateLabel = (date, options = {}) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', ...options }).format(new Date(date));
const monthKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).format(new Date());
let storageAvailable = true;
let saved;
try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { saved = {}; storageAvailable = false; }
const state = {
  reports: Array.isArray(saved?.reports) ? saved.reports.filter((r) => r && r.canteenId === 'canteen-3' && Number.isFinite(r.minutes) && r.minutes >= 0 && r.minutes <= 120 && Number.isFinite(r.createdAt)) : [],
  entries: Array.isArray(saved?.entries) ? saved.entries.filter((e) => e && Number.isFinite(e.price) && e.price >= 0 && Number.isFinite(Date.parse(e.date))) : [],
  months: saved?.months && typeof saved.months === 'object' && !Array.isArray(saved.months) ? saved.months : {},
  customDishes: Array.isArray(saved?.customDishes) ? saved.customDishes.filter((d)=>d && d.verified && typeof d.name==='string' && typeof d.windowName==='string' && Number.isFinite(d.price) && Array.isArray(d.periods)) : [],
  history: Array.isArray(saved?.history) ? saved.history.filter((h)=>h && Number.isFinite(h.queuedAt) && Number.isFinite(h.minutes) && typeof h.windowName==='string') : [],
  menuMode: saved?.campusRevision===1 && ['collected','demo','campus'].includes(saved.menuMode) ? saved.menuMode : saved?.menuMode==='collected' ? 'collected' : 'campus',
  campusRevision: 1,
  decision: normalizeTiming(saved?.decision || {}),
};
let filters = { period: 'lunch', budget: 18, time: '11:30', canteenId: 'canteen-3', windowName:'', taste: 'all', maxWait: 30 };
let candidates = [], cardPool = [], selectedDish = null, drawing = false, drawnDish = null, drawTimer, toastTimer;
let community = null, personalReviews = null;
const timing = state.decision;
let decisionUI = null, decisionSnapshot = null;
const activeMenu = () => state.menuMode==='collected' ? state.customDishes : state.menuMode==='campus' ? CAMPUS_MENU : DISHES;
const observations = () => state.menuMode==='demo' ? [] : CAMPUS_OBSERVATIONS;
const menuLabel = () => ({campus:'10/18照片菜单 · 午餐',collected:'本机自采菜单',demo:'演示菜单'})[state.menuMode];
const activeWindows = () => [...new Set(activeMenu().map((d)=>d.windowName))].filter(Boolean).sort();

function currentSettings() {
  const savedMonth = state.months[monthKey()];
  return {
    limit: Number.isFinite(savedMonth?.limit) && savedMonth.limit >= 0 ? savedMonth.limit : 900,
    openingSpent: Number.isFinite(savedMonth?.openingSpent) && savedMonth.openingSpent >= 0 ? savedMonth.openingSpent : 0,
  };
}
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); storageAvailable = true; return true; }
  catch { storageAvailable = false; toast('浏览器无法保存数据，本次内容仅暂存在当前页面。'); return false; }
}
function toast(message) {
  clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.add('visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4200);
}
function setPage(page, updateHash = true) {
  if (!['student', 'staff', 'wallet', 'data', 'discussion', 'feedback', 'survey'].includes(page)) page = 'student';
  if (drawing) cancelDraw();
  if (page !== 'student') decisionUI?.stopDemo();
  $$('.page').forEach((element) => { element.hidden = element.id !== `page-${page}`; });
  $$('.nav-item').forEach((button) => { const active = button.dataset.page === page; button.classList.toggle('active', active); active ? button.setAttribute('aria-current', 'page') : button.removeAttribute('aria-current'); });
  if (updateHash) history.replaceState(null, '', `#${page}`);
  if (page === 'wallet') renderWallet();
  if (page === 'staff') renderReports();
  if (page === 'data') renderCollection();
  community?.loadPage(page);
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function inferPeriod(time) {
  const [h, m] = time.split(':').map(Number); const minutes = h * 60 + m;
  if (minutes >= 390 && minutes < 570) return 'breakfast';
  if (minutes >= 630 && minutes < 840) return 'lunch';
  if (minutes >= 990 && minutes < 1200) return 'dinner';
  return null;
}
function cancelDraw() {
  clearTimeout(drawTimer); drawing = false; drawnDish = null;
  $('#meal-card').className = 'meal-card';
  $('#draw-choice').hidden = true;
  $('#draw-button').disabled = cardPool.length === 0;
  $('#draw-button').textContent = '抽一张，开饭 ✦';
}
function syncFilterControls() {
  $('#meal-budget').value = filters.budget;
  $('#budget-range').value = Math.min(100, Math.max(3, filters.budget));
  $('#meal-time').value = filters.time; $('#taste-select').value = filters.taste;
  $('#window-select').value = filters.windowName;
  $('#wait-range').value = filters.maxWait; $('#wait-value').textContent = `${filters.maxWait} 分钟`;
  $$('#period-options button').forEach((button) => { const selected = button.dataset.period === filters.period; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
}
function applyFilters() {
  cancelDraw(); syncFilterControls(); renderStudent();
  $('#draw-result').textContent = '下一顿惊喜，就在这里。';
}
function renderStudent() {
  if (drawing) cancelDraw();
  if (timing.liveStart) {
    const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
    filters.time = shiftClock(clock, timing.walkOut);
    const period = inferPeriod(filters.time); if (period) filters.period = period;
    syncFilterControls();
  }
  $('#budget-help').textContent=budgetHint(filters.budget,filters.period);
  $('#wait-help').textContent=waitHint(filters.maxWait);
  $('#page-student .demo-notice p').textContent=state.menuMode==='campus'?`10/18现场采集 · ${CAMPUS_MENU.length}道午餐 · 09号11:30排队至取餐8分钟（周日）`:menuLabel();
  const wait = queueFor(filters.time);
  $('#queue-minutes').textContent = wait.closed ? '—' : wait.minutes;
  $('#queue-unit').textContent = wait.closed ? '待确认' : '分钟';
  $('#queue-heading').textContent = filters.windowName ? `${filters.windowName}，等多久？` : '第三食堂，等多久？';
  $('#queue-range').textContent = wait.closed ? '当前时刻超出餐段设置' : wait.source==='observation'&&!wait.summary ? '10/18 周日 · 排队至取餐' : `${wait.summary?'窗口范围':wait.source==='history'?'样本范围':'参考范围'} ${wait.low}～${wait.high} 分钟`;
  $('#queue-time-label').textContent = `计划 ${filters.time || '--:--'} 到达${wait.summary?' · 最长参考':''}`;
  $('#queue-source').textContent = wait.sourceLabel;
  $('#queue-source').classList.toggle('staff', wait.source === 'staff');
  $('#queue-detail').textContent = wait.closed ? '餐段设置：06:30–09:30 / 10:30–14:00 / 16:30–20:00' : wait.summary ? '各窗口独立估算，来源和参数见方案' : wait.source === 'staff' ? `${dateLabel(wait.updatedAt, { hour: '2-digit', minute: '2-digit' })} 人工报数 · 有效30分钟` : wait.source==='history' ? `${wait.sampleCount} 条同类日期实测 · 中位数` : wait.source==='observation' ? '1条实测 · 周末相近时刻参考 · 已含出餐' : wait.pickupMinutes !== undefined ? `窗口参数 × 时段系数 · 出餐约${wait.pickupMinutes}分钟` : '演示时段曲线 × 21秒/人';
  $('#queue-detail').title = wait.detail;
  renderTimeBars();
  decisionSnapshot = decisionOptions({ filters, timing, reports: state.reports, history: state.history, observations:observations(), entries: state.entries, dishes: activeMenu() });
  candidates = personalizeCandidates(decisionSnapshot.current, state.entries);
  // 所有符合条件的菜都入池，低分只降权，不会挤掉其他菜。
  cardPool = weightedPool(candidates, candidates.length);
  $('#candidate-count').textContent = candidates.length;
  if (candidates.length) {
    $('#candidate-list').innerHTML = candidates.map((dish) => { const rating=community?.ratingsFor(dish.id), personal=dish.personalRating, chance=cardPool.find((item)=>item.id===dish.id); return `<button class="dish-row" data-dish="${escape(dish.id)}" aria-label="选择${escape(dish.name)}，${dish.price}元，总用时${dish.elapsed}分钟"><span class="dish-emoji" aria-hidden="true">${dishVisual(dish)}</span><span class="dish-info"><strong>${escape(dish.name)}</strong><small>${escape(dish.windowName)} · ${dish.wait.includesPickup?'等至取餐':'排队'} ${dish.wait.minutes} 分钟</small><small class="time-fit">往返用餐 ${dish.elapsed} 分钟 · ${escape(dish.wait.sourceLabel)}</small><span class="dish-rating">${validRating(personal)?`我评 ${personal} 星 · 权重 ×${dish.preferenceFactor}`:rating?`饭友 ★ ${rating.average} · ${rating.count} 条评价`:'吃完评分，影响下次抽卡'}</span></span><span class="dish-price">${money(dish.price)}<small class="dish-chance">${chance?`${chance.percent}% 入选`:'不在本轮卡池'}</small></span></button>`; }).join('');
  } else {
    const reason = state.menuMode==='campus'&&filters.period!=='lunch' ? '这批照片只采集了午餐。可在资料录入补充其他餐段。' : decisionSnapshot.excluded.length ? `当前最短需要 ${decisionSnapshot.minimum} 分钟，试试增加可用时间。` : wait.closed ? '换个用餐时刻试试。' : !Number.isFinite(filters.budget) || filters.budget <= 0 ? '请输入大于 0 的预算。' : '试试调整预算、等待或口味。';
    $('#candidate-list').innerHTML = `<div class="empty-state"><span class="empty-icon" aria-hidden="true">🥢</span><strong>这次没有合适的候选</strong><p>${reason}</p><button class="text-button" id="empty-reset">恢复默认条件 →</button></div>`;
  }
  if (!drawing) { $('#draw-button').disabled = cardPool.length === 0; renderCard(); }
  $('#draw-description').textContent = cardPool.length ? `${OBJECTIVES[timing.objective].label} · ${cardPool.length} 道菜可抽 · 按个人评分调整概率` : '调整预算、时间或窗口，补充卡池';
  const stats = monthlyBudget({ ...currentSettings(), entries: state.entries });
  $('#sidebar-remaining').textContent = money(stats.remaining);
  $('.menu-footnote').textContent = menuLabel();
  $('.sort-label').textContent=OBJECTIVES[timing.objective].label;
  decisionUI?.render(decisionSnapshot, cardPool);
}
function queueFor(time) {
  const windows = filters.windowName ? [filters.windowName] : [...new Set(activeMenu().filter((d)=>d.periods.includes(filters.period)).map((d)=>d.windowName))].filter(Boolean);
  const estimates=(windows.length?windows:['']).map((windowName)=>estimateWait({canteenId:filters.canteenId,windowName,time,reports:state.reports,history:state.history,observations:observations()}));
  const longest=estimates.reduce((a,b)=>a.minutes>=b.minutes?a:b);
  return estimates.length>1 ? {...longest,summary:true,sourceLabel:estimates.some((e)=>e.source==='model')?'窗口汇总 · 含模型估算':'各窗口参考汇总',low:Math.min(...estimates.map((e)=>e.minutes)),high:Math.max(...estimates.map((e)=>e.minutes))} : longest;
}
function renderTimeBars() {
  const slots = { breakfast: ['07:10','07:30','07:50','08:10','08:30'], lunch: ['11:20','11:45','12:10','12:35','13:00'], dinner: ['17:20','17:45','18:10','18:35','19:00'] }[filters.period].slice();
  if (!slots.includes(filters.time) && inferPeriod(filters.time) === filters.period) { slots[2] = filters.time; slots.sort(); }
  const values = slots.map((time) => ({ time, ...queueFor(time) }));
  const largest = Math.max(1, ...values.map((v) => v.minutes));
  $('#time-bars').innerHTML = values.map((v) => `<button class="time-column ${v.time === filters.time ? 'selected' : ''}" data-time="${v.time}" aria-pressed="${v.time === filters.time}" aria-label="${v.time}，预计排队${v.minutes}分钟"><span class="time-value">${v.minutes}分</span><span class="bar" style="--bar-height:${Math.max(6, v.minutes / largest * 62)}px"></span><span class="time-label">${v.time}</span></button>`).join('');
}
function renderCard() {
  if (drawnDish && cardPool.some(item => item.id === drawnDish.id)) return;
  $('#meal-card').className = 'meal-card'; $('#draw-choice').hidden = true;
  $('#draw-result').textContent = cardPool.length ? '下一顿，等你揭晓。' : '还没有符合条件的菜。';
}
function draw() {
  if (drawing || !cardPool.length) return;
  decisionUI?.stopDemo(false); persist();
  const dish = chooseWeighted(cardPool.slice());
  drawing = true; drawnDish = null; $('#draw-choice').hidden = true;
  $('#draw-button').disabled = true; $('#draw-button').textContent = '正在揭晓…';
  $('#draw-result').textContent = '今天的饭卡，即将揭晓。';
  $('#meal-card').className = 'meal-card drawing';
  const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 30 : 1100;
  drawTimer = setTimeout(() => {
    drawing = false; drawnDish = dish;
    const tier = dish.personalRating >= 4 ? 'gold' : dish.personalRating && dish.personalRating <= 2 ? 'miss' : '';
    $('#card-front').className = 'card-face card-front ' + tier;
    $('#card-tier').textContent = validRating(dish.personalRating) ? ratingOutcome(dish.personalRating) + ' · 你上次的评价' : '新口味 · 等你打分';
    $('#card-food').innerHTML = dishVisual(dish); $('#card-name').textContent = dish.name;
    $('#card-window').textContent = dish.windowName; $('#card-price').textContent = money(dish.price);
    $('#card-time').textContent = '往返用餐 ' + dish.elapsed + ' 分钟';
    $('#meal-card').className = 'meal-card revealed';
    $('#draw-button').disabled = false; $('#draw-button').textContent = '再抽一张 ✦';
    $('#draw-choice').hidden = false;
    $('#draw-result').textContent = dish.name + ' · 本轮概率 ' + dish.percent + '%';
  }, duration);
}
function showChoice(dish) {
  if (!dish) return; selectedDish = dish;
  $('#choice-emoji').innerHTML = dishVisual(dish); $('#choice-title').textContent = dish.name;
  $('#choice-meta').textContent = `第三食堂 · ${dish.windowName || '示例窗口'} · ${dish.taste}`;
  $('#choice-price').textContent = money(dish.price);
  $('#choice-note').textContent = `${dish.wait.includesPickup?'等至取餐':'排队'} ${dish.wait.minutes} 分钟 · 往返用餐 ${dish.elapsed} 分钟 · ${dish.returnAt} 返回 · ${dish.wait.sourceLabel}${dish.verified?'':' · 示例菜价'}。确认用餐后记账。`;
  $('#confirm-meal').disabled = false; $('#choice-dialog').showModal();
}
function renderReports() {
  const reports = [...state.reports].sort((a,b) => b.createdAt - a.createdAt);
  $('#report-list').innerHTML = reports.length ? reports.map((report) => {
    const age = Date.now() - report.createdAt, fresh = age >= 0 && age <= 30 * 60000;
    return `<div class="report-row"><div><strong>${escape(report.targetTime)} 到达 · 约 ${report.minutes} 分钟</strong><small>${escape(report.windowName||'未区分窗口')} · ${escape(report.method || '现场估计')}<br>${dateLabel(report.createdAt, { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })} 发布</small></div><div class="row-side"><span class="report-state ${fresh ? '' : 'expired'}">${fresh ? '近期填报' : '已过期'}</span><button class="row-delete" data-delete-report="${escape(report.id)}" aria-label="删除${escape(report.targetTime)}报数">删除</button></div></div>`;
  }).join('') : '<div class="empty-state"><span class="empty-icon" aria-hidden="true">📋</span><strong>还没有现场报数</strong><p>填入一条估计，就能演示学生端更新。</p></div>';
}
function monthEntries() {
  const target = monthKey();
  return state.entries.filter((entry) => new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Shanghai', year:'numeric', month:'2-digit' }).format(new Date(entry.date)) === target).sort((a,b) => Date.parse(b.date) - Date.parse(a.date));
}
function renderWallet() {
  const settings = currentSettings(), stats = monthlyBudget({ ...settings, entries: state.entries });
  $('#monthly-limit').value = settings.limit; $('#opening-spent').value = settings.openingSpent;
  $('#wallet-month-label').textContent = `${dateLabel(new Date(), { year:'numeric', month:'long' })} · 单独记录餐费，不包含其他生活支出`;
  const cards = [
    { label:'本月餐费预算', value:settings.limit, note:'按你的实际生活费设置' },
    { label:'本月已花餐费', value:stats.spent, note:'期初金额＋确认用餐记录' },
    { label:stats.remaining < 0 ? '已超过预算' : '本月餐费还剩', value:Math.abs(stats.remaining), note:`本月还剩 ${stats.daysLeft} 天（含今天）`, accent:true, over:stats.remaining < 0 },
    { label:'余下每天可安排', value:stats.dailyAllowance, note:'剩余餐费 ÷ 剩余天数' },
  ];
  $('#wallet-summary').innerHTML = cards.map((c) => `<div class="stat-card ${c.accent ? 'accent' : ''} ${c.over ? 'over' : ''}"><small>${c.label}</small><strong>${money(c.value)}</strong><p>${c.note}</p></div>`).join('');
  const entries = monthEntries(); $('#ledger-count').textContent = entries.length;
  $('#ledger-list').innerHTML = entries.length ? entries.map((entry) => { const reviewed=validRating(entry.personalRating); return `<div class="ledger-row"><div class="ledger-title"><span class="dish-emoji" aria-hidden="true">${dishVisual(entry)}</span><div><strong>${escape(entry.name)}</strong><small>${dateLabel(entry.date, { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })} · ${escape(entry.periodLabel || '用餐')}${entry.demo ? ' · 示例菜价记录' : ''}</small><button class="meal-review-button" data-review-meal="${escape(entry.id)}">${reviewed?`★ ${entry.personalRating}/5 · 修改评价`:'吃完了，打个分 ★'}</button>${reviewed?`<p class="personal-review-copy"><span class="meal-outcome ${entry.personalRating>=4?'gold':entry.personalRating<=2?'miss':''}">${ratingOutcome(entry.personalRating)}</span>${escape(entry.personalComment || '')}</p>`:''}</div></div><div class="row-side"><span class="ledger-amount">${money(entry.price)}</span><button class="row-delete" data-delete-entry="${escape(entry.id)}" aria-label="删除${escape(entry.name)}餐费记录">删除</button></div></div>`; }).join('') : '<div class="empty-state"><span class="empty-icon" aria-hidden="true">🍚</span><strong>第一顿，从今天开始</strong><p>在“今天吃什么”选好菜并确认，<br>就会出现在这里。</p></div>';
  $('#sidebar-remaining').textContent = money(stats.remaining);
}

$$('[data-page]').forEach((button) => button.addEventListener('click', () => setPage(button.dataset.page)));
window.addEventListener('hashchange', () => setPage(location.hash.slice(1), false));
['#about-button','#notice-about','#footer-about'].forEach((id) => $(id).addEventListener('click', () => $('#about-dialog').showModal()));
$$('[data-close]').forEach((button) => button.addEventListener('click', () => { $('#' + button.dataset.close).close(); if (button.dataset.close === 'choice-dialog') selectedDish = null; }));
$$('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } }));
$('#choice-dialog').addEventListener('close', () => { selectedDish = null; });
$('#period-options').addEventListener('click', (event) => { const button = event.target.closest('[data-period]'); if (button) { timing.liveStart = false; persist(); filters.period = button.dataset.period; filters.time = defaultTimes[filters.period]; applyFilters(); } });
$('#meal-budget').addEventListener('input', (event) => { filters.budget = event.target.value === '' ? 0 : Number(event.target.value); $('#budget-range').value = Math.min(100, Math.max(3, filters.budget)); cancelDraw(); renderStudent(); });
$('#budget-range').addEventListener('input', (event) => { filters.budget = Number(event.target.value); applyFilters(); });
$('#meal-time').addEventListener('change', (event) => { timing.liveStart = false; decisionUI?.stopDemo();persist();filters.time = event.target.value; const inferred = inferPeriod(filters.time); if (inferred) filters.period = inferred; applyFilters(); });
$('#taste-select').addEventListener('change', (event) => { filters.taste = event.target.value; applyFilters(); });
$('#window-select').addEventListener('change',(event)=>{filters.windowName=event.target.value;applyFilters();});
$('#wait-range').addEventListener('input', (event) => { filters.maxWait = Number(event.target.value); applyFilters(); });
const resetFilters = () => { decisionUI?.stopDemo();filters = { period:'lunch',budget:18,time:'11:30',canteenId:'canteen-3',windowName:'',taste:'all',maxWait:30 };Object.assign(timing,normalizeTiming());persist();applyFilters(); };
$('#reset-filters').addEventListener('click', resetFilters);
$('#candidate-list').addEventListener('click', (event) => { if (event.target.closest('#empty-reset')) { resetFilters(); return; } const button = event.target.closest('[data-dish]'); if (button) { cancelDraw(); showChoice(candidates.find((d) => d.id === button.dataset.dish)); } });
$('#time-bars').addEventListener('click', (event) => { const button = event.target.closest('[data-time]'); if (button) { timing.liveStart = false; persist(); filters.time = button.dataset.time; applyFilters(); } });
$('#draw-button').addEventListener('click', draw);
$('#draw-choice').addEventListener('click', () => { if (!drawing && drawnDish) showChoice(drawnDish); });
$('#confirm-meal').addEventListener('click', () => {
  if (!selectedDish) return; const dish = selectedDish; $('#confirm-meal').disabled = true;
  const entry={ id:crypto.randomUUID(), dishId:dish.id, windowName:dish.windowName, name:dish.name, price:dish.price, date:new Date().toISOString(), emoji:dish.emoji, periodLabel:PERIODS[filters.period], demo:!dish.verified };
  state.entries.push(entry);
  const stored = persist(); $('#choice-dialog').close(); renderStudent(); renderWallet();
  toast(stored ? `已记入 ${dish.name} ${money(dish.price)}。吃完后到“我的饭钱”打分。` : '已暂记本页，浏览器未能持久保存。');
  // 吃完后在账本打分，个人评分随后参与抽卡。
});
$('#report-form').addEventListener('submit', (event) => {
  event.preventDefault(); const targetTime = $('#report-time').value, minutes = Number($('#report-minutes').value), period = inferPeriod(targetTime);
  if (!period) { $('#report-status').textContent = '请选择演示用餐时段内的时间，便于学生端匹配。'; return; }
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 120) { $('#report-status').textContent = '请输入 0～120 之间的整数分钟。'; return; }
  const report = { id:crypto.randomUUID(),canteenId:'canteen-3',windowName:$('#report-window').value.trim(),minutes,targetTime,period,createdAt:Date.now(),method:$('#report-method').value,measure:$('#report-measure').value };
  state.reports.push(report); state.reports = state.reports.slice(-60); const stored = persist();
  $('#report-status').textContent = stored ? `已发布：${targetTime} 预计等 ${minutes} 分钟。点击右侧按钮查看学生端。` : '已暂存本页，浏览器无法持久保存。';
  renderReports(); if (drawing) cancelDraw(); renderStudent();
});
$('#report-view').addEventListener('click', () => { const latest = state.reports.at(-1); if (latest) { timing.liveStart=false;persist();filters.time = latest.targetTime; filters.period = latest.period; filters.windowName=activeWindows().includes(latest.windowName)?latest.windowName:''; applyFilters(); } setPage('student'); });
$('#report-list').addEventListener('click', (event) => { const button = event.target.closest('[data-delete-report]'); if (!button) return; state.reports = state.reports.filter((r) => r.id !== button.dataset.deleteReport); persist(); renderReports(); cancelDraw(); renderStudent(); toast('已删除该条本机报数。'); });
$('#wallet-form').addEventListener('submit', (event) => {
  event.preventDefault(); const limit = Number($('#monthly-limit').value), openingSpent = Number($('#opening-spent').value);
  if (![limit,openingSpent].every((v) => Number.isFinite(v) && v >= 0 && v <= 100000)) { $('#wallet-status').textContent = '请填写 0～100000 之间的金额。'; return; }
  state.months[monthKey()] = { limit:Math.round(limit * 100) / 100, openingSpent:Math.round(openingSpent * 100) / 100 };
  const stored = persist(); renderWallet(); $('#wallet-status').textContent = stored ? '本月设置已保存。' : '设置仅暂存在当前页面。';
});
$('#ledger-list').addEventListener('click', (event) => { const reviewButton=event.target.closest('[data-review-meal]');if(reviewButton){personalReviews?.open(reviewButton.dataset.reviewMeal);return;}const button = event.target.closest('[data-delete-entry]'); if (!button) return; state.entries = state.entries.filter((e) => e.id !== button.dataset.deleteEntry); persist(); cancelDraw(); renderStudent(); renderWallet(); toast('已删除餐费及这次个人评价。'); });
$('#export-data').addEventListener('click', () => { const blob = new Blob([JSON.stringify({ version:1, exportedAt:new Date().toISOString(),...state },null,2)],{ type:'application/json' }); const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `吃什么-本机备份-${monthKey()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url),2000); });
// 同一浏览器的另一个标签页填报时，学生页会同步；其他设备不会收到。
window.addEventListener('storage', (event) => { if (event.key !== STORAGE_KEY || !event.newValue) return; try { const next = JSON.parse(event.newValue); if (Array.isArray(next.reports) && Array.isArray(next.entries) && next.months) { decisionUI?.stopDemo(false);state.reports=next.reports; state.entries=next.entries; state.months=next.months;state.customDishes=Array.isArray(next.customDishes)?next.customDishes:[];state.history=Array.isArray(next.history)?next.history:[];state.menuMode=['campus','demo','collected'].includes(next.menuMode)?next.menuMode:'campus';Object.assign(timing,normalizeTiming(next.decision));cancelDraw();renderCollection();renderStudent();renderReports();if(!$('#page-wallet').hidden)renderWallet(); } } catch { /* 忽略损坏的外部数据。 */ } });
setInterval(() => { if (!drawing && !$('#choice-dialog').open) renderStudent(); if (!$('#page-staff').hidden) renderReports(); }, 30000);
// 真实菜单和历史样本表单。菜单模式需要主动切换，不会混入示例菜价。
$('#report-canteen').parentElement.insertAdjacentHTML('afterend','<div class="field"><label for="report-window">窗口名（可选）</label><input id="report-window" list="window-names" maxlength="30" placeholder="不填则只作未区分窗口的参考"></div>');
$('#report-minutes').parentElement.insertAdjacentHTML('afterend','<div class="field"><label for="report-measure">等待口径</label><select id="report-measure"><option value="queue-to-pickup">排队到拿餐（含出餐）</option><option value="queue">排队到点餐（出餐另算）</option></select></div>');
$('#menu-price').parentElement.insertAdjacentHTML('afterend','<div class="field"><label for="menu-pickup">点餐后出餐时长 / 分钟（可选）</label><input id="menu-pickup" type="number" min="0" max="30" step="1" placeholder="未填写时使用用时设置"></div>');
$('#data-summary').parentElement.insertAdjacentHTML('afterend',`<section class="card campus-data"><div class="section-top"><div><p class="eyebrow">10/18 · 第三食堂午间采集</p><h2>照片菜单 <span class="count-badge">${CAMPUS_MENU.length}</span></h2></div><a class="text-button" href="canteen-menu.csv" download>下载菜价表 ↓</a></div><p class="campus-observation"><strong>09号 · 11:30 → 11:38 · 8分钟</strong><span>周日实测 · 排队到拿餐，已包含出餐</span></p><details><summary>查看窗口与菜价</summary>${activeGroupsHTML()}</details><details><summary>加料与小吃 · ${CAMPUS_EXTRAS.length}项</summary><div class="campus-price-grid">${CAMPUS_EXTRAS.map(d=>`<p><span>${escape(d.windowName)} · ${escape(d.name)}</span><strong>${money(d.price)}</strong></p>`).join('')}</div></details><p class="campus-pending">待补：${CAMPUS_PENDING.join(' ')}</p></section>`);
function activeGroupsHTML(){return [...new Set(CAMPUS_MENU.map(d=>d.windowName))].map(w=>`<h3>${escape(w)}</h3><div class="campus-price-grid">${CAMPUS_MENU.filter(d=>d.windowName===w).map(d=>`<p><span>${escape(d.name)}</span><strong>${money(d.price)}</strong></p>`).join('')}</div>`).join('');}
function renderCollection(){
  const windows=activeWindows();if(filters.windowName&&!windows.includes(filters.windowName))filters.windowName='';
  $('#window-select').innerHTML='<option value="">所有窗口</option>'+windows.map((w)=>`<option value="${escape(w)}">${escape(w)}</option>`).join('');$('#window-select').value=filters.windowName;
  $('#window-names').innerHTML=[...new Set([...windows,...CAMPUS_MENU.map(d=>d.windowName),...state.customDishes.map((d)=>d.windowName),...state.history.map((h)=>h.windowName)])].map((w)=>`<option value="${escape(w)}"></option>`).join('');
  $('#menu-mode').value=state.menuMode;$('#data-summary').textContent=`照片菜单 ${CAMPUS_MENU.length} 道 · 本机补录 ${state.customDishes.length} 道 · 实测 ${CAMPUS_OBSERVATIONS.length+state.history.length} 条`;
  $('#collected-menu-list').innerHTML=state.customDishes.map((d)=>`<div class="collected-row"><div><strong>${escape(d.name)} · ${money(d.price)}</strong><small>${escape(d.windowName)} · ${d.periods.map((p)=>PERIODS[p]).join(' / ')}</small></div><button class="row-delete" data-delete-dish="${escape(d.id)}">删除</button></div>`).join('')||'<p class="community-intro">还没有自采菜品，拍好价格表后逐条录入。</p>';
  $('#history-list').innerHTML=[...CAMPUS_OBSERVATIONS,...state.history].sort((a,b)=>b.queuedAt-a.queuedAt).map((h)=>`<div class="collected-row"><div><strong>${escape(h.windowName)} · ${h.minutes} 分钟</strong><small>${dateLabel(h.queuedAt,{month:'numeric',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit'})} · ${h.measure==='queue-to-pickup'?'排队至取餐':'排队至点餐'}</small></div>${CAMPUS_OBSERVATIONS.some(s=>s.id===h.id)?'<span class="source-tag">现场采集</span>':`<button class="row-delete" data-delete-history="${escape(h.id)}">删除</button>`}</div>`).join('');
}
$('#menu-form').addEventListener('submit',(event)=>{event.preventDefault();try{
  const dish=menuDishFromInput({id:crypto.randomUUID(),windowName:$('#menu-window').value,name:$('#menu-name').value,price:$('#menu-price').value,pickupMinutes:$('#menu-pickup').value,periods:$('#menu-periods').value.split(','),taste:$('#menu-taste').value,vegetarian:$('#menu-vegetarian').checked,verified:$('#menu-verified').checked});
  const existing=state.customDishes.find((d)=>d.name===dish.name&&d.windowName===dish.windowName);if(existing)dish.id=existing.id;
  state.customDishes=state.customDishes.filter((d)=>d.id!==dish.id);state.customDishes.push(dish);persist();$('#menu-status').textContent='已保存。选择上方“自采菜单”即可在学生页使用。';renderCollection();cancelDraw();renderStudent();
}catch(error){$('#menu-status').textContent=error.message;}});
$('#menu-mode').addEventListener('change',(event)=>{state.menuMode=event.target.value;filters.windowName='';persist();renderCollection();applyFilters();toast(`已切换：${menuLabel()}`);});
$('#history-form').addEventListener('submit',(event)=>{event.preventDefault();try{
  const raw=$('#history-time').value;const sample=historySampleFromInput({id:crypto.randomUUID(),windowName:$('#history-window').value,queuedAt:Date.parse(raw+'+08:00'),minutes:$('#history-minutes').value,measure:$('#history-measure').value});
  state.history.push(sample);persist();$('#history-status').textContent='已保存，按平日/周末与等待口径分组。';renderCollection();cancelDraw();renderStudent();
}catch(error){$('#history-status').textContent=error.message;}});
$('#collected-menu-list').addEventListener('click',(event)=>{const button=event.target.closest('[data-delete-dish]');if(!button)return;state.customDishes=state.customDishes.filter((d)=>d.id!==button.dataset.deleteDish);persist();renderCollection();applyFilters();});
$('#history-list').addEventListener('click',(event)=>{const button=event.target.closest('[data-delete-history]');if(!button)return;state.history=state.history.filter((h)=>h.id!==button.dataset.deleteHistory);persist();renderCollection();applyFilters();});
const localParts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).filter((p)=>p.type!=='literal').map((p)=>[p.type,p.value]));
$('#history-time').value=`${localParts.year}-${localParts.month}-${localParts.day}T${localParts.hour}:${localParts.minute}`;
const aboutParagraphs=$$('#about-dialog .about-copy p');
aboutParagraphs[0].textContent='优先使用30分钟内的适用报数；其次取近30天同窗口、同餐段、同日期类型和同计时口径的至少3条记录中位数。09号另有10/18周日11:30的8分钟实测参考。无适用数据时，采用每个窗口的低峰排队、高峰增量与出餐初值，参数在TimeShift中可查看。';
aboutParagraphs[1].textContent='总用时＝去程＋排队＋出餐＋用餐＋返回，已含出餐的记录不重复计时。每5分钟比较出发安排，筛除超预算、等待超限或不能按时返回的菜品。按选中目标加权时间、价格和偏好，重新选出三道菜，优先比较不同窗口；候选不足时显示实际数量。“现在出发”每30秒重算。';
aboutParagraphs[2].textContent='时间、省钱、口味三项按当前目标加权，得到适合度s。抽取权重w＝exp(6s)×个人评分系数：1星0.25、2星0.5、3星1、4星1.5、5星2。未评为1；同菜采用最近一次评价，修改时替换。所有符合预算和时间的菜均入卡池，权重归一化为概率。';
aboutParagraphs[3].textContent=`照片菜单来自10/18第三食堂午间采集，共${CAMPUS_MENU.length}道。菜价与等待来源分别标注；部分口味按菜名推断。营养助手按菜单组合生成基础搭配；早餐、晚餐待补。`;
aboutParagraphs[4].textContent='照片菜单与现场采集记录随网站共享。本机补录、报数、餐费和个人评价保存在当前浏览器，可导出备份。“菜品问卷”可保存、修改并导出CSV和JSON，交给项目组汇总。共享讨论、反馈、公开评价和DeepSeek待接服务器。';
personalReviews=createPreferencesUI({getEntries:()=>state.entries,save:persist,onChange:()=>{cancelDraw();renderStudent();renderWallet();},onShare:(entry)=>community?.openReview(entry),toast});
community=createCommunity({toast,refreshLedger:renderWallet,refreshMenu:renderStudent});
createSurvey({toast});
decisionUI=createDecisionUI({getTiming:()=>timing,getFilters:()=>filters,onChange:(next,transient)=>{
  Object.assign(timing,normalizeTiming({...timing,...next}));if(!transient)persist();applyFilters();
},onDeparture:(time)=>{const arrival=shiftClock(time,timing.walkOut);if(!arrival)return;timing.liveStart=false;filters.time=arrival;const period=inferPeriod(arrival);if(period)filters.period=period;persist();applyFilters();},onNow:()=>{timing.liveStart=!timing.liveStart;persist();applyFilters();},onPick:(plan)=>{
  timing.liveStart=false;filters.time=plan.arrival;timing.available=Math.max(1,timing.available-plan.delay);persist();applyFilters();const current=candidates.find((dish)=>dish.id===plan.id);if(current)showChoice(current);
}});
createNutrition({getMenu:activeMenu,getMenuMode:()=>state.menuMode,toast,selectMeal:(meal)=>{
  timing.liveStart=false;persist();filters.period=meal.period;filters.time=defaultTimes[meal.period];filters.budget=Math.max(filters.budget,meal.price);filters.windowName=meal.windowName||'';filters.taste='all';
  applyFilters();setPage('student');
  const dish=candidates.find((item)=>item.id===meal.id);
  if(dish)showChoice(dish);else toast('这餐超出当前用时或等待上限，可以调整条件。');
}});
// 操作其他选饭条件时停止时间演示，并保留屏幕上正在显示的时间。
for(const name of ['input','click']) $('#page-student').addEventListener(name,event=>{if(!event.target.closest('#timeshift')){decisionUI.stopDemo(false);}},true);
persist();
renderCollection();syncFilterControls(); renderStudent(); renderReports(); renderWallet(); setPage(location.hash.slice(1) || 'student', false);
if (!storageAvailable) toast('本机存储暂不可用，刷新可能丢失记录。');
