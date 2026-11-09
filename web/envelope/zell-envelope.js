/* ZÉLL-V Golden Envelope draw.
   Needs three.js r128 (window.THREE) loaded first.
   ZellEnvelopeMount(container, {
     lang:'en'|'zh', assets:{logoEn, logoZh, sealLogo}, items:[...] (optional, defaults below; image paths are relative to the page),
     pick: async () => itemId   (optional: the official result from your server; default is a random demo pick),
     demo:true, sound:true, onDone:(itemId)=>{} (Done button; default returns to the start), quality:"high"|"low" })
*/
(function(){
'use strict';
const ITEMS=[
 {id:'serum',d:0.2,img:'assets/items/serum.png',h:1.4,orig:450,price:68,
  name:{en:'ZÉLL-V Phytocell Serum+',zh:'ZÉLL-V Phytocell Serum+'},
  text:{en:'Our signature face serum from the ZÉLL-V PLUS range, at a special Golden Envelope price.',zh:'ZÉLL-V PLUS 系列招牌面部精华，黄金信封特价。'}},
 {id:'cream',d:0.2,img:'assets/items/cream.png',h:1.4,orig:360,price:68,
  name:{en:'ZÉLL-V Wonder Cream+',zh:'ZÉLL-V Wonder Cream+'},
  text:{en:'The daily face cream from the ZÉLL-V GREEN range, at a special Golden Envelope price.',zh:'ZÉLL-V GREEN 系列日常面霜，黄金信封特价。'}},
 {id:'bevite',d:0.42,img:'assets/items/bevite.png',h:1.2,orig:250,price:68,
  name:{en:'Bevité Functional Foods',zh:'Bevité 功能食品'},
  text:{en:'A 450 g box of 15 sachets, at a special Golden Envelope price.',zh:'一盒 450 克，共 15 包，黄金信封特价。'}},
 {id:'jojoba',d:0.3,img:'assets/items/jojoba.png',h:1.15,orig:150,price:68,
  name:{en:'BeJojoba Oil 50 ml',zh:'BeJojoba 荷荷巴油 50 毫升'},
  text:{en:'A 50 ml bottle of jojoba oil, at a special Golden Envelope price.',zh:'一瓶 50 毫升荷荷巴油，黄金信封特价。'}},
 {id:'vitd',model:'vitd',d:0.5,img:'assets/items/vitd.png',h:1.0,orig:150,price:0,
  name:{en:'Vitamin D',zh:'维生素 D'},
  text:{en:'A pack of Vitamin D, yours free in this Golden Envelope.',zh:'一份维生素 D，本次黄金信封免费送您。'}},
 {id:'sheep',d:0.45,img:'assets/items/sheep.png',h:1.05,orig:null,price:0,
  name:{en:'ZÉLL-V sheep plush',zh:'ZÉLL-V 小羊公仔'},
  text:{en:'Our soft ZÉLL-V sheep to take home, yours free in this Golden Envelope.',zh:'柔软的 ZÉLL-V 小羊公仔，本次黄金信封免费送您。'}}
];
// silhouettes traced from the cutouts (0..1, y up) and their edge colour, used to give each gift real thickness
const SHAPES={"serum":{"pts":[[0.694,1.0],[0.6762,1.0],[0.5961,0.8744],[0.4698,0.6978],[0.1263,0.2833],[0.1228,0.27],[0.137,0.2533],[0.137,0.2411],[0.0747,0.1689],[0.0712,0.1356],[0.0125,0.0378],[0.0,0.0344],[0.0,0.0167],[0.032,0.01],[0.0391,0.0011],[0.0623,0.0011],[0.0694,0.0144],[0.1726,0.1111],[0.2064,0.1211],[0.2687,0.2],[0.3096,0.2033],[0.3292,0.2156],[0.7313,0.6378],[0.9021,0.8011],[0.9644,0.85],[0.9875,0.8767],[0.9982,0.8778],[0.9982,0.8867],[0.9822,0.8889],[0.6957,0.9933]],"edge":"#cdcbda"},"cream":{"pts":[[0.0,1.0],[0.0,0.93],[0.0314,0.9289],[0.1152,0.7144],[0.1675,0.2689],[0.1885,0.2556],[0.2827,0.2411],[0.2827,0.15],[0.3455,0.1311],[0.4188,0.0011],[0.5864,0.0011],[0.6492,0.1344],[0.7173,0.1511],[0.7173,0.2422],[0.801,0.2533],[0.8377,0.2667],[0.9058,0.7911],[0.9634,0.9333],[0.9948,0.9344],[0.9948,1.0]],"edge":"#d0cedd"},"bevite":{"pts":[[0.9985,0.9356],[0.7492,0.9911],[0.7415,1.0],[0.64,1.0],[0.6323,0.9922],[0.0,0.9767],[0.0,0.1056],[0.1062,0.1133],[0.2385,0.1],[0.2477,0.0811],[0.2231,0.0733],[0.2092,0.0544],[0.18,0.0456],[0.1677,0.0333],[0.1815,0.0256],[0.2185,0.0256],[0.2231,0.0167],[0.26,0.0244],[0.2754,0.0156],[0.3015,0.0144],[0.3231,0.03],[0.3492,0.0289],[0.3692,0.0389],[0.3892,0.0378],[0.4062,0.0233],[0.4169,0.04],[0.4492,0.0444],[0.4662,0.0256],[0.5862,0.0167],[0.6323,0.02],[0.6462,0.0122],[0.7123,0.0078],[0.7138,0.0011],[0.7415,0.0011],[0.7492,0.01],[0.9985,0.08]],"edge":"#ae9e3c"},"jojoba":{"pts":[[0.3438,1.0],[0.3406,0.9933],[0.2781,0.9867],[0.2562,0.97],[0.2562,0.8856],[0.2344,0.8611],[0.2438,0.8278],[0.2156,0.8211],[0.2281,0.8133],[0.2219,0.79],[0.2406,0.7856],[0.2406,0.7211],[0.2156,0.7067],[0.1438,0.6878],[0.075,0.6589],[0.0281,0.62],[0.0188,0.5922],[0.0,0.5911],[0.0,0.13],[0.0156,0.13],[0.0188,0.1222],[0.075,0.1067],[0.075,0.0944],[0.0188,0.0778],[0.0219,0.0011],[0.9781,0.0011],[0.9781,0.0711],[0.9562,0.0844],[0.9156,0.0933],[0.9156,0.1056],[0.9719,0.1211],[0.9781,0.1333],[0.9969,0.1344],[0.9969,0.5467],[0.9781,0.5478],[0.9688,0.6178],[0.9062,0.6656],[0.8,0.6989],[0.7562,0.7189],[0.7406,0.7822],[0.7656,0.7922],[0.7562,0.8022],[0.7656,0.82],[0.7375,0.8267],[0.7469,0.8489],[0.7281,0.8911],[0.7375,0.9133],[0.7188,0.9233],[0.7312,0.9567],[0.6781,0.9622],[0.6781,0.9833],[0.7031,0.9856],[0.6031,0.9933],[0.6,1.0]],"edge":"#dfb595"},"vitd":{"pts":[[0.3166,1.0],[0.3141,0.9922],[0.2215,0.9433],[0.2065,0.9433],[0.1777,0.9033],[0.1802,0.8822],[0.194,0.8622],[0.2178,0.8422],[0.2666,0.8244],[0.2628,0.7967],[0.224,0.7856],[0.169,0.7878],[0.0,0.7222],[0.0,0.6667],[0.0588,0.72],[0.1464,0.7644],[0.1615,0.7633],[0.169,0.7344],[0.1865,0.71],[0.1865,0.6967],[0.1477,0.6756],[0.0851,0.6178],[0.03,0.5422],[0.0388,0.1722],[0.0438,0.1656],[0.5369,0.0156],[0.5582,0.0078],[0.5594,0.0011],[0.582,0.0011],[0.6058,0.0211],[0.9662,0.21],[0.9737,0.6122],[0.9912,0.6289],[0.9987,0.7611],[0.8598,0.7944],[0.8648,0.8311],[0.821,0.9422],[0.7935,0.9589],[0.7472,0.9611],[0.6884,0.9433],[0.6145,0.9],[0.5795,0.8622],[0.4531,0.8844],[0.3717,0.9722],[0.3317,0.9933],[0.3304,1.0]],"edge":"#e0bf98"},"sheep":{"pts":[[0.9651,0.8012],[0.8965,0.8187],[0.8407,0.9088],[0.8081,0.924],[0.7488,0.9789],[0.7233,0.9883],[0.6872,0.9906],[0.6826,1.0],[0.6721,0.9906],[0.6558,0.9883],[0.6291,0.9906],[0.6244,1.0],[0.5779,1.0],[0.5698,0.9906],[0.5221,0.9906],[0.507,0.9789],[0.4826,0.9719],[0.443,0.9322],[0.436,0.9135],[0.4081,0.8854],[0.3919,0.8526],[0.3698,0.8304],[0.3349,0.8187],[0.3047,0.793],[0.2744,0.7895],[0.2605,0.7801],[0.2,0.7801],[0.1884,0.7731],[0.1581,0.7719],[0.1209,0.7216],[0.1105,0.6655],[0.0709,0.6187],[0.057,0.586],[0.0174,0.5298],[0.0093,0.4924],[0.0,0.331],[0.0198,0.317],[0.0221,0.2889],[0.0465,0.2678],[0.0558,0.2339],[0.0581,0.1579],[0.0709,0.1275],[0.1163,0.0947],[0.1686,0.0924],[0.2035,0.1029],[0.2209,0.1205],[0.236,0.1567],[0.2547,0.1602],[0.2791,0.1404],[0.2988,0.1345],[0.3093,0.0865],[0.3326,0.0421],[0.3547,0.0199],[0.4,0.0082],[0.4012,0.0012],[0.4605,0.0012],[0.4616,0.0082],[0.4965,0.0304],[0.5105,0.0632],[0.5233,0.0632],[0.536,0.048],[0.5488,0.0456],[0.5919,0.062],[0.6186,0.0643],[0.6698,0.0889],[0.7221,0.0737],[0.7791,0.0713],[0.8116,0.0784],[0.8326,0.1018],[0.8477,0.1368],[0.8477,0.1789],[0.836,0.2281],[0.8488,0.2304],[0.8593,0.2421],[0.8663,0.2982],[0.8593,0.3602],[0.8663,0.3895],[0.8849,0.4058],[0.8849,0.4292],[0.8942,0.4503],[0.8919,0.4924],[0.886,0.5006],[0.8919,0.593],[0.8988,0.5977],[0.8895,0.6211],[0.8919,0.6444],[0.9105,0.6608],[0.9279,0.6573],[0.9674,0.6678],[0.9779,0.6959],[0.9733,0.7287],[0.9988,0.738],[0.9826,0.7474],[0.9826,0.7684],[0.964,0.7766]],"edge":"#ead8cf"}};
const T={
 en:{title:'Golden Envelope',sub:'Buy 4 boxes or more for a Golden Envelope. Each one holds one of these gifts.',draw:'Draw',again:'Done',
   hint:'Press Draw to open the envelope. Drag to spin the gifts',spin:'Drag the gift to spin it',won:'Your Golden Envelope gift',orig:'Original price',special:'Special price',free:'Free',yours:'Yours',tc:'Terms and conditions apply.',
   rm:v=>`RM${v}`},
 zh:{title:'黄金信封',sub:'购买 4 盒或以上即可获得黄金信封，每个信封装有以下其中一份礼品。',draw:'抽奖',again:'完成',
   hint:'按抽奖打开信封，拖动可转动礼品',spin:'拖动礼品即可旋转',won:'您的黄金信封礼品',orig:'原价',special:'特价',free:'免费',yours:'送给您',tc:'受条规约束。',
   rm:v=>`RM${v}`}
};
const CSS=`
.ze{position:relative;overflow:hidden;width:100%;height:100%;font-family:'Montserrat',system-ui,sans-serif;color:#4a3a1c;user-select:none;-webkit-user-select:none;
  background:radial-gradient(ellipse 70% 60% at 50% 42%,#fffaf0 0%,#f7eedc 48%,#ead9b8 100%)}
.ze *{box-sizing:border-box;margin:0;padding:0}
.ze canvas.ze-gl{position:absolute;inset:0;width:100%;height:100%;display:block}
.ze-head{position:absolute;z-index:3;left:50%;transform:translateX(-50%);text-align:center;pointer-events:none;width:min(92%,720px);transition:opacity .6s}
.ze-head img{display:block;margin:0 auto 6px;filter:drop-shadow(0 2px 6px rgba(150,110,40,.18))}
.ze-head h1{font-family:'Playfair Display',Georgia,serif;font-style:italic;font-weight:700;line-height:1;letter-spacing:.01em;
  background:linear-gradient(180deg,#d9b25e,#a97d2c 60%,#7f5c1c);-webkit-background-clip:text;background-clip:text;color:transparent}
.ze.zh .ze-head h1{font-family:'Noto Serif SC',serif;font-style:normal;font-weight:900}
.ze-head p{font-weight:600;color:#7a6740;margin-top:10px;line-height:1.5;text-wrap:balance}
.ze-tags{position:absolute;inset:0;z-index:2;pointer-events:none;transition:opacity .5s}
.ze-tag{position:absolute;transform:translate(-50%,0);text-align:center;white-space:nowrap;transition:opacity .35s}
.ze-tag b{display:block;font-family:'Playfair Display',Georgia,serif;font-weight:700;font-size:13px;color:#5b4416}
.ze-tag span{font-size:10.5px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#9c7429}
.ze-ctr{position:absolute;z-index:4;left:50%;transform:translateX(-50%);width:max-content;max-width:92%;text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px}
.ze-btn{border:0;cursor:pointer;font:700 13px 'Montserrat',sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#43310d;padding:17px 46px;border-radius:2px;position:relative;overflow:hidden;
  background:linear-gradient(180deg,#f6e4b0 0%,#dfbb68 50%,#c39443 100%);box-shadow:inset 0 1px 0 rgba(255,250,230,.9),inset 0 0 0 1px rgba(150,108,36,.6),0 12px 28px rgba(140,100,30,.28);transition:transform .15s,filter .2s,opacity .4s}
.ze-btn::after{content:"";position:absolute;inset:0;background:linear-gradient(105deg,transparent 38%,rgba(255,255,255,.6) 50%,transparent 62%);transform:translateX(-120%);animation:zesh 3.6s infinite}
@keyframes zesh{60%,100%{transform:translateX(120%)}}
.ze-btn:hover{filter:brightness(1.04)}.ze-btn:active{transform:translateY(1px)}.ze-btn:focus-visible{outline:2px solid #8a6420;outline-offset:3px}
.ze-btn:disabled{opacity:.0;pointer-events:none}
.ze-hint{font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#7a6740;transition:opacity .4s}
.ze-tc{position:absolute;z-index:3;bottom:10px;left:0;right:0;text-align:center;font-size:10px;color:#9a8a66;letter-spacing:.06em;pointer-events:none}
.ze-flash{position:absolute;inset:0;z-index:5;pointer-events:none;opacity:0;background:radial-gradient(circle at 50% 50%,#fffef8 0%,rgba(255,248,224,.92) 35%,rgba(255,240,200,.5) 70%,rgba(255,240,200,0) 100%)}
.ze-panel{position:absolute;z-index:4;opacity:0;pointer-events:none;transition:opacity .7s,transform .7s cubic-bezier(.2,.8,.2,1)}
.ze-panel.on{opacity:1;pointer-events:auto}
.ze-panel small{display:block;font-size:11px;font-weight:800;letter-spacing:.26em;text-transform:uppercase;color:#9c7429}
.ze-panel h2{font-family:'Playfair Display',Georgia,serif;font-weight:700;line-height:1.1;color:#3f2f10;margin:12px 0 14px;text-wrap:balance}
.ze.zh .ze-panel h2{font-family:'Noto Serif SC',serif;font-weight:900}
.ze-orig{font-weight:600;color:#7a6740}
.ze-orig s{text-decoration-thickness:2px;text-decoration-color:#a3402e}
.ze-spl{margin-top:14px;font-size:11px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;color:#9c7429}
.ze-price{font-family:'Playfair Display',Georgia,serif;font-style:italic;font-weight:700;line-height:1;
  background:linear-gradient(180deg,#e6c36f,#b08431 60%,#7f5c1c);-webkit-background-clip:text;background-clip:text;color:transparent;padding-bottom:4px}
.ze-desc{margin-top:14px;line-height:1.6;color:#5c4b29;max-width:34ch;font-weight:500}
.ze-panel .ze-btn{margin-top:22px}
.ze-spin{display:none;margin-top:10px;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#9c7429}
.ze.narrow .ze-btn{padding:15px 34px;font-size:12px}
.ze-load{position:absolute;inset:0;z-index:9;display:grid;place-items:center;background:#f6efe1;font:600 12px 'Montserrat',sans-serif;letter-spacing:.24em;text-transform:uppercase;color:#9c7429;transition:opacity .8s}
.ze-load.gone{opacity:0;pointer-events:none}
@media (prefers-reduced-motion:reduce){.ze-btn::after{animation:none}}
`;
const HTML=`<canvas class="ze-gl" aria-label="A golden envelope with the Golden Envelope gifts floating around it"></canvas>
<div class="ze-tags"></div>
<div class="ze-head"><img alt="ZÉLL-V Golden Ticket"><h1></h1><p></p></div>
<div class="ze-panel" aria-live="polite"><small class="ze-wonL"></small><h2></h2><div class="ze-orig"></div><div class="ze-spl"></div><div class="ze-price"></div><p class="ze-desc"></p><p class="ze-spin"></p><button class="ze-btn ze-again"></button></div>
<div class="ze-ctr"><button class="ze-btn ze-draw"></button><div class="ze-hint"></div></div>
<div class="ze-tc"></div>
<div class="ze-flash"></div>
<div class="ze-load">Loading…</div>`;
const rnd=(a,b)=>a+Math.random()*(b-a),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const e3=t=>1-Math.pow(1-t,3),eio=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2,eback=t=>{const c=1.7;return 1+(c+1)*Math.pow(t-1,3)+c*Math.pow(t-1,2);};

window.ZellEnvelopeMount=function(root,opts){
const THREE=window.THREE;
const CFG=Object.assign({lang:'en',assets:{},items:null,pick:null,demo:true,quality:'high'},opts||{});
const ITEMSC=CFG.items||ITEMS;let L=T[CFG.lang]||T.en;
const txt=v=>v==null?'':(typeof v==='string'?v:(v[CFG.lang]||v.en||''));
root.classList.add('ze');root.classList.toggle('zh',CFG.lang==='zh');
if(!document.getElementById('ze-css')){const st=document.createElement('style');st.id='ze-css';st.textContent=CSS;document.head.appendChild(st);}
root.innerHTML=HTML;const q=s=>root.querySelector(s);
const LOW=CFG.quality==='low';
const glc=q('.ze-gl');
const renderer=new THREE.WebGLRenderer({canvas:glc,antialias:!LOW,alpha:false});
renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
renderer.shadowMap.enabled=!LOW;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.setClearColor(0xf7eedc,1);
const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(30,1,.1,100);
const col=h=>new THREE.Color(h).convertSRGBToLinear();
// the backdrop is painted inside WebGL (opaque canvas): glows and orbs blended over a transparent canvas
// come out wrong on some graphics cards (gold turned green), so nothing is left see-through
const bgC=document.createElement('canvas'),bgTex=new THREE.CanvasTexture(bgC);
{const bq=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({uniforms:{map:{value:bgTex}},depthTest:false,depthWrite:false,toneMapped:false,
  vertexShader:'varying vec2 vU;void main(){vU=uv;gl_Position=vec4(position.xy,1.,1.);}',fragmentShader:'uniform sampler2D map;varying vec2 vU;void main(){gl_FragColor=texture2D(map,vU);}'}));
  bq.frustumCulled=false;bq.renderOrder=-100;scene.add(bq);}
function paintBg(w,h){w=Math.max(4,Math.round(w/2));h=Math.max(4,Math.round(h/2));bgC.width=w;bgC.height=h;const g=bgC.getContext('2d'),rx=.7*w,ry=.6*h,k=ry/rx;
  g.fillStyle='#ead9b8';g.fillRect(0,0,w,h);g.setTransform(1,0,0,k,0,0);const gr=g.createRadialGradient(.5*w,.42*h/k,0,.5*w,.42*h/k,rx);
  gr.addColorStop(0,'#fffaf0');gr.addColorStop(.48,'#f7eedc');gr.addColorStop(1,'#ead9b8');g.fillStyle=gr;g.fillRect(0,0,w,h/k);bgTex.needsUpdate=true;}
(function(){const pm=new THREE.PMREMGenerator(renderer),env=new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(30,30,30),new THREE.MeshBasicMaterial({color:col('#5e4c34'),side:THREE.BackSide})));
  const panel=(w,h,x,y,z,ry,rx,k,c)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:col(c||'#fff6e6').multiplyScalar(k),side:THREE.DoubleSide}));m.position.set(x,y,z);m.rotation.set(rx||0,ry||0,0);env.add(m);};
  panel(16,6,0,12,0,0,Math.PI/2,5);panel(8,10,-13,4,4,Math.PI/2,0,3.4);panel(6,10,13,3,-2,-Math.PI/2,0,2.4,'#ffe7c0');panel(14,4,0,2,14,Math.PI,0,2.8);panel(20,3,0,-6,0,0,-Math.PI/2,1,'#e8d4a8');
  panel(1.2,9,-5,3,7,Math.PI*.8,0,9);panel(.8,9,6,3,5,-Math.PI*.75,0,7);panel(10,.6,0,7,-6,0,0,6);
  scene.environment=pm.fromScene(env,.035).texture;pm.dispose();})();
