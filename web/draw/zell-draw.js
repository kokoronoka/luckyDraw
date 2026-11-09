/* ZÉLL-V Golden Ticket live draw engine.
   Needs three.js r128 (window.THREE) loaded first.
   Usage: ZellDrawMount(containerElement, {
     data: 'url-or-object', lang:'en'|'zh', mode:'results'|'host', demo:true,
     assets:{ticketFace, ticketCard, logoEn, logoZh}, guideUrl, poll:0, auto:false, sound:true,
     onePerCustomer:true, demoSets:[{label, data}] })
*/
(function(){
'use strict';
const CSS=`
.zd{--ink:#4a3a1c;--soft:#7a6740;--gold:#c9a04f;--gold-d:#9c7429;--gold-dd:#6e521c;--ivory:#fbf7ee;
  --serif:'Playfair Display',Georgia,serif;--sans:'Montserrat',system-ui,sans-serif;
  position:relative;overflow:hidden;width:100%;height:100%;background:#f6efe1;color:var(--ink);font-family:var(--sans);user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
.zd.zh{--serif:'Noto Serif SC',serif}
.zd *{box-sizing:border-box;margin:0;padding:0}
.zd canvas.zd-gl{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
.zd canvas.zd-fx{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:6}
.zd-logo{position:absolute;z-index:4;pointer-events:none;filter:drop-shadow(0 2px 6px rgba(150,110,40,.18))}
.zd-sign{position:absolute;z-index:4;left:50%;transform:translateX(-50%);text-align:center;pointer-events:none;white-space:nowrap;
  padding:.5em 2em .55em;border-radius:6px;background:linear-gradient(#fffdf8,#f7f0e0);
  box-shadow:0 0 0 1px #d8b768,0 0 0 5px #fffaf0,0 0 0 6px #c9a04f,0 14px 34px rgba(120,86,24,.18)}
.zd-signT{font-family:var(--serif);font-style:italic;font-weight:700;line-height:1.05;letter-spacing:.01em;
  background:linear-gradient(180deg,#d9b25e 0%,#a97d2c 60%,#7f5c1c 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.zh .zd-signT{font-style:normal;font-weight:900}
.zd-signS{font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--soft);margin-top:.45em;font-size:.78em}
.zh .zd-signS{letter-spacing:.08em}
.zd-cnt{position:absolute;z-index:4;pointer-events:none}
.zd-cnt b{display:block;font-family:'Playfair Display',Georgia,serif;font-weight:700;color:var(--gold-dd);font-variant-numeric:lining-nums tabular-nums;line-height:1;margin-bottom:6px}
.zd-cnt span{font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--soft);font-size:10.5px}
.zd-panel{background:rgba(255,253,248,.78);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-radius:4px;box-shadow:0 0 0 1px rgba(201,160,79,.35),0 18px 40px rgba(120,86,24,.10)}
.zd-feed{position:absolute;z-index:4;pointer-events:none;padding:14px 16px 8px}
.zd-feed h4{font-weight:700;font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold-d);margin-bottom:6px;display:flex;align-items:center;gap:8px}
.zd-feed h4 i{width:6px;height:6px;border-radius:50%;background:#d8363c;animation:zdp 1.2s infinite}
@keyframes zdp{50%{opacity:.25}}
.zd-row{display:flex;align-items:center;gap:12px;padding:8px 0;border-top:1px solid rgba(201,160,79,.25);white-space:nowrap;animation:zdin .45s cubic-bezier(.2,.8,.2,1)}
.zd-row:first-of-type{border-top:0}
@keyframes zdin{from{opacity:0;transform:translateY(-6px)}}
.zd-ini{flex:none;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-family:'Playfair Display',serif;font-weight:700;font-size:15px;color:#5b4416;
  background:radial-gradient(circle at 35% 30%,#fffbea,#efd897 60%,#c89a45);box-shadow:0 0 0 1px rgba(122,90,28,.35)}
.zd-nm{flex:none;min-width:5.6em;font-family:'Playfair Display',Georgia,serif;font-weight:700;font-size:15px;letter-spacing:.06em;color:#5b4416}
.zd-w .zd-nm{font-size:13.5px}
.zd-ph{font-weight:700;letter-spacing:.14em;color:var(--ink);font-variant-numeric:tabular-nums;font-size:13px}
.zd-row.me{background:linear-gradient(90deg,rgba(243,223,166,.6),rgba(243,223,166,0))}
.zd-board{position:absolute;z-index:5;display:flex;flex-direction:column;overflow:hidden}
.zd-board header{padding:16px 18px 12px;border-bottom:1px solid rgba(201,160,79,.3)}
.zd-board h3{font-family:var(--serif);font-style:italic;font-weight:700;font-size:20px;color:var(--gold-dd)}
.zh .zd-board h3{font-style:normal;font-weight:900}
.zd-board header p{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--soft);font-weight:600;margin-top:3px}
.zd-list{overflow:auto;padding:6px 12px 14px;flex:1;scrollbar-width:thin}
.zd-grp h5{cursor:pointer;display:flex;justify-content:space-between;gap:8px;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold-d);font-weight:700;padding:10px 6px 6px;border-bottom:1px solid transparent}
.zd-grp.cur h5{color:var(--gold-dd);border-bottom-color:var(--gold)}
.zd-grp h5 em{font-style:normal;color:var(--soft);font-variant-numeric:tabular-nums;white-space:nowrap}
.zd-w{display:flex;align-items:center;gap:10px;padding:6px;font-variant-numeric:tabular-nums;animation:zdin .4s}
.zd-w .zd-ini{width:24px;height:24px;font-size:13px}
.zd-w .zd-ph{font-size:12.5px}
.zd-w.fresh{background:linear-gradient(90deg,rgba(243,223,166,.55),rgba(243,223,166,0))}
.zd-ctr{position:absolute;z-index:5;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:10px;width:min(96%,760px)}
.zd-btns{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
.zd-btn{border:0;cursor:pointer;font:700 13px var(--sans);letter-spacing:.18em;text-transform:uppercase;color:#43310d;padding:16px 34px;border-radius:2px;position:relative;overflow:hidden;
  background:linear-gradient(180deg,#f6e4b0 0%,#dfbb68 50%,#c39443 100%);
  box-shadow:inset 0 1px 0 rgba(255,250,230,.9),inset 0 0 0 1px rgba(150,108,36,.6),0 12px 28px rgba(140,100,30,.28);transition:transform .15s,filter .2s}
.zd-btn::after{content:"";position:absolute;inset:0;background:linear-gradient(105deg,transparent 38%,rgba(255,255,255,.6) 50%,transparent 62%);transform:translateX(-120%);animation:zdsh 3.6s infinite}
@keyframes zdsh{60%,100%{transform:translateX(120%)}}
.zd-btn:hover{filter:brightness(1.04)} .zd-btn:active{transform:translateY(1px)}
.zd-btn:focus-visible{outline:2px solid #8a6420;outline-offset:3px}
.zd-btn:disabled{filter:saturate(.4) opacity(.55);cursor:default}.zd-btn:disabled::after{display:none}
.zd-btn.ghost{background:rgba(255,253,248,.85);color:var(--gold-dd);box-shadow:inset 0 0 0 1px rgba(170,128,52,.7);font-size:11px;padding:13px 18px}
.zd-btn.ghost::after{display:none}
.zd-hint{font-size:11px;font-weight:600;letter-spacing:.12em;color:var(--soft);text-align:center;min-height:1.2em;text-transform:uppercase}
.zd-veil{position:absolute;inset:0;z-index:4;pointer-events:none;opacity:0;transition:opacity .7s;background:radial-gradient(ellipse at 50% 50%,rgba(255,246,222,.1),rgba(70,50,16,.5))}
.zd-veil.on{opacity:1}
.zd-cw{position:absolute;inset:0;z-index:5;display:grid;place-items:center;pointer-events:none}
.zd-card{position:relative;opacity:0;width:var(--cw);aspect-ratio:2.4/1;pointer-events:none;cursor:pointer;background-size:100% 100%;transition:opacity .18s;filter:drop-shadow(0 24px 40px rgba(90,60,14,.35))}
.zd-card.show{opacity:1;pointer-events:auto}
.zd-card .glow{position:absolute;inset:-18%;background:radial-gradient(ellipse,rgba(255,228,150,.7),rgba(255,228,150,0) 62%);opacity:0;transition:opacity .6s;z-index:-1}
.zd-card.lit .glow{opacity:1}
.zd-card .shine{position:absolute;inset:0;background:linear-gradient(105deg,transparent 30%,rgba(255,255,255,.75) 48%,transparent 62%);transform:translateX(-130%);mix-blend-mode:soft-light;-webkit-mask:var(--mask) center/100% 100%;mask:var(--mask) center/100% 100%}
.zd-card.lit .shine{animation:zdcs 1.5s .05s ease-out}
@keyframes zdcs{to{transform:translateX(130%)}}
.zd-cin{position:absolute;left:6%;top:11%;bottom:11%;width:64%;display:flex;flex-direction:column;justify-content:center;color:#45320c}
.zd-cey{font-size:calc(var(--cw)*.022);font-weight:800;letter-spacing:.28em;text-transform:uppercase;color:#6f511a;display:flex;align-items:center;gap:.7em;text-shadow:0 1px 0 rgba(255,246,214,.7)}
.zd-cey::before,.zd-cey::after{content:"";height:1px;flex:1;background:linear-gradient(90deg,rgba(111,81,26,0),rgba(111,81,26,.55),rgba(111,81,26,0))}
.zh .zd-cey{letter-spacing:.14em}
.zd-cname{font-family:'Playfair Display',Georgia,serif;font-weight:700;font-size:calc(var(--cw)*.082);letter-spacing:.06em;line-height:1;text-align:center;margin-top:calc(var(--cw)*.03);white-space:nowrap;text-shadow:0 1px 0 rgba(255,246,214,.75),0 -1px 0 rgba(90,60,14,.2)}
.zd-cname .m,.zd-cph .m{color:#8a6a2c}
.zd-cdraw{font-size:calc(var(--cw)*.02);font-weight:800;letter-spacing:.26em;text-transform:uppercase;color:#6f511a;text-align:center;margin-top:calc(var(--cw)*.03);text-shadow:0 1px 0 rgba(255,246,214,.7)}
.zh .zd-cdraw{letter-spacing:.12em}
.zd-cstub{position:absolute;left:78.6%;right:3.6%;top:13%;bottom:13%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:calc(var(--cw)*.012);text-align:center;color:#45320c}
.zd-cpl{font-size:calc(var(--cw)*.015);font-weight:800;letter-spacing:.26em;text-transform:uppercase;color:#6f511a}
.zh .zd-cpl{letter-spacing:.12em}
.zd-cini{flex:none;width:calc(var(--cw)*.135);height:calc(var(--cw)*.135);border-radius:50%;display:grid;place-items:center;font-family:'Playfair Display',serif;font-weight:700;font-size:calc(var(--cw)*.078);color:#4a360f;
  background:radial-gradient(circle at 34% 28%,#fffdf2,#f3e0a8 55%,#c99c48);box-shadow:0 0 0 calc(var(--cw)*.003) rgba(110,80,24,.55),0 calc(var(--cw)*.006) calc(var(--cw)*.014) rgba(90,60,14,.3),inset 0 2px 3px rgba(255,255,255,.9)}
.zd-cph{font-size:calc(var(--cw)*.05);font-weight:800;letter-spacing:.14em;white-space:nowrap;text-align:center;margin-top:calc(var(--cw)*.018);font-variant-numeric:tabular-nums;text-shadow:0 1px 0 rgba(255,246,214,.75),0 -1px 0 rgba(90,60,14,.2)}
.zd-cph .m{color:#8a6a2c}
.zd-cprize{font-family:var(--serif);font-style:italic;font-weight:700;font-size:var(--pf,calc(var(--cw)*.026));color:#4d3810;line-height:1.22;text-align:center;text-shadow:0 1px 0 rgba(255,246,214,.7);overflow-wrap:break-word;max-width:100%}
.zh .zd-cprize{font-style:normal}
.zd-cnext{position:absolute;left:50%;top:calc(100% + var(--cw)*.05);transform:translateX(-50%);font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#fff8e6;white-space:nowrap;opacity:0;transition:opacity .4s;text-shadow:0 1px 8px rgba(70,46,8,.7)}
.zd-card.lit .zd-cnext{opacity:1}
.zd-ban{position:absolute;z-index:6;left:50%;transform:translateX(-50%) translateY(10px);opacity:0;pointer-events:none;text-align:center;transition:all .6s cubic-bezier(.2,.9,.3,1.2);white-space:nowrap}
.zd-ban.on{opacity:1;transform:translateX(-50%)}
.zd-ban b{display:block;font-family:var(--serif);font-style:italic;font-weight:700;color:#fff7df;text-shadow:0 2px 0 rgba(160,116,40,.9),0 8px 34px rgba(90,60,10,.6)}
.zh .zd-ban b{font-style:normal;font-weight:900}
.zd-ban span{font-weight:700;letter-spacing:.36em;text-transform:uppercase;color:#fff3cf;text-shadow:0 1px 8px rgba(80,54,10,.8)}
.zd-find{position:absolute;z-index:5}
.zd-fbox{display:flex;gap:6px;align-items:center;padding:6px 6px 6px 14px}
.zd-fbox label{font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--gold-d);white-space:nowrap}
.zd-fbox input::placeholder{letter-spacing:.04em;font-weight:600;font-size:12px;color:#a8956a}
.zd-fbox input{border:0;outline:0;background:transparent;font:700 15px var(--sans);letter-spacing:.3em;width:5.2em;padding:6px 4px;color:var(--ink);border-bottom:1px solid rgba(170,128,52,.5)}
.zd-fbox input:focus-visible{border-bottom-color:var(--gold-dd)}
.zd-fbox .zd-btn{padding:10px 14px;font-size:10.5px}
.zd-fout{margin-top:8px;font-size:12px;font-weight:600;color:var(--soft);max-width:300px;line-height:1.5}
.zd-fout b{color:var(--gold-dd)}
.zd-demo{position:absolute;z-index:7;top:10px;right:10px;display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.zd-demo>button,.zd-dp select,.zd-dp a,.zd-dp button{font:600 11px var(--sans);letter-spacing:.04em;color:var(--soft);background:rgba(255,253,248,.95);border:0;border-radius:3px;padding:6px 10px;box-shadow:inset 0 0 0 1px rgba(201,160,79,.5);text-decoration:none;cursor:pointer}
.zd-dp{display:none;flex-direction:column;align-items:flex-end;gap:6px;padding:10px;border-radius:4px;background:rgba(255,253,248,.97);box-shadow:0 0 0 1px rgba(201,160,79,.45),0 12px 30px rgba(140,100,30,.18)}
.zd-demo.open .zd-dp{display:flex}
.zd-load{position:absolute;inset:0;z-index:9;display:grid;place-items:center;background:#f6efe1;font:600 12px var(--sans);letter-spacing:.24em;text-transform:uppercase;color:var(--gold-d);transition:opacity .8s}
.zd-load.gone{opacity:0;pointer-events:none}
.zd-err{display:none;position:absolute;z-index:10;left:50%;top:50%;transform:translate(-50%,-50%);max-width:420px;padding:20px;border-radius:4px;background:#fff;box-shadow:0 0 0 1px #e3c98d;font-size:14px;line-height:1.5}
.zd-bbtn,.zd-fbtn{display:none}
.zd.narrow .zd-board{display:none}.zd.narrow .zd-board.open{display:flex}
.zd.narrow .zd-bbtn,.zd.narrow .zd-fbtn{display:inline-block}
.zd.narrow .zd-find{display:none}.zd.narrow .zd-find.open{display:block}
.zd.narrow .zd-btn{font-size:12px;padding:14px 24px}
.zd.narrow .zd-btn.ghost{font-size:10px;padding:10px 12px;letter-spacing:.12em}
.zd.narrow .zd-btns{gap:6px}
.zd.narrow .zd-demo>button{font-size:10px;padding:5px 8px}
@media (prefers-reduced-motion:reduce){.zd-btn::after{animation:none}}
`;
const HTML=`
<canvas class="zd-gl" aria-label="Golden Ticket draw drum. Drag around the drum or turn the crank to spin it."></canvas>
<img class="zd-logo" alt="ZÉLL-V Golden Ticket">
<div class="zd-sign"><div class="zd-signT"></div><div class="zd-signS"></div></div>
<div class="zd-cnt"><b>0</b><span></span></div>
<div class="zd-feed zd-panel"><h4><i></i><span class="zd-feedL"></span></h4><div class="zd-rows"></div></div>
<div class="zd-veil"></div>
<div class="zd-cw"><div class="zd-card" role="dialog" aria-live="polite">
  <div class="glow"></div>
  <div class="zd-cin">
    <div class="zd-cey"></div>
    <div class="zd-cname"></div>
    <div class="zd-cph"></div>
    <div class="zd-cdraw"></div>
  </div>
  <div class="zd-cstub"><small class="zd-cpl"></small><div class="zd-cprize"></div></div>
  <div class="shine"></div>
  <div class="zd-cnext"></div>
</div></div>
<div class="zd-ban"><span></span><b></b></div>
<aside class="zd-board zd-panel"><header><h3></h3><p></p></header><div class="zd-list"></div></aside>
<div class="zd-find"><div class="zd-fbox zd-panel"><label for="zd-fin">Phone</label><input id="zd-fin" inputmode="numeric" maxlength="4" autocomplete="off"><button class="zd-btn ghost zd-fgo"></button></div><div class="zd-fout"></div></div>
<div class="zd-ctr"><div class="zd-btns">
  <button class="zd-btn zd-draw" disabled></button>
  <button class="zd-btn ghost zd-all"></button>
  <button class="zd-btn ghost zd-bbtn"></button>
  <button class="zd-btn ghost zd-fbtn"></button>
  <button class="zd-btn ghost zd-dl" hidden></button>
</div><div class="zd-hint"></div></div>
<div class="zd-demo"></div>
<canvas class="zd-fx"></canvas>
<div class="zd-load">Loading tickets…</div>
<div class="zd-err"></div>`;
const T={
 en:{inDrum:'Golden Tickets in the drum',going:'Tickets going in',winners:'Winners',draw:'Draw',drawN:(p,i,n)=>`Draw ${p} · ${i} of ${n}`,drawOf:(i,n)=>`Draw ${i} of ${n}`,prize:'Prize',
   all:'Draw all',allFast:'Reveal the rest',spin:'Spin the drum',done:'All winners revealed',
   hintCrank:'Press Draw to pick a winner. Turn the crank any time for fun',hintWait:d=>`Winners revealed live on ${d}`,
   winner:'Winner',grandWinner:'Grand Prize Winner',congrats:'Congratulations',tap:'Tap to continue',
   find:'Find my tickets',my:'My tickets',last4:'Last 4 digits',phone:'Phone',
   found:(n,d)=>`You have <b>${n}</b> Golden Ticket${n>1?'s':''} in this draw. They are glowing in the drum.${d}`,
   none:'No tickets in this draw end with those digits.',won:p=>` <b>One of them won ${p}!</b>`,
   dl:'Download results',loading:'Loading tickets…',loadErr:'Could not load the draw data.'},
 zh:{inDrum:'张黄金券已入箱',going:'黄金券入箱中',winners:'得奖名单',draw:'抽奖',drawN:(p,i,n)=>`抽出 ${p} · 第 ${i} / ${n} 位`,drawOf:(i,n)=>`第 ${i} / ${n} 位`,prize:'奖品',
   all:'全部抽出',allFast:'揭晓其余得主',spin:'转动抽奖箱',done:'得主已全部揭晓',
   hintCrank:'按抽奖选出得主，也可随时转动摇柄',hintWait:d=>`得奖名单将于 ${d} 直播揭晓`,
   winner:'得主',grandWinner:'终极大奖得主',congrats:'恭喜',tap:'点击继续',
   find:'查找我的黄金券',my:'我的黄金券',last4:'末4位',phone:'手机',
   found:(n,d)=>`您在本轮共有 <b>${n}</b> 张黄金券，正在抽奖箱里闪闪发光。${d}`,
   none:'本轮没有以这4位数字结尾的黄金券。',won:p=>` <b>其中一张抽中了 ${p}！</b>`,
   dl:'下载结果',loading:'黄金券加载中…',loadErr:'无法加载抽奖数据。'}
};
const rnd=(a,b)=>a+Math.random()*(b-a), clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ease3=t=>1-Math.pow(1-t,3), easeIO=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const wait=ms=>new Promise(r=>setTimeout(r,ms));

// Phone masking: first digit, then *, then the last 4 digits. The website should receive
// numbers already masked like this (do it on the server); this is a fallback for previews.
function maskPhone(raw){
  let d=String(raw||'').replace(/\D/g,'');
  if(d.startsWith('60')&&d.length>=11) d='0'+d.slice(2);
  else if(d.startsWith('65')&&d.length===10) d=d.slice(2);
  if(d.length<6) return '*'.repeat(Math.max(0,d.length-1))+d.slice(-1);
  return d[0]+'*'.repeat(d.length-5)+d.slice(-4);
}

// Name masking: the first letter of each word, then **. "Max Teh" becomes "M** T**".
function maskName(raw){
  const words=String(raw||'').trim().split(/\s+/).filter(Boolean);
  if(!words.length) return '***';
  return words.slice(0,3).map(w=>w[0].toUpperCase()+'**').join(' ');
}
window.ZellDrawMount=function(root,opts){
const THREE=window.THREE;
const CFG=Object.assign({lang:'en',mode:'results',demo:false,poll:0,auto:false,sound:true,onePerCustomer:true,single:false,locked:'',pick:null,onDrawn:null,onError:null,assets:{},demoSets:null,guideUrl:''},opts||{});
let L=T[CFG.lang]||T.en;
root.classList.add('zd');
if(!document.getElementById('zd-css')){const st=document.createElement('style');st.id='zd-css';st.textContent=CSS;document.head.appendChild(st);}
root.innerHTML=HTML;
const q=s=>root.querySelector(s);
const glc=q('.zd-gl'),fxc=q('.zd-fx'),fx=fxc.getContext('2d');
const fmt=n=>n.toLocaleString(CFG.lang==='zh'?'zh-CN':'en-US');
const txt=v=>v==null?'':(typeof v==='string'?v:(v[CFG.lang]||v.en||''));

/* ---------- data ---------- */
let DATA=null,ENTRIES=[],BYID=new Map(),PRIZES=[],WON=new Map(),WONC=new Set(),QUEUE={},prizeIdx=0,HL=new Set();
function normEntry(e,i){
  let n=e.n||e.nameMasked||'';
  if(!n&&e.name) n=maskName(e.name);
  else if(n&&!n.includes('*')) n=n.length<=2?n.split('').map(c=>c.toUpperCase()+'**').join(' '):maskName(n);
  return {t:String(e.t||e.ticket||e.ticketNo||e.id||('T'+(i+1))),n:n||'***',
          p:e.p||e.phoneMasked||maskPhone(e.phone),c:e.c||e.customer||e.customerId||null};
}
function ingest(json,keep){
  DATA=json;ENTRIES=(json.entries||[]).map(normEntry);BYID=new Map(ENTRIES.map(e=>[e.t,e]));
  PRIZES=(json.prizes||[]).slice().sort((a,b)=>(b.rank||0)-(a.rank||0));
  if(!keep){WON=new Map();WONC=new Set();prizeIdx=0;HL=new Set();}
  if(json&&Object.prototype.hasOwnProperty.call(json,'locked')) CFG.locked=json.locked||'';
  QUEUE={};const W=json.winners||{};
  for(const p of PRIZES) QUEUE[p.id]=(W[p.id]||[]).map(w=>typeof w==='string'?BYID.get(w)||{t:w,n:'?',p:'****'}:normEntry(w,0));
  for(const raw of (json.revealed||[])){
    const e=normEntry(raw,0);const pid=raw.prize||raw.prizeId||(PRIZES[0]&&PRIZES[0].id);
    if(!e.t||WON.has(e.t))continue;
    WON.set(e.t,{...e,prize:pid,at:raw.at||''});if(e.c)WONC.add(e.c);
  }
}
const hasResults=()=>PRIZES.some(p=>QUEUE[p.id]&&QUEUE[p.id].length);
const wonIn=p=>[...WON.values()].filter(w=>w.prize===p.id);
const available=p=>!p?0:(CFG.mode==='results'?(QUEUE[p.id]||[]).length:p.count);
async function nextWinner(p){
  if(typeof CFG.pick==='function'){
    const raw=await CFG.pick(p);
    if(!raw)return null;
    const e=normEntry(raw,0);
    if(e.t&&!BYID.has(e.t)){ENTRIES.push(e);BYID.set(e.t,e);}
    return e;
  }
  if(CFG.mode==='results') return (QUEUE[p.id]||[])[wonIn(p).length]||null;
  const pool=ENTRIES.filter(e=>!WON.has(e.t)&&!(CFG.onePerCustomer&&e.c&&WONC.has(e.c)));
  if(!pool.length) return null;
  const a=new Uint32Array(1),lim=Math.floor(4294967296/pool.length)*pool.length;let r;
  do{crypto.getRandomValues(a);r=a[0];}while(r>=lim);
  return pool[r%pool.length];
}
async function loadData(src){
  if(src&&typeof src==='object') return src;
  const r=await fetch(src,{cache:'no-store'});if(!r.ok) throw new Error(r.status);return r.json();
}

/* ---------- three.js scene ---------- */
const LOW=CFG.quality==='low';
const renderer=new THREE.WebGLRenderer({canvas:glc,antialias:!LOW,powerPreference:'high-performance'});
renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
renderer.shadowMap.enabled=!LOW;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();
const IVORY=new THREE.Color('#f6efe1');scene.background=IVORY.clone().convertSRGBToLinear();
scene.fog=new THREE.Fog(scene.background.getHex(),16,34);
const camera=new THREE.PerspectiveCamera(30,1,0.1,100);
const col=h=>new THREE.Color(h).convertSRGBToLinear();
// studio environment for metal and glass reflections
(function(){
  const pm=new THREE.PMREMGenerator(renderer),env=new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(30,30,30),new THREE.MeshBasicMaterial({color:col('#7c6a4e'),side:THREE.BackSide})));
  const panel=(w,h,x,y,z,ry,rx,k,c)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:col(c||'#fff6e6').multiplyScalar(k),side:THREE.DoubleSide}));m.position.set(x,y,z);m.rotation.set(rx||0,ry||0,0);env.add(m);};
  panel(16,6,0,12,0,0,Math.PI/2,5);
  panel(8,10,-13,4,4,Math.PI/2,0,3.2);
  panel(6,10,13,3,-2,-Math.PI/2,0,2.2,'#ffe7c0');
  panel(14,4,0,2,14,Math.PI,0,2.6);
  panel(20,3,0,-6,0,0,-Math.PI/2,.9,'#e8d4a8');
  scene.environment=pm.fromScene(env,0.035).texture;pm.dispose();
})();
// materials
const M={
  gold:new THREE.MeshStandardMaterial({color:col('#e9c47a'),metalness:1,roughness:.2}),
  goldSatin:new THREE.MeshStandardMaterial({color:col('#e2bd72'),metalness:1,roughness:.38}),
  goldDeep:new THREE.MeshStandardMaterial({color:col('#c9a05a'),metalness:1,roughness:.3}),
  ivory:new THREE.MeshPhysicalMaterial({color:col('#fbf6ec'),roughness:.32,clearcoat:.7,clearcoatRoughness:.2}),
  ivory2:new THREE.MeshPhysicalMaterial({color:col('#f1e6cf'),roughness:.4,clearcoat:.4}),
  glass:new THREE.MeshPhysicalMaterial({color:col('#ffffff'),metalness:0,roughness:.03,transparent:true,opacity:.13,clearcoat:1,clearcoatRoughness:0,envMapIntensity:2.2,depthWrite:false,side:THREE.DoubleSide}),
  funnelIn:new THREE.MeshStandardMaterial({color:col('#6a4e1c'),metalness:.9,roughness:.5,side:THREE.BackSide}),
};
// harlequin wall texture
function wallTex(){
  const w=512,h=744,c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');
  g.fillStyle='#fbf6ec';g.fillRect(0,0,w,h);
  const dia=(cx,cy,fill)=>{g.beginPath();g.moveTo(cx,cy-h/2);g.lineTo(cx+w/2,cy);g.lineTo(cx,cy+h/2);g.lineTo(cx-w/2,cy);g.closePath();
    const gr=g.createLinearGradient(cx-w/2,cy-h/2,cx+w/2,cy+h/2);gr.addColorStop(0,fill[0]);gr.addColorStop(1,fill[1]);g.fillStyle=gr;g.fill();};
  const gold=['#e8cd96','#cfab68'];
  dia(w/2,h/2,gold);for(const [x,y] of [[0,0],[w,0],[0,h],[w,h]]) dia(x,y,gold);
  g.strokeStyle='rgba(176,138,66,.55)';g.lineWidth=3;
  for(const [x,y] of [[w/2,h/2],[0,0],[w,0],[0,h],[w,h]]){g.beginPath();g.moveTo(x,y-h/2);g.lineTo(x+w/2,y);g.lineTo(x,y+h/2);g.lineTo(x-w/2,y);g.closePath();g.stroke();}
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.encoding=THREE.sRGBEncoding;t.anisotropy=8;
  const m=document.createElement('canvas');m.width=w;m.height=h;const k=m.getContext('2d');k.fillStyle='#000';k.fillRect(0,0,w,h);k.fillStyle='#777';
  const md=(cx,cy)=>{k.beginPath();k.moveTo(cx,cy-h/2);k.lineTo(cx+w/2,cy);k.lineTo(cx,cy+h/2);k.lineTo(cx-w/2,cy);k.closePath();k.fill();};
  md(w/2,h/2);for(const [x,y] of [[0,0],[w,0],[0,h],[w,h]]) md(x,y);
  const mt=new THREE.CanvasTexture(m);mt.wrapS=mt.wrapT=THREE.RepeatWrapping;
  return [t,mt];
}
const [wt,wm]=wallTex();
const WALLW=44,WALLH=26;wt.repeat.set(WALLW/1.05,WALLH/1.52);wm.repeat.copy(wt.repeat);
const wall=new THREE.Mesh(new THREE.PlaneGeometry(WALLW,WALLH),new THREE.MeshStandardMaterial({map:wt,metalnessMap:wm,metalness:.55,roughness:.42}));
wall.position.set(0,6,-3.2);wall.receiveShadow=true;scene.add(wall);
// floor
const FLOOR=-1.4;
const floor=new THREE.Mesh(new THREE.PlaneGeometry(60,30),new THREE.MeshPhysicalMaterial({color:col('#f4ead6'),roughness:.28,clearcoat:.5}));
floor.rotation.x=-Math.PI/2;floor.position.set(0,FLOOR,8);floor.receiveShadow=true;scene.add(floor);
// skirting where wall meets floor
const skirt=new THREE.Mesh(new THREE.BoxGeometry(WALLW,.18,.08),M.goldSatin);skirt.position.set(0,FLOOR+.09,-3.15);scene.add(skirt);
// platform
function cyl(r,h,mat,y,seg=96){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,seg),mat);m.position.y=y;m.castShadow=true;m.receiveShadow=true;scene.add(m);return m;}
function torus(r,tube,mat,y,x=0,z=0,rx=Math.PI/2){const m=new THREE.Mesh(new THREE.TorusGeometry(r,tube,16,160),mat);m.position.set(x,y,z);m.rotation.x=rx;m.castShadow=true;scene.add(m);return m;}
cyl(2.4,.2,M.ivory2,FLOOR+.1);torus(2.4,.022,M.gold,FLOOR+.2);torus(2.4,.022,M.gold,FLOOR+.01);
cyl(1.95,.2,M.ivory,FLOOR+.3);torus(1.95,.024,M.gold,FLOOR+.4);
const TOP=FLOOR+.4;
// arch with bulbs, behind the drum
const ARCH_A=2.6,ARCH_Y=1.05,ARCH_Z=-1.25;
const archCurve=new (class extends THREE.Curve{getPoint(t,o=new THREE.Vector3()){
  const sl=ARCH_Y-FLOOR,al=Math.PI*ARCH_A,tot=sl*2+al,s=t*tot;
  if(s<sl) return o.set(-ARCH_A,FLOOR+s,ARCH_Z);
  if(s<sl+al){const a=Math.PI-(s-sl)/ARCH_A;return o.set(Math.cos(a)*ARCH_A,ARCH_Y+Math.sin(a)*ARCH_A,ARCH_Z);}
  return o.set(ARCH_A,ARCH_Y-(s-sl-al),ARCH_Z);}})();
