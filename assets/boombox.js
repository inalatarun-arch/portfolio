/* Tarun Inala – the boombox in the header.
   The same pixel stereo that sits on the grass in the park scene (cones pump on the beat, reels turn, sound arcs and notes drift
   out), small, at the top of the page. It streams the playlist through YouTube's IFrame Player (hidden: only the audio is used) and
   carries play / pause, previous and next on its own body. The pixel cassette beside it opens the playlist on YouTube.
   Browsers do not allow sound to start before a visitor has touched the page, so it tries to start straight away and, if the
   browser says no, waits for the first tap and starts then (the boombox pulses to say so).
   It is shown on the landing screen and the Personal pages, and pauses (then resumes) when you step into the Work side. */
(function(){
'use strict';
var G=window.gsap,PX=window.PX,A=window.PArt;
var DEFAULT_LIST='PLNKsHcEBNWDg';
var CW=72,CH=34,BX=6,BY=13;
var $=function(s,r){return (r||document).querySelector(s)};
var RMQ=window.matchMedia('(prefers-reduced-motion: reduce)');
var S={list:DEFAULT_LIST,ready:false,player:null,playing:false,userPaused:true,error:false,mode:'landing',zen:false,resume:false,
  el:null,cv:null,x:null,ticking:false,last:0,t0:performance.now(),t:0,press:-1,title:'',apiAsked:false,stateName:'idle',shuffle:false,vol:80,cur:null,fade:null,hinted:false};

/* ------------------------------------------------------------------ drawing: the stereo from the park scene, re-laid for a header */
function disc(x,cx,cy,r,c){for(var yy=-r;yy<=r;yy++){var w=Math.round(Math.sqrt(r*r-yy*yy+.25));PX.R(x,cx-w,cy+yy,w*2+1,1,c)}}
function glyph(x,kind,X,Y,c){
  /* 6x5 button faces: prev, play, pause, next */
  if(kind==='pause'){PX.R(x,X+1,Y,1,5,c);PX.R(x,X+4,Y,1,5,c);return}
  if(kind==='play'){PX.R(x,X+2,Y,1,5,c);PX.R(x,X+3,Y+1,1,3,c);PX.R(x,X+4,Y+2,1,1,c);return}
  if(kind==='prev'){PX.R(x,X+1,Y,1,5,c);PX.R(x,X+2,Y+2,1,1,c);PX.R(x,X+3,Y+1,1,3,c);PX.R(x,X+4,Y,1,5,c);return}
  PX.R(x,X+4,Y,1,5,c);PX.R(x,X+3,Y+2,1,1,c);PX.R(x,X+2,Y+1,1,3,c);PX.R(x,X+1,Y,1,5,c)}
function draw(t){
  var x=S.x;if(!x)return;var R=PX.R,P1=PX.P1,pl=S.playing;
  x.clearRect(0,0,CW,CH);
  var beat=pl?Math.pow(Math.max(0,Math.sin(t*7.4)),3):0,beat2=pl?Math.pow(Math.max(0,Math.sin(t*7.4+1.6)),4):0,bob=beat>.55?1:0,bx=BX,oy=BY-bob,ii,jj,col;
  /* feet */
  R(x,bx+3,BY+20,4,1,'#171c27');R(x,bx+53,BY+20,4,1,'#171c27');
  /* handle */
  R(x,bx+9,oy-3,42,1,'#171c27');R(x,bx+9,oy-2,2,3,'#171c27');R(x,bx+49,oy-2,2,3,'#171c27');R(x,bx+11,oy-3,38,1,'#59657a');
  /* body */
  R(x,bx,oy,60,20,'#171c27');R(x,bx+1,oy+1,58,18,'#8795a8');R(x,bx+1,oy+1,58,1,'#c5d0dc');R(x,bx+1,oy+18,58,1,'#5a687c');
  /* cassette deck */
  R(x,bx+21,oy+2,18,8,'#1d2433');R(x,bx+22,oy+3,16,6,'#0f1420');
  var rot=pl?Math.floor(t*6)%4:0;
  for(ii=0;ii<2;ii++){var rx=bx+26+ii*8;R(x,rx-1,oy+5,3,3,'#d9dfe6');P1(x,rx,oy+6,'#0f1420');
    if(rot===0)P1(x,rx-1,oy+5,'#0f1420');else if(rot===1)P1(x,rx+1,oy+5,'#0f1420');else if(rot===2)P1(x,rx+1,oy+7,'#0f1420');else P1(x,rx-1,oy+7,'#0f1420')}
  /* level meter */
  for(ii=0;ii<5;ii++){var lv=pl?Math.round(1+1*Math.abs(Math.sin(t*5.3+ii*1.7))*(.6+.6*beat2)):0;col=ii>3?'#ff5a3c':'#4fe08a';
    for(jj=0;jj<2;jj++)R(x,bx+22+ii*4,oy+17-jj,3,1,(jj<lv)?col:'#2a3342')}
  /* power light */
  P1(x,bx+37,oy+1,pl?((S.t%1)<.5?'#ff5a3c':'#a8402e'):'#6a2a22');
  /* transport buttons: prev / play-pause / next (HTML buttons sit over these) */
  var names=['prev',pl?'pause':'play','next'];
  for(ii=0;ii<3;ii++){var X=bx+21+ii*7,Y=oy+11,dn=S.press===ii;
    R(x,X,Y,6,5,'#171c27');R(x,X,Y,6,dn?5:4,dn?'#5a687c':'#c5d0dc');R(x,X+1,Y+(dn?1:0),4,dn?4:3,'#e8edf3');
    glyph(x,names[ii],X,Y+(dn?1:0)+0,'#171c27')}
  /* speakers: cones pump with the bass */
  for(ii=-1;ii<=1;ii+=2){var cx=bx+30+ii*20;disc(x,cx,oy+11,7,'#171c27');disc(x,cx,oy+11,6,'#3a4659');disc(x,cx,oy+11,4+(beat>.35?1:0),'#202838');disc(x,cx,oy+11,2,beat>.35?'#aebccd':'#7f8da0');
    disc(x,cx,oy+3,2,'#171c27');disc(x,cx,oy+3,1,'#59657a');P1(x,cx-3,oy+8,'#6b7a90')}
  /* shuffle button (top right of the body); the HTML button sits exactly over it */
  var sd=S.shuffle,pr=S.press===3,sx=bx+53,sy=oy+2+(pr?1:0);
  R(x,sx,oy+2,6,5,'#171c27');R(x,sx,sy,6,pr?4:(sd?5:4),sd?'#e9d4a4':'#c5d0dc');R(x,sx+1,sy,4,pr?3:(sd?4:3),sd?'#ffe9b0':'#e8edf3');
  var gc='#171c27',gy=sy+(sd?1:0);P1(x,sx+1,gy,gc);P1(x,sx+2,gy+1,gc);P1(x,sx+3,gy+2,gc);P1(x,sx+4,gy+2,gc);P1(x,sx+1,gy+2,gc);P1(x,sx+3,gy,gc);P1(x,sx+4,gy,gc);
  if(!pl)return;
  /* sound arcs fanning out */
  for(ii=0;ii<3;ii++){var ph=((t*1.1+ii/3)%1),rr=3+ph*7,al=(1-ph)*.6;x.fillStyle='rgba(255,236,170,'+al.toFixed(2)+')';
    for(var sd=-1;sd<=1;sd+=2)for(var an=-1;an<=1;an+=.4){x.fillRect(Math.round(bx+30+sd*(30+Math.cos(an)*rr)),Math.round(oy+11+Math.sin(an)*rr*1.1),1,1)}}
  /* notes rising and swaying */
  var nc=['#ff7f93','#ffd25a','#8fd0ff','#c7a6ff','#7fe3a0'];
  for(ii=0;ii<4;ii++){var u=((t*.32+ii/4)%1),nx=Math.round(bx+12+ii*13+Math.sin(t*2+ii*2.1)*3),ny=Math.round(oy-5-u*(oy-8)),na=Math.sin(u*Math.PI);
    if(na<.15)continue;x.globalAlpha=Math.min(1,na*1.5);col=nc[ii];R(x,nx,ny+2,2,2,col);R(x,nx+2,ny-1,1,4,col);if(ii%2===0){R(x,nx+2,ny-1,2,1,col)}x.globalAlpha=1}
}
function frame(now){S.t=(now-S.t0)/1000;draw(S.t)}
function tick(){var now=performance.now();if(now-S.last<42)return;S.last=now;if(document.hidden||S.mode==='work')return;frame(now)}
function loop(){var want=!RMQ.matches&&!!G&&S.mode!=='work';
  if(want&&!S.ticking){G.ticker.add(tick);S.ticking=true}else if(!want&&S.ticking){G.ticker.remove(tick);S.ticking=false}
  frame(performance.now())}

/* ------------------------------------------------------------------ state shown on the page */
var Z={};/* the Zen overlay's elements, filled in by init() */
function setState(){
  var name=S.error?'error':(S.playing?'playing':(S.ready?'paused':'loading'));S.stateName=name;
  if(!S.el)return;S.el.setAttribute('data-state',name);
  var pb=$('.bb-play',S.el);pb.setAttribute('aria-label',S.playing?'Pause music':'Play music');pb.setAttribute('aria-pressed',String(S.playing));
  var sh=$('#bbShuffle',S.el);if(sh){sh.setAttribute('aria-pressed',String(S.shuffle));sh.setAttribute('aria-label',S.shuffle?'Shuffle on':'Shuffle off');sh.classList.toggle('is-on',S.shuffle)}
  var np=$('.bb-np',S.el);
  if(S.error)np.textContent='Couldn’t load the playlist';
  else if(S.playing&&S.title)np.textContent='Now playing: '+S.title;
  loop();syncZen()}
function say(t,ms){var np=$('.bb-np',S.el);if(!np)return;np.textContent=t;S.el.classList.add('np-on');clearTimeout(S.npT);S.npT=setTimeout(function(){S.el.classList.remove('np-on')},ms||3200)}
/* the Zen screen mirrors the header player */
function syncZen(){
  if(!Z.mode)return;
  if(Z.track)Z.track.textContent=(S.error?'PLAYLIST UNAVAILABLE':(S.title||(S.ready?'PRESS PLAY TO BEGIN':'TUNING IN…'))).toLocaleUpperCase();
  if(Z.playUse)Z.playUse.setAttribute('href',S.playing?'#i-pause':'#i-play');
  if(Z.play){Z.play.setAttribute('aria-label',S.playing?'Pause music':'Play music');Z.play.setAttribute('aria-pressed',String(S.playing))}
  if(Z.shuffle){Z.shuffle.setAttribute('aria-pressed',String(S.shuffle));Z.shuffle.setAttribute('aria-label',S.shuffle?'Shuffle on':'Shuffle off')}
  if(Z.vol&&+Z.vol.value!==S.vol)Z.vol.value=S.vol;
  if(Z.vol)Z.vol.style.setProperty('--fill',S.vol+'%');
  if(Z.cass)Z.cass.classList.toggle('is-spinning',S.playing)}

/* ------------------------------------------------------------------ volume: one number, one place */
function loadVol(){try{var v=parseInt(localStorage.getItem('inala-vol'),10);if(v>=0&&v<=100)return v}catch(e){}return 80}
function saveVol(){try{localStorage.setItem('inala-vol',String(S.vol))}catch(e){}}
/* what the player is actually set to right now (a fade moves it without touching S.vol, the visitor's chosen level) */
function setPlayerVol(v){S.cur=v;try{if(S.player&&S.ready)S.player.setVolume(Math.round(v))}catch(e){}}
function fadeTo(to,dur,done){
  if(S.fade){S.fade.kill();S.fade=null}
  if(!G||RMQ.matches||!S.player){setPlayerVol(to);if(done)done();return}
  var o={n:S.cur==null?to:S.cur};
  S.fade=G.to(o,{n:to,duration:dur,ease:'power1.out',onUpdate:function(){setPlayerVol(o.n)},onComplete:function(){S.fade=null;if(done)done()}})}

/* ------------------------------------------------------------------ YouTube */
function loadApi(){
  if(S.apiAsked||(window.YT&&window.YT.Player)){if(window.YT&&window.YT.Player)makePlayer();return}
  S.apiAsked=true;var prev=window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady=function(){if(prev)try{prev()}catch(e){}makePlayer()};
  var s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';s.async=true;s.onerror=function(){S.error=true;setState()};document.head.appendChild(s)}
/* Only the sound is used: the player stays in a hidden 200x200 box off-screen and is never resized or shown. */
function makePlayer(){
  if(S.player)return;
  S.player=new YT.Player('bbYT',{width:'200',height:'200',playerVars:{listType:'playlist',list:S.list,controls:0,disablekb:1,fs:0,playsinline:1,rel:0,modestbranding:1,iv_load_policy:3,origin:location.origin},
    events:{onReady:onReady,onStateChange:onState,onError:onError}})}
function onReady(){S.ready=true;try{S.player.setLoop(true);if(S.shuffle)S.player.setShuffle(true)}catch(e){}
  setPlayerVol(S.vol);setState();
  /* nothing plays until the visitor asks; say so once so the silence reads as intended */
  if(!S.hinted&&S.mode!=='work'&&S.userPaused){S.hinted=true;say('Press play for my playlist',4200)}
  /* the visitor pressed play before the player had loaded */
  if(S.want&&S.mode!=='work'&&!S.userPaused)try{S.player.playVideo()}catch(e){}}
function onState(e){
  var st=e.data;/* -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued */
  if(st===1){var was=S.playing;S.playing=true;S.error=false;readTitle();if(!was){setPlayerVol(0);fadeTo(S.vol,.9)}}
  else if(st===2||st===0||st===5){S.playing=false}
  setState()}
function onError(){S.error=true;S.playing=false;S.ready=true;setState();say('Couldn’t load the playlist. The tapes button still opens it on YouTube.',5200)}
function readTitle(){try{var d=S.player.getVideoData();if(d&&d.title&&d.title!==S.title){S.title=d.title;say('Now playing: '+d.title,3600)}}catch(e){}}
function play(){S.userPaused=false;S.want=true;if(!S.player||!S.ready){loadApi();return}try{S.player.playVideo()}catch(e){}}
function pause(user){if(user)S.userPaused=true;S.want=false;try{S.player&&S.ready&&S.player.pauseVideo()}catch(e){}}

/* keep a floating label inside the viewport (it is positioned by CSS, nudged here by whatever it overflows) */
function placeTip(tip){if(!tip)return;tip.style.setProperty('--tip-dx','0px');var r=tip.getBoundingClientRect(),m=12,dx=0;
  if(r.left<m)dx=m-r.left;else if(r.right>innerWidth-m)dx=innerWidth-m-r.right;tip.style.setProperty('--tip-dx',Math.round(dx)+'px')}

/* ------------------------------------------------------------------ public */
function init(site){
  var m=(site&&site.music)||{};S.list=(m.playlist||DEFAULT_LIST);S.vol=loadVol();
  S.el=$('#bb');if(!S.el)return;S.cv=$('#bbCv');if(!S.cv||!PX)return;
  S.x=S.cv.getContext('2d');S.x.imageSmoothingEnabled=false;
  var tape=$('#bbTape');tape.href=m.url||('https://www.youtube.com/playlist?list='+S.list);
  var tc=tape.querySelector('canvas');if(A&&tc){tc.width=26;tc.height=18;tc.getContext('2d').drawImage(A.cassette(),0,0)}
  S.el.hidden=false;

  /* the cassette rocks and flips when the visitor changes track */
  var flipTape=function(){if(G&&!RMQ.matches)G.fromTo(tape,{rotationY:0,scale:1},{keyframes:[{rotationY:90,scale:.9,duration:.16,ease:'power2.in'},{rotationY:180,scale:1,duration:.2,ease:'power2.out'},{rotationY:360,scale:1,duration:.3,ease:'power2.out'}],overwrite:true})};
  var shufflePlayer=function(){try{if(S.player&&S.ready)S.player.setShuffle(S.shuffle)}catch(e){}};

  /* buttons: respond on pointer-down (Apple: feedback on touch-down), act on click */
  var map={'.bb-prev':0,'.bb-play':1,'.bb-next':2,'.bb-shuffle':3};
  Object.keys(map).forEach(function(sel){var b=$(sel,S.el),i=map[sel];
    b.addEventListener('pointerdown',function(){S.press=i;frame(performance.now())});
    var up=function(){if(S.press===i){S.press=-1;frame(performance.now())}};b.addEventListener('pointerup',up);b.addEventListener('pointerleave',up);b.addEventListener('pointercancel',up);
    b.addEventListener('click',function(){
      if(i===3){S.shuffle=!S.shuffle;shufflePlayer();setState();say(S.shuffle?'Shuffle on':'Shuffle off',1800);return}
      if(S.error){say('The playlist didn’t load. Try the tapes button.',3200);return}
      if(i===1){if(S.playing)pause(true);else play()}
      else{flipTape();S.userPaused=false;S.want=true;if(!S.ready){loadApi();return}try{i===0?S.player.previousVideo():S.player.nextVideo()}catch(e){}if(!S.playing)try{S.player.playVideo()}catch(e){}}})});

  /* ---- volume knob: drag up / right to raise it, down / left to lower it, 1:1 from wherever you grab it (no jump);
          wheel, arrow / page / home / end keys, double-click to mute and unmute. Every route ends in setVolume(). */
  var knob=$('#bbVolumeKnob'),vwrap=$('.bb-volume',S.el),vval=$('#bbVolumeValue'),ang={a:0},drag=null,SWEEP=130,preMute=80,bubT=0;
  var angle=function(v){return -135+v/100*270};
  var paintKnob=function(){knob.style.setProperty('--knob-angle',ang.a.toFixed(1)+'deg')};
  function setVolume(v,instant){
    v=Math.max(0,Math.min(100,Math.round(v)));if(v===S.vol&&ang.a===angle(v)&&!S.fade)return;
    S.vol=v;if(S.fade){S.fade.kill();S.fade=null}/* the visitor's hand beats any fade */
    knob.setAttribute('aria-valuenow',String(v));knob.setAttribute('aria-valuetext',v===0?'Muted':v+' percent');vval.textContent=v===0?'MUTE':String(v);vwrap.classList.toggle('is-mute',v===0);
    if(G&&!RMQ.matches&&!instant)G.to(ang,{a:angle(v),duration:.24,ease:'power3.out',overwrite:true,onUpdate:paintKnob});
    else{if(G)G.killTweensOf(ang);ang.a=angle(v);paintKnob()}
    setPlayerVol(v);saveVol();syncZen()}
  function pop(){/* the readout pops in while the knob is in use */
    vwrap.classList.add('is-show');clearTimeout(bubT);
    bubT=setTimeout(function(){if(!drag)vwrap.classList.remove('is-show')},900)}
  knob.setAttribute('aria-valuenow',String(S.vol));ang.a=angle(S.vol);paintKnob();vval.textContent=S.vol===0?'MUTE':String(S.vol);knob.setAttribute('aria-valuetext',S.vol+' percent');vwrap.classList.toggle('is-mute',S.vol===0);
  knob.addEventListener('pointerdown',function(e){if(e.button>0)return;drag={x:e.clientX,y:e.clientY,v:S.vol};try{knob.setPointerCapture(e.pointerId)}catch(x){}knob.focus({preventScroll:true});vwrap.classList.add('is-show','is-drag');e.preventDefault()});
  knob.addEventListener('pointermove',function(e){if(!drag)return;setVolume(drag.v+((drag.y-e.clientY)+(e.clientX-drag.x))*100/SWEEP,true)});
  var endDrag=function(){if(!drag)return;drag=null;vwrap.classList.remove('is-drag');pop()};
  knob.addEventListener('pointerup',endDrag);knob.addEventListener('pointercancel',endDrag);knob.addEventListener('lostpointercapture',endDrag);
  knob.addEventListener('wheel',function(e){e.preventDefault();setVolume(S.vol-Math.sign(e.deltaY)*4);pop()},{passive:false});
  knob.addEventListener('dblclick',function(){if(S.vol>0){preMute=S.vol;setVolume(0)}else setVolume(preMute||80);pop()});
  knob.addEventListener('keydown',function(e){
    var d={ArrowUp:5,ArrowRight:5,ArrowDown:-5,ArrowLeft:-5,PageUp:10,PageDown:-10}[e.key];
    if(d!=null)setVolume(S.vol+d);else if(e.key==='Home')setVolume(0);else if(e.key==='End')setVolume(100);else if(e.key==='m'||e.key==='M'){if(S.vol>0){preMute=S.vol;setVolume(0)}else setVolume(preMute||80)}else return;
    e.preventDefault();pop()});

  /* the cassette: obviously a button */
  if(G&&!RMQ.matches){
    var wig=function(){if(S.mode==='work'||document.hidden)return;G.fromTo(tape,{rotation:0,y:0},{keyframes:[{y:-5,rotation:-5,duration:.16,ease:'power2.out'},{y:0,rotation:3,duration:.2,ease:'power2.in'},{rotation:-2,duration:.14},{rotation:0,duration:.3,ease:'elastic.out(1,.5)'}],overwrite:true})};
    S.wigT=setInterval(wig,7500);setTimeout(wig,2600)}
  var tip=$('.bb-tip',tape);
  tape.addEventListener('pointerenter',function(){S.el.classList.add('tape-on');placeTip(tip)});tape.addEventListener('pointerleave',function(){S.el.classList.remove('tape-on')});
  tape.addEventListener('focus',function(){S.el.classList.add('tape-on');placeTip(tip)});tape.addEventListener('blur',function(){S.el.classList.remove('tape-on')});
  RMQ.addEventListener&&RMQ.addEventListener('change',loop);
  window.addEventListener('themechange',function(){frame(performance.now())});

  /* ---- Zen mode: a full-screen listening room. It opens from the button that opened it, closes only from its own close
          button (or Escape, which is the keyboard's close button), and never shows the video: the sound comes from the same hidden player. */
  Z={mode:$('#bbZenMode'),open:$('#bbZen'),close:$('#bbZenClose'),track:$('#bbZenTrack'),cass:$('#bbZenCassette'),play:$('#bbZenPlay'),shuffle:$('#bbZenShuffle'),vol:$('#bbZenVolume')};
  Z.playUse=Z.play&&Z.play.querySelector('use');
  var zr={r:0},ZO={x:0,y:0,R:0},zItems=Z.mode.querySelectorAll('.bb-zen-eyebrow,.bb-zen-content h2,.bb-pixel-display,.bb-zen-deck,.bb-zen-controls,.bb-zen-note');
  var zAnim=function(){return !!G&&!RMQ.matches};
  var paintZen=function(){Z.mode.style.clipPath=zr.r>=ZO.R-1?'none':'circle('+zr.r.toFixed(1)+'px at '+ZO.x.toFixed(1)+'px '+ZO.y.toFixed(1)+'px)'};
  var origin=function(){var r=Z.open.getBoundingClientRect();ZO.x=r.left+r.width/2;ZO.y=r.top+r.height/2;ZO.R=Math.ceil(Math.hypot(Math.max(ZO.x,innerWidth-ZO.x),Math.max(ZO.y,innerHeight-ZO.y)))+2};
  if(G)G.set(zItems,{y:28,opacity:0});
  function enterZen(){
    if(S.zen)return;S.zen=true;origin();
    Z.mode.classList.add('is-open');Z.mode.classList.toggle('zen-anim',zAnim());Z.mode.setAttribute('aria-hidden','false');document.body.classList.add('zen-mode-open');Z.open.setAttribute('aria-expanded','true');
    syncZen();if(!S.apiAsked&&!S.player)loadApi();
    if(zAnim()){/* from the current radius, so grabbing it mid-close reopens smoothly */
      G.to(zr,{r:ZO.R,duration:.7,ease:'power3.inOut',overwrite:true,onUpdate:paintZen,onComplete:paintZen});
      G.to(zItems,{y:0,opacity:1,duration:.75,ease:'expo.out',stagger:.07,delay:.22,overwrite:true});
      G.fromTo(Z.close,{scale:.7,opacity:0},{scale:1,opacity:1,duration:.5,ease:'back.out(2)',delay:.4,overwrite:'auto',clearProps:'scale,opacity'})}
    else{zr.r=ZO.R;paintZen();if(G)G.set(zItems,{y:0,opacity:1})}
    Z.close.focus({preventScroll:true})}
  function exitZen(){
    if(!S.zen)return;S.zen=false;Z.open.setAttribute('aria-expanded','false');origin();
    var done=function(){if(S.zen)return;Z.mode.classList.remove('is-open');Z.mode.setAttribute('aria-hidden','true');document.body.classList.remove('zen-mode-open');zr.r=0;paintZen();if(G)G.set(zItems,{y:28,opacity:0})};
    if(zAnim()){
      G.to(zItems,{y:-14,opacity:0,duration:.28,ease:'power2.in',stagger:.025,overwrite:true});
      G.to(zr,{r:0,duration:.6,ease:'power3.inOut',overwrite:true,delay:.1,onUpdate:paintZen,onComplete:done})}
    else done();
    Z.open.focus({preventScroll:true})}
  Z.open.setAttribute('aria-expanded','false');Z.open.addEventListener('click',enterZen);Z.close.addEventListener('click',exitZen);
  var zTip=$('.bb-zen-tip',Z.open);Z.open.addEventListener('pointerenter',function(){placeTip(zTip)});Z.open.addEventListener('focus',function(){placeTip(zTip)});
  Z.mode.addEventListener('keydown',function(e){
    if(e.key==='Escape'){e.stopPropagation();exitZen();return}
    if(e.key!=='Tab')return;/* keep Tab inside the room while it is open */
    var f=Z.mode.querySelectorAll('button:not([disabled]),input,a[href]');if(!f.length)return;var a=f[0],z=f[f.length-1];
    if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}});
  window.addEventListener('resize',function(){if(S.zen){origin();zr.r=ZO.R;paintZen()}});
  /* its controls are the header's controls: one source of truth */
  var flipZen=function(){if(!Z.cass)return;Z.cass.classList.remove('is-flipping');void Z.cass.offsetWidth;Z.cass.classList.add('is-flipping')};
  $('#bbZenPrev').addEventListener('click',function(){flipZen();$('.bb-prev',S.el).click()});
  $('#bbZenNext').addEventListener('click',function(){flipZen();$('.bb-next',S.el).click()});
  Z.play.addEventListener('click',function(){$('.bb-play',S.el).click()});
  Z.shuffle.addEventListener('click',function(){$('.bb-shuffle',S.el).click()});
  Z.vol.addEventListener('input',function(){setVolume(+Z.vol.value,true)});

  setState();loop();
  /* load YouTube once the page has settled so it never competes with first paint (nothing plays until Play is pressed) */
  (window.requestIdleCallback||function(f){setTimeout(f,900)})(function(){loadApi()},{timeout:2500});
}
function setMode(mode){
  var was=S.mode;S.mode=mode;document.body.classList.toggle('has-bb',mode!=='work');if(S.el)S.el.hidden=(mode==='work');
  if(mode==='work'&&was!=='work'){S.resume=S.playing;if(S.playing)fadeTo(0,.5,function(){pause(false)})}
  else if(mode!=='work'&&was==='work'){if(S.fade){S.fade.kill();S.fade=null;setPlayerVol(S.vol)}if(S.resume&&!S.userPaused&&S.ready)play();S.resume=false}
  loop()}

window.Boombox={init:init,setMode:setMode};
})();
