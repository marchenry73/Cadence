/* ==========================================================
   Cadence — scheduling & priorities for any team
   ========================================================== */

const SUPABASE_URL = 'https://eznsmotrmzeryduwkuuf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6bnNtb3RybXplcnlkdXdrdXVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMTk4MTMsImV4cCI6MjEwMTY5NTgxM30.bdAmERDDmZwl9Pve4Jz9zjBU9dtHqUHgjzvN_wDEd5k';

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const LS = {
  get:(k,d)=>{ try{ return JSON.parse(localStorage.getItem('cad_'+k)) ?? d }catch{ return d } },
  set:(k,v)=> localStorage.setItem('cad_'+k, JSON.stringify(v))
};

let sb=null, user=null, profile=null, org=null, members=[], memberStates=[], state=null, syncTimer=null, saving=false;

const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function applyTheme(t){ document.documentElement.setAttribute('data-theme',t); LS.set('theme',t);
  const b=$('#themeBtn'); if(b) b.textContent = t==='light'?'Dark':'Light'; }
function toggleTheme(){ applyTheme(LS.get('theme','dark')==='light'?'dark':'light') }
const DAYS_FULL=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const SWATCHES=['#FFB020','#4ECDC4','#7BA7FF','#C08BFF','#FF7A5C','#8FD14F','#FF9EC4','#9AA7BD'];

/* ---------- starter templates (industry-neutral) ---------- */
const TEMPLATES = {
  general:{
    label:'General work',
    hint:'Meetings, focus blocks, admin. A safe starting point for most roles.',
    categories:[{name:'Focus work',color:'#7C6AF0',ctx:'business'},{name:'Meetings',color:'#6FA8FF',ctx:'business'},{name:'Admin',color:'#9AA7BD',ctx:'business'},{name:'Personal',color:'#3ECFB2',ctx:'personal'}],
    routines:[
      {title:'Deep work block',cat:0,days:[1,2,3,4,5],start:'09:00',end:'11:00'},
      {title:'Email & admin',cat:2,days:[1,2,3,4,5],start:'11:00',end:'11:30'},
      {title:'Team standup',cat:1,days:[1,3,5],start:'09:00',end:'09:15'},
      {title:'Lunch',cat:3,days:[1,2,3,4,5],start:'12:00',end:'13:00'}
    ]
  },
  trades:{
    label:'Field & trades',
    hint:'Job sites, drive time, quoting and invoicing.',
    categories:[{name:'Job site',color:'#FFB84D',ctx:'business'},{name:'Travel',color:'#9AA7BD',ctx:'business'},{name:'Quotes & sales',color:'#3ECFB2',ctx:'business'},{name:'Family',color:'#FF9EC4',ctx:'personal'}],
    routines:[
      {title:'Drive to first job',cat:1,days:[1,2,3,4,5],start:'07:00',end:'07:45'},
      {title:'Job site work',cat:0,days:[1,2,3,4,5],start:'08:00',end:'16:00'},
      {title:'Quotes & callbacks',cat:2,days:[1,3,5],start:'16:30',end:'17:30'},
      {title:'Invoicing',cat:3,days:[5],start:'17:30',end:'18:30'}
    ]
  },
  clinic:{
    label:'Clients & appointments',
    hint:'Back-to-back client sessions with notes and prep time.',
    categories:[{name:'Client sessions',color:'#3ECFB2',ctx:'business'},{name:'Notes & follow-up',color:'#6FA8FF',ctx:'business'},{name:'Prep',color:'#7C6AF0',ctx:'business'},{name:'Personal',color:'#FF9EC4',ctx:'personal'}],
    routines:[
      {title:'Morning prep',cat:2,days:[1,2,3,4,5],start:'08:30',end:'09:00'},
      {title:'Client sessions',cat:0,days:[1,2,3,4,5],start:'09:00',end:'12:00'},
      {title:'Notes & follow-up',cat:1,days:[1,2,3,4,5],start:'12:00',end:'12:45'},
      {title:'Client sessions',cat:0,days:[1,2,3,4,5],start:'13:30',end:'17:00'}
    ]
  },
  ministry:{
    label:'Church & ministry',
    hint:'Services, study prep, visitation and volunteer coordination.',
    categories:[{name:'Study & prep',color:'#FFB020'},{name:'Services',color:'#C08BFF'},{name:'Pastoral care',color:'#4ECDC4'},{name:'Admin',color:'#9AA7BD'}],
    routines:[
      {title:'Study block',cat:0,days:[2,4],start:'09:00',end:'12:00'},
      {title:'Midweek service',cat:1,days:[3],start:'19:00',end:'21:00'},
      {title:'Sunday service',cat:1,days:[0],start:'09:00',end:'12:30'},
      {title:'Visitation & calls',cat:2,days:[2,4],start:'14:00',end:'16:00'}
    ]
  },
  blank:{ label:'Start empty', hint:'Build your categories and routines from scratch.', categories:[{name:'Work',color:'#7C6AF0'},{name:'Personal',color:'#3ECFB2'}], routines:[] }
};

/* ---------- state ---------- */
function blankState(){
  return { version:2, displayName:'', template:null,
    categories:[], routines:[], tasks:[], events:[], goals:[], goalArea:'all', logs:[],
    contextView:'both', energyCap:2, buffer:{on:false,mins:10},
    timer:{label:'Focus',seconds:1500,running:false,last:null},
    prefs:{dayStart:6,dayEnd:22,weekOffset:0,slotMin:15},
    page:'today', onboarded:false };
}
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7) }

/* migrate a v1 (KingdomOS) state if we find one in this browser */
function migrateV1(){
  let old=null;
  try{ old=JSON.parse(localStorage.getItem('kos16_state')) }catch{}
  if(!old || !old.priorities) return null;
  const s=blankState();
  const catNames=[...new Set(old.priorities.map(p=>p.cat).filter(Boolean))];
  s.categories=catNames.map((n,i)=>({id:uid(),name:n.charAt(0).toUpperCase()+n.slice(1),color:SWATCHES[i%SWATCHES.length]}));
  const byName=Object.fromEntries(s.categories.map(c=>[c.name.toLowerCase(),c.id]));
  s.tasks=old.priorities.map(p=>({id:uid(),title:p.name,catId:byName[(p.cat||'').toLowerCase()]||null,
    importance:p.importance??5,urgency:p.urgency??5,estimate:p.duration??30,progress:p.progress??0,note:'',done:false}));
  s.onboarded=true; s.template='migrated';
  return s;
}

/* ---------- persistence ---------- */
function save(){
  LS.set('state',state);
  if(!sb||!user) return;
  clearTimeout(syncTimer);
  syncTimer=setTimeout(pushState,700);
}
let pendingPush=false, lastSyncAt=null;

async function pushState(){
  if(!sb||!user||!state) return;
  // a push is already in flight: queue this one instead of discarding it
  if(saving){ pendingPush=true; return }
  saving=true; pendingPush=false;
  const stamp=new Date().toISOString();
  const {error}=await sb.from('app_state').upsert({
    user_id:user.id, state_v2:state, org_id:org?org.id:null,
    display_name:state.displayName||null, updated_at:stamp
  },{onConflict:'user_id'});
  saving=false;
  if(error){
    console.error('[sync] push failed',error);
    toast('Not saved to cloud: '+error.message);
  } else {
    lastSyncAt=stamp;
  }
  if(pendingPush) return pushState();
}

// flush queued edits before sign-out or backgrounding
async function flushState(){
  clearTimeout(syncTimer);
  if(sb&&user&&state) await pushState();
}

// pull again when the app returns to the foreground; newer timestamp wins
async function refreshFromCloud(){
  if(!sb||!user||!state||saving) return;
  const {data,error}=await sb.from('app_state').select('state_v2,updated_at')
    .eq('user_id',user.id).maybeSingle();
  if(error||!data||!data.state_v2) return;
  if(lastSyncAt && new Date(data.updated_at)<=new Date(lastSyncAt)) return;
  lastSyncAt=data.updated_at;
  state=Object.assign(blankState(),data.state_v2);
  LS.set('state',state);
  render();
  toast('Updated from your other device');
}
async function pullState(){
  if(!sb||!user) return null;
  const {data,error}=await sb.from('app_state').select('state_v2,updated_at').eq('user_id',user.id).maybeSingle();
  if(error){
    console.error('[sync] load failed',error);
    toast('Could not load your data: '+error.message);
    return null;
  }
  if(data&&data.updated_at) lastSyncAt=data.updated_at;
  return data?data.state_v2:null;
}

/* ---------- time helpers ---------- */
const pad=n=>String(n).padStart(2,'0');
const toMin=t=>{const[a,b]=t.split(':').map(Number);return a*60+b};
const toHM=m=>`${pad(Math.floor(m/60)%24)}:${pad(m%60)}`;
function fmt12(m){const h=Math.floor(m/60)%24,mm=m%60;const ap=h<12?'am':'pm';const hh=h%12===0?12:h%12;return mm?`${hh}:${pad(mm)}${ap}`:`${hh}${ap}`}
function startOfWeek(off=0){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-d.getDay()+off*7);return d}
const isoDate=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const sameDay=(a,b)=>isoDate(a)===isoDate(b);

/* ---------- category lookup ---------- */
const catById=id=>state.categories.find(c=>c.id===id);
const catColor=id=>{const c=catById(id);return c?c.color:'#9AA7BD'};
const catName=id=>{const c=catById(id);return c?c.name:'Uncategorised'};
const catCtx=id=>{const c=catById(id);return c?(c.ctx||'personal'):'personal'};
function inContext(catId){
  const v=state.contextView||'both';
  return v==='both' || catCtx(catId)===v;
}

/* ---------- occurrences: routines + one-off events ---------- */
function occurrencesOn(date){
  const dow=date.getDay(), key=isoDate(date), out=[];
  for(const r of state.routines){
    if(!r.days.includes(dow)) continue;
    if(r.nth==='last'){ const nextWk=new Date(date); nextWk.setDate(date.getDate()+7); if(nextWk.getMonth()===date.getMonth()) continue }
    else if(r.nth && Math.ceil(date.getDate()/7)!==r.nth) continue;
    if(state.events.some(e=>e.date===key&&e.skipRoutine===r.id)) continue;
    if(!inContext(r.catId)) continue;
    out.push({id:r.id,title:r.title,catId:r.catId,start:toMin(r.start),end:toMin(r.end),note:r.note||'',
      location:r.location||'',energy:r.energy||'',kind:'routine',date:key});
  }
  for(const e of state.events){
    if(e.date!==key||e.skipRoutine) continue;
    if(!inContext(e.catId)) continue;
    out.push({id:e.id,title:e.title,catId:e.catId,start:toMin(e.start),end:toMin(e.end),note:e.note||'',
      location:e.location||'',energy:e.energy||'',buffer:e.buffer||false,kind:'event',date:key});
  }
  return out.sort((a,b)=>a.start-b.start);
}
function freeGapsOn(date){
  const busy=occurrencesOn(date).map(o=>[o.start,o.end]).sort((a,b)=>a[0]-b[0]);
  const dayS=state.prefs.dayStart*60, dayE=state.prefs.dayEnd*60;
  const merged=[];
  for(const b of busy){ if(merged.length&&b[0]<=merged[merged.length-1][1]) merged[merged.length-1][1]=Math.max(merged[merged.length-1][1],b[1]); else merged.push([...b]) }
  const gaps=[]; let cur=dayS;
  for(const [s,e] of merged){ if(s>cur) gaps.push([cur,Math.min(s,dayE)]); cur=Math.max(cur,e) }
  if(cur<dayE) gaps.push([cur,dayE]);
  return gaps.filter(g=>g[1]-g[0]>=15);
}

/* ==========================================================
   AUTH + ONBOARDING
   ========================================================== */
function initSb(){
  if(typeof supabase==='undefined'||SUPABASE_URL.startsWith('YOUR_')) return;
  sb=supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
}

function gateAuth(mode='signin'){
  $('#shell').classList.add('hidden');
  const g=$('#gate'); g.classList.remove('hidden');
  if(mode==='reset'){
    g.innerHTML=`<div class="gate-card">
      <div class="gate-mark"><div class="mark-glyph">C</div><div><div class="mark-name">Cadence</div><div class="gate-tag">RESET PASSWORD</div></div></div>
      <h1 style="margin-bottom:6px">Reset your password</h1>
      <p class="muted tiny" style="margin:0 0 18px">We'll email you a link to set a new one.</p>
      <label>Email</label><input id="aEmail" type="email" autocomplete="email" placeholder="you@company.com">
      <div style="margin-top:18px"><button class="btn" style="width:100%" onclick="doReset()">Send reset link</button></div>
      <div class="msg" id="aMsg"></div>
      <div style="margin-top:14px;text-align:center"><button class="btn-2 btn-s" onclick="gateAuth('signin')">Back to sign in</button></div>
    </div>`;
    return;
  }
  const isUp = mode==='signup';
  g.innerHTML=`<div class="gate-card">
    <div class="gate-mark"><div class="mark-glyph">C</div><div><div class="mark-name">Cadence</div><div class="gate-tag">PLAN · SCHEDULE · TRACK</div></div></div>
    <h1 style="margin-bottom:6px">${isUp?'Create your account':'Welcome back'}</h1>
    <p class="muted tiny" style="margin:0 0 18px">${isUp?'Takes about two minutes to set up.':'Sign in with your username or email.'}</p>
    ${isUp?`
      <label>Username</label>
      <input id="aUser" placeholder="alexmorgan" autocapitalize="none" oninput="checkUsername()">
      <div class="tiny" id="uHint" style="margin-top:5px;color:var(--dim)">3–20 characters. Letters, numbers and underscores.</div>
      <label>Email</label><input id="aEmail" type="email" autocomplete="email" placeholder="you@company.com">
    `:`
      <label>Username or email</label><input id="aEmail" autocapitalize="none" placeholder="alexmorgan">
    `}
    <label>Password</label><input id="aPass" type="password" autocomplete="${isUp?'new-password':'current-password'}" placeholder="At least 6 characters">
    <div style="margin-top:18px"><button class="btn" style="width:100%" onclick="doAuth('${mode}')">${isUp?'Create account':'Sign in'}</button></div>
    <div class="msg" id="aMsg"></div>
    <div class="between" style="margin-top:14px">
      <button class="btn-2 btn-s" onclick="gateAuth('${isUp?'signin':'signup'}')">${isUp?'I have an account':'Create an account'}</button>
      ${isUp?'':`<button class="btn-2 btn-s" onclick="gateAuth('reset')">Forgot password</button>`}
    </div>
  </div>`;
  $('#aPass').addEventListener('keydown',e=>{ if(e.key==='Enter') doAuth(mode) });
}