const archMesh=new THREE.Mesh(new THREE.TubeGeometry(archCurve,240,.2,24,false),M.goldSatin);archMesh.scale.z=.45;archMesh.position.z=ARCH_Z*.55;archMesh.castShadow=true;archMesh.receiveShadow=true;scene.add(archMesh);
for(const off of [-.2,.2]){const c2=new (class extends THREE.Curve{getPoint(t,o=new THREE.Vector3()){archCurve.getPoint(t,o);const n=Math.hypot(o.x,o.y-ARCH_Y);
  if(o.y>ARCH_Y){o.x+=o.x/ARCH_A*off;o.y+=(o.y-ARCH_Y)/ARCH_A*off;}else o.x+=Math.sign(o.x)*off;o.z=ARCH_Z+.09;return o;}})();
  const m=new THREE.Mesh(new THREE.TubeGeometry(c2,240,.035,12,false),M.ivory);m.castShadow=true;scene.add(m);}
const NB=Math.round((archCurve.getLength())/.19);
const bulbGeo=new THREE.SphereGeometry(.055,16,12);
const bulbs=new THREE.InstancedMesh(bulbGeo,new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false}),NB+1);
const bulbPos=[];const tmpM=new THREE.Matrix4();
for(let i=0;i<=NB;i++){const p=archCurve.getPoint(i/NB);p.z=ARCH_Z+.1;bulbPos.push(p.clone());tmpM.makeTranslation(p.x,p.y,p.z);bulbs.setMatrixAt(i,tmpM);bulbs.setColorAt(i,new THREE.Color(1,.9,.7));}
scene.add(bulbs);
function glowTex(){const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');const gr=g.createRadialGradient(64,64,0,64,64,64);
  gr.addColorStop(0,'rgba(255,240,200,1)');gr.addColorStop(.25,'rgba(255,214,140,.55)');gr.addColorStop(1,'rgba(255,200,120,0)');g.fillStyle=gr;g.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);}
