const $=(s)=>document.querySelector(s);
const escape=(v)=>String(v??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const when=(t)=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(t));
const kindNames={'guide':'食堂攻略','app-issue':'APP 问题报错','service-review':'餐饮服务评价','dish-review':'菜品评价','reply':'攻略回复'};
async function api(query='',options={}){ throw new Error('共享讨论、反馈和评分待接服务器。');
  let response;
  try{response=await fetch('/api/community'+query,{...options,headers:{'Content-Type':'application/json',...options.headers}});}catch{throw new Error('暂时连接不上讨论与反馈，请检查网络后重试。');}
  let data;try{data=await response.json();}catch{throw new Error('讨论与反馈暂不可用，请稍后重试。');}
  if(!response.ok){const error=new Error(data.error||'发布没有成功，请重试。');error.signInPath=data.signInPath;throw error;}
  return data;
}
function failureHTML(error){return `<div class="empty-state"><strong>${escape(error.message)}</strong>${error.signInPath?`<a class="button secondary" href="${escape(error.signInPath)}" target="_top">登录后发布 →</a>`:'<p>当前可体验选饭、TimeShift、记账和基础营养搭配。</p>'}</div>`;}
function setStatus(id,error){const element=$(id);element.innerHTML=error.signInPath?`${escape(error.message)} <a href="${escape(error.signInPath)}" target="_top">去登录 →</a>`:escape(error.message);}
function stars(groupId,labelId){
  let selected=0;const group=$(groupId),label=$(labelId);
  function paint(){group.innerHTML=[1,2,3,4,5].map((n)=>`<button type="button" role="radio" aria-checked="${n===selected}" aria-label="${n} 颗星" data-star="${n}" class="${n<=selected?'lit':''}">${n<=selected?'★':'☆'}</button>`).join('');label.textContent=selected?`${selected} / 5 颗星`:'请选择 1～5 颗星';}
  group.addEventListener('click',(event)=>{const button=event.target.closest('[data-star]');if(button){selected=Number(button.dataset.star);paint();group.querySelector(`[data-star="${selected}"]`).focus();}});
  group.addEventListener('keydown',(event)=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();selected=Math.max(1,Math.min(5,(selected||1)+(['ArrowRight','ArrowUp'].includes(event.key)?1:-1)));paint();group.querySelector(`[data-star="${selected}"]`).focus();});
  paint();return{get:()=>selected,set:(n)=>{selected=n||0;paint();}};
}
export function createCommunity({toast,refreshLedger,refreshMenu}){
  let ratings=[],ownReviews=[],loaded=false,reviewEntry=null,activeKind='app-issue',thread=null;
  let guideOffset=0,feedbackOffset=0,replyOffset=0;
  const postCache=new Map();
  let nickname='';try{nickname=localStorage.getItem('chi-shen-me-alias')||'';}catch{}
  const saveAlias=(value)=>{nickname=value.trim();try{localStorage.setItem('chi-shen-me-alias',nickname);}catch{}};
  ['#guide-alias','#feedback-alias','#review-alias','#reply-alias'].forEach((id)=>$(id).value=nickname);
  const dishStars=stars('#dish-stars','#dish-star-label'),serviceStars=stars('#service-stars','#service-star-label');
  const reviewFor=(mealKey)=>ownReviews.find((r)=>r.mealKey===mealKey);
  const ratingsFor=(id)=>{const r=ratings.find((r)=>r.dishId===id);return r?{average:Number(r.average).toFixed(1),count:Number(r.count)}:null;};
  async function loadMeta(){try{const data=await api('?view=meta');ratings=data.ratings;ownReviews=data.reviews;loaded=true;refreshLedger();refreshMenu();}catch{loaded=false;}}
  function postHTML(post,reply=false){
    postCache.set(post.id,post);
    return `<article class="community-post ${reply?'reply-post':'card'}" data-post-id="${escape(post.id)}"><div class="post-meta"><span class="post-avatar" aria-hidden="true">${escape((post.alias||'同').slice(0,1))}</span><span><strong>${escape(post.alias)}</strong><small>${when(post.createdAt)}${post.updatedAt>post.createdAt?' · 已更新':''}</small></span>${post.mine?`<button class="text-button withdraw-button" data-withdraw="${escape(post.id)}">撤回</button>`:''}</div>${post.title?`<h3>${escape(post.title)}</h3>`:''}${post.dishName?`<h3>${escape(post.dishName)}</h3>`:''}${post.rating?`<div class="post-rating" aria-label="${post.rating}颗星，满分5颗星">${'★'.repeat(post.rating)}<span>${'☆'.repeat(5-post.rating)}</span><small>${post.rating}/5</small></div>`:''}${post.windowName?`<p class="post-window">第三食堂 · ${escape(post.windowName)}</p>`:''}<p class="post-body">${escape(post.body||'这位同学留下了星级评分。')}</p>${post.kind==='guide'?`<button class="text-button thread-button" data-thread="${escape(post.id)}">看看讨论 · 我也来说说 →</button>`:''}</article>`;
  }
  async function loadFeed(type,append=false){
    const guide=type==='guide',feed=$(guide?'#guide-feed':'#feedback-feed'),more=$(guide?'#more-guides':'#more-feedback');
    const offset=append?(guide?guideOffset:feedbackOffset):0;
    if(!append)feed.innerHTML='<div class="empty-state">正在加载大家的内容…</div>';
    more.disabled=true;
    try{
      const data=await api(`?kind=${encodeURIComponent(type)}&offset=${offset}`);
      // 切换分类后，旧请求的返回不能覆盖新分类。
      if(!guide&&type!==activeKind)return;
      const html=data.posts.map((post)=>postHTML(post)).join('');
      if(append)feed.insertAdjacentHTML('beforeend',html);else feed.innerHTML=html||`<div class="empty-state card"><span class="empty-icon" aria-hidden="true">${guide?'🥢':'✍'}</span><strong>还没有${kindNames[type]}</strong><p>${guide?'把你的第一篇食堂攻略分享出来吧。':type==='dish-review'?'用餐后打个分，让同学选饭时多一点参考。':'写下你的亲身体验和具体建议。'}</p></div>`;
      if(guide)guideOffset=offset+data.posts.length;else feedbackOffset=offset+data.posts.length;
      more.hidden=!data.hasMore;
    }catch(error){if(!guide&&type!==activeKind)return;if(!append)feed.innerHTML=failureHTML(error);else toast(error.message);more.hidden=true;}finally{more.disabled=false;}
  }
  function selectFeedback(kind){
    activeKind=kind;$('#feedback-compose').hidden=kind==='dish-review';$('#dish-feedback-note').hidden=kind!=='dish-review';$('#service-rating-field').hidden=kind!=='service-review';
    $('#feedback-form-heading').textContent=kind==='service-review'?'评价食堂餐饮服务':'反馈 APP 使用问题';
    $('#feedback-feed-heading').textContent=kindNames[kind];
    $('#feedback-body-label').textContent=kind==='service-review'?'这次餐饮服务体验':'操作步骤和遇到的问题';
    $('#feedback-body').placeholder=kind==='service-review'?'出餐速度、服务态度、用餐环境，有哪些具体感受或建议？':'在哪个页面做了什么？出现了什么现象？你希望怎样改进？';
    $('#feedback-status').textContent='';
    document.querySelectorAll('[data-feedback]').forEach((button)=>{const active=button.dataset.feedback===kind;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));});loadFeed(kind);
  }
  function openReview(entry){
    reviewEntry=entry;const existing=reviewFor(entry.id);
    $('#review-title').textContent=`${entry.name}，打几颗星？`;$('#review-dish-meta').textContent=`第三食堂 · ${entry.windowName||'用餐记录'} · ${when(entry.date)}`;
    $('#review-body').value=existing?.body||'';$('#review-alias').value=existing?.alias||nickname;
    dishStars.set(existing?.rating||0);$('#review-status').textContent='';$('#submit-review').textContent=existing?'保存修改后的评价 →':'提交这顿的评价 →';$('#review-dialog').showModal();
  }
  async function submit(formId,statusId,payload,onSuccess){
    const button=$(formId).querySelector('button[type="submit"]');button.disabled=true;$(statusId).textContent='正在保存…';
    try{const data=await api('',{method:'POST',body:JSON.stringify(payload)});saveAlias(payload.alias||'干饭同学');$(statusId).textContent='已保存。';await onSuccess(data.post);}catch(error){setStatus(statusId,error);}finally{button.disabled=false;}
  }
  $('#guide-form').addEventListener('submit',(event)=>{event.preventDefault();submit('#guide-form','#guide-status',{kind:'guide',alias:$('#guide-alias').value||'干饭同学',title:$('#guide-title').value,windowName:$('#guide-window').value,body:$('#guide-body').value},async()=>{$('#guide-title').value='';$('#guide-body').value='';await loadFeed('guide');toast('攻略已发布，饭友可以继续回复讨论。');});});
  $('#feedback-form').addEventListener('submit',(event)=>{event.preventDefault();if(activeKind==='service-review'&&!serviceStars.get()){$('#feedback-status').textContent='请先给餐饮服务选 1～5 颗星。';return;}const kind=activeKind;submit('#feedback-form','#feedback-status',{kind,alias:$('#feedback-alias').value||'干饭同学',windowName:$('#feedback-window').value,body:$('#feedback-body').value,rating:serviceStars.get()},async()=>{$('#feedback-body').value='';serviceStars.set(0);await loadFeed(kind);toast('反馈已保存，谢谢你写下体验。');});});
  $('#review-form').addEventListener('submit',(event)=>{event.preventDefault();if(!reviewEntry)return;if(!dishStars.get()){$('#review-status').textContent='请先选择 1～5 颗星。';return;}const entry=reviewEntry;submit('#review-form','#review-status',{kind:'dish-review',alias:$('#review-alias').value||'干饭同学',rating:dishStars.get(),body:$('#review-body').value,dishId:entry.dishId||`legacy-${entry.name}`,dishName:entry.name,mealKey:entry.id,windowName:entry.windowName||''},async()=>{$('#review-dialog').close();await loadMeta();if(!$('#page-feedback').hidden&&activeKind==='dish-review')await loadFeed(activeKind);toast('这顿的星级和评论已保存。');});});
  $('#feedback-tabs').addEventListener('click',(event)=>{const button=event.target.closest('[data-feedback]');if(button)selectFeedback(button.dataset.feedback);});
  $('#refresh-guides').addEventListener('click',()=>loadFeed('guide'));$('#more-guides').addEventListener('click',()=>loadFeed('guide',true));
  $('#refresh-feedback').addEventListener('click',()=>loadFeed(activeKind));$('#more-feedback').addEventListener('click',()=>loadFeed(activeKind,true));
  async function loadReplies(append=false){
    if(!thread)return;const parentId=thread.id,offset=append?replyOffset:0;$('#more-replies').disabled=true;
    try{const data=await api(`?kind=reply&parentId=${encodeURIComponent(parentId)}&offset=${offset}`);if(thread?.id!==parentId)return;const html=data.posts.map((p)=>postHTML(p,true)).join('');if(append)$('#thread-replies').insertAdjacentHTML('beforeend',html);else $('#thread-replies').innerHTML=html||'<p class="community-intro">还没有回复，可以从你的体验聊起。</p>';replyOffset=offset+data.posts.length;$('#more-replies').hidden=!data.hasMore;}catch(error){$('#thread-replies').innerHTML=failureHTML(error);}finally{$('#more-replies').disabled=false;}
  }
  $('#more-replies').addEventListener('click',()=>loadReplies(true));
  $('#reply-form').addEventListener('submit',(event)=>{event.preventDefault();if(!thread)return;submit('#reply-form','#reply-status',{kind:'reply',parentId:thread.id,alias:$('#reply-alias').value||'干饭同学',body:$('#reply-body').value},async()=>{$('#reply-body').value='';await loadReplies();toast('回复已发布。');});});
  document.addEventListener('click',async(event)=>{
    const threadButton=event.target.closest('[data-thread]');
    if(threadButton){thread=postCache.get(threadButton.dataset.thread);if(!thread)return;$('#thread-title').textContent=thread.title;$('#thread-original').innerHTML=`<p class="post-window">${escape(thread.alias)} · ${when(thread.createdAt)}</p><p class="post-body">${escape(thread.body)}</p>`;$('#reply-status').textContent='';$('#reply-body').value='';$('#thread-replies').textContent='正在加载讨论…';$('#thread-dialog').showModal();loadReplies();}
    const withdraw=event.target.closest('[data-withdraw]');
    if(withdraw){withdraw.disabled=true;try{await api('',{method:'DELETE',body:JSON.stringify({id:withdraw.dataset.withdraw})});await loadMeta();if(!$('#page-discussion').hidden)await loadFeed('guide');if(!$('#page-feedback').hidden)await loadFeed(activeKind);if($('#thread-dialog').open)await loadReplies();toast('你的这条内容已撤回。');}catch(error){toast(error.message);withdraw.disabled=false;}}
  });
  window.addEventListener('auth-changed',()=>{ownReviews=[];postCache.clear();loadMeta();if(!$('#page-discussion').hidden)loadFeed('guide');if(!$('#page-feedback').hidden)loadFeed(activeKind);});
  loadMeta();
  return{openReview,reviewFor,ratingsFor,isLoaded:()=>loaded,loadMeta,loadPage:(page)=>{if(page==='discussion')loadFeed('guide');if(page==='feedback')loadFeed(activeKind);}};
}
