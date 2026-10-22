/* Rinmukt app: state, views, transitions, Home story. Depends on engine.js. */
const APP='Rinmukt', KEY='rinmukt.v1';
let memStore=null;
function storeLoad(){ let s=null; try{ s=localStorage.getItem(KEY); }catch(e){} if(s==null) s=memStore; try{ return s?JSON.parse(s):null; }catch(e){ return null; } }
function storeSave(){ const s=JSON.stringify({loans:state.loans}); memStore=s; try{ localStorage.setItem(KEY,s); }catch(e){} }
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const blankForm=(kind)=>({name:'',lender:'',last4:'',principal:'',rate:kind==='card'?'0':'',tenure:'',emi:'',firstDate:'',type:'',kind:kind||'',gst:true});

const BOOT=storeLoad()||{};
const state={
  loans:Array.isArray(BOOT.loans)?BOOT.loans.filter(validLoan).map(clean):[],
  deck:'ember',
  w:window.innerWidth||1024, route:'home', selId:null, selCard:null,
  form:blankForm(), formId:null, tried:false,
  openYears:{}, pending:null, lbal:'', lasOf:'', lerr:'', lbalFor:null, delConfirm:false,
  backupMsg:'', backupOk:true, showBackup:false, backupText:'', restoreText:'', restoreErr:'', restoreOk:'', clearConfirm:false, demoMsg:'', anim:false, resetScroll:null
};
const isWide=()=>state.w>=900;
const PLUS='<button class="plus" data-act="add" aria-label="Add loan"><span></span></button>';

// the app's glow follows whichever Home slide was on screen last
const DECKS=['ember','ledger','counted','missed','free'];
function applyTheme(){ const el=document.documentElement, d=state.deck; if(el.getAttribute('data-deck')!==d) el.setAttribute('data-deck',d); }