// lights
scene.add(new THREE.HemisphereLight(col('#fff8ec'),col('#cdb487'),.5));
const key=new THREE.DirectionalLight(col('#fff2dc'),1.15);key.position.set(-3,6,6);key.castShadow=true;key.shadow.mapSize.set(1024,1024);
Object.assign(key.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:1,far:20});key.shadow.bias=-.0005;key.shadow.radius=6;scene.add(key);
const rim=new THREE.DirectionalLight(col('#ffe3b0'),.5);rim.position.set(4,2,-4);scene.add(rim);
const innerLight=new THREE.PointLight(col('#fff1c8'),0,6,2);scene.add(innerLight);
// floor shadow catcher
const FLOOR=-2.1;
const floor=new THREE.Mesh(new THREE.PlaneGeometry(40,40),new THREE.ShadowMaterial({opacity:.16}));floor.rotation.x=-Math.PI/2;floor.position.y=FLOOR;floor.receiveShadow=true;floor.visible=false;scene.add(floor);

/* ---------- textures ---------- */
function canvasTex(w,h,draw,srgb=true){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);if(srgb)t.encoding=THREE.sRGBEncoding;t.anisotropy=8;return t;}
const paperBump=canvasTex(512,512,(g,w,h)=>{const id=g.createImageData(w,h);for(let i=0;i<id.data.length;i+=4){const v=118+Math.random()*20;id.data[i]=id.data[i+1]=id.data[i+2]=v;id.data[i+3]=255;}g.putImageData(id,0,0);
  g.globalAlpha=.08;for(let i=0;i<300;i++){g.fillStyle=Math.random()<.5?'#fff':'#000';g.fillRect(Math.random()*w,Math.random()*h,Math.random()*80,1);}},false);
