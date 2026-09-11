const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const dataset=JSON.parse(fs.readFileSync('dist/data.json','utf8'));
const elements=new Map();
function el(id){if(!elements.has(id))elements.set(id,{value:'',checked:false,hidden:false,innerHTML:'',dataset:{},classList:{toggle(){}},addEventListener(){},setAttribute(){},scrollIntoView(){},showModal(){this.open=true;},close(){this.open=false;},focus(){}});return elements.get(id);}
el('sort').value='newest';
const registered=[];
const context=vm.createContext({URL,Intl,Date,AbortController,Promise,console,document:{getElementById:el,querySelectorAll:()=>[],querySelector:()=>el('tabs'),modelContext:{registerTool:t=>registered.push(t)}},window:{addEventListener(){}},fetch:async()=>({ok:true,json:async()=>dataset})});
vm.runInContext(fs.readFileSync('dist/app.js','utf8'),context);
const run=s=>vm.runInContext(s,context);
setImmediate(()=>{
 const expectedCount=dataset.records.length;
 assert.equal(run('data.records.length'),expectedCount);
 assert.equal(run('selectedRecords().length'),expectedCount);
 run("$('query').value='档案数字化';render()");assert(run('selectedRecords().length')>0&&run('selectedRecords().length')<expectedCount);
 run("reset();category='采购意向';render()");assert.equal(run('selectedRecords().length'),0);assert.equal(el('empty').hidden,false);
 run("reset();$('budget').value='unknown';render()");assert(run('selectedRecords().every(r=>r.budgetYuan===null)'));
 run("reset();$('budget').value='100to500';render()");assert(run('selectedRecords().every(r=>r.budgetYuan>=1000000&&r.budgetYuan<5000000)'));
 run("reset();$('hide-expired').checked=true;render()");assert(run('selectedRecords().every(r=>!r.deadlineDate||r.deadlineDate>=today())'));
 run("reset();$('sort').value='budget';render()");assert(run('selectedRecords()[0].budgetYuan >= selectedRecords()[1].budgetYuan'));
 assert.equal(run("safeLink('javascript:alert(1)')"),'');assert.equal(run("safeLink('https://user:pass@example.com')"),'');
 assert.equal(run("escape('<script>')"),'&lt;script&gt;');
 run('showDetail(data.records[0].id,null)');assert.equal(el('detail').open,true);assert(el('detail-body').innerHTML.includes('公告原文'));
 assert.equal(registered.length,1);assert.equal(registered[0].name,'filter_archive_notices');
 const result=registered[0].execute({type:'采购需求'});assert.equal(result.count,2);
 assert.throws(()=>registered[0].execute({type:'非法类型'}));assert.equal(run('category'),'采购需求');
 console.log('PASS: search, types, budgets, deadline filtering, sorting, escaping, details and optional agent contract in a non-browser harness.');
});
