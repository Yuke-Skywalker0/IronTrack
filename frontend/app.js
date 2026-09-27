const CFG=window.IRONTRACK_CONFIG||{};
const API=(CFG.API_BASE_URL||window.location.origin).replace(/\/$/,'');
let token=localStorage.getItem('iron_token'),me=null,routines=[],sessions=[],stats=null,measurements=[],progression=[];
let editingId=null,builderDays=[{name:'Giorno 1',exercises:[]}],builderDay=0;
let sessionTimer=null,sessionStart=null,sessionRoutineId=null,pickerTimer=null,exTimer=null,lastDetail=null,deferredInstall=null,restTimer=null,restEnd=null;
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fmtDate=s=>{try{return new Date(s).toLocaleString('it-IT')}catch{return s||''}};
const fmtDay=s=>{try{return new Date(s).toLocaleDateString('it-IT')}catch{return s||''}};

async function api(path,opt={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),15000);
  try{
    const headers={...(opt.body?{'Content-Type':'application/json'}:{}),...(opt.headers||{}),...(token?{Authorization:'Bearer '+token}:{})};
    const r=await fetch(API+path,{...opt,headers,signal:controller.signal});
    if(!r.ok){let e={};try{e=await r.json()}catch{};throw Error(e.detail||`Errore API ${r.status}`)}
    return r.status===204?null:r.json();
  }catch(e){
    if(e.name==='AbortError')throw Error('Server non raggiungibile: richiesta scaduta. Avvia IronTrack con start_local.bat.');
    if(e instanceof TypeError)throw Error(`Connessione API fallita (${API}). Avvia IronTrack con start_local.bat e non aprire index.html direttamente.`);
    throw e;
  }finally{clearTimeout(timer)}
}
const ICON_MAP=[
  [/^\s*\+?\s*Nuova/i,'plus'],[/^\s*Allenati/i,'dumbbell'],[/^\s*Modifica/i,'pencil'],[/^\s*Copia/i,'copy'],[/^\s*Vedi tutte/i,'list'],[/^\s*Salva scheda/i,'save'],[/^\s*\+?\s*Giorno/i,'calendar-plus'],[/^\s*\+?\s*Esercizio/i,'dumbbell'],[/^\s*Chiudi/i,'x'],[/^\s*Recupero/i,'timer'],[/^\s*Esci/i,'log-out'],[/^\s*Termina e salva/i,'check-circle-2'],[/^\s*Analisi/i,'chart-no-axes-combined'],[/^\s*\+?\s*Aggiungi/i,'plus'],[/^\s*Genera programma/i,'sparkles'],[/^\s*Salva profilo/i,'save'],[/^\s*Cambia password/i,'key-round'],[/^\s*Installa IronTrack/i,'download'],[/^\s*Come installare/i,'download'],[/^\s*Guida iPhone/i,'smartphone'],[/^\s*Copia link/i,'link'],[/^\s*Genera codice scheda/i,'share-2'],[/^\s*Importa scheda/i,'upload'],[/^\s*SUPER ADMIN/i,'shield-check'],[/^\s*Apri profilo/i,'user-round'],[/^\s*Salva/i,'save'],[/^\s*Continua/i,'arrow-right'],[/^\s*Accedi/i,'log-in'],[/^\s*Crea account/i,'user-plus'],[/^\s*Invia link/i,'mail'],[/^\s*Salva nuova password/i,'key-round']
];
const DECORATIVE_PREFIX=/^(?:\s*[+＋×✕✖✓✔←→↗⌂▤◉◷✦⚙☀☾◐♙●📲🔒⚡✉🔐🗑️⭐❤️🔥🏋️‍♂️🏋️‍♀️🏋️‍?\u{1F300}-\u{1FAFF}]\s*)+/u;
function iconNameFor(text){
  const t=String(text||'').replace(/\s+/g,' ').trim();
  for(const [re,name] of ICON_MAP) if(re.test(t)) return name;
  return null;
}
function stripDecorativePrefix(btn){
  const walker=document.createTreeWalker(btn,NodeFilter.SHOW_TEXT);
  const first=walker.nextNode();
  if(!first) return;
  const cleaned=first.nodeValue.replace(DECORATIVE_PREFIX,'');
  if(cleaned!==first.nodeValue) first.nodeValue=cleaned;
}
function addIcon(btn,name){
  if(!btn||!name||btn.querySelector('[data-lucide],svg')) return;
  stripDecorativePrefix(btn);
  const i=document.createElement('i');
  i.setAttribute('data-lucide',name);
  i.setAttribute('aria-hidden','true');
  i.className='icon-inline';
  btn.prepend(i);
  btn.dataset.iconReady='1';
}
function refreshIcons(){
  if(!window.lucide?.createIcons) return;
  document.querySelectorAll('button:not([data-icon-ready="1"])').forEach(btn=>{
    if(btn.querySelector('[data-lucide],svg')) return;
    const text=btn.textContent.replace(/\s+/g,' ').trim();
    const name=iconNameFor(text);
    if(name) addIcon(btn,name);
  });
  document.querySelectorAll('.bottomnav button').forEach(btn=>{
    if(btn.querySelector('[data-lucide],svg')) return;
    const map={dashboard:'house',routines:'notebook-tabs',exercises:'dumbbell',history:'history',ai:'sparkles',profile:'settings',admin:'shield-check'};
    addIcon(btn,map[btn.dataset.page]);
  });
  const themes={themeSystem:'monitor-smartphone',themeLight:'sun',themeDark:'moon'};
  Object.entries(themes).forEach(([id,name])=>{
    const el=$(id); if(!el||el.querySelector('[data-lucide],svg')) return;
    el.querySelector('span')?.remove(); addIcon(el,name);
  });
  const si=document.querySelector('.settings-icon');
  if(si&&!si.querySelector('[data-lucide],svg')){si.textContent='';addIcon(si,'palette');}
  window.lucide.createIcons({attrs:{'stroke-width':2.1}});
}
function scheduleIconRefresh(){requestAnimationFrame(()=>setTimeout(refreshIcons,0));}