paperBump.wrapS=paperBump.wrapT=THREE.RepeatWrapping;paperBump.repeat.set(3,3);
const glowTex=(c0,c1)=>canvasTex(256,256,(g,w)=>{const gr=g.createRadialGradient(w/2,w/2,0,w/2,w/2,w/2);gr.addColorStop(0,c0);gr.addColorStop(.25,c1);gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(0,0,w,w);},false);
const GLOW_GOLD=glowTex('rgba(255,246,214,1)','rgba(255,214,140,.5)'),GLOW_ORB=glowTex('rgba(255,196,84,.95)','rgba(236,164,52,.42)'),GLOW_WHITE=glowTex('rgba(255,255,255,1)','rgba(255,250,235,.6)');
const NORMAL_TEX=new Set();
const RAYS=canvasTex(1024,1024,(g,w)=>{g.translate(w/2,w/2);const n=28;for(let i=0;i<n;i++){const a=i/n*Math.PI*2,da=Math.PI/n*rnd(.25,.6),len=w/2*rnd(.7,1);
  const gr=g.createRadialGradient(0,0,0,0,0,len);gr.addColorStop(0,'rgba(255,250,230,.9)');gr.addColorStop(1,'rgba(255,230,170,0)');g.fillStyle=gr;g.beginPath();g.moveTo(0,0);g.arc(0,0,len,a-da,a+da);g.closePath();g.fill();}},false);

// fine foil grain + a faint diamond guilloche, multiplied into the gold
const foil=canvasTex(1024,1024,(g,w,h)=>{g.fillStyle='#f2f2f2';g.fillRect(0,0,w,h);
  for(let i=0;i<2600;i++){const v=Math.random()<.5?255:200;g.fillStyle=`rgba(${v},${v},${v},${rnd(.05,.18)})`;g.fillRect(Math.random()*w,Math.random()*h,rnd(20,140),1);}
  g.strokeStyle='rgba(170,170,170,.22)';g.lineWidth=1.2;for(let k=-w;k<w*2;k+=26){g.beginPath();g.moveTo(k,0);g.lineTo(k+h,h);g.stroke();g.beginPath();g.moveTo(k,h);g.lineTo(k+h,0);g.stroke();}
  const vg=g.createRadialGradient(w/2,h/2,w*.2,w/2,h/2,w*.75);vg.addColorStop(0,'rgba(255,255,255,0)');vg.addColorStop(1,'rgba(120,120,120,.28)');g.fillStyle=vg;g.fillRect(0,0,w,h);});
/* procedural surface detail: the height is computed per pixel from the object-space position,
   so wool curls and paper fibre stay crisp at any size with no texture to download */
const DUMMY=new THREE.DataTexture(new Uint8Array([128,128,128,255]),1,1);DUMMY.needsUpdate=true;
const GLSL_N=`
vec3 zh33(vec3 p){p=vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6)));return fract(sin(p)*43758.5453);}
float zworley(vec3 p){vec3 i=floor(p),f=fract(p);float d=8.;for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)for(int z=-1;z<=1;z++){vec3 g=vec3(float(x),float(y),float(z));vec3 r=g+zh33(i+g)-f;d=min(d,dot(r,r));}return sqrt(d);}
float zvn(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 float a=zh33(i).x,b=zh33(i+vec3(1.,0.,0.)).x,c=zh33(i+vec3(0.,1.,0.)).x,d=zh33(i+vec3(1.,1.,0.)).x,e=zh33(i+vec3(0.,0.,1.)).x,f2=zh33(i+vec3(1.,0.,1.)).x,g=zh33(i+vec3(0.,1.,1.)).x,h=zh33(i+vec3(1.,1.,1.)).x;
 return mix(mix(mix(a,b,f.x),mix(c,d,f.x),f.y),mix(mix(e,f2,f.x),mix(g,h,f.x),f.y),f.z);}
float zgH=0.;`;
const PERTURB=`vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
  vec3 vSigmaX = vec3( dFdx( surf_pos.x ), dFdx( surf_pos.y ), dFdx( surf_pos.z ) );vec3 vSigmaY = vec3( dFdy( surf_pos.x ), dFdy( surf_pos.y ), dFdy( surf_pos.z ) );
  vec3 vN = surf_norm;vec3 R1 = cross( vSigmaY, vN );vec3 R2 = cross( vN, vSigmaX );float fDet = dot( vSigmaX, R1 ) * faceDirection;
  vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );return normalize( abs( fDet ) * surf_norm - vGrad );}`;
function procBump(mat,key,code,attr){mat.bumpMap=DUMMY;mat.bumpScale=1;mat.customProgramCacheKey=()=>key;
  mat.onBeforeCompile=sh=>{
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vOP;'+(attr?'attribute float '+attr+';varying float vA;':''))
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvOP=position;'+(attr?'vA='+attr+';':''));
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vOP;'+(attr?'varying float vA;':'\n#define vA 1.0\n')+GLSL_N)
      .replace('#include <bumpmap_pars_fragment>','uniform sampler2D bumpMap;uniform float bumpScale;\nvec2 dHdxy_fwd(){return vec2(dFdx(zgH),dFdy(zgH));}\n'+PERTURB)
      .replace('#include <color_fragment>','#include <color_fragment>\n{vec3 p=vOP;'+code+'}');};
  return mat;}
// gold paper: a soft, uneven sheet (breaks up the reflections like real paper) with fine fibres
const PAPER_H='float lo=zvn(p*1.7+3.1)*.6+zvn(p*4.3+1.7)*.4;float fi=zvn(p*210.)*.6+zvn(vec3(p.x*520.,p.y*70.,p.z*520.))*.4;zgH=lo*.022+fi*.00045;diffuseColor.rgb*=.95+.08*lo;';
const paperMat=(c,k)=>procBump(new THREE.MeshPhysicalMaterial({color:col(c),metalness:.72,roughness:.34,clearcoat:.35,clearcoatRoughness:.28,envMapIntensity:1.35}),'paper'+k,PAPER_H);
/* ---------- materials ---------- */
const M={
  paper:paperMat('#d6ae5c',0),paperL:paperMat('#dfba6c',1),paperD:paperMat('#cfa552',2),
  lining:procBump(new THREE.MeshPhysicalMaterial({color:col('#f4e8cc'),metalness:.25,roughness:.55,side:THREE.DoubleSide}),'lining',PAPER_H),
  inside:new THREE.MeshStandardMaterial({color:col('#9b7a3c'),metalness:.4,roughness:.7}),
  edge:new THREE.LineBasicMaterial({color:col('#a8823a'),transparent:true,opacity:.55}),
};
/* ---------- envelope ---------- */
const EW=2.5,EH=1.66,ED=.06;
const env=new THREE.Group();scene.add(env);
const envInner=new THREE.Group();env.add(envInner);
function roundPts(pts,r){const out=[],n=pts.length;for(let i=0;i<n;i++){const p=pts[i],a=pts[(i-1+n)%n],b=pts[(i+1)%n];
  const da=Math.hypot(a[0]-p[0],a[1]-p[1]),db=Math.hypot(b[0]-p[0],b[1]-p[1]),rr=Math.min(r,da*.4,db*.4);
  const p1=[p[0]+(a[0]-p[0])/da*rr,p[1]+(a[1]-p[1])/da*rr],p2=[p[0]+(b[0]-p[0])/db*rr,p[1]+(b[1]-p[1])/db*rr];
  for(let k=0;k<=6;k++){const t=k/6,u=1-t;out.push([u*u*p1[0]+2*u*t*p[0]+t*t*p2[0],u*u*p1[1]+2*u*t*p[1]+t*t*p2[1]]);}}return out;}
function shapeMesh(pts,mat,z,r,depth){pts=roundPts(pts,r==null?.03:r);const s=new THREE.Shape();s.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)s.lineTo(pts[i][0],pts[i][1]);s.closePath();
  const g=new THREE.ExtrudeGeometry(s,{depth:depth||.003,bevelEnabled:true,bevelThickness:.003,bevelSize:.005,bevelSegments:3,curveSegments:4});
  const m=new THREE.Mesh(g,mat);m.position.z=z;m.castShadow=true;m.receiveShadow=true;return m;}
