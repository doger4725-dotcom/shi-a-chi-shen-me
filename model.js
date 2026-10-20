/**
 * “是啊，吃什么”演示数据和计算方法。
 * 用户确认场景为安徽大学龙河校区第三食堂。
 * DISHES是演示菜单；现场菜价在canteen-data.js。窗口等待和出餐参数是演示估计。
 */

export const PERIODS = Object.freeze({
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
});

export function budgetHint(amount, period = 'lunch') {
  const value=Number(amount);
  if(value>80)return '记得饕餮只是传说';
  if(Number.isFinite(value)&&value<4)return `天下没有免费的${PERIODS[period]||'午餐'}`;
  if(value>10&&value<20)return '巴适';
  return '只推荐不超过预算的菜品';
}
export function waitHint(minutes) {
  if(Number(minutes)<10)return '速战速决';
  if(Number(minutes)>30)return '美味值得等待';
  return '按预计等待时间筛选';
}

export const CANTEENS = Object.freeze([
  { id: 'canteen-3', name: '第三食堂', subtitle: '安徽大学 · 龙河校区', color: '#f29152', baseServiceSeconds: 21, dataStatus: 'demo' },
].map(Object.freeze));

export const DISHES = Object.freeze([
  { id: 'dish-01', name: '小米粥鸡蛋套餐', price: 6, emoji: '🥣', periods: ['breakfast'], taste: '清淡', category: '粥点', tags: ['蛋奶素', '清淡'] },
  { id: 'dish-02', name: '鲜肉包豆浆', price: 8, emoji: '🥟', periods: ['breakfast'], taste: '清淡', category: '面点', tags: ['清淡'] },
  { id: 'dish-03', name: '南瓜粥素包', price: 5, emoji: '🎃', periods: ['breakfast'], taste: '清淡', category: '粥点', tags: ['素食', '清淡'] },
  { id: 'dish-04', name: '牛肉汤粉', price: 10, emoji: '🍲', periods: ['breakfast'], taste: '微辣', category: '粉面', tags: ['微辣'] },
  { id: 'dish-05', name: '皮蛋瘦肉粥', price: 6, emoji: '🥣', periods: ['breakfast'], taste: '清淡', category: '粥点', tags: ['清淡'] },
  { id: 'dish-06', name: '鸡蛋饼豆浆', price: 7, emoji: '🥞', periods: ['breakfast'], taste: '清淡', category: '面点', tags: ['蛋奶素', '清淡'] },
  { id: 'dish-07', name: '番茄炒蛋饭', price: 10, emoji: '🍅', periods: ['lunch'], taste: '清淡', category: '盖饭', tags: ['素食', '清淡'] },
  { id: 'dish-08', name: '宫保鸡丁饭', price: 14, emoji: '🍚', periods: ['lunch'], taste: '微辣', category: '盖饭', tags: ['微辣'] },
  { id: 'dish-09', name: '青椒肉丝面', price: 13, emoji: '🍜', periods: ['lunch'], taste: '微辣', category: '面食', tags: ['微辣'] },
  { id: 'dish-10', name: '香菇青菜面', price: 10, emoji: '🥬', periods: ['lunch'], taste: '清淡', category: '面食', tags: ['素食', '清淡'] },
  { id: 'dish-11', name: '素麻婆豆腐饭', price: 11, emoji: '🍛', periods: ['lunch'], taste: '香辣', category: '盖饭', tags: ['素食', '香辣'] },
  { id: 'dish-12', name: '红烧肉饭', price: 17, emoji: '🥘', periods: ['lunch'], taste: '清淡', category: '盖饭', tags: ['清淡'] },
  { id: 'dish-13', name: '蒸蔬菜双拼饭', price: 12, emoji: '🥦', periods: ['dinner'], taste: '清淡', category: '套餐', tags: ['素食', '清淡'] },
  { id: 'dish-14', name: '番茄牛腩饭', price: 19, emoji: '🍅', periods: ['dinner'], taste: '微辣', category: '盖饭', tags: ['微辣'] },
  { id: 'dish-15', name: '香辣烤鱼饭', price: 20, emoji: '🐟', periods: ['dinner'], taste: '香辣', category: '套餐', tags: ['香辣'] },
  { id: 'dish-16', name: '土豆炖鸡饭', price: 16, emoji: '🥔', periods: ['dinner'], taste: '微辣', category: '套餐', tags: ['微辣'] },
  { id: 'dish-17', name: '香辣鸡腿饭', price: 16, emoji: '🍗', periods: ['dinner'], taste: '香辣', category: '套餐', tags: ['香辣'] },
  { id: 'dish-18', name: '玉米鸡肉沙拉', price: 15, emoji: '🥗', periods: ['dinner'], taste: '清淡', category: '轻食', tags: ['清淡'] },
].map((dish, index) => Object.freeze({
  ...dish, canteenId: 'canteen-3', windowName: `演示窗口 ${['A', 'B', 'C'][Math.floor((index % 6) / 2)]}`, verified: false,
  pickupMinutes: [8, 3, 5, 10, 1, 4][index % 6],
  periods: Object.freeze(dish.periods), tags: Object.freeze(dish.tags),
})));

