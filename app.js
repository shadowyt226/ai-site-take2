/* Loomkit – front end. Images: AI Horde (free, no setup). Video/characters/extra models: your free Colab GPU. */
const $=id=>document.getElementById(id);
const cfg=JSON.parse(localStorage.getItem('loomkit')||'{}');
const save=()=>localStorage.setItem('loomkit',JSON.stringify(cfg));
const HORDE='https://aihorde.net/api/v2';
let hordeModels=[],cloudModels=[],chars=[];

/* ---------- storage (IndexedDB, holds blobs) ---------- */
const DB=(()=>{let db;
 const open=()=>db?Promise.resolve(db):new Promise((res,rej)=>{const r=indexedDB.open('loomkit',1);
  r.onupgradeneeded=()=>['gallery','characters'].forEach(s=>r.result.createObjectStore(s,{keyPath:'id'}));
  r.onsuccess=()=>res(db=r.result);r.onerror=()=>rej(r.error)});
 const tx=async(s,m,f)=>{const d=await open();return new Promise((res,rej)=>{const t=d.transaction(s,m);const q=f(t.objectStore(s));t.oncomplete=()=>res(q&&q.result);t.onerror=()=>rej(t.error)})};
 return{all:s=>tx(s,'readonly',o=>o.getAll()),put:(s,v)=>tx(s,'readwrite',o=>o.put(v)),del:(s,k)=>tx(s,'readwrite',o=>o.delete(k)),clear:s=>tx(s,'readwrite',o=>o.clear())}})();
const b64=b=>new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(b)});
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const status=(t,err)=>{const s=$('status');s.textContent=t;s.className='status'+(err?' err':'')};

/* ---------- gate & tabs ---------- */
if(localStorage.getItem('loomkit-gate')==='1')$('gate').classList.add('hide');
const gchk=()=>$('gateBtn').disabled=!($('g1').checked&&$('g2').checked);
$('g1').onchange=$('g2').onchange=gchk;
$('gateBtn').onclick=()=>{localStorage.setItem('loomkit-gate','1');$('gate').classList.add('hide')};
$('tabs').onclick=e=>{const t=e.target.dataset.tab;if(!t)return;
 document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('on',b===e.target));
 document.querySelectorAll('.tab').forEach(s=>s.classList.toggle('on',s.id==='tab-'+t));
 if(t==='gallery')renderGallery();if(t==='characters')renderChars()};

/* ---------- safety: no minors, ever ---------- */
const HARD=/\b(child|children|kid|kids|minor|minors|underage|toddler|infant|baby|loli\w*|shota\w*|preteen|pre-teen|schoolgirl|schoolboy|juvenile|teen|teens|teenage\w*|teenager)\b/i;
const minorBlocked=t=>HARD.test(t)||[...t.matchAll(/\b(\d{1,2})[\s-]*(yo|y\/o|years?[\s-]*old)\b/gi)].some(m=>+m[1]<18);

/* ---------- models ---------- */
const PREF=['deliberate','realistic vision','absolutereality','epicrealism','icbinp','urpm','dreamshaper','analog','cyberrealistic','majicmix','juggernaut','sdxl'];
async function loadHorde(){
 try{const r=await fetch(HORDE+'/status/models?type=image&min_count=1');
  hordeModels=(await r.json()).sort((a,b)=>{const pa=PREF.findIndex(p=>a.name.toLowerCase().includes(p)),pb=PREF.findIndex(p=>b.name.toLowerCase().includes(p));
   return (pa<0?99:pa)-(pb<0?99:pb)||b.count-a.count}).slice(0,60);
 }catch(e){hordeModels=[{name:'Deliberate'},{name:'Realistic Vision'},{name:'AbsoluteReality'}]}
}
async function loadCloud(){
 cloudModels=[];$('engineDot').classList.remove('ok');
 if(!cfg.backend)return;
 try{const r=await fetch(cfg.backend+'/models',{headers:{'ngrok-skip-browser-warning':'1'}});
  cloudModels=await r.json();$('engineDot').classList.add('ok');}catch(e){}
}
function fillModels(){
 const m=$('mode').value,sel=$('model'),video=m.endsWith('v');
 const opts=[];
 if(!video)hordeModels.forEach(x=>opts.push(['horde:'+x.name,'Free Horde · '+x.name]));
 cloudModels.filter(x=>x.modes.includes(m)).forEach(x=>opts.push(['cloud:'+x.id,'Colab GPU · '+x.label]));
 if(cloudModels.length&&!video)opts.push(['cloud:custom','Colab GPU · custom Hugging Face repo…']);
 sel.innerHTML=opts.length?opts.map(o=>`<option value="${o[0]}">${o[1]}</option>`).join(''):'<option value="">Connect the Colab engine (Engine tab) for video</option>';
 modeUI();
}
function modeUI(){
 const m=$('mode').value;
 $('charWrap').hidden=!(m[0]==='c');
 $('initWrap').hidden=!(m==='i2i'||m==='i2v');
 $('strWrap').hidden=!(m==='i2i'||m==='c2i'&&$('model').value.startsWith('horde'));
 $('vidRow').hidden=!m.endsWith('v');
 $('customWrap').hidden=$('model').value!=='cloud:custom';
}
$('mode').onchange=fillModels;$('model').onchange=modeUI;
$('strength').oninput=e=>$('strV').textContent=e.target.value;