const GT=glowTex();
const glows=bulbPos.map(p=>{const s=new THREE.Sprite(new THREE.SpriteMaterial({map:GT,color:0xffffff,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:.8}));s.position.copy(p);s.position.z+=.03;s.scale.set(.24,.24,1);scene.add(s);return s;});
// the drum
const DRUM=new THREE.Vector3(0,.62,0),DZ=.44;
const drum=new THREE.Group();drum.position.copy(DRUM);scene.add(drum);
const ring=(r,tube,z,mat)=>{const m=new THREE.Mesh(new THREE.TorusGeometry(r,tube,24,180),mat);m.position.z=z;m.castShadow=true;drum.add(m);return m;};
ring(1,.07,DZ,M.gold);ring(1,.07,-DZ,M.gold);ring(1.06,.018,DZ+.05,M.goldSatin);ring(1.06,.018,-DZ-.05,M.goldSatin);
ring(.5,.016,DZ,M.goldSatin);ring(.5,.016,-DZ,M.goldSatin);
const band=new THREE.Mesh(new THREE.CylinderGeometry(1,1,DZ*2,96,1,true),M.glass);band.rotation.x=Math.PI/2;drum.add(band);
for(const z of [DZ,-DZ]){const d=new THREE.Mesh(new THREE.CircleGeometry(.98,96),M.glass);d.position.z=z;drum.add(d);}
for(let i=0;i<8;i++){const a=i*Math.PI/4;for(const z of [DZ,-DZ]){const s=new THREE.Mesh(new THREE.CylinderGeometry(.016,.016,.96,10),M.gold);s.position.set(Math.cos(a)*.48,Math.sin(a)*.48,z);s.rotation.z=a-Math.PI/2;s.castShadow=true;drum.add(s);}}
for(let i=0;i<12;i++){const a=i*Math.PI/6;const s=new THREE.Mesh(new THREE.CylinderGeometry(.022,.022,DZ*2,10),M.goldSatin);s.rotation.x=Math.PI/2;s.position.set(Math.cos(a),Math.sin(a),0);s.castShadow=true;drum.add(s);}
const studG=new THREE.SphereGeometry(.024,12,8);
for(let i=0;i<24;i++){const a=i*Math.PI/12;const s=new THREE.Mesh(studG,M.gold);s.position.set(Math.cos(a)*1,Math.sin(a)*1,DZ+.07);drum.add(s);}
const hub=new THREE.Mesh(new THREE.CylinderGeometry(.11,.13,.12,40),M.gold);hub.rotation.x=Math.PI/2;hub.position.z=DZ+.05;drum.add(hub);
const hubC=new THREE.Mesh(new THREE.SphereGeometry(.07,24,16),M.goldSatin);hubC.position.z=DZ+.12;drum.add(hubC);
const hubB=hub.clone();hubB.position.z=-DZ-.05;drum.add(hubB);
// axle and A-frame stand (does not rotate)
function rod(a,b,r,mat){const v=new THREE.Vector3().subVectors(b,a),len=v.length(),m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,len,16),mat);m.position.copy(a).addScaledVector(v,.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());m.castShadow=true;scene.add(m);return m;}
for(const z of [DZ+.2,-DZ-.2]){
  const top=new THREE.Vector3(0,DRUM.y,z);
  rod(top,new THREE.Vector3(-.78,TOP+.04,z),.042,M.gold);rod(top,new THREE.Vector3(.78,TOP+.04,z),.042,M.gold);
  rod(new THREE.Vector3(-.5,TOP+.55,z),new THREE.Vector3(.5,TOP+.55,z),.025,M.goldSatin);
  for(const x of [-.78,.78]){const f=new THREE.Mesh(new THREE.CylinderGeometry(.08,.1,.05,24),M.gold);f.position.set(x,TOP+.03,z);f.castShadow=true;scene.add(f);}
}
rod(new THREE.Vector3(0,DRUM.y,DZ+.24),new THREE.Vector3(0,DRUM.y,-DZ-.24),.03,M.goldSatin);
// crank on the right
const CRANK=new THREE.Vector3(1.32,DRUM.y,.22);
rod(new THREE.Vector3(1.02,DRUM.y,.22),CRANK,.03,M.goldSatin);
rod(new THREE.Vector3(1.32,DRUM.y,.22),new THREE.Vector3(1.32,TOP+.04,.22),.03,M.gold);
const crank=new THREE.Group();crank.position.copy(CRANK);crank.position.z+=.05;scene.add(crank);
const cw=new THREE.Mesh(new THREE.TorusGeometry(.2,.02,12,60),M.gold);crank.add(cw);
const carm=new THREE.Mesh(new THREE.BoxGeometry(.24,.035,.03),M.gold);carm.position.x=.12;crank.add(carm);
const knob=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.18,16),M.ivory);knob.rotation.x=Math.PI/2;knob.position.set(.24,0,.1);crank.add(knob);
const hubk=new THREE.Mesh(new THREE.SphereGeometry(.045,16,12),M.gold);crank.add(hubk);
// chute on top
const CHUTE=new THREE.Vector3(0,DRUM.y+1.32,0);
const fpts=[new THREE.Vector2(.1,-.22),new THREE.Vector2(.12,-.05),new THREE.Vector2(.36,.2),new THREE.Vector2(.4,.24)];
const fun=new THREE.Mesh(new THREE.LatheGeometry(fpts,64),M.gold);fun.position.copy(CHUTE);fun.castShadow=true;scene.add(fun);
const funIn=new THREE.Mesh(new THREE.LatheGeometry(fpts,64),M.funnelIn);funIn.position.copy(CHUTE);funIn.scale.set(.96,1,.96);scene.add(funIn);
const lip=new THREE.Mesh(new THREE.TorusGeometry(.4,.018,12,90),M.goldSatin);lip.rotation.x=Math.PI/2;lip.position.set(0,CHUTE.y+.24,0);scene.add(lip);
rod(new THREE.Vector3(0,CHUTE.y-.22,0),new THREE.Vector3(0,DRUM.y+1.02,0),.1,M.gold);
// lights
scene.add(new THREE.HemisphereLight(col('#fff8ec'),col('#cdb487'),.55));
const key=new THREE.DirectionalLight(col('#fff2dc'),1.25);key.position.set(-3.5,7,6.5);key.castShadow=true;
key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-5,right:5,top:5,bottom:-3,near:1,far:22});key.shadow.bias=-.0004;key.shadow.radius=3;scene.add(key);
const fill=new THREE.DirectionalLight(col('#ffe9c8'),.35);fill.position.set(5,2,6);scene.add(fill);
const warm=new THREE.PointLight(col('#ffd89a'),.6,9,2);warm.position.set(0,3.4,-.6);scene.add(warm);

