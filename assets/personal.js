/* Tarun Inala – Personal overlays.
   Same idea as the Work scroll scene (see devices.js): the camera pushes into a pixel object in the park scene, a flat HTML
   copy is laid exactly over it and un-skews/grows into something you can use, and every open/close is one spring that can be
   grabbed and reversed mid-flight.
     Writings    -> the camera pushes into the diary on his lap, which spreads into three diaries (English, Telugu, Hindi).
                    Each opens like a book; Next / Previous turn the page.
     Photographs -> the camera pushes into the camera at his eye, which becomes five cameras (one per colour group).
                    Each lifts up, flips to its back and shows the photographs on its own screen; Previous / Next are on the body.
   Everything here is driven from update(S, R): S is the scrubbed scroll state owned by mountSeq(), R is the pixel object's
   quad on screen, read live from Stage.parkRects(). */
(function(){
'use strict';
var G=window.gsap,A=window.PArt;
var clamp=function(v,a,b){return v<a?a:(v>b?b:v)},lerp=function(a,b,t){return a+(b-a)*t},gm=function(a,b,t){return a*Math.pow(b/a,t)};
var smooth=function(t){t=clamp(t,0,1);return t*t*(3-2*t)};
var CAMKEYS=['teal','mono','amber','rose','night'];

function mount(seq,D,kind){
  if(!A)return null;
  var $=D.$,$$=D.$$,esc=D.esc,SITE=D.SITE||{},isW=kind==='writings',LANG=D.LANG||{},reduced=D.reduced;

  /* ---------------------------------------------------------------- what goes on the shelf */
  var items=[];
  if(isW){
    ['English','Telugu','Hindi'].forEach(function(lg){
      var list=(SITE.writings||[]).filter(function(w){return w.lang===lg});
      if(list.length)items.push({id:lg,label:lg,sub:list.length+(list.length===1?' piece':' pieces'),list:list,art:A.diary(lg),pal:A.DIARY[lg]})});
  }else{
    var P=D.realPhotos(),gi=0;
    (SITE.photoGroups||[]).forEach(function(g){
      var list=P.filter(function(p){return p.g===g.id});if(!list.length)return;
      var key=A.CAM[g.id]?g.id:CAMKEYS[gi%CAMKEYS.length];gi++;
      items.push({id:g.id,key:key,label:g.name,note:g.note||'',cam:A.CAM[key].name,sub:A.CAM[key].name+' · '+list.length,list:list,front:A.cam(key),back:A.camBack(key),spec:A.CAM[key]})});
  }
  if(!items.length)return null;

  /* ---------------------------------------------------------------- markup */
  function bookHTML(it,i){
    var p=it.pal;
    return '<article class="pit pit-bk" data-i="'+i+'" style="--bk:'+p.base+';--bkl:'+p.hi+';--bkd:'+p.lo+';--bkt:'+p.trim+'">'+
      '<button class="pit-open" type="button" data-open="'+i+'" aria-label="Open the '+esc(it.label)+' diary, '+esc(it.sub)+'"></button>'+
      '<div class="bk-3d"><div class="bk-full" inert><div class="bk-frame">'+
        '<header class="bk-bar"><button class="bk-x" type="button" data-close aria-label="Close the diary"><i></i></button><span class="bk-ttl">'+esc(it.label)+' diary</span><span class="bk-pos"></span></header>'+
        '<div class="bk-stage"><div class="pg pg-a"></div><div class="pg pg-b"></div></div>'+
        '<footer class="bk-nav"><button class="bk-btn" type="button" data-prev>'+D.ic('arrow-l')+'<span>Previous</span></button><span class="bk-hint">Turn the page</span><button class="bk-btn" type="button" data-next><span>Next</span>'+D.ic('arrow-r')+'</button></footer>'+
      '</div></div>'+
      '<div class="bk-cover"><div class="cf cf-f"><canvas class="px bk-art"></canvas></div><div class="cf cf-b"></div></div></div>'+
      '<div class="pit-lab"><b>'+esc(it.label)+'</b><span>'+esc(it.sub)+'</span></div></article>'}
  function camHTML(it,i){
    var s=it.spec,pc=function(r){return 'left:'+((r[0]+1)/A.AW*100).toFixed(3)+'%;top:'+((r[1]+1)/A.AH*100).toFixed(3)+'%;width:'+(r[2]/A.AW*100).toFixed(3)+'%;height:'+(r[3]/A.AH*100).toFixed(3)+'%'};
    return '<article class="pit pit-cm" data-i="'+i+'">'+
      '<button class="pit-open" type="button" data-open="'+i+'" aria-label="Pick up the '+esc(it.cam)+': '+esc(it.label)+', '+it.list.length+' photographs"></button>'+
      '<div class="cm-3d"><div class="cm-flip">'+
        '<div class="cm-face cm-front"><canvas class="px"></canvas></div>'+
        '<div class="cm-face cm-bk" inert><canvas class="px"></canvas>'+
          '<div class="cm-lcd" style="'+pc(s.lcd)+'"><div class="cm-scr"><img alt="" draggable="false"><img alt="" draggable="false"></div><i class="cm-grid"></i><i class="cm-flash"></i>'+
            '<div class="cm-osd"><span class="cm-n"></span><span class="cm-g">'+esc(it.label)+'</span></div></div>'+
          '<button class="cm-b cm-prev" type="button" data-prev aria-label="Previous photograph" style="'+pc(s.prev)+'"><i></i></button>'+
          '<button class="cm-b cm-next" type="button" data-next aria-label="Next photograph" style="'+pc(s.next)+'"><i></i></button>'+
        '</div></div></div>'+
      '<div class="pit-lab"><b>'+esc(it.label)+'</b><span>'+esc(it.sub)+'</span></div>'+
      '<button class="cm-x" type="button" data-close aria-label="Put the camera down"><i></i></button></article>'}

  var root=document.createElement('div');root.className='ps ps-'+kind;
  root.innerHTML='<div class="ps-dim"></div><div class="ps-shelf"><div class="ps-sheet ps-sa"></div><div class="ps-sheet ps-sb"></div>'+
    '<div class="ps-grid">'+items.map(function(){return '<div class="ps-slot"></div>'}).join('')+'</div>'+
    items.map(isW?bookHTML:camHTML).join('')+'</div>'+
    '<div class="photo-lightbox" aria-hidden="true" inert><button class="photo-lightbox-x" type="button" aria-label="Close full-screen photograph">×</button><button class="photo-lightbox-prev" type="button" aria-label="Previous photograph">‹</button><figure><img alt=""><figcaption></figcaption></figure><button class="photo-lightbox-next" type="button" aria-label="Next photograph">›</button><span class="photo-lightbox-count" aria-live="polite"></span></div>'+
    '<p class="ps-cap" aria-hidden="true"><span>'+(isW?'Writings':'Photographs')+'</span> '+(isW?'Open a diary and turn its pages.':'Pick up a camera and look through it.')+'</p>'+
    '<span class="dv-cur" aria-hidden="true"><i class="cur-rip"></i><svg viewBox="0 0 20 24"><path d="M2 1.5v18l4.6-4.3 3.1 7 3-1.4-3.1-6.9H16Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg></span>';
  seq.appendChild(root);

  var dim=$('.ps-dim',root),shelf=$('.ps-shelf',root),sa=$('.ps-sa',root),sb=$('.ps-sb',root),grid=$('.ps-grid',root),slots=$$('.ps-slot',root),cap=$('.ps-cap',root),
      curEl=$('.dv-cur',root),ripEl=$('.cur-rip',root);
  shelf.appendChild(curEl);
  if(isW){sb.style.background='rgba(26,20,16,.82)';sa.style.background='#f4ead6'}else{sb.style.background='rgba(20,22,26,.84)';sa.style.background='#23282f'}
  var its=$$('.pit',root).map(function(el,i){return {el:el,i:i,d:items[i],o:{x:0,y:0,w:1,h:1},f:{x:0,y:0,w:1,h:1},
      sp:D.Spring(0,{response:.5,damping:.86,precision:.0008}),idx:0,busy:false,vis:0,booted:false}});
  /* paint the pixel art into its canvases */
  its.forEach(function(w){
    if(isW){var c=$('.bk-art',w.el),a=w.d.art;c.width=a.width;c.height=a.height;c.getContext('2d').drawImage(a,0,0)}
    else{var cs=$$('canvas',w.el),fr=w.d.front,bk=w.d.back;cs[0].width=fr.width;cs[0].height=fr.height;cs[0].getContext('2d').drawImage(fr,0,0);
      cs[1].width=bk.width;cs[1].height=bk.height;cs[1].getContext('2d').drawImage(bk,0,0)}});

  var lay={vw:0,vh:0,narrow:false,flat:null,Wd:1,Hd:1,k:1,sx:0,sy:0},cur=-1,live=false,closing=null,ART=isW?{w:42,h:56}:{w:A.AW,h:A.AH};

  /* ---------------------------------------------------------------- layout */
  function layout(vw,vh,narrow,hdr){
    if(cur>=0)closeNow();
    var gut=Math.max(12,Math.min(.04*vw,40)),pad=narrow?16:28,gap=narrow?10:20,cols=isW?3:(narrow?2:5),n=its.length,
        Wd=Math.round(Math.min(vw-2*gut,isW?860:1100)),slotW=(Wd-2*pad-gap*(cols-1))/cols,lab=58,
        hMax=isW?(narrow?vh*.3:vh*.36):(narrow?vh*.2:vh*.3),k=Math.floor(Math.min(slotW/ART.w,hMax/ART.h)*2)/2;
    k=Math.max(1,k>=2?Math.floor(k):k);
    var slotH=Math.round(ART.h*k)+lab;
    grid.style.cssText='width:'+Wd+'px;padding:'+pad+'px;gap:'+gap+'px';
    slots.forEach(function(s){s.style.width=slotW+'px';s.style.height=slotH+'px'});
    var Hd=grid.offsetHeight;
    lay={vw:vw,vh:vh,narrow:narrow,hdr:hdr,Wd:Wd,Hd:Hd,k:k,flat:{cx:vw/2,cy:hdr+(vh-hdr-30)/2-(narrow?0:4),w:Wd,h:Hd}};
    lay.sx=Math.round(lay.flat.cx-Wd/2);lay.sy=Math.round(lay.flat.cy-Hd/2);
    shelf.style.width=Wd+'px';shelf.style.height=Hd+'px';
    cap.style.cssText='left:'+Math.round(vw/2)+'px;top:'+Math.round(lay.sy+Hd+16)+'px;'+(narrow?'display:none':'');
    /* the open size of each thing, relative to the shelf */
    var fx,fy,fw,fh;
    /* the next section's rounded top edge overlaps the bottom 1.75rem of the pinned view, so the usable height stops above it */
    var av=vh-hdr-30;
    if(isW){fh=Math.round(narrow?av-12:Math.min(av-24,800));fw=Math.round(narrow?vw-14:Math.min(fh*.8,vw-2*gut,640));
      fx=Math.round(vw/2-fw/2-lay.sx);fy=Math.round(hdr+(av-fh)/2+(narrow?2:4)-lay.sy)}
    else{var kc=Math.min((vw-(narrow?12:2*gut))/A.AW,(av-(narrow?110:130))/A.AH,narrow?9:14);kc=kc>=2?Math.floor(kc):Math.max(1,Math.floor(kc*2)/2);
      fw=Math.round(A.AW*kc);fh=Math.round(A.AH*kc);fx=Math.round(vw/2-fw/2-lay.sx);fy=Math.round(hdr+(av-fh-62)/2+4-lay.sy)}
    its.forEach(function(w,i){var s=slots[i];
      w.o={x:s.offsetLeft+(s.offsetWidth-Math.round(ART.w*k))/2,y:s.offsetTop,w:Math.round(ART.w*k),h:Math.round(ART.h*k)};
      w.f={x:fx,y:fy,w:fw,h:fh};box(w,w.o);paint(w,0)});
  }
  function box(w,r){var s=w.el.style;s.left=r.x+'px';s.top=r.y+'px';s.width=r.w+'px';s.height=r.h+'px'}

  /* ---------------------------------------------------------------- one spring p (0 tile, 1 open) drives everything */
  function paint(w,p){
    var o=w.o,f=w.f,s=w.el.style,lab=$('.pit-lab',w.el);
    box(w,{x:lerp(o.x,f.x,p),y:lerp(o.y,f.y,p),w:lerp(o.w,f.w,p),h:lerp(o.h,f.h,p)});
    lab.style.opacity=(isW?1-smooth(p/.3):1-smooth((p-.1)/.35)).toFixed(3);
    if(isW){
      var rot=-smooth(p/.72)*168,cv=$('.bk-cover',w.el),full=$('.bk-full',w.el);
      cv.style.transform='rotateY('+rot.toFixed(2)+'deg)';cv.style.opacity=(1-smooth((p-.78)/.2)).toFixed(3);
      full.style.opacity=smooth((p-.28)/.42).toFixed(3);
    }else{
      var fl=$('.cm-flip',w.el);fl.style.transform='rotateY('+(smooth((p-.12)/.62)*180).toFixed(2)+'deg)';
      var x=$('.cm-x',w.el);x.style.opacity=smooth((p-.85)/.15).toFixed(3);x.style.pointerEvents=p>.9?'auto':'none';
      w.el.style.setProperty('--lift',(Math.sin(smooth(p/.5)*Math.PI)*-18).toFixed(1)+'px');
    }
    /* the others step back */
    its.forEach(function(x){if(x!==w&&cur===w.i)x.el.style.opacity=(1-smooth(p/.55)).toFixed(3)});
  }
  function openIt(i){
    var w=its[i];if(!w||(cur>=0&&cur!==i)||!live)return;
    stopHint(true);closing=null;cur=i;w.el.classList.add('is-front');root.classList.add('is-open');D.lock(true);
    its.forEach(function(x){if(x!==w){x.el.inert=true}});
    $('.pit-open',w.el).tabIndex=-1;
    if(isW){$('.bk-full',w.el).inert=false;if(!w.booted){w.booted=true;fillBook(w,0,true)}else fillBook(w,w.idx,true)}
    else{$('.cm-bk',w.el).inert=false;if(!w.booted){w.booted=true;show(w,0,0,true)}}
    w.sp.update(function(p){paint(w,p)}).rest(function(){
      if(cur===w.i&&w.sp.value()>.5){
        var c=$('[data-close]',w.el);if(c&&!w.focused){w.focused=true;c.focus({preventScroll:true})}
        if(!isW&&!w.on){w.on=true;powerOn(w)}}
      else if(cur===w.i&&w.sp.value()<.5)finishClose(w)});
    w.sp.to(1,{response:.62,damping:.84});
    D.say('Opened the '+w.d.label+(isW?' diary':' camera'));
  }
  function closeIt(then){var w=its[cur];if(!w)return;if(lightboxOwner)closeLightbox();closing=then||null;w.focused=false;w.on=false;
    if(!isW){var scr=$('.cm-scr',w.el);G&&G.killTweensOf(scr);scr.style.opacity=0}
    w.sp.to(0,{response:.5,damping:.92})}
  function finishClose(w){
    closing=null;cur=-1;w.el.classList.remove('is-front');root.classList.remove('is-open');
    if(isW)$('.bk-full',w.el).inert=true;else $('.cm-bk',w.el).inert=true;
    its.forEach(function(x){x.el.inert=false;x.el.style.opacity=''});$('.pit-open',w.el).tabIndex=0;
    D.lock(false);var b=$('.pit-open',w.el);if(b&&live)b.focus({preventScroll:true})}
  function closeNow(){var w=its[cur];if(!w)return;if(lightboxOwner)closeLightbox();w.sp.set(0);paint(w,0);finishClose(w)}

  /* ---------------------------------------------------------------- diary: pages and the page turn */
  function pageHTML(w,i,n){
    var lg=LANG[w.lang]||'en',L=(w.lines||[]).map(function(l){return l&&l.trim()?'<p>'+esc(l)+'</p>':'<div class="gap"></div>'}).join('');
    return '<div class="pg-in" tabindex="0" '+(lg!=='en'?'lang="'+lg+'"':'')+'><div class="pg-meta" lang="en"><span>'+esc(D.kindLabel(w.kind))+'</span><span>'+esc(w.lang)+'</span></div>'+
      '<h3 class="pg-h">'+esc(w.title)+'</h3><div class="pg-verse">'+L+'</div></div><div class="pg-fo" lang="en"><span>'+(i+1)+'</span></div><i class="pg-sh"></i>'}
  function fillPage(el,w,i){el.innerHTML=pageHTML(w.d.list[i],i,w.d.list.length);var s=$('.pg-in',el);if(s)s.scrollTop=0}
  function fillBook(w,i,init){
    w.idx=i;var a=$$('.pg',w.el)[0],b=$$('.pg',w.el)[1];
    fillPage(a,w,i);
    if(init&&G){G.set(a,{rotateY:0,opacity:1,zIndex:2,clearProps:'visibility'});G.set(b,{opacity:0,zIndex:0,rotateY:0})}
    pos(w)}
  function pos(w){
    $('.bk-pos',w.el).textContent=(w.idx+1)+' / '+w.d.list.length;
    var pv=$('[data-prev]',w.el),nx=$('[data-next]',w.el);pv.disabled=w.idx<=0;nx.disabled=w.idx>=w.d.list.length-1;
    D.say((w.d.list[w.idx].title||'')+', '+(w.idx+1)+' of '+w.d.list.length)}
  function turn(w,to){
    if(to<0||to>=w.d.list.length||to===w.idx)return;
    var a=$$('.pg',w.el)[0],b=$$('.pg',w.el)[1],dir=to>w.idx?1:-1;
    if(!G||reduced()){fillBook(w,to,true);return}
    if(w.tl){w.tl.progress(1)}
    w.idx=to;pos(w);
    var done=function(){fillPage(a,w,to);G.set(a,{rotateY:0,opacity:1,zIndex:2});G.set(b,{opacity:0,zIndex:0,rotateY:0});w.tl=null};
    var shade=function(el,deg){var sh=$('.pg-sh',el);if(sh)sh.style.opacity=(Math.sin(Math.min(Math.abs(deg),180)/180*Math.PI)*.55).toFixed(3)};
    if(dir>0){
      /* next: the new page waits underneath; the current one lifts off the spine and swings away */
      fillPage(b,w,to);G.set(b,{rotateY:0,opacity:1,zIndex:1});G.set(a,{zIndex:3});
      var st={d:0};
      w.tl=G.timeline({onComplete:done})
        .to(st,{d:-112,duration:.72,ease:'power2.inOut',onUpdate:function(){G.set(a,{rotateY:st.d});shade(a,st.d)}})
        .to(a,{opacity:0,duration:.22,ease:'power1.in'},.5);
    }else{
      /* previous: the earlier page comes back over the spine and lands on the current one */
      fillPage(b,w,to);var st2={d:-112};G.set(b,{rotateY:-112,opacity:0,zIndex:3});G.set(a,{zIndex:1});
      w.tl=G.timeline({onComplete:done})
        .to(b,{opacity:1,duration:.2,ease:'power1.out'},0)
        .to(st2,{d:0,duration:.7,ease:'power2.inOut',onUpdate:function(){G.set(b,{rotateY:st2.d});shade(b,st2.d)}},0);
    }
  }

  /* ---------------------------------------------------------------- camera: the screen on the back */
  var photoSrc=D.photoSrc;
  function osd(w){var n=$('.cm-n',w.el);n.textContent=(w.idx+1)+' / '+w.d.list.length}
  function preload(w,i){var p=w.d.list[i];if(!p)return;var im=new Image();im.src=photoSrc(p)}
  function show(w,to,dir,init){
    var L=w.d.list;to=clamp(to,0,L.length-1);var imgs=$$('.cm-scr img',w.el),scr=$('.cm-scr',w.el);
    var out=imgs[w.vis],inn=imgs[w.vis^1],first=!!init;
    w.idx=to;osd(w);
    var pv=$('[data-prev]',w.el),nx=$('[data-next]',w.el);pv.disabled=to<=0;nx.disabled=to>=L.length-1;
    var p=L[to];inn.src=p.thumb||photoSrc(p);
    var full=new Image();full.onload=function(){if(inn.getAttribute('data-for')===String(to))inn.src=full.src};inn.setAttribute('data-for',to);full.src=photoSrc(p);
    inn.alt='Photograph '+(to+1)+' of '+L.length+' in the group: '+w.d.label;
    w.vis^=1;
    if(!G||reduced()||first){G&&G.set(inn,{x:'0%',opacity:1,filter:'none'});G&&G.set(out,{opacity:0});if(!G){inn.style.opacity=1;out.style.opacity=0}preload(w,to+1);preload(w,to-1);return}
    G.set(inn,{x:(dir*16)+'%',opacity:0,filter:'blur(4px)'});
    G.to(out,{x:(-dir*12)+'%',opacity:0,filter:'blur(4px)',duration:.3,ease:'power2.in',overwrite:true});
    G.to(inn,{x:'0%',opacity:1,filter:'blur(0px)',duration:.5,ease:'power3.out',delay:.06,overwrite:true});
    var fl=$('.cm-flash',w.el);G.fromTo(fl,{opacity:0},{keyframes:[{opacity:.5,duration:.05},{opacity:0,duration:.28}],overwrite:true});
    preload(w,to+1);preload(w,to-1)}
  function powerOn(w){var scr=$('.cm-scr',w.el),imgs=$$('.cm-scr img',w.el);
    if(!G||reduced()){scr.style.opacity=1;return}
    G.fromTo(scr,{opacity:0,clipPath:'inset(49% 0% 49% 0%)'},{opacity:1,clipPath:'inset(0% 0% 0% 0%)',duration:.55,ease:'power3.out',overwrite:true,clearProps:'clipPath'});
    G.fromTo(imgs[w.vis],{filter:'brightness(2.2)'},{filter:'brightness(1)',duration:.6,ease:'power2.out'})}

  /* Full-screen photograph viewer: the camera stays behind a soft, blurred scrim. */
  var lightbox=$('.photo-lightbox',root),lightboxImg=$('figure img',lightbox),lightboxCaption=$('figcaption',lightbox),lightboxCount=$('.photo-lightbox-count',lightbox),lightboxOwner=null;
  function paintLightbox(){
    if(!lightboxOwner)return;
    var p=lightboxOwner.d.list[lightboxOwner.idx];
    lightboxImg.src=photoSrc(p);lightboxImg.alt='Photograph '+(lightboxOwner.idx+1)+' of '+lightboxOwner.d.list.length+' in '+lightboxOwner.d.label;
    lightboxCaption.textContent=lightboxOwner.d.label;
    lightboxCount.textContent=(lightboxOwner.idx+1)+' / '+lightboxOwner.d.list.length;
    $('.photo-lightbox-prev',lightbox).disabled=lightboxOwner.idx<=0;
    $('.photo-lightbox-next',lightbox).disabled=lightboxOwner.idx>=lightboxOwner.d.list.length-1;
  }
  function openLightbox(w){
    if(isW||cur!==w.i)return;
    lightboxOwner=w;paintLightbox();lightbox.classList.add('is-visible');lightbox.inert=false;lightbox.setAttribute('aria-hidden','false');
    root.classList.add('has-lightbox');D.lock(true);$('.photo-lightbox-x',lightbox).focus({preventScroll:true});
  }
  function closeLightbox(){
    if(!lightboxOwner)return;
    lightbox.classList.remove('is-visible');lightbox.inert=true;lightbox.setAttribute('aria-hidden','true');root.classList.remove('has-lightbox');
    var w=lightboxOwner;lightboxOwner=null;D.lock(cur>=0);
    var lcd=$('.cm-lcd',w.el);if(lcd)lcd.focus({preventScroll:true});
  }
  function lightboxStep(d){if(!lightboxOwner)return;var w=lightboxOwner,to=w.idx+d;if(to<0||to>=w.d.list.length)return;show(w,to,d);paintLightbox()}
  /* ---------------------------------------------------------------- input */
  function go(w,d){if(isW)turn(w,w.idx+d);else{if(w.idx+d<0||w.idx+d>=w.d.list.length)return;show(w,w.idx+d,d)}}
  function bind(){
    its.forEach(function(w){
      $('.pit-open',w.el).addEventListener('click',function(){openIt(w.i)});
      var cb=$('[data-close]',w.el);cb.addEventListener('click',function(){closeIt()});
      $('[data-prev]',w.el).addEventListener('click',function(){go(w,-1)});
      $('[data-next]',w.el).addEventListener('click',function(){go(w,1)});
      /* press feedback on pointer-down for the tiles and for the buttons on the camera body */
      var ob=$('.pit-open',w.el);
      ob.addEventListener('pointerdown',function(){if(cur<0&&G)G.to(w.el,{scale:.97,duration:.12,ease:'power2.out',overwrite:'auto'})});
      var up=function(){if(cur<0&&G)G.to(w.el,{scale:1,duration:.5,ease:'elastic.out(1,.5)',overwrite:'auto'})};
      ob.addEventListener('pointerup',up);ob.addEventListener('pointerleave',up);ob.addEventListener('pointercancel',up);
      if(!isW)$$('.cm-b',w.el).forEach(function(b){
        b.addEventListener('pointerdown',function(){b.classList.add('dn')});
        var rel=function(){b.classList.remove('dn')};b.addEventListener('pointerup',rel);b.addEventListener('pointerleave',rel);b.addEventListener('pointercancel',rel)});
      if(!isW){
        $('.cm-lcd',w.el).setAttribute('role','button');
        $('.cm-lcd',w.el).setAttribute('tabindex','0');
        $('.cm-lcd',w.el).setAttribute('aria-label','View photograph full screen');
        $('.cm-lcd',w.el).addEventListener('click',function(e){if(e.target.closest('.cm-b'))return;openLightbox(w)});
        $('.cm-lcd',w.el).addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();openLightbox(w)}});
      }
      /* swipe the page / the screen on touch */
      var sx=0,sy=0,id=null,tgt=isW?$('.bk-stage',w.el):$('.cm-lcd',w.el);
      tgt.addEventListener('pointerdown',function(e){if(e.pointerType==='mouse')return;sx=e.clientX;sy=e.clientY;id=e.pointerId});
      tgt.addEventListener('pointerup',function(e){if(e.pointerId!==id)return;id=null;var dx=e.clientX-sx,dy=e.clientY-sy;
        if(Math.abs(dx)>46&&Math.abs(dx)>Math.abs(dy)*1.5)go(w,dx<0?1:-1)});
    });
    $('.photo-lightbox-x',lightbox).addEventListener('click',closeLightbox);
    $('.photo-lightbox-prev',lightbox).addEventListener('click',function(){lightboxStep(-1)});
    $('.photo-lightbox-next',lightbox).addEventListener('click',function(){lightboxStep(1)});
    lightbox.addEventListener('click',function(e){if(e.target===lightbox)closeLightbox()});
    lightbox.addEventListener('keydown',function(e){if(e.key==='Escape'){e.stopPropagation();closeLightbox()}else if(e.key==='ArrowLeft')lightboxStep(-1);else if(e.key==='ArrowRight')lightboxStep(1)});
    root.addEventListener('keydown',function(e){
      if(lightboxOwner){if(e.key==='Escape'){e.stopPropagation();closeLightbox()}else if(e.key==='ArrowRight')lightboxStep(1);else if(e.key==='ArrowLeft')lightboxStep(-1);return}
      if(cur<0)return;
      if(e.key==='Escape'){e.stopPropagation();closeIt()}
      else if(e.key==='ArrowRight'){go(its[cur],1)}else if(e.key==='ArrowLeft'){go(its[cur],-1)}});
    document.addEventListener('keydown',docKey);
  }
  function docKey(e){if(cur<0||!live)return;if(root.contains(document.activeElement))return;
    if(e.key==='Escape')closeIt();else if(e.key==='ArrowRight')go(its[cur],1);else if(e.key==='ArrowLeft')go(its[cur],-1)}
  bind();

  /* ---------------------------------------------------------------- affordance: a ghost pointer tours the shelf and "clicks" */
  var hintTl=null,hintTimer=0,hintLoops=0,coarse=window.matchMedia&&matchMedia('(pointer:coarse)').matches;
  cap.innerHTML=cap.innerHTML.replace(isW?'Open a diary':'Pick up a camera',isW?(coarse?'Tap a diary':'Open a diary'):(coarse?'Tap a camera':'Pick up a camera'));
  function ctr(el){var r=el.getBoundingClientRect(),o=shelf.getBoundingClientRect(),sc=o.width/lay.Wd||1;return {x:(r.left+r.width/2-o.left)/sc,y:(r.top+r.height/2-o.top)/sc}}
  /* the hover-lift is a CSS class on the item (never a tween on the item itself, which the scroll timeline owns) */
  function stopHint(hard){clearTimeout(hintTimer);if(hintTl){hintTl.kill();hintTl=null}
    its.forEach(function(w){w.el.classList.remove('is-hint')});
    if(G){G.killTweensOf([curEl,ripEl]);G.to(curEl,{opacity:0,duration:.2,overwrite:true})}
    if(hard)hintLoops=99}
  function startHint(delay){if(!G||reduced()||!live||cur>=0||hintLoops>=2)return;stopHint(false);hintTimer=setTimeout(runHint,(delay==null?1.2:delay)*1000)}
  function runHint(){
    if(!live||cur>=0||reduced())return;
    var tl=hintTl=G.timeline({onComplete:function(){hintTl=null;hintLoops++;hintTimer=setTimeout(function(){startHint(0)},4200)}});
    tl.set(curEl,{x:lay.Wd*.5,y:lay.Hd*1.02,opacity:0,scale:1}).to(curEl,{opacity:1,duration:.3,ease:'power2.out'});
    its.slice(0,Math.min(its.length,3)).forEach(function(w){
      var t=ctr($('.pit-open',w.el));
      tl.to(curEl,{x:t.x+4,y:t.y,duration:.85,ease:'power3.inOut'})
        .add(function(){w.el.classList.add('is-hint')},'<.6')
        .to(curEl,{scale:.82,duration:.1,ease:'power2.in'},'+=.25').fromTo(ripEl,{scale:.2,opacity:.7},{scale:1.7,opacity:0,duration:.55,ease:'power2.out'},'<')
        .to(curEl,{scale:1,duration:.4,ease:'elastic.out(1,.5)'})
        .add(function(){w.el.classList.remove('is-hint')},'+=.2')});
    tl.to(curEl,{opacity:0,duration:.35,ease:'power2.in'},'+=.1')}
  root.addEventListener('pointerdown',function(){stopHint(true)});
  root.addEventListener('pointermove',function(e){if(e.pointerType==='mouse')stopHint(true)});

  /* ---------------------------------------------------------------- per frame */
  function setLive(v){v=!!v;if(v===live)return;live=v;root.classList.toggle('is-live',v);
    if(!v&&cur>=0)closeNow();
    its.forEach(function(w){$('.pit-open',w.el).tabIndex=v?0:-1});
    if(v)startHint(1.4);else stopHint(false)}
  /* map the flat shelf onto the pixel object's quad: y-shear lets the diary page (seen from a little above) match exactly */
  function affine(Rq,F,f,round){
    var w=gm(Rq.w,F.w,f),h=gm(Rq.h,F.h,f),shy=lerp(Rq.shy||0,0,f),ccx=lerp(Rq.x+Rq.w/2,F.cx,f),ccy=lerp(Rq.y+Rq.h/2+(Rq.shy||0)/2,F.cy,f),
        a=w/F.w,d=h/F.h,b=shy/F.w,e=ccx-w/2,g=ccy-h/2-shy/2;
    if(round){e=Math.round(e);g=Math.round(g)}
    return 'matrix('+a.toFixed(5)+','+b.toFixed(5)+',0,'+d.toFixed(5)+','+e.toFixed(2)+','+g.toFixed(2)+')'}
  function update(S,Rq){
    if(!Rq||!lay.flat)return;
    var u=clamp(S.u,0,1),lo=clamp(u/.16,0,1);
    dim.style.opacity=(clamp(S.dim,0,1)*.7).toFixed(3);dim.style.display=S.dim>.004?'block':'none';
    if(lo<=.003){shelf.style.visibility='hidden'}
    else{shelf.style.visibility='visible';shelf.style.opacity=lo.toFixed(3);shelf.style.transform=affine(Rq,lay.flat,u,u>.999)}
    var m=smooth(u*1.5);sa.style.opacity=(1-m).toFixed(3);sb.style.opacity=m.toFixed(3);
    cap.style.opacity=clamp(S.cap,0,1).toFixed(3);
    setLive(u>.995&&S.dim>.97)}

  function destroy(){document.removeEventListener('keydown',docKey);stopHint(true);if(cur>=0)closeNow();D.lock(false);
    its.forEach(function(w){w.sp.stop();if(w.tl)w.tl.kill()});if(root.parentNode)root.parentNode.removeChild(root)}

  return {root:root,items:its.map(function(w){return w.el}),layout:layout,update:update,setLive:setLive,destroy:destroy,isOpen:function(){return cur>=0}};
}

