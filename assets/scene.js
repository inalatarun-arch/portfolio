(function(){
/* Tarun Inala – pixel scenes.
   Two hand-built animated pixel-art scenes (office = Work, park = Personal) drawn in code on small
   canvases and scaled up with crisp, whole-number pixels. No video file: it loops forever, stays sharp
   at any screen size and costs a few KB. A Stage (below) owns the canvases, the camera and the zoom. */
'use strict';
var G=window.gsap;
var RMQ=window.matchMedia('(prefers-reduced-motion: reduce)');
var reduced=function(){return RMQ.matches||!G};

/* ---------------------------------------------------------------- palette */
var C={
  ink:'#1b1730',
  skin:'#b97a50',skinL:'#d69c6c',skinD:'#8c5836',
  hair:'#16110f',hairL:'#43372f',
  tee:'#5d86b9',teeL:'#85abd8',teeD:'#42659a',
  pant:'#2e3753',pantL:'#414d74',pantD:'#222941',
  shoe:'#f0eadf',shoeD:'#b9b2a3',sole:'#6c665b',
  wall:'#ecdcc2',wallD:'#dfcba9',wallDD:'#cdb592',base:'#f6eee0',
  floor:'#b5794c',floorD:'#9b6540',floorL:'#c58a5a',
  wood:'#cf9560',woodD:'#a06c42',woodDD:'#7d5232',woodL:'#e2ad78',
  steel:'#d3d8e0',steelD:'#9aa2b0',steelDD:'#6c7482',
  navy:'#12203b',code1:'#7ee3a4',code2:'#ffb45a',code3:'#8fb8ff',code4:'#ff7f93',
  orange:'#d5360c',orangeL:'#ee6a2c',rug:'#d8641f',rugD:'#b34d14',cream:'#f4ead6',
  leaf:'#2f8a45',leafD:'#1f6636',leafL:'#58b45e',pot:'#c4673a',potD:'#9a4b27',
  chair:'#2c3140',chairL:'#454b5f'
};

/* --------------------------------------------------------------- helpers */
function mk(w,h,rf){var c=document.createElement('canvas');c.width=Math.max(1,w|0);c.height=Math.max(1,h|0);var x=c.getContext('2d',{willReadFrequently:!!rf});x.imageSmoothingEnabled=false;return {c:c,x:x,w:c.width,h:c.height}}
function R(x,X,Y,w,h,col){if(w<=0||h<=0)return;x.fillStyle=col;x.fillRect(Math.round(X),Math.round(Y),Math.round(w),Math.round(h))}
function P1(x,X,Y,col){x.fillStyle=col;x.fillRect(Math.round(X),Math.round(Y),1,1)}
function LN(x,x0,y0,x1,y1,t,col){var n=Math.max(Math.abs(x1-x0),Math.abs(y1-y0),1),o=Math.floor((t-1)/2),i;x.fillStyle=col;
  for(i=0;i<=n;i++)x.fillRect(Math.round(x0+(x1-x0)*i/n)-o,Math.round(y0+(y1-y0)*i/n)-o,t,t)}
function rng(seed){var s=seed>>>0;return function(){s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296}}
function lerp(a,b,t){return a+(b-a)*t}
function clamp(v,a,b){return v<a?a:(v>b?b:v)}
function hex(h){return [parseInt(h.substr(1,2),16),parseInt(h.substr(3,2),16),parseInt(h.substr(5,2),16)]}
var BAY=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
function bay(x,y){return (BAY[((y&3)<<2)|(x&3)]+.5)/16}
function mix3(a,b,t){return [Math.round(lerp(a[0],b[0],t)),Math.round(lerp(a[1],b[1],t)),Math.round(lerp(a[2],b[2],t))]}
function ramp(stops,t){var i=0;while(i<stops.length-2&&t>stops[i+1][0])i++;var a=stops[i],b=stops[i+1];return mix3(a[1],b[1],clamp((t-a[0])/(b[0]-a[0]),0,1))}

/* string-map sprite -> canvas */
function sprite(rows,map){var h=rows.length,w=rows[0].length,o=mk(w,h),x=o.x,i,j,ch;
  for(j=0;j<h;j++)for(i=0;i<w;i++){ch=rows[j].charAt(i);if(ch!=='.'&&map[ch])P1(x,i,j,map[ch])}
  return o.c}
function blit(x,img,X,Y,flip){X=Math.round(X);Y=Math.round(Y);
  if(!flip){x.drawImage(img,X,Y);return}
  x.save();x.translate(X+img.width,Y);x.scale(-1,1);x.drawImage(img,0,0);x.restore()}

/* 1px outline round everything opaque (the classic pixel-art silhouette line) */
function outline(o,col){var w=o.w,h=o.h,id=o.x.getImageData(0,0,w,h),d=id.data,s=new Uint8ClampedArray(d),k=hex(col),i,j,p;
  for(j=0;j<h;j++)for(i=0;i<w;i++){p=(j*w+i)*4;if(s[p+3]>0)continue;
    if((i>0&&s[p-4+3]>0)||(i<w-1&&s[p+4+3]>0)||(j>0&&s[p-w*4+3]>0)||(j<h-1&&s[p+w*4+3]>0)){d[p]=k[0];d[p+1]=k[1];d[p+2]=k[2];d[p+3]=255}}
  o.x.putImageData(id,0,0)}

/* dithered darkening toward the edges, baked once */
function vignette(o,strength){var w=o.w,h=o.h,id=o.x.getImageData(0,0,w,h),d=id.data,i,j,p,e,dx,dy;
  for(j=0;j<h;j++)for(i=0;i<w;i++){dx=(i/(w-1))*2-1;dy=(j/(h-1))*2-1;e=Math.pow(Math.max(Math.abs(dx),Math.abs(dy)*.9),4)*strength;
    if(bay(i,j)<e){p=(j*w+i)*4;if(d[p+3]){d[p]=d[p]*.84|0;d[p+1]=d[p+1]*.84|0;d[p+2]=d[p+2]*.88|0}}}
  o.x.putImageData(id,0,0)}

/* --------------------------------------------------------------- backdrops */
/* banded, Bayer-dithered sky */
function skyCanvas(w,h,stops,bands){var o=mk(w,h),id=o.x.createImageData(w,h),d=id.data,i,j,p,t,b,c;
  for(j=0;j<h;j++){t=j/Math.max(1,h-1);for(i=0;i<w;i++){b=Math.floor(t*bands+bay(i,j)-.5);b=clamp(b,0,bands-1);c=ramp(stops,b/(bands-1));p=(j*w+i)*4;d[p]=c[0];d[p+1]=c[1];d[p+2]=c[2];d[p+3]=255}}
  o.x.putImageData(id,0,0);return o}

/* flat-bottomed, top-lit pixel cloud */
function cloudSprite(w,h,seed){var o=mk(w,h),id=o.x.createImageData(w,h),d=id.data,r=rng(seed),n=Math.max(3,Math.round(w/14)),cs=[],i,j,k,p,u,top=h,bot=Math.round(h*.8),inside,c,t;
  for(k=0;k<n;k++){var u0=n===1?.5:k/(n-1),rad=h*(.28+.3*r())*(1-Math.abs(u0-.5)*.55);cs.push([w*(.14+.72*u0)+(r()-.5)*4,bot-rad*.78,rad])}
  for(j=0;j<h;j++)for(i=0;i<w;i++){inside=false;if(j<=bot){for(k=0;k<cs.length;k++){var dx=i-cs[k][0],dy=j-cs[k][1];if(dx*dx+dy*dy<=cs[k][2]*cs[k][2]){inside=true;break}}}
    if(!inside&&j<=bot&&j>bot-3){for(k=0;k<cs.length;k++){if(Math.abs(i-cs[k][0])<cs[k][2]*.9){inside=true;break}}}
    if(inside&&j<top)top=j;
    if(inside){p=(j*w+i)*4;d[p+3]=255;d[p]=255;d[p+1]=255;d[p+2]=255}}
  for(j=0;j<h;j++)for(i=0;i<w;i++){p=(j*w+i)*4;if(!d[p+3])continue;t=(j-top)/Math.max(1,bot-top);t+=(bay(i,j)-.5)*.16;
    c=t<.4?[255,255,255]:(t<.72?[218,236,252]:[168,200,236]);d[p]=c[0];d[p+1]=c[1];d[p+2]=c[2]}
  o.x.putImageData(id,0,0);return o.c}

/* city skyline silhouette (transparent canvas, buildings sit on the bottom edge) */
function skylineCanvas(w,h,seed,col,colD,winCol,tower){var o=mk(w,h),x=o.x,r=rng(seed),bx=-2,bh,bw,i,j,cwid;
  while(bx<w){bw=5+Math.floor(r()*9);bh=Math.round(h*(.22+.55*r()));
    R(x,bx,h-bh,bw,bh,col);R(x,bx+bw-1,h-bh,1,bh,colD);if(r()<.4)R(x,bx+1,h-bh-2,2,2,col);
    for(j=h-bh+2;j<h-1;j+=3)for(i=bx+1;i<bx+bw-2;i+=2)if(r()<.22)P1(x,i,j,winCol);
    bx+=bw+(r()<.3?1:0)}
  if(tower!=null){var tx=Math.round(tower*w),th=Math.round(h*1.05);
    R(x,tx,h-th,2,th,col);R(x,tx-2,h-th+Math.round(th*.28),6,4,colD);R(x,tx-1,h-th+Math.round(th*.28)+1,4,1,winCol);R(x,tx,h-th-5,1,5,colD);P1(x,tx,h-th-6,winCol)}
  return o}

/* ------------------------------------------------------------------ person */
/* head, side view facing right, 16x18.  h hair, g hair light, s skin, l skin light, d skin dark,
   m moustache/goatee, b brow, a ear.  Eyes are drawn separately so they can blink. */
var HEADRUNS=[
 [['h',6,10]],
 [['h',4,12],['g',6,8]],
 [['h',3,14],['g',5,9]],
 [['h',2,16],['g',5,9]],
 [['h',1,17],['g',5,8]],
 [['h',1,18],['g',6,7]],
 [['h',1,18]],
 [['h',1,12],['l',13,14],['s',15,17]],
 [['h',1,11],['s',12,12],['b',13,17]],
 [['h',1,10],['s',11,18]],
 [['h',1,7],['a',8,9],['s',10,18]],
 [['h',1,7],['a',8,9],['s',10,19]],
 [['h',2,7],['a',8,9],['s',10,14],['m',15,18]],
 [['h',3,7],['d',8,9],['s',10,12],['m',13,18]],
 [['h',4,7],['d',8,10],['s',11,12],['m',13,14],['t',15,16],['m',17,17]],
 [['h',5,7],['d',9,12],['m',12,12],['m',13,17]],
 [['d',10,12],['m',13,17]],
 [['d',11,13],['m',14,16]]];
var HEADMAP={h:C.hair,g:C.hairL,s:C.skin,l:C.skinL,d:C.skinD,m:'#b97a50',b:'#17110e',a:'#a46c46',t:'#8a4a3a'};
var HEADSPR=null;
function headSprite(){if(HEADSPR)return HEADSPR;var w=20,h=HEADRUNS.length,o=mk(w,h),r,k,i,run;
  for(r=0;r<h;r++)for(k=0;k<HEADRUNS[r].length;k++){run=HEADRUNS[r][k];for(i=run[1];i<=run[2];i++)P1(o.x,i,r,HEADMAP[run[0]])}
  return HEADSPR=o.c}

function ik(sx,sy,tx,ty,l1,l2,dir){var dx=tx-sx,dy=ty-sy,d=Math.sqrt(dx*dx+dy*dy)||.001,a=Math.atan2(dy,dx),reach=l1+l2-.5;
  if(d>reach){tx=sx+Math.cos(a)*reach;ty=sy+Math.sin(a)*reach;d=reach}
  var ca=clamp((l1*l1+d*d-l2*l2)/(2*l1*d),-1,1),ang=Math.acos(ca),ea=a+dir*ang;
  return {ex:sx+Math.cos(ea)*l1,ey:sy+Math.sin(ea)*l1,hx:tx,hy:ty}}

function newPerson(){var o=mk(110,100,true);o.hx=46;o.hy=58;return o}

/* One arm: tee-coloured upper arm, skin forearm and hand */
function drawArm(x,sx,sy,tx,ty,far,dir){var j=ik(sx,sy,tx,ty,11,11,dir||1),up=far?C.teeD:C.tee,fo=far?C.skinD:C.skin,hd=far?C.skinD:C.skinL;
  LN(x,sx,sy,j.ex,j.ey,4,up);
  LN(x,j.ex,j.ey,j.hx,j.hy,3,fo);
  R(x,j.hx-1,j.hy-1,3,3,hd);return j}

/* pose: {lean, head:{dx,dy}, blink, legs:{kx,ky,ax,ay,foot:'hang'|'flat'}, nh:{x,y}, fh:{x,y}, dir, cam:{x,y}|null, strap:{x,y}} (all relative to the hip) */
function drawPerson(o,pose){
  var x=o.x,hx=o.hx,hy=o.hy,lean=pose.lean||0,sx=hx+3+lean,sy=hy-26,lg=pose.legs,r,c,xb,xf,t,j,hd=pose.head||{dx:0,dy:0};
  x.clearRect(0,0,o.w,o.h);
  /* far leg + far shoe */
  LN(x,hx+1,hy-1,hx+lg.kx+2,hy+lg.ky-1,7,C.pantD);LN(x,hx+lg.kx+2,hy+lg.ky-1,hx+lg.ax+2,hy+lg.ay-1,5,C.pantD);
  shoe(x,hx+lg.ax+2,hy+lg.ay-1,lg.foot,true);
  /* far arm */
  drawArm(x,sx+1,sy+5,hx+pose.fh.x,hy+pose.fh.y,true,pose.dir);
  /* near leg */
  LN(x,hx-1,hy-1,hx+lg.kx,hy+lg.ky,8,C.pant);LN(x,hx+lg.kx,hy+lg.ky,hx+lg.ax,hy+lg.ay,6,C.pant);
  LN(x,hx-1,hy-4,hx+lg.kx,hy+lg.ky-3,2,C.pantL);
  shoe(x,hx+lg.ax,hy+lg.ay,lg.foot,false);
  /* torso (tee) */
  for(r=0;r<=26;r++){t=r/26;c=sx+(hx-sx)*t;xb=Math.round(c-(r<2?4:6));xf=Math.round(c+(r<2?3:(r<4?5:6)));
    R(x,xb,sy+r,xf-xb+1,1,C.tee);R(x,xb,sy+r,2,1,C.teeD);if(r>1&&r<9)R(x,xf-1,sy+r,2,1,C.teeL);if(r>=24)R(x,xb,sy+r,xf-xb+1,1,C.teeD)}
  R(x,sx-3,sy,6,1,C.teeL);
  /* camera hanging on a strap sits on the chest, under the arms */
  if(pose.strap){LN(x,sx+1,sy-1,pose.strap.x+hx+1,pose.strap.y+hy-4,1,'#2a2a34');camera(x,hx+pose.strap.x,hy+pose.strap.y)}
  /* near arm */
  var nj=drawArm(x,sx+2,sy+5,hx+pose.nh.x,hy+pose.nh.y,false,pose.dir);
  /* head: neck first, then the head sprite (neck sits under the jaw, x 10..13 of the sprite) */
  var hxp=sx+1-11+hd.dx,hyp=sy-4-17+hd.dy;
  R(x,hxp+10,hyp+15,4,sy+3-(hyp+15),C.skinD);R(x,hxp+12,hyp+15,2,sy+3-(hyp+15),C.skin);
  x.drawImage(headSprite(),hxp,hyp);
  var ex=hxp+15,ey=hyp+9;
  if(pose.blink){P1(x,ex,ey+1,'#2a1a12')}else{R(x,ex,ey,1,2,'#120c09');P1(x,ex-1,ey,C.skinL)}
  /* camera hanging on a strap */
  if(pose.cam){camera(x,hxp+pose.cam.x,hyp+pose.cam.y)}
  return {head:{x:hxp,y:hyp},sh:{x:sx,y:sy},nj:nj}}

function shoe(x,X,Y,kind,far){var w=far?C.shoeD:C.shoe;
  if(kind==='hang'){R(x,X-2,Y-1,10,5,w);R(x,X-2,Y+3,10,2,far?C.sole:C.sole);R(x,X+6,Y-1,2,2,far?C.shoeD:'#fff')}
  else{R(x,X-1,Y-4,5,9,w);R(x,X-1,Y+4,5,2,C.sole);R(x,X,Y-3,2,3,far?C.shoeD:'#fff')}}

function camera(x,X,Y){R(x,X-5,Y-3,11,7,'#272733');R(x,X-5,Y-3,11,1,'#4c4c5e');R(x,X-3,Y-5,4,2,'#272733');R(x,X-6,Y-1,2,5,'#17171f');
  R(x,X+5,Y-2,4,5,'#3d3f4d');R(x,X+8,Y-1,2,3,'#74b6f0');P1(x,X+8,Y-1,'#d9f0ff');P1(x,X+1,Y-2,'#e8e8f0')}

/* ===================================================================== OFFICE (Work) */
function ell(x,cx,cy,rx,ry,col){var i,j;x.fillStyle=col;for(j=-ry;j<=ry;j++){var w=Math.round(rx*Math.sqrt(Math.max(0,1-(j*j)/(ry*ry+.01))));x.fillRect(Math.round(cx-w),Math.round(cy+j),w*2+1,1)}}

function buildOffice(W,H){
  var ox=Math.floor(W/2),oy=Math.floor(H/2)+8,FLR=14,FEET=26,top=-oy,left=-ox,right=W-ox,bottom=H-oy,i,j,k,r=rng(7);
  var bg=mk(W,H),x=bg.x;x.translate(ox,oy);
  /* wall, panels, wainscot, skirting */
  R(x,left,top,W,FLR-top,C.wall);
  for(i=Math.ceil(left/22)*22;i<right;i+=22)R(x,i,top,1,FLR-top,C.wallD);
  R(x,left,-20,W,34,C.wallD);R(x,left,-21,W,1,C.wallDD);R(x,left,-20,W,1,C.base);
  for(i=Math.ceil(left/22)*22+11;i<right;i+=22)R(x,i,-18,1,30,C.wallDD);
  R(x,left,FLR-5,W,5,C.base);R(x,left,FLR-5,W,1,C.cream);R(x,left,FLR-1,W,1,C.wallDD);
  /* floor: planks */
  R(x,left,FLR,W,bottom-FLR,C.floor);
  for(j=FLR,k=0;j<bottom;j+=6,k++){R(x,left,j,W,1,k?C.floorD:C.wallDD);R(x,left,j+1,W,1,C.floorL);
    for(i=left-((k*17)%41);i<right;i+=41)R(x,i,j+1,1,5,C.floorD)}
  /* rug */
  R(x,-84,FLR+6,156,24,C.rugD);R(x,-83,FLR+7,154,22,C.rug);R(x,-80,FLR+10,148,16,C.rugD);R(x,-79,FLR+11,146,14,C.rug);
  for(i=-77;i<66;i+=8)R(x,i,FLR+13,3,10,C.cream);
  /* window: frame, then punch the glass out so live sky shows through */
  R(x,-67,-101,94,74,C.base);R(x,-67,-101,94,1,C.cream);R(x,-67,-28,94,1,C.wallDD);R(x,26,-101,1,74,C.wallDD);
  x.clearRect(-62,-96,84,64);
  R(x,-45,-96,3,64,C.base);R(x,3,-96,3,64,C.base);R(x,-62,-78,84,3,C.base);
  R(x,-62,-96,84,1,C.wallDD);R(x,-62,-96,1,64,C.wallDD);
  R(x,-70,-28,100,4,C.base);R(x,-70,-24,100,1,C.wallDD);R(x,-70,-28,100,1,C.cream);
  /* bookshelf (right) */
  var bs=54,bw=38,bt=-86;
  R(x,bs,bt,bw,102,C.woodDD);R(x,bs+2,bt+2,bw-4,98,'#4f3322');
  for(k=0;k<4;k++){var sy=bt+2+k*25,bx=bs+3,cols=['#d5360c','#5d86b9','#e9b44c','#3e8e5a','#f0e6d2','#8a5aa8','#2e3753'];
    R(x,bs,sy+23,bw,3,C.wood);R(x,bs,sy+23,bw,1,C.woodL);
    while(bx<bs+bw-6){var bwid=2+Math.floor(r()*3),bh=13+Math.floor(r()*9);
      if(k===3&&bx>bs+22){break}
      R(x,bx,sy+23-bh,bwid,bh,cols[Math.floor(r()*cols.length)]);R(x,bx,sy+23-bh,1,bh,'rgba(255,255,255,.25)');bx+=bwid+(r()<.2?2:0)}}
  /* tiny plant on shelf + frame */
  R(x,bs+24,bt+2+3*25+12,6,8,C.pot);ell(x,bs+27,bt+2+3*25+8,5,4,C.leaf);ell(x,bs+26,bt+2+3*25+6,2,2,C.leafL);
  /* wall clock */
  ell(x,38,-84,9,9,C.woodDD);ell(x,38,-84,8,8,C.cream);for(k=0;k<12;k++){var a=k*Math.PI/6;P1(x,38+Math.round(Math.sin(a)*6.5),-84-Math.round(Math.cos(a)*6.5),k%3?C.steelD:C.ink)}
  /* wall art (wide screens) */
  R(x,-118,-84,26,34,C.woodDD);R(x,-116,-82,22,30,C.cream);R(x,-116,-62,22,10,'#8fb8ff');
  for(i=0;i<22;i++)R(x,-116+i,-62-Math.round(6*Math.abs(Math.sin(i*.4))),1,Math.round(6*Math.abs(Math.sin(i*.4)))+10,i%2?'#3e8e5a':'#2f7a4b');ell(x,-100,-74,3,3,C.orangeL);
  /* big plant (left) */
  var px0=-88,py0=FEET;
  R(x,px0-8,py0-14,16,14,C.pot);R(x,px0-9,py0-16,18,3,C.potD);R(x,px0-8,py0-14,3,14,C.potD);R(x,px0-8,py0-2,16,2,C.potD);
  for(k=0;k<9;k++){var ax=px0+(r()-.5)*20,ay=py0-26-r()*34;LN(x,px0,py0-16,ax,ay,1,C.leafD);ell(x,ax,ay,5,3,k%3?C.leaf:C.leafD);ell(x,ax-1,ay-1,3,1,C.leafL)}
  /* chair (behind the person) */
  var P={x:-34,y:0};
  R(x,P.x-10,P.y-26,4,31,C.chair);R(x,P.x-10,P.y-26,1,31,C.chairL);R(x,P.x-11,P.y-28,5,3,C.chairL);
  R(x,P.x-9,P.y+4,24,3,C.chair);R(x,P.x-9,P.y+4,24,1,C.chairL);
  R(x,P.x,P.y+7,2,13,C.steelDD);R(x,P.x-9,P.y+20,20,2,C.steelDD);
  ell(x,P.x-8,FEET-2,2,2,C.chair);ell(x,P.x+9,FEET-2,2,2,C.chair);
  /* desk: top, legs, drawers */
  R(x,-26,-16,72,3,C.wood);R(x,-26,-16,72,1,C.woodL);R(x,-26,-13,72,1,C.woodDD);
  R(x,-24,-12,3,FEET+12,C.woodD);R(x,-24,-12,1,FEET+12,C.woodDD);R(x,41,-12,3,FEET+12,C.woodD);R(x,43,-12,1,FEET+12,C.woodDD);
  R(x,22,-12,19,24,C.woodD);R(x,22,-12,19,1,C.woodDD);R(x,24,-8,15,9,C.wood);R(x,24,-8,15,1,C.woodL);R(x,29,-4,5,2,C.steelD);R(x,24,3,15,7,C.wood);R(x,29,6,5,2,C.steelD);
  /* laptop: base + frame (screen content is live) */
  R(x,-20,-18,22,2,C.steel);R(x,-20,-18,22,1,'#eef1f6');R(x,-20,-16,22,1,C.steelDD);
  /* mug */
  R(x,25,-22,6,6,C.cream);R(x,25,-22,1,6,'#fff');R(x,31,-21,2,3,C.cream);R(x,25,-22,6,1,C.orangeL);
  /* lamp */
  R(x,35,-18,8,2,C.chair);LN(x,39,-18,39,-34,1,C.chair);LN(x,39,-34,31,-41,1,C.chair);R(x,26,-46,12,4,C.orange);R(x,26,-46,12,1,C.orangeL);R(x,28,-42,8,1,'#fff3c4');
  /* small notebook + pen on desk */
  R(x,2,-18,8,2,C.cream);R(x,2,-17,8,1,C.wallDD);R(x,10,-18,3,1,C.orange);
  /* phone propped on the desk, screen towards the room (6x11 body, 4x9 glass). The contact scroll scene zooms into it. */
  R(x,17,-27,6,11,'#262a36');R(x,17,-27,6,1,'#555b6e');R(x,17,-27,1,11,'#3b4152');R(x,22,-27,1,11,'#1a1d27');
  R(x,18,-26,4,9,C.navy);R(x,18,-26,4,1,'#2b4c8c');R(x,18,-23,3,1,'#3d5fa8');R(x,18,-21,2,1,'#3d5fa8');R(x,18,-19,3,1,'#3d5fa8');
  R(x,17,-16,6,1,'rgba(18,10,4,.28)');
  vignette(bg,.6);

  /* live window content */
  var winSky=skyCanvas(84,64,[[0,[40,108,214]],[.5,[96,168,238]],[1,[196,228,248]]],6);
  var cityFar=skylineCanvas(84,26,11,'#8fb2d8','#7fa3cc','#d9ecff',.3),cityNear=skylineCanvas(84,20,23,'#4f7aa8','#436b96','#cfe6ff',null);
  var clouds=[{img:cloudSprite(34,15,3),x:6,y:6,v:2.2},{img:cloudSprite(26,12,9),x:50,y:22,v:1.5},{img:cloudSprite(40,16,14),x:90,y:2,v:1.1},{img:cloudSprite(22,10,5),x:130,y:20,v:3}];
  var person=newPerson(),dust=[];for(i=0;i<16;i++)dust.push({x:-60+r()*100,y:-60+r()*90,s:.5+r()*1.5,p:r()*6});

  function screen(ctx,t){
    var top0=-35,bot0=-19,tick=Math.floor(t*3),i,y,t0,xl,xr;
    for(y=top0;y<=bot0;y++){t0=(y-top0)/(bot0-top0);xl=Math.round(lerp(3,-3,t0));xr=Math.round(lerp(17,11,t0));
      R(ctx,xl,y,xr-xl+1,1,y===top0||y===bot0?C.steelDD:C.navy);P1(ctx,xl,y,C.steelDD);P1(ctx,xr,y,C.steelDD)}
    var rr=rng(tick*0+99);
    for(i=0;i<7;i++){y=top0+2+i*2;t0=(y-top0)/(bot0-top0);xl=Math.round(lerp(3,-3,t0))+2;
      var seed=(i+tick*1)%9,rl=rng(seed*7+3),len=3+Math.floor(rl()*8),ind=(seed%3)*2,col=[C.code1,C.code2,C.code3,C.code4][seed%4];
      R(ctx,xl+ind,y,Math.min(len,Math.round(lerp(17,11,t0))-xl-ind-2),1,col);if(rl()<.5)R(ctx,xl+ind+len+1,y,2,1,C.code3)}
    if(Math.floor(t*2)%2===0)R(ctx,Math.round(lerp(3,-3,.9))+3,top0+14,2,1,'#fff')}

  return {W:W,H:H,
    draw:function(ctx,t,fast){
      ctx.save();ctx.translate(ox,oy);
      ctx.drawImage(winSky.c,-62,-96);
      for(i=0;i<clouds.length;i++){var c=clouds[i],span=84+c.img.width+20,px=((c.x+t*c.v)%span+span)%span-c.img.width;ctx.drawImage(c.img,-62+Math.round(px),-96+c.y)}
      ctx.drawImage(cityFar.c,-62,-96+64-26);ctx.drawImage(cityNear.c,-62,-96+64-20);
      ctx.restore();
      ctx.drawImage(bg.c,0,0);
      ctx.save();ctx.translate(ox,oy);
      screen(ctx,t);
      /* phone: a notification dot that blinks, and a faint glow on the desk */
      if(Math.floor(t*1.4)%2===0)R(ctx,21,-25,1,1,C.orangeL);
      ctx.fillStyle='rgba(150,190,255,'+(.10+.05*Math.sin(t*1.4)).toFixed(3)+')';ctx.fillRect(16,-16,8,1);
      /* clock hands */
      var sa=t*Math.PI/30,ma=t*Math.PI/1800+1.2;LN(ctx,38,-84,38+Math.round(Math.sin(ma)*5),-84-Math.round(Math.cos(ma)*5),1,C.ink);LN(ctx,38,-84,38+Math.round(Math.sin(sa)*6),-84-Math.round(Math.cos(sa)*6),1,C.orange);
      /* steam */
      for(i=0;i<3;i++){var sp=((t*.7+i*.37)%1),sy=-24-sp*14,sx=28+Math.round(Math.sin(t*2+i*2)*1.4)+i-1;ctx.fillStyle='rgba(255,255,255,'+(.7*(1-sp)).toFixed(2)+')';ctx.fillRect(Math.round(sx),Math.round(sy),1,2)}
      /* person */
      var typing=Math.sin(t*.8)>-.55,f=t*11,nodd=Math.sin(t*1.1)>.62?1:0,blink=(t%3.6)<.13;
      var ph=typing?1:0;
      drawPerson(person,{lean:Math.sin(t*.9)>.5?1:0,head:{dx:0,dy:nodd},blink:blink,dir:1,
        legs:{kx:21,ky:0,ax:23,ay:22,foot:'hang'},
        nh:{x:21+(typing?Math.round(Math.sin(f)*1.3):0),y:-19-(typing&&Math.sin(f*1.7)>.2?1:0)},
        fh:{x:25+(typing?Math.round(Math.sin(f+2.4)*1.3):0),y:-19-(typing&&Math.sin(f*1.7+1.6)>.2?1:0)}});
      outline(person,C.ink);
      ctx.drawImage(person.c,P_OFFICE.x-person.hx,P_OFFICE.y-person.hy);
      /* lamp glow + light shafts */
      var a1=.075+.02*Math.sin(t*.6);
      ctx.fillStyle='rgba(255,236,170,'+a1.toFixed(3)+')';
      for(j2=-30;j2<FEET+12;j2++){var o2=(j2+30)*.62;ctx.fillRect(-52+Math.round(o2),j2,13,1);ctx.fillRect(-26+Math.round(o2),j2,7,1)}
      for(i=0;i<dust.length;i++){var d=dust[i],dx=Math.round(d.x+Math.sin(t*.4*d.s+d.p)*5+t*d.s*.8)%110-40,dy=Math.round(d.y+Math.cos(t*.3*d.s+d.p)*4);
        ctx.fillStyle='rgba(255,255,240,'+(.35+.35*Math.sin(t*2*d.s+d.p)).toFixed(2)+')';ctx.fillRect(dx,dy,1,1)}
      ctx.restore();
    }};
}
var j2=0,P_OFFICE={x:-34,y:0};

/* ===================================================================== PARK (Personal) */
function ease(t){t=clamp(t,0,1);return t*t*(3-2*t)}

function canopyLayer(w,h,seed,circles,pal){
  var o=mk(w,h),x=o.x,id=x.createImageData(w,h),d=id.data,k,i,j,p,c,t,n=circles.length,own=new Int16Array(w*h).fill(-1),tt=new Float32Array(w*h);
  for(k=0;k<n;k++){var cc=circles[k],cx=cc[0],cy=cc[1],r=cc[2];
    for(j=Math.max(0,Math.floor(cy-r));j<=Math.min(h-1,Math.ceil(cy+r));j++)for(i=Math.max(0,Math.floor(cx-r));i<=Math.min(w-1,Math.ceil(cx+r));i++){
      var dx=i-cx,dy=j-cy;if(dx*dx+dy*dy>r*r)continue;
      own[j*w+i]=k;tt[j*w+i]=(-dx*.5-dy*.75)/r}}
  for(j=0;j<h;j++)for(i=0;i<w;i++){k=own[j*w+i];if(k<0)continue;
    t=tt[j*w+i]+(bay(i,j)-.5)*.3;
    /* dark bottom rim of each clump */
    if(own[Math.min(h-1,j+1)*w+i]!==k&&tt[j*w+i]<.1)t-=.5;
    c=t>.42?pal[0]:(t>-.05?pal[1]:(t>-.5?pal[2]:pal[3]));
    p=(j*w+i)*4;d[p]=c[0];d[p+1]=c[1];d[p+2]=c[2];d[p+3]=255}
  x.putImageData(id,0,0);return o.c}

function buildPark(W,H){
  var ox=Math.floor(W/2),oy=Math.floor(H/2)+8,HOR=-8,top=-oy,left=-ox,right=W-ox,bottom=H-oy,i,j,k,r=rng(21);
  var HX=-4;   /* world x of the hip */
  /* --- sky + clouds (live) */
  var sky=skyCanvas(W,oy+HOR+2,[[0,[44,120,222]],[.5,[104,178,240]],[1,[206,234,250]]],7);
  var clouds=[{img:cloudSprite(60,24,31),x:110,y:top+18,v:2.4},{img:cloudSprite(44,18,12),x:230,y:top+46,v:1.6},{img:cloudSprite(76,28,5),x:20,y:top+8,v:1.1},{img:cloudSprite(36,15,44),x:330,y:top+60,v:3.1}];
  /* --- far layer: skyline + two hills */
  var far=mk(W,H),fx=far.x;fx.translate(ox,oy);
  var sk1=skylineCanvas(W,30,5,'#9dbbdd','#8aa9d0','#e2f0ff',.78),sk2=skylineCanvas(W,20,17,'#7da3cb','#6c92bd','#d4e8ff',null);
  fx.drawImage(sk1.c,left,HOR-26);fx.drawImage(sk2.c,left,HOR-14);
  function hill(base,amp,f1,f2,ph,col,colL,bandPx){var xx,hh,yy;for(xx=left;xx<right;xx++){hh=base-amp*(.55+.45*Math.sin(xx*f1+ph))-amp*.35*Math.sin(xx*f2+ph*2);
    for(yy=Math.round(hh);yy<=HOR+2;yy++){P1(fx,xx,yy,(yy-Math.round(hh)<bandPx&&bay(xx,yy)<.5)?colL:col)}}}
  hill(HOR-9,9,.021,.07,1.1,'#7fb48f','#97c8a2',3);
  hill(HOR-1,6,.034,.09,.3,'#5faa57','#7cc468',3);
  /* --- ground (static) */
  var gr=mk(W,H),g=gr.x;g.translate(ox,oy);
  var gp=[[121,194,86],[98,176,74],[78,155,68],[60,133,62]],id,d;
  for(j=HOR;j<bottom;j++){var t=(j-HOR)/(bottom-HOR);for(i=left;i<right;i++){var b=clamp(Math.floor(t*3.4+bay(i+ox,j+oy)-.5),0,3),c=gp[b];g.fillStyle='rgb('+c[0]+','+c[1]+','+c[2]+')';g.fillRect(i,j,1,1)}}
  /* path: a winding stone path into the distance */
  function pcx(y){var u=(y-HOR)/(bottom-HOR);return lerp(-100,-58,u)+Math.sin(u*3.4)*8}
  function phw(y){var u=(y-HOR)/(bottom-HOR);return lerp(5,22,u)}
  for(j=HOR+1;j<bottom;j++){var cxp=pcx(j),hw=phw(j);for(i=Math.round(cxp-hw);i<=Math.round(cxp+hw);i++){var edge=(i-Math.round(cxp-hw)<2||Math.round(cxp+hw)-i<2);
      P1(g,i,j,edge?'#c9a878':(bay(i+ox,j+oy)<.25?'#e6cfa0':'#ecd9b0'))}
    if(j%7===0){R(g,Math.round(cxp-hw*.5),j,3,1,'#d7bd8c');R(g,Math.round(cxp+hw*.2),j+3,3,1,'#d7bd8c')}}
  /* grass tufts + flowers */
  var fcol=['#ff7f93','#ffd25a','#ffffff','#ff9a4a','#b79cff'];
  for(k=0;k<420;k++){var gx=left+Math.floor(r()*W),gy=HOR+3+Math.floor(Math.pow(r(),.8)*(bottom-HOR-4)),dp=(gy-HOR)/(bottom-HOR);
    if(Math.abs(gx-pcx(gy))<phw(gy)+2)continue;
    if(r()<.78){P1(g,gx,gy,'#3b8540');P1(g,gx,gy-1,'#78bf5a');if(r()<.5){P1(g,gx+1,gy,'#3b8540');P1(g,gx+1,gy-1,'#78bf5a');P1(g,gx+2,gy-2,'#78bf5a')}}
    else{var fc=fcol[Math.floor(r()*fcol.length)];P1(g,gx,gy,'#2f7a40');P1(g,gx,gy-1,'#2f7a40');P1(g,gx,gy-2,fc);if(dp>.35){P1(g,gx-1,gy-2,fc);P1(g,gx+1,gy-2,fc);P1(g,gx,gy-3,fc);P1(g,gx,gy-2,'#ffe9a8')}}}
  /* shadows: tree + bench + person */
  g.fillStyle='rgba(24,70,48,.26)';
  for(j=-2;j<=3;j++){var rw=Math.round(46*Math.sqrt(1-j*j/12));g.fillRect(-98-rw,30+j,rw*2,1)}
  for(j=-2;j<=2;j++){var rw2=Math.round(24*Math.sqrt(1-j*j/8));g.fillRect(HX+8-rw2,29+j,rw2*2,1)}
  g.fillStyle='rgba(24,70,48,.16)';
  for(j=-3;j<=3;j++){var rw3=Math.round(70*Math.sqrt(1-j*j/16));g.fillRect(-96-rw3,31+j,rw3*2,1)}
  /* lamp post */
  var lx=52,ly=24;
  R(g,lx-2,ly-2,5,3,'#2a2f3b');R(g,lx-1,ly-56,3,54,'#363c4b');R(g,lx-1,ly-56,1,54,'#4c5468');
  R(g,lx-4,ly-62,9,6,'#2a2f3b');R(g,lx-3,ly-61,7,4,'#ffe9a0');R(g,lx-5,ly-64,11,2,'#2a2f3b');R(g,lx-2,ly-66,5,2,'#2a2f3b');
  /* tree trunk + branches */
  var tx=-96;
  for(j=-64;j<28;j++){var u2=(j+64)/92,wd=Math.round(lerp(4,8,u2*u2)+ (j>20?(j-20)*.5:0)),cx2=tx+Math.round(Math.sin(j*.07)*1.5);
    R(g,cx2-wd,j,wd*2,1,C.woodDD);R(g,cx2-wd+1,j,wd,1,'#8b5a36');R(g,cx2-wd+1,j,2,1,'#a8734a');
    if(j%5===0)R(g,cx2-wd+3,j,1,3,'#6a4529')}
  LN(g,tx,-40,tx-22,-58,3,C.woodDD);LN(g,tx,-30,tx+26,-52,3,C.woodDD);LN(g,tx+1,-50,tx-2,-72,3,C.woodDD);
  /* a bird house + tyre swing? keep it simple: a small hanging swing board */
  /* bench (side view): seat, slatted back, iron legs */
  var by=4,bl=HX-15,bw=32;
  var bn=mk(W,H),b=bn.x;b.translate(ox,oy);
  R(b,HX+bw/2-9,by+3,2,22,'#2a2f3b');R(b,bl+2,by+3,2,22,'#2a2f3b');R(b,bl,by+24,8,2,'#2a2f3b');R(b,HX+bw/2-11,by+24,8,2,'#2a2f3b');
  R(b,bl,by,bw,3,C.woodL);R(b,bl,by,bw,1,'#f0c590');R(b,bl,by+2,bw,1,C.woodD);for(i=bl+7;i<bl+bw;i+=8)R(b,i,by,1,3,C.woodD);
  /* backrest (leans back, behind him on the right) */
  var bx0=HX+bw/2-7;
  for(k=0;k<3;k++){var yy=by-9-k*7;LN(b,bx0+Math.round((by-yy)*.18),yy,bx0+Math.round((by-yy)*.18)+5,yy,2,k%2?C.wood:C.woodL);R(b,bx0+Math.round((by-yy)*.18),yy+2,6,1,C.woodD)}
  R(b,bx0+1,by-26,2,29,'#2a2f3b');R(b,HX+bw/2-9,by-8,10,2,'#2a2f3b');
  /* backpack leaning on the bench */
  R(b,bx0+8,by+6,10,18,'#d5360c');R(b,bx0+8,by+6,10,2,'#ee6a2c');R(b,bx0+9,by+14,8,6,'#a82a08');R(b,bx0+11,by+16,4,1,'#f0e6d2');R(b,bx0+8,by+22,10,2,'#7d1d06');R(b,bx0+16,by+8,2,14,'#a82a08');
  /* open diary on the lap (static; ink lines appear live) */
  var dy0=-5;
  vignette(far,0);
  /* canopy layers */
  var cc=[];var rr=rng(5);
  for(k=0;k<26;k++){var a=k/26*Math.PI*2;cc.push([60+Math.cos(a)*(26+rr()*8),30+Math.sin(a)*(18+rr()*8),10+rr()*8])}
  for(k=0;k<16;k++)cc.push([60+(rr()-.5)*60,30+(rr()-.5)*34,12+rr()*8]);
  cc.sort(function(a,b){return a[1]-b[1]});
  var palA=[[88,180,94],[47,138,69],[31,102,54],[20,72,40]],palB=[[120,205,104],[69,160,82],[41,120,60],[28,86,46]];
  var canBack=canopyLayer(130,80,1,cc.map(function(c){return [c[0]+4,c[1]+6,c[2]]}),[palA[1],palA[2],palA[3],[14,52,32]]);
  var canMid=canopyLayer(130,80,2,cc,palA);
  var cf=[];for(k=0;k<12;k++){var a2=k/12*Math.PI*2;cf.push([60+Math.cos(a2)*(24+rr()*6)-3,28+Math.sin(a2)*(14+rr()*8)-4,7+rr()*6])}
  cf.sort(function(a,b){return a[1]-b[1]});
  var canFront=canopyLayer(130,80,3,cf,palB);
  /* sprites */
  var person=newPerson(),leaves=[],bflies=[];
  for(i=0;i<7;i++)leaves.push({x:-135+r()*80,y:-60+r()*80,v:4+r()*4,p:r()*6,c:i%3===0?'#e9a43c':(i%2?'#58b45e':'#2f8a45')});
  bflies.push({cx:-78,cy:30,ax:26,ay:8,s:.7,p:0,c:'#ffd25a'},{cx:-98,cy:46,ax:20,ay:6,s:.9,p:2,c:'#ff7f93'});
  var canX=-96-60,canY=-98;   /* where the canopy canvases land (top-left, in world px) */

  var T=9;
  function phase(t){var s=t%T,e=0,fl=0,up=0;
    if(s<3.6)e=0;else if(s<4.3)e=ease((s-3.6)/.7);else if(s<5.9)e=1;else if(s<6.6)e=1-ease((s-5.9)/.7);
    if(s>5.0&&s<5.5)fl=1-(s-5.0)/.5;
    return {s:s,e:e,flash:fl}}

  return {W:W,H:H,T:T,
    draw:function(ctx,t){
      var ph=phase(t),e=ph.e,f;
      ctx.drawImage(sky.c,0,0);
      ctx.save();ctx.translate(ox,oy);
      /* clouds */
      for(i=0;i<clouds.length;i++){var cl=clouds[i],span=W+cl.img.width+30,px=((cl.x+t*cl.v)%span+span)%span-cl.img.width;ctx.drawImage(cl.img,left+Math.round(px),cl.y)}
      /* birds */
      for(i=0;i<2;i++){var bxp=((t*(7+i*2)+i*140)%(W+40))-20+left,byp=top+30+i*26+Math.round(Math.sin(t*1.3+i)*3),fl2=Math.floor(t*5+i)%2;ctx.fillStyle='#2b3a55';
        if(fl2){ctx.fillRect(bxp-2,byp,1,1);ctx.fillRect(bxp-1,byp+1,1,1);ctx.fillRect(bxp,byp,1,1);ctx.fillRect(bxp+1,byp+1,1,1);ctx.fillRect(bxp+2,byp,1,1)}
        else{ctx.fillRect(bxp-2,byp+1,1,1);ctx.fillRect(bxp-1,byp,1,1);ctx.fillRect(bxp,byp+1,1,1);ctx.fillRect(bxp+1,byp,1,1);ctx.fillRect(bxp+2,byp+1,1,1)}}
      ctx.restore();
      ctx.drawImage(far.c,0,0);
      ctx.drawImage(gr.c,0,0);
      ctx.save();ctx.translate(ox,oy);
      /* back canopy (sways) */
      var sw=Math.round(Math.sin(t*.7)*1.2),sw2=Math.round(Math.sin(t*.9+1.4)*1.4);
      ctx.drawImage(canBack,canX+sw,canY+8);
      ctx.drawImage(canMid,canX-sw,canY);
      ctx.restore();
      ctx.drawImage(bn.c,0,0);
      ctx.save();ctx.translate(ox,oy);
      /* open diary on his lap, seen slightly from above: ruled page, cover edge, live ink */
      var ws=ph.s<3.6?ph.s:(ph.s>6.6?ph.s-3:3.6),line=Math.min(2,Math.floor(ws/2)),lp=clamp((ws-line*2)/2,0,1);
      var d0=9,d1=26;
      for(i=d0;i<=d1;i++){var f=(i-d0)/(d1-d0),yt=Math.round(lerp(-9,-13,f)),yb=Math.round(lerp(-3,-7,f));
        R(ctx,HX-i,yt,1,yb-yt+1,C.cream);R(ctx,HX-i,yt,1,1,'#fffaf0');R(ctx,HX-i,yb+1,1,2,'#a2481c');
        for(k=1;k<=3;k++)if(i%2===0)P1(ctx,HX-i,yt+k*1.5|0,'#d9cfb8')}
      R(ctx,HX-d0,-9,1,8,'#a2481c');R(ctx,HX-d1,-13,1,8,'#a2481c');R(ctx,HX-17,-11,1,8,'#c9b88e');
      /* ink: earlier lines complete, current line grows with the pen; fades out before the loop restarts */
      var fade=ph.s>8.6?clamp(1-(ph.s-8.6)/.4,0,1):1;ctx.globalAlpha=fade;
      for(var ln=0;ln<=line;ln++){var len=ln<line?15:Math.floor(lp*15);
        for(k=0;k<len;k++){var uu=d0+1+k,ff=(uu-d0)/(d1-d0),yy=Math.round(lerp(-9,-13,ff))+1+ln*2+((k*7+ln*3)%5<2?1:0)-0;
          if((k%4)!==3)P1(ctx,HX-uu,Math.min(yy,Math.round(lerp(-3,-7,ff))),'#2b3a7a')}}
      ctx.globalAlpha=1;
      /* person */
      var writing=1-e;
      var tipU=d0+2+Math.floor(lp*30)/2+(Math.sin(t*26)>0?0:.5),tipF=(tipU-d0)/(d1-d0),
          pen={x:Math.round(tipU)-2,y:Math.round(lerp(-9,-13,tipF))+1+line*2-3+(Math.sin(t*26)>.2?1:0)};
      var camPos={x:lerp(5,20,e),y:lerp(29,10,e)};
      var pose={lean:Math.round(lerp(2,0,e)),head:{dx:Math.round(lerp(2,1,e)),dy:Math.round(lerp(2,-1,e))},blink:(t%3.4)<.13||(ph.s>5.0&&ph.s<5.3),dir:1,
        legs:{kx:21,ky:0,ax:23,ay:22,foot:'hang'},
        nh:{x:Math.round(lerp(pen.x,11,e)),y:Math.round(lerp(pen.y,-33,e))},
        fh:{x:Math.round(lerp(22,17,e)),y:Math.round(lerp(-10,-34,e))},
        strap:e<.02?{x:3,y:-9}:null,cam:e<.02?null:{x:camPos.x,y:camPos.y}};
      var info=drawPerson(person,pose);
      /* pen */
      if(e<.5){var hh=info.nj;LN(person.x,hh.hx,hh.hy,hh.hx+3,hh.hy+3,1,'#d5360c');P1(person.x,hh.hx+3,hh.hy+3,'#1b1730')}
      outline(person,C.ink);
      blit(ctx,person.c,HX-person.w+1+person.hx,-person.hy,true);
      /* flash from the lens */
      if(ph.flash>0){
        var lensX=HX-(info.head.x+20+9-person.hx)-1,lensY=-person.hy+info.head.y+10;
        var fa=ph.flash;ctx.fillStyle='rgba(255,255,255,'+(fa*.9).toFixed(2)+')';
        ctx.fillRect(lensX-4,lensY-1,6,3);ctx.fillRect(lensX-1,lensY-4,3,9);
        ctx.fillStyle='rgba(255,250,220,'+(fa*.5).toFixed(2)+')';ctx.fillRect(lensX-9,lensY-1,5,3);ctx.fillRect(lensX-1,lensY-9,3,5);ctx.fillRect(lensX-1,lensY+4,3,5);
        ctx.fillStyle='rgba(255,255,240,'+(fa*.18).toFixed(3)+')';ctx.fillRect(left,top,W,H)}
      /* front canopy (in front, sways differently) */
      ctx.drawImage(canFront,canX+sw2+2,canY+2);
      /* butterflies */
      for(i=0;i<bflies.length;i++){var bf=bflies[i],bxp2=Math.round(bf.cx+Math.sin(t*bf.s+bf.p)*bf.ax),byp2=Math.round(bf.cy+Math.sin(t*bf.s*1.7+bf.p)*bf.ay),wing=Math.floor(t*8+i)%2;
        ctx.fillStyle=bf.c;if(wing){ctx.fillRect(bxp2-1,byp2-1,1,2);ctx.fillRect(bxp2+1,byp2-1,1,2)}else{ctx.fillRect(bxp2-1,byp2,1,1);ctx.fillRect(bxp2+1,byp2,1,1)}
        ctx.fillStyle='#1b1730';ctx.fillRect(bxp2,byp2-1,1,2)}
      /* leaves */
      for(i=0;i<leaves.length;i++){var lf=leaves[i],ly3=((lf.y+t*lf.v+80)%120)-60,lx3=lf.x+Math.sin(t*.8+lf.p)*8-ly3*.15;ctx.fillStyle=lf.c;ctx.fillRect(Math.round(lx3),Math.round(ly3),2,1);ctx.fillRect(Math.round(lx3)+1,Math.round(ly3)+1,1,1)}
      /* light shafts through the leaves */
      var a1=.07+.02*Math.sin(t*.5);
      ctx.fillStyle='rgba(255,246,190,'+a1.toFixed(3)+')';
      for(j2=-34;j2<34;j2++){var o3=(j2+34)*.55;ctx.fillRect(-120-Math.round(o3),j2,11,1);ctx.fillRect(-92-Math.round(o3),j2,6,1);ctx.fillRect(-144-Math.round(o3*.8),j2,4,1)}
      /* floating pollen */
      for(i=0;i<14;i++){var px2=Math.round(left+((i*37+t*(2+i%3))%W)),py2=Math.round(-30+(i*23)%70+Math.sin(t*.6+i)*4);ctx.fillStyle='rgba(255,255,230,'+(.3+.3*Math.sin(t*2+i)).toFixed(2)+')';ctx.fillRect(px2,py2,1,1)}
      ctx.restore();
    }};
}

/* ===================================================================== DESK (top-down)
   The tabletop seen from straight above, used for the "messy cards -> structured cards" scroll sequence.
   Static (baked once): horizontal planks, window light, and the things on a real work desk, kept to the
   two sides so the middle stays free for the cards. W/H are logical art pixels, margin = free side width. */
function buildDesk(W,H,margin){
  var o=mk(W,H),x=o.x,r=rng(41),i,j,k,pl=22,tones=[C.wood,'#c98d58','#d49a66','#c4864f'],ink='#3b2416';
  /* planks */
  for(j=0,k=0;j<H;j+=pl,k++){
    R(x,0,j,W,pl,tones[(k*7+(k>>1))%tones.length]);
    R(x,0,j,W,1,C.woodDD);R(x,0,j+1,W,1,C.woodL);
    /* end joints, staggered */
    for(i=-((k*53)%97);i<W;i+=97+((k*13)%31)){if(i>0)R(x,i,j+1,1,pl-1,C.woodD)}
    /* grain */
    for(i=0;i<W*pl/70;i++){var gx=Math.floor(r()*W),gy=j+3+Math.floor(r()*(pl-5)),gl=6+Math.floor(r()*26);R(x,gx,gy,gl,1,r()<.55?C.woodD:C.woodL)}
    /* a knot now and then */
    if(r()<.45){var kx=Math.floor(r()*W),ky=j+6+Math.floor(r()*(pl-12));ell(x,kx,ky,4,2,C.woodD);ell(x,kx,ky,2,1,C.woodDD);R(x,kx-6,ky-3,12,1,C.woodL);R(x,kx-6,ky+3,12,1,C.woodL)}
  }
  /* window light: warm, dithered, slanting from the top-left */
  var id=x.getImageData(0,0,W,H),d=id.data,p,e;
  for(j=0;j<H;j++)for(i=0;i<W;i++){
    e=Math.max(0,1-(i*.9+((j%260)*.5))/(W*1.1))*.34;
    p=(j*W+i)*4;
    if(bay(i,j)<e){d[p]=Math.min(255,d[p]+22);d[p+1]=Math.min(255,d[p+1]+16);d[p+2]=Math.min(255,d[p+2]+6)}
  }
  x.putImageData(id,0,0);

  /* ---- things on the desk: each is drawn on its own small canvas, outlined, shadowed, then stamped */
  function item(w,h,fn){var s=mk(w+2,h+2);fn(s.x,1,1);outline(s,ink);return s}
  function stamp(s,X,Y){
    var sh=mk(s.w,s.h);sh.x.drawImage(s.c,0,0);sh.x.globalCompositeOperation='source-in';sh.x.fillStyle='rgba(40,20,8,.34)';sh.x.fillRect(0,0,s.w,s.h);
    x.drawImage(sh.c,Math.round(X)+2,Math.round(Y)+3);x.drawImage(s.c,Math.round(X),Math.round(Y))}
  var make={
    laptop:function(){return item(46,32,function(c,a,b){
      R(c,a,b,46,32,C.steel);R(c,a,b,46,1,'#f4f6fa');R(c,a,b+31,46,1,C.steelDD);R(c,a+45,b,1,32,C.steelD);
      R(c,a+2,b+2,42,28,'#dfe3ea');
      ell(c,a+23,b+16,4,4,C.steelD);ell(c,a+23,b+16,3,3,'#f4f6fa');            /* logo disc */
      R(c,a+1,b+1,44,1,'#fff');P1(c,a+22,b+16,C.orangeL);
      /* a sticker */
      R(c,a+34,b+22,7,5,C.orange);R(c,a+35,b+23,5,1,C.orangeL)})},
    mug:function(){return item(26,22,function(c,a,b){
      ell(c,a+10,b+11,10,10,C.cream);ell(c,a+10,b+11,8,8,'#fff');ell(c,a+10,b+11,7,7,'#5a331c');ell(c,a+9,b+10,5,5,'#74421f');ell(c,a+7,b+8,2,1,'#a56a36');
      /* handle */
      R(c,a+20,b+8,4,2,C.cream);R(c,a+23,b+9,2,5,C.cream);R(c,a+20,b+13,4,2,C.cream);R(c,a+21,b+10,2,3,'rgba(0,0,0,0)')})},
    notebook:function(){return item(40,52,function(c,a,b){
      R(c,a,b,40,52,C.orange);R(c,a,b,40,1,C.orangeL);R(c,a,b,2,52,'#a52a07');R(c,a+34,b,3,52,'#2a2438');
      R(c,a+6,b+8,22,14,C.cream);R(c,a+8,b+11,18,1,C.wallDD);R(c,a+8,b+14,14,1,C.wallDD);R(c,a+8,b+17,16,1,C.wallDD);
      /* pen resting on it */
      R(c,a+30,b+4,3,42,'#22243a');R(c,a+30,b+4,1,42,'#4a4d70');R(c,a+30,b+44,3,3,C.steelD)})},
    plant:function(){return item(46,46,function(c,a,b){
      var cx=a+23,cy=b+23,n=9,t;
      for(t=0;t<n;t++){var an=t/n*Math.PI*2+.3,lx=cx+Math.cos(an)*14,ly=cy+Math.sin(an)*14;LN(c,cx,cy,lx,ly,2,C.leafD);ell(c,lx,ly,7,4,t%2?C.leaf:C.leafD);ell(c,(lx+cx)/2+Math.cos(an)*3,(ly+cy)/2+Math.sin(an)*3,5,3,t%3?C.leaf:C.leafL)}
      ell(c,cx,cy,7,7,C.potD);ell(c,cx,cy,6,6,C.pot);ell(c,cx-1,cy-1,3,3,C.potD)})},
    phone:function(){return item(22,40,function(c,a,b){
      R(c,a,b,22,40,'#242736');R(c,a+1,b+1,20,38,'#171a27');R(c,a+2,b+3,18,34,'#26416e');R(c,a+2,b+3,18,2,'#3e6bb0');
      R(c,a+4,b+8,6,6,C.code1);R(c,a+12,b+8,6,6,C.code2);R(c,a+4,b+17,6,6,C.code3);R(c,a+12,b+17,6,6,C.code4);P1(c,a+11,b+1,'#4b5070')})},
    glasses:function(){return item(36,16,function(c,a,b){
      ell(c,a+8,b+8,7,6,'#2a2438');ell(c,a+8,b+8,5,4,'rgba(190,225,250,.9)');ell(c,a+27,b+8,7,6,'#2a2438');ell(c,a+27,b+8,5,4,'rgba(190,225,250,.9)');
      R(c,a+14,b+6,6,2,'#2a2438');R(c,a,b+6,2,2,'#2a2438');R(c,a+34,b+6,2,2,'#2a2438');P1(c,a+6,b+6,'#fff');P1(c,a+25,b+6,'#fff')})},
    pencils:function(){return item(40,18,function(c,a,b){
      var cols=['#e9b44c','#3e8e5a','#5d86b9','#d5360c'],t;
      for(t=0;t<4;t++){R(c,a,b+t*4,34,3,cols[t]);R(c,a,b+t*4,34,1,'rgba(255,255,255,.35)');R(c,a+34,b+t*4,4,3,'#f0d5b0');R(c,a+37,b+t*4+1,2,1,'#2a2438')}})},
    ruler:function(){return item(8,70,function(c,a,b){
      R(c,a,b,8,70,'#e9b44c');R(c,a,b,8,1,'#f6d27a');var t;for(t=2;t<68;t+=3)R(c,a,b+t,t%9===2?5:3,1,'#6b4a12')})},
    sticky:function(){return item(26,26,function(c,a,b){
      R(c,a,b,26,26,'#f6d85f');R(c,a,b+22,26,4,'#e6c445');R(c,a+4,b+5,16,1,'#b6993a');R(c,a+4,b+9,12,1,'#b6993a');R(c,a+4,b+13,14,1,'#b6993a')})},
    paper:function(){return item(30,30,function(c,a,b){
      var pts=[[2,6],[10,1],[19,3],[27,9],[28,19],[21,28],[11,27],[3,20]],j2,t;
      c.fillStyle='#f3efe6';c.beginPath();c.moveTo(a+pts[0][0],b+pts[0][1]);for(j2=1;j2<pts.length;j2++)c.lineTo(a+pts[j2][0],b+pts[j2][1]);c.closePath();c.fill();
      LN(c,a+6,b+8,a+16,b+14,1,'#cfc8b6');LN(c,a+16,b+14,a+24,b+11,1,'#cfc8b6');LN(c,a+9,b+22,a+15,b+14,1,'#cfc8b6');LN(c,a+15,b+14,a+22,b+22,1,'#d8d1c0')})},
    clips:function(){return item(20,12,function(c,a,b){
      R(c,a,b,12,1,C.steelD);R(c,a,b,1,8,C.steelD);R(c,a,b+7,10,1,C.steelD);R(c,a+3,b+3,12,1,C.steelD);R(c,a+14,b+3,1,8,C.steelD);R(c,a+5,b+10,10,1,C.steelD)})},
    cable:function(){return item(34,34,function(c,a,b){
      var t,px=a,py=b+30;for(t=1;t<=40;t++){var u=t/40,nx=a+u*30,ny=b+30-Math.sin(u*Math.PI)*26+Math.sin(u*Math.PI*3)*4;LN(c,px,py,nx,ny,2,'#f0eadf');px=nx;py=ny}
      R(c,a+29,b+27,5,6,'#9aa2b0')})}
  };
  /* mug ring stain, baked straight on the wood before the mug goes over it */
  function ringAt(X,Y){var t;x.fillStyle='rgba(90,50,24,.4)';for(t=0;t<40;t++){var an=t/40*Math.PI*2;x.fillRect(Math.round(X+Math.cos(an)*9),Math.round(Y+Math.sin(an)*9),1,1)}}

  /* placement: down both sides, from the very top to the very bottom */
  var s,side;
  /* the first screen always shows a laptop on the left and a mug on the right */
  var seq=[['laptop',0],['mug',1],['notebook',0],['plant',1],['phone',0],['pencils',1],['glasses',0],['sticky',1]];
  var pool=['paper','ruler','clips','cable','mug','notebook','plant','phone','glasses','pencils','sticky','laptop'];
  var cur=[14,40],cnt=0;
  function place(kind,sideI){
    s=make[kind]();if(!s)return;
    var gapX=r()*8,X=sideI===0?Math.max(-6,Math.round(margin-s.w-4-gapX)-(r()*10|0)):Math.min(W-s.w+6,Math.round(W-margin+4+gapX)+(r()*10|0));
    if(margin<20)X=sideI===0?Math.round(-s.w*.35):Math.round(W-s.w*.65);
    if(kind==='mug')ringAt(X+11,cur[sideI]+12);
    stamp(s,X,cur[sideI]);cur[sideI]+=s.h+16+Math.round(r()*28)}
  for(i=0;i<seq.length;i++)place(seq[i][0],seq[i][1]);
  while(cur[0]<H||cur[1]<H){
    side=cur[0]<=cur[1]?0:1;place(pool[(cnt++*5+side*3)%pool.length],side)}
  /* soft vignette so the edges feel lit from the middle */
  vignette(o,.5);
  return {c:o.c,W:W,H:H};
}

/* the hand that arranges the cards: a pixel hand pinching at the top (the tip), sleeve running off the bottom */
function makeHand(cv){
  var w=30,h=420,o=mk(w,h),x=o.x,S=C.skin,SL=C.skinL,SD=C.skinD;
  /* sleeve */
  R(x,5,56,20,364,C.tee);R(x,5,56,3,364,C.teeD);R(x,22,56,3,364,C.teeL);R(x,5,56,20,3,C.teeD);
  LN(x,9,70,12,100,1,C.teeD);LN(x,17,66,19,106,1,C.teeD);LN(x,10,130,13,190,1,C.teeD);LN(x,18,120,17,176,1,C.teeD);LN(x,9,230,12,300,1,C.teeD);LN(x,17,250,19,340,1,C.teeD);
  /* forearm + wrist */
  R(x,9,40,12,17,S);R(x,9,40,3,17,SD);R(x,19,40,2,17,SL);
  /* palm */
  R(x,6,23,18,19,S);R(x,6,23,3,19,SD);R(x,21,23,3,19,SL);R(x,8,38,14,2,SD);
  /* curled fingers, seen as knuckles on the right */
  var t;for(t=0;t<3;t++){R(x,20,24+t*5,6,5,S);R(x,25,25+t*5,1,3,SD);R(x,20,28+t*5,6,1,SD)}
  /* thumb and index meet at the top */
  LN(x,9,33,12,5,5,S);LN(x,9,33,12,5,1,SD);
  LN(x,16,27,17,5,5,S);LN(x,19,27,19,6,1,SL);
  R(x,12,2,6,5,S);R(x,13,2,4,1,SL);P1(x,14,3,SL);P1(x,16,3,SL);
  outline(o,C.ink);
  cv.width=w+0;cv.height=h;var cx=cv.getContext('2d');cx.imageSmoothingEnabled=false;cx.drawImage(o.c,0,0);
  return {w:w,h:h,tipX:15}
}

/* ===================================================================== STAGE
   Owns the fixed layer behind the page: one canvas per scene, each inside a clipped "panel".
   A panel's whole look is one tweenable state { insets t/r/b/l, focus fx/fy, scale k }, so the
   landing split, the click-to-zoom and the full-screen hero are the same thing at different values.
   Insets and focus are fractions of the viewport (they survive resizes); k is a whole number of
   device pixels per art pixel, so the pixels never go soft once a move settles. */
var Stage=(function(){
  var el=null,panels={},mode='off',cur=null,geo=null,dpr=1,ticking=false,t0=0,lastDraw=0,shown=false,tw={},rt=0,still=null;
  var KIND={office:{build:buildOffice,F:[33,0],still:1.3,hash:'#/work'},park:{build:buildPark,F:[3,0],still:1.3,hash:'#/writings'}};
  var OF={work:'office',personal:'park'};
  function q(k){return Math.max(1/dpr,Math.floor(k*dpr+1e-6)/dpr)}
  function HS(n){return n==='park'?geo.Hp:geo.H}
  function ox(W){return Math.floor(W/2)}
  function oyy(H){return Math.floor(H/2)+8}

  function measure(){
    dpr=Math.min(window.devicePixelRatio||1,3);
    var vw=el.clientWidth||innerWidth,vh=el.clientHeight||innerHeight,narrow=vw<860||vh>vw,kL,kH,kP,L={},H,Hp;
    /* Both scenes are drawn mirrored, so the two of you sit back to back at the seam and lean on each other. */
    if(narrow){
      kL=q(Math.min(vw/232,vh*.5/150));kH=q(Math.min(vw/175,vh/150));kP=kH;
      L.office={t:0,r:0,b:.5,l:0,fx:.64,fy:.31,k:kL};L.park={t:.5,r:0,b:0,l:0,fx:.36,fy:.71,k:kL};
      H={t:0,r:0,b:0,l:0,fx:.68,fy:.8,k:kH};Hp={t:0,r:0,b:0,l:0,fx:.36,fy:.46,k:kP}}
    else{
      kH=q(Math.min(vw/250,vh/150));kL=Math.min(q(Math.min(vw*.5/140,vh/150)),q(kH/1.2));kP=q(kH*.8);
      L.office={t:0,r:.5,b:0,l:0,fx:.5-13*kL/vw,fy:.6,k:kL};L.park={t:0,r:0,b:0,l:.5,fx:.5+14*kL/vw,fy:.6,k:kL};
      H={t:0,r:0,b:0,l:0,fx:.72,fy:.62,k:kH};Hp={t:0,r:0,b:0,l:0,fx:.62,fy:.4,k:kP}}
    if(kH<kL*1.15)H.k=q(kL*1.3);
    /* logical canvas size: must cover every state (with margin for the move in between) */
    var need=[L.office,L.park,H,Hp],i,mL=0,mR=0,mT=0,mB=0,s,fxm=40,fym=0;
    for(i=0;i<need.length;i++){s=need[i];
      mL=Math.max(mL,(s.fx-s.l)*vw/s.k);mR=Math.max(mR,((1-s.r)-s.fx)*vw/s.k);
      mT=Math.max(mT,(s.fy-s.t)*vh/s.k);mB=Math.max(mB,((1-s.b)-s.fy)*vh/s.k)}
    var W=Math.ceil(2*(Math.max(mL,mR)*1.1+fxm))+8,Hh=Math.ceil(2*(Math.max(mT,mB)*1.1+fym+8))+8;
    W+=W&1;Hh+=Hh&1;
    geo={vw:vw,vh:vh,narrow:narrow,L:L,H:H,Hp:Hp,W:W,Hh:Hh};
  }

  function build(name){var p=panels[name],K=KIND[name];
    p.scene=K.build(geo.W,geo.Hh);p.c.width=geo.W;p.c.height=geo.Hh;p.x=p.c.getContext('2d');p.x.imageSmoothingEnabled=false;
    p.ox=ox(geo.W);p.oy=oyy(geo.Hh)}
  function mkPanel(name){
    var d=document.createElement('div'),c=document.createElement('canvas');d.className='stage-p stage-'+name;d.appendChild(c);el.appendChild(d);
    panels[name]={d:d,c:c,scene:null,s:{t:0,r:0,b:0,l:0,fx:.5,fy:.5,k:1},on:false};return panels[name]}
  function apply(name){var p=panels[name],s=p.s,cw=geo.vw=el.clientWidth||geo.vw,ch=geo.vh=el.clientHeight||geo.vh,K=KIND[name];
    if(!p.scene)return;
    p.d.style.clipPath='inset('+(s.t*ch).toFixed(1)+'px '+(s.r*cw).toFixed(1)+'px '+(s.b*ch).toFixed(1)+'px '+(s.l*cw).toFixed(1)+'px)';
    var tx=Math.round((s.fx*cw-(p.ox+K.F[0])*s.k)*dpr)/dpr,ty=Math.round((s.fy*ch-(p.oy+K.F[1])*s.k)*dpr)/dpr;
    p.c.style.transform='translate3d('+tx+'px,'+ty+'px,0) scale('+s.k+')'}
  function put(name,st){var s=panels[name].s,k;for(k in st)s[k]=st[k];apply(name)}
  function kill(name){if(tw[name]){tw[name].kill();tw[name]=null}}
  function move(name,st,o){o=o||{};kill(name);
    if(!G||reduced()||o.now){put(name,st);if(o.done)o.done();return}
    var to={},k,s=panels[name].s;for(k in st)to[k]=st[k];
    to.duration=o.dur||1.05;to.ease=o.ease||'power3.inOut';to.overwrite=true;
    to.onUpdate=function(){apply(name)};to.onComplete=function(){tw[name]=null;apply(name);if(o.done)o.done()};
    tw[name]=G.to(s,to)}
  function show(name,on,o){var p=panels[name];o=o||{};if(p.on===on&&!o.force)return;p.on=on;
    if(on){p.d.style.display='block'}
    if(!G||reduced()||o.now){p.d.style.opacity=on?1:0;if(!on)p.d.style.display='none';return}
    G.to(p.d,{opacity:on?1:0,duration:o.dur||.7,ease:'power2.out',overwrite:true,onComplete:function(){if(!on)p.d.style.display='none'}})}
  function z(name,n){panels[name].d.style.zIndex=n}

  /* ---- drawing loop (about 24 fps, only while something is on screen) */
  function mdraw(p,t){var x=p.x;x.save();x.translate(geo.W,0);x.scale(-1,1);p.scene.draw(x,t);x.restore()}
  function drawAll(t){var n,p;for(n in panels){p=panels[n];if(p.on&&p.scene)mdraw(p,t)}}
  function tick(){var now=performance.now();if(now-lastDraw<40)return;lastDraw=now;
    if(document.hidden||!shown||(!live&&scrollY>innerHeight*1.15))return;drawAll((now-t0)/1000)}
  function run(){var want=shown&&!reduced();if(want&&!ticking&&G){G.ticker.add(tick);ticking=true}else if(!want&&ticking){G.ticker.remove(tick);ticking=false}
    if(shown&&reduced())drawStill()}
  function drawStill(){var n,p;for(n in panels){p=panels[n];if(p.on&&p.scene)mdraw(p,KIND[n].still)}}

  function ensure(name){if(!panels[name])mkPanel(name);if(!panels[name].scene)build(name)}
  function init(){if(el)return;el=document.getElementById('stage');if(!el)return;measure();
    var rz=0;window.addEventListener('resize',function(){clearTimeout(rt);rt=setTimeout(onResize,220)});
    if(RMQ.addEventListener)RMQ.addEventListener('change',run)}
  function onResize(){var w=el.clientWidth,h=el.clientHeight;if(geo&&w===geo.vw&&Math.abs(h-geo.vh)<130&&dpr===Math.min(window.devicePixelRatio||1,3)){geo.vh=h;rest(true);return}
    measure();Object.keys(panels).forEach(function(n){kill(n);panels[n].scene=null;ensure(n)});rest(true)}
  /* snap every panel to the resting state of the current mode */
  function rest(){var n;
    if(mode==='landing'){put('office',geo.L.office);put('park',geo.L.park)}
    else if(mode==='work'||mode==='personal'){put(OF[mode],HS(OF[mode]))}
    for(n in panels)apply(n);run()}

  /* ---- public: go to a mode. 'landing' | 'work' | 'personal' | 'off' */
  function set(next,o){o=o||{};init();if(!el)return;
    if(next===mode&&cur===next&&!o.force)return;
    var prev=mode;mode=next;cur=next;
    if(next==='off'){shown=false;G&&G.to(el,{opacity:0,duration:.35,overwrite:true,onComplete:function(){if(mode==='off'){el.style.display='none';run()}}});if(!G){el.style.display='none'}
      document.body.classList.remove('has-stage');return}
    document.body.classList.add('has-stage');
    el.style.display='block';var wasOff=!shown;shown=true;t0=t0||performance.now();
    if(wasOff){G?G.to(el,{opacity:1,duration:reduced()?.2:.6,overwrite:true}):(el.style.opacity=1)}else{el.style.opacity=1}
    var instant=!!o.first||wasOff||reduced();
    if(next==='landing'){
      ensure('office');ensure('park');
      var from=(prev==='work')?'office':(prev==='personal'?'park':null),other=from==='office'?'park':'office';
      if(from&&!instant){
        /* zoom back out: the hero panel shrinks to its half; the other half is already waiting underneath */
        put(other,geo.L[other]);show(other,true,{now:true});z(other,1);z(from,2);panels[from].on=true;panels[from].d.style.display='block';panels[from].d.style.opacity=1;
        move(from,geo.L[from],{done:function(){run()}});
      }else{
        put('office',geo.L.office);put('park',geo.L.park);show('office',true,{now:true,force:1});show('park',true,{now:true,force:1});z('office',1);z('park',1)}
    }else{
      var name=OF[next],oth=name==='office'?'park':'office';ensure(name);
      if(prev==='landing'&&!instant){
        /* arrived from the landing: if the click-zoom already ran this is a no-op, otherwise do it now */
        z(name,2);z(oth,1);if(Math.abs(panels[name].s.l+panels[name].s.r+panels[name].s.t+panels[name].s.b)>.001)move(name,HS(name),{});
        show(name,true,{now:true});
      }else if((prev==='work'||prev==='personal')&&prev!==next&&!instant){
        z(name,2);z(oth,1);put(name,HS(name));panels[name].on=false;show(name,true,{dur:.8});
        if(panels[oth])setTimeout(function(){if(mode===next)show(oth,false,{now:true})},850);
      }else{
        put(name,HS(name));show(name,true,{now:true,force:1});z(name,2);if(panels[oth])show(oth,false,{now:true,force:1})}
    }
    for(var n in panels)apply(n);
    run();if(shown&&reduced())drawStill();
  }
  /* click-to-zoom from the landing. cb runs when the panel has filled the screen. */
  function zoom(name,cb){init();ensure(name);var oth=name==='office'?'park':'office';
    if(mode!=='landing'||reduced()||!G){cb&&cb();return}
    z(name,2);z(oth,1);move(name,HS(name),{dur:1.15,ease:'power3.inOut',done:cb});
    /* the other half drifts away from the zoom, so the move reads as one camera push-in */
    var s=panels[oth].s,dir=geo.narrow?{fy:s.fy+(name==='office'?.06:-.06)}:{fx:s.fx+(name==='office'?.06:-.06)};
    G.to(s,Object.assign({duration:1.15,ease:'power3.inOut',overwrite:true,onUpdate:function(){apply(oth)}},dir));
  }

  /* ---- experience sequence: a top-down desk fades over the office while cards fall and get arranged */
  var desk=null,live=false,dK=2,dW=0,dH=0,dPan=0,dM=1;
  function sm(t){t=clamp(t,0,1);return t*t*(3-2*t)}
  function deskK(){var vw=(el&&el.clientWidth)||innerWidth;return q(clamp(vw/240,1.5,5))}
  function deskT(pan,m){if(!desk)return;
    var vw=geo.vw,vh=geo.vh,tx=-(dW*dK-vw)/2,ty=-pan,s;
    if(Math.abs(m-1)<1e-4){tx=Math.round(tx*dpr)/dpr;ty=Math.round(ty*dpr)/dpr;s='translate3d('+tx+'px,'+ty+'px,0) scale('+dK+')'}
    else{var cx=vw/2,cy=vh/2;s='translate('+cx+'px,'+cy+'px) scale('+m+') translate('+(-cx)+'px,'+(-cy)+'px) translate('+tx+'px,'+ty+'px) scale('+dK+')'}
    desk.c.style.transform=s}
  /* P = extra scroll depth of the desk in px; cardW = width of the cards so the clutter stays at the sides */
  function seqBegin(P,cardW){init();if(!el||!geo)return false;
    if(!desk){var d=document.createElement('div'),c=document.createElement('canvas');d.className='stage-p stage-desk';d.appendChild(c);d.style.zIndex=3;d.style.opacity=0;d.style.display='none';el.appendChild(d);desk={d:d,c:c}}
    dK=deskK();dW=Math.ceil(geo.vw/dK)+2;dH=Math.ceil((geo.vh+P)/dK)+4;
    var margin=Math.max(0,Math.floor((dW-cardW/dK)/2)),b=buildDesk(dW,dH,margin);
    desk.c.width=dW;desk.c.height=dH;var cx=desk.c.getContext('2d');cx.imageSmoothingEnabled=false;cx.drawImage(b.c,0,0);
    return true}
  /* ---- devices: the camera glides to the laptop on the office desk, then along the desk to the phone.
     World points (art pixels from the room origin, before the scene is mirrored):
       laptop screen centre (7.5,-26.5), phone centre (20,-21.5).  A viewport X for world x is  fx*vw-(33+x)*k,  Y is  fy*vh+y*k. */
  var LAPW={x:7.5,y:-26.5},PHW={x:20,y:-21.5};
  function camFor(w,px,py,k){return {fx:(px+(33+w.x)*k)/geo.vw,fy:(py-w.y*k)/geo.vh,k:k}}
  function devK(kind){var vw=geo.vw,vh=geo.vh;
    if(kind==='lap')return q(Math.max(4,Math.min(vw*(geo.narrow?.8:.44)/15,vh*.7/17)));
    return q(Math.max(4,Math.min(vh*.56/11,vw*.62/6)))}
  function devTy(){return geo.vh*.5+(geo.narrow?10:18)}
  function seqApply(S){if(!desk||!geo||!panels.office)return;
    var z=sm(S.zoom),f=sm(S.fade),H=geo.H,vw=geo.vw,vh=geo.vh,kz=q(H.k*2.6),k=z<=0?H.k:(z>=1?kz:lerp(H.k,kz,z)),st={fx:lerp(H.fx,.5+42*k/vw,z),fy:lerp(H.fy,.5+18*k/vh,z),k:k};
    var lz=clamp(S.lz||0,0,1),pz=clamp(S.pz||0,0,1);
    if(lz>0){
      /* H -> laptop: the laptop centre travels from where it sits in the room to the middle of the screen while the zoom is geometric */
      var kL=devK('lap'),p0x=H.fx*vw-(33+LAPW.x)*H.k,p0y=H.fy*vh-LAPW.y*H.k,kk=H.k*Math.pow(kL/H.k,lz);
      st=camFor(LAPW,lerp(p0x,vw/2,lz),lerp(p0y,devTy(),lz),kk);
      if(pz>0){
        /* laptop -> phone: slide along the desk at a steady height, easing the zoom between the two sizes */
        var kP=devK('ph'),k2=kL*Math.pow(kP/kL,pz),w={x:lerp(LAPW.x,PHW.x,pz),y:lerp(LAPW.y,PHW.y,pz)};
        st=camFor(w,vw/2,devTy(),k2)}}
    put('office',st);
    desk.d.style.display=f>.002?'block':'none';desk.d.style.opacity=f;
    deskT(S.pan||0,lerp(2.4,1,f))}
  /* where the laptop glass and the phone body are on screen right now (viewport px), read from the live camera */
  function devRects(){if(!geo||!panels.office)return null;var s=panels.office.s,k=s.k,cx=s.fx*geo.vw,cy=s.fy*geo.vh;
    var X=function(wx){return cx-(33+wx)*k},Y=function(wy){return cy+wy*k};
    return {
      lap:{x:X(18),y:Y(-35),w:15*k,h:17*k,sh:6*k},   /* sheared: the bottom edge sits sh to the right of the top edge */
      ph:{x:X(23),y:Y(-27),w:6*k,h:11*k},
      k:k}}
  function seqLive(on){live=!!on}
  function seqEnd(){live=false;if(desk){desk.d.style.display='none';desk.d.style.opacity=0}
    if(geo&&panels.office&&(mode==='work'))put('office',geo.H)}
  function hand(cv){return makeHand(cv)}
  function info(){return geo}
  return {set:set,zoom:zoom,info:info,init:init,seqBegin:seqBegin,seqApply:seqApply,seqLive:seqLive,seqEnd:seqEnd,hand:hand,devRects:devRects};
})();
window.Stage=Stage;
})();
