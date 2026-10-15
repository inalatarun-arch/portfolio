/* Tarun Inala – guestbook: a pixel typewriter for leaving a review or a comment.
   - The paper is a real <textarea>, so typing, paste, IME, mobile keyboards and screen readers all just work.
   - What you do moves the machine: every letter steps the carriage and strikes the type slug, Enter (or running out of
     line) throws the carriage return and rolls the paper up one line, the bell rings near the end of a line,
     the keys on the keyboard press as you type. GSAP runs all of it; prefers-reduced-motion drops the movement.
   - Reviews are stored in a Google Sheet through Apps Script (backend/reviews.gs). Set reviews.endpoint in content.json.
     Until then it runs in a clearly labelled preview where notes stay on the visitor's device. */
(function(){
'use strict';
var G=window.gsap,P=window.PX||null,RMQ=window.matchMedia('(prefers-reduced-motion: reduce)');
var INK='#1b1730',KEY='inala-rv';
var $=function(s,r){return (r||document).querySelector(s)};
var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
var reduced=function(){return RMQ.matches||!G};
var el=function(tag,cls,html){var e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e};
var store={get:function(k){try{return JSON.parse(localStorage.getItem(KEY+'-'+k))}catch(e){return null}},set:function(k,v){try{localStorage.setItem(KEY+'-'+k,JSON.stringify(v))}catch(e){}},del:function(k){try{localStorage.removeItem(KEY+'-'+k)}catch(e){}}};

/* ------------------------------------------------------------------ pixel art */
var STAR=['....#....','....#....','...###...','#########','.#######.','..#####..','..##.##..','.##...##.','.#.....#.'];
function starSVG(on,cls){var d='';STAR.forEach(function(r,y){for(var x=0;x<9;x++)if(r[x]==='#')d+='M'+x+' '+y+'h1v1h-1z'});
  return '<svg class="rv-star'+(cls?' '+cls:'')+(on?' on':'')+'" viewBox="0 0 9 9" aria-hidden="true" shape-rendering="crispEdges"><path d="'+d+'"/></svg>'}
function stars(n){var s='';for(var i=1;i<=5;i++)s+=starSVG(i<=n);return '<span class="rv-stars" role="img" aria-label="'+n+' out of 5">'+s+'</span>'}

function canvas(w,h,k){var o=P.mk(w,h);o.c.style.width=w*k+'px';o.c.style.height=h*k+'px';return o}
/* the top of the machine: two side posts, the platen roller across the bottom, and a clear window for the paper */
function drawFrame(L,rows,m,k){
  var o=canvas(L,rows+14,k),x=o.x,y=rows,B='#2f4858',H='#4f7388',D='#1c2c36';
  R(x,0,2,m,rows+12,B);R(x,L-m,2,m,rows+12,B);R(x,0,2,1,rows+12,H);R(x,L-m,2,1,rows+12,H);R(x,m-1,2,1,rows+12,D);R(x,L-m,2,1,rows+12,D);
  R(x,1,0,m-2,2,B);R(x,L-m+1,0,m-2,2,B);R(x,1,0,m-2,1,H);R(x,L-m+1,0,m-2,1,H);
  R(x,0,y,L,14,B);R(x,0,y,L,1,H);R(x,0,y+13,L,1,D);
  R(x,m-1,y-1,L-2*m+2,7,'#26262c');R(x,m-1,y-1,L-2*m+2,1,'#6e6e7a');R(x,m-1,y+1,L-2*m+2,1,'#4a4a54');R(x,m-1,y+4,L-2*m+2,2,'#14141a');
  for(var i=m+2;i<L-m-1;i+=4)R(x,i,y+2,1,2,'#3a3a44');
  R(x,m+1,y+7,L-2*m-2,5,D);R(x,m+1,y+7,L-2*m-2,1,'#3d5a6c');
  P.outline(o,INK);return o.c}
function drawCase(L,rows,k){
  var o=canvas(L,rows,k),x=o.x,B='#2f4858',H='#4f7388',D='#1c2c36';
  R(x,0,2,L,rows-4,B);R(x,2,0,L-4,2,B);R(x,1,1,1,1,B);R(x,L-2,1,1,1,B);
  R(x,2,0,L-4,1,H);R(x,0,2,1,rows-6,H);R(x,L-1,2,1,rows-6,D);R(x,2,rows-5,L-4,1,D);
  R(x,0,9,L,2,'#e0573c');R(x,0,9,L,1,'#ff8a6a');
  R(x,7,12,L-14,rows-18,'#101a21');R(x,8,13,L-16,rows-20,'#1d2a33');
  for(var j=14;j<rows-8;j+=3)for(var i=9+((j/3|0)%2)*2;i<L-9;i+=4)P.P1(x,i,j,'#233541');
  R(x,6,rows-4,12,3,'#0e0e12');R(x,L-18,rows-4,12,3,'#0e0e12');
  P.outline(o,INK);return o.c}
function drawKnob(k){var o=canvas(11,11,k),x=o.x;P.ell(x,5,5,5,5,'#d9d2bd');P.ell(x,5,5,3,3,'#a89f86');P.ell(x,5,5,1,1,'#d9d2bd');
  R(x,5,0,1,3,'#7b735e');R(x,5,8,1,3,'#7b735e');R(x,0,5,3,1,'#7b735e');R(x,8,5,3,1,'#7b735e');R(x,2,2,1,1,'#fff6df');P.outline(o,INK);return o.c}
function drawLever(k){var o=canvas(8,18,k),x=o.x;R(x,3,5,2,12,'#b9b29b');R(x,3,5,1,12,'#efe9d6');P.ell(x,4,3,3,3,'#e0573c');P1(x,3,2,'#ffb199');P.outline(o,INK);return o.c}
function drawBell(k){var o=canvas(9,9,k),x=o.x;R(x,3,1,3,1,'#f0b23c');R(x,2,2,5,3,'#f0b23c');R(x,1,5,7,2,'#e29a1e');R(x,0,7,9,1,'#c47e12');R(x,2,2,1,3,'#ffe08a');P1(x,4,8,'#7a4a0a');P.outline(o,INK);return o.c}
function drawSlug(k){var o=canvas(4,7,k),x=o.x;R(x,0,2,4,5,'#3b3b44');R(x,0,2,1,5,'#6e6e7a');R(x,1,0,2,2,'#e0573c');P.outline(o,INK);return o.c}
function drawIcon(k){var o=canvas(16,14,k),x=o.x;R(x,3,0,10,6,'#f4ead6');R(x,4,2,5,1,'#8a8470');R(x,4,4,7,1,'#8a8470');R(x,0,6,16,2,'#4f7388');R(x,0,8,16,5,'#2f4858');R(x,0,8,16,1,'#4f7388');
  for(var i=2;i<14;i+=3){R(x,i,10,2,2,'#efe6cf')}P.outline(o,INK);return o.c}
var R=function(x,X,Y,w,h,c){if(w>0&&h>0){x.fillStyle=c;x.fillRect(Math.round(X),Math.round(Y),Math.round(w),Math.round(h))}},P1=function(x,X,Y,c){R(x,X,Y,1,1,c)};

/* ------------------------------------------------------------------ the typewriter */
function Typewriter(host,opt){
  opt=opt||{};
  var T={},max=opt.max||400,demo=!!opt.demo,k=4,L=140,COLS=26,A=.3,cw=12,lh=26,wh=140,S=0,padL=0,padT=0,sy=0,ready=false,onChange=null;
  host.innerHTML='<div class="tw'+(demo?' tw-demo':'')+'"><div class="tw-win"><div class="tw-paper"><textarea class="tw-ta" rows="1" spellcheck="true" autocapitalize="sentences" maxlength="'+max+'" aria-label="Your note"></textarea></div>'+
    '<div class="tw-head"><div class="tw-slug"></div></div></div>'+
    '<div class="tw-frame"></div><div class="tw-knob tw-knob-l"></div><div class="tw-knob tw-knob-r"></div>'+
    '<div class="tw-case"><div class="tw-casecv"></div><div class="tw-plate" aria-hidden="true">INALA &nbsp;No. 1</div><div class="tw-lcd" aria-hidden="true"><b class="tw-cnt">000</b>/'+max+'</div>'+
    '<div class="tw-bell" aria-hidden="true"><i></i><span class="tw-ding">DING!</span></div><div class="tw-keys" aria-hidden="true"></div></div>'+
    '<div class="tw-lever" aria-hidden="true"></div></div>';
  var tw=$('.tw',host),win=$('.tw-win',host),paper=$('.tw-paper',host),ta=$('.tw-ta',host),head=$('.tw-head',host),slug=$('.tw-slug',host),
      knobs=$$('.tw-knob',host),bell=$('.tw-bell i',host),ding=$('.tw-ding',host),lever=$('.tw-lever',host),cnt=$('.tw-cnt',host),keysEl=$('.tw-keys',host),
      mirror=el('div','tw-mirror'),keyMap={},cur={col:0,line:0,w:0},lines=1;
  mirror.setAttribute('aria-hidden','true');tw.appendChild(mirror);
  if(demo){ta.readOnly=true;ta.tabIndex=-1;ta.setAttribute('aria-hidden','true')}
  ta.placeholder=opt.placeholder||'Dear Tarun,\n\nType here. Press Enter to return the carriage.';

  /* a glyph's advance, as a fraction of the font size, so a column is an exact number of pixels */
  var adv=(function(){try{var c=document.createElement('canvas').getContext('2d');c.font='100px '+getComputedStyle(document.documentElement).getPropertyValue('--mono');
    var w=c.measureText('MMMMMMMMMM').width/1000;return w>.3&&w<1?w:.6}catch(e){return .6}})();

  function layout(){
    var W=Math.max(260,Math.min(host.clientWidth||560,620));
    k=W>=520?4:W>=400?3:2;L=Math.floor(W/k);COLS=L<150?24:26;
    var m=7,winW=(L-2*m)*k;cw=winW/(COLS+3+A*COLS);S=A*COLS*cw;
    lh=Math.round(cw*2.1);wh=Math.max(4,Math.round(lh*5.4/k))*k;padL=1.5*cw;padT=1.4*lh;sy=wh-.75*lh;
    var rows=wh/k,cp=!!(opt.compact&&opt.compact()),casePx=(cp?10:58)*k,topPx=wh+14*k;tw.classList.toggle('tw-compact',cp);
    tw.style.setProperty('--k',k+'px');tw.style.width=L*k+'px';tw.style.height=(topPx+casePx)+'px';
    win.style.cssText='left:'+m*k+'px;width:'+winW+'px;height:'+wh+'px';
    var fr=$('.tw-frame',host);fr.innerHTML='';fr.appendChild(drawFrame(L,rows,m,k));
    var cs=$('.tw-case',host);cs.style.cssText='top:'+topPx+'px;height:'+casePx+'px;width:'+L*k+'px';
    var cc=$('.tw-casecv',host);cc.innerHTML='';if(!cp)cc.appendChild(drawCase(L,58,k));
    knobs.forEach(function(kn,i){kn.innerHTML='';kn.appendChild(drawKnob(k));kn.style.cssText='left:'+(i?(L-m/2-5.5):(m/2-5.5))*k+'px;top:'+(rows+1)*k+'px'});
    lever.innerHTML='';lever.appendChild(drawLever(k));lever.style.cssText='left:'+k*1+'px;top:'+(topPx-9*k)+'px';
    bell.innerHTML='';bell.appendChild(drawBell(k));$('.tw-bell',host).style.cssText='left:'+(L-18)*k+'px;top:'+1*k+'px';
    slug.innerHTML='';slug.appendChild(drawSlug(k));head.style.cssText='width:'+cw+'px;height:'+7*k+'px;top:'+(wh-7*k)+'px';
    var fs=cw/adv,font='font-size:'+fs.toFixed(3)+'px;line-height:'+lh+'px;width:'+(COLS*cw).toFixed(2)+'px;';
    paper.style.cssText='width:'+((COLS+3)*cw).toFixed(2)+'px';
    ta.style.cssText=font+'left:'+padL+'px;top:'+padT+'px';
    mirror.style.cssText=font;
    $('.tw-plate',host).style.cssText='left:'+10*k+'px;top:'+2*k+'px;font-size:'+3.3*k+'px;height:'+6*k+'px;line-height:'+6*k+'px';
    $('.tw-lcd',host).style.cssText='right:'+30*k+'px;top:'+2*k+'px;font-size:'+3.2*k+'px;height:'+6*k+'px;line-height:'+6*k+'px';
    if(!cp)buildKeys();else keysEl.innerHTML='';ready=true;grow();place(false,true)}

  function buildKeys(){
    keysEl.innerHTML='';keyMap={};var x0=(L-108)/2,rows=[['QWERTYUIOP',0,'⌫'],['ASDFGHJKL',4,'⏎'],['ZXCVBNM,.',9,null]];
    function add(ch,label,x,y,w,cls){var b=el('i','tw-key'+(cls?' '+cls:''),'<u>'+label+'</u>');b.style.cssText='left:'+x*k+'px;top:'+y*k+'px;width:'+w*k+'px;height:8px;height:'+8*k+'px';b.dataset.ch=ch;keysEl.appendChild(b);keyMap[ch]=b;
      b.addEventListener('mousedown',function(e){e.preventDefault();if(demo)return;ta.focus({preventScroll:true});press(ch);typeKey(ch)});return b}
    rows.forEach(function(r,i){var y=14+i*10,x=x0+r[1];r[0].split('').forEach(function(c,j){add(c,c,x+j*10,y,8)});
      if(r[2])add(i?'Enter':'Backspace',r[2],x+r[0].length*10,y,i?14:8,'tw-key-w')});
    add(' ','',x0+22,44,60,'tw-key-w tw-space')}
  function typeKey(ch){
    var s=ta.selectionStart,e=ta.selectionEnd;
    if(ch==='Backspace'){if(s===e&&s>0)ta.setRangeText('',s-1,e,'end');else ta.setRangeText('',s,e,'end')}
    else if(ch==='Enter'){if(ta.value.length<max)ta.setRangeText('\n',s,e,'end')}
    else if(ta.value.length-(e-s)<max)ta.setRangeText(ch.toLowerCase(),s,e,'end');
    ta.dispatchEvent(new Event('input',{bubbles:true}))}

  /* ---- measuring: where is the caret, in columns and lines? */
  function measure(pos){
    mirror.textContent=ta.value.slice(0,pos);var s=el('i');s.style.cssText='display:inline-block;width:0;height:1px';mirror.appendChild(s);
    return {col:Math.min(COLS,Math.round(s.offsetLeft/cw)),line:Math.round(s.offsetTop/lh)}}
  function grow(){var n=measure(ta.value.length).line+1;lines=n;ta.style.height=n*lh+'px';paper.style.height=(padT+n*lh+wh)+'px'}
  var X=function(col){return S-A*col*cw},Y=function(line){return sy-lh/2-padT-line*lh},HX=function(col){return X(col)+padL+col*cw};
  function to(t,v,d,ease,extra){var o=Object.assign({},v);if(reduced()||!d){G&&G.set(t,o);return}G.to(t,Object.assign(o,{duration:d,ease:ease||'none',overwrite:'auto'},extra||{}))}

  /* ---- the moving parts */
  function place(animate,force){
    var c=measure(ta.selectionEnd),dl=c.line-cur.line,dc=c.col-cur.col;
    if(!force&&!dl&&!dc){return}
    var fwd=dl>0,back=dl<0,first=force;
    if(first||!animate||reduced()){G&&G.set(paper,{x:X(c.col),y:Y(c.line)});G&&G.set(head,{x:HX(c.col)})}
    else if(dl){
      /* carriage return: the whole carriage slides back, the lever swings, the platen ratchets the paper up a line */
      to([paper,head],{x:function(i){return i?HX(c.col):X(c.col)}},fwd?.4:.3,'power3.inOut');
      to(paper,{y:Y(c.line)},.3,'power2.out',{delay:fwd?.08:0});
      if(fwd){G.fromTo(lever,{rotation:0},{keyframes:[{rotation:24,duration:.12,ease:'power2.out'},{rotation:0,duration:.34,ease:'power2.inOut'}],transformOrigin:'50% 92%',overwrite:'auto'});
        G.fromTo(tw,{y:0},{keyframes:[{y:2,duration:.05},{y:0,duration:.18,ease:'power2.out'}],overwrite:'auto',delay:.34})}
      G.to(knobs,{rotation:(fwd?'+=':'-=')+72*Math.abs(dl),duration:.3,ease:'power2.out',overwrite:'auto'});
    }else{to(paper,{x:X(c.col)},.07,'none');to(head,{x:HX(c.col)},.07,'none')}
    if(dc>0&&!dl&&c.col>=COLS-4&&cur.col<COLS-4)ring();
    cur=c}
  function strike(){
    if(reduced())return;
    G.fromTo(slug,{y:0},{keyframes:[{y:-4*k,duration:.035,ease:'power2.out'},{y:0,duration:.08,ease:'power2.in'}],overwrite:'auto'});
    G.fromTo(win,{y:0},{keyframes:[{y:1,duration:.03},{y:0,duration:.07}],overwrite:'auto'})}
  function ring(){
    if(reduced()){ding.style.opacity=1;setTimeout(function(){ding.style.opacity=0},900);return}
    G.fromTo(bell,{rotation:0},{keyframes:[{rotation:-22,duration:.06},{rotation:20,duration:.09},{rotation:-14,duration:.09},{rotation:8,duration:.08},{rotation:0,duration:.1}],transformOrigin:'50% 15%',overwrite:'auto'});
    G.fromTo(ding,{opacity:0,y:4},{keyframes:[{opacity:1,y:-2,duration:.12},{opacity:1,duration:.7},{opacity:0,duration:.25}],overwrite:'auto'})}
  function press(ch){var b=keyMap[ch==='Enter'||ch==='Backspace'||ch===' '?ch:String(ch).toUpperCase()];if(!b)return;
    if(reduced()){b.classList.add('down');setTimeout(function(){b.classList.remove('down')},110);return}
    G.to(b,{y:k,duration:.04,ease:'none',overwrite:true});b.classList.add('down')}
  function release(ch){var b=keyMap[ch==='Enter'||ch==='Backspace'||ch===' '?ch:String(ch).toUpperCase()];if(!b)return;b.classList.remove('down');
    if(reduced())return;G.to(b,{y:0,duration:.35,ease:'elastic.out(1,.5)',overwrite:true})}

  /* ---- events */
  var lastLen=0;
  ta.addEventListener('keydown',function(e){if(e.ctrlKey||e.metaKey||e.altKey)return;if(e.key.length===1||e.key==='Enter'||e.key==='Backspace')press(e.key)});
  ta.addEventListener('keyup',function(e){if(e.key.length===1||e.key==='Enter'||e.key==='Backspace')release(e.key);place(true)});
  ta.addEventListener('input',function(e){
    var n=ta.value.length;if(n>lastLen)strike();lastLen=n;cnt.textContent=String(n).padStart(3,'0');grow();place(true);
    if(onChange)onChange(ta.value);
    if(e&&e.inputType==='insertText'&&e.data&&e.data.length===1){press(e.data);setTimeout(function(){release(e.data)},90)}});
  ['click','select','focus'].forEach(function(n){ta.addEventListener(n,function(){setTimeout(function(){place(true)},0)})});
  document.addEventListener('selectionchange',function(){if(document.activeElement===ta)place(true)});
  win.addEventListener('pointerdown',function(){if(!demo)ta.focus({preventScroll:true})});

  /* ---- the API the rest of the page uses */
  T.layout=layout;T.focus=function(){ta.focus({preventScroll:true})};T.value=function(){return ta.value};T.textarea=ta;T.onChange=function(f){onChange=f};
  T.set=function(v,animate){ta.value=v;lastLen=v.length;cnt.textContent=String(v.length).padStart(3,'0');if(ready){grow();place(!!animate,!animate)}};
  T.feedIn=function(){if(!ready)return;var y=Y(cur.line);
    if(reduced()){G&&G.set(paper,{y:y});return}
    G.fromTo(paper,{y:y+wh*.9},{y:y,duration:1,ease:'expo.out',overwrite:'auto'});G.to(knobs,{rotation:'+=144',duration:.9,ease:'power2.out',overwrite:'auto'})};
  T.tearOff=function(){return new Promise(function(done){
    if(reduced()){done();return}
    G.to(paper,{y:'-='+(wh+lh*3),rotation:-4,duration:.7,ease:'power3.in',overwrite:'auto',onComplete:function(){G.set(paper,{rotation:0});done()}});
    G.to(knobs,{rotation:'+=216',duration:.7,ease:'power2.in',overwrite:'auto'});
    G.fromTo(lever,{rotation:0},{keyframes:[{rotation:22,duration:.15},{rotation:0,duration:.4}],transformOrigin:'50% 92%',overwrite:'auto'})})};
  T.reset=function(){cur={col:0,line:0,w:0};T.set('',false);cnt.textContent='000'};
  T.shake=function(){if(reduced())return;G.fromTo(paper,{rotation:0},{keyframes:[{rotation:-1.2,duration:.06},{rotation:1,duration:.08},{rotation:0,duration:.1}],overwrite:'auto',transformOrigin:'50% 100%'})};
  T.demo=function(script,hold){
    /* types a message by itself, using exactly the same moving parts */
    var i=0,stop=false,tm=0;
    function step(){if(stop)return;
      if(i>script.length){tm=setTimeout(function(){T.set('',true);i=0;tm=setTimeout(step,900)},hold||3200);return}
      var v=script.slice(0,i++);ta.value=v;ta.setSelectionRange(v.length,v.length);ta.dispatchEvent(new Event('input',{bubbles:true}));
      var ch=script[i-1];tm=setTimeout(step,ch==='\n'?620:ch===' '?70:95)}
    step();return function(){stop=true;clearTimeout(tm)}};
  T.destroy=function(){host.innerHTML=''};
  if(window.ResizeObserver){var rt=0,lw=0;new ResizeObserver(function(){var w=host.clientWidth;if(!w||Math.abs(w-lw)<2)return;lw=w;clearTimeout(rt);rt=setTimeout(function(){var v=ta.value;layout();place(false,true)},80)}).observe(host)}
  return T}

/* ------------------------------------------------------------------ the guestbook */
var CFG={},C={},list=[],shown=6,openT=0,lastFocus=null,tw=null,busy=false,stopDemo=null,preview=false;
var api={
  list:function(){return CFG.endpoint?fetch(CFG.endpoint+(CFG.endpoint.indexOf('?')<0?'?':'&')+'action=list&_='+(Date.now()/60000|0)).then(function(r){return r.json()}).then(function(j){return j&&j.ok?j.items||[]:Promise.reject()}):Promise.resolve(store.get('local')||[])},
  send:function(p){
    if(!CFG.endpoint){var it={id:'l'+Date.now(),name:p.name||'A visitor',text:p.text,rating:p.rating||0,ts:Date.now()},a=store.get('local')||[];a.unshift(it);store.set('local',a);return Promise.resolve({ok:true,item:it})}
    return fetch(CFG.endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(p)}).then(function(r){return r.json()})}
};
var fmt=function(ts){try{return new Date(+ts||Date.now()).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})}catch(e){return ''}};