/* ---------- ticket textures ---------- */
const IMG={};
function loadImg(src){return new Promise((res,rej)=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>res(i);i.onerror=rej;i.src=src;});}
let faceTex,cardTex,ticketMat,ticketMatHL;
const TW=.27,TH=TW/2.4;
const ticketGeo=new THREE.PlaneGeometry(TW,TH);
function ticketMesh(mat){const g=new THREE.Group();const a=new THREE.Mesh(ticketGeo,mat),b=new THREE.Mesh(ticketGeo,mat);
  a.material.side=THREE.FrontSide;b.rotation.y=Math.PI;a.castShadow=b.castShadow=true;g.add(a,b);g.userData.mat=mat;return g;}
function makeTicketMats(){
  faceTex=new THREE.Texture(IMG.face);faceTex.encoding=THREE.sRGBEncoding;faceTex.anisotropy=8;faceTex.needsUpdate=true;
  cardTex=new THREE.Texture(IMG.card);cardTex.encoding=THREE.sRGBEncoding;cardTex.anisotropy=8;cardTex.needsUpdate=true;
  ticketMat=new THREE.MeshStandardMaterial({map:faceTex,metalness:.6,roughness:.3,alphaTest:.5,side:THREE.DoubleSide,envMapIntensity:1.25});
}
function textTicket(e,hl){
  const c=document.createElement('canvas');c.width=1200;c.height=500;const g=c.getContext('2d');
  g.drawImage(IMG.card,0,0,1200,500);
  if(hl){g.fillStyle='rgba(255,236,170,.25)';g.fillRect(0,0,1200,500);}
  const mx=456;g.textAlign='center';g.textBaseline='middle';
  const ls=v=>{if('letterSpacing' in g) g.letterSpacing=v;};
  ls('9px');g.font='800 24px Montserrat,sans-serif';g.fillStyle='rgba(111,81,26,.85)';g.fillText(CFG.lang==='zh'?'黄金券':'GOLDEN TICKET',mx,128);
  ls('6px');g.font='700 104px "Playfair Display",Georgia,serif';g.fillStyle='rgba(255,246,214,.8)';g.fillText(e.n,mx+2,232);g.fillStyle='#45320c';g.fillText(e.n,mx,228);
  ls('10px');g.font='800 64px Montserrat,sans-serif';g.fillStyle='rgba(255,246,214,.8)';g.fillText(e.p,mx+2,342);g.fillStyle='#45320c';g.fillText(e.p,mx,338);
  const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.anisotropy=8;
  return new THREE.MeshStandardMaterial({map:t,metalness:.5,roughness:.36,alphaTest:.5,side:THREE.DoubleSide,envMapIntensity:1.1});
}

