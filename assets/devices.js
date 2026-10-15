/* Tarun Inala – devices layer for the Work scroll scene.
   After the cards are filed, the camera pushes into the laptop on the pixel desk. An HTML copy of the laptop glass is laid
   exactly over the pixel screen (an affine map of its sheared quad), then un-skews and grows until it is a flat, readable
   desktop: each case study is a window in its own app, and any window can be opened to the full case study (one spring
   drives the whole grow, so it can be grabbed and reversed mid-flight). Later the camera slides along the desk to the phone,
   which opens up the same way and shows the contact widget.
   Everything here is driven from update(S): S is the scrubbed scroll state owned by app.js. */
(function(){
'use strict';
var G=window.gsap;
var clamp=function(v,a,b){return v<a?a:(v>b?b:v)},lerp=function(a,b,t){return a+(b-a)*t},gm=function(a,b,t){return a*Math.pow(b/a,t)};
var smooth=function(t){t=clamp(t,0,1);return t*t*(3-2*t)};

/* ------------------------------------------------------------------ icons: one hidden gradient set, then plain <svg> uses */
var GR={ext:['#ff9a5a','#d5360c'],led:['#62d083','#1d7a3c'],pay:['#7ba4ff','#2747bd'],note:['#ffe98f','#eead24']};
function defs(){return '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>'+
  Object.keys(GR).map(function(k){return '<linearGradient id="dvg-'+k+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+GR[k][0]+'"/><stop offset="1" stop-color="'+GR[k][1]+'"/></linearGradient>'}).join('')+'</defs></svg>'}
var GLYPH={
  ext:'<path d="M16 10.5h11.5l6.5 6.5v20a2.2 2.2 0 0 1-2.2 2.2H16a2.2 2.2 0 0 1-2.2-2.2V12.7A2.2 2.2 0 0 1 16 10.5Z" fill="#fff"/><path d="M27.5 10.5V17H34" fill="#ffd8c4"/><path d="M18 22.5h11M18 26.5h8M18 30.5h5" stroke="#d5360c" stroke-width="2" stroke-linecap="round"/><path d="m35.5 27.5 1.5 3.7 3.7 1.5-3.7 1.5-1.5 3.7-1.5-3.7-3.7-1.5 3.7-1.5Z" fill="#ffd25a" stroke="#c8460f" stroke-width="1" stroke-linejoin="round"/>',
  led:'<rect x="10.5" y="12" width="27" height="24" rx="3.2" fill="#fff"/><path d="M10.5 19.5h27" stroke="#1d7a3c" stroke-width="2"/><path d="M19.5 12v24M28.5 12v24M10.5 27.5h27" stroke="#b5dfc2" stroke-width="1.5"/><path d="m21 31.2 2.2 2.2 4.2-4.6" fill="none" stroke="#1d7a3c" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  pay:'<rect x="11" y="28" width="7" height="9" rx="1.8" fill="#fff" opacity=".65"/><rect x="20.5" y="21" width="7" height="16" rx="1.8" fill="#fff" opacity=".85"/><rect x="30" y="12" width="7" height="25" rx="1.8" fill="#fff"/>',
  note:'<rect x="11.5" y="9.5" width="25" height="29" rx="3.6" fill="#fffdf1"/><path d="M11.5 13.1a3.6 3.6 0 0 1 3.6-3.6h17.8a3.6 3.6 0 0 1 3.6 3.6v4.4h-25Z" fill="#f4bb2c"/><path d="M16 23h16M16 28h16M16 33h9" stroke="#d9c98e" stroke-width="2" stroke-linecap="round"/>'};
function icon(id,cls){return '<svg class="dv-ic'+(cls?' '+cls:'')+'" viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="11" fill="url(#dvg-'+id+')"/>'+GLYPH[id]+'</svg>'}

/* ------------------------------------------------------------------ mount */
function mount(seq,D){
  var $=D.$,$$=D.$$,esc=D.esc,ic=D.ic,SITE=D.SITE||{},W=SITE.work||{},F=W.featured||[],M=W.more||[];
  var apps=[],meta=[{id:'ext',name:'Extract',sub:'Single Pane of Glass'},{id:'led',name:'Ledger',sub:'Payment Term Validation'},{id:'pay',name:'Payouts',sub:'Month-one dashboard'}];
  F.slice(0,3).forEach(function(f,i){apps.push({id:meta[i].id,kind:'case',name:meta[i].name,sub:meta[i].sub,f:f,n:i})});
  if(M.length)apps.push({id:'note',kind:'notes',name:'Notes',sub:'More across the platform',m:M,n:3});
  if(!apps.length)return null;
  var cases=apps.filter(function(a){return a.kind==='case'});

  /* ---------- markup: previews (what each window shows while it is a tile) ---------- */
  var chk=ic('check');
  function pvExt(f){var st=f.steps||[];
    return '<div class="pv pv-ext"><div class="pv-top"><div class="pv-pdf"><div class="pv-ph"><span>Budget terms</span><em>PDF</em></div>'+
      '<i class="ln" style="--w:92%"></i><i class="ln" style="--w:68%"></i><i class="ln hl l1" style="--w:86%"></i><i class="ln" style="--w:55%"></i><i class="ln hl l2" style="--w:74%"></i><i class="ln" style="--w:80%"></i><i class="ln hl l3" style="--w:62%"></i><i class="ln" style="--w:48%"></i><b class="pv-scan"></b></div>'+
      '<div class="pv-form"><p class="pv-cap">Single Pane of Glass</p>'+
      ['Screening visit|$420','Procedure fee|$1,250','Start-up fee|$5,000'].map(function(r,i){r=r.split('|');return '<div class="fld f'+(i+1)+'"><span>'+r[0]+'</span><b>'+r[1]+'</b><u>'+chk+'</u></div>'}).join('')+
      '<div class="pv-commit"><span>Commit mappings</span></div></div></div>'+
      '<ol class="pv-flow">'+st.map(function(s,i){return '<li class="s'+(i+1)+'"><i>'+(i+1)+'</i><span>'+esc(s[0])+'</span></li>'}).join('')+'</ol></div>'}
  function pvLed(){
    return '<div class="pv pv-led"><div class="tbl"><div class="th"><span>Payment</span><span>Contract</span><span>Check</span></div>'+
      [['Visit 2 · 31 Jan','$1,200','ok','Match'],['Amendment 1','$1,350','ok','Match'],['Visit 5 · 1 Mar','$1,200','bad','+$150 blocked'],['Visit 6 · 31 Mar','$1,200','ok','Match']].map(function(r,i){
        return '<div class="tr r'+(i+1)+' '+r[2]+'"><span>'+r[0]+'</span><span>'+r[1]+'</span><em>'+(r[2]==='ok'?chk:ic('shield'))+r[3]+'</em></div>'}).join('')+'</div>'+
      '<div class="rules"><span>Calendar boundaries</span><span>Amendment tracking</span><span>Contract cost match</span></div></div>'}
  function pvPay(){
    return '<div class="pv pv-pay"><div class="chart"><div class="bars"><i style="--h:20%"></i><i style="--h:44%"></i><i style="--h:72%"></i><i class="top" style="--h:100%"><b>$1.5M</b></i></div><div class="axis"><span>Wk 1</span><span>Wk 2</span><span>Wk 3</span><span>Wk 4</span></div></div>'+
      '<div class="side"><div class="kpi"><span>Feature pending</span><b>12 years</b></div><div class="kpi sw"><span>Invoice validation</span><b><s>2 h</s><u>1 min</u></b></div></div></div>'}
  function compact(a){var big=a.kind==='case'?(a.f.big||''):String(a.m.length),bl=a.kind==='case'?(a.f.bigLabel||''):'more projects';
    return '<div class="wt-compact">'+icon(a.id,'wc-ic')+'<div class="wc-t"><h3>'+esc(a.kind==='case'?a.f.title:a.sub)+'</h3><p>'+esc(a.kind==='case'?String(a.f.tag||'').replace(/^.*?·\s*/,''):'Five more wins')+'</p></div><div class="wc-big"><b>'+esc(big)+'</b><span>'+esc(bl)+'</span></div></div>'}

  /* ---------- markup: the full case study (what a window shows once opened) ---------- */
  function fullCase(a){var f=a.f;
    return '<div class="wf-grid"><section class="wf-lead"><p class="wf-tag">'+esc(f.tag||'')+'</p><h2>'+esc(f.title)+'</h2><p class="wf-desc">'+esc(f.desc||'')+'</p>'+
      (f.mets?'<div class="wf-mets">'+f.mets.map(function(m){return '<div class="wf-met"><b>'+esc(m[1])+'</b><span>'+esc(m[0])+'</span></div>'}).join('')+'</div>':'')+
      '<div class="wf-chips">'+(f.chips||[]).map(function(c){return '<span>'+esc(c)+'</span>'}).join('')+'</div></section>'+
      '<section class="wf-case">'+(f.case||[]).map(function(c,i){return '<div class="wf-row"><span class="wf-n">0'+(i+1)+'</span><div><h3>'+esc(c[0])+'</h3><p>'+esc(c[1])+'</p></div></div>'}).join('')+
      (f.steps?'<ol class="wf-flow">'+f.steps.map(function(s){return '<li><b>'+esc(s[0])+'</b><span>'+esc(s[1])+'</span></li>'}).join('')+'</ol>':'')+'</section></div>'}
  function fullNotes(a){
    var honors=W.honours||[],skills=W.skills||{},skillGroups=Object.keys(skills);
    return '<div class="wf-grid wf-grid-n"><section class="wf-lead"><p class="wf-tag">Beyond the flagship work</p><h2>More delivery, recognition &amp; toolkit.</h2><p class="wf-desc">The supporting work behind the outcomes: platform improvements, team delivery, professional recognition and the methods used to get work shipped.</p>'+
      '<h3>Recognition</h3><div class="wf-mini-list">'+honors.map(function(h){return '<div class="wf-mini"><b>'+esc(h.t)+'</b><span>'+esc(h.s)+' · '+esc(h.y)+'</span></div>'}).join('')+'</div></section>'+
      '<section class="wf-case"><h3>More across the platform</h3>'+a.m.map(function(m){return '<div class="wf-row"><span class="wf-n wf-ic">'+ic((D.ILL||{})[m.ill]||'star')+'</span><div><h3>'+esc(m.k)+' <small>'+esc(m.t)+'</small></h3><p>'+esc(m.d)+'</p><p class="wf-m">'+esc(m.m||'')+'</p></div></div>'}).join('')+
      '<h3>Tools &amp; methods</h3>'+skillGroups.map(function(g){return '<div class="wf-mini"><b>'+esc(g)+'</b><span>'+skills[g].map(esc).join(' · ')+'</span></div>'}).join('')+'</section></div>'}

  function winHTML(a,i){
    var isCase=a.kind==='case',pv=isCase?[pvExt(a.f),pvLed(),pvPay()][a.n]||'':'';
    return '<article class="win" data-i="'+i+'" data-app="'+a.id+'" aria-label="'+esc(a.name)+'">'+
      '<div class="win-tile">'+(isCase?'<div class="wt-bar"><span class="tl" aria-hidden="true"><i class="r"></i><i class="y"></i><i class="g"></i></span><span class="wt-title">'+icon(a.id,'wt-i')+esc(a.name)+' <small>'+esc(a.sub)+'</small></span><span class="wt-hint">Open'+ic('arrow-ur')+'</span></div><div class="wt-body">'+pv+compact(a)+'</div>':'')+
      (isCase?'<button class="win-open" type="button" data-open="'+i+'" aria-label="Open the case study: '+esc(a.f.title)+'"></button>':'')+'</div>'+
      '<div class="win-full" inert><div class="wf"><header class="wf-bar"><button class="wf-close" type="button" data-close aria-label="Close and go back to the desktop"><i></i></button><span class="wf-name">'+icon(a.id,'wf-i')+esc(a.name)+'<small>'+esc(a.sub)+'</small></span>'+
        '<span class="wf-pos">'+(i+1)+' of '+apps.length+'</span><button class="wf-next" type="button" data-next>'+(i+1<apps.length?'Next: '+esc(apps[i+1].name):'Back to start')+ic('arrow-r')+'</button></header>'+
        '<div class="wf-body" tabindex="-1">'+(isCase?fullCase(a):fullNotes(a))+'<p class="wf-foot">Screens in this window are illustrative mock-ups made for this site. They contain no client data.</p></div></div></div></article>'}

  var status=D.showOpen?(W.status||''):'';
  var root=document.createElement('div');root.className='dv';
  root.innerHTML=defs()+'<div class="dv-dim"></div>'+
    '<div class="lap"><div class="lap-screen os os-wide" inert><div class="os-boot"></div><div class="os-desk">'+
      '<div class="os-bar"><span class="os-mark">TI</span><b class="os-app">Case studies</b>'+(status?'<span class="os-st"><i></i>'+esc(status)+'</span>':'')+'</div>'+
      '<div class="os-area"><div class="os-grid">'+cases.map(function(a,i){return '<div class="os-slot s'+(i+1)+'"></div>'}).join('')+'</div></div>'+
      apps.map(winHTML).join('')+
      '<nav class="dock" aria-label="Apps">'+apps.map(function(a,i){return '<button class="dk" type="button" data-dock="'+i+'" aria-label="Open '+esc(a.name)+'"><span class="dk-t">'+esc(a.name)+'</span>'+icon(a.id)+'<i class="dk-dot"></i></button>'}).join('')+'</nav>'+
    '<span class="dv-cur" aria-hidden="true"><i class="cur-rip"></i><svg viewBox="0 0 20 24"><path d="M2 1.5v18l4.6-4.3 3.1 7 3-1.4-3.1-6.9H16Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg></span></div></div><div class="lap-base" aria-hidden="true"></div></div>'+
    '<p class="dv-cap" aria-hidden="true"><span>Selected work</span> Open any window to read the case study.</p>'+
    '<div class="ph" inert><div class="ph-body"><div class="ph-screen"><div class="ph-ui">'+
      '<div class="ph-sb"><b>9:41</b><span class="ph-isl"></span><span class="ph-bt"><i></i></span></div>'+
      '<div class="ph-hero"><p class="ph-k">Contact</p><h2>Let’s build something <em>useful.</em></h2><p class="ph-p">Open to Product Owner, Lead Business Analyst and Generative AI roles. Email is the fastest way to reach me.</p></div>'+
      '<div class="ph-w">'+D.reachHTML('work','dv')+'</div><span class="ph-bar"></span></div></div></div></div>';
  seq.appendChild(root);

  var dim=$('.dv-dim',root),lap=$('.lap',root),os=$('.os',root),desk=$('.os-desk',root),boot=$('.os-boot',root),base=$('.lap-base',root),cap=$('.dv-cap',root),
      ph=$('.ph',root),area=$('.os-area',root),grid=$('.os-grid',root),slots=$$('.os-slot',root),dock=$('.dock',root),dks=$$('.dk',root),appName=$('.os-app',root),bar=$('.os-bar',root),
      reachEl=$('[data-reach]',ph),reach=D.initReach(reachEl);
  var wins=$$('.win',root).map(function(el,i){return {el:el,a:apps[i],i:i,tile:$('.win-tile',el),full:$('.win-full',el),body:$('.wf-body',el),o:{x:0,y:0,w:1,h:1},f:{x:0,y:0,w:1,h:1},
    sp:D.Spring(0,{response:.5,damping:.86,precision:.0008})}});
  var MB=30,lay={vw:0,vh:0,narrow:false,flat:null,pflat:null,Wd:1,Hd:1,Wp:1,Hp:1},cur=-1,live=false,phLive=false,closing=null;

  /* ---------- layout: the flat sizes the devices grow to ---------- */
  function layout(vw,vh,narrow,hdr){
    if(cur>=0)closeNow();
    var bez=narrow?0:12,baseH=narrow?0:16,capH=narrow?0:44,Wd,Hd,cx,cy;
    if(narrow){Wd=vw;Hd=Math.max(300,vh-hdr);cx=vw/2;cy=hdr+Hd/2}
    else{
      var aH=vh-hdr-2*bez-baseH-capH-14,aW=vw-2*(bez+Math.max(20,vw*.03));
      Wd=Math.round(Math.max(520,Math.min(aW,aH*1.6)));Hd=Math.round(Wd/1.6);
      cx=vw/2;cy=hdr+8+bez+Hd/2+(aH-Hd)/2}
    lay={vw:vw,vh:vh,narrow:narrow,hdr:hdr,flat:{cx:cx,cy:cy,w:Wd,h:Hd},Wd:Wd,Hd:Hd,bez:bez};
    os.style.width=Wd+'px';os.style.height=Hd+'px';
    os.classList.toggle('os-narrow',narrow);
    os.classList.remove('os-wide','os-row','os-stack');
    os.classList.add(Hd>Wd*.9?'os-stack':(Hd>=430?'os-wide':'os-row'));
    base.style.display=narrow?'none':'block';
    lap.classList.toggle('lap-bare',narrow);
    cap.style.cssText='left:'+Math.round(cx)+'px;top:'+Math.round(cy+Hd/2+bez+baseH+10)+'px;'+(narrow?'display:none':'');
    /* phone */
    var Hp=narrow?Math.min(vh-hdr-24,Math.round((vw-28)/.49)):Math.min(vh-hdr-36,740),Wp=Math.round(Hp*.49);
    Hp=Math.round(Wp/.49);
    lay.Wp=Wp;lay.Hp=Hp;lay.pflat={cx:vw/2,cy:hdr+(vh-hdr)/2,w:Wp,h:Hp};
    ph.style.width=Wp+'px';ph.style.height=Hp+'px';
    reachEl.style.setProperty('--rc-w',Math.min(292,Wp-44)+'px');
    /* windows sit over their grid slots */
    placeWins();
  }
  function placeWins(){
    /* the grid is measured while the desktop is flat; if a window has not opened yet it still gets its final rect */
    var i,s,w,ar=area.offsetLeft,at=area.offsetTop;
    for(i=0;i<cases.length;i++){s=slots[i];w=wins[i];
      w.o={x:ar+s.offsetLeft,y:at+s.offsetTop,w:s.offsetWidth,h:s.offsetHeight};}
    wins.forEach(function(w){
      if(w.a.kind!=='case')return;
      setBox(w,w.o,12);sizeLayers(w)});
    var nw=wins[wins.length-1];
    if(nw&&nw.a.kind==='notes'){setBox(nw,{x:0,y:0,w:1,h:1},12);nw.el.style.visibility='hidden'}}
  function setBox(w,r,rad){var s=w.el.style;s.left=r.x+'px';s.top=r.y+'px';s.width=Math.max(0,r.w)+'px';s.height=Math.max(0,r.h)+'px';s.borderRadius=rad+'px'}
  function sizeLayers(w){
    w.tile.style.width=w.o.w+'px';w.tile.style.height=w.o.h+'px';
    w.full.style.width=w.f.w+'px';w.full.style.height=w.f.h+'px'}

  /* ---------- open / close: one spring p (0 tile, 1 full) drives size, corner radius and the cross-fade ---------- */
  function paintWin(w,p){
    var o=w.o,f=w.f,q=clamp(p,0,1.2),el=w.el.style;
    el.left=lerp(o.x,f.x,p).toFixed(2)+'px';el.top=lerp(o.y,f.y,p).toFixed(2)+'px';
    el.width=Math.max(0,lerp(o.w,f.w,p)).toFixed(2)+'px';el.height=Math.max(0,lerp(o.h,f.h,p)).toFixed(2)+'px';
    el.borderRadius=lerp(12,0,clamp(p,0,1)).toFixed(2)+'px';
    var t=1-smooth(q/.4),u=smooth((q-.3)/.5);
    w.tile.style.opacity=t;w.tile.style.filter=t<.98?'blur('+((1-t)*6).toFixed(2)+'px)':'';
    w.full.style.opacity=u;w.full.style.filter=u<.98?'blur('+((1-u)*8).toFixed(2)+'px)':'';
    var d=smooth(q/.5);dock.style.opacity=1-d;dock.style.transform='translate(-50%,'+(d*34).toFixed(1)+'px)';
  }
  function measureFor(w){
    var a=w.a;
    if(a.kind==='notes'){var ib=dks[w.i].getBoundingClientRect(),ob=os.getBoundingClientRect(),sc=ob.width/lay.Wd||1;
      w.o={x:(ib.left-ob.left)/sc,y:(ib.top-ob.top)/sc,w:ib.width/sc,h:ib.height/sc}}
    w.f={x:0,y:MB,w:lay.Wd,h:lay.Hd-MB};sizeLayers(w)}
  function openApp(i){
    var w=wins[i];if(!w||(cur>=0&&cur!==i)||!live)return;
    stopHint(true);closing=null;measureFor(w);cur=i;w.el.style.visibility='visible';w.el.classList.add('is-front');
    D.lock(true);
    wins.forEach(function(x){if(x!==w)x.el.inert=true});dock.inert=true;
    w.full.inert=false;w.tile.inert=true;
    appName.textContent=w.a.name;
    w.sp.update(function(p){paintWin(w,p)}).rest(function(){
      if(cur===w.i&&w.sp.value()>.5){var c=$('[data-close]',w.el);if(c&&!w.focused){w.focused=true;c.focus({preventScroll:true})}}
      else if(cur===w.i&&w.sp.value()<.5)finishClose(w)});
    w.sp.to(1,{response:.55,damping:.84});
    D.say('Opened '+w.a.name);
  }
  function closeApp(then){
    var w=wins[cur];if(!w)return;closing=then||null;w.focused=false;
    w.sp.to(0,{response:.42,damping:.92});
    appName.textContent='Case studies'}
  function finishClose(w){
    var then=closing;closing=null;cur=-1;
    w.el.classList.remove('is-front');w.full.inert=true;w.tile.inert=false;
    if(w.a.kind==='notes'){w.el.style.visibility='hidden'}
    wins.forEach(function(x){x.el.inert=false});dock.inert=false;
    D.lock(false);dock.style.transform='translateX(-50%)';
    var b=w.a.kind==='case'?$('[data-open]',w.el):dks[w.i];if(b&&live&&!then)b.focus({preventScroll:true});
    if(then)then()}
  function closeNow(){
    var w=wins[cur];if(!w)return;w.sp.set(0);paintWin(w,0);finishClose(w);dock.style.opacity=1}

  function bind(){
    $$('[data-open]',root).forEach(function(b){b.addEventListener('click',function(){openApp(+b.dataset.open)})});
    $$('[data-close]',root).forEach(function(b){b.addEventListener('click',function(){closeApp()})});
    $$('[data-next]',root).forEach(function(b){b.addEventListener('click',function(){
      var n=(cur+1)%apps.length;closeApp(function(){if(n===0)return;openApp(n)})})});
    dks.forEach(function(b,i){b.addEventListener('click',function(){
      if(cur>=0)return;
      if(G&&!D.reduced())G.fromTo(b,{y:0},{keyframes:[{y:-16,duration:.16,ease:'power2.out'},{y:0,duration:.34,ease:'bounce.out'}],overwrite:'auto'});
      openApp(i)})});
    os.addEventListener('keydown',function(e){if(e.key==='Escape'&&cur>=0){e.stopPropagation();closeApp()}});
    /* dock magnification: icons swell around the pointer, like a real dock (mouse only) */
    dock.addEventListener('pointermove',function(e){if(e.pointerType!=='mouse'||cur>=0||!G)return;
      var sc=(os.getBoundingClientRect().width/lay.Wd)||1;
      dks.forEach(function(b){var r=b.getBoundingClientRect(),d=Math.abs(e.clientX-(r.left+r.width/2))/sc,s=1+.5*Math.exp(-Math.pow(d/64,2));
        G.to(b,{scale:s,y:-(s-1)*14,duration:.16,ease:'power2.out',overwrite:true})})});
    dock.addEventListener('pointerleave',function(){G.to(dks,{scale:1,y:0,duration:.35,ease:'power3.out',overwrite:true})});
    /* press feedback on pointer-down for the tiles (Apple: respond on touch-down, not on release) */
    wins.forEach(function(w){var b=$('[data-open]',w.el);if(!b)return;
      b.addEventListener('pointerdown',function(){if(cur<0)G.to(w.el,{scale:.985,duration:.12,ease:'power2.out',overwrite:'auto'})});
      var up=function(){if(cur<0)G.to(w.el,{scale:1,duration:.5,ease:'elastic.out(1,.5)',overwrite:'auto'})};
      b.addEventListener('pointerup',up);b.addEventListener('pointerleave',up);b.addEventListener('pointercancel',up)});
  }
  bind();

  /* ---------- affordance: a ghost pointer tours the windows, "clicks" each, then the dock; any real input ends it ---------- */
  var hintTl=null,hintTimer=0,hintLoops=0,curEl=$('.dv-cur',root),ripEl=$('.cur-rip',root),coarse=window.matchMedia&&matchMedia('(pointer:coarse)').matches;
  var capEl=$('.dv-cap',root);if(capEl)capEl.innerHTML=capEl.innerHTML.replace('Open any window',coarse?'Tap any window':'Click any window');
  function ctr(el){var r=el.getBoundingClientRect(),o=os.getBoundingClientRect(),sc=o.width/lay.Wd||1;return {x:(r.left+r.width/2-o.left)/sc,y:(r.top+r.height/2-o.top)/sc}}
  function stopHint(hard){
    clearTimeout(hintTimer);if(hintTl){hintTl.kill();hintTl=null}
    wins.forEach(function(w){w.el.classList.remove('is-hint')});dks.forEach(function(b){b.classList.remove('is-hint')});
    if(G&&curEl){G.killTweensOf([curEl,ripEl].concat(wins.map(function(w){return w.tile}),dks));G.to(curEl,{opacity:0,duration:.2,overwrite:true});
      G.to(wins.map(function(w){return w.tile}),{scale:1,boxShadow:'none',duration:.35,ease:'power3.out',overwrite:true});G.set(dks,{clearProps:'scale,y'})}
    if(hard)hintLoops=99}
  function startHint(delay){
    if(!G||D.reduced()||!curEl||!live||cur>=0||hintLoops>=3)return;
    stopHint(false);hintTimer=setTimeout(runHint,(delay==null?1.2:delay)*1000)}
  function runHint(){
    if(!live||cur>=0||D.reduced())return;
    var cw=wins.filter(function(w){return w.a.kind==='case'}),notes=dks[dks.length-1],o=os.getBoundingClientRect(),sc=o.width/lay.Wd||1;
    var tl=hintTl=G.timeline({onComplete:function(){hintTl=null;hintLoops++;hintTimer=setTimeout(function(){startHint(0)},4200)}});
    var from={x:lay.Wd*.5,y:lay.Hd*.92};
    tl.set(curEl,{x:from.x,y:from.y,opacity:0,scale:1}).to(curEl,{opacity:1,duration:.3,ease:'power2.out'});
    cw.forEach(function(w){
      var h=$('.wt-hint',w.el),t=ctr(h);
      tl.to(curEl,{x:t.x-4,y:t.y-3,duration:.95,ease:'power3.inOut'})                       /* glide */
        .add(function(){w.el.classList.add('is-hint')})
        .to(w.tile,{scale:1.012,boxShadow:'0 14px 34px rgba(0,0,0,.28)',duration:.35,ease:'power2.out'},'<')   /* hover lift */
        .to(curEl,{scale:.82,duration:.1,ease:'power2.in'},'+=.35')                               /* press */
        .fromTo(ripEl,{scale:.2,opacity:.7},{scale:1.7,opacity:0,duration:.55,ease:'power2.out'},'<')
        .to(w.tile,{scale:.99,duration:.1,ease:'power2.in'},'<')
        .to(curEl,{scale:1,duration:.4,ease:'elastic.out(1,.5)'})
        .to(w.tile,{scale:1,boxShadow:'none',duration:.5,ease:'elastic.out(1,.55)'},'<')
        .add(function(){w.el.classList.remove('is-hint')},'+=.15')});
    var d=ctr(notes);
    tl.to(curEl,{x:d.x+8,y:d.y+2,duration:.9,ease:'power3.inOut'})
      .add(function(){notes.classList.add('is-hint')})
      .to(notes,{scale:1.45,y:-18,duration:.28,ease:'power2.out'},'<')
      .to(curEl,{scale:.82,duration:.1,ease:'power2.in'},'+=.3').fromTo(ripEl,{scale:.2,opacity:.7},{scale:1.7,opacity:0,duration:.55,ease:'power2.out'},'<')
      .to(curEl,{scale:1,duration:.4,ease:'elastic.out(1,.5)'})
      .to(notes,{scale:1,y:0,duration:.6,ease:'elastic.out(1,.5)'},'<')
      .add(function(){notes.classList.remove('is-hint')},'+=.1')
      .to(curEl,{opacity:0,duration:.35,ease:'power2.in'},'+=.1')}
  os.addEventListener('pointerdown',function(){stopHint(true)});
  os.addEventListener('pointermove',function(e){if(e.pointerType==='mouse')stopHint(true)});
  os.addEventListener('keydown',function(){stopHint(true)});

  /* ---------- per-frame: S is the scrubbed state ---------- */
  function setLive(v){v=!!v;if(v===live)return;live=v;
    root.classList.toggle('is-live',v);os.inert=!v;
    if(!v&&cur>=0)closeNow();
    dks.forEach(function(b){b.tabIndex=v?0:-1});
    if(v)startHint(1.4);else stopHint(false)}
  function setPhLive(v){v=!!v;if(v===phLive)return;phLive=v;ph.classList.toggle('is-live',v);ph.inert=!v}
  function affine(R,F,f,round){
    /* quad (sheared, tiny) -> flat: size is interpolated geometrically so the zoom feels even, shear and centre linearly */
    var w=gm(R.w,F.w,f),h=gm(R.h,F.h,f),rho=lerp((R.sh||0)/R.h,0,f),cx=lerp(R.x+R.w/2+(R.sh||0)/2,F.cx,f),cy=lerp(R.y+R.h/2,F.cy,f),
        a=w/F.w,d=h/F.h,c=rho*d,e=cx-a*F.w/2-c*F.h/2,g=cy-d*F.h/2;
    if(round){e=Math.round(e);g=Math.round(g)}
    return 'matrix('+a.toFixed(5)+',0,'+c.toFixed(5)+','+d.toFixed(5)+','+e.toFixed(2)+','+g.toFixed(2)+')'}
  function update(S,R){
    if(!R||!lay.flat)return;
    /* laptop */
    var lf=clamp(S.lu,0,1)*(1-clamp(S.lb,0,1)),lo=clamp(S.lu/.18,0,1)*(1-clamp((S.lb-.5)/.5,0,1));
    dim.style.opacity=(clamp(S.dim,0,1)*.7).toFixed(3);dim.style.display=S.dim>.004?'block':'none';
    if(lo<=.003){lap.style.visibility='hidden'}
    else{lap.style.visibility='visible';lap.style.opacity=lo.toFixed(3);lap.style.transform=affine(R.lap,lay.flat,lf,lf>.999)}
    var os_=clamp(S.os,0,1)*(1-clamp((S.lb-.1)/.4,0,1));
    desk.style.opacity=os_.toFixed(3);boot.style.opacity=1;
    cap.style.opacity=(clamp(S.cap,0,1)*(1-clamp(S.lb*3,0,1))).toFixed(3);
    setLive(lf>.995&&os_>.97&&S.lb<.002);
    /* phone */
    var pf=clamp(S.pu,0,1),po=clamp(S.pu/.16,0,1);
    if(po<=.003){ph.style.visibility='hidden'}
    else{ph.style.visibility='visible';ph.style.opacity=po.toFixed(3);
      var P=R.ph,F2=lay.pflat,w=gm(P.w,F2.w,pf),h=gm(P.h,F2.h,pf),cx=lerp(P.x+P.w/2,F2.cx,pf),cy=lerp(P.y+P.h/2,F2.cy,pf),a=w/F2.w,d=h/F2.h,e=cx-w/2,g=cy-h/2;
      if(pf>.999){e=Math.round(e);g=Math.round(g)}
      ph.style.transform='matrix('+a.toFixed(5)+',0,0,'+d.toFixed(5)+','+e.toFixed(2)+','+g.toFixed(2)+')';
      $('.ph-ui',ph).style.opacity=clamp((S.px||0),0,1).toFixed(3)}
    setPhLive(pf>.995&&(S.px||0)>.9)}

  function destroy(){
    if(cur>=0)closeNow();D.lock(false);reach.destroy();wins.forEach(function(w){w.sp.stop()});
    if(root.parentNode)root.parentNode.removeChild(root)}

  return {root:root,wins:wins.map(function(w){return w.el}).filter(function(e,i){return wins[i].a.kind==='case'}),dock:dock,cap:cap,
    layout:layout,update:update,setLive:setLive,destroy:destroy,
    phoneOpen:function(v,now){if(v)reach.open(now);else reach.close(now)},
    isOpen:function(){return cur>=0},closeApp:function(){if(cur>=0)closeNow()}};
}
window.Devices={mount:mount};
})();