const back=shapeMesh([[-EW/2,-EH/2],[EW/2,-EH/2],[EW/2,EH/2],[-EW/2,EH/2]],M.paper,-ED,.045,ED-.012);envInner.add(back);
const pocket=new THREE.Mesh(new THREE.PlaneGeometry(EW*.96,EH*.9),M.inside);pocket.position.set(0,.02,.002);envInner.add(pocket);
const x=EW/2,y=EH/2,cy0=-.06;
const frontL=M.paperL.clone(),frontB=M.paper.clone();[frontL,frontB].forEach((m,k)=>{procBump(m,'front'+k,PAPER_H);m.transparent=true;m.opacity=1;});
const fronts=[shapeMesh([[-x,y],[-x,-y],[0,cy0]],frontL,.012,.035),shapeMesh([[x,y],[0,cy0],[x,-y]],frontL,.014,.035),shapeMesh([[-x,-y],[x,-y],[.18,-.02],[-.18,-.02]],frontB,.018,.05)];
fronts.forEach(m=>{m.renderOrder=10;envInner.add(m);});
// top flap, hinged on the top edge
const flap=new THREE.Group();flap.position.set(0,y,.022);envInner.add(flap);
const FL=EH*.66;
const FLP=[[-x,0],[x,0],[.16,-FL+.06],[0,-FL],[-.16,-FL+.06]];
const flapF=shapeMesh(FLP,M.paperD,.004,.07);flap.add(flapF);
const flapB=shapeMesh(FLP,M.lining,-.002,.07);flap.add(flapB);
// wax seal with the logo
const sealSide=new THREE.MeshPhysicalMaterial({color:col('#c3913c'),metalness:.62,roughness:.3,clearcoat:.8,clearcoatRoughness:.18,envMapIntensity:1.3});
let sealMat=new THREE.MeshPhysicalMaterial({color:col('#cf9f48'),metalness:.6,roughness:.32,clearcoat:.8,clearcoatRoughness:.2,envMapIntensity:1.3});
const SR=.25,sealPro=[[0,.042],[SR*.74,.042],[SR*.8,.05],[SR*.87,.056],[SR*.93,.05],[SR*.98,.034],[SR*1.02,.016],[SR*1.0,.003],[SR*.9,0],[0,0]];
const sealGeo=new THREE.LatheGeometry(sealPro.map(([r,yy])=>new THREE.Vector2(r,yy)).reverse(),96);
{const pp=sealGeo.attributes.position;for(let k=0;k<pp.count;k++){const X=pp.getX(k),Z=pp.getZ(k),a=Math.atan2(Z,X),rr=Math.hypot(X,Z);if(rr<1e-4)continue;
  const w=1+.03*Math.sin(5*a+1.3)+.018*Math.sin(9*a+.4)+.012*Math.sin(17*a+2.2),f=rr/SR>.85?w:1+(w-1)*Math.pow(rr/SR/.85,4);pp.setX(k,X*f);pp.setZ(k,Z*f);}sealGeo.computeVertexNormals();}
const seal=new THREE.Mesh(sealGeo,sealSide);seal.rotation.x=Math.PI/2;seal.position.set(0,-FL+.04,.03);seal.castShadow=true;flap.add(seal);
const sealFace=new THREE.Mesh(new THREE.CircleGeometry(SR*.76,64),sealMat);sealFace.position.set(0,-FL+.04,.03+.0425);flap.add(sealFace);
const sealGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW_GOLD,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,opacity:0}));sealGlow.scale.set(1.2,1.2,1);sealGlow.position.set(0,-FL+.04,.1);flap.add(sealGlow);
let flapOpen=0,flapTarget=0;
// light inside the envelope and the burst
const mouthGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW_WHITE,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,opacity:0}));mouthGlow.position.set(0,y-.05,.05);mouthGlow.scale.set(3,2,1);env.add(mouthGlow);
const edgeGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW_GOLD,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,opacity:0}));edgeGlow.position.set(0,0,-.2);edgeGlow.scale.set(5,3.6,1);env.add(edgeGlow);
const rays=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:RAYS,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,opacity:0,toneMapped:false}));rays.position.set(0,y,-.3);rays.scale.set(9,9,1);env.add(rays);
const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW_GOLD,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,opacity:.2}));halo.position.set(0,0,-.6);halo.scale.set(6.5,5,1);env.add(halo);
const ENV_POS=new THREE.Vector3(0,.15,0);env.position.copy(ENV_POS);env.rotation.x=-.06;

/* ---------- items ---------- */
const items=[];const loader=new THREE.TextureLoader();
const src=u=>(window.ZELL_ENV_IMAGES&&window.ZELL_ENV_IMAGES[u])||u;
const shadowTex=canvasTex(128,64,(g,w,h)=>{const gr=g.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);gr.addColorStop(0,'rgba(90,60,20,.35)');gr.addColorStop(1,'rgba(90,60,20,0)');g.setTransform(1,0,0,.5,0,h/4);g.fillStyle=gr;g.fillRect(0,0,w,w);},false);
function giftGeo(it,w,h){const sp=SHAPES[it.id];if(!sp)return null;const dep=it.d||.25;
  const sh=new THREE.Shape();sp.pts.forEach(([u,v],k)=>{const X=(u-.5)*w,Y=(v-.5)*h;k?sh.lineTo(X,Y):sh.moveTo(X,Y);});
  const g=new THREE.ExtrudeGeometry(sh,{depth:dep,bevelEnabled:true,bevelThickness:dep*.14,bevelSize:Math.min(w,h)*.012,bevelOffset:-Math.min(w,h)*.02,bevelSegments:3,curveSegments:2});
  g.translate(0,0,-dep/2);const pos=g.attributes.position,uv=g.attributes.uv;
  for(let k=0;k<pos.count;k++){const X=pos.getX(k),Y=pos.getY(k),Z=pos.getZ(k);let u=X/w+.5;if(Z<0)u=1-u;uv.setXY(k,u,Y/h+.5);} // back reads the right way round
  g.computeVertexNormals();return g;}
/* real 3D models built from the product photos (zell-envelope-models.js), and the present modelled here */
const b64=x=>Uint8Array.from(atob(x),c=>c.charCodeAt(0));
function texP(u){return new Promise(r=>loader.load(u,t=>{t.encoding=THREE.sRGBEncoding;t.anisotropy=8;r(t);},undefined,()=>r(null)));}
const photoMat=(t,o)=>new THREE.MeshPhysicalMaterial(Object.assign({map:t,emissiveMap:t,emissive:new THREE.Color(1,1,1),emissiveIntensity:.16,roughness:.48,metalness:0,clearcoat:.45,clearcoatRoughness:.22,envMapIntensity:.95},o||{}));
async function buildModel(it){const MD=window.ZELL_ENV_MODELS||{},m=MD[it.id],h=it.h;
  if(it.model==='gift')return giftModel(h);
  if(it.model==='vitd')return vitdModel(h);
  if(!m)return null;
  if(m.type==='box'){const f=m.faces;const [tf,tb,tl,tr]=await Promise.all([f.front,f.back,f.left,f.right].map(texP));
    const top=new THREE.MeshPhysicalMaterial({color:col(m.top),roughness:.48,emissive:col(m.top),emissiveIntensity:.12,clearcoat:.45,clearcoatRoughness:.22});const w=h*m.w,d=h*m.d;
    const geo=new THREE.BoxGeometry(w,h,d);return {obj:new THREE.Mesh(geo,[photoMat(tr),photoMat(tl),top,top,photoMat(tf),photoMat(tb)]),w,h};}
  if(m.type==='lathe'){const t=await texP(m.map);t.wrapS=THREE.RepeatWrapping;
    const geo=new THREE.LatheGeometry(m.pts.map(([r,y])=>new THREE.Vector2(r*h,(y-.5)*h)),80);
    const rm=canvasTex(4,256,(g,w,H)=>{g.fillStyle='rgb(0,110,0)';g.fillRect(0,0,w,H);g.fillStyle='rgb(0,60,255)';g.fillRect(0,0,w,H*(1-m.capV));},false);
    const mat=new THREE.MeshPhysicalMaterial({map:t,emissiveMap:t,emissive:new THREE.Color(1,1,1),emissiveIntensity:.15,roughness:1,metalness:1,roughnessMap:rm,metalnessMap:rm,clearcoat:1,clearcoatRoughness:.06,envMapIntensity:1.2,side:THREE.DoubleSide});
    let w=0;m.pts.forEach(p=>w=Math.max(w,p[0]*2*h));return {obj:new THREE.Mesh(geo,mat),w,h};}
  if(m.type==='tube'){const t=await texP(m.map);t.wrapS=THREE.RepeatWrapping;return tubeModel(m,t,h);}
  if(m.type==='mesh'){const q=new Int16Array(b64(m.pos).buffer),c8=b64(m.col),ix=new Uint16Array(b64(m.idx).buffer);
    const pos=new Float32Array(q.length),cl=new Float32Array(q.length);for(let k=0;k<q.length;k++){pos[k]=q[k]*m.scale*h;cl[k]=Math.pow(c8[k]/255,2.2);}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('color',new THREE.BufferAttribute(cl,3));geo.setIndex(new THREE.BufferAttribute(ix,1));geo.computeVertexNormals();
    const wl=m.wl?b64(m.wl):null,wa=new Float32Array(q.length/3);for(let k=0;k<wa.length;k++)wa[k]=wl?wl[k]/255:1;geo.setAttribute('wl',new THREE.BufferAttribute(wa,1));
    const mat=new THREE.MeshPhysicalMaterial({vertexColors:true,color:new THREE.Color(1.02,1.02,1.02),roughness:.95,metalness:0,envMapIntensity:.7,side:THREE.DoubleSide});
    if('sheen' in mat)mat.sheen=new THREE.Color(.55,.52,.47);
    const cs=(22/h).toFixed(2),cs2=(50/h).toFixed(2);
    procBump(mat,'wool'+cs,`float a1=clamp(1.6-length(fwidth(p*${cs}))*2.2,0.,1.),a2=clamp(1.6-length(fwidth(p*${cs2}))*2.2,0.,1.);
      float w1=zworley(p*${cs});float w2=zworley(p*${cs2}+7.3);float c1=mix(.5,1.-smoothstep(.12,.8,w1),a1);float c2=mix(.5,1.-smoothstep(.1,.75,w2),a2);
      zgH=(c1*.8+c2*.3)*${(.0065*h).toFixed(4)}*vA+zvn(p*${(300/h).toFixed(1)})*${(.0005*h).toFixed(5)}*(1.-vA);diffuseColor.rgb*=mix(1.,.9+.12*c1,vA);`,'wl');
    const grp=new THREE.Group();grp.add(new THREE.Mesh(geo,mat));
    if(m.eyes){const em=new THREE.MeshPhysicalMaterial({color:col('#120e10'),roughness:.06,metalness:0,clearcoat:1,clearcoatRoughness:.04,envMapIntensity:1.6});
      m.eyes.forEach(p=>{const e=new THREE.Mesh(new THREE.SphereGeometry(m.eyeR*h,28,20),em);e.position.set(p[0]*h,p[1]*h,p[2]*h);e.scale.set(1,1.15,.72);grp.add(e);});}
    if(m.nose){const nm=new THREE.MeshStandardMaterial({color:col('#2b2326'),roughness:.85});const [c,b,l,r]=m.nose.map(p=>new THREE.Vector3(p[0]*h,p[1]*h,p[2]*h));
      [[c,b],[c,l],[c,r]].forEach(([a,b2])=>grp.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(a,b2),3,(m.noseR||.0048)*h,6,false),nm)));}
    return {obj:grp,w:h*m.w,h};}
  return null;}
