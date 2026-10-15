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
var S={list:DEFAULT_LIST,ready:false,player:null,playing:false,want:true,userPaused:false,blocked:false,error:false,mode:'landing',resume:false,
  el:null,cv:null,x:null,ticking:false,last:0,t0:performance.now(),t:0,press:-1,title:'',apiAsked:false,gate:false,stateName:'idle',shuffle:false,vol:80};

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
  P1(x,bx+37,oy+1,pl?((S.t%1)<.5?'#ff5a3c':'#a8402e'):(S.blocked?((S.t%1.2)<.6?'#ffd25a':'#6a5a22'):'#6a2a22'));
  /* transport buttons: prev / play-pause / next (HTML buttons sit over these) */
  var names=['prev',pl?'pause':'play','next'];
  for(ii=0;ii<3;ii++){var X=bx+21+ii*7,Y=oy+11,dn=S.press===ii;
    R(x,X,Y,6,5,'#171c27');R(x,X,Y,6,dn?5:4,dn?'#5a687c':'#c5d0dc');R(x,X+1,Y+(dn?1:0),4,dn?4:3,'#e8edf3');
    glyph(x,names[ii],X,Y+(dn?1:0)+0,'#171c27')}
  /* speakers: cones pump with the bass */
  for(ii=-1;ii<=1;ii+=2){var cx=bx+30+ii*20;disc(x,cx,oy+11,7,'#171c27');disc(x,cx,oy+11,6,'#3a4659');disc(x,cx,oy+11,4+(beat>.35?1:0),'#202838');disc(x,cx,oy+11,2,beat>.35?'#aebccd':'#7f8da0');
    disc(x,cx,oy+3,2,'#171c27');disc(x,cx,oy+3,1,'#59657a');P1(x,cx-3,oy+8,'#6b7a90')}
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
function setState(){
  var name=S.error?'error':(S.playing?'playing':(S.blocked?'blocked':(S.ready?'paused':'loading')));S.stateName=name;
  if(!S.el)return;S.el.setAttribute('data-state',name);
  var pb=$('.bb-play',S.el);pb.setAttribute('aria-label',S.playing?'Pause music':'Play music');pb.setAttribute('aria-pressed',String(S.playing));
  var sh=$('#bbShuffle',S.el);if(sh){sh.setAttribute('aria-pressed',String(S.shuffle));sh.setAttribute('aria-label',S.shuffle?'Shuffle on':'Shuffle off');sh.classList.toggle('is-on',S.shuffle)}
  var np=$('.bb-np',S.el);
  if(S.error)np.textContent='Couldn’t load the playlist';
  else if(S.blocked&&!S.playing)np.textContent='Tap play for music';
  else if(S.playing&&S.title)np.textContent='Now playing: '+S.title;
  loop()}
function say(t,ms){var np=$('.bb-np',S.el);if(!np)return;np.textContent=t;S.el.classList.add('np-on');clearTimeout(S.npT);S.npT=setTimeout(function(){S.el.classList.remove('np-on')},ms||3200)}