function noteEl(n,i){
  var a=el('article','rv-note');a.setAttribute('role','listitem');a.style.setProperty('--tilt',((i%3)-1)*.7+'deg');
  if(n.rating>0)a.insertAdjacentHTML('beforeend',stars(Math.min(5,n.rating|0)));
  var p=el('p','rv-note-t');p.textContent=n.text;a.appendChild(p);
  var f=el('p','rv-note-f');f.textContent='— '+(n.name||'A visitor')+' · '+fmt(n.ts);a.appendChild(f);return a}
function renderWall(animateFirst){
  var box=$('.rv-notes',C.band),more=$('.rv-more',C.band),sum=$('.rv-sum',C.band);box.innerHTML='';
  if(!list.length){box.innerHTML='<p class="rv-empty">No notes yet. Be the first to leave one.</p>';more.hidden=true;sum.textContent='';return}
  list.slice(0,shown).forEach(function(n,i){box.appendChild(noteEl(n,i))});
  more.hidden=list.length<=shown;more.textContent='Show more notes ('+(list.length-shown)+' more)';
  var rated=list.filter(function(n){return n.rating>0}),avg=rated.length?rated.reduce(function(s,n){return s+n.rating},0)/rated.length:0;
  sum.textContent=list.length+(list.length===1?' note':' notes')+(rated.length?' · '+avg.toFixed(1)+' out of 5':'');
  if(animateFirst&&G&&!reduced()){var f=box.firstChild;G.fromTo(f,{opacity:0,y:-24,rotation:-4},{opacity:1,y:0,rotation:0,duration:.8,ease:'back.out(1.6)',clearProps:'transform,opacity'})}}