/* ---------- view transitions ---------- */
// forward = deeper or to a tab on the right; back = the reverse. Same zoom-fade as leaving Home.
const ORDER={home:0,overview:1,detail:1.5,portfolio:2,form:2.5,cards:3,cdetail:3.5,settings:4};
const viewKey=()=>{ const S=state; return S.route+'|'+(S.route==='detail'||S.route==='overview'?S.selId||'':'')+(S.route==='cdetail'?S.selCard:'')+(S.route==='form'?(S.formId||'new')+S.form.kind:''); };
let lastKey=null, lastRoute=null;
const reduceMotion=()=>{ try{ return matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ return false; } };
function ghostOut(dir){
  document.querySelectorAll('.ghostView').forEach(g=>g.remove());
  if(reduceMotion()) return;
  const wide=isWide(), src=wide?document.querySelector('.pane-r'):document.querySelector('#app .app');
  if(!src) return;
  // the copy sits in a wrapper carrying the same layout classes, so it looks identical while it leaves
  const r=src.getBoundingClientRect(), c=src.cloneNode(true), g=document.createElement('div');
  c.querySelectorAll('.nav').forEach(n=>n.remove());
  c.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));
  g.className='ghostView '+dir+(wide?' app wide':'');
  Object.assign(g.style,{position:'fixed',left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',margin:'0',zIndex:'60',pointerEvents:'none',overflow:'hidden',minHeight:'0'});
  if(wide) Object.assign(c.style,{position:'relative',height:'100%',width:'100%'});
  g.appendChild(c); document.body.appendChild(g);
  if(wide) c.scrollTop=src.scrollTop;
  setTimeout(()=>g.remove(),760);
}
function viewIn(dir,all){
  if(reduceMotion()) return;
  const t=isWide()&&!all?document.querySelectorAll('#app .pane-r'):document.querySelectorAll('#app .pane-l,#app .pane-r');
  t.forEach(el=>{ el.classList.remove('vin-fwd','vin-back'); void el.offsetWidth; el.classList.add('vin-'+dir); setTimeout(()=>el.classList.remove('vin-'+dir),760); });
}

/* ---------- view ---------- */
function validate(f){
  const e={}; const P=num(f.principal), R=num(f.rate), N=num(f.tenure), E=num(f.emi);
  if(!f.name.trim()) e.name='Required';
  if(!f.lender.trim()) e.lender='Required';
  if(f.last4&&!/^\d{4}$/.test(f.last4)) e.last4='4 digits';
  if(!(P>0)) e.principal='Positive number';
  if(f.kind==='card'?!(R>=0)||R>=100:!(R>0)||R>=100) e.rate=f.kind==='card'?'0 or more':'Positive number';
  if(!(N>0)||!Number.isInteger(N)||N>1200) e.tenure='Whole months';
  if(!(E>0)) e.emi='Positive number';
  else if(P>0&&R>0&&E<=P*R/1200) e.emi='EMI does not cover interest';
  if(!parseD(f.firstDate)) e.firstDate='Valid date';
  const v={name:f.name.trim(),lender:f.lender.trim(),last4:f.last4,principal:P,rate:R,tenure:N,emi:E,firstDate:f.firstDate,type:f.type||''};
  if(f.kind==='card'){ v.kind='card'; v.gst=f.gst!==false; }
  return {e,v};
}
function formLive(){
  const S=state, {e,v}=validate(S.form), fe={};
  ['name','lender','last4','principal','rate','tenure','emi','firstDate'].forEach(k=>{
    const show=S.tried||(k==='emi'&&e.emi==='EMI does not cover interest')||(k==='last4'&&S.form.last4.length>=4);
    fe[k]=show?(e[k]||''):'';
  });
  let flag='', readout=[['Closing','—'],['EMIs','—'],['Total interest','—']];
  const card=S.form.kind==='card';
  const okNums=v.principal>0&&(card?v.rate>=0:v.rate>0)&&v.rate<100&&v.tenure>0&&Number.isInteger(v.tenure)&&v.tenure<=1200;
  if(okNums&&v.emi>0){ const se=stdEmi(v.principal,v.rate,v.tenure); const diff=(v.emi-se)/se; if(Math.abs(diff)>0.03) flag='Standard EMI '+inr2(se)+' · '+(diff>0?'+':'')+(diff*100).toFixed(1)+'%'; }
  if(okNums&&v.emi>v.principal*v.rate/1200&&parseD(v.firstDate)){
    const rows=buildSchedule({...v,missed:[]},'0000-00-00').rows; const last=rows[rows.length-1], ti=rows.reduce((a,r)=>a+r.interest,0);
    readout=[['Closing',fd(last.date)],['EMIs',String(rows.length)],['Total interest',inr2(ti)]];
    if(card&&S.form.gst!==false) readout.push(['GST on interest',inr2(ti*GST)]);
    if(Math.abs(last.emi-v.emi)>0.005) readout.push(['Final EMI',inr2(last.emi)]);
  }
  return {fe,flag,readout};
}
const readoutHtml=ro=>ro.map(([l,v])=>`<div><div class="lbl">${l}</div><div class="mono" style="font-size:14px">${esc(v)}</div></div>`).join('');

const sortComps=a=>a.sort((a,b)=>{ if(a.closed!==b.closed) return a.closed?1:-1; const ka=a.next?a.next.date:a.closing, kb=b.next?b.next.date:b.closing; return ka<kb?-1:ka>kb?1:0; });
const loansOnly=()=>state.loans.filter(l=>!isCard(l));
const cardsOnly=()=>state.loans.filter(isCard);
const TABS=[['home','Home'],['overview','Overview'],['portfolio','Portfolio'],['cards','Cards'],['settings','Settings']];
function view(){
  const S=state, today=todayStr(), wide=isWide();
  const comps=sortComps(loansOnly().map(l=>computeLoan(l,today)));
  const active=comps.filter(c=>!c.closed);
  let sel=comps.find(c=>c.l.id===S.selId);
  if(!sel&&wide&&comps.length) sel=comps[0];
  const cardSel=S.selCard?cardsOnly().map(l=>computeLoan(l,today)).find(c=>c.l.id===S.selCard):null;
  if(S.route==='cdetail'&&!cardSel) S.route='cards';
  if(!wide&&S.route==='detail'&&!sel) S.route='overview';
  const R=S.route;
  const shown=R==='cdetail'?cardSel:sel;
  if(shown&&S.lbalFor!==shown.l.id){ S.lbalFor=shown.l.id; S.lbal=shown.l.lenderBal!=null?String(shown.l.lenderBal):''; S.lasOf=shown.l.asOf||today; S.lerr=''; }

  const navOn=R==='home'?'home':(R==='overview'||R==='detail')?'overview':R==='portfolio'||(R==='form'&&S.form.kind!=='card')?'portfolio':(R==='cards'||R==='cdetail'||R==='form')?'cards':'settings';
  const nav=`<nav class="nav${R==='home'?' dark':''}">`+TABS.map(([k,l])=>`<button data-act="${k}"${navOn===k?' aria-current="page"':''}>${l}</button>`).join('')+`</nav>`;
  if(R==='home') return `<div class="app${wide?' wide':''}">${nav}</div>`;

  const showLeft=wide||R==='overview', showRight=wide||R!=='overview';
  const rightRoute=(R==='overview'||R==='detail')?(sel?'detail':'none'):R;
  let h=`<div class="app${wide?' wide':''}">`;
  if(showLeft) h+=`<aside class="pane-l">${leftHtml(comps,active,sel,today,wide)}</aside>`;
  if(showRight){
    h+=`<main class="pane-r"><div class="inner">`;
    if(rightRoute==='none'&&wide) h+=`<div class="sec" style="min-height:60vh;display:flex;align-items:center;justify-content:center">${comps.length?'No loan selected':'No loans'}</div>`;
    if(rightRoute==='detail') h+=detailHtml(sel,today,wide);
    if(rightRoute==='cdetail') h+=detailHtml(cardSel,today,wide);
    if(rightRoute==='form') h+=formHtml();
    if(rightRoute==='portfolio') h+=addHtml();
    if(rightRoute==='cards') h+=cardsHtml(today);
    if(rightRoute==='settings') h+=settingsHtml();
    h+=`</div></main>`;
  }
  return h+nav+`</div>`;
}

function cardsHtml(today){
  const comps=sortComps(cardsOnly().map(l=>computeLoan(l,today))), act=comps.filter(c=>!c.closed);
  let h=`<div class="top"><h1 class="disp" style="margin:0;font-size:30px">Cards</h1><button class="plus" data-act="addCard" aria-label="Add card EMI"><span></span></button></div>`;
  const total=act.reduce((a,c)=>a+c.outstanding,0), monthly=act.reduce((a,c)=>a+c.l.emi,0);
  h+=`<section class="stack" style="gap:18px">
    <div class="stack" style="gap:8px"><div class="sec">Card EMI outstanding</div><div class="hero${act.length?'':' ghost'}" id="cardTotal">${inr(total)}</div></div>
    <div class="trio">
      <div><div class="lbl">Monthly EMIs</div><div class="mono v${act.length?'':' ghost'}">${act.length?inr(monthly):'—'}</div></div>
      <div><div class="lbl">Next due</div><div class="mono v${act.length?'':' ghost'}">${act.length?fdm(act[0].next.date):'—'}</div></div>
      <div><div class="lbl">Active</div><div class="mono v${act.length?'':' ghost'}">${act.length}</div></div>
    </div></section>`;
  if(!comps.length) return h+`<section class="stack" style="gap:10px"><div class="sec">Plans</div><button class="ghostCard" data-act="addCard"><b>+</b>Add card EMI</button></section>`;
  // group plans by card (name + last 4)
  const groups=[], byKey={};
  comps.forEach(c=>{ const k=c.l.lender.trim().toLowerCase()+'|'+(c.l.last4||''); if(!byKey[k]){ byKey[k]={name:c.l.lender,last4:c.l.last4,items:[]}; groups.push(byKey[k]); } byKey[k].items.push(c); });
  h+=groups.map(g=>{ const blocked=g.items.filter(c=>!c.closed).reduce((a,c)=>a+c.outstanding,0), n=g.items.filter(c=>!c.closed).length;
    return `<section class="stack" style="gap:10px">
      <div class="row" style="justify-content:space-between;gap:12px;align-items:flex-end;border-bottom:1px solid var(--line);padding-bottom:10px">
        <div class="stack" style="gap:4px;min-width:0"><div style="font-size:16px;font-weight:700" class="ell">${esc(g.name)}${g.last4?`<span class="mono" style="font-weight:400;color:var(--ink3);font-size:13px"> ••${esc(g.last4)}</span>`:''}</div><div class="lbl">${n} active</div></div>
        <div class="stack" style="gap:4px;align-items:flex-end"><div class="lbl">Limit blocked</div><div class="mono" style="font-size:14px">${inr(blocked)}</div></div>
      </div>
      <div class="stack" style="gap:8px">${g.items.map(c=>planCard(c,today)).join('')}</div></section>`; }).join('');
  return h;
}
function planCard(c,today){
  const nc=c.closed?'var(--ink3)':'var(--ink)', nextCol=c.next&&daysTo(today,c.next.date)<=7?'var(--due)':'var(--ink)';
  return `<button class="card" data-act="openCard" data-id="${esc(c.l.id)}">
    <div class="row" style="justify-content:space-between;align-items:flex-start;gap:12px;width:100%">
      <div class="row" style="gap:8px;flex-wrap:wrap;min-width:0"><span style="font-size:16px;font-weight:600;color:${nc}">${esc(c.l.name)}</span>${c.l.rate===0?'<span class="tag ok">No-cost</span>':''}${c.l.sample?'<span class="tag">Sample</span>':''}${c.closed?'<span class="tag ok">Closed</span>':''}</div>
      <div class="mono" style="font-size:16px;white-space:nowrap;color:${nc}">${c.closed?'₹0':short(c.outstanding)}</div>
    </div>
    <div class="row" style="gap:10px;width:100%"><div class="bar"><i style="width:${state.anim?(c.pct*100).toFixed(2):0}%"></i></div><div class="mono" style="font-size:11px;color:var(--ink2);min-width:42px;text-align:right">${(c.pct*100).toFixed(1)}%</div></div>
    <div class="grid3">
      <div><div class="lbl">EMI</div><div class="mono" style="font-size:12px">${money(c.l.emi)}</div></div>
      <div><div class="lbl">Next due</div><div class="mono" style="font-size:12px;color:${nextCol}">${c.next?fdm(c.next.date)+' '+String(parseD(c.next.date).y).slice(2):'—'}</div></div>
      <div><div class="lbl">Left</div><div class="mono" style="font-size:12px">${c.closed?'—':c.remaining+' of '+c.rows.length}</div></div>
    </div></button>`;
}

function leftHtml(comps,active,sel,today,wide){
  const S=state;
  let h=`<div class="top"><div class="brand">${APP}</div>${wide?`<button class="btn solid" data-act="add">Add loan</button>`:PLUS}</div>`;
  if(!comps.length) return h+overviewEmptyHtml();
  const total=active.reduce((a,c)=>a+c.outstanding,0), monthly=active.reduce((a,c)=>a+c.l.emi,0);
  const debtFree=active.length?fmy(active.reduce((m,c)=>c.closing>m?c.closing:m,'')):'—';
  const closedN=comps.length-active.length;
  h+=`<section class="stack" style="gap:18px">
    <div class="stack" style="gap:8px"><div class="sec">Principal outstanding</div><div class="hero" id="sumTotal">${inr(total)}</div></div>
    <div class="trio">
      <div><div class="lbl">Monthly EMI</div><div class="mono v">${inr(monthly)}</div></div>
      <div><div class="lbl">Debt-free</div><div class="mono v" style="color:var(--paid)">${debtFree}</div></div>
      <div><div class="lbl">Active</div><div class="mono v">${active.length}${closedN?`<span style="color:var(--ink3)"> · ${closedN} closed</span>`:''}</div></div>
    </div></section>`;

  const up=[];
  active.forEach(c=>c.rows.filter(r=>r.status==='next'||r.status==='upcoming').slice(0,3).forEach(r=>up.push({c,r})));
  up.sort((a,b)=>a.r.date<b.r.date?-1:a.r.date>b.r.date?1:0);
  const dues=up.slice(0,3);
  if(dues.length){
    h+=`<section class="stack" style="gap:10px"><div class="sec">Due next</div><div class="dues" style="grid-template-columns:repeat(${dues.length},minmax(0,1fr))">`+
      dues.map(({c,r})=>{ const dd=daysTo(today,r.date); return `<button class="due" data-act="open" data-id="${esc(c.l.id)}"><div class="ell" style="font-size:12px;font-weight:600">${esc(c.l.name)}</div><div class="mono" style="font-size:13px">${money(r.emi)}</div><div class="mono" style="font-size:11px;color:var(--ink2)">${fd(r.date)}</div><div style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${dd<=7?'var(--due)':'var(--ink3)'}">${rel(dd)}</div></button>`; }).join('')+
      `</div></section>`;
  }

  h+=`<section class="stack" style="gap:10px"><div class="sec">Loans</div><div class="stack" style="gap:8px">`+comps.map(c=>{
    const isSel=wide&&sel&&sel.l.id===c.l.id, nc=c.closed?'var(--ink3)':'var(--ink)';
    const nextTxt=c.next?fdm(c.next.date)+' '+String(parseD(c.next.date).y).slice(2):'—';
    const nextCol=c.next&&daysTo(today,c.next.date)<=7?'var(--due)':'var(--ink)';
    return `<button class="card${isSel?' sel':''}" data-act="open" data-id="${esc(c.l.id)}">
      <div class="row" style="justify-content:space-between;align-items:flex-start;gap:12px;width:100%">
        <div class="stack" style="gap:4px;min-width:0">
          <div class="row" style="gap:8px;flex-wrap:wrap"><span style="font-size:16px;font-weight:600;color:${nc}">${esc(c.l.name)}</span>${c.l.sample?'<span class="tag">Sample</span>':''}${c.closed?'<span class="tag ok">Closed</span>':''}</div>
          <div style="font-size:13px;color:var(--ink3)">${esc(c.l.lender)}${c.l.last4?' · ••'+esc(c.l.last4):''}</div>
        </div>
        <div class="mono" style="font-size:16px;white-space:nowrap;color:${nc}">${c.closed?'₹0':short(c.outstanding)}</div>
      </div>
      <div class="row" style="gap:10px;width:100%"><div class="bar"><i style="width:${S.anim?(c.pct*100).toFixed(2):0}%"></i></div><div class="mono" style="font-size:11px;color:var(--ink2);min-width:42px;text-align:right">${(c.pct*100).toFixed(1)}%</div></div>
      <div class="grid3">
        <div><div class="lbl">EMI</div><div class="mono" style="font-size:12px">${short(c.l.emi)}</div></div>
        <div><div class="lbl">Next due</div><div class="mono" style="font-size:12px;color:${nextCol}">${nextTxt}</div></div>
        <div><div class="lbl">Left</div><div class="mono" style="font-size:12px">${c.closed?'—':ym(c.remaining)}</div></div>
      </div></button>`;
  }).join('')+`</div></section>`;

  // timeline
  const t0=Math.min(...comps.map(c=>T(c.l.firstDate))), t1=Math.max(...comps.map(c=>T(c.closing)),T(today));
  const P=t=>((t-t0)/(t1-t0||1)*100);
  const y0=new Date(t0).getUTCFullYear()+1, y1=new Date(t1).getUTCFullYear();
  const span=y1-y0+1, step=span>12?5:span>6?2:1, ticks=[];
  for(let y=y0;y<=y1;y++){ if(y%step===0||step===1){ const p=P(Date.UTC(y,0,1)); if(p>3&&p<97) ticks.push({label:step===1?"'"+String(y).slice(2):String(y),left:p.toFixed(2)}); } }
  const todayLeft=P(T(today)).toFixed(2);
  h+=`<section class="stack" style="gap:12px"><div class="sec">Timeline</div><div class="tl">
    <div class="tl-ticks mono">${ticks.map(t=>`<span style="left:${t.left}%">${t.label}</span>`).join('')}</div>
    <div class="tl-body">${ticks.map(t=>`<div class="tl-vline" style="left:${t.left}%"></div>`).join('')}`+
    comps.map(c=>{
      const a=P(T(c.l.firstDate)), b=P(T(c.closing));
      const f=Math.max(0,Math.min(1,(T(today)-T(c.l.firstDate))/((T(c.closing)-T(c.l.firstDate))||1)));
      const right=a>50, nc=c.closed?'var(--ink3)':'var(--ink)';
      return `<div class="stack" style="position:relative;gap:5px">
        <div style="position:relative;height:14px"><div class="tl-name" style="${right?`right:${(100-b).toFixed(2)}%;text-align:right`:`left:${a.toFixed(2)}%`};color:${nc}">${esc(c.l.name)}<span class="mono" style="font-weight:400;color:var(--ink3)">  ${fmy(c.closing)}</span></div></div>
        <div style="position:relative;height:8px"><div class="tl-track" style="left:${a.toFixed(2)}%;width:${Math.max(0.6,b-a).toFixed(2)}%"><i style="width:${S.anim?(f*100).toFixed(1):0}%;background:${c.closed?'var(--ink3)':'var(--paid)'}"></i></div></div>
      </div>`;
    }).join('')+
    `<div class="tl-today" style="left:${todayLeft}%"></div></div>
    <div style="position:relative;height:16px;margin-top:6px"><div class="tl-todayLbl" style="left:${todayLeft}%">Today</div></div>
  </div></section>`;
  return h;
}

const TYPES=[
  ['Home loan','<path d="M3 11 12 4l9 7"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/>'],
  ['Car loan','<path d="M3 16v-4l2.5-5h13L21 12v4z"/><path d="M3 12h18"/><circle cx="7.5" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/>'],
  ['Personal loan','<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"/>'],
  ['Education loan','<path d="M2 9 12 4l10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5"/><path d="M22 9v6"/>'],
  ['Two-wheeler loan','<circle cx="5.5" cy="16.5" r="3"/><circle cx="18.5" cy="16.5" r="3"/><path d="M5.5 16.5 9 9h5l4.5 7.5"/><path d="M14 9l-2-3H9"/>'],
  ['Gold loan','<path d="M4 18h16l-2.5-6h-11z"/><path d="M8 12l1.5-5h5L16 12"/>'],
  ['Card EMI','<rect x="2.5" y="5.5" width="19" height="13"/><path d="M2.5 9.5h19"/><path d="M6 15h4"/>']
];
function overviewEmptyHtml(){
  return `<section class="stack" style="gap:18px">
    <div class="stack" style="gap:8px"><div class="sec">Principal outstanding</div><div class="hero ghost">₹0</div></div>
    <div class="trio">
      <div><div class="lbl">Monthly EMI</div><div class="mono v ghost">—</div></div>
      <div><div class="lbl">Debt-free</div><div class="mono v ghost">—</div></div>
      <div><div class="lbl">Active</div><div class="mono v ghost">0</div></div>
    </div></section>
  <section class="stack" style="gap:10px"><div class="sec">Loans</div><button class="ghostCard" data-act="add"><b>+</b>Add loan</button></section>`;
}
const TYPE_RE={'Home loan':/\b(home|house|housing|mortgage|flat)\b/i,'Car loan':/\b(car|auto|vehicle)\b/i,'Personal loan':/\bpersonal\b/i,'Education loan':/\b(education|student|study)\b/i,'Two-wheeler loan':/(two.?wheeler|\bbike\b|scooter|motorcycle)/i,'Gold loan':/\bgold\b/i};
function loanType(l){ if(l.type&&TYPE_RE[l.type]) return l.type; for(const t in TYPE_RE) if(TYPE_RE[t].test(l.name)) return t; return null; }
const mIdx=s=>{ const p=parseD(s); return p.y*12+p.m; };

// month-by-month combined principal balance across all loans
function combinedSeries(comps,today){
  let m0=Infinity, m1=-Infinity;
  comps.forEach(c=>{ m0=Math.min(m0,mIdx(c.l.firstDate)-1); m1=Math.max(m1,mIdx(c.closing)); });
  const tm=mIdx(today); m1=Math.max(m1,tm);
  const tot=new Array(m1-m0+1).fill(0);
  comps.forEach(c=>{ const s0=mIdx(c.l.firstDate)-1; let bal=c.l.principal, ri=0;
    for(let m=s0;m<=m1;m++){ while(ri<c.rows.length&&mIdx(c.rows[ri].date)<=m){ bal=c.rows[ri].bal; ri++; } tot[m-m0]+=bal; } });
  return {m0,m1,tm,tot};
}
function curveSvg(pts,tx,o){
  const d=a=>a.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  const past=pts.filter(p=>p[0]<=tx+0.01), fut=pts.filter(p=>p[0]>=(past.length?past[past.length-1][0]:0));
  const X0=o.x0, right=tx>250;
  return `<svg viewBox="0 0 400 160" role="img" aria-label="${esc(o.aria)}">
    <path d="M${X0} 130 H380" style="stroke:var(--line2);stroke-width:1;fill:none"/>
    <path d="M${X0} 22 H380 M${X0} 76 H380" style="stroke:var(--line);stroke-width:1;fill:none"/>
    ${o.extra||''}
    ${past.length>1?`<path class="later" d="${d(past)} L${past[past.length-1][0].toFixed(1)} 130 L${past[0][0].toFixed(1)} 130 Z" style="fill:var(--paidSoft);stroke:none"/>
    <path class="draw" pathLength="1" d="${d(past)}" style="stroke:var(--paid);stroke-width:2.5;fill:none"/>`:''}
    ${fut.length>1?`<path class="later" d="${d(fut)}" style="stroke:var(--ink3);stroke-width:1.5;fill:none;stroke-dasharray:4 4"/>`:''}
    <path class="later" d="M${tx.toFixed(1)} 12 V130" style="stroke:var(--due);stroke-width:1;fill:none"/>
    <text class="later" x="${(right?tx-5:tx+5).toFixed(1)}" y="16" text-anchor="${right?'end':'start'}" style="fill:var(--due);font:700 8px var(--font-ui);letter-spacing:.14em">${esc(o.todayLbl)}</text>
    <circle class="pulse" cx="380" cy="130" r="5" style="fill:none;stroke:var(--paid);stroke-width:1.5"/>
    <circle cx="380" cy="130" r="4.5" style="fill:var(--paid);stroke:var(--bg);stroke-width:2"/>
    <text x="372" y="110" text-anchor="end" style="fill:var(--paid);font:700 8px var(--font-ui);letter-spacing:.14em">${esc(o.endLbl)}</text>
  </svg>`;
}
function addHtml(){
  const today=todayStr(), comps=loansOnly().map(l=>computeLoan(l,today)), active=comps.filter(c=>!c.closed);
  let svg, head='';
  if(active.length){
    const s=combinedSeries(comps,today), N=s.m1-s.m0||1, vmax=Math.max(...s.tot)*1.04||1;
    const X=m=>34+(m-s.m0)/N*346, Y=v=>22+(1-v/vmax)*108;
    const pts=s.tot.map((v,k)=>[X(s.m0+k),Y(v)]);
    const now=active.reduce((a,c)=>a+c.outstanding,0), end=active.reduce((m,c)=>c.closing>m?c.closing:m,'');
    const y0=Math.floor(s.m0/12)+1, y1=Math.floor(s.m1/12), span=y1-y0+1, step=Math.max(1,Math.ceil(span/5));
    let ticks='';
    for(let y=y0;y<=y1;y+=step){ const x=X(y*12); if(x>44&&x<366) ticks+=`<text x="${x.toFixed(1)}" y="146" text-anchor="middle" style="fill:var(--ink3);font:400 7.5px var(--font-num)">${y}</text>`; }
    const extra=`<text x="30" y="25" text-anchor="end" style="fill:var(--ink3);font:400 7.5px var(--font-num)">${short(vmax/1.04)}</text><text x="30" y="133" text-anchor="end" style="fill:var(--ink3);font:400 7.5px var(--font-num)">₹0</text>${ticks}`;
    svg=curveSvg(pts,X(s.tm),{x0:34,extra,aria:'Combined balance falling to debt-free',todayLbl:'TODAY · '+short(now),endLbl:'DEBT-FREE · '+fmy(end).toUpperCase()});
    head=`<div class="row" style="justify-content:space-between;gap:12px"><div class="sec">Combined balance</div><div class="mono" style="font-size:12px;color:var(--ink2)">${active.length} active</div></div>`;
  } else {
    // no data: illustrative amortising curve
    const n=60, q=1.009, Q=Math.pow(q,n), pts=[];
    for(let t=0;t<=n;t++){ const B=(Q-Math.pow(q,t))/(Q-1); pts.push([20+t/n*360,22+(1-B)*108]); }
    svg=curveSvg(pts,pts[22][0],{x0:20,extra:`<text x="20" y="148" style="fill:var(--ink3);font:400 8px var(--font-num)">₹0</text>`,aria:'Balance falling to debt-free',todayLbl:'TODAY',endLbl:'DEBT-FREE'});
  }
  const counts={}; loansOnly().forEach(l=>{ const t=loanType(l); if(t) counts[t]=(counts[t]||0)+1; });
  counts['Card EMI']=cardsOnly().map(l=>computeLoan(l,today)).filter(c=>!c.closed).length;
  return `<div class="top"><h1 class="disp" style="margin:0;font-size:30px">Portfolio</h1>${isWide()?'':PLUS}</div>
  <section class="hello stack" style="gap:12px">${head}${svg}</section>
  <section class="stack" style="gap:10px"><div class="sec">By type</div><div class="types">${TYPES.map(([nm,ic])=>{ const n=counts[nm]||0, card=nm==='Card EMI';
    return `<button class="type${n?' has':''}" data-act="${card?'addCard':'addType'}" data-name="${nm}"><span class="row"><svg viewBox="0 0 24 24" aria-hidden="true">${ic}</svg><span class="cnt" data-type="${nm}">${n}</span></span><span class="row"><span class="nm">${nm}</span><span class="pl">+</span></span></button>`; }).join('')}</div></section>
  <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn lg solid" data-act="add">Add loan</button><button class="btn lg" data-act="addCard">Add card EMI</button></div>`;
}

function detailHtml(c,today,wide){
  const S=state, l=c.l, id=esc(l.id), card=isCard(l);
  const back=card?`<button class="back" data-act="cards"><span class="chev"></span>Cards</button>`:!wide?`<button class="back" data-act="overview"><span class="chev"></span>Overview</button>`:'';
  let h=`<div class="top"><div>${back}</div><div class="row" style="gap:8px">`+
    (S.delConfirm?`<button class="btn" data-act="cancelDel">Cancel</button><button class="btn warnSolid" data-act="doDel" data-id="${id}">Confirm delete</button>`
      :`<button class="btn" data-act="edit" data-id="${id}">Edit</button><button class="btn warn" data-act="askDel">Delete</button>`)+`</div></div>`;
  const meta=[l.last4?'••'+esc(l.last4):null,l.rate===0?'No-cost':l.rate+'% p.a.',l.tenure+' months',money(l.emi)+' / month'].filter(Boolean).join('  ·  ');
  const tags=(card?'<span class="tag">Card EMI</span>':'')+(l.sample?'<span class="tag">Sample</span>':'')+(c.closed?'<span class="tag ok">Closed</span>':'')+(c.rebased?'<span class="tag">Re-based</span>':'');
  h+=`<header class="stack" style="gap:14px">${tags?`<div class="row" style="gap:8px;flex-wrap:wrap">${tags}</div>`:''}
    <div class="stack" style="gap:6px"><h1 class="disp" style="margin:0;font-size:34px">${esc(l.name)}</h1><div style="font-size:14px;color:var(--ink2)">${esc(l.lender)}</div><div class="mono" style="font-size:12px;color:var(--ink3);white-space:pre-wrap">${meta}</div></div>
    <div class="stack" style="gap:6px;padding-top:6px"><div class="sec">Principal outstanding</div><div class="hero" id="detOut">${inr2(c.outstanding)}</div></div>
    <div class="row" style="gap:12px"><div class="bar thick"><i style="width:${S.anim?(c.pct*100).toFixed(2):0}%"></i></div><div class="mono" style="font-size:12px;color:var(--paid)">${(c.pct*100).toFixed(1)}% repaid</div></div>
  </header>`;

  const nextSoon=c.next&&daysTo(today,c.next.date)<=7;
  const stats=[
    ['EMIs paid',String(c.paid)+(c.missedN?' · '+c.missedN+' missed':''),c.missedN?'var(--miss)':'var(--ink)','stPaid'],
    ['EMIs remaining',String(c.remaining),'var(--ink)','stRem'],
    ['Tenure left',c.closed?'—':ym(c.remaining),'var(--ink)','stLeft'],
    ['Principal paid',inr2(c.principalPaid),'var(--paid)','stPrin'],
    ['Interest paid',inr2(c.intPaid),'var(--ink)','stInt'],
    ['Next due',c.next?fd(c.next.date):'—',nextSoon?'var(--due)':'var(--ink)','stNext'],
    ['Closing date',fd(c.closing),'var(--ink)','stClose'],
    ['Total interest',inr2(c.totInt),'var(--ink)','stTot']
  ];
  if(c.finalEmi!=null) stats.push(['Final EMI',inr2(c.finalEmi),'var(--ink)','stFinal']);
  if(card&&l.gst&&l.rate>0){
    stats.push(['GST paid',inr2(c.intPaid*GST),'var(--ink)','stGstPaid'],['GST total',inr2(c.totInt*GST),'var(--ink)','stGstTot']);
    if(c.next) stats.push(['Next payable',inr2(c.next.emi+c.next.interest*GST),nextSoon?'var(--due)':'var(--ink)','stPayable']);
  }
  h+=`<section class="stats">${stats.map(([k,v,col,i])=>`<div><div class="lbl">${k}</div><div class="mono v" id="${i}" style="color:${col}">${v}</div></div>`).join('')}</section>`;

  h+=`<section class="stack" style="gap:12px"><div class="sec">Balance</div>${chartHtml(c,today,wide)}</section>`;

  h+=`<section class="stack" style="gap:12px"><div class="sec">${card?'Outstanding as per statement':'Outstanding as per lender'}</div>`+
    (l.lenderBal!=null?`<div class="rebase"><div class="mono" style="font-size:13px">${inr2(l.lenderBal)}  ·  as of ${fd(l.asOf)}</div><button class="btn" style="height:32px;padding:0 12px;font-size:10px;color:var(--ink2)" data-act="clearLender" data-id="${id}">Clear</button></div>`:'')+
    `<div class="lender">
      <label class="field"><span class="lbl">Balance ₹</span><input id="lbal" class="in mono" inputmode="decimal" autocomplete="off" value="${esc(S.lbal)}"></label>
      <label class="field"><span class="lbl">As of</span><input id="lasOf" type="date" class="in mono" value="${esc(S.lasOf)}"></label>
      <button class="btn lg solid" style="padding:0 16px;font-size:11px" data-act="saveLender" data-id="${id}">Save</button>
    </div><div class="errTxt" id="lerr" style="font-size:13px;font-weight:600">${esc(S.lerr||(c.rebaseErr?'EMI does not cover interest on lender balance':''))}</div></section>`;

  // schedule
  const curY=String(c.next?parseD(c.next.date).y:parseD(c.closing).y);
  const openYears=S.openYears[l.id]||{[curY]:true};
  const groups={}; c.rows.forEach(r=>{ const y=r.date.slice(0,4); (groups[y]=groups[y]||[]).push(r); });
  h+=`<section class="stack"><div class="sec" style="padding-bottom:12px">Schedule</div><div class="tblWrap"><div class="tbl">
    <div class="th"><span></span><span>Date</span><span>EMI</span><span>Principal</span><span>Interest</span><span>Balance</span></div>`+
    Object.keys(groups).sort().map(y=>{
      const g=groups[y], open=!!openYears[y], missN=g.filter(r=>r.missed).length;
      let s=`<button class="yr" data-act="year" data-id="${id}" data-y="${y}" aria-expanded="${open}"><span class="row" style="gap:12px"><span class="yrChev" style="transform:rotate(${open?45:-45}deg)"></span><span class="mono" style="font-size:14px;font-weight:700">${y}</span></span><span class="mono" style="font-size:11px;color:${missN?'var(--miss)':'var(--ink3)'}">${g.length} EMI${g.length>1?'s':''}${missN?' · '+missN+' missed':''} · ${inr(g[g.length-1].bal)}</span></button>`;
      if(open) s+=g.map(r=>{
        const past=r.date<=today, pend=S.pending===l.id+'|'+r.date, st=r.status;
        const col=st==='missed'?'var(--miss)':st==='paid'?'var(--ink3)':'var(--ink)';
        const bg=pend?'var(--surface2)':st==='next'?'var(--dueSoft)':st==='missed'?'var(--missSoft)':'transparent';
        let row=`<button class="tr mono" data-act="row" data-id="${id}" data-d="${r.date}" data-st="${st}"${past?'':' disabled'} style="color:${col};background:${bg}">
          <span class="mk">${st==='paid'?'<span class="tick"></span>':st==='next'?'<span class="dot"></span>':st==='missed'?'<span class="box"></span>':''}</span>
          <span>${fdm(r.date)}</span><span>${r.missed?'MISSED':nf2.format(r.emi)}</span><span>${r.missed?'—':nf2.format(r.principal)}</span><span>${nf2.format(r.interest)}</span><span>${nf2.format(r.bal)}</span></button>`;
        if(pend){ const cc=r.missed?'var(--paid)':'var(--miss)';
          row+=`<div class="confirm"><span style="font-size:12px;font-weight:600;color:${cc}">${r.missed?'Mark '+fd(r.date)+' as paid':'Mark '+fd(r.date)+' as missed'}</span><span class="row" style="gap:8px"><button class="btn" style="height:34px;padding:0 12px;font-size:10px" data-act="rowCancel">Cancel</button><button class="btn ${r.missed?'okSolid':'warnSolid'}" style="height:34px;padding:0 12px;font-size:10px" data-act="rowConfirm" data-id="${id}" data-d="${r.date}">${r.missed?'Mark paid':'Mark missed'}</button></span></div>`; }
        return row;
      }).join('');
      return s;
    }).join('')+`</div></div></section>`;
  return h;
}

function chartHtml(c,today,wide){
  const rows=c.rows, l=c.l; if(!rows.length) return '';
  const pts=[{t:T(dueDate(l.firstDate,-1)),v:rows[0].open}].concat(rows.map(r=>({t:T(r.date),v:r.bal})));
  const t0=pts[0].t, t1=pts[pts.length-1].t, vmax=Math.max(...pts.map(p=>p.v))*1.06||1, tt=T(today);
  const X=t=>(t-t0)/(t1-t0||1)*1000, Y=v=>1000-v/vmax*1000;
  const past=pts.filter(p=>p.t<=tt), fut=pts.filter(p=>p.t>=(past.length?past[past.length-1].t:t0));
  const line=a=>a.map((p,i)=>(i?'L':'M')+X(p.t).toFixed(1)+' '+Y(p.v).toFixed(1)).join(' ');
  const area=a=>a.length?line(a)+' L'+X(a[a.length-1].t).toFixed(1)+' 1000 L'+X(a[0].t).toFixed(1)+' 1000 Z':'';
  const gv=[0,pts[0].v/2,pts[0].v], ns='vector-effect="non-scaling-stroke"';
  let svg=`<svg class="chart" viewBox="0 0 1000 1000" preserveAspectRatio="none" role="img" aria-label="Remaining balance over time">
    <path d="${gv.map(v=>'M0 '+Y(v).toFixed(1)+' L1000 '+Y(v).toFixed(1)).join(' ')}" style="stroke:var(--line);stroke-width:1;fill:none" ${ns}/>
    ${fut.length?`<path d="${area(fut)}" style="fill:var(--track);opacity:.5;stroke:none"/>`:''}
    ${past.length?`<path d="${area(past)}" style="fill:var(--paidSoft);stroke:none"/>`:''}
    ${fut.length?`<path d="${line(fut)}" style="stroke:var(--ink3);stroke-width:1.5;fill:none;stroke-dasharray:4 4" ${ns}/>`:''}
    ${past.length?`<path d="${line(past)}" style="stroke:var(--paid);stroke-width:2;fill:none" ${ns}/>`:''}`;
  let extra='';
  if(tt>=t0&&tt<=t1){ svg+=`<path d="M${X(tt).toFixed(1)} 0 L${X(tt).toFixed(1)} 1000" style="stroke:var(--due);stroke-width:1;fill:none" ${ns}/>`; extra+=`<div class="ctoday" style="left:${(X(tt)/10).toFixed(2)}%">Today</div>`; }
  svg+='</svg>';
  extra+=gv.map(v=>`<div class="cy mono" style="top:${(Y(v)/10).toFixed(2)}%">${short(v)}</div>`).join('');
  const y0=new Date(t0).getUTCFullYear()+1, y1=new Date(t1).getUTCFullYear(), span=y1-y0+1, step=Math.max(1,Math.ceil(span/(wide?8:5)));
  for(let y=y0;y<=y1;y+=step){ const p=X(Date.UTC(y,0,1))/10; if(p>2&&p<98) extra+=`<div class="cx mono" style="left:${p.toFixed(2)}%">${y}</div>`; }
  extra+=rows.filter(r=>r.missed).map(r=>`<div class="cm" style="left:${(X(T(r.date))/10).toFixed(2)}%;top:${(Y(r.bal)/10).toFixed(2)}%"></div>`).join('');
  return `<div class="chartBox"><div class="chartIn">${svg}${extra}</div></div>`;
}

function fieldHtml(name,label,opts){
  const S=state, o=opts||{};
  return `<label class="field"><span class="lbl">${label}</span><input id="f_${name}" data-field="${name}" class="in${o.mono?' mono':''}"${o.type?` type="${o.type}"`:''}${o.im?` inputmode="${o.im}"`:''}${o.max?` maxlength="${o.max}"`:''} autocomplete="off" value="${esc(S.form[name])}"><span class="errTxt" id="e_${name}"></span>${name==='emi'?'<span class="flag mono" id="emiFlag"></span>':''}</label>`;
}
function formHtml(){
  const S=state, L=formLive(), card=S.form.kind==='card';
  return `<div class="top"><h1 class="disp" style="margin:0;font-size:30px">${card?(S.formId?'Edit card EMI':'Add card EMI'):(S.formId?'Edit loan':'Add loan')}</h1></div>
  <div class="stack" style="gap:28px">
    <fieldset><legend class="sec">${card?'Card':'Loan'}</legend>
      ${fieldHtml('name',card?'Purchase':'Name')}
      <div style="display:grid;grid-template-columns:minmax(0,1fr) 120px;gap:10px">${fieldHtml('lender',card?'Card':'Lender')}${fieldHtml('last4',card?'Card last 4':'A/c last 4',{mono:1,im:'numeric'})}</div>
    </fieldset>
    <fieldset><legend class="sec">Repayment</legend><div class="repay">
      ${fieldHtml('principal',card?'Amount ₹':'Principal ₹',{mono:1,im:'decimal'})}
      ${fieldHtml('rate',card?'Rate % p.a. · 0 no-cost':'Rate % p.a.',{mono:1,im:'decimal'})}
      ${fieldHtml('tenure','Tenure months',{mono:1,im:'numeric'})}
      ${fieldHtml('emi','EMI ₹',{mono:1,im:'decimal'})}
      ${fieldHtml('firstDate','First EMI date',{mono:1,type:'date'})}
    </div>${card?`<label class="row" style="gap:10px;cursor:pointer;font-size:13px;font-weight:600"><input type="checkbox" id="f_gst" data-field="gst"${S.form.gst!==false?' checked':''} style="width:18px;height:18px;accent-color:var(--paid)">GST 18% on interest</label>`:''}</fieldset>
    <div class="readout" id="readout">${readoutHtml(L.readout)}</div>
    <div class="row" style="gap:8px"><button class="btn lg solid" style="padding:0 22px" data-act="saveForm">Save</button><button class="btn lg" data-act="cancelForm">Cancel</button></div>
  </div>`;
}
function patchForm(){
  const L=formLive();
  Object.keys(L.fe).forEach(k=>{ const e=document.getElementById('e_'+k), i=document.getElementById('f_'+k); if(e) e.textContent=L.fe[k]; if(i) i.classList.toggle('err',!!L.fe[k]); });
  const fl=document.getElementById('emiFlag'); if(fl) fl.textContent=L.flag;
  const ro=document.getElementById('readout'); if(ro) ro.innerHTML=readoutHtml(L.readout);
}

function settingsHtml(){
  const S=state;
  return `<div class="top"><h1 class="disp" style="margin:0;font-size:30px">Settings</h1></div>
  <div class="set">
    <div class="setRow"><div class="sec" style="color:var(--ink2)">Demo data</div><div class="row" style="gap:12px">${S.demoMsg?`<span style="font-size:12px;color:var(--paid)">${S.demoMsg}</span>`:''}<button class="btn md" data-act="demo">Load demo</button></div></div>
    <div class="setCol"><div class="row" style="justify-content:space-between;gap:12px;flex-wrap:wrap"><div class="sec" style="color:var(--ink2)">Backup</div><div class="row" style="gap:12px">${S.backupMsg?`<span style="font-size:12px;color:${S.backupOk?'var(--paid)':'var(--due)'}">${S.backupMsg}</span>`:''}<button class="btn md" data-act="backup">Copy JSON</button></div></div>
      ${S.showBackup?`<textarea id="backupText" class="in" readonly rows="8">${esc(S.backupText)}</textarea>`:''}</div>
    <div class="setCol"><div class="sec" style="color:var(--ink2)">Restore</div>
      <textarea id="restoreText" class="in${S.restoreErr?' err':''}" rows="5" placeholder='{ "loans": [ … ] }'>${esc(S.restoreText)}</textarea>
      <div class="row" style="justify-content:space-between;gap:12px;flex-wrap:wrap"><span id="restoreMsg" style="font-size:12px;font-weight:600;color:${S.restoreErr?'var(--miss)':'var(--paid)'}">${esc(S.restoreErr||S.restoreOk)}</span><button class="btn md" data-act="restore">Restore</button></div></div>
    <div class="setRow"><div class="sec" style="color:var(--miss)">Clear all</div><div class="row" style="gap:8px">${S.clearConfirm?`<button class="btn md" data-act="cancelClear">Cancel</button><button class="btn md warnSolid" data-act="doClear">Confirm clear</button>`:`<button class="btn md warnLine" data-act="askClear">Clear all</button>`}</div></div>
  </div>`;
}

/* ---------- render + actions ---------- */
function render(){
  const root=document.getElementById('app');
  const pl=root.querySelector('.pane-l'), pr=root.querySelector('.pane-r');
  const keep={l:pl?pl.scrollTop:0,r:pr?pr.scrollTop:0,w:window.scrollY};
  const html=view();
  // one transition for every move: tabs, opening a loan or card, forms, back
  const key=viewKey(), from=lastRoute, to=state.route, changed=lastKey!==null&&key!==lastKey;
  const dir=(ORDER[to]??1)>=(ORDER[from]??1)?'fwd':'back';
  if(changed&&from!=='home'&&to!=='home') ghostOut(dir);
  root.innerHTML=html;
  applyTheme();
  const onHome=to==='home', shown=!ST.el.hidden&&!ST.el.classList.contains('leaving');
  if(onHome&&!shown) storyOpen(lastRoute!==null); else if(!onHome&&shown) storyClose();
  const a=root.querySelector('.pane-l'), b=root.querySelector('.pane-r'), rs=state.resetScroll;
  state.resetScroll=null;
  if(a) a.scrollTop=rs==='all'?0:keep.l;
  if(b) b.scrollTop=rs?0:keep.r;
  window.scrollTo(0,rs?0:keep.w);
  if(changed&&to!=='home') viewIn(from==='home'?'fwd':dir,from==='home');
  lastKey=key; lastRoute=to;
}
function commit(){ storeSave(); render(); }
function go(route){ Object.assign(state,{route,pending:null,delConfirm:false,clearConfirm:false,demoMsg:'',resetScroll:'all'}); render(); }
function openLoan(id){ Object.assign(state,{selId:id,route:isWide()?'overview':'detail',pending:null,delConfirm:false,lbalFor:null,resetScroll:isWide()?'right':'all'}); render(); }
function openCard(id){ Object.assign(state,{selCard:id,route:'cdetail',pending:null,delConfirm:false,lbalFor:null,resetScroll:isWide()?'right':'all'}); render(); }
function openForm(id,kind){
  const l=id&&state.loans.find(x=>x.id===id);
  state.form=l?{name:l.name,lender:l.lender,last4:l.last4||'',principal:String(l.principal),rate:String(l.rate),tenure:String(l.tenure),emi:String(l.emi),firstDate:l.firstDate,type:l.type||'',kind:l.kind||'',gst:l.gst!==false}:blankForm(kind);
  Object.assign(state,{formId:l?l.id:null,tried:false,route:'form',resetScroll:'right'}); render();
}
function updateLoan(id,fn){ state.loans=state.loans.map(l=>l.id===id?clean(fn({...l})):l); }
function saveForm(){
  const {e,v}=validate(state.form);
  if(Object.keys(e).length){ state.tried=true; patchForm(); const k=Object.keys(e)[0]; const i=document.getElementById('f_'+k); if(i) i.focus(); return; }
  const loans=state.loans.slice(); let id=state.formId;
  if(id){ const i=loans.findIndex(x=>x.id===id); const old=loans[i]; const nl={...old,...v}; if(old.firstDate!==v.firstDate) nl.missed=[]; delete nl.sample; loans[i]=clean(nl); }
  else { id='l'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); loans.push(clean({id,...v,missed:[]})); }
  if(v.kind==='card') Object.assign(state,{loans,selCard:id,route:'cdetail',tried:false,lbalFor:null,resetScroll:'all'});
  else Object.assign(state,{loans,selId:id,route:isWide()?'overview':'detail',tried:false,lbalFor:null,resetScroll:'all'});
  commit();
}
function saveLender(id){
  const l=state.loans.find(x=>x.id===id); if(!l) return;
  const B=num(state.lbal), d=state.lasOf, today=todayStr();
  let err='';
  if(!(B>0)) err='Balance must be a positive number';
  else if(!parseD(d)) err='Valid as-of date required';
  else if(d>today) err='As-of date cannot be in the future';
  else if(nForBalance(B,l.rate,l.emi)==null) err='EMI does not cover interest on this balance';
  state.lerr=err;
  if(!err) updateLoan(id,x=>{ x.lenderBal=r2(B); x.asOf=d; return x; });
  commit();
}
function backup(){
  const txt=JSON.stringify({app:'rinmukt',version:1,loans:state.loans},null,2);
  const fail=()=>{ Object.assign(state,{backupMsg:'Clipboard blocked · copy below',backupOk:false,showBackup:true,backupText:txt}); render(); const t=document.getElementById('backupText'); if(t){ t.focus(); t.select(); } };
  try{ navigator.clipboard.writeText(txt).then(()=>{ Object.assign(state,{backupMsg:'Copied',backupOk:true,showBackup:false,backupText:txt}); render(); },fail); }catch(e){ fail(); }
}
function restore(){
  let d; try{ d=JSON.parse(state.restoreText); }catch(e){ Object.assign(state,{restoreErr:'Invalid JSON',restoreOk:''}); return render(); }
  const arr=Array.isArray(d)?d:d&&d.loans;
  let err='';
  if(!Array.isArray(arr)) err='Missing loans array';
  else { const bad=arr.findIndex(l=>!validLoan(l)); if(bad>=0) err='Loan '+(bad+1)+' is invalid'; else if(new Set(arr.map(l=>l.id)).size!==arr.length) err='Duplicate loan ids'; }
  if(err){ Object.assign(state,{restoreErr:err,restoreOk:''}); return render(); }
  Object.assign(state,{loans:arr.map(clean),restoreErr:'',restoreOk:(()=>{ const c=arr.filter(l=>l.kind==='card').length, n=arr.length-c; return 'Restored · '+n+(n===1?' loan':' loans')+' · '+c+(c===1?' card EMI':' card EMIs'); })(),restoreText:'',selId:null,lbalFor:null,openYears:{}});
  commit();
}

