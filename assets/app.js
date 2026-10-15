/* Tarun Inala – portfolio app.
   Motion model
   - Anything the visitor touches (press, magnet, sheet drag, swipe) runs on a real spring
     (Apple's response / damping-ratio model) so it can be grabbed mid-flight and keeps its velocity.
   - GSAP does the choreography: entrances, scroll scrubbing, the menu, dialogs, marquee.
   - prefers-reduced-motion swaps movement for short cross-fades and is read live. */
(function(){
'use strict';
var $=function(s,r){return (r||document).querySelector(s)};
var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
var G=window.gsap, ST=window.ScrollTrigger;
if(G&&ST)G.registerPlugin(ST);
var RMQ=window.matchMedia('(prefers-reduced-motion: reduce)');
var reduced=function(){return RMQ.matches||!G};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
var rich=function(s){return esc(s).replace(/&lt;(\/?)em&gt;/g,'<$1em>')};
var clamp=function(v,a,b){return Math.min(b,Math.max(a,v))};
var ic=function(n,cls){return '<svg class="ic'+(cls?' '+cls:'')+'" aria-hidden="true"><use href="#i-'+n+'"/></svg>'};
var LANG={English:'en',Telugu:'te',Hindi:'hi'};
var SITE={}, ctx=null, cleanups=[], routed=false, hoverFine=matchMedia('(hover:hover) and (pointer:fine)');
var isSheet=function(){return window.innerWidth<=860};
var ILL={extract:'search',validate:'shield',payout:'coins',portal:'portal',testing:'test',migrate:'swap',merge:'merge',team:'team'};
var STEP_IC=['file','spark','check-sq'];

/* =====================================================================
   Physics helpers (Apple, "Designing Fluid Interfaces")
   ===================================================================== */
// response = seconds to reach the target, damping 1 = no overshoot, <1 bounces.
function Spring(initial,opt){
  opt=opt||{};
  var x=initial,v=0,target=initial,on=false,w,k,c,s={},prec=opt.precision||.02;
  var onUpdate=null,onRest=null;
  function setup(r,d){w=2*Math.PI/r;k=w*w;c=2*d*w}
  setup(opt.response||.4,opt.damping==null?1:opt.damping);
  function tick(t,dtms){
    var dt=Math.min(.05,(dtms||16)/1000),n=Math.max(1,Math.ceil(dt/.004)),h=dt/n;
    for(var i=0;i<n;i++){var a=-k*(x-target)-c*v;v+=a*h;x+=v*h}
    if(Math.abs(v)<prec&&Math.abs(x-target)<prec){x=target;v=0;stop();if(onUpdate)onUpdate(x);if(onRest)onRest();return}
    if(onUpdate)onUpdate(x);
  }
  function start(){if(!on&&G){on=true;G.ticker.add(tick)}}
  function stop(){if(on){on=false;G.ticker.remove(tick)}}
  s.to=function(t,o){target=t;if(o)setup(o.response||.4,o.damping==null?1:o.damping);if(reduced()){x=t;v=0;stop();if(onUpdate)onUpdate(x);if(onRest)onRest();return s}start();return s};
  s.set=function(val){stop();x=target=val;v=0;if(onUpdate)onUpdate(x);return s};
  s.impulse=function(vel){v=vel;start();return s};
  s.stop=stop;
  s.value=function(){return x};
  s.velocity=function(){return v};
  s.update=function(fn){onUpdate=fn;return s};
  s.rest=function(fn){onRest=fn;return s};
  return s;
}
// Where a flick will come to rest (WWDC sample code, exponential decay).
function project(v,d){d=d||.998;return (v/1000)*d/(1-d)}
// Soft boundary: resistance grows the further past the edge.
function rubber(over,dim,c){c=c||.55;return (over*dim*c)/(dim+c*Math.abs(over))}
// Release velocity (px/s) from the last ~100ms of pointer samples.
function velocityOf(samples,key){
  if(samples.length<2)return 0;var last=samples[samples.length-1],i=samples.length-1;
  while(i>0&&last.t-samples[i-1].t<100)i--;var a=samples[i];var dt=(last.t-a.t)/1000;
  return dt>0?(last[key]-a[key])/dt:0;
}

/* Press feedback on pointer-DOWN, optional magnet, all on springs and composed by GSAP
   (so nothing fights the CSS transform). */
function feel(el,opt){
  if(!G||el._feel)return;el._feel=1;opt=opt||{};
  var sx=Spring(0,{response:.3,damping:.85}),sy=Spring(0,{response:.3,damping:.85}),ss=Spring(1,{response:.14,damping:1,precision:.0005});
  var apply=function(){G.set(el,{x:sx.value(),y:sy.value(),scale:ss.value()})};
  sx.update(apply);sy.update(apply);ss.update(apply);
  var press=opt.press||.965;
  el.addEventListener('pointerdown',function(){ss.to(press,{response:.12,damping:1})});
  var up=function(){ss.to(1,{response:.36,damping:.62})};
  el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);el.addEventListener('pointerleave',up);
  if(opt.magnet&&!reduced()){
    el.addEventListener('pointermove',function(e){if(e.pointerType!=='mouse'||!hoverFine.matches)return;var r=el.getBoundingClientRect();
      sx.to((e.clientX-r.left-r.width/2)*.2,{response:.25,damping:1});sy.to((e.clientY-r.top-r.height/2)*.3,{response:.25,damping:1})});
    el.addEventListener('pointerleave',function(){sx.to(0,{response:.45,damping:.7});sy.to(0,{response:.45,damping:.7})});
  }
}

/* =====================================================================
   Theme: system → light → dark, with a circular reveal from the button
   ===================================================================== */
var root=document.documentElement;
function themePref(){try{var t=localStorage.getItem('inala-theme');return t==='light'||t==='dark'?t:'system'}catch(e){return 'system'}}
function themeNow(){var p=themePref();return p==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p}
function paintTheme(){
  var cur=themeNow(),b=$('#themeBtn'),next=cur==='dark'?'light':'dark';
  b.innerHTML=ic(cur==='dark'?'moon':'sun');
  b.setAttribute('aria-label','Switch to '+next+' mode');
  var m=$('meta[data-js-theme]');
  if(themePref()==='system'){if(m)m.remove()}else{if(!m){m=document.createElement('meta');m.name='theme-color';m.setAttribute('data-js-theme','');document.head.appendChild(m)}m.content=cur==='dark'?'#101010':'#E6D5BD'}
}
function applyTheme(p){
  if(p==='system'){root.removeAttribute('data-theme')}else{root.setAttribute('data-theme',p)}
  try{if(p==='system')localStorage.removeItem('inala-theme');else localStorage.setItem('inala-theme',p)}catch(e){}
  paintTheme();window.dispatchEvent(new Event('themechange'));
}
$('#themeBtn').addEventListener('click',function(e){
  var next=themeNow()==='dark'?'light':'dark';
  if(!document.startViewTransition||reduced()){applyTheme(next);return}
  var r=this.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,rad=Math.hypot(Math.max(x,innerWidth-x),Math.max(y,innerHeight-y));
  root.classList.add('vt-theme');
  var t=document.startViewTransition(function(){applyTheme(next)});
  t.ready.then(function(){root.animate({clipPath:['circle(0px at '+x+'px '+y+'px)','circle('+rad+'px at '+x+'px '+y+'px)']},{duration:700,easing:'cubic-bezier(.16,1,.3,1)',pseudoElement:'::view-transition-new(root)'})}).catch(function(){});
  var done=function(){root.classList.remove('vt-theme')};t.finished.then(done,done);
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',function(){paintTheme();window.dispatchEvent(new Event('themechange'))});
paintTheme();

/* =====================================================================
   Routes
   ===================================================================== */
var ROUTES={
  welcome:{m:'',l:'Home',f:pageWelcome},
  work:{m:'work',l:'Work',f:pageWork},
  built:{m:'work',l:'Built',f:pageBuilt},
  contact:{m:'work',l:'Contact',f:function(){return pageContact('work')}},
  writings:{m:'personal',l:'Writings',f:pageWritings},
  photography:{m:'personal',l:'Photographs',f:pagePhotos},
  hello:{m:'personal',l:'Say hello',f:function(){return pageContact('personal')}}
};
var MODES={work:['work','built','contact'],personal:['writings','photography','hello']};
var FOOT={work:'Business analysis and product delivery. Clear requirements, shipped outcomes.',personal:'Writings and photographs, kept in one quiet place.'};
var SHOW_OPEN=false; /* temporarily hides the "Open to ... roles" status pill and laptop status; set true to restore */
var TITLES={welcome:'Tarun Inala – Senior Business Analyst, open to Product Owner roles'};
function routeKey(){var k=location.hash.replace(/^#\/?/,'').split(/[/?]/)[0];if(k==='poetry'){k='writings';try{history.replaceState(null,'','#/writings')}catch(e){}}return ROUTES[k]?k:'welcome'}

function route(){
  var k=routeKey(),first=!routed;routed=true;
  closeMenu(true);closeDlg({now:true});if(footReach)footReach.close(true);
  var main=$('#main');
  if(first){render(k,true);return}
  if(!G){render(k,false);return}
  // interruptible: a newer navigation overwrites this tween and takes over from the current opacity
  G.to(main,{opacity:0,y:reduced()?0:-10,duration:reduced()?.12:.18,ease:'power2.in',overwrite:true,onComplete:function(){render(k,false)}});
}
function render(k,first){
  if(ctx){try{ctx.revert()}catch(e){}ctx=null}
  cleanups.forEach(function(f){try{f()}catch(e){}});cleanups=[];
  var R=ROUTES[k],mode=R.m,main=$('#main');
  document.body.classList.toggle('landing',k==='welcome');
  if(window.Stage)Stage.set({welcome:'landing',work:'work',writings:'personal'}[k]||'off',{first:first});
  var links=mode?MODES[mode].map(function(r){var on=r===k;return '<a href="#/'+r+'"'+(on?' class="on" aria-current="page"':'')+'>'+ROUTES[r].l+'</a>'}).join(''):'';
  $('#nav').innerHTML=links;
  var mm=mode?MODES[mode]:MODES.work;
  $('#navM').innerHTML='<a href="#/"'+(k==='welcome'?' class="on"':'')+'>Home</a>'+mm.map(function(r){return '<a href="#/'+r+'"'+(r===k?' class="on"':'')+'>'+ROUTES[r].l+'</a>'}).join('');
  $$('.seg').forEach(function(s){s.setAttribute('data-on',mode);$$('button',s).forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.v===mode))})});
  $('#footTag').textContent=FOOT[mode||'work'];
  $('#footNav').innerHTML='<li><a href="#/">Home</a></li>'+mm.map(function(r){return '<li><a href="#/'+r+'">'+ROUTES[r].l+'</a></li>'}).join('');
  main.innerHTML=R.f();
  document.title=TITLES[k]||(R.l+' – Tarun Inala');
  window.scrollTo(0,0);
  $$('.seg').forEach(function(s){placeSeg(s,routed&&!first)});
  ctx=G?G.context(function(){enhance(main)},main):null;
  if(!G)enhance(main);
  if(G){
    if(reduced()){G.fromTo(main,{opacity:0},{opacity:1,duration:.2,overwrite:true})}
    else{G.fromTo(main,{opacity:0,y:18},{opacity:1,y:0,duration:.6,ease:'expo.out',overwrite:true,clearProps:'transform'})}
  }
  if(ST)requestAnimationFrame(function(){ST.refresh()});
  if(!first){main.focus({preventScroll:true});$('#live').textContent=R.l+' page'}
}
window.addEventListener('hashchange',route);
$$('.seg button').forEach(function(b){b.addEventListener('click',function(){location.hash='#/'+MODES[b.dataset.v][0]})});

/* sliding segmented indicators */
function placeSeg(seg,animate){
  var on=$('button[aria-pressed="true"]',seg),ind=$('.seg-ind',seg);if(!ind)return;
  if(!on||!on.offsetWidth){if(G)G.set(ind,{opacity:0});else ind.style.opacity=0;return}
  var vars={x:on.offsetLeft,width:on.offsetWidth,opacity:1};
  if(G&&animate&&!reduced())G.to(ind,Object.assign({duration:.55,ease:'expo.out',overwrite:true},vars));
  else if(G)G.set(ind,vars);
  else{ind.style.transform='translateX('+vars.x+'px)';ind.style.width=vars.width+'px';ind.style.opacity=1}
}
window.addEventListener('resize',function(){$$('.seg').forEach(function(s){placeSeg(s,false)});if(innerWidth>860)closeMenu(true)});

/* =====================================================================
   Header: soft scroll edge, mobile menu that grows from its button
   ===================================================================== */
var sentinel=document.createElement('div');sentinel.style.cssText='position:absolute;top:0;left:0;height:1.5rem;width:1px;pointer-events:none';
document.body.prepend(sentinel);
new IntersectionObserver(function(es){$('#hdr').classList.toggle('scrolled',!es[0].isIntersecting)}).observe(sentinel);

var menuOpen=false,sheet=$('#sheet'),menuBtn=$('#menuBtn');
function setMenuIcon(open){menuBtn.innerHTML=ic(open?'x':'menu');menuBtn.setAttribute('aria-label',open?'Close menu':'Open menu');menuBtn.setAttribute('aria-expanded',String(open))}
function menuOrigin(){var r=menuBtn.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return {x:x,y:y,r:Math.hypot(Math.max(x,innerWidth-x),Math.max(y,innerHeight-y))+24}}
function openMenu(){
  if(menuOpen)return;menuOpen=true;document.body.classList.add('menu-open');setMenuIcon(true);
  sheet.removeAttribute('inert');sheet.setAttribute('aria-hidden','false');
  var o=menuOrigin(),links=$$('#navM a,#modeSegM');
  if(!G){sheet.style.visibility='visible';sheet.style.clipPath='none';return}
  G.set(sheet,{visibility:'visible'});
  if(reduced()){G.fromTo(sheet,{clipPath:'none',opacity:0},{opacity:1,duration:.2,overwrite:true});return}
  G.fromTo(sheet,{clipPath:'circle(0px at '+o.x+'px '+o.y+'px)',opacity:1},{clipPath:'circle('+o.r+'px at '+o.x+'px '+o.y+'px)',duration:.75,ease:'expo.out',overwrite:true});
  G.fromTo(links,{y:28,opacity:0},{y:0,opacity:1,duration:.7,ease:'expo.out',stagger:.06,delay:.12,overwrite:true});
  var first=$('#navM a');if(first)setTimeout(function(){if(menuOpen)first.focus({preventScroll:true})},120);
}
function closeMenu(now){
  if(!menuOpen)return;menuOpen=false;document.body.classList.remove('menu-open');setMenuIcon(false);
  sheet.setAttribute('inert','');sheet.setAttribute('aria-hidden','true');
  var done=function(){sheet.style.visibility='hidden'};
  if(!G||now===true||reduced()){if(G)G.killTweensOf(sheet);G&&G.set(sheet,{opacity:1,clearProps:'clipPath'});done();return}
  var o=menuOrigin();
  G.to(sheet,{clipPath:'circle(0px at '+o.x+'px '+o.y+'px)',duration:.5,ease:'power3.inOut',overwrite:true,onComplete:done});
}
menuBtn.addEventListener('click',function(){menuOpen?closeMenu():openMenu()});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&menuOpen){closeMenu();menuBtn.focus()}});
$('#sheet').addEventListener('click',function(e){if(e.target.closest('a'))closeMenu()});
feel(menuBtn,{press:.92});feel($('#themeBtn'),{press:.92});