function load(){api.list().then(function(a){list=(a||[]).filter(function(n){return n&&n.text}).sort(function(x,y){return (+y.ts||0)-(+x.ts||0)});renderWall(false)}).catch(function(){$('.rv-notes',C.band).innerHTML='<p class="rv-empty">The wall couldn’t load right now. You can still leave a note.</p>'})}

/* ---- the overlay */
function status(msg,bad){var s=$('.rv-status',C.modal);s.textContent=msg||'';s.classList.toggle('bad',!!bad)}
function build(){
  var footer=$('.foot'),band=el('section','rv');band.id='reviews';band.setAttribute('aria-labelledby','rvH');
  band.innerHTML='<div class="wrap rv-grid"><div class="rv-intro"><p class="eyebrow">Guestbook</p><h2 id="rvH">Leave a note on <em>my typewriter.</em></h2>'+
    '<p class="rv-lede">Read something you liked, or worked with me? Type a review or a comment. It lands on the wall below the moment you send it.</p>'+
    '<button type="button" class="btn btn-primary rv-cta" data-rv-open>Start typing<span class="dot"><svg class="ic" aria-hidden="true"><use href="#i-send"/></svg></span></button>'+
    '<p class="rv-sum" aria-live="polite"></p></div>'+
    '<div class="rv-demo"><div class="rv-demo-m"></div><button type="button" class="rv-demo-hit" data-rv-open aria-label="Open the typewriter to leave a review"></button></div></div>'+
    '<div class="wrap rv-wall"><h3 class="rv-wall-h">Notes from visitors</h3><div class="rv-notes" role="list"></div><button type="button" class="btn rv-more" hidden></button></div>';
  footer.parentNode.insertBefore(band,footer);
  var pill=el('button','rv-pill');pill.type='button';pill.setAttribute('aria-label','Leave a review on the typewriter');
  pill.innerHTML='<span class="rv-pill-ic"></span><span class="rv-pill-t">Leave a review</span>';
  document.body.appendChild(pill);
  var modal=el('div','rv-modal');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','rvmT');modal.setAttribute('aria-hidden','true');modal.setAttribute('inert','');
  modal.innerHTML='<div class="rv-bar"><h2 id="rvmT">Type me a note</h2><button type="button" class="rv-x" aria-label="Close the typewriter"><svg class="ic" aria-hidden="true"><use href="#i-x"/></svg><span>Close</span></button></div>'+
    '<div class="rv-scroll"><div class="rv-desk"><p class="rv-tip">Click the paper and start typing. Enter throws the carriage return. Esc closes.</p><div class="rv-machine"></div>'+
    '<div class="rv-fields"><label class="rv-f"><span>Your name <i>(optional)</i></span><input class="rv-name" type="text" maxlength="40" autocomplete="name" placeholder="A visitor"></label>'+
    '<div class="rv-f"><span id="rvRate">Rating <i>(optional)</i></span><div class="rv-rate" role="radiogroup" aria-labelledby="rvRate"></div></div>'+
    '<input class="rv-hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"></div></div></div>'+
    '<div class="rv-act"><p class="rv-status" role="status"></p><button type="button" class="btn btn-primary rv-send">Tear off &amp; send<span class="dot"><svg class="ic" aria-hidden="true"><use href="#i-send"/></svg></span></button></div>';
  document.body.appendChild(modal);
  var toast=el('div','rv-toast');toast.setAttribute('role','status');document.body.appendChild(toast);
  C={band:band,pill:pill,modal:modal,toast:toast,rate:$('.rv-rate',modal),name:$('.rv-name',modal),hp:$('.rv-hp',modal),send:$('.rv-send',modal)};
  if(P)$('.rv-pill-ic',pill).appendChild(drawIcon(2));
  for(var i=1;i<=5;i++){var b=el('button','rv-r',starSVG(true));b.type='button';b.setAttribute('role','radio');b.setAttribute('aria-checked','false');b.setAttribute('aria-label',i+(i===1?' star':' stars'));b.dataset.v=i;b.tabIndex=i===1?0:-1;C.rate.appendChild(b)}
}
var rating=0;
function setRating(v,focus){rating=v;$$('.rv-r',C.rate).forEach(function(b,i){var on=i<v;b.classList.toggle('on',on);b.setAttribute('aria-checked',String(i+1===v));b.tabIndex=(v?i+1===v:i===0)?0:-1;if(focus&&i+1===v)b.focus()});
  if(G&&!reduced()&&v)G.fromTo($$('.rv-r',C.rate).slice(0,v),{scale:.6},{scale:1,duration:.5,ease:'back.out(3)',stagger:.04,overwrite:true});saveDraft()}
