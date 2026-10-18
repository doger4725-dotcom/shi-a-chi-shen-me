// 每个菜品使用最近一次个人评价；修改同一条评价会替换，倍数不会累乘。
export const RATING_FACTORS = Object.freeze({ 1: 0.25, 2: 0.5, 3: 1, 4: 1.5, 5: 2 });
export const validRating = (rating) => Number.isInteger(rating) && rating >= 1 && rating <= 5;
export function ratingOutcome(rating) {
  return rating >= 4 && validRating(rating) ? '出金了' : rating <= 2 && validRating(rating) ? '歪了' : validRating(rating) ? '中规中矩' : '新口味';
}
export function latestRatings(entries = []) {
  const ratings = new Map();
  for (const entry of entries) {
    if (!entry?.dishId || !validRating(entry.personalRating)) continue;
    const at = Date.parse(entry.ratedAt || entry.date);
    if (!Number.isFinite(at)) continue;
    const previous = ratings.get(entry.dishId);
    if (!previous || at >= previous.at) ratings.set(entry.dishId, { rating: entry.personalRating, at });
  }
  return ratings;
}
export function personalizeCandidates(items, entries) {
  const ratings = latestRatings(entries);
  return items.map((item) => {
    const personalRating = ratings.get(item.id)?.rating ?? null;
    const preferenceFactor = RATING_FACTORS[personalRating] ?? 1;
    return { ...item, personalRating, preferenceFactor,
      fitData: { ...item.fitData, baseWeight: item.fitData.weight, weight: item.fitData.weight * preferenceFactor } };
  }).sort((a, b) => b.fitData.weight - a.fitData.weight || a.id.localeCompare(b.id));
}