function tubeModel(m,tex,h){const T=1+m.crimp+m.ferruleL+m.noz+.025,L=h/T,r0=m.r0*L,g=new THREE.Group();
  const yTop=h/2-(m.noz+m.ferruleL+.025)*L,yBot=yTop-L;const NS=72,NL=60,pos=[],uv=[],idx=[];
  for(let j=0;j<=NL;j++){const t=j/NL,a=r0*(1+(m.flat-1)*Math.pow(t,1.3)),b=r0*Math.max(.07,1-Math.pow(t,1.15)),y=yTop-t*L;
    for(let i=0;i<=NS;i++){const th=-Math.PI/2+i/NS*Math.PI*2;pos.push(a*Math.sin(th),y,b*Math.cos(th));uv.push(i/NS,1-t);}}
  for(let j=0;j<NL;j++)for(let i=0;i<NS;i++){const p=j*(NS+1)+i,q=p+NS+1;idx.push(p,q,p+1,p+1,q,q+1);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeVertexNormals();
  const skin=new THREE.MeshPhysicalMaterial({map:tex,emissiveMap:tex,emissive:new THREE.Color(1,1,1),emissiveIntensity:.15,roughness:.4,metalness:0,clearcoat:.7,clearcoatRoughness:.12,envMapIntensity:1,side:THREE.DoubleSide});
  g.add(new THREE.Mesh(geo,skin));
  const white=new THREE.MeshPhysicalMaterial({color:col('#f4f4f2'),roughness:.4,emissive:col('#f4f4f2'),emissiveIntensity:.08,clearcoat:.6,clearcoatRoughness:.15});
  const metal=new THREE.MeshStandardMaterial({color:col('#e9eaee'),metalness:1,roughness:.1,envMapIntensity:1.6});
  const fR=m.ferruleR*L,fl=m.ferruleL*L,nz=m.noz*L;
  const dome=new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(r0,0),new THREE.Vector2(r0*.96,.012*L),new THREE.Vector2(fR*1.02,.025*L),new THREE.Vector2(0,.025*L)].reverse(),48),white);dome.position.y=yTop;g.add(dome);
  const fer=new THREE.Mesh(new THREE.CylinderGeometry(fR,fR,fl,48),metal);fer.position.y=yTop+.025*L+fl/2;g.add(fer);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(fR*.98,fR*.06,8,48),metal);ring.rotation.x=Math.PI/2;ring.position.y=yTop+.025*L+fl*.62;g.add(ring);
  const noz=new THREE.Mesh(new THREE.CylinderGeometry(fR*.2,fR*.62,nz,40),metal);noz.position.y=yTop+.025*L+fl+nz/2;g.add(noz);
  const ribs=canvasTex(256,32,(c,w,hh)=>{c.fillStyle='#f6f6f4';c.fillRect(0,0,w,hh);c.fillStyle='rgba(0,0,0,.09)';for(let x=2;x<w;x+=5)c.fillRect(x,3,1.4,hh-6);});
  const a1=r0*m.flat;const crimp=new THREE.Mesh(new THREE.BoxGeometry(a1*2.02,m.crimp*L,r0*.14),new THREE.MeshStandardMaterial({map:ribs,roughness:.55,emissiveMap:ribs,emissive:new THREE.Color(1,1,1),emissiveIntensity:.18}));
  crimp.position.y=yBot-m.crimp*L/2+.004*L;g.add(crimp);
  return {obj:g,w:a1*2,h};}
function blobTex(label,bump){return canvasTex(2048,1024,(g,w,hh)=>{
  if(bump){g.fillStyle='#fff';g.fillRect(0,0,w,hh);}else{const v=g.createLinearGradient(0,0,0,hh);v.addColorStop(0,'#fff4d2');v.addColorStop(.38,'#f6d07a');v.addColorStop(.7,'#e2a845');v.addColorStop(1,'#b8792a');g.fillStyle=v;g.fillRect(0,0,w,hh);}
  if(label){g.font="italic 700 124px 'Playfair Display', Georgia, serif";g.textAlign='center';g.textBaseline='middle';
    if(bump){g.filter='blur(3px)';g.fillStyle='#000';g.fillText(label,w*.25,hh*.5);g.filter='none';}
    else{g.fillStyle='rgba(255,246,220,.55)';g.fillText(label,w*.25+2,hh*.5+3);g.fillStyle='#7d4c12';g.fillText(label,w*.25,hh*.5);}}},!bump);}
function vitdModel(h){const g=new THREE.Group(),Rr=h/2.3;
  const mat=(tex,bm)=>new THREE.MeshPhysicalMaterial({map:tex,bumpMap:bm||null,bumpScale:.012,emissiveMap:tex,emissive:new THREE.Color(1,.78,.45),emissiveIntensity:.1,roughness:.2,metalness:.38,clearcoat:1,clearcoatRoughness:.09,envMapIntensity:1.5});
  const big=new THREE.Mesh(new THREE.SphereGeometry(Rr,96,64),mat(blobTex('Vitamin D'),blobTex('Vitamin D',true)));big.position.y=.08*Rr;big.rotation.y=.62;g.add(big);
  const sm=mat(blobTex(''));const drops=[];
  [[.95,.5,.3,.36,.0],[-1.1,.18,.18,.2,2.1],[-.7,-.85,.36,.15,3.6],[.9,-.7,-.1,.12,5.0]].forEach(([x,y,z,r,ph])=>{const m=new THREE.Mesh(new THREE.SphereGeometry(Rr*r,48,32),sm);g.add(m);drops.push({m,x,y,z,ph,r});});
  g.userData.tick=t=>drops.forEach(d=>{const a=t*.35+d.ph,rr=Math.hypot(d.x,d.z);d.m.position.set(Math.cos(a)*rr*Rr*1.02,(d.y+Math.sin(t*.9+d.ph)*.05)*Rr+big.position.y,Math.sin(a)*rr*Rr*1.02);});
  g.userData.tick(0);
  return {obj:g,w:Rr*2.5,h};}
function giftModel(h){const g=new THREE.Group(),s=h*.8,bh=s*.78,lh=s*.17;
  const paper=new THREE.MeshPhysicalMaterial({color:col('#e6c57c'),map:foil,metalness:.65,roughness:.32,clearcoat:.5,clearcoatRoughness:.2});
  const satin=new THREE.MeshPhysicalMaterial({color:col('#fbf7ee'),roughness:.3,metalness:0,clearcoat:.35,clearcoatRoughness:.3,emissive:col('#fff8ea'),emissiveIntensity:.12});
  const y0=-h/2;const add=(geo,mat,x,y,z,rx,ry,rz)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.rotation.set(rx||0,ry||0,rz||0);g.add(m);return m;};
  add(new THREE.BoxGeometry(s,bh,s),paper,0,y0+bh/2,0);
  add(new THREE.BoxGeometry(s*1.05,lh,s*1.05),paper,0,y0+bh+lh/2-lh*.35,0);
  const rw=s*.15,top=y0+bh+lh*.65;
  add(new THREE.BoxGeometry(rw,bh+lh*.7,s*1.07),satin,0,y0+(bh+lh*.65)/2,0);add(new THREE.BoxGeometry(s*1.07,bh+lh*.7,rw),satin,0,y0+(bh+lh*.65)/2,0);
  const loop=new THREE.TorusGeometry(s*.17,s*.042,14,40);
  [[-1,.5],[1,-.5],[-1,-.9+Math.PI],[1,.9]].slice(0,2).forEach(([sx,ry])=>{const m=add(loop,satin,sx*s*.15,top+s*.12,0,0,ry*.6,sx*.5);m.scale.set(1,.68,.55);});
  [[-1,.6],[1,-.6]].forEach(([sx,ry])=>{const m=add(loop,satin,0,top+s*.1,sx*s*.13,0,Math.PI/2+ry*.5,sx*.45);m.scale.set(.85,.6,.5);});
  add(new THREE.SphereGeometry(s*.075,24,16),satin,0,top+s*.06,0).scale.set(1,.8,1);
  const tail=new THREE.BoxGeometry(rw*.8,s*.02,s*.3);[[-1],[1]].forEach(([sx])=>add(tail,satin,sx*s*.12,top+s*.01,s*.18,0,sx*.5,0));
  return {obj:g,w:s*1.05,h};}
function finishItem(it,i,obj,w,h,res){
  obj.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}});
  const mats=[];obj.traverse(n=>{if(n.material)(Array.isArray(n.material)?n.material:[n.material]).forEach(m=>{if(m.emissive&&!mats.includes(m))mats.push(m);});});
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW_GOLD,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,opacity:.1}));glow.scale.set(Math.max(w,h)*1.6,Math.max(w,h)*1.6,1);glow.position.z=-.3;
  const sh=new THREE.Mesh(new THREE.PlaneGeometry(w*1.1,w*.45),new THREE.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false}));sh.rotation.x=-Math.PI/2;
  const g=new THREE.Group();g.add(glow,obj);scene.add(g);scene.add(sh);
  items.push({it,i,g,mesh:obj,mats,glow,sh,w,h,phase:i/ITEMSC.length*Math.PI*2,bob:rnd(0,6),spin:rnd(0,6),spinV:rnd(.45,.7)*(i%2?1:-1),vis:1,orb:null});res();}
