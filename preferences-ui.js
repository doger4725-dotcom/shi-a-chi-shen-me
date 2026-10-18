import { validRating, ratingOutcome, RATING_FACTORS } from './preferences.js';
const $ = (selector) => document.querySelector(selector);
export function createPreferencesUI({ getEntries, save, onChange, onShare, toast }) {
  document.body.insertAdjacentHTML('beforeend', `<dialog id="personal-review-dialog" aria-labelledby="personal-review-title">
    <button type="button" class="dialog-close" id="close-personal-review" aria-label="关闭个人评价">×</button>
    <p class="eyebrow">吃完了，这张卡怎么样？</p><h2 id="personal-review-title">给这顿打个分</h2>
    <p id="personal-review-dish" class="community-intro"></p>
    <form id="personal-review-form"><fieldset class="personal-stars"><legend>我的评分</legend>
    ${[1,2,3,4,5].map(n => `<label><input type="radio" name="personal-stars" value="${n}" required aria-label="${n}星"><span aria-hidden="true">★</span><small>${n}星</small></label>`).join('')}</fieldset>
    <p id="personal-rating-effect" role="status">4～5星更常抽到，1～2星减少，3星保持。</p>
    <div class="field"><label for="personal-comment">这道菜吃起来怎么样？（可选）</label><textarea id="personal-comment" maxlength="1500" rows="3" placeholder="口味、分量，下次还想吃吗？"></textarea></div>
    <p class="personal-storage-note">个人评价保存在当前浏览器，用于调整你的抽卡概率。</p>
    <button class="button primary" type="submit">保存评价，更新概率 →</button>
    <button class="button secondary" id="clear-personal-rating" type="button" hidden>清除这次评价</button>
    
    </form></dialog>`);
  let entryId = null;
  const dialog = $('#personal-review-dialog');
  const entry = () => getEntries().find(item => item.id === entryId);
  function effect(rating) {
    $('#personal-rating-effect').textContent = validRating(rating)
      ? `${ratingOutcome(rating)} · 本次评价保存后，抽取权重 ×${RATING_FACTORS[rating]}`
      : '4～5星更常抽到，1～2星减少，3星保持。';
    $('#personal-rating-effect').className = rating >= 4 ? 'rating-gold' : rating && rating <= 2 ? 'rating-miss' : '';
  }
  function commit() {
    const item = entry();
    if (!item) { dialog.close(); toast('这条用餐记录已删除。'); return null; }
    const rating = Number(new FormData($('#personal-review-form')).get('personal-stars'));
    if (!validRating(rating)) { $('#personal-review-form').reportValidity(); return null; }
    Object.assign(item, { personalRating: rating, personalComment: $('#personal-comment').value.trim().slice(0,1500), ratedAt: new Date().toISOString() });
    const stored = save(); onChange();
    toast(stored ? `${ratingOutcome(rating)}！已更新 ${item.name} 的抽卡权重。` : '评价暂存本页，刷新后可能丢失。');
    return item;
  }
  $('#personal-review-form').addEventListener('change', event => { if (event.target.name === 'personal-stars') effect(Number(event.target.value)); });
  $('#personal-review-form').addEventListener('submit', event => { event.preventDefault(); if (commit()) dialog.close(); });
  $('#close-personal-review').addEventListener('click', () => dialog.close());
  $('#share-personal-rating')?.addEventListener('click', () => { const item = commit(); if (item) { dialog.close(); onShare(item); } });
  $('#clear-personal-rating').addEventListener('click', () => {
    const item = entry(); if (item) { delete item.personalRating; delete item.personalComment; delete item.ratedAt; save(); onChange(); toast('已清除这次评价，按剩余最近一次评价计算。'); } dialog.close();
  });
  return { open(id) {
    entryId = id; const item = entry(); if (!item) return;
    $('#personal-review-form').reset();
    $('#personal-review-dish').textContent = `${item.name} · ${item.windowName || '第三食堂'}`;
    if (validRating(item.personalRating)) $(`input[name="personal-stars"][value="${item.personalRating}"]`).checked = true;
    $('#personal-comment').value = typeof item.personalComment === 'string' ? item.personalComment : '';
    $('#clear-personal-rating').hidden = !validRating(item.personalRating);
    effect(item.personalRating); dialog.showModal();
  } };
}