document.addEventListener('click',ev=>{
  const b=ev.target.closest('[data-act]'); if(!b||b.disabled) return;
  const S=state, id=b.dataset.id, act=b.dataset.act;
  switch(act){
    case 'overview': return go('overview');
    case 'settings': return go('settings');
    case 'add': return openForm(null,'');
    case 'addCard': openForm(null,'card'); { const i=document.getElementById('f_name'); if(i) i.focus(); } return;
    case 'addType': openForm(null,''); S.form.name=b.dataset.name; S.form.type=b.dataset.name; render(); { const i=document.getElementById('f_lender'); if(i) i.focus(); } return;
    case 'home': return go('home');
    case 'portfolio': return go('portfolio');
    case 'cards': return go('cards');
    case 'demo': S.loans=S.loans.filter(l=>!l.sample).concat(DEMO.map(clean)); Object.assign(S,{demoMsg:'Loaded',selId:null,selCard:null,lbalFor:null}); return commit();
    case 'open': return openLoan(id);
    case 'openCard': return openCard(id);
    case 'edit': return openForm(id);
    case 'askDel': S.delConfirm=true; return render();
    case 'cancelDel': S.delConfirm=false; return render();
    case 'doDel': { const wasCard=S.loans.some(x=>x.id===id&&isCard(x)); S.loans=S.loans.filter(x=>x.id!==id); Object.assign(S,{selId:wasCard?S.selId:null,selCard:null,delConfirm:false,route:wasCard?'cards':'overview',lbalFor:null,resetScroll:'all'}); return commit(); }
    case 'year': { const l=S.loans.find(x=>x.id===id); const c=computeLoan(l,todayStr()); const curY=String(c.next?parseD(c.next.date).y:parseD(c.closing).y); const cur=S.openYears[id]||{[curY]:true}; S.openYears={...S.openYears,[id]:{...cur,[b.dataset.y]:!cur[b.dataset.y]}}; return render(); }
    case 'row': { const k=id+'|'+b.dataset.d; S.pending=S.pending===k?null:k; return render(); }
    case 'rowCancel': S.pending=null; return render();
    case 'rowConfirm': updateLoan(id,l=>{ const m=new Set(l.missed||[]); const d=b.dataset.d; m.has(d)?m.delete(d):m.add(d); l.missed=[...m].sort(); return l; }); S.pending=null; return commit();
    case 'saveLender': return saveLender(id);
    case 'clearLender': updateLoan(id,x=>{ delete x.lenderBal; delete x.asOf; return x; }); Object.assign(S,{lerr:'',lbal:'',lasOf:todayStr()}); return commit();
    case 'saveForm': return saveForm();
    case 'cancelForm': { const card=S.form.kind==='card'; return go(S.formId?(card?'cdetail':(isWide()?'overview':'detail')):(card?'cards':'portfolio')); }
    case 'backup': return backup();
    case 'restore': return restore();
    case 'askClear': S.clearConfirm=true; return render();
    case 'cancelClear': S.clearConfirm=false; return render();
    case 'doClear': Object.assign(S,{loans:[],selId:null,selCard:null,clearConfirm:false,restoreOk:'',restoreErr:'',lbalFor:null,openYears:{}}); return commit();
  }
});
document.addEventListener('input',ev=>{
  const t=ev.target, S=state;
  if(t.dataset&&t.dataset.field){ let v=t.type==='checkbox'?t.checked:t.value; if(t.dataset.field==='last4'){ v=v.replace(/\D/g,'').slice(0,4); if(v!==t.value) t.value=v; } S.form[t.dataset.field]=v; patchForm(); return; }
  if(t.id==='lbal'||t.id==='lasOf'){ S[t.id]=t.value; S.lerr=''; const e=document.getElementById('lerr'); if(e) e.textContent=''; return; }
  if(t.id==='restoreText'){ Object.assign(S,{restoreText:t.value,restoreErr:'',restoreOk:''}); t.classList.remove('err'); const m=document.getElementById('restoreMsg'); if(m) m.textContent=''; }
});
document.addEventListener('focusin',ev=>{ if(ev.target.id==='backupText') ev.target.select(); });
window.addEventListener('resize',()=>{ const was=isWide(); state.w=window.innerWidth||state.w; if(was!==isWide()) render(); });