// 左闭右开：06:30 可以用餐，09:30 已结束早餐。
const MEAL_WINDOWS = Object.freeze({
  breakfast: { start: 390, end: 570, peak: 470, spread: 36 },
  lunch: { start: 630, end: 840, peak: 725, spread: 40 },
  dinner: { start: 990, end: 1200, peak: 1090, spread: 43 },
});
const MINUTE_MS = 60_000;

// 建模初值：低峰排队 + 高峰增量 × 时段系数；单位均为分钟。
// 套餐打饭较快，煎饼/炒饭现做较慢。真实报数和同类实测优先覆盖这些初值。
export const WINDOW_TIMING = Object.freeze([
  ['01号·山东杂粮煎饼', 2, 18, 3],
  ['02号·套餐饭', 1, 4, 1],
  ['03号·套餐饭', 1, 7, 1],
  ['04号·猛火炒饭', 2, 12, 4],
  ['酸菜肉煲·馄饨', 1, 8, 3],
  ['06号·馄饨', 1, 7, 4],
  ['07号·牛粉面', 1, 10, 3],
  ['08号·俏阿春拌面', 1, 8, 3],
  ['09号·卫孔记面馆', 2, 7, 2],
].map(([windowName, offPeak, peakExtra, pickupMinutes]) => Object.freeze({ windowName, offPeak, peakExtra, pickupMinutes })));

export function tasteProfile(dish) {
  if (['清淡', '微辣', '香辣'].includes(dish.taste)) return { taste: dish.taste, tasteSource: dish.tasteSource || '录入口味' };
  const name = dish.name || '';
  const taste = /爆辣|爆椒|火鸡|剁椒|老干妈|辣椒/.test(name) ? '香辣'
    : /酸辣|椒麻|藤椒|鱼香|宫保|孜然|口水鸡|烧椒|酸豆角/.test(name) ? '微辣'
    : /馄饨|煎饼|清香|西红柿|番茄|葱油|清笋|荠菜|玉米|鸡蛋炒饭|盐水鸭/.test(name) ? '清淡' : '口味待录入';
  return { taste, tasteSource: taste === '口味待录入' ? '' : '按菜名推断' };
}