/* ---------- characters ---------- */
$('cFiles').onchange=e=>{$('cPrev').innerHTML='';[...e.target.files].forEach(f=>{const i=new Image();i.src=URL.createObjectURL(f);$('cPrev').append(i)})};
$('cSave').onclick=async()=>{
 const files=[...$('cFiles').files],name=$('cName').value.trim();
 if(!name||!files.length)return alert('Add a name and at least one reference image.');
 if(minorBlocked($('cDesc').value))return alert('Characters must be adults.');
 await DB.put('characters',{id:uid(),name,desc:$('cDesc').value.trim(),refs:files.slice(0,10)});
 $('cName').value=$('cDesc').value='';$('cFiles').value='';$('cPrev').innerHTML='';renderChars();
};
async function renderChars(){
 chars=await DB.all('characters');
 $('cList').innerHTML=chars.length?'':'<p class="empty">No characters yet.</p>';
 chars.forEach(c=>{const d=document.createElement('div');d.className='card';
  d.innerHTML=`<b>${c.name.replace(/</g,'&lt;')}</b><div class="thumbs"></div><p class="hint">${c.refs.length} reference image(s)</p><button>Delete</button>`;
  c.refs.slice(0,4).forEach(r=>{const i=new Image();i.src=URL.createObjectURL(r);d.querySelector('.thumbs').append(i)});
  d.querySelector('button').onclick=async()=>{await DB.del('characters',c.id);renderChars()};
  $('cList').append(d)});
 $('charSel').innerHTML=chars.map(c=>`<option value="${c.id}">${c.name.replace(/</g,'&lt;')}</option>`).join('')||'<option value="">Create a character first</option>';
}

/* ---------- generation: AI Horde ---------- */
async function genHorde(p){
 const body={prompt:p.prompt+' ### '+p.neg,nsfw:p.nsfw,censor_nsfw:false,models:[p.model],r2:true,slow_workers:true,
  params:{sampler_name:'k_euler_a',cfg_scale:p.cfg,width:p.w,height:p.h,steps:Math.min(p.steps,40),n:1}};
 if(p.seed!=='')body.params.seed=String(p.seed);
 if(p.init){body.source_image=await b64(p.init);body.source_processing='img2img';body.params.denoising_strength=p.strength}
 const H={'Content-Type':'application/json',apikey:cfg.hordeKey||'0000000000','Client-Agent':'loomkit:1:self'};
 let r=await fetch(HORDE+'/generate/async',{method:'POST',headers:H,body:JSON.stringify(body)});
 let j=await r.json();if(!j.id)throw new Error(j.message||'Horde rejected the request');
 for(;;){await sleep(3000);
  const c=await (await fetch(HORDE+'/generate/check/'+j.id)).json();
  status(c.faulted?'Failed':`Free GPU queue: position ${c.queue_position??'…'}, about ${c.wait_time??'?'}s`);
  if(c.faulted)throw new Error('Horde generation faulted. Try another model.');
  if(c.done)break}
 const s=await (await fetch(HORDE+'/generate/status/'+j.id)).json();
 const g=s.generations?.[0];if(!g)throw new Error('No image returned (request may have been filtered by a worker).');
 const blob=g.img.startsWith('http')?await (await fetch(g.img)).blob():await (await fetch('data:image/webp;base64,'+g.img)).blob();
 return{blob,kind:'image'};
}

