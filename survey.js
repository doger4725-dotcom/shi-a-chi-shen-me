// 独立保存问卷，后续集中收集时可以沿用这些字段。
const STORAGE_KEY = 'chi-shen-me-wishes-v1';
const PERIODS = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' };
const CATEGORIES = ['米饭套餐', '粉面', '小吃', '轻食', '早餐点心', '其他'];
const TASTES = ['不限', '清淡', '微辣', '香辣'];
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const money = (n) => `¥${Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
const text = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';

function answerFrom(input = {}) {
  const price = Number(input.price), dish = text(input.dish, 60);
  const periods = [...new Set(Array.isArray(input.periods) ? input.periods.filter((key) => Object.hasOwn(PERIODS, key)) : [])];
  if (dish.length < 2 || !Number.isFinite(price) || price < 1 || price > 100 || !periods.length) return null;
  return { dish, price: Math.round(price * 100) / 100, periods,
    category: CATEGORIES.includes(input.category) ? input.category : '其他',
    taste: TASTES.includes(input.taste) ? input.taste : '不限',
    note: text(input.note, 300), alias: text(input.alias, 20) };
}

function csvCell(value) {
  let content = String(value ?? '');
  // 防止用户填写的文本被表格软件识别为公式。
  if (/^\s*[=+\-@\t\r]/.test(content)) content = "'" + content;
  return `"${content.replaceAll('"', '""')}"`;
}