/* ====================================================================== scroll sequence
   Hero text lets go, the camera pushes into the pixel diary / camera, the glass of it spreads into the shelf, and the items arrive
   one after another. Scrubbed by scroll, so it reverses cleanly. */
function mountSeq(scope,kind,D){
  var seq=D.$('#pseq',scope);if(!seq||!G||!D.ST||D.rm||!window.Stage||!window.PX||!A)return null;
  var sk=kind==='writings'?'diary':'camera',hin=D.$('.hero-in',seq),scrim=D.$('.seq-scrim',seq),mc=null,rt=0,dims=[innerWidth,innerHeight],ov=null,dead=false;
  if(!Stage.parkBegin())return null;
  ov=mount(seq,D,kind);if(!ov)return null;

  function build(){
    var vw=innerWidth,vh=innerHeight,narrow=vw<860||vh>vw,hdrEl=document.getElementById('hdr');
    seq.classList.add('seq-live');seq.classList.toggle('seq-narrow',narrow);
    ov.layout(vw,vh,narrow,(hdrEl&&hdrEl.offsetHeight)||72);
    Stage.seqLive(true);
    var S={z:0,dim:0,u:0,cap:0},TT=54,L=Math.round(vh*7*TT/112);
    G.set(hin,{autoAlpha:1,y:0});G.set(scrim,{opacity:1});
    function sync(){Stage.parkApply(S.z,sk);ov.update(S,Stage.parkRects(sk))}
    mc=G.context(function(){
      var tl=G.timeline({defaults:{ease:'none'},onUpdate:sync,
        scrollTrigger:{trigger:seq,start:'top top',end:'+='+L,pin:true,scrub:.6,anticipatePin:1,invalidateOnRefresh:true}});
      /* 1. the text lets go and the camera pushes into the diary / camera */
      tl.to(hin,{autoAlpha:0,y:-48,duration:8,ease:'power2.in'},0)
        .to(scrim,{opacity:0,duration:10},0)
        .to(S,{z:1,duration:16,ease:'power2.inOut'},0)
        .to(S,{dim:1,duration:12},8)
      /* 2. its page / body spreads into the shelf */
        .to(S,{u:1,duration:14,ease:'power2.inOut'},12);
      /* 3. one diary / camera after another settles on the shelf */
      ov.items.forEach(function(el,i){tl.fromTo(el,{autoAlpha:0,y:34,scale:.92},{autoAlpha:1,y:0,scale:1,duration:5,ease:'power3.out'},27+i*2.5)});
      tl.to(S,{cap:1,duration:4},27+ov.items.length*2.5+4).to({},{duration:10},41+ov.items.length*2.5);
    },seq);
    sync()}
  function teardown(){if(mc){try{mc.revert()}catch(e){}mc=null}}
  function rebuild(){var y=scrollY;teardown();build();window.scrollTo(0,y);D.ST.refresh()}
  function onR(){clearTimeout(rt);rt=setTimeout(function(){var w=innerWidth,h=innerHeight;if(dead||(w===dims[0]&&Math.abs(h-dims[1])<130))return;dims=[w,h];rebuild()},260)}
  build();window.addEventListener('resize',onR);

  return {destroy:function(){dead=true;clearTimeout(rt);window.removeEventListener('resize',onR);teardown();if(ov)ov.destroy();seq.classList.remove('seq-live');Stage.seqLive(false);Stage.parkEnd()}};
}

window.Personal={mountSeq:mountSeq};
})();