function loadItem(it,i){return new Promise(res=>{buildModel(it).then(md=>{if(md)return finishItem(it,i,md.obj,md.w,md.h,res);loadFlat(it,i,res);}).catch(()=>loadFlat(it,i,res));});}
function loadFlat(it,i,res){loader.load(src(it.img),t=>{t.encoding=THREE.sRGBEncoding;t.anisotropy=8;
  const asp=t.image.width/t.image.height,h=it.h,w=h*asp;
  const face=new THREE.MeshStandardMaterial({map:t,emissiveMap:t,emissive:new THREE.Color(1,1,1),emissiveIntensity:.42,roughness:.42,metalness:0,envMapIntensity:.7,alphaTest:.5,transparent:false});
  const side=new THREE.MeshStandardMaterial({map:t,color:new THREE.Color(.9,.9,.9),emissiveMap:t,emissive:new THREE.Color(1,1,1),emissiveIntensity:.25,roughness:.45,metalness:.05,envMapIntensity:.8}); // sides carry the colours at the silhouette's edge
  const geo=giftGeo(it,w,h)||new THREE.BoxGeometry(w,h,.1);
  const mesh=new THREE.Mesh(geo,[face,side]);
  mesh.customDepthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map:t,alphaTest:.5});
  finishItem(it,i,mesh,w,h,res);},undefined,()=>res());}

/* ---------- orbs and sparks ---------- */
const orbMats=[];
// gold orbs use a standard physical material (the same lighting path as the envelope), so they show the same gold on every graphics card
function orbMaterial(){const m=new THREE.MeshPhysicalMaterial({color:col('#f0b545'),metalness:.85,roughness:.16,clearcoat:1,clearcoatRoughness:.05,emissive:col('#ffb238'),emissiveIntensity:.32,envMapIntensity:1.7,transparent:true,opacity:1});orbMats.push(m);return m;}
function makeOrb(){
  const g=new THREE.Group();
  const core=new THREE.Mesh(new THREE.SphereGeometry(.17,48,32),orbMaterial());
  const inner=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW_WHITE,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,opacity:.75}));inner.scale.set(.2,.2,1);inner.material.opacity=.35;inner.position.set(-.04,.05,.18);
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW_ORB,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,opacity:.45}));glow.scale.set(1.05,1.05,1);
  g.add(glow,core,inner);g.userData={core,glow,inner,trail:[]};g.userData.front=on=>{if(g.userData.on===on)return;g.userData.on=on;[core,glow,inner].forEach(n=>{n.material.depthTest=!on;n.renderOrder=on?5:0;});};scene.add(g);return g;
}
const sparks=[];
const BL=t=>NORMAL_TEX.has(t)?THREE.NormalBlending:THREE.AdditiveBlending;
function sparkBurst(pos,n,cols,speed=2.2,size=.14){for(let i=0;i<n;i++){const tx=cols[i%cols.length];const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tx,blending:BL(tx),transparent:true,depthWrite:false}));
  s.position.copy(pos);const v=new THREE.Vector3(rnd(-1,1),rnd(-1,1),rnd(-1,1)).normalize().multiplyScalar(rnd(.4,1)*speed);const sz=rnd(.5,1.2)*size;s.scale.set(sz,sz,1);scene.add(s);sparks.push({s,v,life:1,decay:rnd(.6,1.1)});}}
function trailSpark(pos,tex){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,blending:BL(tex),transparent:true,depthWrite:false,opacity:.7}));s.position.copy(pos);const sz=rnd(.12,.24);s.scale.set(sz,sz,1);scene.add(s);sparks.push({s,v:new THREE.Vector3(rnd(-.1,.1),rnd(-.05,.15),rnd(-.1,.1)),life:.8,decay:1.6});}
function stepSparks(dt){for(let i=sparks.length-1;i>=0;i--){const p=sparks[i];p.life-=dt*p.decay;if(p.life<=0){scene.remove(p.s);p.s.material.dispose();sparks.splice(i,1);continue;}
  p.s.position.addScaledVector(p.v,dt);p.v.multiplyScalar(Math.pow(.25,dt));p.s.material.opacity=Math.min(1,p.life*1.4);}}
// ambient gold dust
const dust=[];for(let i=0;i<60;i++){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW_GOLD,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,opacity:rnd(.15,.5)}));
  s.position.set(rnd(-6,6),rnd(-2,4),rnd(-3,2));const sz=rnd(.04,.12);s.scale.set(sz,sz,1);scene.add(s);dust.push({s,sp:rnd(.05,.2),ph:rnd(0,6)});}

/* ---------- layout ---------- */
let W=1,H=1,narrow=false,orbitR={x:3,y:1.35,z:1.1};
const TANH=Math.tan(THREE.MathUtils.degToRad(15));
function layout(){
  W=root.clientWidth||1;H=root.clientHeight||1;narrow=W<760||W/H<.95;root.classList.toggle('narrow',narrow);
  renderer.setPixelRatio(LOW?1:Math.min(2,window.devicePixelRatio||1));renderer.setSize(W,H,false);paintBg(W,H);camera.aspect=W/H;
  orbitR=narrow?{x:1.38,y:1.8,z:1.35}:{x:3.3,y:.8,z:1.8};
  const needW=narrow?(orbitR.x*2+.9):(orbitR.x*2+2.2),needH=narrow?(orbitR.y*2+4.4):(orbitR.y*2+3.6);
  const dist=Math.max(needH/2/TANH,needW/camera.aspect/2/TANH);
  const cy=narrow?ENV_POS.y+.35:ENV_POS.y+.3;
  camera.position.set(0,cy+.6,dist);camera.lookAt(0,cy,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
  const head=q('.ze-head'),img=head.querySelector('img'),h1=head.querySelector('h1'),p=head.querySelector('p'),ctr=q('.ze-ctr');
  img.style.height=(narrow?clamp(H*.065,40,64):clamp(H*.085,52,90))+'px';h1.style.fontSize=(narrow?clamp(W*.11,34,46):clamp(H*.07,40,64))+'px';p.style.fontSize=(narrow?12.5:14)+'px';
  head.style.top=(H*.03)+'px';ctr.style.bottom=(narrow?H*.045:H*.045)+'px';
  const pan=q('.ze-panel');
  if(narrow){pan.style.cssText=`left:24px;right:24px;bottom:${H*.05}px;text-align:center`;pan.querySelector('h2').style.fontSize='28px';q('.ze-price').style.fontSize='54px';q('.ze-desc').style.margin='12px auto 0';}
  else{pan.style.cssText=`left:52%;width:${Math.min(W*.36,460)}px;top:50%;transform:translateY(-50%);text-align:left`;pan.querySelector('h2').style.fontSize=clamp(H*.05,30,44)+'px';q('.ze-price').style.fontSize=clamp(H*.11,60,96)+'px';q('.ze-desc').style.margin='14px 0 0';}
}
const _v=new THREE.Vector3();function toScreen(v){_v.copy(v).project(camera);return {x:(_v.x+1)/2*W,y:(1-_v.y)/2*H};}

const envOff=new THREE.Vector3();
function wonFront(){return narrow?new THREE.Vector3(0,ENV_POS.y+1.05,1.4):new THREE.Vector3(-1.75,ENV_POS.y+.35,1.5);}
function wonEnv(){return narrow?{x:0,y:1.15,z:-1.6,s:.62}:{x:-1.75,y:-.15,z:-1.8,s:.7};}
const WONS=()=>narrow?1.7:1.75;
/* ---------- sound ---------- */
let AC=null,muted=CFG.sound===false;
function ac(){if(!AC){try{AC=new (window.AudioContext||window.webkitAudioContext)();}catch(e){}}if(AC&&AC.state==='suspended')AC.resume();return AC;}
function tone(f,d,type,vol,when=0,f2){const a=ac();if(!a||muted)return;const t=a.currentTime+when,o=a.createOscillator(),g=a.createGain();o.type=type||'sine';o.frequency.setValueAtTime(f,t);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+d);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g).connect(a.destination);o.start(t);o.stop(t+d+.05);}
function noise(d,vol,f0,f1,when=0){const a=ac();if(!a||muted)return;const t=a.currentTime+when,b=a.createBuffer(1,Math.max(1,a.sampleRate*d|0),a.sampleRate),ch=b.getChannelData(0);for(let i=0;i<ch.length;i++)ch[i]=Math.random()*2-1;const s=a.createBufferSource();s.buffer=b;const fl=a.createBiquadFilter();fl.type='bandpass';fl.Q.value=1.1;fl.frequency.setValueAtTime(f0,t);fl.frequency.exponentialRampToValueAtTime(f1,t+d);const g=a.createGain();g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);s.connect(fl).connect(g).connect(a.destination);s.start(t);}
const shimmer=(w=0)=>[0,3,7,10,14].forEach((s,i)=>tone(1046*Math.pow(2,s/12),.5,'sine',.035,w+i*.05));
function rattle(d){for(let t=0;t<d;t+=rnd(.05,.11))noise(.05,.05+.14*t/d,900,500,t);}
function boom(){noise(1.4,.35,180,60);tone(110,1.2,'sine',.25,0,55);[0,4,7,12,16,19].forEach((s,i)=>tone(523*Math.pow(2,s/12),1.6,'triangle',.06,.1+i*.06));}
const pop=()=>{noise(.25,.25,2000,600);[0,7,12].forEach((s,i)=>tone(880*Math.pow(2,s/12),.9,'sine',.07,i*.05));};

/* ---------- state ---------- */
let state='idle',time=0,orbitSpeed=.16,orbitA=0,orbitVel=0,orbitScale=1,orbitPull=0,shake=0,won=null,wonMesh=null,lastTouch=0;
const pullTarget=new THREE.Vector3(),mouthW=new THREE.Vector3(),_up=new THREE.Vector3(),_c=new THREE.Vector3(),_qa=new THREE.Quaternion(),_qb=new THREE.Quaternion(),AX=new THREE.Vector3(1,0,0),AY=new THREE.Vector3(0,1,0),_e=new THREE.Euler();
const _p=new THREE.Vector3();
function itemPos(o,a,out){const r=orbitR,s=orbitScale;_c.set(0,ENV_POS.y+(narrow?.1:.22),0).lerp(pullTarget,orbitPull);
  out.set(_c.x+Math.cos(a)*r.x*s,_c.y-Math.sin(a)*r.y*s*(1-.55*orbitPull)+Math.sin(time*1.1+o.bob)*.1*s,_c.z+Math.sin(a)*r.z*s);return out;}