/* ---------- tickets in the drum (physics in drum units, y down) ---------- */
const CAP=320;const parts=[];
let inst=null;const hlGlows=[];
function setupInstances(){
  inst=new THREE.InstancedMesh(ticketGeo,ticketMat,CAP);inst.castShadow=true;inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for(let i=0;i<CAP;i++){inst.setColorAt(i,new THREE.Color(1,1,1));}
  inst.count=0;scene.add(inst);
  for(let i=0;i<12;i++){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:GT,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:0}));s.scale.set(.6,.6,1);scene.add(s);hlGlows.push(s);}
}
function addPart(e,hl,x,y){
  if(parts.length>=CAP){const i=parts.findIndex(p=>!p.hl);if(i>=0)parts.splice(i,1);}
  parts.push({x:x??rnd(-.12,.12),y:y??-.8,z:rnd(-.25,.25),vx:rnd(-.3,.3),vy:rnd(.2,.8),vz:rnd(-.2,.2),
    a:rnd(0,6.28),b:rnd(-1.2,1.2),c:rnd(-1.2,1.2),va:rnd(-3,3),vb:rnd(-3,3),vc:rnd(-3,3),e,hl:!!hl});
}
let ang=0,omega=.22,targetOmega=.22;
function physics(dt){
  const spin=Math.abs(omega);
  for(const p of parts){
    p.vy+=2.5*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
    p.a+=p.va*dt;p.b+=p.vb*dt;p.c+=p.vc*dt;
    const r=Math.hypot(p.x,p.y),lim=.9;
    if(r>lim){
      const nx=p.x/r,ny=p.y/r;p.x=nx*lim;p.y=ny*lim;
      const vn=p.vx*nx+p.vy*ny;if(vn>0){p.vx-=1.25*vn*nx;p.vy-=1.25*vn*ny;}
      const tx=-ny,ty=nx,wallV=omega*lim,vt=p.vx*tx+p.vy*ty,k=Math.min(1,5*dt);
      p.vx+=tx*(wallV-vt)*k;p.vy+=ty*(wallV-vt)*k;
      if(spin>1&&Math.random()<spin*.05){p.vx+=rnd(-.6,.6);p.vy-=rnd(.3,1.1)*Math.min(spin,4)*.5;p.va=rnd(-9,9);p.vb=rnd(-9,9);p.vc=rnd(-9,9);p.vz+=rnd(-.4,.4);}
      const damp=Math.pow(.02,dt);p.va*=damp;p.vb*=damp;p.vc*=damp;
    }
    if(p.z>.34){p.z=.34;p.vz=-Math.abs(p.vz)*.5;} if(p.z<-.34){p.z=-.34;p.vz=Math.abs(p.vz)*.5;}
    const v=Math.hypot(p.vx,p.vy),mx=1.9+spin*.15;if(v>mx){p.vx*=mx/v;p.vy*=mx/v;}
    p.vx*=.995;p.vz*=.99;
  }
  const D=.085,D2=D*D,n=parts.length;
  for(let i=0;i<n;i++){const a=parts[i];for(let j=i+1;j<n;j++){const b=parts[j];const dx=b.x-a.x,dy=b.y-a.y,dz=(b.z-a.z)*.55,d2=dx*dx+dy*dy+dz*dz;
    if(d2<D2&&d2>1e-9){const d=Math.sqrt(d2),k=(D-d)/d*.5;a.x-=dx*k;a.y-=dy*k;b.x+=dx*k;b.y+=dy*k;a.z-=dz*k;b.z+=dz*k;
      const m=((b.vx-a.vx)*dx+(b.vy-a.vy)*dy)/d2;if(m<0){a.vx+=m*dx*.5;a.vy+=m*dy*.5;b.vx-=m*dx*.5;b.vy-=m*dy*.5;}}}}
}
const _q=new THREE.Quaternion(),_e=new THREE.Euler(),_p=new THREE.Vector3(),_s=new THREE.Vector3(1,1,1),_c=new THREE.Color();
function syncInstances(){
  if(!inst) return;
  let gi=0;
  for(let i=0;i<parts.length;i++){const p=parts[i];
    _p.set(DRUM.x+p.x,DRUM.y-p.y,p.z);_e.set(p.b,p.c,-p.a);_q.setFromEuler(_e);_s.setScalar(1);
    tmpM.compose(_p,_q,_s);inst.setMatrixAt(i,tmpM);
    inst.setColorAt(i,p.hl?_c.setRGB(1.5,1.32,.95):_c.setRGB(1,1,1));
    if(p.hl&&gi<hlGlows.length){const g=hlGlows[gi++];g.position.copy(_p);g.position.z+=.05;g.material.opacity=.55+.25*Math.sin(time*5+i);}
  }
  for(;gi<hlGlows.length;gi++) hlGlows[gi].material.opacity=0;
  inst.count=parts.length;inst.instanceMatrix.needsUpdate=true;if(inst.instanceColor) inst.instanceColor.needsUpdate=true;
}

/* ---------- flyers ---------- */
const flyers=[];
function spawnFlyer(e,o={}){
  const big=!!o.big,left=Math.random()<.5;
  const vw=viewW(4);
  const start=new THREE.Vector3((left?-1:1)*(vw/2+1.2),rnd(.2,2.8),big?rnd(3.2,3.8):rnd(.5,2.6));
  const ctrl=new THREE.Vector3((left?-1:1)*rnd(.6,1.6),CHUTE.y+rnd(1.4,2.4),big?2.2:1);
  if(big){const sy=narrow?.36:.46,sx=(narrow?rnd(.02,.14):rnd(.1,.26))*(left?-1:1);
    atScreen(sx,sy,6.5,ctrl);atScreen((left?-1:1)*.75,sy-.08,6.5,start);}
  const mat=big?textTicket(e,o.hl):ticketMat;
  const mesh=big?ticketMesh(mat):new THREE.Mesh(ticketGeo,mat);scene.add(mesh);
  flyers.push({e,big,hl:!!o.hl,t:0,dur:o.dur||(big?3.6:rnd(.8,1.3)),start,ctrl,mesh,spin:rnd(-2,2),wob:rnd(0,6),onArrive:o.onArrive});
}
const _b=new THREE.Vector3();
function bez(f,t,out){const u=1-t;out.set(0,0,0).addScaledVector(f.start,u*u).addScaledVector(f.ctrl,2*u*t).addScaledVector(CHUTE,t*t);out.y+=t>.9?-(t-.9)*3:0;return out;}
function stepFlyers(dt){
  for(let i=flyers.length-1;i>=0;i--){const f=flyers[i];f.t+=dt/f.dur;
    if(f.t>=1){scene.remove(f.mesh);if(f.big){f.mesh.userData.mat.map.dispose();f.mesh.userData.mat.dispose();}flyers.splice(i,1);addPart(f.e,f.hl,rnd(-.1,.1),-.84);if(f.onArrive)f.onArrive();tick(.35);continue;}
    let t=f.t,sc;
    if(f.big){
      // glide in, hover so the entry can be read, then dive into the chute
      if(t<.3){const k=ease3(t/.3);f.mesh.position.lerpVectors(f.start,f.ctrl,k);sc=2.6;}
      else if(t<.62){const k=(t-.3)/.32;f.mesh.position.copy(f.ctrl);f.mesh.position.x+=Math.sin(k*Math.PI)*.08*(f.start.x>0?-1:1);f.mesh.position.y+=k*.12;sc=2.6;}
      else{const k=easeIO((t-.62)/.38),u=1-k;_b.copy(f.ctrl);_b.y+=.12;const m2=new THREE.Vector3((_b.x+CHUTE.x)/2,Math.max(_b.y,CHUTE.y)+1.4,(_b.z+CHUTE.z)/2);
        f.mesh.position.set(0,0,0).addScaledVector(_b,u*u).addScaledVector(m2,2*u*k).addScaledVector(CHUTE,k*k);sc=2.6*(1-k)+1*k;}
      f.mesh.scale.setScalar(sc);f.mesh.quaternion.copy(camera.quaternion);
      const tl=t<.62?0:(t-.62)/.38;f.mesh.rotateZ(Math.sin(time*1.4+f.wob)*.05+tl*1.4);f.mesh.rotateY(Math.sin(time*1.1+f.wob)*.18*(1-tl)+tl*tl*2.6);f.mesh.rotateX(-.08);
      continue;}
    bez(f,t,f.mesh.position);sc=1.5-t*.5;f.mesh.scale.setScalar(sc);
    {
    f.mesh.rotation.set(time*f.spin+f.wob,time*f.spin*.7,time*f.spin*1.3);}
  }
}

