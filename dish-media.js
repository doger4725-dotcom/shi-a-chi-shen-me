// 实拍照片只按固定菜品编号对应，表单内容不能指定外部图片地址。
const PHOTOS = Object.freeze({ 'lh3-09-22': 'black-duck-noodles-09.png' });
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export function dishPhoto(dish) {
  const id = dish?.dishId || dish?.id;
  return Object.hasOwn(PHOTOS, id) ? PHOTOS[id] : null;
}
export function dishVisual(dish) {
  const photo = dishPhoto(dish);
  return photo ? `<img class="dish-photo" src="${photo}" alt="09号窗口黑鸭肉酱拌面实拍" width="96" height="96" loading="lazy" decoding="async">` : escape(dish?.emoji || '🍚');
}
