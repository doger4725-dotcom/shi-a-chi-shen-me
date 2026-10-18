import { dailyPlan, FOOD_GROUPS, LESSONS } from './nutrition.js';
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const money = (value) => `¥${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
const periodLabels = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' };
const groupLabel = (key) => FOOD_GROUPS.find((group) => group.key === key)?.label || key;
const bowl = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 28c-2-14 12-17 20-8 11-14 23-3 17 9" fill="#cbdc86"/><path d="M17 24c-9-11 4-20 11-9" fill="#e8bd58"/><path d="M8 28h48c-2 29-46 29-48 0" fill="#fff9e8" stroke="#45614b" stroke-width="2.5"/><path d="M16 53h32" stroke="#45614b" stroke-width="3" stroke-linecap="round"/><circle cx="25" cy="37" r="2" fill="#45614b"/><circle cx="40" cy="37" r="2" fill="#45614b"/><path d="M29 43q4 4 8 0" fill="none" stroke="#e46a42" stroke-width="2" stroke-linecap="round"/></svg>';

export function createNutrition({ getMenu, getMenuMode, selectMeal, toast }) {
  const $ = (selector) => document.querySelector(selector);
  let variant = 0, plan = null, aiReady = false, aiBusy = false, conversation = [];
  document.body.insertAdjacentHTML('beforeend', `
    <button class="nutrition-launch" id="nutrition-launch" aria-haspopup="dialog" aria-label="打开营养饭搭子">${bowl}<span><strong>营养饭搭子</strong><small>今天，也要好好吃饭</small></span><span aria-hidden="true">↗</span></button>
    <dialog id="nutrition-dialog" class="nutrition-dialog" aria-labelledby="nutrition-title">
      <button class="dialog-close" id="nutrition-close" aria-label="关闭营养饭搭子">×</button>
      <header class="nutrition-heading"><div class="nutrition-avatar">${bowl}</div><div><p class="eyebrow">陪你把一日三餐搭配好</p><h2 id="nutrition-title">你好，我是营养饭搭子</h2><span class="nutrition-mode">三餐搭配 · 营养问答</span></div></header>
      <p class="nutrition-greeting">告诉我一天想花多少钱，我会从当前菜单里帮你组合三餐，再一起看看还可以补充什么。</p>
      <div class="segmented nutrition-tabs"><button id="nutrition-plan-tab" class="selected" aria-pressed="true">每日计划</button><button id="nutrition-learn-tab" aria-pressed="false">搭配课堂</button><button id="nutrition-ai-tab" aria-pressed="false">问问 AI</button></div>
      <section id="nutrition-plan-panel" aria-label="每日饮食计划">
        <form id="nutrition-form"><div class="nutrition-fields">
          <div class="field"><label for="nutrition-budget">一天的总预算 <span class="field-hint">元 / 天</span></label><input id="nutrition-budget" type="number" min="1" max="300" step="0.01" value="40" required></div>
          <div class="field"><label for="nutrition-reserve">先预留给加餐 <span class="field-hint">元</span></label><input id="nutrition-reserve" type="number" min="0" max="299" step="0.01" value="6" required></div>
          <div class="field"><label for="nutrition-preference">我的偏好</label><select id="nutrition-preference"><option value="all">都可以，丰富一点</option><option value="light">清淡口味</option><option value="vegetarian">蛋奶素候选</option></select></div>
          <div class="field"><label for="nutrition-avoid">避开菜名关键词 <span class="field-hint">可选</span></label><input id="nutrition-avoid" maxlength="60" placeholder="如：牛肉、青椒"></div>
        </div><p class="nutrition-note">关键词按菜名匹配。</p><button class="button primary" type="submit">帮我搭配今天三餐 →</button></form>
        <div id="nutrition-result" class="nutrition-result" aria-live="polite"><div class="nutrition-empty">🥬 <strong>把预算交给我，把饭好好吃。</strong><p>生成后会展示三餐价格、搭配线索和补充建议。</p></div></div>
      </section>
      <section id="nutrition-learn-panel" hidden aria-label="搭配小课堂"><p class="nutrition-note">点一个问题，看看基础搭配知识。</p><div class="nutrition-questions">${Object.entries(LESSONS).map(([key, lesson]) => `<button data-nutrition-lesson="${key}">${escape(lesson.title)} ↗</button>`).join('')}</div><article class="nutrition-lesson" id="nutrition-lesson"><h3>${LESSONS.balance.title}</h3><p>${LESSONS.balance.body}</p></article></section>
      <section id="nutrition-ai-panel" hidden aria-label="DeepSeek 营养对话"><div class="nutrition-ai-state" id="nutrition-ai-state" role="status">正在检查 AI 配置…</div><p class="nutrition-note">发送内容：问题、预算偏好、菜单与最近对话。由DeepSeek回答。</p><div id="nutrition-chat" class="nutrition-chat" role="log" aria-label="营养对话记录"><p class="nutrition-chat-empty">可以问我：“帮我解释今天的三餐搭配”或“食堂午餐怎么搭配更丰富？”</p></div><form id="nutrition-ai-form"><div class="field"><label for="nutrition-question">想聊聊怎么吃？</label><textarea id="nutrition-question" maxlength="600" rows="3" required placeholder="例如：按上面的预算，今天三餐这样搭配有什么不足？"></textarea></div><button class="button primary" id="nutrition-ai-send" type="submit" disabled>发送给 DeepSeek →</button></form><button class="text-button nutrition-clear" id="nutrition-chat-clear">清空本页对话</button></section>
      <details class="nutrition-method"><summary>建议依据与使用说明</summary><p>组合规则：在预算内，按菜名识别主食、蔬菜和蛋白食物，优先搭配不同食物组。</p><p>食材按菜名分类；菜单未提供分量、热量与油盐数据。</p><p><a href="https://dg.cnsoc.org/article/04/D5ZFYyhzTgmHGvOsfS-1hg.html" target="_blank" rel="noopener noreferrer">中国居民膳食指南：食物多样</a> · <a href="https://dg.cnsoc.org/article/04/wDCyy7cWSJCN6pwKHOo5Dw.html" target="_blank" rel="noopener noreferrer">规律进餐</a> · <a href="https://www.who.int/zh/news-room/fact-sheets/detail/healthy-diet" target="_blank" rel="noopener noreferrer">WHO 健康饮食</a></p><p>基础搭配与知识卡不调用模型；“问问 AI”由服务器连接 DeepSeek，仅主动发送问题时调用。计划与对话仅在本页展示，服务器只记录使用次数；选择某餐后还需确认用餐才记账。</p></details>
    </dialog>`);

  function tab(selected) {
    for (const name of ['plan', 'learn', 'ai']) {
      const active = name === selected;
      $(`#nutrition-${name}-panel`).hidden = !active;
      $(`#nutrition-${name}-tab`).classList.toggle('selected', active); $(`#nutrition-${name}-tab`).setAttribute('aria-pressed', String(active));
    }
    if (selected === 'ai') checkAI();
  }
  function render() {
    const target = $('#nutrition-result');
    if (!plan.ok) { target.innerHTML = `<div class="nutrition-empty"><strong>这次还搭不齐三餐</strong><p>${escape(plan.reason)}</p>${plan.missingPeriods ? `<p>缺少：${plan.missingPeriods.map((period) => periodLabels[period]).join('、')}</p>` : ''}</div>`; return; }
    const supplements = [];
    if (plan.missing.includes('vegetable')) supplements.push('考虑补一份蔬菜，并向窗口确认套餐中的蔬菜分量。');
    if (plan.missing.includes('protein')) supplements.push('考虑补充鸡蛋、豆制品等食物；按实际价格和个人需要选择。');
    if (plan.missing.includes('fruit')) supplements.push('可考虑一份完整水果，按实际价格购买。');
    if (plan.missing.includes('dairy')) supplements.push('可考虑奶类，或按个人耐受与偏好选择合适替代品。');
    if (plan.missing.includes('wholegrain')) supplements.push('菜单中未识别到全谷杂粮线索，可看看是否有杂粮饭或燕麦。');
    if (plan.missing.includes('staple')) supplements.push('菜单中未识别到主食，请核对三餐是否需要补充米饭、面食等。');
    target.innerHTML = `<div class="nutrition-plan-top"><div><p class="eyebrow">今天的三餐草案</p><h3>好好吃饭，也照顾预算。</h3></div><span class="source-tag">${getMenuMode() === 'campus' ? '10/18照片菜单' : getMenuMode() === 'collected' ? '本机补录菜单' : '演示菜单'}</span></div>
      <div class="nutrition-totals"><div><small>菜单内三餐</small><strong>${money(plan.total)}</strong></div><div><small>预算尚余</small><strong>${money(plan.remaining)}</strong></div><div><small>原计划预留</small><strong>${money(plan.reserve)}</strong></div></div>
      ${plan.meals.map((meal, index) => `<article class="nutrition-meal"><span class="nutrition-period">${periodLabels[meal.period]}</span><div class="nutrition-meal-name"><span aria-hidden="true">${escape(meal.emoji || '🍚')}</span><div><h4>${escape(meal.name)}</h4><p>${escape(meal.windowName || '窗口待确认')} · ${meal.verified ? '已采集价' : '示例价'}</p></div><strong>${money(meal.price)}</strong></div><p class="nutrition-clues">搭配线索：${meal.clues.length ? meal.clues.map(groupLabel).join('、') : '食材待录入'}。</p><button class="text-button" data-nutrition-pick="${index}">选这餐，查看排队与确认用餐 →</button></article>`).join('')}
      <div class="nutrition-supplements"><h4>再补充一点，更丰富</h4><ul>${(supplements.length ? supplements : ['这组菜名已覆盖多个食物组。']).map((text) => `<li>${escape(text)}</li>`).join('')}</ul><p>补充项未计价，不计入合计。</p></div><button class="button secondary" id="nutrition-another">换一组三餐 ↻</button>`;
  }
  function generate() {
    plan = dailyPlan({ dishes: getMenu(), budget: $('#nutrition-budget').value, reserve: $('#nutrition-reserve').value, preference: $('#nutrition-preference').value, avoid: $('#nutrition-avoid').value, variant });
    render();
  }
  $('#nutrition-launch').addEventListener('click', () => { $('#nutrition-dialog').showModal(); if (plan) generate(); });
  $('#nutrition-close').addEventListener('click', () => $('#nutrition-dialog').close());
  $('#nutrition-plan-tab').addEventListener('click', () => tab('plan'));
  $('#nutrition-learn-tab').addEventListener('click', () => tab('learn'));
  $('#nutrition-ai-tab').addEventListener('click', () => tab('ai'));
  $('#nutrition-form').addEventListener('submit', (event) => { event.preventDefault(); variant = 0; generate(); });
  $('#nutrition-form').addEventListener('input', () => {
    if (!plan) return;
    plan = null;
    $('#nutrition-result').innerHTML = '<div class="nutrition-empty"><strong>条件已更新</strong><p>请重新生成三餐计划，按新的预算和偏好搭配。</p></div>';
  });
  $('#nutrition-result').addEventListener('click', (event) => {
    if (event.target.closest('#nutrition-another')) { variant++; generate(); toast('已重新组合；菜单有限时可能出现相同搭配。'); }
    const pick = event.target.closest('[data-nutrition-pick]');
    if (pick && plan?.ok) { const meal = plan.meals[Number(pick.dataset.nutritionPick)]; if (meal) { $('#nutrition-dialog').close(); selectMeal(meal); } }
  });
  $('.nutrition-questions').addEventListener('click', (event) => {
    const button = event.target.closest('[data-nutrition-lesson]'), lesson = LESSONS[button?.dataset.nutritionLesson];
    if (lesson) $('#nutrition-lesson').innerHTML = `<h3>${escape(lesson.title)}</h3><p>${escape(lesson.body)}</p>`;
  });
  window.addEventListener('auth-changed',()=>{aiReady=false;conversation=[];renderChat();$('#nutrition-ai-send').disabled=true;if(!$('#nutrition-ai-panel').hidden)checkAI();});
  async function checkAI() {
    if (aiBusy) return;
    try {
      const response = {ok:true,status:200,json:async()=>({configured:false,message:'基础搭配可用；DeepSeek待接服务器。'})};
      const data = await response.json(); aiReady = response.ok && data.configured === true;
      $('#nutrition-ai-state').textContent = data.message || data.error || '暂时无法检查 AI 配置。';
      if (response.status === 401) $('#nutrition-ai-state').insertAdjacentHTML('beforeend', ' <a href="#login" target="_top">去登录 →</a>');
      if (aiReady && !conversation.some((item) => item.role === 'assistant')) $('.nutrition-mode').textContent = '三餐搭配 · DeepSeek已配置';
    } catch { aiReady = false; $('#nutrition-ai-state').textContent = '暂时无法检查 AI 连接，基础搭配仍可使用。'; }
    $('#nutrition-ai-send').disabled = !aiReady || aiBusy;
  }
  function renderChat() {
    $('#nutrition-chat').innerHTML = conversation.length ? conversation.map((item) => `<article class="nutrition-message ${item.role}"><small>${item.role === 'user' ? '你' : '饭搭子 · DeepSeek'}</small><p>${escape(item.content)}</p></article>`).join('') : '<p class="nutrition-chat-empty">聊聊今天的三餐，或问一个搭配问题。</p>';
  }
  $('#nutrition-chat-clear').addEventListener('click', () => { if (!aiBusy) { conversation = []; renderChat(); } });
  $('#nutrition-ai-form').addEventListener('submit', async (event) => {
    event.preventDefault(); if (aiBusy || !aiReady) return;
    const question = $('#nutrition-question').value.trim(); if (!question) return;
    const body = { question, history: conversation.slice(-6), menu: getMenu(), menuMode: getMenuMode(), budget: Number($('#nutrition-budget').value), reserve: Number($('#nutrition-reserve').value), preference: $('#nutrition-preference').value, avoid: $('#nutrition-avoid').value };
    aiBusy = true; $('#nutrition-ai-send').disabled = true; $('#nutrition-chat-clear').disabled = true;
    $('#nutrition-ai-state').textContent = '饭搭子正在思考搭配，请稍候…';
    try {
      const response = await fetch('/api/nutrition', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(35000) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'AI 暂时无法回应。');
      if (typeof data.reply !== 'string' || data.verified !== true) throw new Error('AI 没有返回有效回复，请重试。');
      conversation.push({ role: 'user', content: question }, { role: 'assistant', content: data.reply }); conversation = conversation.slice(-20);
      renderChat(); $('#nutrition-question').value = ''; $('#nutrition-ai-state').textContent = 'DeepSeek 已连接'; $('.nutrition-mode').textContent = '基础搭配 + DeepSeek 对话';
    } catch (error) { $('#nutrition-ai-state').textContent = error.name === 'TimeoutError' ? '回复超时，请稍后重试；基础搭配仍可使用。' : error.message || '暂时无法连接 AI。'; }
    finally { aiBusy = false; $('#nutrition-ai-send').disabled = !aiReady; $('#nutrition-chat-clear').disabled = false; }
  });
}