/* =====================================================================
   Helpers for markup
   ===================================================================== */
function headline(html){
  var out='',inEm=false;
  html.split(/(<\/?em>)/).forEach(function(part){
    if(part==='<em>'){inEm=true;return}if(part==='</em>'){inEm=false;return}
    part.split(/(\s+)/).forEach(function(w){if(!w)return;if(/^\s+$/.test(w)){out+=' ';return}
      out+='<span class="wm"><span class="wi">'+(inEm?'<em>'+w+'</em>':w)+'</span></span>'})
  });
  return out;
}
function words(text){return esc(text).split(/\s+/).map(function(w){return '<span class="w">'+w+'</span>'}).join(' ')}
function resumeHref(){return SITE.resume||'Tarun_Inala_Resume.pdf'}
function linkedIn(){var l=(SITE.links||[]).filter(function(x){return /linkedin/i.test(x.k)})[0];return l?l.u:''}

/* =====================================================================
   Pages
   ===================================================================== */
function pageWelcome(){
  return '<section class="land" aria-label="Choose where to start">'+
    '<div class="land-card"><h1 data-hl>'+headline('Hi, I’m <em>Tarun.</em>')+'</h1>'+
    '<p>Business analyst by day. Writer and photographer the rest of the time. Choose where to start.</p></div>'+
    '<a class="pdoor pdoor-work" href="#/work" data-door="office"><span class="pdoor-in"><span class="pdoor-k"><span>Work</span><span class="door-arrow">'+ic('arrow-ur')+'</span></span>'+
      '<span class="pdoor-s">Case studies in Generative AI, payments platforms and ERP delivery.</span></span></a>'+
    '<a class="pdoor pdoor-pers" href="#/writings" data-door="park"><span class="pdoor-in"><span class="pdoor-k"><span>Personal</span><span class="door-arrow">'+ic('arrow-ur')+'</span></span>'+
      '<span class="pdoor-s">Poems and journal pages in English, Telugu and Hindi, street photographs and an audiophile’s love of good sound.</span></span></a>'+
  '</section>';
}

function pageWork(){
  var W=SITE.work||{};
  var SCR=['TBD','see email','FINAL_v3','who owns this?','UAT??','v2 (copy)'];
  var bayH=(W.roles||[]).length?'<div class="bay"><h2 class="bay-eyebrow">Experience</h2><div class="bay-cam" role="list">'+
    (W.roles||[]).map(function(r){return '<article class="bay-card" role="listitem"><div class="bc-top"><span class="bc-yrs">'+esc(r.yrs)+'</span>'+(r.tag?'<span class="bc-tag">'+esc(r.tag)+'</span>':'')+'</div>'+
      '<h3>'+esc(r.t)+'</h3><div class="bc-org">'+esc(r.org)+'</div><p class="bc-d">'+esc(r.d)+'</p></article>'}).join('')+
    SCR.map(function(t){return '<div class="bay-scrap" aria-hidden="true">'+esc(t)+'</div>'}).join('')+
    '</div><canvas class="bay-hand" aria-hidden="true"></canvas></div>':'';
  return ''+
  '<section class="seq" id="seq"><div class="seq-scrim" aria-hidden="true"></div><div class="hero hero-scene"><div class="wrap hero-in">'+
    (SHOW_OPEN&&W.status?'<div class="pill" data-r>'+esc(W.status)+'</div>':'')+
    '<h1 data-hl>'+headline(rich(W.headline||''))+'</h1>'+
    '<div data-r><p class="hero-sub">'+esc(W.sub||'')+' '+esc('Five years taking products from first problem to shipped release.')+'</p>'+
      '<div class="hero-cta"><a class="btn btn-primary" data-feel data-magnet href="'+esc(resumeHref())+'" download>Download resume<span class="dot">'+ic('down')+'</span></a></div></div>'+
  '</div></div>'+bayH+'</section>';
}