function saveDraft(){if(!tw)return;store.set('draft',{t:tw.value(),n:C.name.value,r:rating})}

function origin(from){var r=(from||C.pill).getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return {x:x,y:y,R:Math.ceil(Math.hypot(Math.max(x,innerWidth-x),Math.max(y,innerHeight-y)))+2}}
function open(from){
  if(C.open)return;C.open=true;lastFocus=document.activeElement;openT=Date.now();
  var m=C.modal,o=origin(from);m.removeAttribute('inert');m.setAttribute('aria-hidden','false');m.classList.add('is-open');document.body.classList.add('rv-open');
  if(!tw){tw=Typewriter($('.rv-machine',m),{max:CFG.maxLength||400,compact:function(){return innerWidth<=560||innerHeight<=640}});window.addEventListener('resize',function(){if(C.open){clearTimeout(open.rt);open.rt=setTimeout(function(){tw.layout()},120)}});tw.onChange(function(){saveDraft();if(C.send.disabled)setBusy(false)})}
  var d=store.get('draft');tw.layout();if(d){tw.set(d.t||'',false);C.name.value=d.n||'';setRating(d.r|0)}
  status('');
  if(G&&!reduced()){
    G.fromTo(m,{clipPath:'circle(0px at '+o.x+'px '+o.y+'px)'},{clipPath:'circle('+o.R+'px at '+o.x+'px '+o.y+'px)',duration:.7,ease:'power3.inOut',overwrite:true,onComplete:function(){m.style.clipPath='none'}});
    G.fromTo($$('.rv-bar,.rv-tip,.rv-fields,.rv-act',m),{y:24,opacity:0},{y:0,opacity:1,duration:.7,ease:'expo.out',stagger:.07,delay:.2,overwrite:true,clearProps:'transform,opacity'});
    G.fromTo($('.tw',m),{y:60,opacity:0},{y:0,opacity:1,duration:.8,ease:'expo.out',delay:.15,overwrite:true,clearProps:'transform,opacity'});
    setTimeout(function(){if(C.open)tw.feedIn()},350)
  }else{m.style.clipPath='none';tw.feedIn()}
  setTimeout(function(){if(C.open)tw.focus()},reduced()?30:420)}