let unameTimer=null;
function checkUsername(){
  const el=$('#aUser'), hint=$('#uHint'); if(!el) return;
  const v=el.value.trim().toLowerCase();
  clearTimeout(unameTimer);
  if(!/^[a-z0-9_]{3,20}$/.test(v)){
    hint.style.color='var(--dim)';
    hint.textContent='3–20 characters. Letters, numbers and underscores.';
    return;
  }
  hint.style.color='var(--dim)'; hint.textContent='Checking…';
  unameTimer=setTimeout(async()=>{
    try{
      const {data,error}=await sb.rpc('username_available',{uname:v});
      if(error) throw error;
      hint.style.color = data ? 'var(--good)' : 'var(--warn)';
      hint.textContent = data ? `${v} is available` : `${v} is already taken`;
    }catch{ hint.style.color='var(--dim)'; hint.textContent='Could not check right now.' }
  },400);
}

async function doReset(){
  const email=$('#aEmail').value.trim(), msg=$('#aMsg');
  if(!email){ msg.className='msg err'; msg.textContent='Enter your email address.'; return }
  msg.className='msg'; msg.textContent='Sending…';
  const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin});
  if(error){ msg.className='msg err'; msg.textContent=error.message; return }
  msg.className='msg ok'; msg.textContent='Check your email for the reset link.';
}

async function doAuth(mode){
  const msg=$('#aMsg'); msg.className='msg';
  const pass=$('#aPass').value;
  if(!sb){ msg.className='msg err'; msg.textContent='Cloud sync is not configured.'; return }
  if(pass.length<6){ msg.className='msg err'; msg.textContent='Password must be at least 6 characters.'; return }

  if(mode==='signup'){
    const uname=$('#aUser').value.trim().toLowerCase();
    const email=$('#aEmail').value.trim();
    if(!/^[a-z0-9_]{3,20}$/.test(uname)){ msg.className='msg err'; msg.textContent='Pick a username: 3–20 letters, numbers or underscores.'; return }
    if(!email){ msg.className='msg err'; msg.textContent='Enter your email address.'; return }
    msg.textContent='Checking username…';
    const {data:free}=await sb.rpc('username_available',{uname});
    if(free===false){ msg.className='msg err'; msg.textContent='That username is taken.'; return }
    msg.textContent='Creating your account…';
    const {data,error}=await sb.auth.signUp({email,password:pass});
    if(error){ msg.className='msg err'; msg.textContent=error.message; return }
    pendingUsername=uname;
    if(!data.session){ msg.className='msg ok'; msg.textContent='Account created. Check your email to confirm, then sign in.'; return }
    user=data.user;
    await sb.from('profiles').insert({user_id:user.id,username:uname,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone});
    await afterSignIn(); return;
  }

  // sign in — accept username OR email
  let ident=$('#aEmail').value.trim();
  if(!ident){ msg.className='msg err'; msg.textContent='Enter your username or email.'; return }
  msg.textContent='Signing in…';
  if(!ident.includes('@')){
    const {data:mail,error:e1}=await sb.rpc('email_for_username',{uname:ident.toLowerCase()});
    if(e1||!mail){ msg.className='msg err'; msg.textContent='No account found with that username.'; return }
    ident=mail;
  }
  const {data,error}=await sb.auth.signInWithPassword({email:ident,password:pass});
  if(error){ msg.className='msg err'; msg.textContent=error.message; return }
  user=data.user;
  await afterSignIn();
}

let pendingUsername=null;

async function loadProfile(){
  if(!sb||!user) return;
  const {data}=await sb.from('profiles').select('*').eq('user_id',user.id).maybeSingle();
  profile=data||null;
  if(!profile){
    // first sign-in after email confirmation, or a legacy account
    const uname = pendingUsername || ('user_'+user.id.slice(0,8).replace(/-/g,''));
    const {data:made}=await sb.from('profiles')
      .insert({user_id:user.id,username:uname,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone})
      .select().maybeSingle();
    profile=made||null; pendingUsername=null;
  }
}

async function saveProfile(patch){
  if(!sb||!user) return null;
  const {data,error}=await sb.from('profiles').update(patch).eq('user_id',user.id).select().maybeSingle();
  if(error) return error.message;
  profile=data; return null;
}

async function afterSignIn(){
  await loadProfile();
  const cloud=await pullState();
  if(cloud){ state=cloud; }
  else {
    const migrated=migrateV1();
    state = migrated || blankState();
  }
  if(!state.version) state=Object.assign(blankState(),state);
  if(!state.displayName && profile?.full_name) state.displayName=profile.full_name;
  await loadOrg();
  LS.set('state',state);
  if(!state.onboarded){ onboard(0); return }
  enterApp();
  if(org) loadMembers().then(render);
}


/* ---------- onboarding ---------- */
let onboardDraft={name:'',jobTitle:'',company:'',template:'general',orgChoice:'solo',orgName:'',joinCode:''};

function onboard(step){
  $('#shell').classList.add('hidden');
  const g=$('#gate'); g.classList.remove('hidden');
  const bar=`<div class="steps">${[0,1,2].map(i=>`<i class="${i<=step?'on':''}"></i>`).join('')}</div>`;
  let body='';
  if(step===0){
    body=`<h1 style="margin-bottom:6px">Tell us about you</h1>
    <p class="muted tiny" style="margin:0 0 4px">Your name is what teammates see next to your schedule. The rest is optional.</p>
    <label>Your name</label><input id="obName" value="${esc(onboardDraft.name)}" placeholder="Alex Morgan">
    <label>What do you do? <span style="text-transform:none;letter-spacing:0;color:var(--dim)">(optional)</span></label>
    <input id="obTitle" value="${esc(onboardDraft.jobTitle)}" placeholder="Operations Manager">
    <label>Company or team <span style="text-transform:none;letter-spacing:0;color:var(--dim)">(optional)</span></label>
    <input id="obCompany" value="${esc(onboardDraft.company)}" placeholder="Acme Plumbing">
    <label>Time zone</label>
    <input id="obTz" value="${esc(Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC')}" readonly style="color:var(--muted)">
    <div style="margin-top:20px"><button class="btn" style="width:100%" onclick="obNext(0)">Continue</button></div>`;
  }
  if(step===1){
    body=`<h1 style="margin-bottom:6px">Pick a starting point</h1>
    <p class="muted tiny" style="margin:0 0 14px">We'll create categories and a sample week. Everything is editable afterwards.</p>
    <div class="stack">${Object.entries(TEMPLATES).map(([k,t])=>`
      <div class="item ${onboardDraft.template===k?'':''}" style="${onboardDraft.template===k?'border-color:var(--signal)':''}" onclick="onboardDraft.template='${k}';onboard(1)">
        <div class="item-t">${t.label}</div><div class="tiny muted" style="margin-top:2px">${t.hint}</div>
      </div>`).join('')}</div>
    <div style="margin-top:20px"><button class="btn" style="width:100%" onclick="obNext(1)">Continue</button></div>`;
  }
  if(step===2){
    body=`<h1 style="margin-bottom:6px">Working solo or with a team?</h1>
    <p class="muted tiny" style="margin:0 0 14px">You can change this later in Settings.</p>
    <div class="stack">
      <div class="item" style="${onboardDraft.orgChoice==='solo'?'border-color:var(--signal)':''}" onclick="onboardDraft.orgChoice='solo';onboard(2)">
        <div class="item-t">Just me</div><div class="tiny muted">A private schedule. Nobody else sees it.</div></div>
      <div class="item" style="${onboardDraft.orgChoice==='create'?'border-color:var(--signal)':''}" onclick="onboardDraft.orgChoice='create';onboard(2)">
        <div class="item-t">Create a workspace</div><div class="tiny muted">Invite your team with a join code.</div></div>
      <div class="item" style="${onboardDraft.orgChoice==='join'?'border-color:var(--signal)':''}" onclick="onboardDraft.orgChoice='join';onboard(2)">
        <div class="item-t">Join a workspace</div><div class="tiny muted">Someone gave you a code.</div></div>
    </div>
    ${onboardDraft.orgChoice==='create'?`<label>Workspace name</label><input id="obOrg" value="${esc(onboardDraft.orgName)}" placeholder="Acme Plumbing">`:''}
    ${onboardDraft.orgChoice==='join'?`<label>Join code</label><input id="obCode" value="${esc(onboardDraft.joinCode)}" placeholder="ABC123" style="text-transform:uppercase">`:''}
    <div style="margin-top:20px"><button class="btn" style="width:100%" onclick="obNext(2)">Finish setup</button></div>
    <div class="msg" id="obMsg"></div>`;
  }
  g.innerHTML=`<div class="gate-card">
    <div class="gate-mark"><div class="mark-glyph">C</div><div><div class="mark-name">Cadence</div><div class="gate-tag">SETUP ${step+1} OF 3</div></div></div>
    ${bar}${body}</div>`;
}

async function obNext(step){
  if(step===0){
    const n=$('#obName').value.trim();
    if(!n){ return toast('Enter a name to continue.') }
    onboardDraft.name=n;
    onboardDraft.jobTitle=$('#obTitle').value.trim();
    onboardDraft.company=$('#obCompany').value.trim();
    onboardDraft.tz=$('#obTz').value;
    return onboard(1);
  }
  if(step===1){ return onboard(2) }
  if(step===2){
    const msg=$('#obMsg');
    // apply template
    const t=TEMPLATES[onboardDraft.template]||TEMPLATES.general;
    state.displayName=onboardDraft.name;
    state.template=onboardDraft.template;
    state.categories=t.categories.map(c=>({id:uid(),name:c.name,color:c.color,ctx:c.ctx||'business'}));
    state.routines=t.routines.map(r=>({id:uid(),title:r.title,catId:state.categories[r.cat]?.id||null,
      days:r.days,start:r.start,end:r.end,note:'',nth:null}));
    // org
    if(onboardDraft.orgChoice==='create'){
      const name=$('#obOrg').value.trim();
      if(!name){ msg.className='msg err'; msg.textContent='Give your workspace a name.'; return }
      msg.className='msg'; msg.textContent='Creating workspace…';
      const err=await createOrg(name);
      if(err){ msg.className='msg err'; msg.textContent=err; return }
    }
    if(onboardDraft.orgChoice==='join'){
      const code=$('#obCode').value.trim().toUpperCase();
      if(!code){ msg.className='msg err'; msg.textContent='Enter the join code you were given.'; return }
      msg.className='msg'; msg.textContent='Joining…';
      const err=await joinOrg(code);
      if(err){ msg.className='msg err'; msg.textContent=err; return }
    }
    state.onboarded=true;
    await saveProfile({full_name:onboardDraft.name,job_title:onboardDraft.jobTitle||null,
      company:onboardDraft.company||null,timezone:onboardDraft.tz||'UTC'});
    LS.set('state',state); await flushState();
    enterApp();
  }
}

/* ---------- orgs ---------- */
function makeCode(){ let s='';const A='ABCDEFGHJKMNPQRSTUVWXYZ23456789';for(let i=0;i<6;i++)s+=A[Math.floor(Math.random()*A.length)];return s }

async function createOrg(name){
  if(!sb||!user) return 'Not signed in.';
  const code=makeCode();
  const {data,error}=await sb.from('organizations').insert({name,join_code:code,owner_id:user.id}).select().single();
  if(error) return error.message;
  const m=await sb.from('org_members').insert({org_id:data.id,user_id:user.id,display_name:state.displayName,role:'owner'});
  if(m.error) return m.error.message;
  org=data; return null;
}
async function joinOrg(code){
  if(!sb||!user) return 'Not signed in.';
  const {data,error}=await sb.rpc('find_org_by_code',{code});
  if(error) return error.message;
  if(!data||!data.length) return 'No workspace found with that code.';
  const o=data[0];
  const m=await sb.from('org_members').insert({org_id:o.id,user_id:user.id,display_name:state.displayName,role:'member'});
  if(m.error && !m.error.message.includes('duplicate')) return m.error.message;
  org=o; return null;
}
async function loadOrg(){
  if(!sb||!user) return;
  const {data}=await sb.from('org_members').select('org_id,role').eq('user_id',user.id).maybeSingle();
  if(!data){ org=null; return }
  const {data:o}=await sb.from('organizations').select('*').eq('id',data.org_id).maybeSingle();
  if(o){ o.myRole=data.role; org=o }
}
async function loadMembers(){
  if(!sb||!org){ members=[];memberStates=[];return }
  const {data:ms}=await sb.from('org_members').select('user_id,display_name,role').eq('org_id',org.id);
  members=ms||[];
  const {data:st}=await sb.from('app_state').select('user_id,display_name,state_v2').eq('org_id',org.id);
  memberStates=(st||[]).map(r=>({user_id:r.user_id,display_name:r.display_name,state:r.state_v2}));
}
async function leaveOrg(){
  if(!confirm('Leave this workspace? Your own schedule stays intact.')) return;
  await sb.from('org_members').delete().eq('org_id',org.id).eq('user_id',user.id);
  org=null; await pushState(); render(); toast('You left the workspace.');
}

async function signOut(){
  await flushState();
  try{ localStorage.removeItem('cad_state') }catch{}
  if(sb) await sb.auth.signOut();
  user=null;profile=null;org=null;state=null;members=[];memberStates=[];lastSyncAt=null;
  gateAuth('signin');
}

document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden') flushState(); else refreshFromCloud();
});
window.addEventListener('focus',refreshFromCloud);
window.addEventListener('pagehide',flushState);
setInterval(refreshFromCloud,30000);

/* ==========================================================
   SHELL
   ========================================================== */
const NAV=[['today','Today'],['week','Week'],['month','Month'],['agenda','Agenda'],['tasks','Tasks'],['routines','Routines'],['goals','Goals'],['team','Team'],['booking','Booking'],['settings','Settings']];

function enterApp(){ $('#gate').classList.add('hidden'); $('#shell').classList.remove('hidden'); render() }

function toast(t){ const el=$('#toast'); el.textContent=t; el.classList.add('on'); clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('on'),2400) }
function openSheet(title,html){ $('#sheetTitle').textContent=title; $('#sheetBody').innerHTML=html; $('#scrim').classList.add('on') }
function closeSheet(){ $('#scrim').classList.remove('on') }
$('#scrim')?.addEventListener('click',e=>{ if(e.target.id==='scrim') closeSheet() });

function go(p){
  state.page=p; save(); render();
  if(p==='team' && org) loadMembers().then(render);
  if(p==='booking') loadBooking().then(render);
}

function tick(){
  const d=new Date();
  const c=$('#clock'); if(c) c.textContent=d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
  const cd=$('#clockdate'); if(cd) cd.textContent=d.toLocaleDateString([],{weekday:'long',month:'short',day:'numeric'}).toUpperCase();
  // timer
  if(state?.timer?.running){
    const now=Date.now(), el=Math.floor((now-(state.timer.last||now))/1000);
    if(el>0){ state.timer.last=now; state.timer.seconds=Math.max(0,state.timer.seconds-el);
      if(state.timer.seconds===0){ state.timer.running=false; chime(); logIt('Timer finished',state.timer.label); }
      LS.set('state',state);
      const t=$('#timerN'); if(t) t.textContent=mmss(state.timer.seconds);
    }
  }
  // move the now-marker
  const nowEl=$('#spineNow');
  if(nowEl){ const p=nowPct(); if(p===null) nowEl.style.display='none'; else{ nowEl.style.display='block'; nowEl.style.top=p+'%' } }
}
setInterval(tick,1000);