export function createSurvey({ toast }) {
  const $ = (selector) => document.querySelector(selector);
  let records = [], draft = {}, editing = null;
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    records = (Array.isArray(stored.records) ? stored.records : []).slice(-200).flatMap((row) => {
      const answer = answerFrom(row);
      return answer && typeof row.id === 'string' && Number.isFinite(Date.parse(row.createdAt))
        ? [{ ...answer, id: row.id.slice(0, 80), createdAt: row.createdAt, updatedAt: row.updatedAt }] : [];
    });
    draft = stored.draft && typeof stored.draft === 'object' ? stored.draft : {};
  } catch { /* 损坏的记录不注入页面。 */ }

  const section = document.createElement('section');
  section.id = 'page-survey'; section.className = 'page'; section.hidden = true;
  section.innerHTML = `
    <div class="page-heading"><p class="eyebrow">第三食堂 · 菜品心愿问卷</p><h1>下一道<span>，你想吃什么？</span></h1><p>写下想新增的菜、期望价格和口味。</p></div>
    <div class="survey-layout">
      <section class="card form-card survey-compose" aria-labelledby="survey-title"><div class="section-top"><h2 id="survey-title">填写一份菜品心愿</h2><span class="source-tag">约30秒</span></div>
        <form id="wish-form">
          <div class="field"><label for="wish-dish">最想新增什么菜？</label><input id="wish-dish" name="dish" required minlength="2" maxlength="60" placeholder="例如：番茄牛腩饭"></div>
          <div class="survey-field-pair"><div class="field"><label for="wish-category">菜品类型</label><select id="wish-category" name="category">${CATEGORIES.map((name) => `<option>${name}</option>`).join('')}</select></div><div class="field"><label for="wish-price">希望多少钱一份？</label><input id="wish-price" name="price" type="number" min="1" max="100" step="0.5" inputmode="decimal" value="12" required></div></div>
          <fieldset class="wish-periods"><legend>希望哪个餐段能吃到？ <small>可多选</small></legend><div>${Object.entries(PERIODS).map(([key, name]) => `<label><input type="checkbox" name="periods" value="${key}" ${key === 'lunch' ? 'checked' : ''}>${name}</label>`).join('')}</div></fieldset>
          <div class="field"><label for="wish-taste">偏爱什么口味？</label><select id="wish-taste" name="taste">${TASTES.map((name) => `<option>${name}</option>`).join('')}</select></div>
          <div class="field"><label for="wish-note">还有什么期待？ <small>选填</small></label><textarea id="wish-note" name="note" maxlength="300" rows="3" placeholder="比如：多些蔬菜、份量可选、少油一点"></textarea></div>
          <div class="field"><label for="wish-alias">昵称 <small>选填</small></label><input id="wish-alias" name="alias" maxlength="20" placeholder="干饭同学"></div>
          <p class="survey-storage">保存在当前浏览器，导出后可交给项目组汇总。</p>
          <div class="survey-form-actions"><button class="button primary" id="wish-submit" type="submit">保存这份心愿 →</button><button class="text-button" id="wish-cancel" type="button" hidden>取消修改</button></div>
          <p id="wish-status" class="form-status" role="status"></p>
        </form>
      </section>
      <section class="survey-results" aria-labelledby="wish-results-title"><div class="card form-card"><div class="section-top"><h2 id="wish-results-title">本机心愿单</h2><span class="count-badge" id="wish-count">0</span></div><div class="wish-stats" id="wish-stats"></div><div class="survey-export"><button class="button secondary" id="wish-export-csv" type="button">导出表格 CSV ↓</button><button class="text-button" id="wish-export-json" type="button">导出备份 JSON ↓</button></div><p class="survey-storage">表格包含菜名、预算、餐段、口味和补充建议。</p></div><div id="wish-list" aria-live="polite"></div></section>
    </div>`;
  $('#main').append(section);
  const form = $('#wish-form');

  function readForm() {
    const input = new FormData(form);
    return { dish: input.get('dish'), price: input.get('price'), category: input.get('category'),
      taste: input.get('taste'), note: input.get('note'), alias: input.get('alias'), periods: input.getAll('periods') };
  }
  function fillForm(value = {}) {
    form.reset();
    for (const name of ['dish', 'price', 'category', 'taste', 'note', 'alias']) {
      if (value[name] !== undefined && value[name] !== null) form.elements[name].value = String(value[name]);
    }
    if (Array.isArray(value.periods)) form.querySelectorAll('[name="periods"]').forEach((box) => { box.checked = value.periods.includes(box.value); });
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, records, draft })); return true; }
    catch { $('#wish-status').textContent = '本次内容暂存在当前页，请先导出保存。'; return false; }
  }
  function render() {
    $('#wish-count').textContent = records.length;
    const distinct = new Set(records.map((row) => row.dish)).size;
    const average = records.length ? records.reduce((sum, row) => sum + row.price, 0) / records.length : 0;
    $('#wish-stats').innerHTML = `<div><strong>${distinct}</strong><span>种菜品心愿</span></div><div><strong>${records.length ? money(average) : '—'}</strong><span>平均期望价格</span></div>`;
    $('#wish-export-csv').disabled = $('#wish-export-json').disabled = records.length === 0;
    $('#wish-list').innerHTML = records.length ? [...records].reverse().map((row) => `<article class="card wish-record"><div class="section-top"><h3>${escape(row.dish)}</h3><strong>${money(row.price)}</strong></div><p>${escape(row.category)} · ${row.periods.map((key) => PERIODS[key]).join(' / ')} · ${escape(row.taste)}</p>${row.note ? `<p class="wish-note">${escape(row.note)}</p>` : ''}<div class="wish-record-footer"><small>${escape(row.alias || '干饭同学')} · ${new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric' }).format(new Date(row.createdAt))}</small><button class="text-button" type="button" data-edit-wish="${escape(row.id)}">修改</button></div></article>`).join('') : '<div class="card empty-state"><strong>写下第一道想吃的菜</strong><p>保存后会出现在这里。</p></div>';
  }
  function resetEditing(clearDraft = true) {
    editing = null; if (clearDraft) draft = {}; fillForm(draft); $('#wish-submit').textContent = '保存这份心愿 →';
    $('#wish-cancel').hidden = true;
  }
  fillForm(draft); render();
  form.addEventListener('input', () => { if (!editing) { draft = readForm(); save(); } });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const answer = answerFrom(readForm());
    if (!answer) { $('#wish-status').textContent = '请填写菜名、1～100元的期望价格，并至少选择一个餐段。'; return; }
    if (!editing && records.length >= 200) { $('#wish-status').textContent = '已保存200份，请先导出心愿单。'; return; }
    const now = new Date().toISOString(), previous = records.find((row) => row.id === editing);
    const row = { ...answer, id: previous?.id || crypto.randomUUID(), createdAt: previous?.createdAt || now, updatedAt: now };
    if (previous) records = records.map((item) => item.id === previous.id ? row : item); else records.push(row);
    resetEditing(); const stored = save(); render();
    $('#wish-status').textContent = stored ? '心愿已保存，可继续填写或导出给项目组。' : '心愿暂存在当前页，请先导出保存。';
  });
  $('#wish-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-edit-wish]'); if (!button) return;
    const record = records.find((row) => row.id === button.dataset.editWish); if (!record) return;
    editing = record.id; fillForm(record); $('#wish-submit').textContent = '保存修改 →'; $('#wish-cancel').hidden = false;
    $('#wish-status').textContent = '正在修改这份心愿。'; $('#wish-dish').focus();
  });
  $('#wish-cancel').addEventListener('click', () => { resetEditing(false); $('#wish-status').textContent = ''; });
  function download(type) {
    const rows = records.map((row) => [row.dish, row.price, row.category, row.periods.map((key) => PERIODS[key]).join(' / '), row.taste, row.note, row.alias, row.createdAt]);
    const content = type === 'csv' ? '\uFEFF' + [['想吃的菜品', '期望价格', '菜品类型', '用餐时段', '口味', '补充建议', '昵称', '填写时间'], ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
      : JSON.stringify({ version: 1, canteen: '安徽大学龙河校区第三食堂', exportedAt: new Date().toISOString(), records }, null, 2);
    const url = URL.createObjectURL(new Blob([content], { type: type === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `第三食堂菜品心愿_${new Date().toISOString().slice(0, 10)}.${type}`;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast(`已导出 ${records.length} 份菜品心愿。`);
  }
  $('#wish-export-csv').addEventListener('click', () => download('csv'));
  $('#wish-export-json').addEventListener('click', () => download('json'));
}