function close(){
  if(!C.open)return;C.open=false;var m=C.modal;saveDraft();document.body.classList.remove('rv-open');
  var done=function(){m.classList.remove('is-open');m.setAttribute('aria-hidden','true');m.setAttribute('inert','');m.style.clipPath='';
    if(lastFocus&&lastFocus.focus&&lastFocus.isConnected)try{lastFocus.focus({preventScroll:true})}catch(e){}};
  if(G&&!reduced()){var o=origin(lastFocus&&lastFocus.getBoundingClientRect&&lastFocus.isConnected?lastFocus:C.pill);
    G.to(m,{clipPath:'circle(0px at '+o.x+'px '+o.y+'px)',duration:.55,ease:'power3.inOut',overwrite:true,onComplete:done})}else done();
}
function setBusy(b){busy=b;C.send.disabled=b;C.send.classList.toggle('busy',b)}
function say(msg){C.toast.textContent=msg;if(G&&!reduced()){G.fromTo(C.toast,{y:30,opacity:0},{keyframes:[{y:0,opacity:1,duration:.5,ease:'expo.out'},{opacity:1,duration:3.6},{y:20,opacity:0,duration:.4}],overwrite:true})}
  else{C.toast.style.opacity=1;clearTimeout(say.t);say.t=setTimeout(function(){C.toast.style.opacity=0},4200)}}