/* ---------- story ---------- */
const ST={el:document.getElementById('story'),i:1,n:5,timer:null,raf:null,dur:[0,4800,4200,4600,4600,6500],since:0};
const NUMW=['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve'];
const numW=n=>NUMW[n]||String(n);
const FAR='9999-12-31';
function shortName(l,max){ const t=loanType(l); if(t&&max<=12) return t.replace(' loan',''); const n=l.name; return n.length>max?n.slice(0,max-1)+'…':n; }
const plural=(n,w)=>numW(n)+' '+w+(n===1?'':'s')+'.';

// passbook window for one loan around the highlighted EMI (mDate); real=true when that EMI is actually marked missed
function sheetFor(c,today,mDate,real){
  const l=c.l, rows=c.rows;
  let idx=rows.findIndex(r=>r.date===mDate); if(idx<0) idx=0;
  let end=Math.min(rows.length,Math.max(idx+2,8)), start=Math.max(0,end-8); end=Math.min(rows.length,start+8);
  const win=rows.slice(start,end);
  const withMiss=real?l.missed.filter(d=>d!==mDate):l.missed.concat([mDate]);
  const alt=computeLoan({...l,missed:withMiss},FAR).closing, cur=computeLoan(l,FAR).closing;
  return {
    title:shortName(l,16)+' · '+win[win.length-1].date.slice(0,4),
    rows:win.map(r=>({date:fdm(r.date),emi:nf2.format(r.emi),bal:nf2.format(r.bal),m:r.date===mDate,ms:r.missed,up:r.date>today})),
    a:fmy(real?alt:cur), b:fmy(real?cur:alt), paid:c.paid, since:fmy(l.firstDate)
  };
}
function storyModel(){
  const today=todayStr(), act=loansOnly().map(l=>computeLoan(l,today)).filter(c=>!c.closed);
  if(!act.length){
    // sample story
    const car=computeLoan(DEMO[1],'2026-10-22');
    return { live:false, h1a:'Five loans.', h1b:'Five apps.', d1:'5 logins · 5 due dates',
      cards:[['Personal loan','₹9,893','02 NOV'],['Home loan','₹39,052','05 NOV'],['Car loan','₹16,685','10 NOV'],['Education loan','₹7,420','15 NOV'],['Gold loan','₹4,210','20 NOV']],
      total:'₹52,18,400', monthly:'₹77,260', count:'5',
      sheet:sheetFor(car,'2026-10-22','2026-09-10',false),
      lanes:[['Personal',0,22,0.62],['Car',0,44,0.45],['Education',0,70,0.3],['Home',0,100,0.18]], todayPos:12 };
  }
  act.sort((a,b)=>a.next.date<b.next.date?-1:a.next.date>b.next.date?1:0);
  const n=act.length, lenders=new Set(act.map(c=>c.l.lender.trim().toLowerCase())).size;
  // passbook: a loan with a real missed EMI first, otherwise the longest-running loan as a preview
  const missedL=act.filter(c=>c.missedN>0).map(c=>({c,d:c.l.missed.filter(d=>d<=today).sort().pop()})).filter(x=>x.d).sort((a,b)=>a.d<b.d?1:-1);
  let sheet;
  if(missedL.length) sheet=sheetFor(missedL[0].c,today,missedL[0].d,true);
  else { const c=act.slice().sort((a,b)=>b.paid-a.paid||(a.l.firstDate<b.l.firstDate?-1:1))[0]; const past=c.rows.filter(r=>r.date<=today&&!r.missed); sheet=sheetFor(c,today,(past.length?past[past.length-1]:c.rows[0]).date,false); }
  // runway: up to five loans that finish last, on one time axis
  const ln=act.slice().sort((a,b)=>a.closing<b.closing?1:-1).slice(0,5).reverse();
  const t0=Math.min(...ln.map(c=>T(c.l.firstDate))), t1=Math.max(...ln.map(c=>T(c.closing))), tT=T(today), span=(t1-t0)||1;
  const lanes=ln.map(c=>{ const s=T(c.l.firstDate), e=T(c.closing); return [shortName(c.l,12),(s-t0)/span*100,(e-s)/span*100,Math.max(0,Math.min(1,(tT-s)/((e-s)||1)))]; });
  return { live:true, h1a:plural(n,'loan'), h1b:plural(lenders,'app'), d1:lenders+(lenders===1?' login':' logins')+' · '+n+(n===1?' due date':' due dates'),
    cards:act.slice(0,5).map(c=>[shortName(c.l,18),money(c.l.emi),fdm(c.next.date).toUpperCase()]),
    total:inr(act.reduce((a,c)=>a+c.outstanding,0)), monthly:inr(act.reduce((a,c)=>a+c.l.emi,0)), count:String(n),
    sheet, lanes, todayPos:Math.max(0,Math.min(100,(tT-t0)/span*100)) };
}
function storyBuild(){
  const M=storyModel(); ST.model=M;
  document.getElementById('stH1a').textContent=M.h1a;
  document.getElementById('stH1b').textContent=M.h1b;
  document.getElementById('stD1').textContent=M.d1;
  // cards: fill the centre slot first
  const slots=['c3','c1','c4','c2','c5'];
  slots.forEach((cl,k)=>{ const el=ST.el.querySelector('.sc.'+cl), cd=M.cards[k];
    el.classList.toggle('off',!cd);
    el.querySelector('.sc-in').innerHTML=cd?`<div class="sc-t">${esc(cd[0])}<b></b></div><div class="sc-a">${esc(cd[1])}</div><div class="sc-d">DUE ${esc(cd[2])}</div>`:''; });
  document.getElementById('stTotal').textContent=M.total;
  document.getElementById('stMonthly').textContent=M.monthly;
  document.getElementById('stLoans').textContent=M.count;
  const S=M.sheet;
  document.getElementById('stSince').textContent='since '+S.since;
  document.getElementById('stD4').innerHTML=`Closing · ${esc(S.a)} → <span style="color:var(--s-ember)">${esc(S.b)}</span>`;
  document.getElementById('stSheet').innerHTML=`<div class="sh-h"><span>${esc(S.title)}</span><span class="row" style="gap:8px"><span>Closing</span><span class="flip mono"><span class="a">${esc(S.a)}</span><span class="b">${esc(S.b)}</span></span></span></div>`+
    S.rows.map((r,k)=>`<div class="rw${r.m?' m':''}${r.ms?' ms':''}${r.up&&!r.ms?' up':''}" style="--r:${k}"><span class="tk"></span><span>${r.date}</span><span class="emi"><span class="y">${r.emi}</span><span class="x">MISSED</span></span><span>${r.bal}</span></div>`).join('');
  const n=M.lanes.length, gap=300/n, w=Math.min(34,gap-12);
  document.getElementById('stFloor').innerHTML=M.lanes.map(([nm,b,h,f],k)=>`<div class="lane" style="left:${(20+k*gap+(gap-w)/2).toFixed(1)}px;width:${w.toFixed(1)}px;bottom:${(b*0.92).toFixed(2)}%;height:${Math.max(3,h*0.92).toFixed(2)}%"><i style="height:${(f*100).toFixed(1)}%"></i><u>${esc(nm)}</u></div>`).join('')+
    `<div class="today" style="bottom:${(M.todayPos*0.92).toFixed(2)}%"></div><div class="finish"><u>Debt-free</u></div>`;
}
function storyFree(){
  const today=todayStr();
  let act=loansOnly().map(l=>computeLoan(l,today)).filter(c=>!c.closed);
  if(!act.length) act=DEMO.filter(l=>!isCard(l)).map(l=>computeLoan(l,today)).filter(c=>!c.closed);
  if(!act.length) return 'Debt-free · today';
  const end=act.reduce((m,c)=>c.closing>m?c.closing:m,''), a=parseD(today), b=parseD(end);
  const months=(b.y-a.y)*12+(b.m-a.m);
  return 'Debt-free · '+fmy(end)+(months>0?' · in '+ym(months):'');
}
function storyFit(){ const s=ST.el.querySelector('.st-stage').getBoundingClientRect(); const k=Math.max(0.55,Math.min(s.width/500,s.height/420,1.35)); document.getElementById('stScale').style.setProperty('--k',k.toFixed(3)); }
function storyCount(){
  cancelAnimationFrame(ST.raf); const el=document.getElementById('stCount'), target=ST.model?ST.model.sheet.paid:0, t0=performance.now()+500;
  el.textContent='0';
  const step=t=>{ const p=Math.max(0,Math.min(1,(t-t0)/1400)); el.textContent=String(Math.round(target*(1-Math.pow(1-p,3)))); if(p<1) ST.raf=requestAnimationFrame(step); };
  ST.raf=requestAnimationFrame(step);
}
function storyGo(i){
  if(i>ST.n) i=1; if(i<1) i=ST.n; ST.i=i; clearTimeout(ST.timer); ST.since=performance.now();
  ST.el.dataset.scene=String(i);
  ST.el.querySelectorAll('.st-sc').forEach(s=>s.classList.toggle('on',+s.dataset.s===i));
  // the whole app takes this slide's glow, so leaving Home keeps the look you left on
  state.deck=DECKS[i-1]; applyTheme();
  if(i===3) storyCount();
  if(i===5) document.getElementById('stFree').textContent=storyFree();
  ST.timer=setTimeout(()=>storyGo(i+1),ST.dur[i]);
}
function storyOpen(animate){
  clearTimeout(ST.closeT); clearTimeout(ST.enterT);
  ST.el.hidden=false; ST.el.classList.remove('leaving'); document.documentElement.classList.add('storyOn');
  if(animate&&!reduceMotion()){ ST.el.classList.remove('entering'); void ST.el.offsetWidth; ST.el.classList.add('entering'); ST.enterT=setTimeout(()=>ST.el.classList.remove('entering'),760); }
  storyBuild(); storyFit(); storyGo(1);
}
function storyClose(){
  clearTimeout(ST.timer); cancelAnimationFrame(ST.raf); clearTimeout(ST.closeT);
  ST.el.classList.add('leaving'); document.documentElement.classList.remove('storyOn');
  ST.closeT=setTimeout(()=>{ ST.el.hidden=true; },700);
}
ST.el.addEventListener('click',ev=>{
  ev.stopPropagation();
  const b=ev.target.closest('[data-sact]');
  if(b&&b.dataset.sact==='next') return storyGo(ST.i+1);
  const x=ev.clientX/window.innerWidth; storyGo(x<0.3?ST.i-1:ST.i+1);
});
document.addEventListener('keydown',ev=>{
  if(state.route!=='home'||ST.el.hidden) return;
  if(ev.target&&/^(INPUT|TEXTAREA|BUTTON)$/.test(ev.target.tagName)&&ev.key!=='ArrowRight'&&ev.key!=='ArrowLeft') return;
  if(ev.key==='ArrowRight'||ev.key===' '){ ev.preventDefault(); storyGo(ST.i+1); }
  else if(ev.key==='ArrowLeft'){ ev.preventDefault(); storyGo(ST.i-1); }
});
const storyLive=()=>state.route==='home'&&!ST.el.hidden&&!ST.el.classList.contains('leaving');
document.addEventListener('visibilitychange',()=>{ if(!document.hidden&&storyLive()) storyGo(ST.i); });
// backup ticker: keeps slides moving even if a timer was throttled or dropped
setInterval(()=>{ if(storyLive()&&!document.hidden&&performance.now()-ST.since>ST.dur[ST.i]+800) storyGo(ST.i+1); },1000);
window.addEventListener('resize',()=>{ if(!ST.el.hidden) storyFit(); });

applyTheme();
render();
if(state.loans.length) requestAnimationFrame(()=>requestAnimationFrame(()=>{ state.anim=true; render(); }));
else state.anim=true;