/* ---------- generation: Colab backend ---------- */
async function genCloud(p){
 if(!cfg.backend)throw new Error('Connect your Colab engine in the Engine tab first.');
 status('Sending to your Colab GPU… first run downloads the model (several minutes). Keep the Colab tab open.');
 const body={...p,model:p.model==='custom'?p.custom:p.model,init:p.init?await b64(p.init):null,refs:await Promise.all((p.refs||[]).map(b64))};
 const r=await fetch(cfg.backend+'/generate',{method:'POST',headers:{'Content-Type':'application/json','ngrok-skip-browser-warning':'1'},body:JSON.stringify(body)});
 if(!r.ok)throw new Error((await r.text()).slice(0,300));
 const blob=await r.blob();return{blob,kind:blob.type.startsWith('video')?'video':'image'};
}

/* ---------- main generate ---------- */
$('go').onclick=async()=>{
 const mode=$('mode').value,[eng,model]=($('model').value||':').split(/:(.*)/s);
 let prompt=$('prompt').value.trim();
 if(!model)return status('Pick a model (video needs the Colab engine).',true);
 if(!prompt)return status('Write a prompt first.',true);
 let ch=null,refs=[],init=null;
 if(mode[0]==='c'){ch=chars.find(c=>c.id===$('charSel').value);if(!ch)return status('Choose a character.',true);refs=ch.refs;prompt=ch.desc?ch.desc+', '+prompt:prompt}
 if(mode==='i2i'||mode==='i2v'){init=$('initFile').files[0];if(!init)return status('Choose a starting image.',true)}
 if(minorBlocked(prompt))return status('Blocked: prompts may not describe minors or ambiguous ages. Specify adult characters (e.g. "adult woman, 25 years old").',true);
 const p={mode,model,prompt,neg:$('neg').value,nsfw:$('nsfw').checked,w:+$('w').value,h:+$('h').value,steps:+$('steps').value,cfg:+$('cfg').value,
  seed:$('seed').value,strength:+$('strength').value,frames:+$('frames').value,fps:+$('fps').value,custom:$('customModel').value.trim(),init,refs};
 $('go').disabled=true;status('Starting…');
 try{
  let out;
  if(eng==='horde'){ if(mode==='c2i'){p.init=refs[0];}
   out=await genHorde(p)} else out=await genCloud(p);
  const item={id:uid(),kind:out.kind,blob:out.blob,prompt,model:$('model').selectedOptions[0].text,date:Date.now(),character:ch?.name||''};
  await DB.put('gallery',item);show(item,$('stage'),true);status('Done. Saved to Gallery.');
 }catch(e){status(e.message||String(e),true)}
 $('go').disabled=false;
};
function show(it,host,big){
 const url=URL.createObjectURL(it.blob);
 const el=it.kind==='video'?Object.assign(document.createElement('video'),{src:url,controls:true,loop:true,autoplay:big,muted:!big}):Object.assign(new Image(),{src:url});
 if(host){if(big)host.innerHTML='';host.append(el)}return{el,url};
}
async function renderGallery(){
 const items=(await DB.all('gallery')).sort((a,b)=>b.date-a.date);
 $('gal').innerHTML=items.length?'':'<p class="empty">Nothing saved yet.</p>';
 items.forEach(it=>{const d=document.createElement('div');d.className='item';
  const {el,url}=show(it,d,false);
  const bar=document.createElement('div');bar.className='bar';
  bar.innerHTML=`<button>Download</button><button>Reuse prompt</button><button>Delete</button>`;
  const [dl,re,del]=bar.children;
  dl.onclick=()=>{const a=document.createElement('a');a.href=url;a.download='loomkit-'+it.id+(it.kind==='video'?'.mp4':'.png');a.click()};
  re.onclick=()=>{$('prompt').value=it.prompt;document.querySelector('[data-tab=create]').click()};
  del.onclick=async()=>{await DB.del('gallery',it.id);renderGallery()};
  d.append(bar);$('gal').append(d)});
}
$('clearAll').onclick=async()=>{if(confirm('Delete every saved generation?')){await DB.clear('gallery');renderGallery()}};

/* ---------- engine tab ---------- */
$('hordeKey').value=cfg.hordeKey||'';$('backend').value=cfg.backend||'';
$('saveEngine').onclick=async()=>{
 cfg.hordeKey=$('hordeKey').value.trim();cfg.backend=$('backend').value.trim().replace(/\/$/,'');save();
 $('engineMsg').textContent='Testing…';await loadCloud();fillModels();
 $('engineMsg').textContent=cloudModels.length?`Connected. ${cloudModels.length} cloud models available.`:(cfg.backend?'Could not reach the engine. Is the Colab cell still running?':'Saved.');
};

(async()=>{await loadHorde();await loadCloud();fillModels();renderChars()})();
