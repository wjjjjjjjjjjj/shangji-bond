'use strict';
const $=id=>document.getElementById(id);
const paths={layers:'M12 3 3 8l9 5 9-5-9-5Zm-9 10 9 5 9-5M3 17l9 5 9-5',down:'m7 10 5 5 5-5',search:'M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',scan:'M3 8V4h5m8 0h5v4m0 8v4h-5M8 20H3v-4m11-3 3 3m-2-6a4 4 0 1 1-8 0 4 4 0 0 1 8 0',download:'M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4',note:'M6 3h12a1 1 0 0 1 1 1v16H5V4a1 1 0 0 1 1-1Zm2 5h8m-8 4h8m-8 4h5',heart:'M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-5 5 2 11 8 15 6-4 13-10 8-15Z',bookmark:'M6 3h12v18l-6-4-6 4V3Z',comment:'M21 11a9 9 0 0 1-9 9 12 12 0 0 1-4-1l-5 2 1-5a9 9 0 1 1 17-5Z',share:'m13 3 8 7-8 7v-4c-5 0-8 2-10 6 0-7 3-11 10-12V3Z',link:'M13 4h7v7m-9 2 9-9M10 6H5v14h14v-5'};
const icon=k=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+paths[k]+'"/></svg>';
for(const el of document.querySelectorAll('[data-icon]'))el.innerHTML=icon(el.dataset.icon);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number.isFinite(n)?n.toLocaleString('zh-CN'):'—';
function original(raw){try{const u=new URL(raw);return u.protocol==='https:'&&u.hostname==='www.xiaohongshu.com'?u.href:''}catch{return ''}}
function cover(raw){if(window.embeddedCovers && Object.hasOwn(window.embeddedCovers,raw))return window.embeddedCovers[raw];if(/^covers\/\d+\.jpg$/.test(raw))return raw;try{const u=new URL(raw);if(/\.xhscdn\.com$/.test(u.hostname)&&['http:','https:'].includes(u.protocol)){u.protocol='https:';return u.href}}catch{}return ''}
const labels={quick:'近24小时',default:'近7天',deep:'近半年'},types={all:'全部',normal:'图文笔记',video:'视频笔记'};
const endpoint=window.searchEndpoint || (/\.ngrok(?:-free)?\.(?:app|dev)$/.test(location.hostname) ? location.origin : '');
let sourceMode=endpoint?'live':'sample';
let mode='quick',type='all',page=1,snapshot=(sourceMode==='sample' && window.sample)||{keyword:'',source:'empty',items:[]},rows=[],busy=false;
const size=8, metrics=['likes','favorites','comments','shares'];
const total=n=>metrics.every(k=>Number.isFinite(n[k]))?metrics.reduce((v,k)=>v+n[k],0):null;
function buttons(id,opts,selected,fn){const box=$(id);box.replaceChildren();for(const [k,v] of Object.entries(opts)){const b=document.createElement('button');b.type='button';b.textContent=v;b.disabled=busy;b.setAttribute('aria-pressed',String(k===selected));b.onclick=()=>fn(k);box.append(b)}}
function configure(){
 buttons('sources',endpoint?{live:'公开笔记索引',sample:'历史样本'}:{sample:'历史样本'},sourceMode,k=>{
   sourceMode=k;message('');if(k==='live'){snapshot={source:'empty',items:[]};page=1}if(k==='sample'){snapshot=window.sample||{source:'sample',items:[]};$('query').value=snapshot.keyword||'';page=1}render()
 });
 $('times').parentElement.hidden=sourceMode==='sample';
 buttons('times',labels,mode,k=>{mode=k;configure();if(snapshot.source==='live' && $('query').value.trim())$('searchform').requestSubmit()});buttons('types',types,type,k=>{type=k;page=1;render()})}