function pageBuilt(){
  var B=SITE.built||{},items=B.items||[];
  return '<section class="wrap built"><div class="built-hero"><h1 data-hl>'+headline(rich(B.headline||'Things I’ve <em>built</em>.'))+'</h1>'+
    '<p class="lede" data-r>'+esc(B.intro||'')+'</p></div>'+
    '<div class="built-grid">'+items.map(function(it){
      return '<article class="mk-card" data-r><div class="mk-top"><span class="mk-tag">'+esc(it.tag||'')+'</span></div><h2>'+esc(it.title)+'</h2><p>'+esc(it.desc)+'</p></article>'}).join('')+'</div></section>';
}

function pageContact(mode){
  var work=mode==='work';
  return '<section class="wrap contact"><div><h1 data-hl>'+headline(work?'Let’s build something <em>useful.</em>':'Say <em>hello.</em>')+'</h1>'+
    '<p class="lede" data-r>'+(work?'Open to Product Owner, Lead Business Analyst and Generative AI roles. Email is the fastest way to reach me.':'Read something that stayed with you? I would love to hear about it.')+'</p></div>'+
    '<div class="reach-slot" data-r>'+reachHTML(mode,'page',{open:true})+'</div></section>';
}

var wFilter='All';
function wList(){var L=SITE.writings||[];return wFilter==='All'?L:L.filter(function(w){return w.lang===wFilter})}
function kindLabel(k){return {poetry:'Poem',thoughts:'Thought',journal:'Journal'}[k]||'Writing'}
function wCards(){
  var L=wList();
  if(!L.length)return '<div class="empty"><h3>Nothing here yet.</h3><p>No '+esc(wFilter)+' writings are published so far. Try another language.</p></div>';
  return '<div class="wgrid">'+L.map(function(w){var lg=LANG[w.lang]||'en';
    var ex=(w.lines||[]).filter(function(l){return l&&l.trim()}).slice(0,5).join(' ');if(ex.length>240)ex=ex.slice(0,240).replace(/\s+\S*$/,'')+'…';
    return '<button type="button" class="wcard" data-feel data-w="'+esc(w.id)+'" lang="'+lg+'"><h3>'+esc(w.title)+'</h3><p class="ex">'+esc(ex)+'</p>'+
      '<div class="wmeta" lang="en"><span>'+kindLabel(w.kind)+' · '+esc(w.lang)+'</span>'+ic('arrow-r')+'</div></button>'}).join('')+'</div>';
}
function pageWritings(){
  var L=SITE.writings||[],langs=['All'];L.forEach(function(w){if(langs.indexOf(w.lang)<0)langs.push(w.lang)});
  if(langs.indexOf(wFilter)<0)wFilter='All';
  var btns=langs.map(function(l){var n=l==='All'?L.length:L.filter(function(w){return w.lang===l}).length;
    return '<button type="button" data-f="'+esc(l)+'" aria-pressed="'+(l===wFilter)+'">'+esc(l)+'<span class="mono">'+n+'</span></button>'}).join('');
  return '<section class="hero hero-scene hero-short"><div class="wrap hero-in"><h1 data-hl>'+headline('Writings')+'</h1>'+
    '<div data-r><p class="hero-sub">Poems, thoughts and journal pages, written over the years in English, Telugu and Hindi.</p></div></div></section>'+
    '<div class="after"><section class="wrap"><div class="after-bar"><div class="filters" role="group" aria-label="Filter by language" data-r><span class="f-ind" aria-hidden="true"></span>'+btns+'</div></div>'+
    '<div id="wwrap">'+wCards()+'</div></section></div>';
}

