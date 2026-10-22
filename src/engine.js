/* Rinmukt engine: pure schedule maths and formatting. No DOM access.
   Loaded as a classic script in the browser (globals) and as a CommonJS module by the tests. */
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const r2=x=>Math.round((x+(x>=0?1e-9:-1e-9))*100)/100;
const pad=n=>String(n).padStart(2,'0');
const ymd=(y,m,d)=>y+'-'+pad(m+1)+'-'+pad(d);
function parseD(s){ if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null; const [y,m,d]=s.split('-').map(Number); const dt=new Date(y,m-1,d); if(dt.getFullYear()!==y||dt.getMonth()!==m-1||dt.getDate()!==d) return null; return {y,m:m-1,d}; }
const dim=(y,m)=>new Date(y,m+1,0).getDate();
function dueDate(first,k){ const f=parseD(first); let m=f.m+k; const y=f.y+Math.floor(m/12); m=((m%12)+12)%12; return ymd(y,m,Math.min(f.d,dim(y,m))); }
function todayStr(){ const t=new Date(); return ymd(t.getFullYear(),t.getMonth(),t.getDate()); }
const T=s=>{ const p=parseD(s); return Date.UTC(p.y,p.m,p.d); };
const daysTo=(a,b)=>Math.round((T(b)-T(a))/864e5);
function stdEmi(P,ann,n){ const r=ann/1200; if(r===0) return P/n; const q=Math.pow(1+r,n); return P*r*q/(q-1); }
function nForBalance(B,ann,emi){ const r=ann/1200; if(r===0) return emi>0?Math.ceil(B/emi-1e-9):null; if(emi<=B*r) return null; return Math.ceil(-Math.log(1-B*r/emi)/Math.log(1+r)); }