/* ---------- camera framing ---------- */
let W=1,H=1,narrow=false,CW=520,camY=1.3;
const TANH=Math.tan(THREE.MathUtils.degToRad(15));
function viewH(d){return 2*d*TANH;} function viewW(d){return viewH(d)*W/H;}
function layout(){
  W=root.clientWidth||1;H=root.clientHeight||1;narrow=W<760||W/H<.95;root.classList.toggle('narrow',narrow);
  const dpr=LOW?1:Math.min(2,window.devicePixelRatio||1);renderer.setPixelRatio(dpr);renderer.setSize(W,H,false);
  fxc.width=W*dpr;fxc.height=H*dpr;
  camera.aspect=W/H;
  fitCamera();
  placeOverlays();
}
const _v=new THREE.Vector3();
const _d=new THREE.Vector3();
function atScreen(fx,fy,dist,out){_d.set(fx*2,1-fy*2,.5).unproject(camera).sub(camera.position).normalize();return out.copy(camera.position).addScaledVector(_d,dist);}
const P_TOP=new THREE.Vector3(0,0,0),P_BOT=new THREE.Vector3(0,0,0),P_SIDE=new THREE.Vector3(0,0,0);
function setCam(dist,cy){camera.position.set(0,cy+dist*.06,dist);camera.lookAt(0,cy,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();}
function fitCamera(){
  P_TOP.set(0,ARCH_Y+ARCH_A+.22,ARCH_Z);P_BOT.set(0,FLOOR,2.4);P_SIDE.set(ARCH_A+.25,ARCH_Y,ARCH_Z);
  const tt=narrow?.2:.21,bt=narrow?.66:.84,maxHalf=narrow?.49:.255;
  let dist=18,cy=1;
  for(let k=0;k<60;k++){
    setCam(dist,cy);
    const yt=toScreen(P_TOP).y/H,yb=toScreen(P_BOT).y/H,xs=toScreen(P_SIDE).x/W-.5;
    let span=(yb-yt)/(bt-tt);
    if(xs>maxHalf) span=Math.max(span,xs/maxHalf);
    dist*=1+(span-1)*.6;
    cy-=((yt+yb)/2-(tt+bt)/2)*viewH(dist)*.8;
  }
  setCam(dist,cy);camY=cy;
}
function toScreen(v){_v.copy(v).project(camera);return {x:(_v.x+1)/2*W,y:(1-_v.y)/2*H};}
function placeOverlays(){
  const logo=q('.zd-logo'),sign=q('.zd-sign'),cnt=q('.zd-cnt'),feed=q('.zd-feed'),board=q('.zd-board'),ctr=q('.zd-ctr'),find=q('.zd-find');
  const archTop=toScreen(new THREE.Vector3(0,ARCH_Y+ARCH_A+.2,ARCH_Z)).y,plat=toScreen(new THREE.Vector3(0,FLOOR,2.4)).y;
  if(narrow){
    const lh=Math.min(H*.08,W*.19);
    logo.style.cssText=`left:50%;transform:translateX(-50%);top:${H*.014}px;height:${lh}px`;
    sign.style.fontSize=Math.min(W*.028,13)+'px';sign.style.top=(H*.014+lh+10)+'px';q('.zd-signT').style.fontSize='2.1em';
    cnt.style.cssText=`left:50%;transform:translateX(-50%);top:${plat+10}px;text-align:center;white-space:nowrap`;cnt.querySelector('b').style.fontSize=Math.min(W*.075,30)+'px';
    feed.style.cssText=`left:16px;right:16px;top:${plat+68}px;padding:6px 14px`;feed.querySelector('h4').style.display='none';
    board.style.cssText=`left:12px;right:12px;top:${H*.16}px;bottom:${H*.2}px`;
    find.style.cssText=`left:50%;transform:translateX(-50%);top:${H*.18}px`;
    ctr.style.bottom='14px';
  }else{
    const lh=clamp(H*.16,70,150),side=clamp(W*.2,230,320);
    logo.style.cssText=`left:${W*.025}px;top:${H*.035}px;height:${lh}px;transform:none`;
    sign.style.fontSize=clamp(H*.017,10,16)+'px';q('.zd-signT').style.fontSize='2.6em';
    sign.style.top=Math.max(12,archTop-H*.135)+'px';
    cnt.style.cssText=`left:${W*.025}px;top:${H*.035+lh+H*.04}px;width:${side}px;transform:none`;cnt.querySelector('b').style.fontSize=clamp(H*.055,26,54)+'px';
    feed.style.cssText=`left:${W*.025}px;top:${H*.035+lh+H*.04+clamp(H*.055,26,54)+34}px;width:${side}px`;feed.querySelector('h4').style.display='flex';
    board.style.cssText=`right:${W*.022}px;top:${H*.1}px;width:${side}px;bottom:${H*.05}px`;
    find.style.cssText=`left:${W*.025}px;bottom:${H*.05}px`;
    ctr.style.bottom=(H*.03)+'px';
  }
  CW=Math.min(W*(narrow?.9:.48),640,H*.55*2.4);
  q('.zd-card').style.setProperty('--cw',CW+'px');
  const ban=q('.zd-ban');ban.style.top=(H/2-CW/2.4/2-(narrow?92:116))+'px';
  ban.querySelector('b').style.fontSize=Math.min(W*.1,62)+'px';ban.querySelector('span').style.fontSize=Math.min(W*.028,13)+'px';
}

/* ---------- intake ---------- */
let shown=0,total=0,intakeDone=false,intakeT=0,plan=[];
function startIntake(){
  for(const f of flyers) scene.remove(f.mesh);flyers.length=0;parts.length=0;shown=0;intakeDone=false;total=ENTRIES.length;q('.zd-rows').innerHTML='';
  const nBig=Math.min(8,total),nSmall=Math.min(CAP,Math.max(0,total-nBig));plan=[];
  for(let i=0;i<nBig;i++) plan.push({at:.4+i*.75,idx:i,big:true,w:1});
  const rest=total-nBig,t0=.4+nBig*.75+.6;
  for(let i=0;i<nSmall;i++){const share=Math.floor(rest*(i+1)/nSmall)-Math.floor(rest*i/nSmall);
    plan.push({at:t0+i*(4.6/nSmall)*(1-.45*i/nSmall),idx:nBig+Math.floor(i*rest/nSmall),big:false,w:share});}
  intakeT=0;state='intake';setHint('');
  const drawBtn=q('.zd-draw'); if(drawBtn) drawBtn.disabled=true;
  if(!plan.length){intakeDone=true;shown=total;state='ready';updateUI();}
}
function stepIntake(dt){
  if(intakeDone||state!=='intake') return;intakeT+=dt;
  while(plan.length&&plan[0].at<=intakeT){const s=plan.shift(),e=ENTRIES[s.idx];
    spawnFlyer(e,{big:s.big,hl:HL.has(e.t),onArrive:()=>{shown=Math.min(total,shown+s.w);}});
    if(s.big||Math.random()<.16) feedRow(e);}
  if(!plan.length&&!flyers.length){intakeDone=true;shown=total;state='ready';updateUI();if(CFG.auto)autoplay();}
}
function feedRow(e,me){
  const box=q('.zd-rows'),d=document.createElement('div');d.className='zd-row'+(me?' me':'');
  d.innerHTML=`<span class="zd-nm">${esc(e.n)}</span><span class="zd-ph">${esc(e.p)}</span>`;
  box.prepend(d);const max=narrow?1:7;while(box.children.length>max) box.lastChild.remove();
}

/* ---------- fx: dust and confetti ---------- */
const dust=[],conf=[];
for(let i=0;i<40;i++) dust.push({x:Math.random(),y:Math.random(),r:rnd(.6,1.8),s:rnd(.005,.02),p:rnd(0,6)});
function burst(x,y,n,big){
  const cols=['#f6dd94','#e3bd63','#fff6dc','#c99a43','#f2e6c8','#ffe7a3'];
  for(let i=0;i<n;i++){const a=rnd(0,Math.PI*2),v=rnd(4,big?17:12);
    conf.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-rnd(3,8),r:rnd(0,6),vr:rnd(-.3,.3),w:rnd(6,13),h:rnd(3,7),c:cols[i%cols.length],sh:Math.random()<.16?2:(Math.random()<.3?1:0),life:1,fl:rnd(0,6)});}
}
function rain(n){for(let i=0;i<n;i++) conf.push({x:rnd(0,W),y:rnd(-H*.6,-10),vx:rnd(-1,1),vy:rnd(1,4),r:rnd(0,6),vr:rnd(-.2,.2),w:rnd(22,34),h:0,c:'',sh:3,life:1.7,fl:rnd(0,6)});}
function star(g,r){g.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4,rr=i%2?r*.35:r;g.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}g.closePath();g.fill();}
function drawFx(dt){
  const dpr=fxc.width/W;fx.setTransform(dpr,0,0,dpr,0,0);fx.clearRect(0,0,W,H);
  fx.globalCompositeOperation='lighter';
  for(const d of dust){d.y-=d.s*dt*(1+Math.abs(omega)*.6);if(d.y<-.02){d.y=1.02;d.x=Math.random();}
    fx.fillStyle=`rgba(255,220,140,${.22+.22*Math.sin(time*2+d.p)})`;fx.beginPath();fx.arc(d.x*W+Math.sin(time+d.p)*8,d.y*H,d.r,0,7);fx.fill();}
  fx.globalCompositeOperation='source-over';
  for(let i=conf.length-1;i>=0;i--){const c=conf[i];
    c.vy+=.32*dt*60;c.vx*=Math.pow(.985,dt*60);c.vy*=Math.pow(.985,dt*60);c.x+=c.vx*dt*60+Math.sin(time*5+c.fl)*.6;c.y+=c.vy*dt*60;c.r+=c.vr*dt*60;c.life-=dt*.28;
    if(c.life<=0||c.y>H+40){conf.splice(i,1);continue;}
    fx.save();fx.translate(c.x,c.y);fx.rotate(c.r);fx.globalAlpha=Math.min(1,c.life*2);
    if(c.sh===3&&IMG.face){const w=c.w,h=w/2.4;fx.scale(1,Math.cos(time*4+c.fl));fx.drawImage(IMG.face,-w/2,-h/2,w,h);}
    else if(c.sh===2){fx.fillStyle=c.c;star(fx,c.w*.6);}
    else{fx.scale(1,Math.cos(time*6+c.fl));fx.fillStyle=c.c;if(c.sh)fx.fillRect(-c.w,-1.5,c.w*2,3);else fx.fillRect(-c.w/2,-c.h/2,c.w,c.h);}
    fx.restore();}
}

/* ---------- sound (synthesised effects only) ---------- */
let AC=null,muted=!CFG.sound;
function ac(){if(!AC){try{AC=new (window.AudioContext||window.webkitAudioContext)();}catch(e){}}if(AC&&AC.state==='suspended')AC.resume();return AC;}
function tone(f,d,type,vol,when=0){const a=ac();if(!a||muted)return;const t=a.currentTime+when,o=a.createOscillator(),g=a.createGain();o.type=type||'sine';o.frequency.setValueAtTime(f,t);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g).connect(a.destination);o.start(t);o.stop(t+d+.05);}
function noise(d,vol,f0,f1,when=0){const a=ac();if(!a||muted)return;const t=a.currentTime+when,b=a.createBuffer(1,Math.max(1,a.sampleRate*d|0),a.sampleRate),ch=b.getChannelData(0);for(let i=0;i<ch.length;i++)ch[i]=Math.random()*2-1;const s=a.createBufferSource();s.buffer=b;const fl=a.createBiquadFilter();fl.type='bandpass';fl.Q.value=1.2;fl.frequency.setValueAtTime(f0,t);fl.frequency.exponentialRampToValueAtTime(f1,t+d);const g=a.createGain();g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);s.connect(fl).connect(g).connect(a.destination);s.start(t);}
let lastTick=0;function tick(v=1){if(time-lastTick<.045)return;lastTick=time;tone(rnd(1800,2600),.035,'square',.022*v);}
const whoosh=()=>noise(.7,.2,300,3200);
function chime(grand){[0,4,7,12,16].forEach((s,i)=>tone(784*Math.pow(2,s/12),grand?1.6:1.1,'triangle',.07,i*.08));if(grand)[0,7,12].forEach((s,i)=>tone(392*Math.pow(2,s/12),2.4,'sine',.06,.45+i*.05));}
function drumroll(d){for(let t=0;t<d;t+=.045)noise(.05,.05+.12*t/d,1400,900,t);}