function updateItems(dt){
  orbitA+=(orbitSpeed+orbitVel)*dt;if(!(drag&&state==='idle'))orbitVel*=Math.exp(-1.1*dt);
  for(const o of items){
    const a=o.phase+orbitA;if(!o.fixed)itemPos(o,a,o.g.position);
    if(o.orb){const d=o.orb.userData.dive||0;if(d>0)o.orb.position.copy(o.g.position).lerp(mouthW,eio(d));else o.orb.position.copy(o.g.position);
      o.orb.scale.setScalar(Math.max(.001,(o.orb.userData.s||0)*(1-.45*d)));}
    if(o.vis<=0){o.g.visible=false;o.sh.visible=false;continue;}
    o.g.visible=true;
    if(o.fixed){const touching=drag&&state==='won';
      if(!touching){const sp=o.av.length();if(sp>1e-4){_qa.setFromAxisAngle(_up.copy(o.av).divideScalar(sp),sp*dt);o.q.premultiply(_qa);}o.av.multiplyScalar(Math.exp(-.75*dt));
        if(sp<.6&&time-lastTouch>1.2){_e.setFromQuaternion(o.q,'YXZ');const k=Math.min(1,dt*1.6);_e.x*=1-k;_e.z*=1-k;_e.y+=.38*dt*(1-sp/.6);o.q.setFromEuler(_e);}}
      o.g.quaternion.copy(o.q);}
    else{o.spin+=o.spinV*dt*(1+(orbitSpeed+Math.abs(orbitVel))*1.5);o.g.rotation.set(Math.sin(time*.7+o.bob)*.12,o.spin,Math.sin(time*.5+o.bob)*.08);}
    if(o.mesh.userData.tick)o.mesh.userData.tick(time);
    o.g.scale.setScalar(Math.max(.001,o.vis));
    o.sh.visible=o.vis>.05;o.sh.position.set(o.g.position.x,FLOOR+.01,o.g.position.z);const hgt=o.g.position.y-FLOOR;o.sh.scale.setScalar(Math.max(.3,1.2-hgt*.12)*o.vis);o.sh.material.opacity=clamp(.9-hgt*.12,.15,.8)*o.vis;
  }
  // tags under items (desktop, idle only)
  const tags=q('.ze-tags');if(!narrow&&state==='idle'){tags.style.opacity=1;items.forEach((o,i)=>{const el=tags.children[i];if(!el)return;const up=o.g.position.y>ENV_POS.y+.9;_p.copy(o.g.position);_p.y+=up?o.h/2+.06:-(o.h/2+.08);const s=toScreen(_p);el.style.left=s.x+'px';el.style.top=s.y+'px';el.style.transform=up?'translate(-50%,-100%)':'translate(-50%,0)';const nearBtn=Math.abs(s.x-W/2)<190&&s.y>H*.72,nearEnv=Math.abs(s.x-W/2)<W*.11&&s.y>H*.2&&s.y<H*.68;el.style.opacity=(nearBtn||nearEnv||o.g.position.z<-.4)?0:1;});}
  else tags.style.opacity=0;
}
function buildTags(){const tags=q('.ze-tags');tags.innerHTML='';for(const o of items){const d=document.createElement('div');d.className='ze-tag';
  d.innerHTML=`<b>${esc(txt(o.it.name))}</b><span>${o.it.price?L.rm(o.it.price):L.free}</span>`;tags.appendChild(d);}}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// tweens run on the scene clock, so a slow frame slows the show down instead of skipping it
const tasks=[];function tween(dur,fn){return new Promise(res=>{tasks.push({t:0,dur,fn,res});fn(0);});}
const wait=ms=>tween(ms/1000,()=>{});
function stepTasks(dt){for(let i=tasks.length-1;i>=0;i--){const a=tasks[i];a.t+=dt;const k=Math.min(1,a.t/a.dur);a.fn(k);if(k>=1){tasks.splice(i,1);a.res();}}}

async function abortDraw(){
  shake=0;edgeGlow.material.opacity=0;sealGlow.material.opacity=0;mouthGlow.material.opacity=0;innerLight.intensity=0;rays.material.opacity=0;
  flapTarget=0;orbitPull=0;orbitScale=1;orbitSpeed=.16;orbitVel=0;
  for(const o of items){o.fixed=false;o.vis=0;o.morphed=false;if(o.orb){scene.remove(o.orb);o.orb=null;}}
  await tween(.7,k=>{for(const o of items)o.vis=eback(clamp(k*1.3-o.i*.06,0,1));});
  for(const o of items){o.vis=1;if(o.glow)o.glow.material.opacity=.1;}
  q('.ze-head').style.opacity=1;q('.ze-draw').disabled=false;q('.ze-hint').style.opacity=1;state='idle';
}
async function draw(){
  if(state!=='idle')return;state='busy';ac();
  q('.ze-draw').disabled=true;q('.ze-hint').style.opacity=0;q('.ze-head').style.opacity=.0;
  const pickP=CFG.pick?Promise.resolve().then(()=>CFG.pick()).then(id=>({id}),err=>({err})):Promise.resolve({id:null});
  // 1-2) one continuous motion: the orbit speeds up, each gift melts into a blue orb on the move,
  //      the ring tightens into a whirlpool above the envelope and the orbs dive in one after another
  shimmer();noise(3.4,.1,300,2800);orbitVel=0;
  const mouth=mouthW;
  for(const o of items){o.orb=makeOrb();o.orb.userData.s=0;o.orb.userData.dive=0;o.morphed=false;}
  let flapped=false;
  await tween(3.8,k=>{
    orbitSpeed=.16+3.3*e3(clamp(k/.55,0,1));
    const p=eio(clamp((k-.26)/.52,0,1));orbitPull=p;orbitScale=1-.85*p;
    if(k>.22&&!flapped){flapped=true;flapTarget=1.12;}
    env.localToWorld(pullTarget.set(0,EH/2,.0));pullTarget.add(_up.set(0,.58,.42));env.localToWorld(mouth.set(0,-.42,.008));
    items.forEach((o,i)=>{const m=clamp((k-.06-i*.035)/.22,0,1),me=eio(m);
      o.vis=1-me;o.orb.userData.s=me;
      if(m>.05&&m<.95&&Math.random()<.35)trailSpark(o.g.position,GLOW_ORB);
      if(m>=1&&!o.morphed){o.morphed=true;sparkBurst(o.orb.position,6,[GLOW_ORB,GLOW_WHITE],.9,.1);tone(880+i*90,.3,'sine',.03);}
      if(o.orb.userData.s>.5&&Math.random()<.25)trailSpark(o.orb.position,GLOW_ORB);
      o.orb.userData.front(orbitPull>.62);
      const d=clamp((k-.8-i*.024)/.075,0,1);o.orb.userData.dive=d;
      if(d>=1&&o.orb.visible){o.orb.visible=false;tone(1320+i*120,.25,'sine',.04);}});});
  for(const o of items){scene.remove(o.orb);o.orb=null;}
  orbitSpeed=.16;
  // 3) the flap closes, the seal glows and the envelope shakes harder and harder
  flapTarget=0;await wait(320);
  rattle(2.6);
  await tween(2.6,k=>{shake=Math.pow(k,1.6);edgeGlow.material.opacity=.15+k*.85;sealGlow.material.opacity=.3+k*.7;innerLight.intensity=k*1.2;});
  const picked=await pickP;
  if(picked.err){await abortDraw();if(CFG.onError)CFG.onError(picked.err);return;}
  won=ITEMSC.find(x=>x.id===picked.id)||(CFG.pick?null:ITEMSC[Math.floor(Math.random()*ITEMSC.length)]);
  if(!won){await abortDraw();if(CFG.onError)CFG.onError(new Error('unknown gift'));return;}
  // 4) it bursts open in bright light
  shake=0;boom();flapTarget=1.05;
  const fl=q('.ze-flash');fl.animate([{opacity:0},{opacity:1,offset:.18},{opacity:0}],{duration:1500,easing:'ease-out'});
  env.localToWorld(mouth.set(0,EH/2,.05));sparkBurst(mouth,70,[GLOW_GOLD,GLOW_WHITE],3.2,.2);
  tween(2.2,k=>{rays.material.opacity=Math.sin(Math.min(1,k*1.4)*Math.PI)*.95+(k>.7?0:0);mouthGlow.material.opacity=Math.max(0,1-k*.7);innerLight.intensity=2.5*(1-k)+.4;edgeGlow.material.opacity=1-k*.8;});
  await wait(500);
  // 5) one orb rises out of the envelope and comes to the front
  const orb=makeOrb();orb.position.copy(mouth);orb.scale.setScalar(.3);shimmer(.1);
  const front=wonFront(),ES=wonEnv(),eg0=edgeGlow.material.opacity,sg0=sealGlow.material.opacity,mg0=mouthGlow.material.opacity,il0=innerLight.intensity;
  await tween(1.5,k=>{const t=eio(k);orb.position.set(mouth.x+(front.x-mouth.x)*t,mouth.y+(front.y-mouth.y)*t+Math.sin(t*Math.PI)*1.1,mouth.z+(front.z-mouth.z)*t);
    orb.scale.setScalar(.3+t*2.2);if(Math.random()<.6)trailSpark(orb.position,GLOW_ORB);
    envOff.set(ES.x*t,ES.y*t,ES.z*t);env.scale.setScalar(1-t*(1-ES.s));flapTarget=1.05*(1-clamp((k-.45)/.55,0,1));edgeGlow.material.opacity=eg0*(1-t);sealGlow.material.opacity=sg0*(1-t);mouthGlow.material.opacity=mg0*(1-t);innerLight.intensity=il0*(1-t);});
  await tween(.9,k=>{const s=2.5+Math.sin(k*Math.PI*6)*.12*k;orb.scale.setScalar(s);orb.userData.glow.material.opacity=.55+k*.25;orb.userData.inner.scale.setScalar(.26+k*.4);});
  // 6) the orb opens and the gift appears
  // 6) the orb becomes the gift: it melts into the gift's shape as the gift grows out of its light
  pop();sparkBurst(orb.position,40,[GLOW_ORB,GLOW_WHITE],1.6,.14);
  const wi=items.find(o=>o.it.id===won.id);
  if(wi){wonMesh=wi;wi.fixed=true;wi.g.position.copy(front);wi.vis=.001;wi.q=new THREE.Quaternion();wi.av=new THREE.Vector3(0,7,0);lastTouch=time;}
  const blueMats=[];if(wi)wi.mats.forEach(m=>{blueMats.push([m,m.emissive.clone(),m.emissiveIntensity]);m.emissive=col('#ffad33');m.emissiveIntensity=1.4;});
  await tween(1.1,k=>{const t=e3(k);orb.scale.setScalar(2.6*(1-t)+.001);orb.userData.glow.scale.setScalar(1.05+t*2.2);orb.userData.glow.material.opacity=.8*(1-k);
    if(wi){wi.vis=eback(clamp(k*1.15,0,1))*WONS();blueMats.forEach(([m,e0,i0])=>{m.emissive.copy(col('#ffad33')).lerp(e0,clamp((k-.25)/.75,0,1));m.emissiveIntensity=1.4+(i0-1.4)*clamp((k-.25)/.75,0,1);});wi.glow.material.opacity=.1*(1-k);}
    if(Math.random()<.5)trailSpark(front,GLOW_ORB);});
  blueMats.forEach(([m,e0,i0])=>{m.emissive.copy(e0);m.emissiveIntensity=i0;});
  scene.remove(orb);sparkBurst(front,50,[GLOW_GOLD,GLOW_WHITE],2.2,.14);shimmer();
  showPanel(won);state='won';glc.style.touchAction='none';
}
function showPanel(it){
  const pan=q('.ze-panel');
  q('.ze-wonL').textContent=L.won;pan.querySelector('h2').textContent=txt(it.name);
  q('.ze-orig').innerHTML=it.orig?`${L.orig} <s>${L.rm(it.orig)}</s>`:'';
  q('.ze-spl').textContent=it.price?L.special:L.yours;q('.ze-price').textContent=it.price?L.rm(it.price):L.free;
  q('.ze-desc').textContent=txt(it.text);q('.ze-spin').textContent='';q('.ze-again').textContent=L.again;
  pan.classList.add('on');
}
async function reset(){
  if(state!=='won')return;state='busy';q('.ze-panel').classList.remove('on');
  const wi=wonMesh;
  const S0=env.scale.x,O0=envOff.clone();await tween(.6,k=>{if(wi)wi.vis=WONS()*(1-k);flapTarget=0;envOff.copy(O0).multiplyScalar(1-k);env.scale.setScalar(S0+(1-S0)*k);rays.material.opacity=0;mouthGlow.material.opacity=0;edgeGlow.material.opacity=0;sealGlow.material.opacity=0;innerLight.intensity=0;});
  flapTarget=0;
  for(const o of items){o.fixed=false;o.vis=0;}orbitScale=1;orbitPull=0;
  await tween(.9,k=>{for(const o of items)o.vis=eback(clamp(k*1.3-o.i*.06,0,1));});
  for(const o of items){o.vis=1;o.glow.material.opacity=.1;}
  orbitScale=1;orbitPull=0;orbitVel=0;glc.style.touchAction='none';
  orbitSpeed=.16;q('.ze-head').style.opacity=1;q('.ze-draw').disabled=false;q('.ze-hint').style.opacity=1;state='idle';
}
let drag=null;glc.style.touchAction='none';glc.style.cursor='grab';
const RO={bob:0},_rp=new THREE.Vector3();
function ringAt(a){const b=time;return toScreen(itemPos(RO,a,_rp));}
function ringGrab(x,y){let best=0,bd=1e18;for(let k=0;k<64;k++){const a=k/64*Math.PI*2,s=ringAt(a),d=(s.x-x)**2+(s.y-y)**2;if(d<bd){bd=d;best=a;}}
  const e=.03,s0=ringAt(best-e),s1=ringAt(best+e);return {tx:(s1.x-s0.x)/(2*e),ty:(s1.y-s0.y)/(2*e)};}