function toast(t){$('toast').textContent=t;$('toast').classList.add('show');clearTimeout(window.__toast);window.__toast=setTimeout(()=>$('toast').classList.remove('show'),2600)}
function empty(a,b){return `<div class="empty"><b>${esc(a)}</b><span>${esc(b)}</span></div>`}
function formatTime(s){return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`}
function saveDraft(){
  if(!sessionRoutineId||!sessionStart)return;
  const sets=[];
  document.querySelectorAll('.live-ex').forEach((ex,ei)=>ex.querySelectorAll('.set-row').forEach((r,i)=>sets.push({ei,i,weight:r.querySelector('.setweight').value,reps:r.querySelector('.setreps').value,rir:r.querySelector('.setrir').value})));
  localStorage.setItem('iron_active_workout',JSON.stringify({routineId:sessionRoutineId,startedAt:sessionStart,notes:$('sessionNotes')?.value||'',sets,savedAt:Date.now()}));
}
function clearDraft(){localStorage.removeItem('iron_active_workout');$('resumeWorkout')?.classList.add('hidden')}
function readDraft(){try{return JSON.parse(localStorage.getItem('iron_active_workout')||'null')}catch{return null}}
function showResume(){const d=readDraft();if(!d)return;const r=routines.find(x=>x.id===d.routineId);if(!r){clearDraft();return}const age=Date.now()-d.savedAt;if(age>1000*60*60*12){clearDraft();return}$('resumeWorkout').classList.remove('hidden');$('resumeTitle').textContent=r.name;$('resumeMeta').textContent=`Allenamento iniziato ${fmtDate(d.startedAt)} · salvataggio automatico`}
function restoreDraft(d){const r=routines.find(x=>x.id===d.routineId);if(!r)return;startRoutine(r.id,d);$('resumeWorkout').classList.add('hidden')}

async function boot(){
  const reset=new URLSearchParams(location.search).get('reset');
  if(reset){$('auth').classList.remove('hidden');setAuthPanel('resetPasswordPanel');return}
  if(!token){$('auth').classList.remove('hidden');initGoogleAuth();return}
  try{me=await api('/api/me');$('auth').classList.add('hidden');$('app').classList.remove('hidden');applySettings();await refresh();if(me.role==='admin')addAdminNav();showResume();}
  catch(e){console.warn(e);localStorage.removeItem('iron_token');token=null;$('auth').classList.remove('hidden');toast(e.message)}
}
function applySettings(){
  document.body.classList.remove('light','dark');if(me.theme!=='system')document.body.classList.add(me.theme);
  document.documentElement.style.setProperty('--accent',me.accent||'#8b5cf6');
  if($('accentPicker'))$('accentPicker').value=me.accent||'#8b5cf6';
  ['system','light','dark'].forEach(t=>$(t==='system'?'themeSystem':`theme${t[0].toUpperCase()+t.slice(1)}`)?.classList.toggle('selected',me.theme===t));
  $('greeting').textContent=`Ciao ${esc((me.name||'Atleta').split(' ')[0])}`;
  $('profileName').value=me.name||'';$('profileHeight').value=me.height_cm||'';$('profileWeight').value=me.weight_kg||'';$('profileNotes').value=me.notes||'';
  updateInstallUI();scheduleIconRefresh();
}
async function refresh(){
  [routines,sessions,stats,measurements,progression]=await Promise.all([api('/api/routines'),api('/api/sessions'),api('/api/stats'),api('/api/measurements'),api('/api/progression').then(x=>x.exercises)]);
  renderRoutines();renderDashboard();renderHistory();renderAnalytics();renderMeasurements();showResume();scheduleIconRefresh();
}
function openPage(id){
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));$(id)?.classList.add('active');
  document.querySelectorAll('.bottomnav button').forEach(x=>x.classList.toggle('active',x.dataset.page===id));
  if(id==='exercises'&&!$('exerciseGrid').children.length)loadExercises();
  if(id==='admin')loadAdmin();if(id==='profile')applySettings();
}
function renderDashboard(){
  $('statWorkouts').textContent=stats?.workouts||0;$('statVolume').textContent=Math.round(stats?.volume||0).toLocaleString('it-IT');$('statSets').textContent=stats?.sets||0;
  $('routinePreview').innerHTML=routines.slice(0,3).map(r=>routineCard(r)).join('')||empty('Nessuna scheda','Crea la prima dal builder.');
  $('topExercises').innerHTML=(stats?.top_exercises||[]).slice(0,4).map(x=>`<div class="list-row clickable" onclick="openExerciseHistory('${esc(x.name)}')"><div><b>${esc(x.name)}</b><small>${x.sets} serie · ${x.reps} reps · PR ${x.best} kg</small></div><strong>${Math.round(x.volume)} kg</strong></div>`).join('')||empty('Ancora pochi dati','Completa qualche allenamento.');
}
function routineCard(r,admin=false){const days=r.days||[];return `<div class="card"><div class="card-title">${esc(r.name)}</div><div class="card-meta">${esc(r.folder||'')} · ${days.length} giorni · ${days.reduce((n,d)=>n+(d.exercises||[]).length,0)} esercizi</div>${r.description?`<p class="muted">${esc(r.description)}</p>`:''}<div class="card-actions">${!admin?`<button class="primary small" onclick="startRoutine('${r.id}')">Allenati</button><button class="secondary small" onclick="editRoutine('${r.id}')">Modifica</button><button class="secondary small" onclick="duplicateRoutine('${r.id}')">Copia</button><button class="danger small" onclick="deleteRoutine('${r.id}')">×</button>`:''}</div></div>`}
function renderRoutines(){const q=($('routineSearch')?.value||'').toLowerCase();$('routineList').innerHTML=routines.filter(r=>(r.name||'').toLowerCase().includes(q)||(r.folder||'').toLowerCase().includes(q)).map(r=>routineCard(r)).join('')||empty('Nessun risultato','Prova un altro termine.')}
function newRoutine(){$('builder').removeAttribute('data-admin-uid');$('builder').removeAttribute('data-admin-rid');editingId=null;builderDays=[{name:'Giorno 1',exercises:[]}];builderDay=0;$('builderTitle').textContent='Nuova scheda';$('routineName').value='';$('routineFolder').value='Le mie schede';$('routineDesc').value='';renderBuilder();scheduleIconRefresh();openPage('builder')}
function editRoutine(id){$('builder').removeAttribute('data-admin-uid');$('builder').removeAttribute('data-admin-rid');const r=routines.find(x=>x.id===id);if(!r)return;editingId=id;builderDays=JSON.parse(JSON.stringify(r.days||[]));if(!builderDays.length)builderDays=[{name:'Giorno 1',exercises:[]}];builderDay=0;$('builderTitle').textContent='Modifica scheda';$('routineName').value=r.name;$('routineFolder').value=r.folder||'';$('routineDesc').value=r.description||'';renderBuilder();scheduleIconRefresh();openPage('builder')}
function renderBuilder(){$('builderDays').innerHTML=builderDays.map((d,di)=>`<div class="panel builder-day ${di===builderDay?'selected':''}"><div class="section-head"><button class="day-tab" onclick="builderDay=${di};renderBuilder()">${esc(d.name)}</button><button class="danger ghost" onclick="removeBuilderDay(${di})">×</button></div>${(d.exercises||[]).map((e,ei)=>`<div class="builder-ex"><div class="ex-main"><b>${esc(e.name||'Esercizio')}</b><small>${esc(e.equipment||'')} ${e.exerciseId?'· ExerciseDB':''}</small></div><input type="number" min="1" value="${e.sets||3}" title="Serie" onchange="builderDays[${di}].exercises[${ei}].sets=+this.value"><input value="${esc(e.reps||'8-12')}" title="Reps" onchange="builderDays[${di}].exercises[${ei}].reps=this.value"><input type="number" min="0" max="5" value="${e.rir??1}" title="RIR" onchange="builderDays[${di}].exercises[${ei}].rir=+this.value"><button class="danger ghost" onclick="removeBuilderExercise(${di},${ei})">×</button></div>`).join('')||'<div class="muted">Nessun esercizio in questo giorno.</div>'}</div>`).join('')}
function addBuilderDay(){builderDays.push({name:`Giorno ${builderDays.length+1}`,exercises:[]});builderDay=builderDays.length-1;renderBuilder()}
function removeBuilderDay(i){if(builderDays.length===1)return toast('Serve almeno un giorno');builderDays.splice(i,1);builderDay=Math.max(0,Math.min(builderDay,builderDays.length-1));renderBuilder()}
function removeBuilderExercise(di,ei){builderDays[di].exercises.splice(ei,1);renderBuilder()}
async function saveRoutine(){const data={name:$('routineName').value.trim()||'Nuova scheda',folder:$('routineFolder').value.trim()||'Le mie schede',description:$('routineDesc').value.trim(),days:builderDays};try{await api(editingId?'/api/routines/'+editingId:'/api/routines',{method:editingId?'PUT':'POST',body:JSON.stringify(data)});toast('Scheda salvata');await refresh();openPage('routines')}catch(e){toast(e.message)}}
async function deleteRoutine(id){if(!confirm('Eliminare questa scheda?'))return;try{await api('/api/routines/'+id,{method:'DELETE'});await refresh();toast('Scheda eliminata')}catch(e){toast(e.message)}}
async function duplicateRoutine(id){try{await api('/api/routines/'+id+'/duplicate',{method:'POST'});await refresh();toast('Copia creata')}catch(e){toast(e.message)}}

function openExercisePicker(){$('exerciseModal').classList.remove('hidden');$('pickerSearch').value='';loadPicker()}
function closeExercisePicker(){$('exerciseModal').classList.add('hidden')}
function debouncedPicker(){clearTimeout(pickerTimer);pickerTimer=setTimeout(loadPicker,350)}
async function loadPicker(){const q=encodeURIComponent($('pickerSearch').value||'');$('pickerGrid').innerHTML='<div class="muted">Caricamento...</div>';try{const d=await api('/api/exercises?q='+q+'&limit=24');const arr=Array.isArray(d)?d:(d.data||[]);if(!arr.length){$('pickerGrid').innerHTML=empty('Nessun esercizio','Prova un’altra ricerca.');return}$('pickerGrid').innerHTML='';arr.forEach(e=>{const b=document.createElement('button');b.className='picker-item';b.innerHTML='<b>'+esc(e.name||'Esercizio')+'</b><small>'+esc((e.targetMuscles||[]).join(', '))+'</small>';b.onclick=()=>addExerciseFromPicker(e);$('pickerGrid').appendChild(b)})}catch(e){$('pickerGrid').innerHTML=empty('Libreria non disponibile',e.message)}}
function addExerciseFromPicker(e){builderDays[builderDay].exercises.push({name:e.name,exerciseId:e.exerciseId||e.id,sets:3,reps:'8-12',rest:120,rir:1,equipment:(e.equipments||[]).join(', '),imageUrl:e.imageUrl,gifUrl:e.gifUrl,videoUrl:e.videoUrl});closeExercisePicker();renderBuilder();scheduleIconRefresh();toast('Esercizio aggiunto')}
async function loadExercises(){const q=encodeURIComponent($('exerciseSearch').value||''),bp=encodeURIComponent($('bodyFilter').value||''),eq=encodeURIComponent($('equipmentFilter').value||'');$('exerciseGrid').innerHTML='<div class="panel">Caricamento esercizi...</div>';try{const d=await api('/api/exercises?q='+q+'&bodyPart='+bp+'&equipment='+eq+'&limit=36');const arr=Array.isArray(d)?d:(d.data||[]);$('exerciseGrid').innerHTML='';if(!arr.length)$('exerciseGrid').innerHTML=empty('Nessun esercizio','Prova un filtro diverso.');arr.forEach(e=>{const article=document.createElement('article');article.className='exercise';const media=e.imageUrl||e.gifUrl?'<img loading="lazy" src="'+esc(e.imageUrl||e.gifUrl)+'">':'<span>IRONTRACK</span>';article.innerHTML='<div class="exercise-media">'+media+'</div><div><b>'+esc(e.name||'Esercizio')+'</b><small>'+esc((e.targetMuscles||[]).join(', ')||e.target||'')+'</small><small>'+esc((e.equipments||[]).join(', ')||e.equipment||'')+'</small></div>';article.onclick=()=>openExerciseDetail(e);$('exerciseGrid').appendChild(article)});loadExerciseFilters();scheduleIconRefresh()}catch(e){$('exerciseGrid').innerHTML=empty('ExerciseDB non disponibile',e.message)}}
async function loadExerciseFilters(){if($('bodyFilter').dataset.loaded)return;try{const [b,e]=await Promise.all([api('/api/exercises-meta/bodyparts'),api('/api/exercises-meta/equipment')]);const ba=b.data||b||[],ea=e.data||e||[];$('bodyFilter').innerHTML='<option value="">Tutti i distretti</option>'+ba.map(x=>`<option value="${esc(x.name||x)}">${esc(x.name||x)}</option>`).join('');$('equipmentFilter').innerHTML='<option value="">Tutta l’attrezzatura</option>'+ea.map(x=>`<option value="${esc(x.name||x)}">${esc(x.name||x)}</option>`).join('');$('bodyFilter').dataset.loaded='1'}catch{}}
async function openExerciseDetail(e){lastDetail=e;$('detailTitle').textContent=e.name||'Esercizio';$('detailBody').innerHTML='<div class="detail-loading">Caricamento...</div>';$('exerciseDetail').classList.remove('hidden');try{const d=e.exerciseId||e.id?await api('/api/exercises/'+encodeURIComponent(e.exerciseId||e.id)):e;let html='';if(d.imageUrl||d.gifUrl)html+='<img class="detail-image" src="'+esc(d.imageUrl||d.gifUrl)+'">';html+='<div class="detail-tags">'+(d.targetMuscles||[]).map(x=>'<span>'+esc(x)+'</span>').join('')+(d.equipments||[]).map(x=>'<span>'+esc(x)+'</span>').join('')+'</div><h4>Istruzioni</h4><ol>'+(d.instructions||d.steps||[]).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ol>';if(!(d.instructions||d.steps||[]).length)html+='<p class="muted">Nessuna istruzione fornita dalla sorgente.</p>';if(d.videoUrl)html+='<a class="video-link" href="'+esc(d.videoUrl)+'" target="_blank" rel="noopener">▶ Apri video</a>';html+='<button id="detailAddBtn" class="primary wide">＋ Aggiungi alla scheda</button>'; $('detailBody').innerHTML=html;$('detailAddBtn').onclick=()=>{addExerciseFromPicker(d);closeDetail()}}catch(err){$('detailBody').innerHTML=empty('Dettagli non disponibili',err.message)}}
function closeDetail(){$('exerciseDetail').classList.add('hidden')}
function debouncedExercises(){clearTimeout(exTimer);exTimer=setTimeout(loadExercises,400)}

function previousForExercise(id,name){
  const all=[];sessions.forEach(s=>(s.sets||[]).forEach(x=>{if((id&&x.exercise_id===id)||(!id&&x.exercise_name===name))all.push(x)}));
  if(!all.length)return null;return all[all.length-1];
}
function suggestionForExercise(id,name,targetReps){
  const related=[];sessions.forEach(s=>(s.sets||[]).forEach(x=>{if((id&&x.exercise_id===id)||(!id&&x.exercise_name===name))related.push({...x,started_at:s.started_at})}));
  if(!related.length)return null;
  related.sort((a,b)=>new Date(b.started_at)-new Date(a.started_at));
  const last=related[0]; let min=8,max=12; const m=String(targetReps||'8-12').match(/(\d+)\s*(?:-|–|to)\s*(\d+)/);
  if(m){min=+m[1];max=+m[2]} else {const n=parseInt(targetReps,10);if(n){min=n;max=n}}
  const weight=Number(last.weight)||0,reps=Number(last.reps)||0,rir=last.rir===''?null:Number(last.rir);
  if(weight<=0)return null;
  if(reps>=max && (rir===null || rir<=2))return {weight:weight+2.5,label:`Prova ${weight+2.5} kg`};
  if(reps>=min)return {weight,label:`Mantieni ${weight} kg · punta a ${Math.min(max,reps+1)} reps`};
  return {weight,label:`Riparti da ${weight} kg · obiettivo ${min}-${max}`};
}
function startRoutine(id,draft=null){
  const r=routines.find(x=>x.id===id);if(!r)return;
  sessionRoutineId=id;sessionStart=draft?.startedAt||Date.now();clearInterval(sessionTimer);sessionTimer=setInterval(()=>{$('timer').textContent=formatTime(Math.floor((Date.now()-sessionStart)/1000))},1000);$('timer').textContent=formatTime(Math.floor((Date.now()-sessionStart)/1000));$('sessionTitle').textContent=r.name;$('sessionNotes').value=draft?.notes||'';$('session').dataset.routine=id;
  const saved=draft?.sets||[];
  $('sessionExercises').innerHTML=(r.days||[]).map((d,di)=>`<div class="panel"><div class="section-head"><h3>${esc(d.name)}</h3><span class="chip">${(d.exercises||[]).length} esercizi</span></div>${(d.exercises||[]).map((e,ei)=>{const sug=suggestionForExercise(e.exerciseId||e.id,e.name,e.reps);return `<div class="live-ex" data-exercise="${esc(e.exerciseId||e.id||'')}" data-name="${esc(e.name)}"><div class="live-head"><div><b>${esc(e.name)}</b><small>${e.sets||3} × ${esc(e.reps||'8-12')} · RIR ${esc(e.rir??1)}</small>${sug?`<span class="suggestion">${esc(sug.label)}</span>`:''}</div><button class="chip" onclick="addLiveSet(this)">＋ Serie</button></div><div class="live-sets"></div></div>`}).join('')}</div>`).join('');
  const exs=[...document.querySelectorAll('.live-ex')];
  exs.forEach((ex,ei)=>{const planned=(r.days||[]).flatMap(d=>d.exercises||[])[ei];const draftRows=saved.filter(x=>x.ei===ei);const count=Math.max(Number(planned?.sets)||3,draftRows.length||0);for(let i=0;i<count;i++){addLiveSet(ex.querySelector('.chip'),draftRows[i])}});
  document.querySelectorAll('#session input,#session textarea').forEach(el=>el.addEventListener('input',saveDraft));
  saveDraft();openPage('session');
}
function addLiveSet(btn,data=null){
  const ex=btn.closest('.live-ex'),box=ex.querySelector('.live-sets'),n=box.children.length+1,row=document.createElement('div');row.className='set-row';
  const sug=suggestionForExercise(ex.dataset.exercise,ex.dataset.name,'8-12');
  const prev=previousForExercise(ex.dataset.exercise,ex.dataset.name);
  const weight=data?.weight ?? sug?.weight ?? prev?.weight ?? '';
  const reps=data?.reps ?? prev?.reps ?? '';
  const rir=data?.rir ?? prev?.rir ?? '';
  row.innerHTML=`<span>${n}</span><input class="setweight" type="number" min="0" step="0.5" placeholder="kg" value="${esc(weight)}"><input class="setreps" type="number" min="0" placeholder="reps" value="${esc(reps)}"><input class="setrir" type="number" min="0" max="5" placeholder="RIR" value="${esc(rir)}"><button class="ghost danger" onclick="this.parentElement.remove();saveDraft()">×</button>`;box.appendChild(row);saveDraft()
}
function cancelSession(){clearInterval(sessionTimer);clearInterval(restTimer);sessionTimer=null;restTimer=null;if(confirm('Uscire senza salvare?')){clearDraft();sessionStart=null;sessionRoutineId=null;openPage('routines')}}
async function finishSession(){
  if(!sessionStart)return;clearInterval(sessionTimer);clearInterval(restTimer);restTimer=null;const sets=[];document.querySelectorAll('.live-ex').forEach(ex=>ex.querySelectorAll('.set-row').forEach((r,i)=>sets.push({exercise_id:ex.dataset.exercise,exercise_name:ex.dataset.name,set_number:i+1,weight:+r.querySelector('.setweight').value||0,reps:+r.querySelector('.setreps').value||0,rir:+r.querySelector('.setrir').value||0})));
  if(!sets.some(x=>x.weight>0&&x.reps>0))return toast('Inserisci almeno una serie con kg e reps');
  const dur=Math.max(1,Math.round((Date.now()-sessionStart)/60000));
  try{await api('/api/sessions',{method:'POST',body:JSON.stringify({routine_id:sessionRoutineId,started_at:new Date(sessionStart).toISOString(),duration_min:dur,notes:$('sessionNotes').value,sets})});clearDraft();sessionStart=null;sessionRoutineId=null;await refresh();toast('Allenamento salvato 💪');openPage('history')}catch(e){toast(e.message)}}
function renderHistory(){$('historyList').innerHTML=sessions.map((s,i)=>`<button class="list-row history-row" onclick="openSessionDetail(${i})"><div><b>${esc(s.routine_name||s.routine_id||'Allenamento')}</b><small>${fmtDate(s.started_at)} · ${s.duration_min||0} min · volume ${Math.round((s.sets||[]).reduce((n,x)=>n+(+x.weight||0)*(+x.reps||0),0))} kg</small></div><strong>${(s.sets||[]).length} serie</strong></button>`).join('')||empty('Storico vuoto','Completa il primo allenamento.')}
function openSessionDetail(i){const s=sessions[i];if(!s)return;const by={};(s.sets||[]).forEach(x=>{const k=x.exercise_id||x.exercise_name;by[k]??={name:x.exercise_name||'Esercizio',sets:[]};by[k].sets.push(x)});$('sessionDetailTitle').textContent=s.routine_name||'Allenamento';$('sessionDetailBody').innerHTML=`<p class="muted">${fmtDate(s.started_at)} · ${s.duration_min||0} min</p>${Object.values(by).map(x=>`<div class="card"><b>${esc(x.name)}</b>${x.sets.map(z=>`<div class="set-summary"><span>Serie ${z.set_number}</span><strong>${z.weight||0} kg × ${z.reps||0}</strong><span>RIR ${z.rir??0}</span></div>`).join('')}</div>`).join('')}${s.notes?`<div class="panel"><b>Note</b><p class="muted">${esc(s.notes)}</p></div>`:''}`;$('sessionDetail').classList.remove('hidden')}
function closeSessionDetail(){$('sessionDetail').classList.add('hidden')}
function exerciseHistoryData(name){const rows=[];sessions.forEach(s=>(s.sets||[]).forEach(x=>{if(x.exercise_name===name)rows.push({...x,date:s.started_at})}));return rows.sort((a,b)=>new Date(a.date)-new Date(b.date))}
function openExerciseHistory(name){const rows=exerciseHistoryData(name);$('exerciseHistoryTitle').textContent=name;$('exerciseHistoryBody').innerHTML=rows.length?`<div class="chart-wrap">${renderExerciseChart(rows)}</div><div class="list">${rows.slice().reverse().map(x=>`<div class="list-row"><div><b>${fmtDay(x.date)}</b><small>${x.reps||0} reps · RIR ${x.rir??0}</small></div><strong>${x.weight||0} kg</strong></div>`).join('')}</div>`:empty('Nessun dato','Non ci sono ancora serie per questo esercizio.');$('exerciseHistory').classList.remove('hidden')}
function closeExerciseHistory(){$('exerciseHistory').classList.add('hidden')}
function renderExerciseChart(rows){if(!rows.length)return '';const max=Math.max(...rows.map(x=>+x.weight||0),1),w=640,h=210,p=30;const pts=rows.map((x,i)=>{const px=p+(i*(w-p*2)/Math.max(rows.length-1,1));const py=h-p-((+x.weight||0)/max)*(h-p*2);return `${px},${py}`});return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Progressione carico"><line x1="${p}" y1="${h-p}" x2="${w-p}" y2="${h-p}"/><polyline points="${pts.join(' ')}"/><g>${rows.map((x,i)=>{const [px,py]=pts[i].split(',');return `<circle cx="${px}" cy="${py}" r="4"><title>${fmtDay(x.date)} · ${x.weight||0} kg</title></circle>`}).join('')}</g></svg>`}
function renderAnalytics(){
  $('anaWorkouts').textContent=stats?.workouts||0;$('anaVolume').textContent=Math.round(stats?.volume||0).toLocaleString('it-IT');$('anaBest').textContent=stats?.best_weight||0;
  $('progressionList').innerHTML=(progression||[]).slice(0,8).map(x=>{const label=x.action==='increase'?`Prova ${x.suggested_weight} kg`:x.action==='maintain'?`Mantieni ${x.suggested_weight} kg`: `Ripeti ${x.suggested_weight} kg`;return `<div class="card progression-card"><div class="card-title">${esc(x.name)}</div><div class="card-meta">PR ${x.pr_weight} kg × ${x.pr_reps} · ultima ${x.last_weight} kg × ${x.last_reps}</div><div class="progression-grid"><div><small>MEDIA REPS</small><b>${x.average_reps}</b></div><div><small>PR</small><b>${x.pr_weight} kg</b></div><div><small>PROSSIMO</small><b>${esc(label)}</b></div></div><button class="secondary small" onclick="openExerciseHistory('${esc(x.name)}')">Storico</button></div>`}).join('')||empty('Ancora nessuna progressione','Completa il primo allenamento.');
  $('analyticsList').innerHTML=(stats?.top_exercises||[]).map(x=>`<div class="list-row clickable" onclick="openExerciseHistory('${esc(x.name)}')"><div><b>${esc(x.name)}</b><small>${x.sets} serie · ${x.reps} reps · PR ${x.best} kg</small></div><strong>${Math.round(x.volume)} kg</strong></div>`).join('')||empty('Dati insufficienti','Registra qualche serie per vedere le statistiche.');
  $('trendChart').innerHTML=renderVolumeChart(); $('weightChart').innerHTML=renderWeightChart();
}
function renderVolumeChart(){if(!sessions.length)return empty('Nessun grafico','Completa almeno un allenamento.');const by={};sessions.forEach(s=>{const d=fmtDay(s.started_at);by[d]=(by[d]||0)+(s.sets||[]).reduce((n,x)=>n+(+x.weight||0)*(+x.reps||0),0)});const rows=Object.entries(by).reverse().slice(-14);const max=Math.max(...rows.map(x=>x[1]),1);return `<div class="bar-chart">${rows.map(([d,v])=>`<div class="bar-item"><div class="bar" style="height:${Math.max(6,(v/max)*150)}px" title="${Math.round(v)} kg"></div><small>${esc(d.slice(0,5))}</small></div>`).join('')}</div>`}