function timeToMinutes(time) {
  if (typeof time !== 'string' || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [hour, minute] = time.split(':').map(Number);
  return hour <= 23 && minute <= 59 ? hour * 60 + minute : null;
}

function periodAt(minutes) {
  return Object.keys(MEAL_WINDOWS).find((period) => {
    const window = MEAL_WINDOWS[period];
    return minutes >= window.start && minutes < window.end;
  }) ?? null;
}

function timestamp(value) {
  if (value === null || value === undefined || value === '') return NaN;
  return value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
}

function shanghaiParts(value) {
  const instant = timestamp(value);
  if (!Number.isFinite(instant)) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
}

function closedEstimate(detail) {
  return { minutes: 0, low: 0, high: 0, source: 'model', sourceLabel: '演示营业时段', updatedAt: null, confidence: '未营业', detail, closed: true };
}

export function dayType(value) {
  const p = shanghaiParts(value);
  if (!p) return null;
  const day = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return day === 0 || day === 6 ? 'weekend' : 'weekday';
}

/**
 * 时间、食堂共同决定排队估计。近期人工填报优先，其余使用公开的演示公式。
 * report = { canteenId, minutes, createdAt, targetTime?: '12:10', period?: 'lunch' }
 * 不指定 targetTime 时，以填报时刻的上海时间作为该报告对应的用餐时间。
 */
export function estimateWait({ canteenId, time = '12:10', windowName = '', reports = [], history = [], observations = [], now = Date.now() } = {}) {
  const canteen = CANTEENS.find((item) => item.id === canteenId);
  const selectedMinutes = timeToMinutes(time);
  if (!canteen || selectedMinutes === null) return closedEstimate('请选择有效的演示食堂和用餐时间。');
  const period = periodAt(selectedMinutes);
  if (!period) return closedEstimate('当前选择不在演示营业时段内：06:30–09:30、10:30–14:00、16:30–20:00。');

  const nowMs = timestamp(now);
  const matchingReports = (Array.isArray(reports) ? reports : []).filter((report) => {
    if (!report || report.canteenId !== canteenId) return false;
    if (report.windowName && report.windowName !== windowName) return false;
    if (typeof report.minutes !== 'number' || !Number.isFinite(report.minutes) || report.minutes < 0) return false;
    const createdAt = timestamp(report.createdAt);
    const age = nowMs - createdAt;
    if (!Number.isFinite(age) || age < 0 || age > 30 * MINUTE_MS) return false;
    if (report.period && report.period !== period) return false;
    const createdParts = shanghaiParts(createdAt);
    const reportTime = report.targetTime == null
      ? createdParts.hour * 60 + createdParts.minute
      : timeToMinutes(report.targetTime);
    return reportTime !== null && Math.abs(reportTime - selectedMinutes) <= 30 && periodAt(reportTime) === period;
  }).sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt));

  if (matchingReports.length > 0) {
    const report = matchingReports[0];
    const minutes = Math.round(report.minutes);
    return {
      minutes, low: Math.max(0, minutes - 2), high: minutes + 2,
      source: 'staff', sourceLabel: '近期人工填报', updatedAt: timestamp(report.createdAt),
      includesPickup: report.measure === 'queue-to-pickup',
      confidence: '近期填报', detail: '采用 30 分钟内、对应用餐时刻相差不超过 30 分钟的最新填报；范围为演示用 ±2 分钟，非统计置信区间。', closed: false,
    };
  }

  // 同一窗口、同餐段、相近时刻、近 30 天的实测样本才合并。
  // 用中位数抵抗个别很长/很短的等待；三个样本只够给参考，不能证明准确率。
  const samples = [...(Array.isArray(history) ? history : []),...(Array.isArray(observations)?observations:[])].filter((sample) => {
    if (!windowName || !sample || sample.canteenId !== canteenId || sample.windowName !== windowName) return false;
    if (!Number.isFinite(sample.minutes) || sample.minutes < 0 || sample.minutes > 120) return false;
    const observedAt = timestamp(sample.queuedAt), age = nowMs - observedAt;
    if (!Number.isFinite(age) || age < 0 || age > 30 * 24 * 60 * MINUTE_MS) return false;
    if (dayType(observedAt) !== dayType(nowMs)) return false;
    const parts = shanghaiParts(observedAt), observedMinutes = parts.hour * 60 + parts.minute;
    return periodAt(observedMinutes) === period && Math.abs(observedMinutes - selectedMinutes) <= 30;
  }).sort((a,b) => a.minutes - b.minutes);
  // 点餐前排队与排队至取餐分组，避免混合两种口径。
  const sameMeasure = ['queue','queue-to-pickup'].map(measure=>samples.filter(s=>(s.measure||'queue')===measure)).filter(group=>group.length>=3).sort((a,b)=>Math.max(...b.map(s=>timestamp(s.queuedAt)))-Math.max(...a.map(s=>timestamp(s.queuedAt))))[0] || [];
  if (sameMeasure.length >= 3) {
    const middle = Math.floor(sameMeasure.length / 2);
    const median = sameMeasure.length % 2 ? sameMeasure[middle].minutes : (sameMeasure[middle - 1].minutes + sameMeasure[middle].minutes) / 2;
    return { minutes:Math.round(median), low:Math.floor(sameMeasure[0].minutes), high:Math.ceil(sameMeasure.at(-1).minutes), source:'history', sourceLabel:'历史样本参考', sampleCount:sameMeasure.length, includesPickup:sameMeasure[0].measure==='queue-to-pickup', updatedAt:Math.max(...sameMeasure.map(s=>timestamp(s.queuedAt))), confidence:'样本中位数', closed:false, detail:`近30天、同窗口、同餐段、同为周末或平日、时刻相差≤30分钟的${sameMeasure.length}条记录。显示中位数与样本范围。` };
  }

  const observation = observations.filter(s => s.canteenId===canteenId && s.windowName===windowName && Number.isFinite(s.minutes) && s.minutes>=0 && s.minutes<=120 && timestamp(s.queuedAt)<=nowMs && nowMs-timestamp(s.queuedAt)<=30*86400000 && dayType(s.queuedAt)===dayType(nowMs)).filter(s=>{const p=shanghaiParts(s.queuedAt);return Math.abs(p.hour*60+p.minute-selectedMinutes)<=30 && periodAt(p.hour*60+p.minute)===period;}).sort((a,b)=>timestamp(b.queuedAt)-timestamp(a.queuedAt))[0];
  if (observation) return {minutes:observation.minutes,low:observation.minutes,high:observation.minutes,source:'observation',sourceLabel:'单次实测参考',sampleCount:1,includesPickup:observation.measure==='queue-to-pickup',updatedAt:timestamp(observation.queuedAt),confidence:'单次实测',detail:observation.note,closed:false};

  const window = MEAL_WINDOWS[period];
  // 高峰越近，估计队伍越长；这个钟形曲线是演示假设，尚未经真实客流校准。
  const peakLoad = Math.exp(-0.5 * ((selectedMinutes - window.peak) / window.spread) ** 2);
  const profile = WINDOW_TIMING.find((item) => item.windowName === windowName);
  if (profile) {
    const minutes = Math.ceil(profile.offPeak + profile.peakExtra * peakLoad);
    const margin = Math.max(2, Math.round(minutes * 0.3));
    return { minutes, low: Math.max(0, minutes - margin), high: minutes + margin,
      source: 'model', sourceLabel: '窗口模型估算', updatedAt: null, confidence: '参数初值',
      pickupMinutes: profile.pickupMinutes, includesPickup: false,
      detail: `排队≈${profile.offPeak}+${profile.peakExtra}×时段系数${peakLoad.toFixed(2)}，向上取整；出餐约${profile.pickupMinutes}分钟。参数初值见TimeShift“窗口估算参数”。`, closed: false };
  }
  const peopleAhead = Math.round(3 + 34 * peakLoad);
  const minutes = Math.ceil(peopleAhead * canteen.baseServiceSeconds / 60);
  const margin = Math.max(2, Math.round(minutes * 0.3));
  return {
    minutes, low: Math.max(0, minutes - margin), high: minutes + margin,
    source: 'model', sourceLabel: '演示模型估算', updatedAt: null, confidence: '演示估算',
    detail: `假设前方约 ${peopleAhead} 人，每人服务 ${canteen.baseServiceSeconds} 秒；等待时间 = 人数 × 服务秒数 ÷ 60，向上取整。范围为演示误差带，尚未实测校准。`,
    closed: false,
  };
}