/* ---------- interaction ---------- */
let state='loading',dragging=false,dragA=0,dragT=0,dragSum=0;
function drumScreen(){const c=toScreen(DRUM),e=toScreen(new THREE.Vector3(DRUM.x+1,DRUM.y,DZ));return {x:c.x,y:c.y,r:Math.abs(e.x-c.x)};}
function crankScreen(){const k=toScreen(new THREE.Vector3(CRANK.x,CRANK.y,CRANK.z+.05)),e=toScreen(new THREE.Vector3(CRANK.x+.24,CRANK.y,CRANK.z+.05));return {x:k.x,y:k.y,r:Math.abs(e.x-k.x)};}
function pt(e){const r=glc.getBoundingClientRect();return {x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*H/r.height};}
// what the pointer grabbed: the crank (turn it around its own axle) or the drum (drag around its centre)
function grab(p){const k=crankScreen(),d=drumScreen();
  if(Math.hypot(p.x-k.x,p.y-k.y)<Math.max(44,k.r*1.9)) return {kind:'crank',c:k,ratio:1/1.6,need:Math.PI*2*.9};
  if(Math.hypot(p.x-d.x,p.y-d.y)<d.r*1.15) return {kind:'drum',c:d,ratio:1,need:Math.PI*1.6};
  return null;}
let grabbed=null;
glc.addEventListener('pointerdown',e=>{const p=pt(e);grabbed=grab(p);if(!grabbed)return;e.preventDefault();ac();dragging=true;
  dragA=Math.atan2(p.y-grabbed.c.y,p.x-grabbed.c.x);dragT=performance.now();dragSum=0;try{glc.setPointerCapture(e.pointerId);}catch(_){} });
glc.addEventListener('pointermove',e=>{const p=pt(e);
  if(!dragging){glc.style.cursor=grab(p)?'grab':'default';return;}
  const c=grabbed.c,a=Math.atan2(p.y-c.y,p.x-c.x);let da=a-dragA;if(da>Math.PI)da-=2*Math.PI;if(da<-Math.PI)da+=2*Math.PI;
  const now=performance.now(),dt=Math.max(.008,(now-dragT)/1000);dragA=a;dragT=now;
  const dd=da*grabbed.ratio;ang+=dd;omega=omega*.6+(dd/dt)*.4;targetOmega=omega;dragSum+=Math.abs(da);glc.style.cursor='grabbing';
  if(Math.abs(da)>.15) tick(.5);
  });
const endDrag=()=>{if(!dragging)return;dragging=false;grabbed=null;glc.style.cursor='default';targetOmega=Math.sign(omega||1)*.22;};
glc.addEventListener('pointerup',endDrag);glc.addEventListener('pointercancel',endDrag);