function submit(){
  if(busy)return;var text=tw.value().trim();
  if(text.length<3){status('Type a few words on the paper first.',true);tw.shake();tw.focus();return}
  var last=store.get('last');if(last&&Date.now()-last<20000){status('One note at a time. Try again in a moment.',true);return}
  setBusy(true);status('Sending…');
  var payload={text:text,name:C.name.value.trim(),rating:rating,website:C.hp.value,t:Date.now()-openT};
  api.send(payload).then(function(res){
    if(!res||!res.ok)throw new Error(res&&res.error||'x');
    store.set('last',Date.now());store.del('draft');
    var it=res.item||{id:'n'+Date.now(),name:payload.name||'A visitor',text:text,rating:rating,ts:Date.now()};
    return tw.tearOff().then(function(){
      list.unshift(it);renderWall(true);tw.reset();C.name.value='';setRating(0);saveDraft();store.del('draft');
      status('Sent. Thank you!');setBusy(false);
      setTimeout(function(){close();if(!document.body.classList.contains('landing')){say('Thank you! Your note is on the wall.');C.band.scrollIntoView({behavior:reduced()?'auto':'smooth',block:'start'})}else say('Thank you for your note!')},reduced()?200:650)})
  }).catch(function(e){setBusy(false);var M={slow:'Please slow down a little and try again.',links:'Links aren’t allowed in notes. Please take them out and send again.',dup:'That exact note was already sent.',short:'Type a few words on the paper first.'};
    status(M[e&&e.message]||'Couldn’t send that just now. Your note is safe here, try again.',true)})}