function renderWeightChart(){
  const rows=(measurements||[]).filter(x=>x.weight_kg!=null).slice().sort((a,b)=>new Date(a.recorded_at)-new Date(b.recorded_at));
  if(!rows.length)return empty('Nessun grafico','Aggiungi almeno una misurazione del peso.');
  const max=Math.max(...rows.map(x=>+x.weight_kg||0),1),min=Math.min(...rows.map(x=>+x.weight_kg||0),0),span=Math.max(max-min,1),w=640,h=210,p=30;
  const pts=rows.map((x,i)=>{const px=p+(i*(w-p*2)/Math.max(rows.length-1,1));const py=h-p-(((+x.weight_kg||0)-min)/span)*(h-p*2);return `${px},${py}`});
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Andamento peso corporeo"><line x1="${p}" y1="${h-p}" x2="${w-p}" y2="${h-p}"/><polyline points="${pts.join(' ')}"/><g>${rows.map((x,i)=>{const [px,py]=pts[i].split(',');return `<circle cx="${px}" cy="${py}" r="4"><title>${fmtDay(x.recorded_at)} · ${x.weight_kg} kg</title></circle>`}).join('')}</g></svg>`;
}
function startRestTimer(seconds=90){
  seconds=Number(seconds)||90; clearInterval(restTimer); restEnd=Date.now()+seconds*1000;
  const tick=()=>{const left=Math.max(0,Math.ceil((restEnd-Date.now())/1000)); const m=String(Math.floor(left/60)).padStart(2,'0'),sec=String(left%60).padStart(2,'0'); toast(`Recupero ${m}:${sec}`); if(left<=0){clearInterval(restTimer);restTimer=null; navigator.vibrate?.([180,80,180]); toast('Recupero terminato 💪');}};
  tick(); restTimer=setInterval(tick,1000);
}
function renderMeasurements(){$('measurementsList').innerHTML=measurements.map(m=>`<div class="list-row"><div><b>${m.weight_kg??'—'} kg</b><small>${fmtDay(m.recorded_at)} ${m.body_fat!=null?'· '+m.body_fat+'% BF':''}</small></div><span>${m.waist_cm!=null?m.waist_cm+' cm vita':''}</span></div>`).join('')||empty('Nessuna misura','Aggiungi il primo rilevamento.')}
async function addMeasurement(){const w=prompt('Peso kg',me.weight_kg??'');if(w===null)return;const h=prompt('Altezza cm',me.height_cm??'');const bf=prompt('Body fat % (opzionale)','');const waist=prompt('Vita cm (opzionale)','');try{await api('/api/measurements',{method:'POST',body:JSON.stringify({weight_kg:w?+w:null,height_cm:h?+h:null,body_fat:bf?+bf:null,waist_cm:waist?+waist:null})});me=await api('/api/me');applySettings();await refresh();toast('Misurazione salvata')}catch(e){toast(e.message)}}
async function saveProfile(){try{me=await api('/api/me/profile',{method:'PATCH',body:JSON.stringify({name:$('profileName').value,height_cm:$('profileHeight').value?+$('profileHeight').value:null,weight_kg:$('profileWeight').value?+$('profileWeight').value:null,notes:$('profileNotes').value})});applySettings();toast('Profilo aggiornato')}catch(e){toast(e.message)}}
async function generateAI(){const body={goal:$('aiGoal').value,days:+$('aiDays').value,duration:+$('aiDuration').value,level:$('aiLevel').value,focus:$('aiFocus').value.split(',').map(x=>x.trim()).filter(Boolean),equipment:['palestra completa'],constraints:$('aiConstraints').value,body_notes:me.notes||''};$('aiResult').innerHTML=empty('Generazione...','Preparazione programma.');try{const d=await api('/api/ai/workout',{method:'POST',body:JSON.stringify(body)}),p=d.plan;$('aiResult').innerHTML=`<div class="panel"><div class="ai-badge">${esc(d.provider)}</div><h3>${esc(p.name)}</h3><p class="muted">${esc(p.description||'')}</p>${(p.days||[]).map(day=>`<div class="card ai-day"><b>${esc(day.name)}</b>${(day.exercises||[]).map(e=>`<div class="list-row"><span>${esc(e.name)}</span><small>${e.sets} × ${esc(e.reps)} · ${e.rest||90}s · RIR ${esc(e.rir)}</small></div>`).join('')}</div>`).join('')}<button class="primary wide" onclick='importAIPlan(${JSON.stringify(p).replace(/'/g,'&#39;')})'>Salva nella libreria</button></div>`}catch(e){$('aiResult').innerHTML=empty('AI non disponibile',e.message)}}
async function importAIPlan(p){try{await api('/api/routines',{method:'POST',body:JSON.stringify({name:p.name,description:p.description||'',folder:'AI',days:p.days||[]})});await refresh();toast('Programma AI salvato');openPage('routines')}catch(e){toast(e.message)}}
async function shareRoutinePrompt(){if(!routines.length)return toast('Crea prima una scheda');const names=routines.map((r,i)=>`${i+1}. ${r.name}`).join('\n');const n=prompt('Numero scheda:\n'+names);const r=routines[+n-1];if(!r)return;try{const x=await api('/api/routines/'+r.id+'/share',{method:'POST'});prompt('Codice da inviare:',x.code)}catch(e){toast(e.message)}}
async function importRoutine(){const c=$('importCode').value.trim();if(!c)return;try{await api('/api/routines/import/'+encodeURIComponent(c),{method:'POST'});await refresh();toast('Scheda importata')}catch(e){toast(e.message)}}
async function changePassword(){const current=prompt('Password attuale');if(!current)return;const next=prompt('Nuova password (min 8 caratteri)');if(!next)return;try{await api('/api/auth/change-password',{method:'POST',body:JSON.stringify({current_password:current,new_password:next})});toast('Password aggiornata')}catch(e){toast(e.message)}}
function setTheme(theme){api('/api/me/settings',{method:'PATCH',body:JSON.stringify({theme,accent:me.accent})}).then(()=>{me.theme=theme;applySettings()}).catch(e=>toast(e.message))}
function saveAccent(accent){api('/api/me/settings',{method:'PATCH',body:JSON.stringify({theme:me.theme,accent})}).then(()=>{me.accent=accent;applySettings()}).catch(e=>toast(e.message))}
function logout(){localStorage.removeItem('iron_token');token=null;location.reload()}
function addAdminNav(){
  if(document.querySelector('[data-page="admin"]')) return;
  const nav=document.querySelector('.bottomnav');
  if(!nav) return;
  const b=document.createElement('button');
  b.dataset.page='admin';
  b.onclick=()=>openPage('admin');
  b.innerHTML='<span>Superadmin</span>';
  b.setAttribute('aria-label','Apri Superadmin');
  nav.appendChild(b);
  scheduleIconRefresh();
}
async function loadAdmin(){try{const users=await api('/api/admin/users');$('adminUsers').innerHTML=users.map(u=>`<div class="card"><div class="card-title">${esc(u.name)}</div><div class="card-meta">${esc(u.email)} · ${u.role}</div>${u.weight_kg?`<div class="chips"><span>${u.weight_kg} kg</span>${u.height_cm?`<span>${u.height_cm} cm</span>`:''}</div>`:''}<div class="card-actions">${u.role!=='admin'?`<button class="secondary small" onclick="showChild('${u.id}','${esc(u.name)}')">Apri profilo</button>`:'<span class="chip">SUPER ADMIN</span>'}</div></div>`).join('')}catch(e){$('adminUsers').innerHTML=empty('Admin non disponibile',e.message)}}
async function showChild(uid,name){try{const [u,rs,ss]=await Promise.all([api('/api/admin/users/'+uid),api('/api/admin/users/'+uid+'/routines'),api('/api/admin/users/'+uid+'/sessions')]);$('adminChildRoutines').classList.remove('hidden');$('adminChildRoutines').innerHTML=`<div class="section-head"><div><h3>${esc(u.name)}</h3><small>${esc(u.email)} · ${ss.length} allenamenti</small></div><button class="primary small" onclick="adminNewRoutine('${uid}','${esc(name)}')">＋ Scheda</button></div>${rs.map(r=>`<div class="list-row"><div><b>${esc(r.name)}</b><small>${esc(r.folder)} · ${(r.days||[]).length} giorni</small></div><button class="secondary small" onclick='adminEditRoutine(${JSON.stringify(u).replace(/'/g,'&#39;')},${JSON.stringify(r).replace(/'/g,'&#39;')})'>Modifica</button></div>`).join('')||empty('Nessuna scheda','Crea una scheda per questo profilo.')}`}catch(e){toast(e.message)}}
async function adminNewRoutine(uid,name){const title=prompt(`Nome scheda per ${name}`);if(!title)return;const days=[{name:'Giorno 1',exercises:[{name:'Panca piana',sets:3,reps:'8-10',rir:1},{name:'Lat machine',sets:3,reps:'8-12',rir:1},{name:'Alzate laterali',sets:3,reps:'12-15',rir:1}]}];try{await api('/api/admin/users/'+uid+'/routines',{method:'POST',body:JSON.stringify({name:title,folder:'Assegnate dal coach',description:'Scheda creata dal Super Admin',days})});toast('Scheda assegnata');showChild(uid,name)}catch(e){toast(e.message)}}
async function adminEditRoutine(u,r){editingId=null;builderDays=JSON.parse(JSON.stringify(r.days||[]));builderDay=0;$('builderTitle').textContent=`Modifica · ${u.name}`;$('routineName').value=r.name;$('routineFolder').value=r.folder;$('routineDesc').value=r.description||'';renderBuilder();$('builder').dataset.adminUid=u.id;$('builder').dataset.adminRid=r.id;openPage('builder')}
const originalSaveRoutine=saveRoutine;window.saveRoutine=async function(){const uid=$('builder').dataset.adminUid,rid=$('builder').dataset.adminRid;if(uid&&rid){try{await api(`/api/admin/users/${uid}/routines/${rid}`,{method:'PUT',body:JSON.stringify({name:$('routineName').value,folder:$('routineFolder').value,description:$('routineDesc').value,days:builderDays})});delete $('builder').dataset.adminUid;delete $('builder').dataset.adminRid;toast('Scheda aggiornata');openPage('admin');loadAdmin()}catch(e){toast(e.message)}return}return originalSaveRoutine()}

function setAuthPanel(panel){
  ['loginPanel','registerPanel','resetRequestPanel','resetPasswordPanel'].forEach(id=>$(id)?.classList.toggle('hidden',id!==panel));
  const title=$('authTitle'),sub=$('authSubtitle');
  if(panel==='loginPanel'){title.innerHTML='Allenati.<br><span>Misura.</span><br>Progredisci.';sub.textContent="Schede, workout, PR e progressi in un'unica esperienza."}
  if(panel==='registerPanel'){title.innerHTML='Crea il tuo<br><span>percorso.</span>';sub.textContent='Il tuo spazio personale per allenarti, registrare e migliorare.'}
  if(panel==='resetRequestPanel'){title.innerHTML='Recupera il tuo<br><span>account.</span>';sub.textContent='Ti aiutiamo a rientrare in IronTrack in modo sicuro.'}
  if(panel==='resetPasswordPanel'){title.innerHTML='Nuova password.<br><span>Riparti.</span>';sub.textContent='Scegli una password sicura e torna al tuo allenamento.'}
}
function togglePassword(id,btn){const input=$(id);if(!input)return;input.type=input.type==='password'?'text':'password';btn.textContent=input.type==='password'?'Mostra':'Nascondi'}
async function completeAuth(d){token=d.access_token;localStorage.setItem('iron_token',token);location.reload()}
async function loginWithGoogle(credential){try{const d=await api('/api/auth/google',{method:'POST',body:JSON.stringify({credential})});await completeAuth(d)}catch(e){toast(e.message)}}
function initGoogleAuth(){
  const clientId=String(CFG.GOOGLE_CLIENT_ID||'').trim();
  if(!clientId){$('googleUnavailable')?.classList.remove('hidden');return;}
  const wait=()=>{
    if(!window.google?.accounts?.id){setTimeout(wait,250);return}
    window.google.accounts.id.initialize({client_id:clientId,callback:resp=>loginWithGoogle(resp.credential),auto_select:false,cancel_on_tap_outside:true});
    const target=$('googleButton');if(target)window.google.accounts.id.renderButton(target,{theme:document.body.classList.contains('light')?'outline':'filled_black',size:'large',shape:'pill',text:'continue_with',width:360});
  };wait();
}
$('loginForm').onsubmit=async e=>{e.preventDefault();const btn=e.submitter;btn?.setAttribute('disabled','disabled');try{const d=await api('/api/auth/login',{method:'POST',body:JSON.stringify({email:$('email').value.trim(),password:$('password').value})});await completeAuth(d)}catch(e){toast(e.message)}finally{btn?.removeAttribute('disabled')}};
$('registerForm').onsubmit=async e=>{e.preventDefault();if($('registerPassword').value!==$('registerConfirm').value)return toast('Le password non coincidono');const btn=e.submitter;btn?.setAttribute('disabled','disabled');try{const d=await api('/api/auth/register',{method:'POST',body:JSON.stringify({name:$('registerName').value.trim(),email:$('registerEmail').value.trim(),password:$('registerPassword').value})});await completeAuth(d)}catch(e){toast(e.message)}finally{btn?.removeAttribute('disabled')}};
$('resetRequestForm').onsubmit=async e=>{e.preventDefault();try{const d=await api('/api/auth/request-reset',{method:'POST',body:JSON.stringify({email:$('resetEmail').value.trim()})});toast(d.message||'Controlla la tua email');if(d.debug_token){const link=location.origin+location.pathname+'?reset='+encodeURIComponent(d.debug_token);prompt('Token di sviluppo — in produzione viene inviato via email:',link)}}catch(e){toast(e.message)}};
$('resetPasswordForm').onsubmit=async e=>{e.preventDefault();if($('resetNewPassword').value!==$('resetConfirm').value)return toast('Le password non coincidono');const tokenParam=new URLSearchParams(location.search).get('reset');if(!tokenParam)return toast('Link di reset non valido');try{const d=await api('/api/auth/reset-password',{method:'POST',body:JSON.stringify({token:tokenParam,new_password:$('resetNewPassword').value})});history.replaceState({},'',location.pathname);toast(d.message||'Password aggiornata');setAuthPanel('loginPanel')}catch(e){toast(e.message)}};
$('showRegister').onclick=()=>setAuthPanel('registerPanel');$('backToLogin').onclick=()=>setAuthPanel('loginPanel');$('forgotPassword').onclick=()=>{if($('email').value)$('resetEmail').value=$('email').value;setAuthPanel('resetRequestPanel')};$('backFromReset').onclick=()=>setAuthPanel('loginPanel');

function setTheme(theme){api('/api/me/settings',{method:'PATCH',body:JSON.stringify({theme,accent:me.accent})}).then(()=>{me.theme=theme;applySettings();initGoogleAuth()}).catch(e=>toast(e.message))}
function saveAccent(accent){api('/api/me/settings',{method:'PATCH',body:JSON.stringify({theme:me.theme,accent})}).then(()=>{me.accent=accent;applySettings();initGoogleAuth()}).catch(e=>toast(e.message))}
function logout(){localStorage.removeItem('iron_token');token=null;location.reload()}
function isIOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent)||(/Macintosh/i.test(navigator.userAgent)&&navigator.maxTouchPoints>1)}
function isStandalone(){return window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true}
function updateInstallUI(){
  const btn=$('installSettingsBtn'),help=$('installHelp'); if(!btn)return;
  if(isStandalone()){btn.textContent='✓ IronTrack installata';btn.disabled=true;help.textContent='IronTrack è già installata sulla schermata Home.';return;}
  btn.disabled=false;
  if(isIOS()){btn.textContent=' Installa su iPhone / iPad';help.textContent='Safari: userai il menu Condividi per aggiungere IronTrack alla schermata Home.';return;}
  if(deferredInstall){btn.textContent='📲 Installa IronTrack';help.textContent='Android/Chrome: tocca il pulsante e conferma l’installazione.';return;}
  btn.textContent='📲 Come installare';help.textContent='Apri il menu del browser e scegli “Installa app” o “Aggiungi alla schermata Home”.';
}
function openIOSInstallGuide(){
  const modal=document.createElement('div'); modal.className='modal'; modal.id='iosInstallModal';
  modal.innerHTML=`<div class="modal-card"><div class="modal-head"><h3>Installa IronTrack su iPhone</h3><button class="ghost" onclick="document.getElementById('iosInstallModal')?.remove()">×</button></div><img src="./assets/apple-touch-icon-180.png" alt="Logo IronTrack" class="install-modal-icon"><h3 class="install-modal-title">Aggiungi IronTrack alla Home</h3><p class="install-modal-subtitle">Su iPhone e iPad l’installazione si fa da Safari.</p><div class="ios-install-steps"><div class="ios-step"><span class="ios-step-num">1</span><div><b>Apri Safari</b><small>Apri IronTrack dal suo indirizzo web usando Safari.</small></div></div><div class="ios-step"><span class="ios-step-num">2</span><div><b>Tocca Condividi <span class="share-symbol">↑</span></b><small>È il pulsante di condivisione nella barra di Safari.</small></div></div><div class="ios-step"><span class="ios-step-num">3</span><div><b>Aggiungi alla schermata Home</b><small>Scorri il menu, seleziona “Aggiungi alla schermata Home” e conferma con “Aggiungi”.</small></div></div></div><button class="secondary wide" onclick="copyInstallLink()">Copia link IronTrack</button></div>`;
  document.body.appendChild(modal);
}
async function copyInstallLink(){try{await navigator.clipboard.writeText(location.href);toast('Link copiato');}catch(e){toast('Copia il link dalla barra del browser')}}
function downloadApp(){ installApp(); }
async function installApp(){
  if(isStandalone()){toast('IronTrack è già installata');return;}
  if(isIOS()){openIOSInstallGuide();return;}
  if(deferredInstall){try{await deferredInstall.prompt();await deferredInstall.userChoice}catch(e){}deferredInstall=null;updateInstallUI();return;}
  toast('Apri il menu del browser e scegli “Installa app” o “Aggiungi alla schermata Home”.');
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;updateInstallUI()});
window.addEventListener('appinstalled',()=>{deferredInstall=null;updateInstallUI();toast('IronTrack installata')});
window.addEventListener('pageshow',()=>{updateInstallUI();scheduleIconRefresh()});

if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
window.addEventListener('beforeunload',()=>{if(sessionStart)saveDraft()});
scheduleIconRefresh();
boot();