const nf0=new Intl.NumberFormat('en-IN',{maximumFractionDigits:0});
const nf2=new Intl.NumberFormat('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const inr=x=>'₹'+nf0.format(Math.round(x));
const inr2=x=>'₹'+nf2.format(r2(x));
const money=x=>Math.abs(r2(x)-Math.round(x))<0.005?inr(x):inr2(x);
function short(x){ if(x>=1e7) return '₹'+(x/1e7).toFixed(2).replace(/\.?0+$/,'')+' Cr'; if(x>=1e5) return '₹'+(x/1e5).toFixed(1).replace(/\.0$/,'')+' L'; return inr(x); }
function fd(s){ const p=parseD(s); return p?pad(p.d)+' '+MON[p.m]+' '+p.y:'—'; }
function fdm(s){ const p=parseD(s); return pad(p.d)+' '+MON[p.m]; }
function fmy(s){ const p=parseD(s); return p?MON[p.m]+' '+p.y:'—'; }
function ym(n){ const y=Math.floor(n/12), m=n%12; if(n<=0) return '0 m'; return ((y?y+' y ':'')+(m||!y?m+' m':'')).trim(); }
function rel(days){ if(days===0) return 'today'; if(days===1) return 'tomorrow'; return 'in '+days+' days'; }
function num(s){ if(s==null) return NaN; const t=String(s).replace(/[,\s₹]/g,''); if(t==='') return NaN; return Number(t); }

function buildSchedule(l,today){
  const r=l.rate/1200, emi=l.emi, missed=new Set(l.missed||[]);
  const rb=(l.lenderBal>0&&parseD(l.asOf))?{B:l.lenderBal,asOf:l.asOf}:null;
  let bal=l.principal, limit=l.tenure, k=0, rebased=false, rebaseErr=false;
  const rows=[];
  while(k<1500){
    const date=dueDate(l.firstDate,k);
    if(rb&&!rebased&&!rebaseErr&&date>rb.asOf){
      const n=nForBalance(rb.B,l.rate,emi);
      if(n==null) rebaseErr=true; else { rebased=true; bal=rb.B; limit=k+n; }
    }
    if(bal<=0.004) break;
    const open=bal, interest=r2(open*r);
    if(date<=today&&missed.has(date)){
      bal=r2(open+interest);
      rows.push({k,date,open,emi:0,principal:0,interest,bal,missed:true});
      limit++; k++; continue;
    }
    let pay=emi, prin=r2(emi-interest);
    const last=k>=limit-1||r2(open+interest)<=emi;
    if(last){ prin=open; pay=r2(open+interest); }
    bal=r2(open-prin);
    rows.push({k,date,open,emi:pay,principal:prin,interest,bal,missed:false});
    if(last) break;
    k++;
  }
  return {rows,rebased,rebaseErr};
}

function computeLoan(l,today){
  const s=buildSchedule(l,today), rows=s.rows;
  let next=null, paid=0, intPaid=0, totInt=0, remaining=0;
  rows.forEach(rw=>{
    totInt+=rw.interest;
    if(rw.missed) rw.status='missed';
    else if(rw.date<=today){ rw.status='paid'; paid++; intPaid+=rw.interest; }
    else { remaining++; if(!next){ next=rw; rw.status='next'; } else rw.status='upcoming'; }
  });
  const outstanding=next?next.open:0;
  const principalPaid=Math.max(0,r2(l.principal-outstanding));
  const pct=Math.max(0,Math.min(1,principalPaid/l.principal));
  const last=rows[rows.length-1];
  const finalEmi=last&&!last.missed&&Math.abs(last.emi-l.emi)>0.005?last.emi:null;
  return {l,rows,next,closed:!next,outstanding,paid,remaining,intPaid:r2(intPaid),totInt:r2(totInt),principalPaid,pct,closing:last?last.date:l.firstDate,finalEmi,rebased:s.rebased,rebaseErr:s.rebaseErr,missedN:rows.filter(x=>x.missed).length};
}

function validLoan(l){
  if(!l||typeof l!=='object') return false;
  if(typeof l.id!=='string'||!l.id) return false;
  if(l.kind!=null&&l.kind!=='card') return false;
  if(typeof l.name!=='string'||!l.name.trim()||typeof l.lender!=='string'||!l.lender.trim()) return false;
  for(const k of ['principal','emi','tenure']) if(typeof l[k]!=='number'||!(l[k]>0)||!isFinite(l[k])) return false;
  // card EMIs may be no-cost (0%); loans need a positive rate
  if(typeof l.rate!=='number'||!isFinite(l.rate)||!(l.kind==='card'?l.rate>=0:l.rate>0)) return false;
  if(!Number.isInteger(l.tenure)||l.tenure>1200||l.rate>=100) return false;
  if(!parseD(l.firstDate)) return false;
  if(l.missed!=null&&(!Array.isArray(l.missed)||l.missed.some(d=>!parseD(d)))) return false;
  if(l.last4!=null&&l.last4!==''&&!/^\d{4}$/.test(l.last4)) return false;
  if(l.lenderBal!=null&&(typeof l.lenderBal!=='number'||!(l.lenderBal>0)||!parseD(l.asOf))) return false;
  return true;
}
function clean(l){ const o={id:l.id,name:l.name.trim(),lender:l.lender.trim(),principal:l.principal,rate:l.rate,tenure:l.tenure,emi:l.emi,firstDate:l.firstDate,last4:l.last4||'',missed:(l.missed||[]).slice()}; if(l.sample) o.sample=true; if(typeof l.type==='string'&&l.type) o.type=l.type; if(l.kind==='card'){ o.kind='card'; o.gst=l.gst!==false; } if(l.lenderBal!=null){ o.lenderBal=l.lenderBal; o.asOf=l.asOf; } return o; }
const GST=0.18;
const isCard=l=>l.kind==='card';

const DEMO=[
  {id:'demo-home',sample:true,name:'Home loan',lender:'Sample Bank',principal:4500000,rate:8.5,tenure:240,emi:39052,firstDate:'2023-03-05',last4:'',missed:[]},
  {id:'demo-car',sample:true,name:'Car loan',lender:'Sample Auto Finance',principal:800000,rate:9.2,tenure:60,emi:16685,firstDate:'2024-08-10',last4:'',missed:[]},
  {id:'demo-personal',sample:true,name:'Personal loan',lender:'Sample Finance',principal:300000,rate:11.5,tenure:36,emi:9893,firstDate:'2025-01-02',last4:'',missed:[]},
  {id:'demo-card-phone',kind:'card',gst:true,sample:true,name:'Phone',lender:'Sample Card',last4:'4821',principal:79900,rate:0,tenure:12,emi:6658.33,firstDate:'2026-04-15',missed:[]},
  {id:'demo-card-laptop',kind:'card',gst:true,sample:true,name:'Laptop',lender:'Sample Card',last4:'4821',principal:120000,rate:15,tenure:9,emi:14180.47,firstDate:'2026-07-15',missed:[]},
  {id:'demo-card-tv',kind:'card',gst:true,sample:true,name:'Television',lender:'Sample Rewards Card',last4:'1093',principal:45000,rate:14,tenure:6,emi:7809.21,firstDate:'2026-02-20',missed:[]}
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MON, r2, parseD, dueDate, todayStr, T, daysTo, stdEmi, nForBalance,
    inr, inr2, money, short, fd, fdm, fmy, ym, rel, num, buildSchedule, computeLoan,
    validLoan, clean, DEMO, GST, isCard };
}
