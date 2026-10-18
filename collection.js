// 表单录入的真实资料与演示资料分开保存，只有主动确认过的菜价才标为自采。
const PERIOD_KEYS = ['breakfast', 'lunch', 'dinner'];
const trim = (value) => typeof value === 'string' ? value.trim() : '';

export function menuDishFromInput(input) {
  const name = trim(input.name), windowName = trim(input.windowName), price = Number(input.price);
  if (!name || name.length > 40) throw new Error('菜名请填写 1～40 个字。');
  if (!windowName || windowName.length > 30) throw new Error('窗口名请填写 1～30 个字。');
  if (input.price === '' || !Number.isFinite(price) || price <= 0 || price > 200) throw new Error('菜价请填写大于 0、不超过 200 元的金额。');
  const periods = [...new Set((Array.isArray(input.periods) ? input.periods : []).filter((p) => PERIOD_KEYS.includes(p)))];
  if (!periods.length) throw new Error('请至少选择一个供应餐段。');
  if (!['清淡', '微辣', '香辣', '口味待录入'].includes(input.taste)) throw new Error('请选择菜品口味。');
  if (input.verified !== true) throw new Error('请先核对窗口、菜价与供应餐段，再勾选确认。');
  const pickupMinutes=input.pickupMinutes==null||input.pickupMinutes===''?null:Number(input.pickupMinutes);
  if(pickupMinutes!==null&&(!Number.isFinite(pickupMinutes)||pickupMinutes<0||pickupMinutes>30))throw new Error('取餐时长请填0～30分钟。');
  return { id:trim(input.id), name, windowName, canteenId:'canteen-3', price:Math.round(price * 100) / 100, periods, taste:input.taste, tags:input.vegetarian === true ? ['素食'] : [], emoji:'🍚', category:'自采菜品', verified:true, collectedAt:Number(input.collectedAt) || Date.now(),...(pickupMinutes===null?{}:{pickupMinutes}) };
}

export function historySampleFromInput(input, now = Date.now()) {
  const windowName = trim(input.windowName), queuedAt = Number(input.queuedAt), minutes = Number(input.minutes);
  if (!windowName || windowName.length > 30) throw new Error('请填写实际排队的窗口名，且不超过 30 个字。');
  if (!Number.isFinite(queuedAt) || queuedAt <= 0 || queuedAt > now) throw new Error('采集时刻应为已经发生的北京时间。');
  if (input.minutes === '' || !Number.isFinite(minutes) || minutes < 0 || minutes > 120) throw new Error('实际等待请填写 0～120 分钟，可保留小数。');
  return { id:trim(input.id), canteenId:'canteen-3', windowName, queuedAt, minutes:Math.round(minutes * 10) / 10, measure:input.measure==='queue-to-pickup'?'queue-to-pickup':'queue' };
}