/* ------------------------------------------------------------------ YouTube */
function loadApi(){
  if(S.apiAsked||(window.YT&&window.YT.Player)){if(window.YT&&window.YT.Player)makePlayer();return}
  S.apiAsked=true;var prev=window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady=function(){if(prev)try{prev()}catch(e){}makePlayer()};
  var s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';s.async=true;s.onerror=function(){S.error=true;setState()};document.head.appendChild(s)}
function makePlayer(){
  if(S.player)return;
  S.player=new YT.Player('bbYT',{width:'200',height:'200',playerVars:{listType:'playlist',list:S.list,controls:0,disablekb:1,fs:0,playsinline:1,rel:0,modestbranding:1,iv_load_policy:3,origin:location.origin},
    events:{onReady:onReady,onStateChange:onState,onError:onError}})}
function onReady(){S.ready=true;try{S.player.setLoop(true);S.player.setVolume(S.vol)}catch(e){}
  setState();if(S.want&&S.mode!=='work'&&!S.userPaused)tryAutoplay()}
function tryAutoplay(){
  try{S.player.playVideo()}catch(e){}
  clearTimeout(S.blockT);S.blockT=setTimeout(function(){if(!S.playing&&!S.error&&S.want){S.blocked=true;armGesture();setState()}},1800)}
function onState(e){
  var st=e.data;/* -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued */
  if(st===1){S.playing=true;S.blocked=false;S.error=false;clearTimeout(S.blockT);readTitle();fadeIn()}
  else if(st===2||st===0||st===5){S.playing=false}
  setState()}
function onError(){S.error=true;S.playing=false;S.ready=true;setState();say('Couldn’t load the playlist. The tapes button still opens it on YouTube.',5200)}
function readTitle(){try{var d=S.player.getVideoData();if(d&&d.title&&d.title!==S.title){S.title=d.title;say('Now playing: '+d.title,3600)}}catch(e){}}
function fadeIn(){if(!G||RMQ.matches||!S.player)return;var v={n:S.vol||0};try{S.player.setVolume(0)}catch(e){}
  G.to(v,{n:80,duration:.9,ease:'power1.out',onUpdate:function(){try{S.player.setVolume(Math.round(v.n))}catch(e){}}})}
/* the first touch anywhere starts the music (unless it is heading for the Work side) */
function armGesture(){if(S.gate)return;S.gate=true;
  var go=function(e){
    if(e&&e.target&&e.target.closest&&e.target.closest('a[href^="#/work"],a[href^="#/built"],a[href^="#/contact"],[data-v="work"],[data-door="office"],.bb-b,.bb-tape'))return;
    cleanup();if(S.mode!=='work'&&!S.userPaused)play()};
  var cleanup=function(){S.gate=false;document.removeEventListener('pointerdown',go,true);document.removeEventListener('keydown',go,true)};
  S.cleanupGate=cleanup;document.addEventListener('pointerdown',go,true);document.addEventListener('keydown',go,true)}
function play(){S.userPaused=false;S.want=true;if(!S.player||!S.ready){loadApi();return}try{S.player.playVideo()}catch(e){}}
function pause(user){if(user)S.userPaused=true;try{S.player&&S.ready&&S.player.pauseVideo()}catch(e){}}

/* ------------------------------------------------------------------ public */
function init(site){
  var m=(site&&site.music)||{};S.list=(m.playlist||DEFAULT_LIST);
  S.el=$('#bb');if(!S.el)return;S.cv=$('#bbCv');if(!S.cv||!PX)return;
  S.x=S.cv.getContext('2d');S.x.imageSmoothingEnabled=false;
  var tape=$('#bbTape');tape.href=m.url||('https://www.youtube.com/playlist?list='+S.list);
  var tc=tape.querySelector('canvas');if(A&&tc){tc.width=26;tc.height=18;tc.getContext('2d').drawImage(A.cassette(),0,0)}
  S.el.hidden=false;
  /* buttons: respond on pointer-down (Apple: feedback on touch-down), act on click */
  var map={'.bb-prev':0,'.bb-play':1,'.bb-next':2};
  Object.keys(map).forEach(function(sel){var b=$(sel,S.el),i=map[sel];
    b.addEventListener('pointerdown',function(){S.press=i;frame(performance.now())});
    var up=function(){if(S.press===i){S.press=-1;frame(performance.now())}};b.addEventListener('pointerup',up);b.addEventListener('pointerleave',up);b.addEventListener('pointercancel',up);
    b.addEventListener('click',function(){
      if(S.error){say('The playlist didn’t load. Try the tapes button.',3200);return}
      if(i===1){if(S.playing)pause(true);else{if(S.cleanupGate)S.cleanupGate();play()}}
      else{flipTape();if(!S.ready){loadApi();return}S.userPaused=false;S.want=true;try{i===0?S.player.previousVideo():S.player.nextVideo()}catch(e){}if(!S.playing)try{S.player.playVideo()}catch(e){}}})});
  /* The physical-style volume control stays to the left of the stereo. */
  var volume=$('#bbVolume');
  if(volume){
    volume.value=String(S.vol);
    volume.addEventListener('input',function(){S.vol=Number(volume.value);try{if(S.player&&S.ready)S.player.setVolume(S.vol)}catch(e){}});
    volume.addEventListener('keydown',function(e){if(e.key==='ArrowUp'||e.key==='ArrowRight'){S.vol=Math.min(100,S.vol+5);volume.value=S.vol;try{S.player&&S.ready&&S.player.setVolume(S.vol)}catch(x){}e.preventDefault()}else if(e.key==='ArrowDown'||e.key==='ArrowLeft'){S.vol=Math.max(0,S.vol-5);volume.value=S.vol;try{S.player&&S.ready&&S.player.setVolume(S.vol)}catch(x){}e.preventDefault()}});
  }
  var shuffle=$('#bbShuffle',S.el);
  if(shuffle)shuffle.addEventListener('click',function(){
    S.shuffle=!S.shuffle;
    try{if(S.player&&S.ready)S.player.setShuffle(S.shuffle)}catch(e){}
    setState();say(S.shuffle?'Shuffle on':'Shuffle off',1800);
  });
  /* The cassette rocks and flips when the visitor changes tracks. */
  var flipTape=function(){
    if(G&&!RMQ.matches){G.fromTo(tape,{rotationY:0,scale:1},{keyframes:[{rotationY:90,scale:.9,duration:.16,ease:'power2.in'},{rotationY:180,scale:1,duration:.2,ease:'power2.out'},{rotationY:360,scale:1,duration:.3,ease:'power2.out'}],overwrite:true})}
  };
  /* the cassette: obviously a button */
  if(G&&!RMQ.matches){
    var wig=function(){if(S.mode==='work'||document.hidden)return;G.fromTo(tape,{rotation:0,y:0},{keyframes:[{y:-5,rotation:-5,duration:.16,ease:'power2.out'},{y:0,rotation:3,duration:.2,ease:'power2.in'},{rotation:-2,duration:.14},{rotation:0,duration:.3,ease:'elastic.out(1,.5)'}],overwrite:true})};
    S.wigT=setInterval(wig,7500);setTimeout(wig,2600)}
  tape.addEventListener('pointerenter',function(){S.el.classList.add('tape-on')});tape.addEventListener('pointerleave',function(){S.el.classList.remove('tape-on')});
  tape.addEventListener('focus',function(){S.el.classList.add('tape-on')});tape.addEventListener('blur',function(){S.el.classList.remove('tape-on')});
  RMQ.addEventListener&&RMQ.addEventListener('change',loop);
  window.addEventListener('themechange',function(){frame(performance.now())});
  setState();loop();
  /* load YouTube once the page has settled so it never competes with first paint */
  (window.requestIdleCallback||function(f){setTimeout(f,900)})(function(){loadApi()},{timeout:2500});
}
function setMode(mode){
  var was=S.mode;S.mode=mode;document.body.classList.toggle('has-bb',mode!=='work');if(S.el)S.el.hidden=(mode==='work');
  if(mode==='work'&&was!=='work'){S.resume=S.playing||S.blocked;if(S.playing){if(G&&S.player&&!RMQ.matches){var v={n:80};G.to(v,{n:0,duration:.5,onUpdate:function(){try{S.player.setVolume(Math.round(v.n))}catch(e){}},onComplete:function(){pause(false)}})}else pause(false)}
    if(S.cleanupGate)S.cleanupGate()}
  else if(mode!=='work'&&was==='work'){if(S.resume&&!S.userPaused){if(S.ready)play();else S.want=true}else if(!S.userPaused&&!S.playing&&S.ready)tryAutoplay()}
  loop()}

window.Boombox={init:init,setMode:setMode};
})();
