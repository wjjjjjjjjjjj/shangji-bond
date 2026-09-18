const $ = (id) => document.getElementById(id);
const escape = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeLink = value => {try {const u=new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch {return '';}};
let data = null, category = '', page = 1, lastTrigger = null;
const pageSize = 12;
const today = () => new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const daysBetween = (a,b) => (Date.parse(a+'T00:00:00+08:00')-Date.parse(b+'T00:00:00+08:00'))/86400000;
const tagClass = t => ({'采购意向':'intent','采购需求':'demand','更正公告':'change'}[t] || '');
function budget(r) {if(r.budgetYuan === null) return `<span class="budget-amount unknown">${r.budgetRaw === '未识别' ? '预算未识别' : '详见预算原文'}</span>`; const n=r.budgetYuan/10000; return `<span class="budget-amount">${new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(n)}<small>万元</small></span>`;}
function deadline(r) {if(!r.deadlineDate) return `截止时间未识别${r.autoClearDate?`<span class="deadline-note due">自动清除日 ${escape(r.autoClearDate)}</span>`:''}`; const d=daysBetween(r.deadlineDate,today()); return `${escape(r.deadlineDate)}${d<0?'<span class="deadline-note">已过截止日期</span>':d===0?'<span class="deadline-note due">截止日为今天</span>':d<=7?`<span class="deadline-note due">${d} 天后截止</span>`:''}`;}
function selectedRecords(){
  const query=$('query').value.trim().toLocaleLowerCase(); const province=$('province').value, method=$('method').value, b=$('budget').value, period=Number($('period').value);
  return data.records.filter(r=>{
    if(category && r.type!==category)return false;
    if(query && ![r.title,r.projectName,r.customer,r.summary,r.province].join(' ').toLocaleLowerCase().includes(query))return false;
    if(province && r.province!==province)return false;
    if(method && r.method!==method)return false;
    if($('high').checked && r.relevance!=='高相关')return false;
    if((r.deadlineDate && r.deadlineDate<today()) || (r.autoClearDate && r.autoClearDate<today()))return false;
    if(period && (!r.publishedDate || daysBetween(today(),r.publishedDate)<0 || daysBetween(today(),r.publishedDate)>=period))return false;
    const n=r.budgetYuan;
    if(b==='unknown' && n!==null)return false;
    if(b && b!=='unknown' && n===null)return false;
    if(b==='under50' && n>=500000)return false;
    if(b==='50to100' && (n<500000||n>=1000000))return false;
    if(b==='100to500' && (n<1000000||n>=5000000))return false;
    if(b==='over500' && n<5000000)return false;
    return true;
  }).sort((a,b)=>$('sort').value==='budget' ? (b.budgetYuan??-1)-(a.budgetYuan??-1) : $('sort').value==='deadline' ? (a.deadlineDate||'9999').localeCompare(b.deadlineDate||'9999') : (b.publishedDate||'').localeCompare(a.publishedDate||''));
}
function render(){
  if(!data)return;
  const rows=selectedRecords(),pages=Math.max(1,Math.ceil(rows.length/pageSize)); page=Math.min(page,pages);
  $('result-count').innerHTML=`共 <strong>${rows.length}</strong> 条公告${category?' · '+escape(category):''}`;
  $('cards').innerHTML=rows.slice((page-1)*pageSize,page*pageSize).map(r=>`<article class="card"><div class="card-top"><span class="tag ${tagClass(r.type)}">${escape(r.type)}</span><span class="location">${escape(r.province==='未识别'?'地区未识别':r.province)}</span>${r.relevance==='高相关'?'<span class="relevance">高相关</span>':''}</div><h2 class="card-title"><button data-detail="${r.id}" title="${escape(r.title)}">${escape(r.projectName)}</button></h2><div class="budget-row">${budget(r)}<span class="budget-caption">${r.type==='采购意向'?'意向预算':'项目预算'}</span></div><dl class="card-info"><dt>采购人</dt><dd class="customer" title="${escape(r.customer)}">${escape(r.customer==='未识别'?'采购人未识别':r.customer)}</dd><dt>发布时间</dt><dd>${escape(r.publishedDate||r.publishedRaw)}</dd><dt>投标截止</dt><dd>${deadline(r)}</dd></dl>${r.verification==='详情待核验'?'<p class="quality-note">详情待核验 · 采集时详情页未能读取</p>':''}<div class="card-footer"><a class="source-link" href="${escape(safeLink(r.url))}" target="_blank" rel="noopener noreferrer" title="查看${escape(r.source)}公告原文">${escape(r.source)} ↗</a><button class="details-button" data-detail="${r.id}">查看详情 <span aria-hidden="true">→</span></button></div></article>`).join('');
  $('cards').setAttribute('aria-busy','false'); $('empty').hidden=rows.length>0; $('pagination').hidden=pages<2;
  $('page-info').textContent=`${page} / ${pages}`; $('prev').disabled=page===1; $('next').disabled=page===pages;
}
function showDetail(id, trigger){
  const r=data.records.find(x=>x.id===id); if(!r)return; lastTrigger=trigger;
  const pairs=[['省份',r.province],['客户 / 采购人',r.customer],['项目名称',r.projectName],['采购方式',r.methodRaw],['预算金额（原文）',r.budgetRaw],['公告发布日期',r.publishedRaw],['报名 / 获取文件',r.acquisitionTime],['投标截止时间',r.deadlineRaw],['自动清除日期',r.autoClearDate||'不适用'],['招标网站',r.source],['招标文件',r.documents.length?`已收录 ${r.documents.length} 个公开文件链接`:r.documentNote||'未提供公开文件'],['收录情况',`${r.firstSeen} 首次收录 · ${r.lastSeen} 最近收录`]];
  $('detail-body').innerHTML=`<span class="tag ${tagClass(r.type)}">${escape(r.type)}</span><h2 id="detail-title">${escape(r.title)}</h2><dl class="detail-grid">${pairs.map(([k,v])=>`<dt>${escape(k)}</dt><dd>${escape(v)}</dd>`).join('')}</dl><div class="detail-summary"><h3>公告摘要</h3><p>${escape(r.summary)}</p></div><div class="dialog-actions"><a class="primary" href="${escape(safeLink(r.url))}" target="_blank" rel="noopener noreferrer">查看公告原文 ↗</a>${r.documents.map(d=>`<a class="secondary" href="${escape(safeLink(d.url))}" target="_blank" rel="noopener noreferrer">${escape(d.label)} ↗</a>`).join('')}</div><p class="detail-caution">${r.verification==='详情待核验'?'采集时未能读取详情页，字段需人工核验。':'本页整理自公开采购日报，未对原文作实时复核。'}缺失字段以“未识别”保留；采购安排可能变更，请以采购方最新公告为准。</p>`;
  $('detail').showModal();
}
function reset(){category='';page=1;for(const id of ['query','province','method','budget','period'])$(id).value='';$('high').checked=false;$('sort').value='newest';updateTabs();render();}
function updateTabs(){document.querySelectorAll('[data-type]').forEach(b=>{const active=b.dataset.type===category;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});}
async function load(){
  $('error').hidden=true;$('cards').setAttribute('aria-busy','true');$('result-count').textContent='正在加载采购信息…';
  try {
    const response=await fetch('./data.json',{cache:'no-store'});if(!response.ok)throw new Error('Data unavailable');const next=await response.json();if(next.schemaVersion!==1||!Array.isArray(next.records))throw new Error('Invalid data');data=next;
    $('updated').textContent=data.latestReportAt||'暂无日报';$('all-count').textContent=data.records.length;
    $('coverage').textContent=`已整理 ${data.reportCount} 份日报 · ${data.records.length} 条公告`;
    for(const [id,key,label] of [['province','province','全国地区'],['method','method','全部方式']]){const values=[...new Set(data.records.map(r=>r[key]))].sort((a,b)=>a==='未识别'?1:b==='未识别'?-1:a.localeCompare(b,'zh'));$(id).innerHTML=`<option value="">${label}</option>`+values.map(v=>`<option value="${escape(v)}">${escape(v)}</option>`).join('');}
    const stale=!data.latestReportAt||daysBetween(today(),data.latestReportAt.slice(0,10))>1;
    $('freshness').hidden=!stale;$('freshness').textContent=`最近收录的日报为 ${data.latestReportAt||'未知时间'}。近期数据尚未更新，以下为历史记录；这不代表近期没有新公告。`;
    render();
  }catch{$('error').hidden=false;$('empty').hidden=true;$('pagination').hidden=true;$('cards').innerHTML='';$('cards').setAttribute('aria-busy','false');$('result-count').textContent='加载未完成';$('updated').textContent='数据暂不可用';}
}
$('search-form').addEventListener('submit',e=>{e.preventDefault();page=1;render();});
$('query').addEventListener('input',()=>{page=1;render();});
for(const id of ['province','method','budget','period','high','sort'])$(id).addEventListener('change',()=>{page=1;render();});
document.querySelectorAll('[data-type]').forEach(b=>b.addEventListener('click',()=>{category=b.dataset.type;page=1;updateTabs();render();}));
for(const id of ['reset','clear-empty'])$(id).addEventListener('click',reset);
$('cards').addEventListener('click',e=>{const b=e.target.closest('[data-detail]');if(b)showDetail(b.dataset.detail,b);});
$('close-detail').addEventListener('click',()=>$('detail').close());
$('detail').addEventListener('click',e=>{if(e.target===$('detail')){const r=$('detail').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('detail').close();}});
$('detail').addEventListener('close',()=>lastTrigger?.focus());
for(const [id,step] of [['prev',-1],['next',1]])$(id).addEventListener('click',()=>{page+=step;render();document.querySelector('.tabs').scrollIntoView({block:'start'});});
$('retry').addEventListener('click',load);
// Optional agent interface; browsing and filtering also work in ordinary browsers.
if(document.modelContext?.registerTool){
  const lifecycle=new AbortController();
  const tool={name:'filter_archive_notices',title:'筛选档案采购公告',description:'更新页面的关键词和公告分类筛选，返回匹配数量及前 12 条公开公告。',inputSchema:{type:'object',properties:{query:{type:'string',maxLength:200},type:{type:'string',enum:['','采购公告','采购意向','采购需求','更正公告']}},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute(input){
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['query','type'].includes(k))||(input.query!==undefined&&(typeof input.query!=='string'||input.query.length>200))||(input.type!==undefined&&!['','采购公告','采购意向','采购需求','更正公告'].includes(input.type)))throw new Error('筛选参数无效');
    if(!data)throw new Error('采购信息尚未加载');
    reset();$('query').value=input.query||'';category=input.type||'';updateTabs();render();const rows=selectedRecords();
    return {count:rows.length,notices:rows.slice(0,12).map(r=>({id:r.id,title:r.title,type:r.type,province:r.province,url:r.url}))};
  }};
  try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
load();