const mmss=s=>`${pad(Math.floor(s/60))}:${pad(s%60)}`;
function chime(){ try{ const c=new AudioContext(),o=c.createOscillator(),g=c.createGain();
  o.type='sine';o.frequency.value=880;g.gain.setValueAtTime(.0001,c.currentTime);
  g.gain.exponentialRampToValueAtTime(.2,c.currentTime+.02);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+1.1);
  o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+1.2) }catch{} }
function logIt(kind,detail,min=0){ state.logs.unshift({id:uid(),at:new Date().toISOString(),kind,detail,min}); state.logs=state.logs.slice(0,400); save() }

/* ==========================================================
   VIEWS
   ========================================================== */
function nowPct(){
  const d=new Date(), m=d.getHours()*60+d.getMinutes();
  const s=state.prefs.dayStart*60, e=state.prefs.dayEnd*60;
  if(m<s||m>e) return null;
  return ((m-s)/(e-s))*100;
}

/* ---------- TODAY (time spine) ---------- */
function viewToday(){
  const today=new Date(), occ=occurrencesOn(today), gaps=freeGapsOn(today);
  const s=state.prefs.dayStart*60, e=state.prefs.dayEnd*60, span=e-s;
  const pct=m=>((m-s)/span)*100;
  const H=Math.max(560,(state.prefs.dayEnd-state.prefs.dayStart)*34);

  const hours=[]; const wide=(state.prefs.dayEnd-state.prefs.dayStart)>16;
  for(let h=state.prefs.dayStart;h<=state.prefs.dayEnd;h++){
    const show = wide ? h%2===0 : true;
    hours.push(`<div class="spine-hour ${h%6===0?'major':''}" style="top:${pct(h*60)}%"><div class="t">${show?fmt12(h*60):''}</div><div class="tick"></div></div>`);
  }
  const blocks=occ.map(o=>{
    const top=pct(Math.max(o.start,s)), h=Math.max(pct(Math.min(o.end,e))-top,3.2);
    const clash=occ.some(x=>x.id!==o.id&&x.start<o.end&&x.end>o.start);
    return `<div class="spine-block" style="top:${top}%;height:${h}%;--cat:${catColor(o.catId)}"
        onmousedown="spineDragStart(event,'${o.kind}','${o.id}','${o.date}')"
        ontouchstart="spineDragStart(event,'${o.kind}','${o.id}','${o.date}')"
        ondblclick="editOcc('${o.kind}','${o.id}','${o.date}')" title="Drag to move · double-click to edit">
      <button class="bx" onclick="event.stopPropagation();removeOcc('${o.kind}','${o.id}','${o.date}')" title="Remove">×</button>
      <div class="bt">${clash?'⚠ ':''}${esc(o.title)}</div><div class="bs">${fmt12(o.start)} – ${fmt12(o.end)}</div></div>`;
  }).join('');

  const openNow=(()=>{ const m=new Date().getHours()*60+new Date().getMinutes();
    const g=gaps.find(g=>m>=g[0]&&m<g[1]); return g?g[1]-m:0 })();
  const nextUp=occ.find(o=>o.start>new Date().getHours()*60+new Date().getMinutes());
  const openTotal=gaps.reduce((a,g)=>a+(g[1]-g[0]),0);
  const booked=occ.reduce((a,o)=>a+(o.end-o.start),0);

  const suggestions=suggestForGaps(gaps);

  const warn=workloadWarning(); const stk=streakData(); const ew=energyWarning(today);
  return `<div class="between wrap" style="margin-bottom:16px">
    <button class="btn btn-s" onclick="openQuickAdd()">＋ Quick add</button>${ctxSwitch()}</div>
  ${ew?`<div class="warnbar">${esc(ew)}</div>`:''}
  ${warn?`<div class="warnbar">${esc(warn)}</div>`:''}
  <div class="grid">
    <div class="panel s3"><div class="stat-n">${Math.floor(booked/60)}h ${booked%60}m</div><div class="stat-l">Committed today</div></div>
    <div class="panel s3"><div class="stat-n">${Math.floor(openTotal/60)}h ${openTotal%60}m</div><div class="stat-l">Open today</div></div>
    <div class="panel s3"><div class="stat-n">${openNow?Math.floor(openNow/60)+'h '+openNow%60+'m':'—'}</div><div class="stat-l">Free right now</div></div>
    <div class="panel s3"><div class="stat-n">${stk.current}</div><div class="stat-l">Day streak</div>
      <div class="streak">${stk.days.map(d=>`<i class="${d.hit?'hit':''}"></i>`).join('')}</div></div>

    <div class="panel s8">
      <div class="panel-head"><div><div class="eyebrow">The day</div><h2 style="margin-top:3px">${today.toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'})}</h2></div>
        <button class="btn btn-s" onclick="editOcc('event',null,'${isoDate(today)}')">Add block</button></div>
      <div class="spine" style="height:${H}px">
        <div class="spine-rail"></div><div class="spine-drop"></div>${hours.join('')}${blocks}
        <div class="spine-now" id="spineNow" style="top:${nowPct()??0}%;display:${nowPct()===null?'none':'block'}"></div>
      </div>
    </div>

    <div class="panel s4">
      <div class="eyebrow" style="margin-bottom:10px">Fits your open time</div>
      ${suggestions.length?suggestions.map(sg=>`
        <div class="item" style="margin-bottom:6px" onclick="scheduleTask('${sg.task.id}','${sg.start}','${sg.end}')">
          <div class="between"><div class="item-t">${esc(sg.task.title)}</div><span class="chip mono">${fmt12(sg.startM)}</span></div>
          <div class="tiny muted" style="margin-top:3px">${sg.task.estimate}m · fits your ${fmt12(sg.gapStart)}–${fmt12(sg.gapEnd)} gap</div>
        </div>`).join('')
        :`<p class="tiny muted">No open tasks small enough for today's gaps. Add tasks with time estimates and they'll show up here.</p>`}
      <div style="border-top:1px solid var(--line);margin-top:16px;padding-top:14px">
        <div class="between">
          <div class="row" style="gap:9px">
            <span class="mono ${state.timer.running?'timer-run':''}" id="timerN" style="font-size:18px">${mmss(state.timer.seconds)}</span>
            <span class="tiny muted">focus</span>
          </div>
          <div class="row" style="gap:5px">
            ${state.timer.running?`<button class="btn-2 btn-s" onclick="pauseTimer()">Pause</button>`:`<button class="btn-2 btn-s" onclick="startTimer()">Start</button>`}
            <button class="btn-2 btn-s" onclick="resetTimer(25)">25m</button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

function suggestForGaps(gaps){
  const open=state.tasks.filter(t=>!t.done).sort((a,b)=>(b.importance+b.urgency)-(a.importance+a.urgency));
  const out=[]; const used=new Set();
  for(const g of gaps){
    let cursor=g[0];
    for(const t of open){
      if(used.has(t.id)) continue;
      const est=t.estimate||30;
      if(cursor+est<=g[1]){
        out.push({task:t,startM:cursor,start:toHM(cursor),end:toHM(cursor+est),gapStart:g[0],gapEnd:g[1]});
        used.add(t.id); cursor+=est;
      }
      if(out.length>=4) break;
    }
    if(out.length>=4) break;
  }
  return out;
}
function scheduleTask(taskId,start,end){
  const t=state.tasks.find(x=>x.id===taskId); if(!t) return;
  state.events.push({id:uid(),date:isoDate(new Date()),title:t.title,catId:t.catId,start,end,note:'From task list'});
  save(); render(); toast(`Scheduled “${t.title}” at ${fmt12(toMin(start))}.`);
}

/* ---------- WEEK ---------- */
function viewWeek(){
  const ws=startOfWeek(state.prefs.weekOffset), today=new Date();
  const s=state.prefs.dayStart, e=state.prefs.dayEnd;
  const days=[...Array(7)].map((_,i)=>{const d=new Date(ws);d.setDate(ws.getDate()+i);return d});
  let head=`<div class="wcell whead"></div>`+days.map(d=>`<div class="wcell whead ${sameDay(d,today)?'today':''}"><div class="wd">${DAYS[d.getDay()]}</div><div class="wn">${d.getDate()}</div></div>`).join('');
  let rows='';
  for(let h=s;h<e;h++){
    rows+=`<div class="wcell wtime">${fmt12(h*60)}</div>`;
    for(const d of days){
      const occ=occurrencesOn(d).filter(o=>o.start<(h+1)*60&&o.end>h*60&&o.start>=h*60);
      rows+=`<div class="wcell ${sameDay(d,today)?'wcol-today':''}">${occ.map(o=>`<div class="wblock" style="--cat:${catColor(o.catId)}" onclick="editOcc('${o.kind}','${o.id}','${o.date}')">${esc(o.title)}</div>`).join('')}</div>`;
    }
  }
  const label=`${ws.toLocaleDateString([],{month:'short',day:'numeric'})} – ${days[6].toLocaleDateString([],{month:'short',day:'numeric'})}`;
  const wl=weekLoad(state.prefs.weekOffset);
  const totals={};
  for(const d of days){ for(const o of occurrencesOn(d)){ const k=o.catId||'none'; totals[k]=(totals[k]||0)+(o.end-o.start) } }
  const grand=Object.values(totals).reduce((a,b)=>a+b,0)||1;
  const breakdown=Object.entries(totals).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k,v])=>{
    const cc=k==='none'?{name:'Uncategorised',color:'#8B93A7'}:catById(k)||{name:'Removed',color:'#8B93A7'};
    return `<div style="margin-bottom:11px">
      <div class="between" style="margin-bottom:4px">
        <span class="row" style="gap:7px"><i class="dot" style="--cat:${cc.color}"></i><span class="tiny">${esc(cc.name)}</span></span>
        <span class="mono tiny muted">${Math.floor(v/60)}h ${v%60}m</span></div>
      <div class="meter"><i style="width:${v/grand*100}%;background:${cc.color}"></i></div></div>`}).join('');
  return `<div class="grid" style="margin-bottom:16px">
    <div class="panel s3"><div class="stat-n">${wl.pct}%</div><div class="stat-l">Of the week booked</div></div>
    <div class="panel s3"><div class="stat-n">${Math.floor(wl.open/60)}h</div><div class="stat-l">Open this week</div></div>
    <div class="panel s6">
      <div class="between" style="margin-bottom:12px"><div class="eyebrow">Where the week goes</div>
        <button class="btn-2 btn-s" onclick="showReview()">Last week</button></div>
      ${breakdown||'<p class="tiny muted">Nothing scheduled this week.</p>'}
    </div>
  </div>
  <div class="between wrap" style="margin-bottom:14px">
    <div class="row">
      <button class="btn-2 btn-s" onclick="state.prefs.weekOffset--;save();render()">←</button>
      <div class="mono" style="min-width:150px;text-align:center">${label}</div>
      <button class="btn-2 btn-s" onclick="state.prefs.weekOffset++;save();render()">→</button>
      <button class="btn-2 btn-s" onclick="state.prefs.weekOffset=0;save();render()">This week</button>
    </div>
    ${ctxSwitch()}
  </div>
  <div class="weekwrap"><div class="weekgrid">${head}${rows}</div></div>`;
}

/* ---------- TASKS ---------- */
function viewTasks(){
  const open=state.tasks.filter(t=>!t.done), done=state.tasks.filter(t=>t.done);
  const score=t=>(t.importance||5)+(t.urgency||5);
  open.sort((a,b)=>score(b)-score(a));
  const card=t=>`<div class="item ${t.done?'done':''}" onclick="editTask('${t.id}')">
    <div class="between">
      <div style="min-width:0">
        <div class="item-t">${esc(t.title)}</div>
        <div class="row wrap" style="margin-top:5px">
          ${t.catId?`<span class="chip"><i class="dot" style="--cat:${catColor(t.catId)}"></i>${esc(catName(t.catId))}</span>`:''}
          <span class="chip mono">${t.estimate||30}m</span>
          <span class="chip mono">P${score(t)}</span>
        </div>
      </div>
      <button class="btn-2 btn-s" onclick="event.stopPropagation();toggleTask('${t.id}')">${t.done?'Undo':'Done'}</button>
    </div>
    ${t.progress?`<div class="meter"><i style="width:${t.progress}%"></i></div>`:''}
  </div>`;
  return `<div class="between" style="margin-bottom:14px">
      <div class="eyebrow">${open.length} open · ${done.length} done</div>
      <button class="btn btn-s" onclick="editTask(null)">New task</button></div>
    ${open.length||done.length?`<div class="stack">${open.map(card).join('')}</div>
      ${done.length?`<div class="eyebrow" style="margin:22px 0 10px">Completed</div><div class="stack">${done.slice(0,20).map(card).join('')}</div>`:''}`
    :`<div class="empty"><h3>No tasks yet</h3><p class="tiny">Add what you need to get done. Tasks with time estimates get slotted into your open gaps automatically.</p><button class="btn btn-s" style="margin-top:12px" onclick="editTask(null)">Add your first task</button></div>`}`;
}
function toggleTask(id){ const t=state.tasks.find(x=>x.id===id); if(!t)return;
  t.done=!t.done; if(t.done){t.progress=100;logIt('Task completed',t.title,t.estimate||0)} save(); render() }

let _quad={i:9,u:9};
function pickQuad(btn,i,u){ _quad={i,u}; [...btn.parentNode.children].forEach(b=>b.classList.remove('on')); btn.classList.add('on') }
function editTask(id){
  const t=id?state.tasks.find(x=>x.id===id):{id:null,title:'',catId:state.categories[0]?.id||null,importance:9,urgency:9,estimate:30,progress:0,note:'',done:false};
  _quad={i:t.importance,u:t.urgency};
  openSheet(id?'Edit task':'New task',`
    <label>Task</label><input id="tT" value="${esc(t.title)}" placeholder="What needs doing?">
    <label>Category</label><select id="tC">${state.categories.map(c=>`<option value="${c.id}" ${t.catId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select>
    <label>Priority</label>
    <div class="quad" id="tQuad">
      ${[['Do first','Important and urgent',9,9],['Schedule','Important, not urgent',9,3],
         ['Delegate','Urgent, not important',3,9],['Whenever','Neither',3,3]]
        .map(([n,d,i,u])=>`<button type="button" class="${t.importance===i&&t.urgency===u?'on':''}" onclick="pickQuad(this,${i},${u})"><b>${n}</b>${d}</button>`).join('')}
    </div>
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">
      <div><label>Estimate (minutes)</label><input id="tE" type="number" min="5" step="5" value="${t.estimate}"></div>
      <div><label>Progress (%)</label><input id="tP" type="number" min="0" max="100" step="5" value="${t.progress}"></div>
    </div>
    <label>Notes</label><textarea id="tN">${esc(t.note||'')}</textarea>
    <div class="row" style="margin-top:18px">
      <button class="btn" onclick="saveTask('${id||''}')">Save task</button>
      ${id?`<button class="btn-x" onclick="delTask('${id}')">Delete</button>`:''}
    </div>`);
}
function saveTask(id){
  const title=$('#tT').value.trim(); if(!title) return toast('Give the task a name.');
  const rec={title,catId:$('#tC').value||null,importance:_quad.i,urgency:_quad.u,
    estimate:+$('#tE').value||30,progress:+$('#tP').value||0,note:$('#tN').value};
  if(id){ Object.assign(state.tasks.find(x=>x.id===id),rec) }
  else { state.tasks.push({id:uid(),done:false,...rec}) }
  save(); closeSheet(); render(); toast('Task saved.');
}
function delTask(id){ state.tasks=state.tasks.filter(x=>x.id!==id); save(); closeSheet(); render(); toast('Task deleted.') }

/* ---------- ROUTINES ---------- */
function viewRoutines(){
  const list=state.routines.slice().sort((a,b)=>toMin(a.start)-toMin(b.start));
  return `<div class="between" style="margin-bottom:14px">
      <div class="eyebrow">${list.length} recurring block${list.length===1?'':'s'}</div>
      <div class="row"><button class="btn-2 btn-s" onclick="manageCats()">Categories</button><button class="btn btn-s" onclick="editRoutine(null)">New routine</button></div></div>
    ${list.length?`<div class="stack">${list.map(r=>`
      <div class="item" onclick="editRoutine('${r.id}')">
        <div class="between">
          <div style="min-width:0">
            <div class="item-t">${esc(r.title)}</div>
            <div class="row wrap" style="margin-top:5px">
              <span class="chip"><i class="dot" style="--cat:${catColor(r.catId)}"></i>${esc(catName(r.catId))}</span>
              <span class="chip mono">${fmt12(toMin(r.start))}–${fmt12(toMin(r.end))}</span>
              ${r.nth?`<span class="chip mono">${['','1st','2nd','3rd','4th','5th'][r.nth]} of month</span>`:''}
            </div>
          </div>
          <div class="daypick">${DAYS.map((d,i)=>`<button class="${r.days.includes(i)?'on':''}" style="pointer-events:none;width:26px;height:26px">${d[0]}</button>`).join('')}</div>
        </div>
      </div>`).join('')}</div>`
    :`<div class="empty"><h3>No routines yet</h3><p class="tiny">Routines are the blocks that repeat every week — shifts, standing meetings, gym, school runs.</p><button class="btn btn-s" style="margin-top:12px" onclick="editRoutine(null)">Add your first routine</button></div>`}`;
}
function editRoutine(id){
  const r=id?state.routines.find(x=>x.id===id):{id:null,title:'',catId:state.categories[0]?.id||null,days:[1,2,3,4,5],start:'09:00',end:'10:00',note:'',nth:null};
  window._draftDays=[...r.days];
  openSheet(id?'Edit routine':'New routine',`
    <label>What is it?</label><input id="rT" value="${esc(r.title)}" placeholder="Team standup">
    <label>Category</label><select id="rC">${state.categories.map(c=>`<option value="${c.id}" ${r.catId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select>
    <label>Repeats on</label>
    <div class="daypick" id="rDays">${DAYS.map((d,i)=>`<button type="button" class="${r.days.includes(i)?'on':''}" onclick="toggleDay(this,${i})">${d[0]}</button>`).join('')}</div>
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">
      <div><label>Start</label><input id="rS" type="time" value="${r.start}"></div>
      <div><label>End</label><input id="rE" type="time" value="${r.end}"></div>
    </div>
    <label>Location</label><input id="rL" value="${esc(r.location||'')}" placeholder="Office, Zoom, site address">
    <label>Repeats which week?</label>
    <select id="rN"><option value="">Every week</option>
      ${[1,2,3,4,5].map(n=>`<option value="${n}" ${r.nth==n?'selected':''}>Only the ${['','1st','2nd','3rd','4th','5th'][n]} week of the month</option>`).join('')}
      <option value="last" ${r.nth==='last'?'selected':''}>Only the last week of the month</option></select>
    <label>Notes</label><textarea id="rNote">${esc(r.note||'')}</textarea>
    <div class="row" style="margin-top:18px">
      <button class="btn" onclick="saveRoutine('${id||''}')">Save routine</button>
      ${id?`<button class="btn-x" onclick="delRoutine('${id}')">Delete</button>`:''}
    </div>`);
}
function toggleDay(btn,i){
  const d=window._draftDays;
  const at=d.indexOf(i); if(at>=0) d.splice(at,1); else d.push(i);
  btn.classList.toggle('on');
}
function saveRoutine(id){
  const title=$('#rT').value.trim(); if(!title) return toast('Give the routine a name.');
  if(!window._draftDays.length) return toast('Pick at least one day.');
  if(toMin($('#rE').value)<=toMin($('#rS').value)) return toast('End time must be after start time.');
  const rec={title,catId:$('#rC').value||null,days:[...window._draftDays].sort(),
    start:$('#rS').value,end:$('#rE').value,note:$('#rNote').value,location:$('#rL').value.trim(),
    nth:$('#rN').value?($('#rN').value==='last'?'last':+$('#rN').value):null};
  const commit=()=>{
    if(id){ Object.assign(state.routines.find(x=>x.id===id),rec) }
    else { state.routines.push({id:uid(),...rec}) }
    save(); closeSheet(); render(); toast('Routine saved.');
  };
  const probe=new Date(); const off=(rec.days[0]-probe.getDay()+7)%7; probe.setDate(probe.getDate()+off);
  const clash=overlapsFor(probe,toMin(rec.start),toMin(rec.end),id||null);
  if(clash.length) return confirmOverlap(clash,commit,()=>editRoutine(id||null));
  commit();
}
function delRoutine(id){ state.routines=state.routines.filter(x=>x.id!==id); save(); closeSheet(); render(); toast('Routine deleted.') }

/* ---------- remove blocks ---------- */
function removeOcc(kind,id,dateStr){
  if(kind==='routine'){
    const r=state.routines.find(x=>x.id===id); if(!r) return;
    openSheet('Remove this routine?',`
      <p style="margin-top:0"><b>${esc(r.title)}</b> repeats every ${r.days.map(d=>DAYS_FULL[d]).join(', ')}.</p>
      <div class="stack" style="margin-top:18px">
        <button class="btn-2" onclick="skipOnce('${id}','${dateStr}')">Skip just ${new Date(dateStr+'T00:00:00').toLocaleDateString([],{weekday:'long',month:'short',day:'numeric'})}</button>
        <button class="btn-x" onclick="delRoutine('${id}')">Delete the whole routine</button>
      </div>`);
  } else {
    const ev=state.events.find(x=>x.id===id); if(!ev) return;
    state.events=state.events.filter(x=>x.id!==id);
    save(); render(); toast(`Removed “${ev.title}”.`);
  }
}
function skipOnce(routineId,dateStr){
  state.events.push({id:uid(),date:dateStr,skipRoutine:routineId,title:'',catId:null,start:'00:00',end:'00:00'});
  save(); closeSheet(); render(); toast('Skipped for that day only.');
}

/* ---------- one-off events ---------- */
function editOcc(kind,id,date){
  if(kind==='routine'){ return editRoutine(id) }
  const e=id?state.events.find(x=>x.id===id):{id:null,date,title:'',catId:state.categories[0]?.id||null,start:'12:00',end:'13:00',note:''};
  openSheet(id?'Edit block':'Add block',`
    <label>What is it?</label><input id="eT" value="${esc(e.title)}" placeholder="Client call">
    <label>Category</label><select id="eC">${state.categories.map(c=>`<option value="${c.id}" ${e.catId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select>
    <label>Date</label><input id="eD" type="date" value="${e.date}">
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">
      <div><label>Start</label><input id="eS" type="time" value="${e.start}"></div>
      <div><label>End</label><input id="eE" type="time" value="${e.end}"></div>
    </div>
    <label>Location</label><input id="eL" value="${esc(e.location||'')}" placeholder="Office, Zoom, 123 Main St">
    <label>Energy required</label>
    <select id="eEn"><option value="">Not set</option><option value="high" ${e.energy==='high'?'selected':''}>High — demanding</option><option value="low" ${e.energy==='low'?'selected':''}>Low — routine</option></select>
    <label>Notes</label><textarea id="eN">${esc(e.note||'')}</textarea>
    <div class="row" style="margin-top:18px">
      <button class="btn" onclick="saveEvent('${id||''}')">Save block</button>
      ${id?`<button class="btn-x" onclick="delEvent('${id}')">Delete</button>`:''}
    </div>`);
}
function saveEvent(id){
  const title=$('#eT').value.trim(); if(!title) return toast('Give the block a name.');
  if(toMin($('#eE').value)<=toMin($('#eS').value)) return toast('End time must be after start time.');
  const rec={title,catId:$('#eC').value||null,date:$('#eD').value,start:$('#eS').value,end:$('#eE').value,
    note:$('#eN').value,location:$('#eL').value.trim(),energy:$('#eEn').value};
  const commit=()=>{
    if(id){ Object.assign(state.events.find(x=>x.id===id),rec) }
    else { state.events.push({id:uid(),...rec}) }
    save(); closeSheet(); render(); toast('Block saved.');
  };
  const clash=overlapsFor(new Date(rec.date+'T00:00:00'),toMin(rec.start),toMin(rec.end),id||null);
  if(clash.length) return confirmOverlap(clash,commit,()=>editOcc('event',id||null,rec.date));
  commit();
}
function delEvent(id){ state.events=state.events.filter(x=>x.id!==id); save(); closeSheet(); render(); toast('Block deleted.') }

/* ---------- CATEGORIES ---------- */
function manageCats(){
  openSheet('Categories',`
    <p class="tiny muted" style="margin-top:0">Categories colour-code your week. Rename or recolour them to match how your work actually splits up.</p>
    <div class="stack" id="catList">${state.categories.map(c=>`
      <div class="item" style="cursor:default">
        <div class="row">
          <i class="dot" style="--cat:${c.color};width:12px;height:12px"></i>
          <input value="${esc(c.name)}" onchange="renameCat('${c.id}',this.value)" style="flex:1">
          <select onchange="setCatCtx('${c.id}',this.value)" style="width:112px">
            <option value="personal" ${(c.ctx||'personal')==='personal'?'selected':''}>Personal</option>
            <option value="business" ${c.ctx==='business'?'selected':''}>Business</option>
          </select>
          <button class="btn-x btn-s" onclick="delCat('${c.id}')">Remove</button>
        </div>
        <div class="swatches" style="margin-top:9px">${SWATCHES.map(s=>`<div class="swatch ${c.color===s?'on':''}" style="background:${s}" onclick="recolorCat('${c.id}','${s}')"></div>`).join('')}</div>
      </div>`).join('')}</div>
    <div class="row" style="margin-top:16px"><input id="newCat" placeholder="New category name">
      <select id="newCatCtx" style="width:112px"><option value="personal">Personal</option><option value="business">Business</option></select>
      <button class="btn" onclick="addCat()">Add</button></div>`);
}
function addCat(){ const n=$('#newCat').value.trim(); if(!n) return;
  state.categories.push({id:uid(),name:n,color:SWATCHES[state.categories.length%SWATCHES.length],ctx:$('#newCatCtx')?.value||'personal'});
  save(); manageCats(); render() }
function setCatCtx(id,v){ const cc=catById(id); if(cc){ cc.ctx=v; save(); render() } }
function renameCat(id,v){ const c=catById(id); if(c){c.name=v.trim()||c.name; save(); render()} }
function recolorCat(id,color){ const c=catById(id); if(c){c.color=color; save(); manageCats(); render()} }
function delCat(id){
  const used=state.routines.filter(r=>r.catId===id).length+state.tasks.filter(t=>t.catId===id).length;
  if(used && !confirm(`${used} item${used===1?'':'s'} use this category. They'll become uncategorised. Continue?`)) return;
  state.categories=state.categories.filter(c=>c.id!==id);
  state.routines.forEach(r=>{ if(r.catId===id) r.catId=null });
  state.tasks.forEach(t=>{ if(t.catId===id) t.catId=null });
  save(); manageCats(); render();
}

/* ---------- TEAM ---------- */
function viewTeam(){
  if(!org){
    return `<div class="empty" style="max-width:520px">
      <h3>You're working solo</h3>
      <p class="tiny">Create a workspace to share schedules with your team, or join one with a code.</p>
      <div class="row" style="justify-content:center;margin-top:14px">
        <button class="btn btn-s" onclick="promptCreateOrg()">Create workspace</button>
        <button class="btn-2 btn-s" onclick="promptJoinOrg()">Join with a code</button>
      </div></div>`;
  }
  const nowM=new Date().getHours()*60+new Date().getMinutes();
  const rows=members.map(m=>{
    const ms=memberStates.find(s=>s.user_id===m.user_id);
    const nm=ms?.display_name||m.display_name||'Teammate';
    let status='<span class="status">No schedule shared</span>';
    if(ms?.state){
      const saved=state, tmp=ms.state;
      try{
        state=Object.assign(blankState(),tmp);
        const occ=occurrencesOn(new Date());
        const cur=occ.find(o=>nowM>=o.start&&nowM<o.end);
        const nxt=occ.find(o=>o.start>nowM);
        status=cur?`<span class="status busy">In: ${esc(cur.title)} until ${fmt12(cur.end)}</span>`
              :`<span class="status free">Open${nxt?` until ${fmt12(nxt.start)}`:' for the rest of the day'}</span>`;
      }catch{} finally{ state=saved }
    }
    return `<div class="member">
      <div class="avatar">${esc((nm[0]||'?').toUpperCase())}</div>
      <div style="flex:1;min-width:0"><div class="item-t">${esc(nm)}${m.user_id===user.id?' <span class="dim tiny">(you)</span>':''}</div>${status}</div>
      <span class="chip">${esc(m.role)}</span>
    </div>`;
  }).join('');
  return `<div class="grid">
    <div class="panel s8">
      <div class="panel-head"><div><div class="eyebrow">Workspace</div><h2 style="margin-top:3px">${esc(org.name)}</h2></div>
        <button class="btn-2 btn-s" onclick="loadMembers().then(render)">Refresh</button></div>
      ${rows||'<p class="tiny muted">No members yet.</p>'}
    </div>
    <div class="panel s4">
      <div class="eyebrow" style="margin-bottom:10px">Invite code</div>
      <div class="code">${esc(org.join_code||'——————')}</div>
      <p class="tiny muted" style="margin-top:10px">Anyone with this code can join ${esc(org.name)} and share their schedule with the team.</p>
      <button class="btn-x btn-s" style="margin-top:14px" onclick="leaveOrg()">Leave workspace</button>
    </div>
  </div>`;
}
function promptCreateOrg(){
  openSheet('Create a workspace',`<label>Workspace name</label><input id="ocName" placeholder="Acme Plumbing">
    <p class="tiny muted" style="margin-top:10px">You'll get a join code to share with your team.</p>
    <div style="margin-top:16px"><button class="btn" onclick="doCreateOrg()">Create workspace</button></div><div class="msg" id="ocMsg"></div>`);
}
async function doCreateOrg(){
  const n=$('#ocName').value.trim(); if(!n) return toast('Give it a name.');
  $('#ocMsg').textContent='Creating…';
  const err=await createOrg(n);
  if(err){ $('#ocMsg').className='msg err'; $('#ocMsg').textContent=err; return }
  await pushState(); await loadMembers(); closeSheet(); render(); toast('Workspace created.');
}
function promptJoinOrg(){
  openSheet('Join a workspace',`<label>Join code</label><input id="ojCode" placeholder="ABC123" style="text-transform:uppercase">
    <div style="margin-top:16px"><button class="btn" onclick="doJoinOrg()">Join</button></div><div class="msg" id="ojMsg"></div>`);
}
async function doJoinOrg(){
  const c=$('#ojCode').value.trim().toUpperCase(); if(!c) return toast('Enter the code.');
  $('#ojMsg').textContent='Joining…';
  const err=await joinOrg(c);
  if(err){ $('#ojMsg').className='msg err'; $('#ojMsg').textContent=err; return }
  await pushState(); await loadMembers(); closeSheet(); render(); toast('Joined.');
}

/* ---------- SETTINGS ---------- */
function viewSettings(){
  const dayLen=state.prefs.dayEnd-state.prefs.dayStart;
  return `<div class="grid">
    <div class="panel s6">
      <div class="eyebrow" style="margin-bottom:14px">Your profile</div>
      <div class="row" style="margin-bottom:16px">
        <div class="avatar" style="width:46px;height:46px;font-size:17px">${esc((state.displayName||profile?.username||'?')[0].toUpperCase())}</div>
        <div style="min-width:0"><div class="item-t">@${esc(profile?.username||'—')}</div>
        <div class="tiny muted">${user?esc(user.email):''}</div></div>
      </div>
      <label>Username</label>
      <div class="row"><input id="setUser" value="${esc(profile?.username||'')}" autocapitalize="none" style="flex:1">
      <button class="btn-2 btn-s" onclick="changeUsername()">Change</button></div>
      <div class="tiny dim" id="setUserMsg" style="margin-top:5px">Letters, numbers and underscores. This is how people sign in.</div>
      <label>Display name</label><input id="setName" value="${esc(state.displayName||'')}">
      <label>What you do</label><input id="setTitle" value="${esc(profile?.job_title||'')}">
      <label>Company or team</label><input id="setCo" value="${esc(profile?.company||'')}">
      <div class="row" style="margin-top:18px">
        <button class="btn" onclick="saveSettings()">Save changes</button>
        <button class="btn-2" onclick="signOut()">Sign out</button>
      </div>
      <div class="msg" id="setMsg"></div>
    </div>

    <div class="panel s6">
      <div class="eyebrow" style="margin-bottom:14px">Calendar hours</div>
      <p class="tiny muted" style="margin-top:0">Sets what your day and week views show, and how open time is measured.</p>
      <div class="seg" style="margin:12px 0">
        ${[['Work day',8,18],['Long day',6,22],['Full 24 hours',0,24]].map(([n,a,b])=>
          `<button class="${state.prefs.dayStart===a&&state.prefs.dayEnd===b?'on':''}" onclick="setDayWindow(${a},${b})">${n}</button>`).join('')}
      </div>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">
        <div><label>Starts at</label>
          <select onchange="setDayWindow(+this.value,state.prefs.dayEnd)">
            ${[...Array(24)].map((_,h)=>`<option value="${h}" ${state.prefs.dayStart===h?'selected':''}>${fmt12(h*60)}</option>`).join('')}
          </select></div>
        <div><label>Ends at</label>
          <select onchange="setDayWindow(state.prefs.dayStart,+this.value)">
            ${[...Array(24)].map((_,h)=>h+1).map(h=>`<option value="${h}" ${state.prefs.dayEnd===h?'selected':''}>${h===24?'Midnight':fmt12(h*60)}</option>`).join('')}
          </select></div>
      </div>
      <label>Snap dragged blocks to</label>
      <select onchange="state.prefs.slotMin=+this.value;save();render()">
        ${[5,10,15,30,60].map(m=>`<option value="${m}" ${(state.prefs.slotMin||15)===m?'selected':''}>${m} minutes</option>`).join('')}
      </select>
      <p class="tiny dim" style="margin-top:10px">Showing ${dayLen} hours per day.</p>
    </div>

    <div class="panel s6">
      <div class="eyebrow" style="margin-bottom:14px">Reminders</div>
      ${('Notification' in window) && Notification.permission==='granted' && state.prefs.notify
        ? `<div class="row" style="margin-bottom:10px"><i class="dot" style="--cat:var(--good);width:9px;height:9px"></i><span class="tiny">Reminders are on</span></div>
           <label>Remind me before a block starts</label>
           <select onchange="state.prefs.notifyLead=+this.value;save()">${[5,10,15,30,60].map(m=>`<option value="${m}" ${(state.prefs.notifyLead??10)===m?'selected':''}>${m} minutes before</option>`).join('')}</select>
           <label>Daily summary at</label>
           <select onchange="state.prefs.digestHour=+this.value;save()">${[6,7,8,9,10].map(h=>`<option value="${h}" ${(state.prefs.digestHour??8)===h?'selected':''}>${fmt12(h*60)}</option>`).join('')}</select>
           <button class="btn-2 btn-s" style="margin-top:14px" onclick="state.prefs.notify=false;save();render();toast('Reminders turned off.')">Turn off</button>`
        : `<p class="tiny muted" style="margin-top:0">Get a nudge before each block starts and a summary each morning.</p>
           <button class="btn btn-s" style="margin-top:12px" onclick="askNotify()">Turn on reminders</button>
           <p class="tiny dim" style="margin-top:10px">Works while Cadence is open in a tab. Notifications when the app is closed need the Android app.</p>`}
    </div>

    <div class="panel s6">
      <div class="eyebrow" style="margin-bottom:14px">Categories</div>
      <div class="row wrap" style="margin-bottom:14px">${state.categories.map(cc=>`<span class="chip"><i class="dot" style="--cat:${cc.color}"></i>${esc(cc.name)} · ${(cc.ctx||'personal')==='business'?'Biz':'Pers'}</span>`).join('')||'<span class="tiny muted">None yet</span>'}</div>
      <button class="btn-2 btn-s" onclick="manageCats()">Manage categories</button>
    </div>

    <div class="panel s6">
      <div class="eyebrow" style="margin-bottom:14px">Focus buffer</div>
      <p class="tiny muted" style="margin-top:0">Automatically pad business meetings so nothing lands back-to-back.</p>
      <div class="row" style="margin-top:12px">
        <button class="btn-2 btn-s" onclick="state.buffer.on=!state.buffer.on;save();render()">${state.buffer?.on?'Turn off':'Turn on'}</button>
        ${state.buffer?.on?`<select style="flex:1" onchange="state.buffer.mins=+this.value;save()">${[5,10,15].map(m=>`<option value="${m}" ${state.buffer.mins===m?'selected':''}>${m} minutes either side</option>`).join('')}</select>`:''}
      </div>
    </div>

    <div class="panel s6">
      <div class="eyebrow" style="margin-bottom:14px">Energy load</div>
      <p class="tiny muted" style="margin-top:0">Warn me when I book too many demanding business blocks in one day.</p>
      <label>Daily limit</label>
      <select onchange="state.energyCap=+this.value;save();render()">${[1,2,3,4].map(n=>`<option value="${n}" ${(state.energyCap??2)===n?'selected':''}>${n} high-energy block${n===1?'':'s'}</option>`).join('')}</select>
    </div>

    <div class="panel s6">
      <div class="eyebrow" style="margin-bottom:14px">Calendar file</div>
      <p class="tiny muted" style="margin-top:0">Export everything as .ics to import into Google, Outlook or Apple Calendar.</p>
      <button class="btn-2 btn-s" style="margin-top:12px" onclick="exportIcs()">Export .ics</button>
    </div>

    <div class="panel s6">
      <div class="eyebrow" style="margin-bottom:14px">Your data</div>
      <div class="row" style="margin-bottom:10px">
        <i class="dot" style="--cat:var(--good);width:9px;height:9px"></i>
        <span class="tiny">Backed up to the cloud automatically</span>
      </div>
      <p class="tiny muted" style="margin-top:0">Every change saves to your account within a second. Sign in on any device and it is all there — there is no backup to run.</p>
      <div class="row wrap" style="margin-top:14px">
        <button class="btn-2 btn-s" onclick="exportData()">Download a copy</button>
        <button class="btn-x btn-s" onclick="resetAll()">Start over</button>
      </div>
    </div>
  </div>`;
}
function setDayWindow(a,b){
  if(b<=a){ return toast('The end time has to be after the start time.') }
  state.prefs.dayStart=a; state.prefs.dayEnd=b; save(); render();
}
async function changeUsername(){
  const v=$('#setUser').value.trim().toLowerCase(), m=$('#setUserMsg');
  if(!/^[a-z0-9_]{3,20}$/.test(v)){ m.style.color='var(--warn)'; m.textContent='3–20 characters, letters, numbers and underscores only.'; return }
  if(v===profile?.username){ m.style.color='var(--dim)'; m.textContent='That is already your username.'; return }
  m.style.color='var(--dim)'; m.textContent='Checking…';
  const {data:free}=await sb.rpc('username_available',{uname:v});
  if(free===false){ m.style.color='var(--warn)'; m.textContent='That username is taken.'; return }
  const err=await saveProfile({username:v});
  if(err){ m.style.color='var(--warn)'; m.textContent=err; return }
  m.style.color='var(--good)'; m.textContent='Username updated.';
  render(); toast('Username changed.');
}
async function saveSettings(){
  const msg=$('#setMsg'); msg.className='msg'; msg.textContent='Saving…';
  state.displayName=$('#setName').value.trim();
  const err=await saveProfile({full_name:state.displayName,job_title:$('#setTitle').value.trim()||null,company:$('#setCo').value.trim()||null});
  save();
  if(err){ msg.className='msg err'; msg.textContent=err; return }
  msg.className='msg ok'; msg.textContent='Saved.';
  render(); toast('Settings saved.');
}
function exportData(){
  const b=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(b);
  a.download=`cadence-backup-${isoDate(new Date())}.json`; a.click();
}
function resetAll(){
  if(!confirm('This clears your categories, routines and tasks. Your account stays. Continue?')) return;
  const n=state.displayName; state=blankState(); state.displayName=n; state.onboarded=false;
  save(); onboard(0);
}

/* ---------- timer controls ---------- */
function startTimer(){ state.timer.running=true; state.timer.last=Date.now(); save(); render() }
function pauseTimer(){ state.timer.running=false; save(); render() }
function resetTimer(min){ state.timer.seconds=min*60; state.timer.running=false; save(); render() }


/* ---------- overlap detection ---------- */
function overlapsFor(date,startM,endM,ignoreId){
  return occurrencesOn(date).filter(o=>o.id!==ignoreId && o.start<endM && o.end>startM);
}
function overlapText(list){
  return list.map(o=>`${o.title} (${fmt12(o.start)}–${fmt12(o.end)})`).join(', ');
}

/* ---------- drag to reschedule ---------- */
let dragState=null;
function spineDragStart(e,kind,id,date){
  const el=e.currentTarget, spine=el.closest('.spine');
  dragState={kind,id,date,el,spine,startY:e.clientY??e.touches[0].clientY,
    origTop:el.offsetTop,height:el.offsetHeight,spineH:spine.offsetHeight};
  el.classList.add('dragging');
  const drop=spine.querySelector('.spine-drop');
  if(drop){ drop.style.display='block'; drop.style.height=dragState.height+'px'; drop.style.top=dragState.origTop+'px' }
  document.addEventListener('mousemove',spineDragMove);
  document.addEventListener('mouseup',spineDragEnd);
  document.addEventListener('touchmove',spineDragMove,{passive:false});
  document.addEventListener('touchend',spineDragEnd);
  e.preventDefault();
}
function spineDragMove(e){
  if(!dragState) return;
  e.preventDefault();
  const y=e.clientY??e.touches[0].clientY;
  let top=Math.max(0,Math.min(dragState.origTop+(y-dragState.startY),dragState.spineH-dragState.height));
  const span=(state.prefs.dayEnd-state.prefs.dayStart)*60;
  const step=state.prefs.slotMin||15;
  let mins=state.prefs.dayStart*60 + Math.round((top/dragState.spineH)*span/step)*step;
  const snapTop=((mins-state.prefs.dayStart*60)/span)*dragState.spineH;
  dragState.newStart=mins;
  const drop=dragState.spine.querySelector('.spine-drop');
  if(drop){ drop.style.top=snapTop+'px'; drop.textContent='' }
  dragState.el.style.top=snapTop+'px';
}
function spineDragEnd(){
  document.removeEventListener('mousemove',spineDragMove);
  document.removeEventListener('mouseup',spineDragEnd);
  document.removeEventListener('touchmove',spineDragMove);
  document.removeEventListener('touchend',spineDragEnd);
  if(!dragState) return;
  const d=dragState; dragState=null;
  d.el.classList.remove('dragging');
  const drop=d.spine.querySelector('.spine-drop'); if(drop) drop.style.display='none';
  if(d.newStart===undefined){ render(); return }
  applyMove(d.kind,d.id,d.date,d.newStart);
}
function applyMove(kind,id,dateStr,newStart){
  const date=new Date(dateStr+'T00:00:00');
  if(kind==='routine'){
    const r=state.routines.find(x=>x.id===id); if(!r) return render();
    const dur=toMin(r.end)-toMin(r.start);
    const clash=overlapsFor(date,newStart,newStart+dur,id);
    const doIt=()=>{ r.start=toHM(newStart); r.end=toHM(newStart+dur); save(); render(); toast(`Moved to ${fmt12(newStart)} on ${r.days.map(d=>DAYS[d]).join(', ')}.`) };
    if(clash.length) return confirmOverlap(clash,doIt,render);
    doIt();
  } else {
    const ev=state.events.find(x=>x.id===id); if(!ev) return render();
    const dur=toMin(ev.end)-toMin(ev.start);
    const clash=overlapsFor(date,newStart,newStart+dur,id);
    const doIt=()=>{ ev.start=toHM(newStart); ev.end=toHM(newStart+dur); save(); render(); toast(`Moved to ${fmt12(newStart)}.`) };
    if(clash.length) return confirmOverlap(clash,doIt,render);
    doIt();
  }
}
function confirmOverlap(clash,onYes,onNo){
  window._ovYes=onYes; window._ovNo=onNo;
  openSheet('That time is already booked',`
    <div class="warnbar" style="margin-bottom:16px">This overlaps with ${esc(overlapText(clash))}.</div>
    <p class="tiny muted" style="margin-top:0">Double-booking is sometimes intentional — a call you can take while travelling, or a block you plan to cut short.</p>
    <div class="row" style="margin-top:18px">
      <button class="btn" onclick="closeSheet();_ovYes&&_ovYes()">Schedule anyway</button>
      <button class="btn-2" onclick="closeSheet();_ovNo&&_ovNo()">Pick another time</button>
    </div>`);
}

/* ---------- workload analysis ---------- */
function weekLoad(off=0){
  const ws=startOfWeek(off); let booked=0, open=0, byDay=[];
  for(let i=0;i<7;i++){
    const d=new Date(ws); d.setDate(ws.getDate()+i);
    const b=occurrencesOn(d).reduce((a,o)=>a+(o.end-o.start),0);
    const f=freeGapsOn(d).reduce((a,g)=>a+(g[1]-g[0]),0);
    booked+=b; open+=f; byDay.push({date:d,booked:b,free:f});
  }
  const capacity=(state.prefs.dayEnd-state.prefs.dayStart)*60*7;
  return {booked,open,capacity,pct:Math.round(booked/capacity*100),byDay};
}
function workloadWarning(){
  const w=weekLoad(state.prefs.weekOffset);
  const heavy=w.byDay.filter(d=>d.free<60);
  const openTaskMins=state.tasks.filter(t=>!t.done).reduce((a,t)=>a+(t.estimate||30),0);
  if(w.pct>=85) return `This week is ${w.pct}% committed. ${heavy.length?heavy.length+' day'+(heavy.length===1?'':'s')+' have under an hour free.':''} Consider moving something.`;
  if(openTaskMins>w.open) return `Your open tasks need ${Math.round(openTaskMins/60)}h but you only have ${Math.round(w.open/60)}h free this week. Something will slip.`;
  if(heavy.length>=3) return `${heavy.length} days this week have almost no open time. That leaves no room for anything unexpected.`;
  return null;
}

/* ---------- streaks ---------- */
function streakData(){
  const days=[]; let cur=0, running=true;
  for(let i=13;i>=0;i--){
    const d=new Date(); d.setDate(d.getDate()-i); d.setHours(0,0,0,0);
    const key=isoDate(d);
    const hit=state.logs.some(l=>l.at.slice(0,10)===key && (l.kind==='Task completed'||l.kind==='Timer finished'));
    days.push({key,hit});
  }
  for(let i=days.length-1;i>=0;i--){
    if(days[i].hit && running) cur++;
    else if(i<days.length-1) running=false;
  }
  return {days,current:cur};
}

/* ---------- weekly review ---------- */
function weeklyReview(){
  const ws=startOfWeek(-1), we=new Date(ws); we.setDate(ws.getDate()+7);
  const inWeek=l=>{const d=new Date(l.at); return d>=ws&&d<we};
  const done=state.logs.filter(l=>l.kind==='Task completed'&&inWeek(l));
  const focus=state.logs.filter(l=>l.kind==='Timer finished'&&inWeek(l));
  const mins=done.reduce((a,l)=>a+(l.min||0),0);
  const planned=weekLoad(-1);
  return {done:done.length,focus:focus.length,mins,planned,ws,we};
}

/* ---------- command palette ---------- */
let cmdSel=0, cmdItems=[];
function commands(){
  const base=[
    {label:'Go to Today',run:()=>go('today'),k:'nav'},
    {label:'Go to Week',run:()=>go('week'),k:'nav'},
    {label:'Go to Month',run:()=>go('month'),k:'nav'},
    {label:'Go to Agenda',run:()=>go('agenda'),k:'nav'},
    {label:'Export calendar (.ics)',run:()=>exportIcs(),k:'action'},
    {label:'Go to Tasks',run:()=>go('tasks'),k:'nav'},
    {label:'Go to Routines',run:()=>go('routines'),k:'nav'},
    {label:'Go to Team',run:()=>go('team'),k:'nav'},
    {label:'Go to Goals',run:()=>go('goals'),k:'nav'},
    {label:'Go to Booking',run:()=>go('booking'),k:'nav'},
    {label:'New goal',run:()=>editGoal(null),k:'create'},
    {label:'Quick add (type it in plain English)',run:()=>openQuickAdd(),k:'create'},
    {label:'Go to Settings',run:()=>go('settings'),k:'nav'},
    {label:'Copy booking link',run:()=>{ if(myLink) copyLink(); else go('booking') },k:'action'},
    {label:'New task',run:()=>editTask(null),k:'create'},
    {label:'New routine',run:()=>editRoutine(null),k:'create'},
    {label:'Add block today',run:()=>editOcc('event',null,isoDate(new Date())),k:'create'},
    {label:'Manage categories',run:()=>manageCats(),k:'create'},
    {label:'Start focus timer',run:()=>startTimer(),k:'action'},
    {label:'Switch theme',run:()=>toggleTheme(),k:'action'},
    {label:'Export a backup',run:()=>exportData(),k:'action'},
    {label:'Weekly review',run:()=>showReview(),k:'action'}
  ];
  const tasks=state.tasks.filter(t=>!t.done).map(t=>({label:t.title,sub:'Task',run:()=>editTask(t.id),k:'task'}));
  const routines=state.routines.map(r=>({label:r.title,sub:'Routine',run:()=>editRoutine(r.id),k:'routine'}));
  return [...base,...tasks,...routines];
}
function openCmd(){
  $('#cmdScrim').classList.add('on'); cmdSel=0;
  const inp=$('#cmdInput'); inp.value=''; renderCmd('');
  setTimeout(()=>inp.focus(),30);
}
function closeCmd(){ $('#cmdScrim').classList.remove('on') }
function renderCmd(q){
  const ql=q.toLowerCase().trim();
  cmdItems=commands().filter(c=>!ql||c.label.toLowerCase().includes(ql)).slice(0,10);
  if(cmdSel>=cmdItems.length) cmdSel=Math.max(0,cmdItems.length-1);
  $('#cmdResults').innerHTML = cmdItems.length
    ? cmdItems.map((c,i)=>`<div class="cmdrow ${i===cmdSel?'sel':''}" onclick="runCmd(${i})">
        <span>${esc(c.label)}</span>${c.sub?`<span class="tiny dim">${esc(c.sub)}</span>`:''}
        ${i===cmdSel?'<span class="k">↵</span>':''}</div>`).join('')
    : `<p class="tiny muted" style="padding:14px">Nothing matches “${esc(q)}”.</p>`;
}
function runCmd(i){ const c=cmdItems[i]; if(!c) return; closeCmd(); c.run() }

function showReview(){
  const r=weeklyReview();
  const label=`${r.ws.toLocaleDateString([],{month:'short',day:'numeric'})} – ${new Date(r.we-864e5).toLocaleDateString([],{month:'short',day:'numeric'})}`;
  openSheet('Last week',`
    <div class="eyebrow" style="margin-bottom:14px">${label}</div>
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">
      <div class="panel"><div class="stat-n">${r.done}</div><div class="stat-l">Tasks completed</div></div>
      <div class="panel"><div class="stat-n">${r.planned.pct}%</div><div class="stat-l">Of your week booked</div></div>
      <div class="panel"><div class="stat-n">${Math.round(r.mins/60)}h</div><div class="stat-l">Estimated work finished</div></div>
      <div class="panel"><div class="stat-n">${r.focus}</div><div class="stat-l">Focus sessions</div></div>
    </div>
    <p class="tiny muted" style="margin-top:16px">${
      r.done===0 ? 'Nothing was marked done last week. If that is not accurate, the tracking only counts tasks you tick off.'
      : r.planned.pct>85 ? 'Last week was heavily booked. Watch for the same pattern repeating.'
      : 'A reasonable balance of committed and open time.'}</p>`);
}






/* ---------- context switcher (shared header) ---------- */
function ctxSwitch(){
  const v=state.contextView||'both';
  return `<div class="seg">
    ${[['both','Everything'],['personal','Personal'],['business','Business']].map(([k,n])=>
      `<button class="${v===k?'on':''}" onclick="state.contextView='${k}';save();render()">${n}</button>`).join('')}
  </div>`;
}

/* ---------- MONTH ---------- */
function viewMonth(){
  const base=new Date(); base.setDate(1); base.setMonth(base.getMonth()+(state.prefs.monthOffset||0));
  const first=new Date(base.getFullYear(),base.getMonth(),1);
  const gridStart=new Date(first); gridStart.setDate(1-first.getDay());
  const today=new Date();
  let cells='';
  for(let i=0;i<42;i++){
    const d=new Date(gridStart); d.setDate(gridStart.getDate()+i);
    const other=d.getMonth()!==first.getMonth();
    const occ=occurrencesOn(d).filter(o=>!o.buffer);
    cells+=`<div class="mcell ${other?'other':''} ${sameDay(d,today)?'mtoday':''}" onclick="editOcc('event',null,'${isoDate(d)}')">
      <div class="mnum">${d.getDate()}</div>
      ${occ.slice(0,3).map(o=>`<div class="mblock" style="--cat:${catColor(o.catId)}" onclick="event.stopPropagation();editOcc('${o.kind}','${o.id}','${o.date}')">${esc(o.title)}</div>`).join('')}
      ${occ.length>3?`<div class="tiny dim" style="padding-left:2px">+${occ.length-3} more</div>`:''}
    </div>`;
  }
  return `<div class="between wrap" style="margin-bottom:16px">
    <div class="row">
      <button class="btn-2 btn-s" onclick="state.prefs.monthOffset=(state.prefs.monthOffset||0)-1;save();render()">←</button>
      <div style="min-width:170px;text-align:center;font-weight:600">${first.toLocaleDateString([],{month:'long',year:'numeric'})}</div>
      <button class="btn-2 btn-s" onclick="state.prefs.monthOffset=(state.prefs.monthOffset||0)+1;save();render()">→</button>
      <button class="btn-2 btn-s" onclick="state.prefs.monthOffset=0;save();render()">Today</button>
    </div>
    ${ctxSwitch()}
  </div>
  <div class="monthgrid">
    ${DAYS.map(d=>`<div class="mhead">${d}</div>`).join('')}
    ${cells}
  </div>`;
}

/* ---------- AGENDA ---------- */
function viewAgenda(){
  const days=[];
  for(let i=0;i<21;i++){ const d=new Date(); d.setDate(d.getDate()+i); d.setHours(0,0,0,0);
    const occ=occurrencesOn(d).filter(o=>!o.buffer);
    if(occ.length) days.push({d,occ});
  }
  return `<div class="between wrap" style="margin-bottom:16px">
    <div class="eyebrow">Next three weeks</div>${ctxSwitch()}</div>
  ${days.length?days.map(({d,occ})=>`
    <div class="agday">
      <div class="agdate">
        <div class="mono" style="font-size:22px;font-weight:500">${d.getDate()}</div>
        <div class="eyebrow">${d.toLocaleDateString([],{weekday:'short'})}</div>
        <div class="tiny dim">${d.toLocaleDateString([],{month:'short'})}</div>
      </div>
      <div style="flex:1;min-width:0">
        ${occ.map(o=>`<div class="agrow" onclick="editOcc('${o.kind}','${o.id}','${o.date}')">
          <span class="mono tiny" style="width:112px;color:var(--muted);flex:none">${fmt12(o.start)} – ${fmt12(o.end)}</span>
          <i class="dot" style="--cat:${catColor(o.catId)}"></i>
          <span style="font-weight:600;font-size:13.5px">${esc(o.title)}</span>
          ${o.location?`<span class="chip">${esc(o.location)}</span>`:''}
          ${o.energy?`<span class="chip">${o.energy}</span>`:''}
          <span class="chip" style="margin-left:auto">${catCtx(o.catId)==='business'?'Business':'Personal'}</span>
        </div>`).join('')}
      </div>
    </div>`).join('')
  :'<div class="empty"><h3>Nothing scheduled</h3><p class="tiny">Your next three weeks are clear.</p></div>'}`;
}

/* ---------- .ics export ---------- */
function icsEscape(s){ return String(s||'').replace(/[\\;,]/g,m=>'\\'+m).replace(/\n/g,'\\n') }
function icsStamp(d){ return d.toISOString().replace(/[-:]/g,'').split('.')[0]+'Z' }
function exportIcs(){
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Cadence//EN','CALSCALE:GREGORIAN'];
  const DOW=['SU','MO','TU','WE','TH','FR','SA'];
  for(const r of state.routines){
    const [sh,sm]=r.start.split(':').map(Number), [eh,em]=r.end.split(':').map(Number);
    const anchor=new Date(); anchor.setHours(0,0,0,0);
    const off=(r.days[0]-anchor.getDay()+7)%7; anchor.setDate(anchor.getDate()+off);
    const s=new Date(anchor); s.setHours(sh,sm); const e=new Date(anchor); e.setHours(eh,em);
    let rule=`FREQ=WEEKLY;BYDAY=${r.days.map(d=>DOW[d]).join(',')}`;
    if(r.nth) rule=`FREQ=MONTHLY;BYDAY=${r.nth==='last'?'-1':r.nth}${DOW[r.days[0]]}`;
    lines.push('BEGIN:VEVENT',`UID:${r.id}@cadence`,`DTSTAMP:${icsStamp(new Date())}`,
      `DTSTART:${icsStamp(s)}`,`DTEND:${icsStamp(e)}`,`RRULE:${rule}`,
      `SUMMARY:${icsEscape(r.title)}`,
      ...(r.location?[`LOCATION:${icsEscape(r.location)}`]:[]),
      ...(r.note?[`DESCRIPTION:${icsEscape(r.note)}`]:[]),'END:VEVENT');
  }
  for(const ev of state.events){
    if(ev.skipRoutine) continue;
    const s=new Date(`${ev.date}T${ev.start}:00`), e=new Date(`${ev.date}T${ev.end}:00`);
    lines.push('BEGIN:VEVENT',`UID:${ev.id}@cadence`,`DTSTAMP:${icsStamp(new Date())}`,
      `DTSTART:${icsStamp(s)}`,`DTEND:${icsStamp(e)}`,`SUMMARY:${icsEscape(ev.title)}`,
      ...(ev.location?[`LOCATION:${icsEscape(ev.location)}`]:[]),
      ...(ev.note?[`DESCRIPTION:${icsEscape(ev.note)}`]:[]),'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  const blob=new Blob([lines.join('\r\n')],{type:'text/calendar'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`cadence-${isoDate(new Date())}.ics`; a.click();
  toast('Calendar exported. Import it into Google, Outlook or Apple Calendar.');
}

/* ---------- natural language quick-add ---------- */
function parsePhrase(text){
  let s=' '+text.trim()+' ', out={title:'',date:new Date(),start:null,end:null,ctx:null,location:'',energy:'',days:null,nth:null};
  const eat=re=>{ const m=s.match(re); if(m){ s=s.replace(m[0],' '); return m } return null };

  // explicit context tag [Personal] / [Business]
  let m=eat(/\[\s*(personal|business|work)\s*\]/i);
  if(m) out.ctx = /personal/i.test(m[1])?'personal':'business';

  // energy
  if(eat(/\b(high[- ]energy|high energy)\b/i)) out.energy='high';
  else if(eat(/\b(low[- ]energy|low energy)\b/i)) out.energy='low';

  // location: "at Chipotle" / "in Room 3" — only when followed by a non-time word
  m=eat(/\b(?:at|in)\s+((?:the\s+)?[A-Z][\w'&.-]*(?:\s+[A-Z][\w'&.-]*){0,3})(?=\s|$)/);
  if(m) out.location=m[1].trim();

  // recurrence: every 2nd tuesday / every tuesday / every weekday
  m=eat(/\bevery\s+(1st|2nd|3rd|4th|5th|last)?\s*(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/i);
  if(m){
    const idx=['sun','mon','tue','wed','thu','fri','sat'].indexOf(m[2].toLowerCase());
    out.days=[idx];
    if(m[1]) out.nth = m[1].toLowerCase()==='last' ? 'last' : parseInt(m[1]);
  } else if(eat(/\bevery\s+weekday\b/i)) out.days=[1,2,3,4,5];
  else if(eat(/\bevery\s+day\b/i)) out.days=[0,1,2,3,4,5,6];

  // relative day
  const base=new Date(); base.setHours(0,0,0,0);
  if(eat(/\btomorrow\b/i)){ base.setDate(base.getDate()+1); out.date=base }
  else if(eat(/\btoday\b/i)){ out.date=base }
  else {
    m=eat(/\b(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    if(m){
      const want=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].indexOf(m[2].toLowerCase());
      let diff=(want-base.getDay()+7)%7;
      if(diff===0||m[1]) diff=diff===0?7:diff;
      base.setDate(base.getDate()+diff); out.date=base;
    } else {
      m=eat(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
      if(m){ const y=m[3]?(m[3].length===2?2000+ +m[3]:+m[3]):base.getFullYear();
        out.date=new Date(y,+m[1]-1,+m[2]); }
    }
  }

  // time range: "9am to 10am", "1pm-2:30pm", "at 1pm"
  m=eat(/\b(?:from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|-|–|until)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if(m){
    out.start=hm(m[1],m[2],m[3]||m[6]);
    out.end=hm(m[4],m[5],m[6]||m[3]);
    if(out.end<=out.start) out.end+=12*60;
  } else {
    m=eat(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
    if(!m) m=eat(/\bat\s+(\d{1,2})(?::(\d{2}))?\b/i);
    if(m){ out.start=hm(m[1],m[2],m[3]); out.end=out.start+60 }
  }
  function hm(h,mi,ap){
    let H=+h; const M=mi?+mi:0;
    if(ap){ const pp=ap.toLowerCase(); if(pp==='pm'&&H<12)H+=12; if(pp==='am'&&H===12)H=0 }
    else if(H<=7) H+=12;
    return H*60+M;
  }

  eat(/\b(?:for|on|with)\s*$/i);
  out.title=s.replace(/\s+/g,' ').trim().replace(/^[-–,\s]+|[-–,\s]+$/g,'');
  if(!out.title) out.title='Untitled block';
  if(out.start===null){ out.start=9*60; out.end=10*60 }
  if(out.end<=out.start) out.end=out.start+60;
  return out;
}

function catForContext(ctx){
  const pool=state.categories.filter(cc=>(cc.ctx||'personal')===ctx);
  return (pool[0]||state.categories[0])?.id||null;
}

function quickAddPreview(text){
  if(!text.trim()) return '<p class="tiny muted" style="padding:14px">Try: <span class="mono">Lunch with Sarah tomorrow at 1pm at Chipotle [Personal]</span></p>';
  const p=parsePhrase(text);
  const ctx=p.ctx||'personal';
  return `<div style="padding:14px">
    <div class="item" style="cursor:default">
      <div class="item-t">${esc(p.title)}</div>
      <div class="row wrap" style="margin-top:8px">
        <span class="chip mono">${p.days?('Every '+(p.nth?(p.nth==='last'?'last ':['','1st ','2nd ','3rd ','4th ','5th '][p.nth]):'')+p.days.map(d=>DAYS[d]).join(', ')):p.date.toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'})}</span>
        <span class="chip mono">${fmt12(p.start)} – ${fmt12(p.end)}</span>
        <span class="chip">${ctx==='business'?'Business':'Personal'}</span>
        ${p.location?`<span class="chip">${esc(p.location)}</span>`:''}
        ${p.energy?`<span class="chip">${p.energy} energy</span>`:''}
      </div>
    </div>
    <button class="btn" style="width:100%;margin-top:12px" onclick="commitQuickAdd()">Add to calendar</button>
  </div>`;
}
let _qa=null;
function openQuickAdd(){
  openSheet('Quick add',`
    <input id="qaInput" placeholder="Sync with Dev Team Monday 9am to 10am [Business]" oninput="qaUpdate(this.value)" autocomplete="off">
    <div id="qaPreview">${quickAddPreview('')}</div>`);
  setTimeout(()=>$('#qaInput')?.focus(),40);
}
function qaUpdate(v){ _qa=v; $('#qaPreview').innerHTML=quickAddPreview(v) }
function commitQuickAdd(){
  const p=parsePhrase(_qa||'');
  const ctx=p.ctx||'personal';
  const catId=catForContext(ctx);
  if(p.days){
    state.routines.push({id:uid(),title:p.title,catId,days:p.days,start:toHM(p.start),end:toHM(p.end),
      nth:p.nth||null,note:'',location:p.location,energy:p.energy});
    save(); closeSheet(); render(); toast(`Recurring block “${p.title}” added.`);
  } else {
    const ev={id:uid(),date:isoDate(p.date),title:p.title,catId,start:toHM(p.start),end:toHM(p.end),
      note:'',location:p.location,energy:p.energy};
    const clash=overlapsFor(p.date,p.start,p.end,null);
    const commit=()=>{ state.events.push(ev); applyBuffer(ev); save(); closeSheet(); render(); toast(`“${p.title}” added.`) };
    if(clash.length){ closeSheet(); return confirmOverlap(clash,commit,()=>openQuickAdd()) }
    commit();
  }
}

/* ---------- focus buffer ---------- */
function applyBuffer(ev){
  if(!state.buffer?.on) return;
  if(catCtx(ev.catId)!=='business') return;
  const pad=state.buffer.mins||10;
  const s=toMin(ev.start), e=toMin(ev.end);
  const mk=(a,b,tag)=>({id:uid(),date:ev.date,title:tag,catId:ev.catId,start:toHM(a),end:toHM(b),note:'Focus buffer',buffer:true});
  if(s-pad>=0) state.events.push(mk(s-pad,s,'Buffer'));
  if(e+pad<=24*60) state.events.push(mk(e,e+pad,'Buffer'));
}

/* ---------- energy load ---------- */
function energyWarning(date){
  const hi=occurrencesOn(date).filter(o=>o.energy==='high' && catCtx(o.catId)==='business');
  const cap=state.energyCap??2;
  if(hi.length>cap) return `${hi.length} high-energy blocks today (${esc(hi.map(o=>o.title).join(', '))}). More than ${cap} in a day usually means one of them gets your worst work.`;
  return null;
}

/* ---------- reminders ---------- */
let notified=new Set();
async function askNotify(){
  if(!('Notification' in window)) return toast('This browser does not support notifications.');
  const r=await Notification.requestPermission();
  state.prefs.notify = r==='granted';
  save(); render();
  toast(r==='granted'?'Reminders are on.':'Reminders stay off until you allow notifications.');
}
function checkReminders(){
  if(!state?.prefs?.notify || Notification?.permission!=='granted') return;
  const lead=state.prefs.notifyLead??10;
  const now=new Date(), nowM=now.getHours()*60+now.getMinutes();
  for(const o of occurrencesOn(now)){
    const key=`${isoDate(now)}-${o.id}-${o.start}`;
    const delta=o.start-nowM;
    if(delta<=lead && delta>=0 && !notified.has(key)){
      notified.add(key);
      try{ new Notification(o.title,{body:`Starts at ${fmt12(o.start)}${o.note?' · '+o.note:''}`,tag:key}) }catch{}
    }
  }
  // overdue tasks nudge, once a day at the hour you choose
  const hour=state.prefs.digestHour??8;
  const dkey=`digest-${isoDate(now)}`;
  if(now.getHours()===hour && now.getMinutes()<2 && !notified.has(dkey)){
    notified.add(dkey);
    const open=state.tasks.filter(t=>!t.done).length;
    const first=occurrencesOn(now)[0];
    try{ new Notification('Today',{body:`${open} open task${open===1?'':'s'}${first?` · first block: ${first.title} at ${fmt12(first.start)}`:''}`,tag:dkey}) }catch{}
  }
}
setInterval(checkReminders,30000);

/* ---------- GOALS ---------- */
const AREAS=[
  {id:'finance',  name:'Finance',      color:'#3ECFB2'},
  {id:'career',   name:'Career',       color:'#7C6AF0'},
  {id:'family',   name:'Family',       color:'#FF9EC4'},
  {id:'health',   name:'Health',       color:'#8FD14F'},
  {id:'learning', name:'Learning',     color:'#6FA8FF'},
  {id:'personal', name:'Personal',     color:'#FFB84D'}
];
const HORIZONS=[['quarter','This quarter'],['year','This year'],['life','Long term']];
const areaById=id=>AREAS.find(a=>a.id===id)||AREAS[5];

function goalProgress(g){
  if(!g.milestones.length) return g.manualPct||0;
  return Math.round(g.milestones.filter(m=>m.done).length/g.milestones.length*100);
}
function goalStale(g){
  const last=g.checkins?.[0]?.at||g.createdAt;
  return (Date.now()-new Date(last))/864e5 > 21;
}
function nextStep(g){ return g.milestones.find(m=>!m.done) }

function viewGoals(){
  if(!state.goals) state.goals=[];
  const filter=state.goalArea||'all';
  const list=state.goals.filter(g=>filter==='all'||g.area===filter);
  const stale=state.goals.filter(goalStale);
  const active=state.goals.filter(g=>goalProgress(g)<100);

  if(!state.goals.length){
    return `<div class="empty" style="max-width:600px">
      <h3>What are you working toward?</h3>
      <p class="tiny">Goals sit above your day-to-day. Break each one into steps, link those steps to real tasks, and check in as you go.</p>
      <button class="btn" style="margin-top:16px" onclick="editGoal(null)">Set your first goal</button>
    </div>`;
  }
  return `${stale.length?`<div class="warnbar">You have not checked in on ${stale.length} goal${stale.length===1?'':'s'} in over three weeks. ${esc(stale.slice(0,2).map(g=>g.title).join(', '))}${stale.length>2?'…':''}</div>`:''}
  <div class="grid" style="margin-bottom:18px">
    <div class="panel s3"><div class="stat-n">${active.length}</div><div class="stat-l">Active goals</div></div>
    <div class="panel s3"><div class="stat-n">${state.goals.length-active.length}</div><div class="stat-l">Completed</div></div>
    <div class="panel s6">
      <div class="eyebrow" style="margin-bottom:12px">Next steps across all goals</div>
      ${active.slice(0,3).map(g=>{const n=nextStep(g);return n?`
        <div class="between" style="padding:6px 0"><span class="tiny">${esc(n.title)}</span>
        <span class="chip"><i class="dot" style="--cat:${areaById(g.area).color}"></i>${esc(g.title.slice(0,22))}</span></div>`:''}).join('')
        || '<p class="tiny muted">No open steps. Add milestones to your goals.</p>'}
    </div>
  </div>
  <div class="between wrap" style="margin-bottom:16px">
    <div class="row wrap">
      <button class="area-tab ${filter==='all'?'on':''}" onclick="state.goalArea='all';save();render()">All</button>
      ${AREAS.map(a=>`<button class="area-tab ${filter===a.id?'on':''}" onclick="state.goalArea='${a.id}';save();render()">${a.name}</button>`).join('')}
    </div>
    <button class="btn btn-s" onclick="editGoal(null)">New goal</button>
  </div>
  <div class="grid">${list.map(g=>{
    const p=goalProgress(g), a=areaById(g.area), n=nextStep(g);
    return `<div class="goal s6" onclick="openGoal('${g.id}')">
      <div class="row" style="align-items:flex-start;gap:14px">
        <div class="goal-ring" style="background:${a.color}22;color:${a.color}">${p}%</div>
        <div style="flex:1;min-width:0">
          <div class="between"><div class="item-t">${esc(g.title)}</div>
            ${goalStale(g)?'<span class="chip" style="color:var(--warn)">Stale</span>':''}</div>
          <div class="row wrap" style="margin-top:6px">
            <span class="chip"><i class="dot" style="--cat:${a.color}"></i>${a.name}</span>
            <span class="chip">${HORIZONS.find(h=>h[0]===g.horizon)?.[1]||'This year'}</span>
            ${g.target?`<span class="chip mono">by ${new Date(g.target+'T00:00:00').toLocaleDateString([],{month:'short',year:'numeric'})}</span>`:''}
          </div>
          <div class="meter"><i style="width:${p}%;background:${a.color}"></i></div>
          <div class="tiny muted" style="margin-top:9px">${n?'Next: '+esc(n.title):(p===100?'Complete':'No steps yet — add some')}</div>
        </div>
      </div>
    </div>`}).join('')}</div>`;
}

function editGoal(id){
  const g=id?state.goals.find(x=>x.id===id):{id:null,title:'',area:'personal',horizon:'year',target:'',why:'',milestones:[],checkins:[]};
  openSheet(id?'Edit goal':'New goal',`
    <label>What do you want to achieve?</label>
    <input id="gT" value="${esc(g.title)}" placeholder="Pay off the business credit line">
    <label>Life area</label>
    <select id="gA">${AREAS.map(a=>`<option value="${a.id}" ${g.area===a.id?'selected':''}>${a.name}</option>`).join('')}</select>
    <label>Time frame</label>
    <select id="gH">${HORIZONS.map(([v,n])=>`<option value="${v}" ${g.horizon===v?'selected':''}>${n}</option>`).join('')}</select>
    <label>Target date (optional)</label><input id="gD" type="date" value="${esc(g.target||'')}">
    <label>Why does this matter?</label>
    <textarea id="gW" placeholder="The reason you will still care about this in six months.">${esc(g.why||'')}</textarea>
    <div class="row" style="margin-top:18px">
      <button class="btn" onclick="saveGoal('${id||''}')">Save goal</button>
      ${id?`<button class="btn-x" onclick="delGoal('${id}')">Delete</button>`:''}
    </div>`);
}
function saveGoal(id){
  const title=$('#gT').value.trim(); if(!title) return toast('Give the goal a name.');
  if(!state.goals) state.goals=[];
  const rec={title,area:$('#gA').value,horizon:$('#gH').value,target:$('#gD').value||null,why:$('#gW').value};
  if(id){ Object.assign(state.goals.find(x=>x.id===id),rec) }
  else { state.goals.push({id:uid(),createdAt:new Date().toISOString(),milestones:[],checkins:[],...rec}) }
  save(); closeSheet(); render(); toast('Goal saved.');
}
function delGoal(id){ state.goals=state.goals.filter(x=>x.id!==id); save(); closeSheet(); render(); toast('Goal deleted.') }

function openGoal(id){
  const g=state.goals.find(x=>x.id===id); if(!g) return;
  const a=areaById(g.area), p=goalProgress(g);
  openSheet(g.title,`
    <div class="row" style="gap:14px;margin-bottom:16px">
      <div class="goal-ring" style="background:${a.color}22;color:${a.color};width:56px;height:56px;font-size:14px">${p}%</div>
      <div><div class="row wrap"><span class="chip"><i class="dot" style="--cat:${a.color}"></i>${a.name}</span>
      <span class="chip">${HORIZONS.find(h=>h[0]===g.horizon)?.[1]}</span>
      ${g.target?`<span class="chip mono">by ${new Date(g.target+'T00:00:00').toLocaleDateString([],{month:'long',year:'numeric'})}</span>`:''}</div>
      ${g.why?`<p class="tiny muted" style="margin:8px 0 0">${esc(g.why)}</p>`:''}</div>
    </div>

    <div class="eyebrow" style="margin:20px 0 8px">Steps to get there</div>
    ${g.milestones.length?g.milestones.map(m=>`
      <div class="milestone">
        <button class="ms-check ${m.done?'on':''}" onclick="toggleMs('${g.id}','${m.id}')">✓</button>
        <div style="flex:1;min-width:0">
          <div class="tiny" style="${m.done?'text-decoration:line-through;opacity:.55':''}">${esc(m.title)}</div>
          ${m.due?`<div class="tiny dim mono">by ${new Date(m.due+'T00:00:00').toLocaleDateString([],{month:'short',day:'numeric'})}</div>`:''}
        </div>
        ${!m.done?`<button class="btn-2 btn-s" onclick="msToTask('${g.id}','${m.id}')">Add as task</button>`:''}
        <button class="btn-2 btn-s" onclick="delMs('${g.id}','${m.id}')">×</button>
      </div>`).join('')
      :'<p class="tiny muted">No steps yet. Break the goal into things you can actually do.</p>'}
    <div class="row" style="margin-top:12px">
      <input id="msNew" placeholder="Next step…" style="flex:1">
      <input id="msDue" type="date" style="width:150px">
      <button class="btn btn-s" onclick="addMs('${g.id}')">Add</button>
    </div>

    <div class="eyebrow" style="margin:24px 0 8px">Check-ins</div>
    ${g.checkins?.length?g.checkins.slice(0,4).map(ci=>`
      <div style="padding:9px 0;border-bottom:1px solid var(--line-soft)">
        <div class="between"><span class="chip">${ci.mood}</span>
        <span class="tiny dim mono">${new Date(ci.at).toLocaleDateString([],{month:'short',day:'numeric'})}</span></div>
        ${ci.note?`<p class="tiny muted" style="margin:6px 0 0">${esc(ci.note)}</p>`:''}
      </div>`).join('')
      :'<p class="tiny muted">No check-ins yet. A quick note every few weeks keeps a goal from quietly dying.</p>'}
    <div style="margin-top:12px">
      <div class="row wrap" style="margin-bottom:8px">
        ${['On track','Slow','Stuck','Done'].map(m=>`<button class="area-tab" onclick="_ciMood='${m}';[...this.parentNode.children].forEach(b=>b.classList.remove('on'));this.classList.add('on')">${m}</button>`).join('')}
      </div>
      <textarea id="ciNote" placeholder="What moved, what is in the way?"></textarea>
      <button class="btn btn-s" style="margin-top:10px" onclick="addCheckin('${g.id}')">Save check-in</button>
    </div>

    <div class="row" style="margin-top:22px;border-top:1px solid var(--line);padding-top:16px">
      <button class="btn-2 btn-s" onclick="editGoal('${g.id}')">Edit goal</button>
    </div>`);
}
let _ciMood='On track';
function addMs(gid){
  const g=state.goals.find(x=>x.id===gid); const t=$('#msNew').value.trim();
  if(!t) return toast('Name the step first.');
  g.milestones.push({id:uid(),title:t,due:$('#msDue').value||null,done:false});
  save(); openGoal(gid);
}
function toggleMs(gid,mid){
  const g=state.goals.find(x=>x.id===gid), m=g.milestones.find(x=>x.id===mid);
  m.done=!m.done;
  if(m.done) logIt('Milestone reached',`${m.title} — ${g.title}`,0);
  save(); openGoal(gid); 
}
function delMs(gid,mid){
  const g=state.goals.find(x=>x.id===gid);
  g.milestones=g.milestones.filter(x=>x.id!==mid); save(); openGoal(gid);
}
function msToTask(gid,mid){
  const g=state.goals.find(x=>x.id===gid), m=g.milestones.find(x=>x.id===mid);
  state.tasks.push({id:uid(),title:m.title,catId:state.categories[0]?.id||null,importance:9,urgency:5,
    estimate:60,progress:0,note:`Step toward: ${g.title}`,done:false,goalId:gid,msId:mid});
  save(); toast(`Added “${m.title}” to your tasks.`);
}
function addCheckin(gid){
  const g=state.goals.find(x=>x.id===gid);
  if(!g.checkins) g.checkins=[];
  g.checkins.unshift({at:new Date().toISOString(),mood:_ciMood,note:$('#ciNote').value.trim()});
  _ciMood='On track';
  save(); openGoal(gid); toast('Check-in saved.');
}

/* ---------- booking links ---------- */
let myLink=null, myBookings=[];
let bookingError=null;
async function loadBooking(){
  if(!sb||!user) return;
  bookingError=null;
  const {data,error}=await sb.from('booking_links').select('*').eq('user_id',user.id).maybeSingle();
  if(error){
    bookingError = error.message.includes('does not exist') || error.code==='42P01'
      ? 'The booking tables are not set up yet. Run supabase-schema-v4-booking.sql in your Supabase SQL editor, then reload.'
      : error.message;
    myLink=null; return;
  }
  myLink=data||null;
  if(myLink){
    const {data:bk}=await sb.from('bookings').select('*').eq('host_id',user.id)
      .gte('starts_at',new Date().toISOString()).order('starts_at');
    myBookings=bk||[];
  }
}
function bookingUrl(){ return myLink?`${location.origin}${location.pathname.replace(/index\.html$/,'')}book.html?u=${myLink.slug}`:'' }

function viewBooking(){
  if(bookingError){
    return `<div class="empty" style="max-width:560px">
      <h3>Booking is not set up yet</h3>
      <p class="tiny" style="margin-top:8px">${esc(bookingError)}</p>
      <button class="btn btn-s" style="margin-top:14px" onclick="loadBooking().then(render)">Try again</button>
    </div>`;
  }
  if(!myLink){
    const suggest=(profile?.username||'me').replace(/[^a-z0-9]/g,'');
    return `<div class="empty" style="max-width:560px">
      <h3>Let people book your open time</h3>
      <p class="tiny">Share one link. Visitors see only your free slots — never what those blocks are — and pick a time. It lands on your calendar automatically.</p>
      <div style="max-width:300px;margin:18px auto 0;text-align:left">
        <label>Your link</label>
        <div class="row"><span class="tiny dim mono">/book?u=</span><input id="blSlug" value="${esc(suggest)}" style="flex:1"></div>
        <label>Meeting length</label>
        <select id="blDur"><option value="15">15 minutes</option><option value="30" selected>30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select>
        <button class="btn" style="width:100%;margin-top:16px" onclick="createLink()">Create booking link</button>
        <div class="msg" id="blMsg"></div>
      </div></div>`;
  }
  const upcoming=myBookings.map(b=>{
    const s=new Date(b.starts_at);
    return `<div class="member">
      <div class="avatar">${esc((b.name[0]||'?').toUpperCase())}</div>
      <div style="flex:1;min-width:0">
        <div class="item-t">${esc(b.name)}</div>
        <div class="status">${s.toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'})} at ${s.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</div>
      </div>
      <span class="chip">${esc(b.email)}</span>
    </div>`;
  }).join('');
  return `<div class="grid">
    <div class="panel s7">
      <div class="panel-head"><div class="eyebrow">Upcoming bookings</div>
        <button class="btn-2 btn-s" onclick="loadBooking().then(render)">Refresh</button></div>
      ${upcoming||'<p class="tiny muted">No bookings yet. Share your link and they will appear here.</p>'}
    </div>
    <div class="panel s5">
      <div class="eyebrow" style="margin-bottom:10px">Your booking link</div>
      <div class="code" style="font-size:12px;letter-spacing:.02em;word-break:break-all">${esc(bookingUrl())}</div>
      <div class="row" style="margin-top:12px">
        <button class="btn btn-s" onclick="copyLink()">Copy link</button>
        <button class="btn-2 btn-s" onclick="window.open(bookingUrl(),'_blank')">Preview</button>
      </div>
      <label>Meeting length</label>
      <select onchange="updateLink({duration_min:+this.value})">${[15,30,45,60].map(d=>`<option value="${d}" ${myLink.duration_min===d?'selected':''}>${d} minutes</option>`).join('')}</select>
      <label>Earliest booking</label>
      <select onchange="updateLink({lead_hours:+this.value})">${[1,4,12,24,48].map(h=>`<option value="${h}" ${myLink.lead_hours===h?'selected':''}>${h} hours from now</option>`).join('')}</select>
      <label>Meeting link (Zoom, Google Meet, Teams)</label>
      <input value="${esc(myLink.meeting_url||'')}" placeholder="https://zoom.us/j/..." onchange="updateLink({meeting_url:this.value.trim()||null})">
      <p class="tiny dim" style="margin-top:5px">Pasted into the confirmation so people know where to join.</p>
      <label>Show availability for</label>
      <select onchange="updateLink({horizon_days:+this.value})">${[7,14,30,60].map(d=>`<option value="${d}" ${myLink.horizon_days===d?'selected':''}>Next ${d} days</option>`).join('')}</select>
      <div style="border-top:1px solid var(--line);margin-top:16px;padding-top:14px">
        <label style="margin-top:0">Link is ${myLink.active?'live':'paused'}</label>
        <button class="btn-2 btn-s" onclick="updateLink({active:${!myLink.active}})">${myLink.active?'Pause bookings':'Resume bookings'}</button>
      </div>
    </div>
  </div>`;
}
async function createLink(){
  const slug=$('#blSlug').value.trim().toLowerCase().replace(/[^a-z0-9-]/g,'');
  const msg=$('#blMsg');
  if(slug.length<3){ msg.className='msg err'; msg.textContent='Pick a link name of at least 3 characters.'; return }
  msg.className='msg'; msg.textContent='Creating…';
  const {error}=await sb.from('booking_links').insert({user_id:user.id,slug,
    title:`Book time with ${state.displayName||profile?.username||'me'}`,
    duration_min:+$('#blDur').value});
  if(error){ msg.className='msg err'; msg.textContent=error.message.includes('duplicate')?'That link name is taken. Try another.':error.message; return }
  await loadBooking(); render(); toast('Booking link created.');
}
async function updateLink(patch){
  const {error}=await sb.from('booking_links').update(patch).eq('id',myLink.id);
  if(error) return toast(error.message);
  await loadBooking(); render(); toast('Saved.');
}
function copyLink(){
  navigator.clipboard.writeText(bookingUrl()).then(()=>toast('Link copied.'),()=>toast('Could not copy. Select the text instead.'));
}

/* ---------- render ---------- */
const PAGES={
  today:{kicker:'TODAY',title:d=>d.toLocaleDateString([],{weekday:'long'}),sub:'Your day at a glance, with the next open slot.',fn:viewToday},
  week:{kicker:'CALENDAR',title:()=>'This week',sub:'Where your time goes, and what is still open.',fn:viewWeek},
  month:{kicker:'CALENDAR',title:()=>'Month',sub:'The wide view. Click any day to add something.',fn:viewMonth},
  agenda:{kicker:'CALENDAR',title:()=>'Agenda',sub:'Everything ahead, as a list.',fn:viewAgenda},
  tasks:{kicker:'BACKLOG',title:()=>'Tasks',sub:'Ranked by importance and urgency.',fn:viewTasks},
  routines:{kicker:'REPEATING',title:()=>'Routines',sub:'The blocks that come back every week.',fn:viewRoutines},
  team:{kicker:'WORKSPACE',title:()=>'Team',sub:'Who is free, who is heads-down.',fn:viewTeam},
  goals:{kicker:'DIRECTION',title:()=>'Goals',sub:'What you are working toward, and the next step for each.',fn:viewGoals},
  booking:{kicker:'SCHEDULING',title:()=>'Booking link',sub:'Let people book your open time without emailing back and forth.',fn:viewBooking},
  settings:{kicker:'CONFIGURE',title:()=>'Settings',sub:'Profile, day window and data.',fn:viewSettings}
};

function render(){
  if(!state) return;
  $('#nav').innerHTML=NAV.map(([id,label])=>`<button class="${state.page===id?'on':''}" onclick="go('${id}')">${label}</button>`).join('');
  $('#railOrg').textContent = org?org.name:'PERSONAL';
  $('#railUser').textContent = state.displayName ? state.displayName+' · @'+(profile?.username||'') : (profile?.username?'@'+profile.username:(user?.email||''));
  if(!PAGES[state.page]) state.page='today';
  const p=PAGES[state.page];
  $('#pageKicker').textContent=p.kicker;
  $('#pageTitle').textContent=p.title(new Date());
  $('#pageSub').textContent=p.sub;
  $('#view').innerHTML=p.fn();
  tick();
}
function esc(s){ return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }

/* ---------- boot ---------- */
document.addEventListener('keydown',e=>{
  const open=$('#cmdScrim')?.classList.contains('on');
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){ e.preventDefault(); open?closeCmd():openCmd(); return }
  if(e.key==='Escape'){ if(open) closeCmd(); else closeSheet(); return }
  if(!open) return;
  if(e.key==='ArrowDown'){ e.preventDefault(); cmdSel=Math.min(cmdSel+1,cmdItems.length-1); renderCmd($('#cmdInput').value) }
  if(e.key==='ArrowUp'){ e.preventDefault(); cmdSel=Math.max(cmdSel-1,0); renderCmd($('#cmdInput').value) }
  if(e.key==='Enter'){ e.preventDefault(); runCmd(cmdSel) }
});
document.addEventListener('input',e=>{ if(e.target.id==='cmdInput'){ cmdSel=0; renderCmd(e.target.value) } });
$('#cmdScrim')?.addEventListener('click',e=>{ if(e.target.id==='cmdScrim') closeCmd() });

(async function boot(){
  applyTheme(LS.get('theme','dark'));
  initSb();
  if(!sb){ gateAuth('signin'); return }
  const {data:{session}}=await sb.auth.getSession();
  if(!session){ gateAuth('signin'); return }
  user=session.user;
  await afterSignIn();
})();