/** 按预算、餐段、食堂、口味、最长等待时间先筛选，再给候选排序。 */
export function getCandidates({ budget = 20, canteenId = 'all', period = 'lunch', taste = 'all', maxWait = 30, time = '12:10', windowName = '', reports = [], history = [], observations = [], now = Date.now(), dishes = DISHES } = {}) {
  const budgetNumber = Number(budget);
  const waitLimit = Number(maxWait);
  const selectedMinutes = timeToMinutes(time);
  if (!Number.isFinite(budgetNumber) || budgetNumber <= 0 || !Number.isFinite(waitLimit) || waitLimit < 0) return [];
  if (!(period in PERIODS) || selectedMinutes === null || periodAt(selectedMinutes) !== period) return [];
  const waits = new Map();
  const waitFor = (dish) => {
    const key = `${dish.canteenId}\u0000${dish.windowName || ''}`;
    if (!waits.has(key)) waits.set(key, estimateWait({ canteenId:dish.canteenId, windowName:dish.windowName || '', time, reports, history, observations, now }));
    return waits.get(key);
  };

  return (Array.isArray(dishes) ? dishes : []).map((dish) => dish && ({ ...dish, ...tasteProfile(dish) })).filter((dish) => {
    if (!dish || !Array.isArray(dish.periods) || !Number.isFinite(dish.price) || dish.price < 0) return false;
    const wait = waitFor(dish);
    return wait && dish.price <= budgetNumber
      && (canteenId === 'all' || dish.canteenId === canteenId)
      && (!windowName || dish.windowName === windowName)
      && dish.periods.includes(period)
      && (taste === 'all' || dish.taste === taste || (taste === '素食' && dish.tags?.includes('素食')))
      && !wait.closed && wait.minutes <= waitLimit;
  }).map((dish) => {
    const wait = waitFor(dish);
    const costScore = 1 - dish.price / budgetNumber;
    const waitScore = waitLimit === 0 ? 1 : 1 - wait.minutes / waitLimit;
    // 55% 价格余量 + 45% 等待余量；权重是演示设计选择，并非用户调研结论。
    const score = Math.round((0.55 * costScore + 0.45 * waitScore) * 1000) / 10;
    return { ...dish, wait, score };
  }).sort((a, b) => b.score - a.score || a.wait.minutes - b.wait.minutes || a.price - b.price || a.id.localeCompare(b.id));
}

function nonnegativeMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * 月度餐费 = 用户填写的本月已花费 + 本应用当月“确认用餐”的金额。
 * entries = [{ price: 12, date: '2026-10-18T04:00:00.000Z' }]
 * 按上海日历月计算；剩余天数包含今天，避免月底最后一天出现除以零。
 */
export function monthlyBudget({ limit = 600, openingSpent = 0, entries = [], date = new Date() } = {}) {
  const today = shanghaiParts(date) ?? shanghaiParts(new Date());
  const monthEntries = (Array.isArray(entries) ? entries : []).filter((entry) => {
    if (!entry) return false;
    const entryDay = shanghaiParts(entry.date);
    return entryDay && entryDay.year === today.year && entryDay.month === today.month;
  });
  const spent = roundMoney(nonnegativeMoney(openingSpent) + monthEntries.reduce((sum, entry) => sum + nonnegativeMoney(entry.price), 0));
  const monthlyLimit = roundMoney(nonnegativeMoney(limit));
  const remaining = roundMoney(monthlyLimit - spent);
  const daysInMonth = new Date(Date.UTC(today.year, today.month, 0)).getUTCDate();
  const daysLeft = daysInMonth - today.day + 1;
  return {
    spent, remaining, daysLeft, dailyAllowance: roundMoney(Math.max(0, remaining) / daysLeft),
    ratio: monthlyLimit > 0 ? spent / monthlyLimit : spent > 0 ? 1 : 0,
  };
}