function renderLeads(){
 let box=document.getElementById('public-leads');
 if(!box){box=document.createElement('details');box.id='public-leads';$('message').after(box)}
 box.replaceChildren();
 const links=(snapshot.source==='live' && snapshot.leads || []).filter(n=>original(n.url));
 box.hidden=!links.length;
 if(!links.length)return;
 const heading=document.createElement('summary');heading.textContent='公开搜索链接（'+links.length+' 条，未计入发布时间筛选）';box.append(heading);
 for(const n of links){const p=document.createElement('p'),a=document.createElement('a');a.href=original(n.url);a.target='_blank';a.rel='noopener noreferrer';a.textContent=n.title;p.append(a);box.append(p)}
}
function message(s){$('message').textContent=s}
function show(content){$('dialog-content').innerHTML=content;if(!$('dialog').open)$('dialog').showModal()}
$('dialog').onclick=e=>{if(e.target===$('dialog'))$('dialog').close()};
function render(){
 renderLeads();
 configure();const sort=$('sort').value;rows=snapshot.items.filter(x=>type==='all'||x.type===type).sort((a,b)=>sort==='date'?String(b.date||'').localeCompare(String(a.date||'')):(b[sort]??-1)-(a[sort]??-1));
 const preparing=snapshot.source==='live' && !snapshot.at && (snapshot.pending || snapshot.retrying);
 const historical=snapshot.source==='sample',sourceName=historical?'历史样本':snapshot.source==='live'?'笔记索引':'等待检索';
 $('scope').textContent=rows.length?'仅统计当前筛选结果':'当前筛选结果';
 $('meta').textContent=snapshot.keyword?[sourceName,'「'+snapshot.keyword+'」',snapshot.window,(snapshot.source==='live' && snapshot.at?'最近采集 ':'')+snapshot.at].filter(Boolean).join('  ·  '):'输入关键词后查看结果';
 $('count').textContent=preparing?'首次收录中':rows.length+' 篇';
 const cards=[['匹配笔记','note',null,'#f12a49','#ffedf0'],['点赞总数','heart','likes','#ef507b','#fff0f4'],['收藏总数','bookmark','favorites','#ce911f','#fff5df'],['评论总数','comment','comments','#586ed0','#eef1ff'],['分享总数','share','shares','#329982','#e6f6f1']];
 $('stats').innerHTML=cards.map(([label,i,k,c,t])=>{const known=k?rows.map(x=>x[k]).filter(Number.isFinite):[];const n=k?(known.length?known.reduce((s,x)=>s+x,0):null):rows.length;return '<div class="stat" style="--t:'+t+';--c:'+c+'"><i>'+icon(i)+'</i><span class="label">'+label+'</span><strong>'+(preparing?'—':fmt(n))+'</strong>'+(k&&known.length&&known.length<rows.length?'<small>含已披露的 '+known.length+' 篇</small>':'')+'</div>'}).join('');
 const pages=Math.max(1,Math.ceil(rows.length/size));page=Math.min(page,pages);const offset=(page-1)*size;
 $('rows').innerHTML=rows.slice(offset,offset+size).map((n,idx)=>{const img=cover(n.cover),url=original(n.url);return '<tr><td><button class="note" data-row="'+(offset+idx)+'">'+(img?'<img class="thumb" src="'+esc(img)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'<span class="thumb">'+icon('note')+'</span>')+'<span><strong>'+esc(n.title)+'</strong><small>'+esc(n.author||'作者未返回')+'</small></span></button></td><td class="date">'+esc(n.date||'—')+'</td>'+metrics.map(k=>'<td class="'+(k==='likes'?'likes':'')+'">'+fmt(n[k])+'</td>').join('')+'<td>'+fmt(total(n))+'</td><td>'+(url?'<a class="orig" aria-label="查看小红书原文" target="_blank" rel="noopener noreferrer" href="'+esc(url)+'">'+icon('link')+'</a>':'—')+'</td></tr>'}).join('');
 for(const b of $('rows').querySelectorAll('[data-row]'))b.onclick=()=>detail(rows[Number(b.dataset.row)]);
 $('empty').hidden=preparing||!!rows.length;$('empty').textContent=snapshot.items.length?'当前类型下没有可确认的笔记。':snapshot.source==='empty'?'请输入关键词并开始检索。':'本次检索未返回匹配笔记。';
 $('pagination').textContent=rows.length?'显示 '+(offset+1)+'–'+Math.min(offset+size,rows.length)+' 篇，共 '+rows.length+' 篇':(preparing?'':'共 0 篇');$('page').textContent=page;$('prev').disabled=page===1;$('next').disabled=page===pages;$('export').disabled=!rows.length;
}
function detail(n){const url=original(n.url);show('<h2>'+esc(n.title)+'</h2><p>'+esc(n.author||'作者未返回')+' · '+esc(n.date||'时间未返回')+'</p><p>'+esc(n.snippet||'')+'</p><dl>'+[['笔记类型',types[n.type]||'未返回'],['点赞',fmt(n.likes)],['收藏',fmt(n.favorites)],['评论',fmt(n.comments)],['分享',fmt(n.shares)],['预估阅读量',fmt(n.reads)],['总互动量',fmt(total(n))]].map(([k,v])=>'<dt>'+k+'</dt><dd>'+v+'</dd>').join('')+'</dl><p>四项互动数据齐全时计算总互动量。</p>'+(url?'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">查看小红书原文 ↗</a>':''))}
$('prev').onclick=()=>{page--;render()};$('next').onclick=()=>{page++;render()};$('sort').onchange=()=>{page=1;render()};$('clear').onclick=()=>{$('query').value='';$('query').focus()};
async function call(path,options,ms){
 const response=await fetch(endpoint+path,{...options,signal:AbortSignal.timeout(ms),credentials:'omit',cache:'no-store'});
 if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('在线检索服务暂时无法连接。');
 const result=await response.json();
 if(!response.ok)throw new Error(result.error||'在线检索暂不可用。');
 return result;
}
$('searchform').onsubmit=async e=>{e.preventDefault();const q=$('query').value.trim();if(!q||busy)return;
 if(sourceMode==='sample'){
   const sample=window.sample||{keyword:'',items:[],source:'sample'};
   const tokens=q.toLocaleLowerCase().split(/\s+/).filter(Boolean);
   const items=sample.items.filter(n=>tokens.every(t=>[sample.keyword,n.title,n.author,n.snippet].join(' ').toLocaleLowerCase().includes(t)));
   snapshot={...sample,keyword:q,items};page=1;message('');render();return;
 }
 busy=true;configure();$('search').disabled=true;$('search').textContent='检索中…';message('正在查询公开笔记索引…');
 try{
   const options={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keyword:q,depth:mode})};
   let result=await call('/api/public-search',options,20000);
   for(let attempt=0;attempt<24 && result.pending;attempt++){
     message('正在收录此关键词，完成后显示结果…');
     await new Promise(resolve=>setTimeout(resolve,2500));
     result=await call('/api/public-search',options,20000);
   }
   if(!Array.isArray(result.items))throw new Error('数据源返回格式异常');
   snapshot={...result,source:'live',keyword:q,window:labels[mode]};page=1;
   message(result.retrying?'数据源暂时未响应，系统将自动重试。':
     result.pending?'后台正在完成首次收录，请稍后查询。':'');

}catch(err){message((err.name==='TypeError'?'在线检索服务暂时无法连接，请稍后重试。':err.name==='TimeoutError'?'数据源响应超时，请稍后重试。':err.message)+' 当前列表保留上次显示的结果。')}finally{busy=false;$('search').disabled=false;$('search').innerHTML=icon('search')+' 检索笔记';render()}};
$('export').onclick=()=>{const header=['关键词','结果来源','采集时间','标题','作者','发布时间','点赞','收藏','评论','分享','总互动','预估阅读量','原文链接'];const values=rows.map(n=>[snapshot.keyword,snapshot.source==='sample'?'历史样本':'笔记索引',snapshot.at,n.title,n.author,n.date,...metrics.map(k=>n[k]),total(n),n.reads,original(n.url)]);const cell=v=>{let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'};const blob=new Blob(['\uFEFF'+[header,...values].map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='笔记检索_'+snapshot.keyword+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
render();