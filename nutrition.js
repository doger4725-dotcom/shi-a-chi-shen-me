// 基础搭配规则，不调用大模型。菜名只能提供食材线索，不能证明分量或营养达标。
export const FOOD_GROUPS = Object.freeze([
  { key: 'staple', label: '谷薯主食', pattern: /饭|面|粉|粥|包|饼|馒头|玉米|土豆|红薯|燕麦|杂粮/ },
  { key: 'vegetable', label: '蔬菜', pattern: /蔬菜|青菜|白菜|生菜|菠菜|西兰花|番茄|西红柿|青椒|黄瓜|茄子|南瓜|胡萝卜|香菇|菌菇|木耳/ },
  { key: 'protein', label: '肉鱼蛋豆', pattern: /肉|鸡|鸭|牛|猪|鱼|虾|蛋|豆腐|豆干|豆浆|豆制品|毛豆|黄豆/ },
  { key: 'fruit', label: '水果', pattern: /水果|苹果|香蕉|橙子|橘子|猕猴桃|梨|草莓|葡萄|西瓜/ },
  { key: 'dairy', label: '奶类', pattern: /牛奶|酸奶|奶酪|纯奶/ },
  { key: 'wholegrain', label: '全谷杂粮', pattern: /全麦|糙米|小米|燕麦|杂粮|荞麦|玉米/ },
]);
const PERIODS = ['breakfast', 'lunch', 'dinner'];
const MEAT = /肉|鸡(?!蛋)|鸭(?!蛋)|牛(?!奶)|猪|鱼|虾|蟹|火腿|培根|香肠/;
const cents = (value) => Math.round(Number(value) * 100);
const popcount = (value) => { let n = 0; for (; value; value &= value - 1) n++; return n; };

export function foodClues(dish) {
  return FOOD_GROUPS.filter((group) => group.pattern.test(dish.name)).map((group) => group.key);
}

export function dailyPlan({ dishes = [], budget = 40, reserve = 6, preference = 'all', avoid = '', variant = 0 } = {}) {
  const totalBudget = cents(budget), reserved = cents(reserve);
  if (!Number.isFinite(totalBudget) || totalBudget <= 0 || totalBudget > 30000 || !Number.isFinite(reserved) || reserved < 0 || reserved >= totalBudget) {
    return { ok: false, reason: '每天预算需在 0～300 元之间，预留金额需小于总预算。' };
  }
  if (!['all', 'light', 'vegetarian'].includes(preference)) return { ok: false, reason: '请选择有效的饮食偏好。' };
  const keywords = String(avoid).trim().slice(0, 60).split(/[、,，\s]+/).filter(Boolean);
  const eligible = (Array.isArray(dishes) ? dishes : []).filter((dish) => dish && typeof dish.name === 'string' && Array.isArray(dish.periods) && Number.isFinite(dish.price) && dish.price > 0
    && !keywords.some((word) => dish.name.includes(word))
    && (preference !== 'light' || dish.taste === '清淡')
    && (preference !== 'vegetarian' || (dish.tags?.some((tag) => ['素食', '蛋奶素'].includes(tag)) && !MEAT.test(dish.name))));
  const pools = PERIODS.map((period) => eligible.filter((dish) => dish.periods.includes(period)).map((dish) => {
    const clues = foodClues(dish), mask = FOOD_GROUPS.reduce((sum, group, index) => sum | (clues.includes(group.key) ? 1 << index : 0), 0);
    // 每餐主食、蛋白食物与蔬菜线索，以及不同食物组的覆盖，是演示设计权重。
    return { dish, price: cents(dish.price), clues, mask, score: (mask & 1 ? 4 : 0) + (mask & 4 ? 4 : 0) + (mask & 2 ? 3 : 0) };
  }));
  const absent = pools.flatMap((pool, index) => pool.length ? [] : [PERIODS[index]]);
  if (absent.length) return { ok: false, missingPeriods: absent, reason: '当前菜单缺少部分餐段的候选，请补录菜单或调整偏好。' };
  const minimum = pools.reduce((sum, pool) => sum + Math.min(...pool.map((item) => item.price)), 0);
  const allowance = totalBudget - reserved;
  if (minimum > allowance) return { ok: false, minimum: minimum / 100, reason: `按当前菜单和偏好，三餐最低合计 ¥${(minimum / 100).toFixed(2)}，超过扣除预留后的餐费。请调整预算或预留金额；不建议靠漏餐省钱。` };
  const best = [];
  for (const breakfast of pools[0]) for (const lunch of pools[1]) {
    if (breakfast.price + lunch.price > allowance) continue;
    for (const dinner of pools[2]) {
      const selected = [breakfast, lunch, dinner], total = breakfast.price + lunch.price + dinner.price;
      if (total > allowance) continue;
      const mask = breakfast.mask | lunch.mask | dinner.mask;
      const score = selected.reduce((sum, item) => sum + item.score, 0) + 5 * popcount(mask) + 2 * new Set(selected.map((item) => item.dish.name)).size;
      const plan = { selected, total, mask, score };
      if (best.length < 5 || score > best.at(-1).score || (score === best.at(-1).score && total < best.at(-1).total)) {
        best.push(plan); best.sort((a, b) => b.score - a.score || a.total - b.total); best.length = Math.min(best.length, 5);
      }
    }
  }
  const chosen = best[Math.abs(Math.trunc(Number(variant) || 0)) % best.length];
  return {
    ok: true, total: chosen.total / 100, budget: totalBudget / 100, reserve: reserved / 100, remaining: (totalBudget - chosen.total) / 100,
    meals: chosen.selected.map((item, index) => ({ ...item.dish, period: PERIODS[index], clues: item.clues })),
    clues: FOOD_GROUPS.filter((_, index) => chosen.mask & (1 << index)).map((group) => group.key),
    missing: FOOD_GROUPS.filter((_, index) => !(chosen.mask & (1 << index))).map((group) => group.key),
  };
}

export const LESSONS = Object.freeze({
  balance: { title: '一餐怎么搭？', body: '点餐时先想三件事：有主食吗，有蔬菜吗，有蛋、豆、鱼或肉等食物吗？尽量让食物种类丰富，实际分量按自己的食量选择。菜单名称不能告诉我们油盐用量和营养是否足够。' },
  breakfast: { title: '早餐怎么安排？', body: '按时吃早餐。可以从粥、面包等主食，蛋、奶或豆制品，以及蔬果中选择不同种类搭配。只买一杯饮料未必能满足一餐需要，是否吃够还要看实际份量。' },
  budget: { title: '预算有限怎么选？', body: '先给三餐留出预算，再按实际价格考虑蔬菜、蛋和豆制品等选择。少把有限的餐费花在含糖饮料上。若当前菜单无法在预算内安排三餐，调整条件或补充低价菜单，别把漏餐作为方案。' },
  drinks: { title: '饮料能代替水果吗？', body: '优先选择完整水果，果汁不能直接替代水果；日常饮水优先白水，少喝含糖饮料。奶类和豆类也各有特点，不能仅凭“都是白色饮品”就认定营养相同。' },
});