const rel=e=>{const r=glc.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
glc.addEventListener('pointerdown',e=>{if(state!=='idle'&&state!=='won')return;const p=rel(e);drag={x:p.x,y:p.y,t:performance.now(),vx:0,vy:0,s:[]};try{glc.setPointerCapture(e.pointerId);}catch(_){}glc.style.cursor='grabbing';
  if(state==='idle')orbitVel=-orbitSpeed;if(state==='won'&&wonMesh)wonMesh.av.set(0,0,0);e.preventDefault();});
glc.addEventListener('pointermove',e=>{if(!drag)return;const p=rel(e),now=performance.now(),dts=Math.max(8,now-drag.t)/1000,dx=p.x-drag.x,dy=p.y-drag.y;
  if(state==='idle'){const g=ringGrab(drag.x,drag.y),eps=Math.pow(Math.min(W,H)*.06,2);let da=(dx*g.tx+dy*g.ty)/(g.tx*g.tx+g.ty*g.ty+eps);da=clamp(da,-.5,.5);
    orbitA+=da;orbitVel=-orbitSpeed;drag.s.push([now,da]);while(drag.s.length&&now-drag.s[0][0]>110)drag.s.shift();}
  else if(state==='won'&&wonMesh){const k=4.2/Math.min(W,H),ay=dx*k,ax=dy*k;_qa.setFromAxisAngle(AY,ay);_qb.setFromAxisAngle(AX,ax);wonMesh.q.premultiply(_qa).premultiply(_qb);
    drag.vx=drag.vx*.4+(ay/dts)*.6;drag.vy=drag.vy*.4+(ax/dts)*.6;lastTouch=time;}
  drag.x=p.x;drag.y=p.y;drag.t=now;});
const endDrag=()=>{if(!drag)return;const now=performance.now(),stale=now-drag.t>90;
  if(state==='idle'){let v=0;const sm=drag.s.filter(a=>now-a[0]<=110);if(!stale&&sm.length>1){const span=Math.max(.016,(now-sm[0][0])/1000);v=sm.reduce((t,a)=>t+a[1],0)/span;}
    orbitVel=clamp(v,-7,7)-orbitSpeed*(stale?1:0);}
  else if(state==='won'&&wonMesh){wonMesh.av.set(stale?0:clamp(drag.vy,-30,30),stale?0:clamp(drag.vx,-30,30),0);lastTouch=time;}
  drag=null;glc.style.cursor='grab';};
glc.addEventListener('pointerup',endDrag);glc.addEventListener('pointercancel',endDrag);glc.addEventListener('lostpointercapture',endDrag);
q('.ze-draw').onclick=()=>{if(CFG.onStart)CFG.onStart();draw();};q('.ze-again').onclick=async()=>{if(CFG.onDone){q('.ze-panel').classList.remove('on');CFG.onDone(won&&won.id);}else await reset();};

/* ---------- loop ---------- */
let last=performance.now(),alive=true;
function frame(now){
  if(!alive)return;const dt=Math.min(.1,(now-last)/1000);last=now;time+=dt;
  stepTasks(dt);updateItems(dt);stepSparks(dt);
  flapOpen+=(flapTarget-flapOpen)*Math.min(1,dt*(flapTarget>flapOpen?5:7));
  flap.rotation.x=-flapOpen*Math.PI*.96;flapF.visible=true;
  // idle float + shake
  const bob=Math.sin(time*1.2)*.05;
  env.rotation.z=Math.sin(time*.7)*.025+(shake?Math.sin(time*55)*.07*shake+rnd(-1,1)*.02*shake:0);
  env.rotation.y=Math.sin(time*.5)*.12+(shake?Math.sin(time*41)*.05*shake:0);
  env.position.x=envOff.x+(shake?Math.sin(time*63)*.06*shake:0);env.position.z=envOff.z;
  env.position.y=ENV_POS.y+envOff.y+bob+(shake?Math.sin(time*70)*.04*shake:0);
  if(shake&&Math.random()<shake*.5){const p=new THREE.Vector3(rnd(-1.3,1.3),rnd(-.8,.9),.1);env.localToWorld(p);trailSpark(p,GLOW_GOLD);}
  rays.rotation.z+=dt*.25;halo.material.opacity=state==='won'?0:.18+.04*Math.sin(time*1.5);
  for(const d of dust){d.s.position.y+=d.sp*dt;if(d.s.position.y>4.5)d.s.position.y=-2;d.s.material.opacity=.15+.3*(.5+.5*Math.sin(time*2+d.ph));}
  renderer.render(scene,camera);requestAnimationFrame(frame);
}
function applyLang(){L=T[CFG.lang]||T.en;root.classList.toggle('zh',CFG.lang==='zh');
  q('.ze-head img').src=CFG.lang==='zh'?CFG.assets.logoZh:CFG.assets.logoEn;q('.ze-head h1').textContent=L.title;q('.ze-head p').textContent=L.sub;
  q('.ze-draw').textContent=L.draw;q('.ze-hint').textContent=L.hint;q('.ze-tc').textContent=L.tc;buildTags();
  if(state==='won'&&won)showPanel(won);}
const ro=new ResizeObserver(()=>layout());ro.observe(root);
(async function init(){
  layout();applyLang();requestAnimationFrame(frame);
  if(CFG.assets.sealLogo){loader.load(src(CFG.assets.sealLogo),t=>{t.encoding=THREE.sRGBEncoding;
    const im=t.image,w=330,h=w*im.height/im.width;const ink=(c)=>{const o=document.createElement('canvas');o.width=w;o.height=h;const x=o.getContext('2d');x.drawImage(im,0,0,w,h);x.globalCompositeOperation='source-in';x.fillStyle=c;x.fillRect(0,0,w,h);return o;};
    const c=document.createElement('canvas');c.width=c.height=512;const g=c.getContext('2d');const gr=g.createRadialGradient(200,190,20,256,256,300);gr.addColorStop(0,'#fff6e0');gr.addColorStop(1,'#e9d2a2');g.fillStyle=gr;g.fillRect(0,0,512,512);
    g.globalAlpha=.55;g.drawImage(ink('#7a5518'),256-w/2,256-h/2);g.globalAlpha=1;
    const b=document.createElement('canvas');b.width=b.height=512;const bg=b.getContext('2d');bg.fillStyle='#fff';bg.fillRect(0,0,512,512);bg.filter='blur(2.5px)';bg.drawImage(ink('#000'),256-w/2,256-h/2);
    bg.filter='none';bg.strokeStyle='#000';bg.lineWidth=5;bg.beginPath();bg.arc(256,256,232,0,Math.PI*2);bg.stroke();
    const st=new THREE.CanvasTexture(c);st.encoding=THREE.sRGBEncoding;const sb=new THREE.CanvasTexture(b);
    sealMat.map=st;sealMat.bumpMap=sb;sealMat.bumpScale=.018;sealMat.needsUpdate=true;});}
  try{await document.fonts.ready;}catch(e){}
  await Promise.all(ITEMSC.map(loadItem));items.sort((a,b)=>a.i-b.i);buildTags();
  q('.ze-load').classList.add('gone');
})();
return {_time:()=>time,_face:(y)=>{if(wonMesh){wonMesh.q.setFromEuler(new THREE.Euler(0,y||0,0));wonMesh.av.set(0,0,0);lastTouch=time+1e6;}},draw,reset,destroy:()=>{alive=false;ro.disconnect();renderer.dispose();root.innerHTML='';},setLang:l=>{CFG.lang=l;applyLang();}};
};
})();