function bind(){
  document.addEventListener('click',function(e){var t=e.target.closest('[data-rv-open]');if(t){open(t)}});
  C.pill.addEventListener('click',function(){open(C.pill)});
  $('.rv-x',C.modal).addEventListener('click',close);
  C.send.addEventListener('click',submit);
  $('.rv-more',C.band).addEventListener('click',function(){var before=shown;shown+=6;renderWall(false);if(G&&!reduced())G.from($$('.rv-note',C.band).slice(before),{opacity:0,y:24,duration:.6,ease:'expo.out',stagger:.06,clearProps:'all'})});
  C.name.addEventListener('input',saveDraft);
  C.rate.addEventListener('click',function(e){var b=e.target.closest('.rv-r');if(!b)return;var v=+b.dataset.v;setRating(v===rating?0:v)});
  C.rate.addEventListener('keydown',function(e){var d={ArrowRight:1,ArrowUp:1,ArrowLeft:-1,ArrowDown:-1}[e.key];if(d){e.preventDefault();setRating(Math.max(1,Math.min(5,(rating||(d>0?0:6))+d)),true)}else if(e.key==='Delete'||e.key==='Backspace'){setRating(0)}});
  /* the dialog keeps its keys to itself: Tab stays inside, Esc closes, nothing leaks to the rest of the site */
  C.modal.addEventListener('keydown',function(e){
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();return}
    if(e.key==='Tab'){var f=$$('button:not([disabled]),input:not(.rv-hp),textarea',C.modal).filter(function(n){return n.offsetParent&&n.tabIndex>=0});
      if(!f.length)return;var a=f[0],z=f[f.length-1];if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}}
    else if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();submit()}
    e.stopPropagation()});
  if(window.visualViewport){var vv=function(){C.modal.style.setProperty('--vvh',visualViewport.height+'px')};visualViewport.addEventListener('resize',vv);vv()}
  /* the floating button steps aside while the section itself is on screen */
  if(window.IntersectionObserver)new IntersectionObserver(function(es){C.pill.classList.toggle('is-away',es[0].isIntersecting)},{threshold:.25}).observe(C.band);
  /* a little life: it nudges once after a few seconds, then every so often until they've tried it */
  if(G&&!reduced()){G.set(C.pill,{y:30,opacity:0});G.to(C.pill,{y:0,opacity:1,duration:.9,ease:'expo.out',delay:1.4,clearProps:'transform,opacity'});
    var nudge=function(){if(C.open||document.hidden||C.pill.classList.contains('is-away')||store.get('tried'))return;
      G.fromTo(C.pill,{rotation:0},{keyframes:[{rotation:-4,duration:.08},{rotation:3,duration:.1},{rotation:-2,duration:.1},{rotation:0,duration:.25,ease:'elastic.out(1,.5)'}]})};
    setInterval(nudge,15000);setTimeout(nudge,4500)}
  /* the teaser machine types by itself while it's on screen */
  var dm=Typewriter($('.rv-demo-m',C.band),{demo:true,placeholder:''});dm.layout();C.dm=dm;
  var script='Dear Tarun,\nType your note here.\nPress Enter and the\ncarriage returns.';
  if(reduced()||!window.IntersectionObserver){dm.set(script,false)}
  else new IntersectionObserver(function(es){if(es[0].isIntersecting){if(!stopDemo)stopDemo=dm.demo(script,3600)}else if(stopDemo){stopDemo();stopDemo=null;dm.set('',false)}},{threshold:.4}).observe($('.rv-demo',C.band));
  C.pill.addEventListener('click',function(){store.set('tried',1)});
}

window.Reviews={
  init:function(site){
    CFG=(site&&site.reviews)||{};preview=/[?&]reviews=preview\b/.test(location.search);
    if(C.band)return;
    if(!P)return;
    build();bind();load();
    if(!CFG.endpoint)C.band.querySelector('.rv-lede').insertAdjacentHTML('afterend','<p class="rv-preview">Preview: the shared wall isn’t switched on yet, so notes are kept on this device only.</p>');
    this.setRoute(document.body.classList.contains('landing')?'welcome':'x')},
  setRoute:function(k){if(!C.band)return;var land=k==='welcome';C.band.hidden=land;C.pill.classList.toggle('is-away',false);if(!land&&window.ScrollTrigger)requestAnimationFrame(function(){ScrollTrigger.refresh()})}
};
})();