/* ---------- draw sequence ---------- */
let fastMode=false,cardDone=null;
const curPrize=()=>PRIZES[prizeIdx];
function canDraw(){const p=curPrize();if(!p)return false;if(CFG.mode==='results'&&!hasResults())return true;return wonIn(p).length<available(p);}
async function startDraw(all){
  if(state!=='ready'||CFG.locked)return;const p=curPrize();if(!p)return;
  if(CFG.mode==='results'&&!hasResults()&&!CFG.pick){state='spinning';updateUI();targetOmega=4.2;whoosh();await wait(2400);targetOmega=.22;state='ready';updateUI();return;}
  fastMode=!!all&&!CFG.single;state='spinning';updateUI();
  try{
    do{const w=await nextWinner(p);if(!w)break;await reveal(w,p);if(CFG.onDrawn){try{CFG.onDrawn(w,p);}catch(e){}}
      if(wonIn(p).length>=available(p))break;}while(fastMode);
  }catch(err){if(CFG.onError)CFG.onError(err);}
  fastMode=false;
  if(wonIn(p).length>=available(p)){const nx=PRIZES.findIndex((x,i)=>i>prizeIdx&&wonIn(x).length<available(x));if(nx>=0)prizeIdx=nx;}
  state='ready';updateUI();
}
const _from=new THREE.Vector3(),_to=new THREE.Vector3(),_qa=new THREE.Quaternion(),_qb=new THREE.Quaternion(),_dir=new THREE.Vector3();
async function reveal(w,p){
  const grand=!!(DATA.draw&&DATA.draw.grand)||p.rank===1,sp=fastMode?.45:1;
  targetOmega=grand?5:4.2;whoosh();
  if(grand){q('.zd-veil').classList.add('on');drumroll(3.2);}
  await wait((grand?3200:1700)*sp);
  let best=null;for(const x of parts) if(!best||x.y<best.y) best=x;
  if(best){best.hl=true;best.vy=-2;}
  await wait(280*sp);
  targetOmega=.22;
  WON.set(w.t,{...w,prize:p.id,at:new Date().toISOString()});if(w.c)WONC.add(w.c);
  // the winning ticket leaves the drum as a real 3D ticket and flies to the camera
  if(best){_from.set(DRUM.x+best.x,DRUM.y-best.y,best.z);parts.splice(parts.indexOf(best),1);}else _from.copy(CHUTE);
  const mesh=ticketMesh(new THREE.MeshStandardMaterial({map:cardTex,metalness:.6,roughness:.3,alphaTest:.5,envMapIntensity:1.2}));
  scene.add(mesh);
  const dEnd=4;camera.getWorldDirection(_dir);_to.copy(camera.position).addScaledVector(_dir,dEnd);
  const worldW=CW/H*viewH(dEnd),sEnd=worldW/TW;
  _qb.copy(camera.quaternion);_qa.setFromEuler(new THREE.Euler(rnd(-1,1),rnd(-1,1),rnd(-1,1)));
  const mid=new THREE.Vector3().lerpVectors(_from,_to,.4);mid.y+=1.4;
  q('.zd-veil').classList.add('on');
  const dur=(grand?2.1:1.35)*sp;noise(dur,.12,500,4000);
  await new Promise(res=>{const t0=performance.now();(function f(){const k=Math.min(1,(performance.now()-t0)/1000/dur),t=ease3(k),u=1-t;
    mesh.position.set(0,0,0).addScaledVector(_from,u*u).addScaledVector(mid,2*u*t).addScaledVector(_to,t*t);
    mesh.scale.setScalar(1+(sEnd-1)*Math.pow(t,1.3));
    mesh.quaternion.slerpQuaternions?mesh.quaternion.slerpQuaternions(_qa,_qb,t):THREE.Quaternion.slerp(_qa,_qb,mesh.quaternion,t);
    mesh.rotateY((1-t)*Math.PI*4);
    if(k<1)requestAnimationFrame(f);else res();})();});
  await showCard(w,p,grand,sp,mesh);
  addBoardRow(w,p);updateUI();
  q('.zd-veil').classList.remove('on');
}
function showCard(w,p,grand,sp,mesh){
  return new Promise(async res=>{
    const card=q('.zd-card');card.classList.remove('lit');
    q('.zd-cey').textContent=grand?L.grandWinner:L.winner;q('.zd-cnext').textContent=L.tap;
    const pz=txt(p.name),pe=q('.zd-cprize');pe.textContent=pz;q('.zd-cpl').textContent=L.prize;
    pe.style.setProperty('--pf',`calc(var(--cw)*${pz.length>70?.016:pz.length>45?.018:pz.length>24?.021:.026})`);
    const k=wonIn(p).length;q('.zd-cdraw').textContent=L.drawOf(k,p.count);
    q('.zd-cname').innerHTML='';q('.zd-cph').innerHTML='';
    card.classList.add('show');await wait(180);scene.remove(mesh);mesh.userData.mat.dispose();
    const rd=(grand?2600:1100)*sp;
    rollMasked(q('.zd-cname'),w.n,rd*.6,'ABCDEFGHJKLMNPRSTUVWYZ');rollMasked(q('.zd-cph'),w.p,rd,'0123456789');
    await wait(rd+80);
    card.classList.add('lit');chime(grand);
    const r=card.getBoundingClientRect(),rr=root.getBoundingClientRect();
    burst((r.left-rr.left+r.width/2)*W/rr.width,(r.top-rr.top+r.height/2)*H/rr.height,grand?260:fastMode?60:150,grand);if(grand)rain(80);
    const ban=q('.zd-ban');ban.querySelector('b').textContent=grand?L.grandWinner:(L.winner+'!');ban.querySelector('span').textContent=L.congrats;ban.classList.add('on');
    const hold=grand?0:(fastMode?900:(CFG.auto?2600:0));
    const done=async()=>{card.onclick=null;cardDone=null;ban.classList.remove('on');
      const br=q('.zd-board').getBoundingClientRect(),cr=card.getBoundingClientRect(),vis=br.width>0;
      const tx=vis?(br.left+br.width/2)-(cr.left+cr.width/2):0,ty=vis?(br.top+70)-(cr.top+cr.height/2):H*.5;
      await card.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${tx}px,${ty}px) scale(.12)`,opacity:0}],{duration:520*sp,easing:'cubic-bezier(.5,0,.75,0)',fill:'forwards'}).finished;
      card.classList.remove('show','lit');card.getAnimations().forEach(a=>a.cancel());res();};
    if(hold)setTimeout(done,hold);else{card.onclick=done;cardDone=done;}
  });
}
function rollMasked(el,target,dur,pool){const t0=performance.now();
  (function f(){const k=(performance.now()-t0)/dur;let h='';
    for(let i=0;i<target.length;i++){const ch=target[i],lock=.2+.8*(i+1)/target.length;
      if(ch==='*') h+=k>=lock*.7?'<span class="m">*</span>':'<span class="m">&nbsp;</span>';
      else if(ch===' ') h+=' ';
      else h+=k>=lock?esc(ch):pool[Math.random()*pool.length|0];}
    el.innerHTML=h;if(k<1){tick(.4);requestAnimationFrame(f);}else el.innerHTML=esc(target).replace(/\*/g,'<span class="m">*</span>');})();}

/* ---------- board, find, UI ---------- */
function fmtDate(s){const d=new Date(s+'T12:00:00');if(isNaN(d))return s||'';return CFG.lang==='zh'?`${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`:d.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});}
function renderBoard(){
  q('.zd-board h3').textContent=L.winners;q('.zd-board header p').textContent=`${txt(DATA.draw&&DATA.draw.title)}${DATA.draw&&DATA.draw.date?' · '+fmtDate(DATA.draw.date):''}`;
  const list=q('.zd-list');list.innerHTML='';
  PRIZES.forEach((p,i)=>{const g=document.createElement('div');g.className='zd-grp';g.dataset.p=p.id;
    g.innerHTML=`<h5><span>${esc(p.short?txt(p.short):txt(p.name))}</span><em>${wonIn(p).length} / ${p.count}</em></h5>`;
    g.querySelector('h5').onclick=()=>{if(state!=='ready')return;prizeIdx=i;updateUI();};
    for(const w of wonIn(p)) g.appendChild(winRow(w));list.appendChild(g);});
}
function winRow(w,fresh){const d=document.createElement('div');d.className='zd-w'+(fresh?' fresh':'');d.innerHTML=`<span class="zd-nm">${esc(w.n)}</span><span class="zd-ph">${esc(w.p)}</span>`;return d;}
function addBoardRow(w,p){const g=q(`.zd-grp[data-p="${window.CSS&&window.CSS.escape?window.CSS.escape(p.id):p.id}"]`);if(!g){renderBoard();return;}
  g.querySelectorAll('.fresh').forEach(x=>x.classList.remove('fresh'));const row=winRow(w,true);g.querySelector('h5').after(row);
  g.querySelector('em').textContent=`${wonIn(p).length} / ${p.count}`;row.scrollIntoView({block:'nearest',behavior:'smooth'});}
function findMine(){
  const v=q('#zd-fin').value.replace(/\D/g,'');const out=q('.zd-fout');if(v.length!==4){out.textContent='';return;}
  const mine=ENTRIES.filter(e=>e.p.endsWith(v));if(!mine.length){out.textContent=L.none;return;}
  mine.forEach(e=>HL.add(e.t));for(const x of parts) if(x.e&&HL.has(x.e.t)) x.hl=true;
  const wp=mine.map(e=>WON.get(e.t)).filter(Boolean).map(w=>txt((PRIZES.find(p=>p.id===w.prize)||{}).name));
  out.innerHTML=L.found(mine.length,wp.length?L.won(esc(wp[0])):'');
  mine.slice(0,8).forEach((e,i)=>setTimeout(()=>{spawnFlyer(e,{big:i<2,hl:true,dur:i<2?1.8:.9});if(i<3)feedRow(e,true);},i*240));ac();
}
q('.zd-fgo').onclick=findMine;q('#zd-fin').addEventListener('keydown',e=>{if(e.key==='Enter')findMine();});
function setHint(s){q('.zd-hint').textContent=s;}
function updateUI(){
  if(!DATA)return;
  const p=curPrize(),db=q('.zd-draw'),ab=q('.zd-all'),busy=state!=='ready',preview=CFG.mode==='results'&&!hasResults();
  const left=p?available(p)-wonIn(p).length:0,allDone=PRIZES.every(x=>wonIn(x).length>=available(x));
  root.querySelectorAll('.zd-grp').forEach((g,i)=>g.classList.toggle('cur',i===prizeIdx));
  const short=x=>x.short?txt(x.short):txt(x.name).split(' + ')[0];
  if(preview){db.textContent=L.spin;ab.style.display='none';setHint(state==='ready'?L.hintWait(fmtDate(DATA.draw.date)):'');}
  else{ab.style.display=left>1?'':'none';ab.textContent=CFG.mode==='host'?L.all:L.allFast;
    db.textContent=allDone?L.done:(p?L.drawN(short(p),Math.min(p.count,wonIn(p).length+1),p.count):L.draw);
    setHint(state==='ready'&&!allDone?L.hintCrank:'');}
  if(CFG.single)ab.style.display='none';
  if(CFG.locked){db.disabled=true;ab.style.display='none';setHint(String(CFG.locked));}
  else db.disabled=busy||(!preview&&(allDone||left<=0));
  ab.disabled=busy;
  const dl=q('.zd-dl');dl.hidden=!(CFG.mode==='host'&&!CFG.pick&&WON.size);dl.textContent=L.dl;
  q('.zd-bbtn').textContent=`${L.winners} (${WON.size})`;q('.zd-fbtn').textContent=L.my;q('.zd-fgo').textContent=L.find;
  q('#zd-fin').placeholder=L.last4;q('.zd-fbox label').textContent=L.phone;
}
q('.zd-draw').onclick=()=>{ac();if(cardDone){cardDone();return;}startDraw(false);};
q('.zd-all').onclick=()=>{ac();startDraw(true);};
q('.zd-bbtn').onclick=()=>{q('.zd-board').classList.toggle('open');q('.zd-find').classList.remove('open');};
q('.zd-fbtn').onclick=()=>{q('.zd-find').classList.toggle('open');q('.zd-board').classList.remove('open');};
q('.zd-dl').onclick=()=>{
  const out={draw:DATA.draw,generatedAt:new Date().toISOString(),winners:{}};for(const p of PRIZES)out.winners[p.id]=wonIn(p).map(w=>w.t);
  const csv=['prize,ticket_id,initial,phone_masked,time',...[...WON.values()].map(w=>[w.prize,w.t,w.n,w.p,w.at].join(','))].join('\n');
  for(const [name,body,type] of [[`winners-${DATA.draw.id}.json`,JSON.stringify(out,null,2),'application/json'],[`winners-${DATA.draw.id}.csv`,csv,'text/csv']]){
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([body],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);}
};
function applyLang(){
  L=T[CFG.lang]||T.en;root.classList.toggle('zh',CFG.lang==='zh');
  q('.zd-logo').src=CFG.lang==='zh'?CFG.assets.logoZh:CFG.assets.logoEn;
  q('.zd-cnt span').textContent=L.inDrum;q('.zd-feedL').textContent=L.going;q('.zd-load').textContent=L.loading;
  if(DATA){q('.zd-signT').textContent=txt(DATA.draw.title);q('.zd-signS').textContent=narrow?fmtDate(DATA.draw.date):[fmtDate(DATA.draw.date),txt(DATA.draw.note)].filter(Boolean).join(' · ');renderBoard();updateUI();}
}
function demoBar(){
  if(!CFG.demo)return;const rootD=q('.zd-demo');
  const tg=document.createElement('button');tg.textContent=narrow?'Preview ▾':'Preview options ▾';tg.onclick=()=>rootD.classList.toggle('open');rootD.appendChild(tg);
  const bar=document.createElement('div');bar.className='zd-dp';rootD.appendChild(bar);
  const mk=(opts,cur,on,label)=>{const s=document.createElement('select');s.setAttribute('aria-label',label);opts.forEach(([v,l])=>{const o=document.createElement('option');o.value=v;o.textContent=l;if(v===cur)o.selected=true;s.appendChild(o);});s.onchange=()=>on(s.value);bar.appendChild(s);};
  const sets=CFG.demoSets||[];
  if(sets.length) mk(sets.map((s,i)=>[String(i),s.label]),'0',v=>restart({data:sets[+v].data}),'Demo draw');
  mk([['results','Website: show official results'],['host','Livestream host: draw now']],CFG.mode,v=>restart({mode:v}),'Mode');
  mk([['en','EN'],['zh','中文']],CFG.lang,v=>{CFG.lang=v;applyLang();},'Language');
  const m=document.createElement('button');m.textContent=muted?'Sound off':'Sound on';m.onclick=()=>{muted=!muted;m.textContent=muted?'Sound off':'Sound on';ac();};bar.appendChild(m);
  if(CFG.guideUrl){const a=document.createElement('a');a.href=CFG.guideUrl;a.target='_blank';a.rel='noopener';a.textContent='Developer notes + video prompts';bar.appendChild(a);}
}
async function restart(o){
  if(state==='spinning')return;Object.assign(CFG,o);
  try{ingest(await loadData(CFG.data));}catch(e){showErr();return;}
  applyLang();startIntake();
}
function showErr(){const e=q('.zd-err');e.style.display='block';e.textContent=L.loadErr;q('.zd-load').classList.add('gone');}
let autoOn=false;async function autoplay(){if(autoOn)return;autoOn=true;while(CFG.auto){await wait(1500);if(state==='ready'&&canDraw()&&hasResults())await startDraw(false);}autoOn=false;}

/* ---------- loop ---------- */
let time=0,last=performance.now(),alive=true;
function frame(now){
  if(!alive)return;
  try{
    const dt=Math.min(.12,(now-last)/1000);last=now;time+=dt;
    if(!dragging){omega+=(targetOmega-omega)*Math.min(1,dt*(Math.abs(targetOmega)>Math.abs(omega)?1.6:1.1));ang+=omega*dt;}
    if(Math.abs(omega)>1.2&&Math.random()<Math.abs(omega)*dt*3)tick(.6);
    drum.rotation.z=-ang;crank.rotation.z=-ang*1.6;
    const n=Math.ceil(dt/.02);for(let i=0;i<n;i++)physics(dt/n);stepIntake(dt);stepFlyers(dt);syncInstances();
    const chase=2+Math.abs(omega)*2.5;
    for(let i=0;i<glows.length;i++){const b=.5+.5*Math.max(0,Math.sin(time*chase-i*.55));glows[i].material.opacity=.12+.5*b;_c.setRGB(.8+.35*b,.66+.3*b,.42+.22*b);bulbs.setColorAt(i,_c);}
    if(bulbs.instanceColor)bulbs.instanceColor.needsUpdate=true;
    renderer.render(scene,camera);drawFx(dt);
    const cb=q('.zd-cnt b'),cur=+cb.dataset.v||0;if(cur!==shown){const v=cur+Math.ceil((shown-cur)*Math.min(1,dt*8));cb.dataset.v=v;cb.textContent=fmt(v);}
  }catch(_){ /* one bad frame should not stop the show */ }
  requestAnimationFrame(frame);
}
const ro=new ResizeObserver(()=>{layout();if(DATA)applyLang();});ro.observe(root);
window.addEventListener('message',e=>{if(!e.data)return;if(e.data.type==='zell-draw-data')restart({data:e.data.payload});if(e.data.type==='zell-draw-next')startDraw(false);});

(async function init(){
  layout();applyLang();demoBar();requestAnimationFrame(frame);
  try{await document.fonts.ready;}catch(e){}
  try{const [f,c]=await Promise.all([loadImg(CFG.assets.ticketFace),loadImg(CFG.assets.ticketCard)]);IMG.face=f;IMG.card=c;}catch(e){}
  if(IMG.card) q('.zd-card').style.backgroundImage=`url("${CFG.assets.ticketCard}")`,q('.zd-card').style.setProperty('--mask',`url("${CFG.assets.ticketCard}")`);
  if(IMG.face){makeTicketMats();setupInstances();}
  try{ingest(await loadData(CFG.data));}catch(e){showErr();return;}
  applyLang();q('.zd-load').classList.add('gone');startIntake();
  if(CFG.poll&&typeof CFG.data==='string') setInterval(async()=>{try{ingest(await loadData(CFG.data),true);updateUI();}catch(e){}},CFG.poll*1000);
})();
return {crankAt:()=>{const k=crankScreen(),r=glc.getBoundingClientRect();return {x:r.left+k.x*r.width/W,y:r.top+k.y*r.height/H,r:k.r*r.width/W};},draw:()=>startDraw(false),drawAll:()=>startDraw(true),load:j=>restart({data:j}),setLang(l){if(state==='spinning')return;CFG.lang=l==='zh'?'zh':'en';applyLang();},setLocked(msg){CFG.locked=msg||'';if(DATA)updateUI();},destroy:()=>{alive=false;ro.disconnect();renderer.dispose();root.innerHTML='';}};
};
})();
