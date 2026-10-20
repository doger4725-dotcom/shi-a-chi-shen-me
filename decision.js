import { getCandidates } from './model.js';
import { latestRatings } from './preferences.js';

export const OBJECTIVES = Object.freeze({
  fast: { label: '时间优先', weights: [0.75, 0.15, 0.1] },
  cheap: { label: '省钱优先', weights: [0.15, 0.75, 0.1] },
  balanced: { label: '综合优先', weights: [0.45, 0.35, 0.2] },
  taste: { label: '口味优先', weights: [0.2, 0.2, 0.6] },
});
export const DEFAULT_TIMING = Object.freeze({ enabled: true, liveStart: false, available: 45, walkOut: 4, walkBack: 4, eat: 12, pickup: 2, lookAhead: 15, objective: 'balanced', favorite: 'all' });
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
export function normalizeTiming(input = {}) {
  input = input || {};
  const result = { ...DEFAULT_TIMING };
  for (const [key, low, high] of [['available', 1, 120], ['walkOut', 0, 30], ['walkBack', 0, 30], ['eat', 1, 60], ['pickup', 0, 30], ['lookAhead', 0, 30]]) {
    if (Number.isFinite(Number(input[key]))) result[key] = clamp(Math.round(Number(input[key])), low, high);
  }
  if (typeof input.enabled === 'boolean') result.enabled = input.enabled;
  if (typeof input.liveStart === 'boolean') result.liveStart = input.liveStart;
  if (Object.hasOwn(OBJECTIVES, input.objective)) result.objective = input.objective;
  if (['all', '清淡', '微辣', '香辣'].includes(input.favorite)) result.favorite = input.favorite;
  return result;
}
export function clockMinutes(time) {
  if (typeof time !== 'string' || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [h, m] = time.split(':').map(Number); return h < 24 && m < 60 ? h * 60 + m : null;
}
export function clockLabel(minutes) {
  const n = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}
export const shiftClock = (time, delta) => clockMinutes(time) === null ? '' : clockLabel(clockMinutes(time) + delta);

// 演示菜单中每道菜有取餐参数；自采菜未录入时使用用户设置的默认值。
export function attachTiming(dish, timing, delay = 0) {
  const pickup = dish.wait.includesPickup ? 0 : Number.isFinite(dish.pickupMinutes) && dish.pickupMinutes >= 0 ? dish.pickupMinutes
    : Number.isFinite(dish.wait.pickupMinutes) ? dish.wait.pickupMinutes : timing.pickup;
  const occupied = timing.walkOut + dish.wait.minutes + pickup + timing.eat + timing.walkBack;
  const elapsed = delay + occupied;
  return { ...dish, pickup, delay, occupied, elapsed, slack: timing.available - elapsed,
    breakdown: [timing.walkOut, dish.wait.minutes, pickup, timing.eat, timing.walkBack] };
}
export function fitScore(dish, { budget, timing, objective = timing.objective }) {
  const [timeWeight, costWeight, tasteWeight] = OBJECTIVES[objective].weights;
  const timeFit = clamp(1 - dish.elapsed / Math.max(1, timing.available), 0, 1);
  const costFit = clamp(1 - dish.price / Math.max(1, Number(budget)), 0, 1);
  const tasteFit = timing.favorite === 'all' || dish.taste === '口味待录入' ? 0.5 : dish.taste === timing.favorite ? 1 : 0;
  const fit = timeWeight * timeFit + costWeight * costFit + tasteWeight * tasteFit;
  return { fit, weight: Math.exp(6 * fit), components: { timeFit, costFit, tasteFit } };
}

/** 在可选的到达时刻上逐一计算，再比较目标；不是动态规划。 */
export function decisionOptions({ filters, timing: rawTiming, dishes, reports = [], history = [], observations = [], entries = [], now = Date.now() }) {
  const timing = normalizeTiming(rawTiming), arrival = clockMinutes(filters.time);
  if (arrival === null) return { timing, current: [], excluded: [], plans: [], departure: '', deadline: '', minimum: null };
  const departure = arrival - timing.walkOut;
  const all = [], immediate = [];
  for (let delay = 0; delay <= timing.lookAhead; delay += 5) {
    const at = clockLabel(arrival + delay);
    for (const dish of getCandidates({ ...filters, time: at, dishes, reports, history, observations, now })) {
      const item = { ...attachTiming(dish, timing, delay), arrival: at, departure: clockLabel(departure + delay) };
      item.returnAt = clockLabel(departure + item.elapsed);
      item.key = `${dish.id}@${at}`;
      item.fitData = fitScore(item, { budget: filters.budget, timing });
      if (delay === 0) immediate.push(item);
      if (!timing.enabled || item.elapsed <= timing.available) all.push(item);
    }
  }
  const current = immediate.filter((item) => !timing.enabled || item.slack >= 0).sort((a, b) => b.fitData.fit - a.fitData.fit || a.price - b.price || a.elapsed - b.elapsed || a.id.localeCompare(b.id));
  const excluded = immediate.filter((item) => timing.enabled && item.slack < 0).sort((a, b) => a.elapsed - b.elapsed);
  // 同一道菜的多个出发时刻只保留最早返回的一项，再从不同菜中组织方案。
  const byDish = new Map(), ratings = latestRatings(entries);
  for (const item of all) {
    const previous = byDish.get(item.id);
    if (!previous || item.elapsed < previous.elapsed || (item.elapsed === previous.elapsed && item.delay < previous.delay)) byDish.set(item.id, item);
  }
  const choices = [...byDish.values()].map((item) => {
    const personalRating = ratings.get(item.id)?.rating ?? null;
    const base = fitScore(item, { budget: filters.budget, timing });
    const preference = personalRating === null ? base.components.tasteFit : timing.favorite === 'all' || item.taste === '口味待录入'
      ? (personalRating - 1) / 4 : (base.components.tasteFit + (personalRating - 1) / 4) / 2;
    return { ...item, personalRating, preferenceFit: preference,
      planFit: base.fit + OBJECTIVES[timing.objective].weights[2] * (preference - base.components.tasteFit) };
  });
  const compareFast = (a, b) => a.elapsed - b.elapsed || (b.personalRating ?? 3) - (a.personalRating ?? 3) || a.price - b.price || a.key.localeCompare(b.key);
  const compareCheap = (a, b) => a.price - b.price || a.elapsed - b.elapsed || (b.personalRating ?? 3) - (a.personalRating ?? 3) || a.key.localeCompare(b.key);
  const cheapest = [...choices].sort(compareCheap)[0];
  const fastest = [...choices].sort(compareFast)[0];
  // 目标按钮真正决定卡片内容。先按当前目标得分排名，再优先给出不同窗口。
  const ranked = [...choices].sort((a, b) => {
    const difference = b.planFit - a.planFit;
    return Math.abs(difference) > 1e-9 ? difference : timing.objective === 'cheap' ? compareCheap(a, b) : compareFast(a, b);
  });
  const selected = [], windows = new Set();
  for (const item of ranked) {
    if (windows.has(item.windowName)) continue;
    selected.push(item); windows.add(item.windowName);
    if (selected.length === 3) break;
  }
  if (selected.length < 3) for (const item of ranked) {
    if (selected.some((chosen) => chosen.id === item.id)) continue;
    selected.push(item); if (selected.length === 3) break;
  }
  const lead = { fast: '省时', cheap: '省钱', balanced: '综合', taste: '口味' }[timing.objective];
  const plans = selected.map((item, index) => ({ ...item, kind: `option-${index + 1}`,
    title: `${lead}${index === 0 ? '首选' : `备选 ${index + 1}`}`, rank: index + 1,
    objective: timing.objective, isFastest: item.elapsed === fastest.elapsed, isCheapest: item.price === cheapest.price }));
  return { timing, current, excluded, plans, choiceCount: choices.length,
    fastestMinutes: fastest?.elapsed ?? null, cheapestPrice: cheapest?.price ?? null,
    fastestCount: fastest ? choices.filter((item) => item.elapsed === fastest.elapsed).length : 0,
    departure: clockLabel(departure), deadline: clockLabel(departure + timing.available),
    minimum: immediate.length ? Math.min(...immediate.map((item) => item.elapsed)) : null };
}

/** 权重归一化；百分比使用最大余数法，显示值合计始终为100%。 */
export function weightedPool(items, limit = 8) {
  const selected = items.slice(0, limit);
  const total = selected.reduce((sum, item) => sum + item.fitData.weight, 0);
  if (!total) return [];
  const result = selected.map((item) => {
    const probability = item.fitData.weight / total;
    return { ...item, probability, displayUnits: Math.floor(probability * 1000), remainder: probability * 1000 % 1 };
  });
  const remainderOrder = result.map((item, index) => ({ index, remainder: item.remainder })).sort((a, b) => b.remainder - a.remainder);
  for (let count = 1000 - result.reduce((sum, item) => sum + item.displayUnits, 0), i = 0; i < count; i++) result[remainderOrder[i].index].displayUnits++;
  let start = 0;
  return result.map((item, index) => { const end = index === result.length - 1 ? 1 : start + item.probability; const row = { ...item, percent: item.displayUnits / 10, arcStart: start, arcEnd: end }; start = end; return row; });
}
export function chooseWeighted(pool, random = Math.random) {
  if (!pool.length) return null;
  const value = Number(random()), draw = Number.isFinite(value) ? clamp(value, 0, 1 - Number.EPSILON) : 0;
  return pool.find((item) => draw < item.arcEnd) || pool.at(-1);
}
export function landingRotation(item, currentRotation = 0) {
  return (Math.ceil(currentRotation / 360) + 6) * 360 - (item.arcStart + item.arcEnd) / 2 * 360;
}