function realPhotos(){return (SITE.photos||[]).filter(function(p){return !p.placeholder&&(p.src||p.img||p.file)})}
function photoSrc(p){var file=p.src||p.img||p.file;return /^(https?:)?\/\//.test(file)||file.indexOf('/')>=0?file:'images/'+file}
function pagePhotos(){
  var P=realPhotos(),Gs=SITE.photoGroups||[];
  var empty='<div class="p-empty"><div class="blk-a" data-r><svg class="art" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true" fill="currentColor"><circle cx="300" cy="90" r="80" opacity=".16"/><circle cx="300" cy="90" r="40" opacity=".18"/><rect x="40" y="200" width="220" height="14" rx="7" opacity=".16"/></svg><h3>Still in the darkroom.</h3></div>'+
    '<div class="blk-b" data-r><h3>Photographs are on the way.</h3><p>Streets, buildings and light, as I find them. The first set will appear here as soon as it is ready.</p></div></div>';
  var body=Gs.map(function(g){
    var ps=P.filter(function(p){return p.g===g.id});if(!ps.length)return '';
    var cards=ps.map(function(p){return '<button type="button" class="pcard" data-feel data-p="'+esc(p.id)+'" aria-label="Open photograph, '+esc(g.name)+'">'+
      '<div class="pimg" style="aspect-ratio:'+(p.tw||p.w)+'/'+(p.th||p.h)+'"><img src="'+esc(p.thumb||photoSrc(p))+'" width="'+(p.tw||p.w)+'" height="'+(p.th||p.h)+'" alt="Photograph in the group: '+esc(g.name)+'" loading="lazy" decoding="async" draggable="false"></div></button>'}).join('');
    return '<section class="pgroup" aria-labelledby="pg-'+esc(g.id)+'"><header class="pg-h" data-r><div><h2 id="pg-'+esc(g.id)+'">'+esc(g.name)+'</h2><p>'+esc(g.note||'')+'</p></div>'+
      '<div class="pg-meta"><span class="pg-sw" aria-hidden="true">'+(g.sw||[]).map(function(c){return '<i style="background:'+esc(c)+'"></i>'}).join('')+'</span><span class="mono">'+ps.length+'</span></div></header>'+
      '<div class="pgrid">'+cards+'</div></section>'}).join('');
  return '<section class="wrap"><div class="p-hero"><div><h1 data-hl>'+headline('Photographs')+'</h1>'+
    '<p data-r>Streets, buildings and light, as I find them. Grouped by the colour that carries each frame.</p></div></div>'+
    (P.length?'<div class="pgroups" oncontextmenu="return false">'+body+'</div>':empty)+'</section>';
}

/* =====================================================================
   Enhancements (run inside a gsap.context, so route changes revert everything)
   ===================================================================== */
/* =====================================================================
   Experience sequence (Work page). Scrolling pins the hero and runs one scrubbed timeline:
   the camera pushes into the desk, a pile of cards drops and lands messy, a hand files them one
   by one into a tidy column (the camera follows down), then it all pulls back to the office with
   the four roles stacked behind you on the left. Then the camera pushes into the laptop (one app per case study),
   slides to the phone and shows the contact widget. Everything is driven by scroll position, so it
   reverses cleanly and never traps the page. Reduced motion keeps the plain Experience timeline.
   ===================================================================== */
function mountSeq(scope,rm){
  var seq=$('#seq',scope);if(!seq||!G||!ST||rm||!window.Stage)return;
  var cam=$('.bay-cam',seq),cards=$$('.bay-card',seq),scraps=$$('.bay-scrap',seq),hand=$('.bay-hand',seq),eb=$('.bay-eyebrow',seq),
      scrim=$('.seq-scrim',seq),hin=$('.hero-in',seq),h1=$('h1',seq),mc=null,rt=0,dims=[innerWidth,innerHeight],on=false;
  if(!cam||!cards.length||!hand)return;
  Stage.hand(hand);
  /* devices: laptop with one app per case study, then the phone with the contact widget (see assets/devices.js) */
  var dev=window.Devices?window.Devices.mount(seq,{showOpen:SHOW_OPEN,$:$,$$:$$,esc:esc,ic:ic,SITE:SITE,ILL:ILL,Spring:Spring,reachHTML:reachHTML,initReach:initReach,lock:lock,reduced:reduced,
    say:function(t){var l=$('#live');if(l)l.textContent=t}}):null;
  var HI='0 1.7rem 2.4rem 0 rgba(30,14,0,.40)',LO='0 .125rem .4rem 0 rgba(30,14,0,.34)',MID='0 .75rem 1.2rem 0 rgba(30,14,0,.36)';
  var POSE=[[-.13,-.06,-15],[.12,-.01,17],[-.055,.03,-22],[.075,-.07,9]];
  var SCP=[[-.30,-.08,-22],[.30,-.11,16],[-.22,.1,31],[.24,.1,-28],[.02,-.15,7],[-.36,.09,-9]];

  function build(){
    var vw=innerWidth,vh=innerHeight,narrow=vw<860||vh>vw,rem=parseFloat(getComputedStyle(document.documentElement).fontSize)||16,
        hdr=4.5*rem,gut=Math.max(1.25*rem,Math.min(.04*vw,3*rem)),n=cards.length;
    seq.classList.add('seq-live');seq.classList.toggle('seq-narrow',narrow);
    var cardW=narrow?Math.min(vw-2*gut,30*rem):Math.min(34*rem,vw-2*gut),cardH=(narrow?8.75:8.5)*rem,gap=(narrow?.75:1)*rem,pitch=cardH+gap,
        Ys0=Math.max(hdr+cardH/2+1.2*rem,vh*.19),
        pileY=Math.min(Math.max(Ys0+(n-1)*pitch+.45*pitch,vh*.7),vh-cardH/2-.07*vh-rem),
        dl=.6*pitch,P=n*dl,slotX=vw/2,tipUp=.3*cardH,sp=narrow?.55:1;
    /* where the roles end up: stacked at the left (desktop) or across the top (phones) */
    var lx=h1?h1.getBoundingClientRect().left:gut,cw,ch,cx,top0,cgap;
    if(narrow){cw=vw-2*gut;ch=6.25*rem;cgap=.5*rem;cx=vw/2;top0=hdr+3.5*rem}
    else{cw=Math.min(30*rem,vw*.44);ch=cardH;cgap=.75*rem;cx=lx+cw/2;var sh=n*ch+(n-1)*cgap;top0=Math.max(hdr+3.6*rem,(vh-sh)/2+rem);var av=vh-top0-rem;if(sh>av)cgap=Math.max(.25*rem,(av-n*ch)/(n-1))}
    var kh=narrow?2:3,TT=dev?212:112,L=Math.round(vh*7*TT/112);
    if(dev)dev.layout(vw,vh,narrow,(document.getElementById('hdr')||{}).offsetHeight||hdr);

    Stage.seqBegin(P,cardW);Stage.seqLive(true);on=true;
    G.set(cards,{width:cardW,height:cardH,xPercent:-50,yPercent:-50,autoAlpha:0,x:0,y:0,scale:1,rotation:0,boxShadow:LO});
    G.set($$('.bc-d',seq),{opacity:1});
    G.set(scraps,{xPercent:-50,yPercent:-50,autoAlpha:0});
    G.set(hand,{width:30*kh,height:420*kh,xPercent:-50,transformOrigin:'50% 0',x:vw*1.05,y:vh+140,rotation:0});
    var ebY=top0-2.6*rem;G.set(eb,{autoAlpha:0,x:lx,y:ebY+10});
    G.set(hin,{autoAlpha:1,y:0});G.set(scrim,{opacity:1});

    var S={zoom:0,fade:0,pan:0,lz:0,pz:0,lu:0,lb:0,os:0,dim:0,cap:0,pu:0,px:0},HD={x:vw*1.05,y:vh+140},bx=vw*.92,by=vh+300;
    function sync(){
      G.set(cam,{y:-S.pan});
      G.set(hand,{x:HD.x,y:HD.y,rotation:Math.atan2(-(bx-HD.x),by-HD.y)*180/Math.PI});
      Stage.seqApply(S);if(dev)dev.update(S,Stage.devRects())}
    function slot(i){return {x:slotX,y:Ys0+i*pitch}}
    function pile(i){return {x:vw/2+POSE[i%4][0]*vw*(narrow?.7:1),y:pileY+POSE[i%4][1]*vh,r:POSE[i%4][2]}}

    mc=G.context(function(){
      var tl=G.timeline({defaults:{ease:'none'},onUpdate:sync,
        scrollTrigger:{trigger:seq,start:'top top',end:'+='+L,pin:true,scrub:.6,anticipatePin:1,invalidateOnRefresh:true}});
      /* 1. camera pushes in on the desk, the page text lets go */
      tl.to(hin,{autoAlpha:0,y:-48,duration:8,ease:'power2.in'},0)
        .to(scrim,{opacity:0,duration:10},0)
        .to(S,{zoom:1,duration:14,ease:'power2.inOut'},0)
        .to(S,{fade:1,duration:9},8);
      /* 2. cards and stray notes drop onto the table and land at angles */
      cards.forEach(function(c,i){var p=pile(i),t0=15+i*1.5;
        tl.fromTo(c,{x:p.x+(i%2?1:-1)*vw*.05,y:p.y-vh*.8,scale:1.75,rotation:p.r+(i%2?34:-34),boxShadow:HI},
                    {x:p.x,y:p.y,scale:1,rotation:p.r,boxShadow:LO,duration:7,ease:'power2.in'},t0)
          .fromTo(c,{autoAlpha:0},{autoAlpha:1,duration:2},t0)
          .set(c,{zIndex:n-i+2},0)});
      scraps.forEach(function(c,i){var d=SCP[i%SCP.length],t0=14+i*1.1,x=vw/2+d[0]*vw*sp,y=pileY+d[1]*vh;
        tl.fromTo(c,{x:x,y:y-vh*.7,scale:1.6,rotation:d[2]+30,boxShadow:HI},{x:x,y:y,scale:1,rotation:d[2],boxShadow:LO,duration:6.5,ease:'power2.in'},t0)
          .fromTo(c,{autoAlpha:0},{autoAlpha:1,duration:2},t0)
          .set(c,{zIndex:1},0)});
      /* 3. one card at a time: the hand picks it off the pile, carries it to its place, the camera steps down */
      cards.forEach(function(c,i){
        var t=28+13*i,p=pile(i),sl=slot(i),pan=i*dl,tipP={x:p.x,y:p.y-pan-tipUp},tipS={x:sl.x,y:sl.y-pan-tipUp},away={x:vw*1.05,y:vh+140};
        tl.fromTo(HD,{x:away.x,y:away.y},{x:tipP.x,y:tipP.y,duration:3.2,ease:'power2.out'},t)
          .set(c,{zIndex:40},t+3.2)
          .to(c,{scale:1.06,rotation:p.r*.5,boxShadow:MID,duration:.9,ease:'power2.out'},t+3.2)
          .to(HD,{x:tipS.x,y:tipS.y,duration:5,ease:'power2.inOut'},t+4.1)
          .to(c,{x:sl.x,y:sl.y,rotation:0,boxShadow:HI,duration:5,ease:'power2.inOut'},t+4.1)
          .to(c,{scale:1,boxShadow:LO,duration:.9,ease:'power2.in'},t+9.1)
          .set(c,{zIndex:n-i+2},t+10)
          .to(HD,{x:away.x,y:away.y,duration:3,ease:'power2.in'},t+10)
          .to(S,{pan:(i+1)*dl,duration:3,ease:'power2.inOut'},t+10);
        /* stray notes get swept off the table as the work gets tidier */
        [i*2,i*2+1].forEach(function(k){var sc=scraps[k];if(!sc)return;
          tl.to(sc,{x:(k%2?1:-1)*vw*.8,rotation:'+='+(k%2?70:-70),autoAlpha:0,duration:4,ease:'power2.in'},t+8+(k%2)*1.2)})
      });
      /* 4. the camera lifts back so the whole tidy column is in view */
      tl.to(S,{pan:0,duration:8,ease:'power2.inOut'},80);
      /* 5. pull back to the office: the column slides left behind you */
      cards.forEach(function(c,i){
        tl.to(c,{x:cx,y:top0+i*(ch+cgap)+ch/2,width:cw,height:ch,duration:9,ease:'power3.inOut'},91+i*.7);
        if(narrow)tl.to($('.bc-d',c),{opacity:0,duration:5},91+i*.7)});
      tl.to(S,{zoom:0,duration:14,ease:'power2.inOut'},92)
        .to(S,{fade:0,duration:9},92)
        .to(eb,{autoAlpha:1,y:ebY,duration:5,ease:'power2.out'},100)
        .to({},{duration:6},106);
      /* 6. the filed roles leave, the camera pushes into the laptop on the desk and the glass grows into a desktop */
      var T0=112;
      cards.forEach(function(c,i){tl.to(c,{y:'-=36',autoAlpha:0,duration:6,ease:'power2.in'},T0+i*.7)});
      tl.to(eb,{autoAlpha:0,duration:4},T0);
      if(dev){
        tl.to(S,{lz:1,duration:20,ease:'power2.inOut'},T0+2)
          .to(S,{dim:1,duration:12,ease:'none'},T0+8)
          .to(S,{lu:1,duration:14,ease:'power2.inOut'},T0+14)
          .to(S,{os:1,duration:7,ease:'none'},T0+25);
        /* 7. one app window per case study opens, one after another; each plays its own small demo as it lands */
        dev.wins.forEach(function(w,i){var t=T0+28+i*4;
          tl.fromTo(w,{autoAlpha:0,y:34,scale:.92},{autoAlpha:1,y:0,scale:1,duration:5,ease:'power3.out'},t)
            .to({},{duration:.01,onStart:function(){w.classList.add('on')},onReverseComplete:function(){w.classList.remove('on')}},t+3)});
        tl.to(S,{cap:1,duration:4,ease:'none'},T0+41);
        /* 8. leave the laptop on the desk, slide along to the phone and open it up */
        var tp=T0+58;
        tl.to(S,{lb:1,duration:10,ease:'power2.inOut'},tp)
          .to(S,{pz:1,duration:20,ease:'power2.inOut'},tp+1)
          .to(S,{pu:1,duration:14,ease:'power2.inOut'},tp+12)
          .to(S,{px:1,duration:6,ease:'none'},tp+24)
          .to({},{duration:.01,onStart:function(){dev.phoneOpen(true)},onReverseComplete:function(){dev.phoneOpen(false)}},tp+30)
          .to({},{duration:10},tp+31);
      }
    },seq);
    sync()}

  function teardown(){if(mc){try{mc.revert()}catch(e){}mc=null}}
  function rebuild(){var y=scrollY;teardown();build();window.scrollTo(0,y);ST.refresh()}
  function onR(){clearTimeout(rt);rt=setTimeout(function(){
    var w=innerWidth,h=innerHeight;if(w===dims[0]&&Math.abs(h-dims[1])<130)return;dims=[w,h];rebuild()},260)}
  build();
  window.addEventListener('resize',onR);
  cleanups.push(function(){clearTimeout(rt);window.removeEventListener('resize',onR);teardown();if(dev)dev.destroy();seq.classList.remove('seq-live');Stage.seqLive(false);Stage.seqEnd()});
}

function enhance(scope){
  var rm=reduced();
  mountSeq(scope,rm);
  // headlines rise word by word, quickly (the whole line settles in about 0.7s)
  $$('[data-hl]',scope).forEach(function(h){
    var wi=$$('.wi',h);if(!G)return;
    if(rm){G.from(h,{opacity:0,duration:.25});return}
    G.from(wi,{yPercent:115,duration:.75,ease:'expo.out',stagger:.04})
  });
  // reveals
  var rev=$$('[data-r]',scope);
  if(G&&ST&&rev.length){
    G.set(rev,rm?{opacity:0}:{opacity:0,y:28});
    ST.batch(rev,{start:'top 92%',once:true,onEnter:function(b){G.to(b,rm?{opacity:1,duration:.3,overwrite:true}:{opacity:1,y:0,duration:.9,ease:'expo.out',stagger:.08,overwrite:true})}});
  }
  // counters
  $$('[data-count]',scope).forEach(function(el){
    var raw=el.dataset.count,m=raw.match(/^([^\d]*)([\d.,]+)(.*)$/);if(!m||rm||!G)return;
    var pre=m[1],num=parseFloat(m[2].replace(/,/g,'')),suf=m[3],dec=(m[2].split('.')[1]||'').length,o={v:0};
    el.textContent=pre+(0).toFixed(dec)+suf;
    ST.create({trigger:el,start:'top 85%',once:true,onEnter:function(){G.to(o,{v:num,duration:1.6,ease:'expo.out',onUpdate:function(){el.textContent=pre+o.v.toFixed(dec)+suf},onComplete:function(){el.textContent=raw}})}});
  });
  // statement words light up with scroll
  var sw=$$('[data-words] .w',scope);
  if(sw.length&&G&&ST&&!rm)G.fromTo(sw,{opacity:.18},{opacity:1,ease:'none',stagger:.1,scrollTrigger:{trigger:sw[0].parentNode,start:'top 78%',end:'bottom 48%',scrub:.4}});
  // flagship steps
  $$('[data-step]',scope).forEach(function(st){
    if(!ST||!G)return;var bar=$('.step-bar i',st),icn=$('.step-ic',st);
    ST.create({trigger:st,start:'top 62%',end:'bottom 38%',onToggle:function(s){
      st.classList.toggle('active',s.isActive);
      if(rm){G.set(bar,{scaleX:s.isActive?1:0});return}
      G.to(bar,{scaleX:s.isActive?1:0,duration:.9,ease:'expo.out',overwrite:true});
      G.to(icn,{rotate:s.isActive?-8:0,scale:s.isActive?1.08:1,duration:.7,ease:'back.out(1.7)',overwrite:true});
    }});
  });
  // canvases
  $$('canvas[data-field]',scope).forEach(function(c){cleanups.push(field(c))});
  // landing doors: hover lifts one side, click zooms the camera into it
  doors(scope,rm);
  // buttons and cards: press on pointer-down, magnet on primary buttons
  $$('[data-feel]',scope).forEach(function(b){feel(b,{magnet:b.hasAttribute('data-magnet'),press:b.classList.contains('door')||b.classList.contains('wcard')||b.classList.contains('pcard')?.985:.965})});
  $$('[data-scroll]',scope).forEach(function(b){b.addEventListener('click',function(){var t=$(b.dataset.scroll);if(t)t.scrollIntoView({behavior:reduced()?'auto':'smooth'})})});
  $$('[data-case]',scope).forEach(function(b){b.addEventListener('click',function(){openCase(+b.dataset.case,b)})});
  // contact cards
  $$('[data-reach]',scope).forEach(function(r){cleanups.push(initReach(r).destroy)});
  // marquee
  var mq=$('.marq',scope);if(mq)marquee(mq,$('#marqBtn',scope),rm);
  // writings
  var fl=$('.filters',scope);
  if(fl){
    var placeF=function(anim){var on=$('button[aria-pressed="true"]',fl),ind=$('.f-ind',fl);if(!on||!ind)return;var v={x:on.offsetLeft,width:on.offsetWidth};
      if(G&&anim&&!reduced())G.to(ind,Object.assign({duration:.55,ease:'expo.out',overwrite:true},v));else if(G)G.set(ind,v);else{ind.style.transform='translateX('+v.x+'px)';ind.style.width=v.width+'px'}};
    placeF(false);var ro=new ResizeObserver(function(){placeF(false)});ro.observe(fl);cleanups.push(function(){ro.disconnect()});
    $$('button',fl).forEach(function(b){b.addEventListener('click',function(){
      if(b.dataset.f===wFilter)return;wFilter=b.dataset.f;
      $$('button',fl).forEach(function(x){x.setAttribute('aria-pressed',String(x===b))});placeF(true);
      var wrap=$('#wwrap'),swap=function(){wrap.innerHTML=wCards();bindW();
        $$('[data-feel]',wrap).forEach(function(c){feel(c,{press:.985})});
        if(G){var cs=$$('.wcard',wrap);G.fromTo(cs,reduced()?{opacity:0}:{opacity:0,y:22},reduced()?{opacity:1,duration:.25}:{opacity:1,y:0,duration:.6,ease:'expo.out',stagger:{each:.02,amount:.4}})}};
      if(G&&!reduced()){G.to(wrap,{opacity:0,duration:.14,overwrite:true,onComplete:function(){swap();G.set(wrap,{opacity:1})}})}else swap();
      $('#live').textContent=wList().length+' writings shown';
    })});
  }
  bindW();
  $$('[data-p]',scope).forEach(function(b){b.addEventListener('click',function(){openPhoto(b.dataset.p,null,b)})});
}
function bindW(){$$('[data-w]').forEach(function(b){b.onclick=function(){openWriting(b.dataset.w,{trigger:b})}})}

/* Landing doors. Hover: the other side dims a little. Click: the camera pushes into that side and the
   hero for that page is already waiting at the end of the move. */
function doors(scope,rm){
  var land=$('.land',scope);if(!land)return;
  var ds=$$('.pdoor',land),card=$('.land-card',land),busy=false;
  ds.forEach(function(d){
    var other=ds.filter(function(x){return x!==d})[0],arrow=$('.door-arrow',d);
    d.addEventListener('pointerenter',function(e){if(e.pointerType!=='mouse'||busy)return;land.setAttribute('data-hot',d===ds[0]?'a':'b');if(G&&!rm)G.to(arrow,{rotate:45,duration:.7,ease:'back.out(1.8)',overwrite:true})});
    d.addEventListener('pointerleave',function(){if(busy)return;land.removeAttribute('data-hot');if(G)G.to(arrow,{rotate:0,duration:.55,ease:'expo.out',overwrite:true})});
    d.addEventListener('click',function(e){
      if(e.metaKey||e.ctrlKey||e.shiftKey||e.button)return;
      if(!window.Stage||!G||rm)return;           // plain navigation: the stage crossfades on its own
      e.preventDefault();if(busy)return;busy=true;land.setAttribute('data-go',d===ds[0]?'a':'b');
      var href=d.getAttribute('href');
      G.to([card,ds],{opacity:0,y:function(i,t){return t===card?-12:12},duration:.35,ease:'power2.in',overwrite:true});
      Stage.zoom(d.dataset.door,function(){location.hash=href});
    });
  });
  // intro: the scenes fade in, then the card and the two labels settle
  if(G){
    if(rm){G.set([card,ds],{opacity:1});return}
    G.fromTo(card,{opacity:0,y:-16},{opacity:1,y:0,duration:.9,ease:'expo.out',delay:.35});
    G.fromTo(ds,{opacity:0},{opacity:1,duration:.9,ease:'power2.out',delay:.55,stagger:.12});
  }
}

/* =====================================================================
   Reach card. One pill ("Get in touch") that grows into the contact panel and folds back.
   One spring (p: 0 closed, 1 open) drives the box size, the corner radius and the cross-fade:
   the pill blurs out in the first third, the panel rows blur in one after another.
   Because everything is derived from p, it can be tapped again mid-flight and reverses cleanly.
   ===================================================================== */
function liPath(){return linkedIn().replace(/^https?:\/\/(www\.)?linkedin\.com\//i,'').replace(/\/$/,'')}
function reachHTML(kind,id,o){
  o=o||{};var mail=esc(SITE.email||''),work=kind==='work',pers=kind==='personal',li=linkedIn(),open=o.open?'true':'false';
  var title=pers?'Say hello':(work?'Let’s talk':'Get in touch'),label=pers?'Say hello':'Get in touch';
  var rows=(li?'<a class="rc-row" data-rs href="'+esc(li)+'" target="_blank" rel="noopener"><span class="rc-ico">'+ic('linkedin')+'</span><span class="rc-n">LinkedIn</span><span class="rc-m">'+esc(liPath())+'</span>'+ic('arrow-ur','rc-go-i')+'</a>':'')+
    (work?'<a class="rc-row" data-rs href="'+esc(resumeHref())+'" download><span class="rc-ico">'+ic('pdf')+'</span><span class="rc-n">Resume</span><span class="rc-m">PDF</span>'+ic('down','rc-go-i')+'</a>':'');
  return '<div class="reach'+(o.pop?' reach-pop':'')+'" data-reach data-open="'+open+'"><div class="rc-box">'+
    '<div class="rc-closed"><span class="rc-av" aria-hidden="true">TI</span>'+
      '<button class="rc-go" type="button" data-rc-open aria-expanded="'+open+'" aria-controls="rcp-'+id+'">'+ic('mail')+'<span>'+label+'</span></button></div>'+
    '<div class="rc-panel" id="rcp-'+id+'" role="group" aria-label="Contact details" tabindex="-1">'+
      '<div class="rc-head" data-rs><span class="rc-title">'+ic('mail')+'<span>'+title+'</span></span><button class="rc-x" type="button" data-rc-close aria-label="Close contact details">'+ic('x')+'</button></div>'+
      '<div class="rc-field" data-rs>'+ic('mail')+'<span class="rc-addr">'+mail+'</span>'+(pers?'':'<span class="rc-tag">Fastest</span>')+'</div>'+
      (rows?'<p class="rc-lab" data-rs>Elsewhere</p>'+rows:'')+
      '<div class="rc-foot" data-rs><button class="rc-b" type="button" data-rc-copy data-email="'+mail+'" data-label="Copy email">'+ic('copy')+'<span>Copy email</span></button>'+
        '<a class="rc-b rc-b-pri" href="mailto:'+mail+'">'+ic('send')+'<span>Send email</span></a></div>'+
    '</div></div></div>';
}
function initReach(el){
  var box=$('.rc-box',el),cl=$('.rc-closed',el),pn=$('.rc-panel',el),goBtn=$('[data-rc-open]',el),xBtn=$('[data-rc-close]',el),cpBtn=$('[data-rc-copy]',el),
      items=$$('[data-rs]',pn),pop=el.classList.contains('reach-pop'),open=el.dataset.open==='true',dim={cw:0,ch:0,ow:0,oh:0},wantScroll=false,OPEN_R=28,self={};
  var sp=Spring(open?1:0,{response:.5,damping:.86,precision:.001});
  var smooth=function(t){return t*t*(3-2*t)};
  function layer(e,op,blur,sc,y){
    e.style.opacity=op;e.style.filter=blur>.05?'blur('+blur.toFixed(2)+'px)':'';
    e.style.transform=(sc!==1||y)?'translateY('+y.toFixed(2)+'px) scale('+sc.toFixed(3)+')':'';
  }
  function measure(){
    var a=cl.offsetWidth,b=cl.offsetHeight,c=pn.offsetWidth,d=pn.offsetHeight;
    if(!a||!c)return false;dim={cw:a,ch:b,ow:c,oh:d};
    if(pop)el.style.height=(b+2)+'px';
    return true;
  }
  function paint(p){
    if(!dim.cw&&!measure())return;
    var q=clamp(p,0,1);
    box.style.width=(dim.cw+(dim.ow-dim.cw)*p)+'px';
    box.style.height=(dim.ch+(dim.oh-dim.ch)*p)+'px';
    box.style.borderRadius=(dim.ch/2+(OPEN_R-dim.ch/2)*q)+'px';
    var c=clamp(1-q/.3,0,1);layer(cl,c,(1-c)*7,.9+.1*c,0);
    items.forEach(function(it,i){var t=smooth(clamp((q-.24-i*.05)/.4,0,1));layer(it,t,(1-t)*9,1,(1-t)*10)});
  }
  function inertFor(v){
    if(v){cl.setAttribute('inert','');pn.removeAttribute('inert')}else{pn.setAttribute('inert','');cl.removeAttribute('inert')}
  }
  function place(){ // footer card: grow rightwards if there is room, otherwise leftwards
    if(!pop||open||!dim.ow)return;
    el.classList.toggle('rc-r',el.getBoundingClientRect().left+dim.ow+8>innerWidth);
  }
  function setOpen(v,o){
    o=o||{};if(v===open)return;open=v;
    el.dataset.open=String(v);goBtn.setAttribute('aria-expanded',String(v));inertFor(v);
    el.classList.toggle('rc-rm',reduced());
    if(v)measure();
    if(o.now){sp.set(v?1:0)}
    else{wantScroll=v&&!pop;sp.to(v?1:0,v?{response:.55,damping:.84}:{response:.42,damping:.92})}
    if(v&&!o.silent){pn.focus({preventScroll:true})}
    else if(!v&&o.focus){goBtn.focus({preventScroll:true})}
    if(!o.silent)$('#live').textContent=v?'Contact details open':'Contact details closed';
  }
  sp.update(paint).rest(function(){
    if(!open){place();return}
    if(!wantScroll)return;wantScroll=false;
    var r=box.getBoundingClientRect(),over=r.bottom-(innerHeight-20);
    if(over>0)window.scrollBy({top:Math.min(over,Math.max(0,r.top-72)),behavior:reduced()?'auto':'smooth'});
  });
  inertFor(open);
  [goBtn,xBtn,cpBtn,$('.rc-b-pri',el)].forEach(function(b){if(b)feel(b,{press:b===xBtn?.9:.96})});
  goBtn.addEventListener('click',function(){setOpen(true)});
  xBtn.addEventListener('click',function(){setOpen(false,{focus:true})});
  cpBtn.addEventListener('click',function(){copyText(cpBtn.dataset.email,cpBtn)});
  el.addEventListener('keydown',function(e){if(e.key==='Escape'&&open){e.stopPropagation();setOpen(false,{focus:true})}});
  var onDown=function(e){if(pop&&open&&!el.contains(e.target))setOpen(false)};
  if(pop)document.addEventListener('pointerdown',onDown);
  // sizes depend on fonts, text size and viewport; the footer is also measured the first time it becomes visible
  var ro=new ResizeObserver(function(){if(measure()){place();paint(sp.value())}});ro.observe(cl);ro.observe(pn);
  if(measure()){place();paint(sp.value())}
  self.close=function(now){setOpen(false,{now:!!now,silent:true})};
  self.open=function(now){setOpen(true,{now:!!now,silent:true})};
  self.destroy=function(){sp.stop();ro.disconnect();if(pop)document.removeEventListener('pointerdown',onDown)};
  return self;
}

function copyText(t,b){
  var label=b.dataset.label||'Copy';
  var done=function(){b.classList.add('done');b.innerHTML=ic('check')+'<span>Copied</span>';$('#live').textContent='Email address copied';
    setTimeout(function(){b.classList.remove('done');b.innerHTML=ic('copy')+'<span>'+label+'</span>'},2000)};
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(done,function(){location.href='mailto:'+t})}else{location.href='mailto:'+t}
}

/* skills marquee: pauses on hover, on keyboard focus, off screen, and from a visible button */
function marquee(el,btn,rm){
  var t=el.firstElementChild;
  if(rm||!G){el.classList.add('static');if(btn)btn.hidden=true;return}
  var half=0,x=0,paused=false,hover=false,focus=false,vis=true,speed=38;
  var measure=function(){half=t.scrollWidth/2};measure();
  var ro=new ResizeObserver(measure);ro.observe(t);
  var tick=function(time,dtms){if(paused||hover||focus||!vis||!half)return;x-=speed*Math.min(dtms,50)/1000;if(x<=-half)x+=half;G.set(t,{x:x})};
  G.ticker.add(tick);
  el.addEventListener('pointerenter',function(e){if(e.pointerType==='mouse')hover=true});el.addEventListener('pointerleave',function(){hover=false});
  el.addEventListener('focusin',function(){focus=true});el.addEventListener('focusout',function(){focus=false});
  var io=new IntersectionObserver(function(es){vis=es[0].isIntersecting});io.observe(el);
  if(btn)btn.addEventListener('click',function(){paused=!paused;btn.setAttribute('aria-pressed',String(paused));btn.setAttribute('aria-label',paused?'Play the moving skills list':'Pause the moving skills list');btn.innerHTML=ic(paused?'play':'pause')});
  if(btn)feel(btn,{press:.92});
  cleanups.push(function(){G.ticker.remove(tick);ro.disconnect();io.disconnect()});
}

/* =====================================================================
   Dialogs: anchored to the tapped element (desktop), draggable sheet (phones)
   ===================================================================== */
var dlg=$('#dlg'),dlgBody=$('#dlgBody'),scrim=$('#scrim'),lastFocus=null,dlgKeys=null,dlgClosing=false,dlgTrigger=null,sheetSpring=null;
var X='<button class="icon-btn x" type="button" data-close aria-label="Close">'+ic('x')+'</button>';
var GRAB='<div class="grab" data-grab aria-hidden="true"></div>';
function panelEl(){return $('.panel',dlg)}
function lock(on){root.style.overflow=on?'hidden':''}

function fromState(panel){
  if(isSheet())return {yPercent:100};
  var tr=dlgTrigger&&document.body.contains(dlgTrigger)?dlgTrigger.getBoundingClientRect():null,pr=panel.getBoundingClientRect();
  if(!tr||!tr.width)return {scale:.94,y:24,opacity:0};
  var s=clamp(tr.width/pr.width,.2,.85);
  return {x:(tr.left+tr.width/2)-(pr.left+pr.width/2),y:(tr.top+tr.height/2)-(pr.top+pr.height/2),scale:s,opacity:0};
}
function openDlg(html,trigger,keys){
  lastFocus=document.activeElement;dlgTrigger=trigger||null;dlgKeys=keys||null;dlgClosing=false;
  dlgBody.innerHTML=html;
  var wasOpen=dlg.open;
  if(!wasOpen){dlg.showModal();lock(true)}
  var panel=panelEl();dlgBody.scrollTop=0;
  bindPanel(panel);
  var x=$('.x',dlg);if(x)x.focus({preventScroll:true});
  if(!G)return;
  G.killTweensOf([panel,scrim]);
  var from=fromState(panel),fade=from.opacity===0;delete from.opacity;
  if(reduced()){G.fromTo(panel,{opacity:0},{opacity:1,duration:.2});G.to(scrim,{opacity:1,duration:.2});return}
  G.to(scrim,{opacity:1,duration:.45,ease:'power2.out'});
  G.fromTo(panel,from,{x:0,y:0,yPercent:0,scale:1,duration:isSheet()?.65:.75,ease:'expo.out'});
  if(fade)G.fromTo(panel,{opacity:0},{opacity:1,duration:.25,ease:'power1.out'});
}
function finalizeClose(now){
  dlgClosing=false;if(sheetSpring){sheetSpring.stop();sheetSpring=null}
  if(dlg.open)dlg.close();lock(false);dlgKeys=null;
  if(G){G.set(scrim,{opacity:0});var p=panelEl();if(p)G.set(p,{clearProps:'all'})}
  if(lastFocus&&lastFocus.focus&&!now&&document.body.contains(lastFocus))lastFocus.focus({preventScroll:true});
}
function closeDlg(o){
  o=o||{};if(!dlg.open)return;
  if(o.now||!G){finalizeClose(true);return}
  if(dlgClosing)return;dlgClosing=true;
  var panel=panelEl();G.killTweensOf([panel,scrim]);
  if(reduced()){G.to(panel,{opacity:0,duration:.15,onComplete:function(){finalizeClose()}});G.to(scrim,{opacity:0,duration:.15});return}
  var to=fromState(panel);   // same path out as in
  to.duration=isSheet()?.42:.4;to.ease='power3.inOut';to.overwrite=true;to.onComplete=function(){finalizeClose()};
  G.to(panel,to);G.to(scrim,{opacity:0,duration:.35,ease:'power2.in',overwrite:true});
}
dlg.addEventListener('cancel',function(e){e.preventDefault();closeDlg()});
dlgBody.addEventListener('click',function(e){if(e.target===this)closeDlg()});
document.addEventListener('keydown',function(e){if(!dlg.open||!dlgKeys)return;if(e.key==='ArrowRight'&&dlgKeys.next)dlgKeys.next(-1);if(e.key==='ArrowLeft'&&dlgKeys.prev)dlgKeys.prev(1)});

function bindPanel(panel){
  if(!panel)return;
  $$('[data-close]',dlg).forEach(function(b){b.addEventListener('click',function(){closeDlg()});feel(b,{press:.9})});
  $$('[data-go]',dlg).forEach(function(b){feel(b,{press:.96})});
  var grab=$('[data-grab]',dlg);if(grab)sheetDrag(panel,grab);
  if(dlgKeys)swipeNav(panel);
}

/* Drag the sheet down: 1:1 tracking, rubber band upwards, flick projection, spring with the release velocity. */
function sheetDrag(panel,grab){
  var startY=0,baseY=0,samples=[],active=false,h=1;
  grab.addEventListener('pointerdown',function(e){
    if(!isSheet()||!G)return;active=true;dlgClosing=false;
    G.killTweensOf([panel,scrim]);if(sheetSpring){sheetSpring.stop()}
    var ph=panel.offsetHeight;h=Math.min(ph,window.innerHeight);   // measure against what is visible, not the whole scrolling panel
    var y=G.getProperty(panel,'y')+G.getProperty(panel,'yPercent')/100*ph;G.set(panel,{y:y,yPercent:0});baseY=y;startY=e.clientY;samples=[{y:e.clientY,t:performance.now()}];
    grab.setPointerCapture(e.pointerId);
  });
  grab.addEventListener('pointermove',function(e){
    if(!active)return;var dy=e.clientY-startY,y=baseY+dy;if(y<0)y=rubber(y,h);
    G.set(panel,{y:y});G.set(scrim,{opacity:1-clamp(y/h,0,1)*.9});samples.push({y:e.clientY,t:performance.now()});if(samples.length>12)samples.shift();
  });
  var end=function(){
    if(!active)return;active=false;
    var y=G.getProperty(panel,'y'),v=velocityOf(samples,'y'),proj=y+project(v);
    var dismiss=proj>h*.4||y>h*.55;
    sheetSpring=Spring(y,{response:.38,damping:dismiss?1:.8}).update(function(val){G.set(panel,{y:val});G.set(scrim,{opacity:1-clamp(val/h,0,1)*.9})});
    sheetSpring.rest(function(){if(dismiss)finalizeClose();});
    sheetSpring.set(y);sheetSpring.to(dismiss?h+8:0);if(!reduced())sheetSpring.impulse(v);
  };
  grab.addEventListener('pointerup',end);grab.addEventListener('pointercancel',end);
}

/* Swipe between writings / photographs: axis lock after 10px, 1:1 follow, rubber band at the ends,
   decide with the projected landing point, hand the finger's velocity to the exit. */
function swipeNav(panel){
  var sw=$('.sw',panel);if(!sw||!G)return;
  var sx=0,sy=0,mode='idle',samples=[],W=1,id=null,keys=dlgKeys;
  panel.addEventListener('pointerdown',function(e){if(e.pointerType==='mouse'||e.target.closest('button,a,[data-grab]'))return;sx=e.clientX;sy=e.clientY;mode='pending';id=e.pointerId;samples=[{x:e.clientX,t:performance.now()}];W=panel.offsetWidth;G.killTweensOf(sw)});
  panel.addEventListener('pointermove',function(e){
    if(e.pointerId!==id||mode==='idle'||mode==='vertical')return;
    var dx=e.clientX-sx,dy=e.clientY-sy;
    if(mode==='pending'){if(Math.abs(dx)<10&&Math.abs(dy)<10)return;if(Math.abs(dx)>Math.abs(dy)*1.2){mode='drag';try{panel.setPointerCapture(id)}catch(_){}}else{mode='vertical';return}}
    var x=dx;if((dx>0&&!keys.prev)||(dx<0&&!keys.next))x=rubber(dx,W);
    G.set(sw,{x:x,opacity:1-clamp(Math.abs(x)/W,0,1)*.6});samples.push({x:e.clientX,t:performance.now()});if(samples.length>12)samples.shift();
  });
  var end=function(e){
    if(e.pointerId!==id)return;var m=mode;mode='idle';if(m!=='drag')return;
    var x=G.getProperty(sw,'x'),v=velocityOf(samples,'x'),proj=x+project(v,.99);
    var go=proj<-W*.3&&keys.next?-1:(proj>W*.3&&keys.prev?1:0);
    if(go===0){var sp=Spring(x,{response:.38,damping:.8}).update(function(val){G.set(sw,{x:val,opacity:1-clamp(Math.abs(val)/W,0,1)*.6})});sp.set(x);sp.to(0);if(!reduced())sp.impulse(v);return}
    var dist=W-Math.abs(x),dur=clamp(dist/Math.max(Math.abs(v),600),.12,.3);
    G.to(sw,{x:go*W,opacity:0,duration:dur,ease:'power2.out',overwrite:true,onComplete:function(){(go<0?keys.next:keys.prev)(go)}});
  };
  panel.addEventListener('pointerup',end);panel.addEventListener('pointercancel',end);
}
/* swap dialog content in place and slide the new page in from the direction of travel */
function swapDlg(html,dir,keys){
  dlgKeys=keys;dlgBody.innerHTML=html;dlgBody.scrollTop=0;
  var panel=panelEl();bindPanel(panel);
  var sw=$('.sw',panel);if(G&&sw){
    if(reduced())G.fromTo(sw,{opacity:0},{opacity:1,duration:.2});
    else G.fromTo(sw,{x:(dir>0?-1:1)*panel.offsetWidth*.35,opacity:0},{x:0,opacity:1,duration:.6,ease:'expo.out',overwrite:true});
  }
  var xb=$('.x',dlg);if(xb)xb.focus({preventScroll:true});
}

function openCase(i,trigger){
  var f=((SITE.work||{}).featured||[])[i];if(!f)return;
  var html='<article class="panel">'+GRAB+X+'<div class="sw"><div class="case-tag">'+esc(f.tag)+'</div><h2 id="dlgTitle">'+esc(f.title)+'</h2>'+
    (f.mets?'<div class="mets">'+f.mets.map(function(m){return '<div class="met"><b>'+esc(m[1])+'</b><span>'+esc(m[0])+'</span></div>'}).join('')+'</div>':'')+
    '<div class="case">'+(f.case||[]).map(function(c){return '<div class="case-row"><h4>'+esc(c[0])+'</h4><p>'+esc(c[1])+'</p></div>'}).join('')+'</div>'+
    '<div class="chips">'+(f.chips||[]).map(function(c){return '<span class="chip">'+esc(c)+'</span>'}).join('')+'</div></div></article>';
  openDlg(html,trigger,null);
}
function openWriting(id,o){
  o=o||{};
  var L=wList(),i=L.findIndex(function(w){return w.id===id});if(i<0){L=SITE.writings||[];i=L.findIndex(function(w){return w.id===id})}if(i<0)return;
  var w=L[i],lg=LANG[w.lang]||'en',prev=L[i-1],next=L[i+1];
  var verse=(w.lines||[]).map(function(l){return l&&l.trim()?'<p>'+esc(l)+'</p>':'<div class="gap"></div>'}).join('');
  var html='<article class="panel reader" '+(lg!=='en'?'lang="'+lg+'"':'')+'>'+GRAB+X+'<div class="sw">'+
    '<div class="rmeta" lang="en"><span>'+kindLabel(w.kind)+'</span><span>'+esc(w.lang)+'</span></div>'+
    '<h2 id="dlgTitle" style="margin-top:.75rem">'+esc(w.title)+'</h2><div class="verse">'+verse+'</div>'+
    '<div class="rnav" lang="en">'+(prev?'<button class="btn btn-ghost" type="button" data-go="'+esc(prev.id)+'" data-dir="1">'+ic('arrow-l')+'Previous</button>':'<span></span>')+
    '<span class="pos mono">'+(i+1)+' / '+L.length+'</span>'+
    (next?'<button class="btn btn-ghost" type="button" data-go="'+esc(next.id)+'" data-dir="-1">Next'+ic('arrow-r')+'</button>':'<span></span>')+'</div></div></article>';
  var keys={prev:prev?function(d){openWriting(prev.id,{dir:d==null?1:d})}:null,next:next?function(d){openWriting(next.id,{dir:d==null?-1:d})}:null};
  if(o.dir&&dlg.open)swapDlg(html,o.dir,keys);else openDlg(html,o.trigger,keys);
  $$('[data-go]',dlg).forEach(function(b){b.addEventListener('click',function(){openWriting(b.dataset.go,{dir:+b.dataset.dir})})});
}
function openPhoto(id,o,trigger){
  o=o||{};var P=realPhotos(),i=P.findIndex(function(p){return p.id===id});if(i<0)return;var p=P[i],prev=P[i-1],next=P[i+1];
  var gg=(SITE.photoGroups||[]).filter(function(g){return g.id===p.g})[0]||{name:'Photograph'},ar=(p.w||3)/(p.h||2);
  var html='<article class="panel viewer" oncontextmenu="return false">'+GRAB+X+'<div class="sw"><div class="pimg" style="aspect-ratio:'+(p.w||3)+'/'+(p.h||2)+';width:min(100%,calc(68vh*'+ar.toFixed(3)+'))"><img src="'+esc(photoSrc(p))+'" alt="Photograph in the group: '+esc(gg.name)+'" draggable="false"></div>'+
    '<div class="vinfo"><div><h2 id="dlgTitle">'+esc(gg.name)+'</h2><p>'+esc(gg.note||'')+'</p></div></div>'+
    '<div class="rnav" style="margin-top:.75rem;padding-inline:.625rem">'+(prev?'<button class="btn btn-ghost" type="button" data-pgo="'+esc(prev.id)+'" data-dir="1">'+ic('arrow-l')+'Previous</button>':'<span></span>')+
    '<span class="pos mono">'+(i+1)+' / '+P.length+'</span>'+(next?'<button class="btn btn-ghost" type="button" data-pgo="'+esc(next.id)+'" data-dir="-1">Next'+ic('arrow-r')+'</button>':'<span></span>')+'</div></div></article>';
  var keys={prev:prev?function(d){openPhoto(prev.id,{dir:d==null?1:d})}:null,next:next?function(d){openPhoto(next.id,{dir:d==null?-1:d})}:null};
  if(o.dir&&dlg.open)swapDlg(html,o.dir,keys);else openDlg(html,trigger,keys);
  $$('[data-pgo]',dlg).forEach(function(b){b.addEventListener('click',function(){openPhoto(b.dataset.pgo,{dir:+b.dataset.dir})})});
}

/* =====================================================================
   Hero canvas: document fragments assemble into a table
   (drawn in ivory and soft black on the orange block; one shared GSAP ticker; still frame for reduced motion)
   ===================================================================== */
function field(cv){
  var ctx2=cv.getContext('2d'),W=0,H=0,dpr=1,vis=false,parts=[],L=null,t0=performance.now();
  var IV='#E6D5BD',BK='#101010';
  var rnd=function(a){var x=Math.sin(a*127.1)*43758.5453;return x-Math.floor(x)};
  var ease=function(p){return p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2};
  function rr(x,y,w,h,r){ctx2.beginPath();if(ctx2.roundRect)ctx2.roundRect(x,y,w,h,r);else ctx2.rect(x,y,w,h)}
  function size(){var r=cv.getBoundingClientRect();dpr=Math.min(2,window.devicePixelRatio||1);W=Math.max(1,r.width);H=Math.max(1,r.height);
    cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);ctx2.setTransform(dpr,0,0,dpr,0,0);seed();frame(performance.now())}
  function seed(){
    parts=[];var cols=4,rows=7,pad=W*.07,docW=W*.30,docX=pad,docY=H*.14,docH=H*.72,tabX=W*.50,tabW=W*.50-pad,tabY=H*.18,rowH=(H*.64)/rows,cw=tabW/cols;
    L={docX:docX,docY:docY,docW:docW,docH:docH,tabX:tabX,tabY:tabY,tabW:tabW,rowH:rowH,rows:rows};
    for(var r=0;r<rows;r++)for(var c=0;c<cols;c++){var k=r*cols+c,sw=10+rnd(k+3.1)*28;
      parts.push({sx:docX+12+rnd(k+1)*(docW-24-sw),sy:docY+14+rnd(k+7.3)*(docH-28),sw:sw,tx:tabX+c*cw+6,ty:tabY+r*rowH+rowH*.32,tw:cw-12-(c===0?0:rnd(k+9)*cw*.35),r:r,c:c,d:(c*.12+r*.05)})}
  }
  function frame(now){
    if(!L)return;var t=(now-t0)/1000,ph=reduced()?3.6:(t%8);
    ctx2.clearRect(0,0,W,H);ctx2.lineWidth=1.5;ctx2.strokeStyle=BK;ctx2.globalAlpha=.55;
    rr(L.docX,L.docY,L.docW,L.docH,12);ctx2.stroke();
    ctx2.globalAlpha=.3;for(var g=0;g<=L.rows;g++){ctx2.beginPath();ctx2.moveTo(L.tabX,L.tabY+g*L.rowH-L.rowH*.18);ctx2.lineTo(L.tabX+L.tabW,L.tabY+g*L.rowH-L.rowH*.18);ctx2.stroke()}
    var sweepOn=ph>3.4&&ph<6.2,sr=Math.floor(((ph-3.4)/2.8)*L.rows);
    if(sweepOn){var y0=L.tabY+sr*L.rowH-L.rowH*.18;ctx2.globalAlpha=.9;ctx2.fillStyle=IV;rr(L.tabX-6,y0+2,L.tabW+12,L.rowH-4,8);ctx2.fill()}
    parts.forEach(function(p){
      var k=clamp(ph<5.9?(ph-1-p.d)/1.6:1-(ph-6.6-p.d*.5)/1,0,1),e=ease(k);
      var jx=Math.sin(t*1.3+p.sx)*1.6*(1-e),jy=Math.cos(t*1.1+p.sy)*1.6*(1-e);
      var x=p.sx+(p.tx-p.sx)*e+jx,y=p.sy+(p.ty-p.sy)*e+jy,w=p.sw+(p.tw-p.sw)*e,h=5+e*3,hot=sweepOn&&p.r===sr;
      ctx2.fillStyle=(hot||e>.9&&p.c===0)?BK:IV;ctx2.globalAlpha=hot?1:(.55+e*.4);rr(x,y,w,h,h/2);ctx2.fill();
    });
    ctx2.globalAlpha=1;
    var ax=L.docX+L.docW+14,bx=L.tabX-14,ay=H/2;ctx2.strokeStyle=BK;ctx2.globalAlpha=.5;ctx2.setLineDash([3,5]);ctx2.beginPath();ctx2.moveTo(ax,ay);ctx2.lineTo(bx,ay);ctx2.stroke();ctx2.setLineDash([]);
    var mv=reduced()?.5:((t*.6)%1);ctx2.globalAlpha=1;ctx2.fillStyle=BK;ctx2.beginPath();ctx2.arc(ax+(bx-ax)*mv,ay,3.5,0,7);ctx2.fill();
  }
  var tick=function(){if(vis&&!document.hidden&&!reduced())frame(performance.now())};
  if(G)G.ticker.add(tick);
  var ro=new ResizeObserver(size);ro.observe(cv);
  var io=new IntersectionObserver(function(es){vis=es[0].isIntersecting});io.observe(cv);
  var onRM=function(){frame(performance.now())};RMQ.addEventListener('change',onRM);
  return function(){if(G)G.ticker.remove(tick);ro.disconnect();io.disconnect();RMQ.removeEventListener('change',onRM)};
}

/* =====================================================================
   Boot: fetch content, then render exactly once (no timer, no late re-render)
   ===================================================================== */
$('#yr').textContent=new Date().getFullYear();
var footReach=null;
function fillReach(){var h=$('#footReach');h.innerHTML=reachHTML('foot','foot',{pop:true});footReach=initReach($('[data-reach]',h))}
function start(){fillReach();route()}
function fail(){root.classList.remove('js')}   // show the static fallback instead of a blank page
if(window.fetch){fetch('content.json?v=7',{cache:'no-cache'}).then(function(r){return r.ok?r.json():Promise.reject()}).then(function(d){
  if(d&&typeof d==='object'){SITE=d;start()}else fail()}).catch(fail)}else fail();
})();
