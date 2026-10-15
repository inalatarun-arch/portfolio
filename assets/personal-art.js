/* Tarun Inala – pixel art for the Personal side: three diaries (one per language), five cameras (one per photo group,
   front and back) and the cassette button. Everything is drawn in code on tiny canvases with the helpers exported by
   scene.js (window.PX) and scaled up with whole-number pixels, the same way the park and office scenes are. */
(function(){
'use strict';
var P=window.PX;if(!P)return;
var mk=P.mk,R=P.R,P1=P.P1,LN=P.LN,ell=P.ell,outline=P.outline,rng=P.rng,INK='#1b1730';

/* ------------------------------------------------------------------ diaries */
var DIARY={
  English:{base:'#2c4a8c',hi:'#4d78cf',lo:'#1c3166',trim:'#e9b44c',emb:'quill',paper:'#f4ead6'},
  Telugu:{base:'#1f7a52',hi:'#3bab78',lo:'#13523a',trim:'#f0d68a',emb:'flower',paper:'#f4ead6'},
  Hindi:{base:'#d5560c',hi:'#f0843a',lo:'#9a3b06',trim:'#ffe08a',emb:'sun',paper:'#f6ecd6'}
};
function diaryCover(lang){
  var d=DIARY[lang]||DIARY.English,o=mk(42,56),x=o.x,r=rng(lang.length*31+7),i,j;
  x.translate(1,1);
  /* page block peeking out on the right and the bottom */
  R(x,5,3,36,51,'#efe4cc');for(j=5;j<52;j+=2){P1(x,40,j,'#cdbf9e')}R(x,6,52,34,1,'#cdbf9e');
  /* cover */
  R(x,0,0,37,52,d.base);R(x,0,0,37,1,d.hi);R(x,0,51,37,1,d.lo);R(x,36,0,1,52,d.lo);
  for(i=0;i<46;i++){P1(x,3+Math.floor(r()*32),2+Math.floor(r()*48),r()<.5?d.lo:d.hi)}
  /* spine with stitches */
  R(x,0,0,7,52,d.lo);R(x,7,0,1,52,d.hi);for(j=4;j<50;j+=6){R(x,2,j,3,2,d.trim)}
  /* elastic band and its buckle */
  R(x,29,0,3,52,d.lo);R(x,29,0,1,52,d.base);R(x,28,25,5,5,d.trim);R(x,29,26,3,3,d.lo);
  /* corner guards */
  R(x,32,0,5,4,d.trim);R(x,32,48,5,4,d.trim);R(x,0,0,7,3,d.trim);R(x,0,49,7,3,d.trim);
  /* label plate */
  R(x,11,8,16,19,d.trim);R(x,12,9,14,17,d.paper);R(x,12,9,14,1,'#fffaf0');
  /* emblem */
  var e=d.emb,cx=19,cy=16;
  if(e==='quill'){LN(x,24,10,15,23,1,d.lo);for(j=0;j<7;j++){P1(x,22-j,12+j,d.base);P1(x,23-j,12+j,d.hi);P1(x,21-j,13+j,d.base)}P1(x,15,24,'#2a2a34');P1(x,14,25,'#2a2a34')}
  else if(e==='flower'){ell(x,cx,cy,2,2,d.trim);var pet=[[0,-5],[0,5],[-5,0],[5,0]];for(j=0;j<4;j++)ell(x,cx+pet[j][0],cy+pet[j][1],2,2,d.base);P1(x,cx,cy,'#c1661e');R(x,cx,cy+7,1,3,d.lo)}
  else{ell(x,cx,cy,3,3,d.base);for(j=0;j<8;j++){var a=j*Math.PI/4;P1(x,cx+Math.round(Math.cos(a)*5),cy+Math.round(Math.sin(a)*5),d.base);P1(x,cx+Math.round(Math.cos(a)*6),cy+Math.round(Math.sin(a)*6),d.base)}P1(x,cx-1,cy-1,d.hi)}
  /* ruled lines under the emblem on the plate */
  R(x,13,23,12,1,'#d4c7a6');
  /* little ribbon marker hanging from the bottom */
  R(x,22,52,3,4,'#d5360c');R(x,22,55,1,1,'#9a3b06');P1(x,24,55,'#9a3b06');
  outline(o,INK);return o.c}

/* ------------------------------------------------------------------ cameras
   Drawn in an 80x52 box (offset by 1 for the outline, so the canvas is 82x54). lcd / prev / next are given in the same
   80x52 box; the overlay adds the 1px offset. */
var CAM={
  teal:{name:'DSLR',lcd:[8,14,42,28],prev:[55,29,9,9],next:[65,29,9,9]},
  mono:{name:'Vintage SLR',lcd:[22,17,36,24],prev:[8,24,10,10],next:[62,24,10,10]},
  amber:{name:'Fuji X100 style',lcd:[10,16,40,27],prev:[56,27,9,9],next:[66,27,9,9]},
  rose:{name:'Compact',lcd:[9,12,44,30],prev:[57,28,9,9],next:[67,28,9,9]},
  night:{name:'Rangefinder',lcd:[12,16,38,25],prev:[56,24,9,9],next:[66,24,9,9]}
};
var AW=82,AH=54;
function box(x,X,Y,w,h,c,hi,lo){R(x,X,Y,w,h,c);if(hi)R(x,X,Y,w,1,hi);if(lo)R(x,X,Y+h-1,w,1,lo)}
function dots(x,X,Y,w,h,c,step,seed){var r=rng(seed),i,j;for(j=Y;j<Y+h;j+=step)for(i=X+((j/step)&1?1:0);i<X+w;i+=step)if(r()<.8)P1(x,i,j,c)}
function lens(x,cx,cy,rad,rings){var i;for(i=0;i<rings.length;i++)ell(x,cx,cy,rad-rings[i][0],rad-rings[i][0],rings[i][1])}
function tick(x,cx,cy,rad,n,c){for(var i=0;i<n;i++){var a=i/n*Math.PI*2;P1(x,cx+Math.round(Math.cos(a)*rad),cy+Math.round(Math.sin(a)*rad),c)}}

function front(id){
  var o=mk(AW,AH),x=o.x;x.translate(1,1);
  if(id==='teal'){            /* DSLR: pentaprism, deep grip, big zoom lens */
    box(x,3,12,74,36,'#23282f','#3b434f','#14171c');
    R(x,26,5,28,8,'#2c323b');R(x,28,3,24,3,'#2c323b');R(x,28,3,24,1,'#4a525f');R(x,35,1,10,2,'#8b93a0');
    box(x,3,12,17,36,'#1b1f25','#2c323b','#101317');dots(x,4,14,14,32,'#2e343d',3,3);
    R(x,58,5,13,7,'#3a414c');R(x,58,5,13,1,'#59606d');for(var t=0;t<5;t++)P1(x,60+t*2,8,'#8b93a0');R(x,63,2,6,3,'#c8402d');
    lens(x,46,31,17,[[0,'#0b0d10'],[1,'#2a2f38'],[3,'#14161b'],[5,'#39404c'],[7,'#14161b'],[9,'#1c2e3c'],[12,'#274a63'],[14,'#14293a']]);
    tick(x,46,31,15,18,'#6b7380');R(x,41,24,4,2,'#a8e0ff');P1(x,44,27,'#e6f6ff');R(x,50,37,3,2,'#3d6e8e');
    R(x,21,16,4,3,'#c9d1da');R(x,60,16,12,3,'#e8edf3');R(x,5,45,12,2,'#38b6a8');R(x,56,40,16,4,'#1b1f25');
  }else if(id==='mono'){      /* vintage SLR: chrome top plate on leatherette */
    box(x,3,10,74,38,'#2a211c','#3f332b','#16110e');dots(x,3,18,74,30,'#3d2f26',3,5);
    box(x,3,6,74,10,'#c9ced6','#f4f6fa','#8b93a0');box(x,29,0,22,9,'#c9ced6','#f4f6fa','#8b93a0');R(x,35,2,10,5,'#9aa2b0');R(x,36,3,8,3,'#2a2c33');P1(x,39,4,'#e8edf3');
    R(x,6,3,8,6,'#aeb4be');R(x,6,3,8,1,'#f4f6fa');for(var u=0;u<4;u++)P1(x,7+u*2,6,'#6c7482');
    R(x,62,3,14,4,'#9aa2b0');R(x,62,3,14,1,'#f4f6fa');R(x,17,8,7,5,'#9aa2b0');R(x,17,8,7,1,'#f4f6fa');R(x,26,8,2,3,'#b8402a');
    lens(x,40,32,16,[[0,'#0a0a0d'],[1,'#c9ced6'],[3,'#5d6470'],[5,'#d5dae1'],[6,'#15161a'],[9,'#0e0f13'],[11,'#1d3550'],[13,'#2a5a78']]);
    tick(x,40,32,13,28,'#f4f6fa');R(x,36,26,3,2,'#bfeaff');R(x,44,36,2,2,'#7a3b6c');R(x,10,40,8,3,'#c9ced6');R(x,62,40,10,3,'#c9ced6');
  }else if(id==='amber'){     /* Fuji X100 style: silver over black, fixed lens, optical finder, dials */
    box(x,3,14,74,13,'#c9ced6','#f4f6fa','#8b93a0');box(x,3,27,74,19,'#1d1f24','#33363e','#0e0f12');dots(x,3,28,74,18,'#2c2f36',3,9);
    box(x,9,8,17,7,'#b9bfc8','#f4f6fa','#7e8694');for(var v=0;v<8;v++)P1(x,10+v*2,12,'#5d6470');
    box(x,54,8,13,7,'#b9bfc8','#f4f6fa','#7e8694');for(var w=0;w<5;w++)P1(x,56+w*2,12,'#5d6470');R(x,34,9,6,4,'#e07a1f');R(x,35,9,4,1,'#ffb25a');
    R(x,9,17,12,7,'#12161b');R(x,10,18,10,5,'#1c2a36');P1(x,12,19,'#7fb8d8');R(x,60,18,6,3,'#12161b');P1(x,62,18,'#e07a1f');
    lens(x,44,33,17,[[0,'#7e8694'],[1,'#c9ced6'],[3,'#f0f3f7'],[5,'#aeb4be'],[7,'#10121a'],[10,'#1d3a4a'],[12,'#2f6a78'],[14,'#102228']]);
    tick(x,44,33,13,24,'#10121a');R(x,38,28,4,2,'#c8f3f0');P1(x,41,31,'#fff');R(x,60,36,12,3,'#e07a1f');R(x,6,40,3,3,'#c9ced6');
  }else if(id==='rose'){      /* compact: rounded pastel red, small lens off to the side, flash window */
    box(x,6,14,68,31,'#e8506a','#f59ab0','#a82a44');R(x,5,16,1,27,'#e8506a');R(x,74,16,1,27,'#e8506a');R(x,6,19,68,1,'#c93a56');
    lens(x,24,31,12,[[0,'#8a96a8'],[1,'#dfe3ea'],[2,'#a9b2c0'],[4,'#14161b'],[6,'#1d2a38'],[8,'#34587a']]);R(x,19,26,4,2,'#bfe3ff');P1(x,21,28,'#fff');
    box(x,48,18,12,7,'#fff6c9','#fffdf0','#d9c874');R(x,48,18,12,7,'#fff6c9');R(x,49,19,10,5,'#fffbe0');R(x,62,19,6,5,'#14161b');P1(x,64,20,'#7fb8d8');
    R(x,56,10,10,4,'#f2d14b');R(x,56,10,10,1,'#fff0a0');R(x,12,10,6,4,'#a82a44');dots(x,44,33,26,5,'#b33048',2,7);R(x,46,40,24,3,'#fff4f6');R(x,48,41,10,1,'#e8506a');
  }else{                      /* rangefinder: black chrome, two windows and a red dot, protruding lens */
    box(x,3,12,74,34,'#17181c','#2a2c33','#0b0b0d');dots(x,3,18,74,28,'#24262c',3,11);
    box(x,3,7,74,9,'#2e3038','#5a5d68','#1a1b20');R(x,60,2,12,5,'#9aa1ad');R(x,60,2,12,1,'#e0e4ea');for(var q=0;q<5;q++)P1(x,61+q*2,5,'#3a3d46');
    R(x,10,3,8,4,'#9aa1ad');R(x,10,3,8,1,'#e0e4ea');R(x,13,11,10,6,'#0a0b0e');R(x,14,12,8,4,'#1d2a36');P1(x,15,13,'#7fb8d8');
    R(x,54,11,14,6,'#0a0b0e');R(x,55,12,12,4,'#1d2a36');P1(x,57,13,'#7fb8d8');ell(x,40,14,2,2,'#d63a2a');P1(x,39,13,'#ff9a8a');
    lens(x,40,32,16,[[0,'#0a0a0d'],[1,'#9aa1ad'],[2,'#e0e4ea'],[3,'#5a5d68'],[5,'#0d0d10'],[8,'#1a1b20'],[10,'#232f3a'],[12,'#0d1a24']]);
    tick(x,40,32,13,24,'#e0e4ea');R(x,35,26,3,2,'#bfe3ff');R(x,8,38,5,5,'#9aa1ad');
  }
  outline(o,INK);return o.c}

function arrow(x,r,dir,c){var cx=r[0]+((r[2]/2)|0),cy=r[1]+(((r[3]-1)/2)|0),i;
  for(i=0;i<3;i++){var h=(2-i)*2+1;R(x,dir>0?cx-1+i:cx+1-i,cy-(2-i),1,h,c)}}
function pbtn(x,r,dir,c){R(x,r[0],r[1],r[2],r[3],c.lo);R(x,r[0],r[1],r[2],r[3]-1,c.base);R(x,r[0],r[1],r[2],1,c.hi);R(x,r[0],r[1],1,r[3]-1,c.hi);arrow(x,r,dir,c.glyph)}
function recess(x,l,pad,col){R(x,l[0]-pad,l[1]-pad,l[2]+pad*2,l[3]+pad*2,col);R(x,l[0]-pad,l[1]-pad,l[2]+pad*2,1,'rgba(255,255,255,.18)');R(x,l[0],l[1],l[2],l[3],'#050a0d')}

function back(id){
  var o=mk(AW,AH),x=o.x,s=CAM[id],c;x.translate(1,1);
  if(id==='teal'){
    box(x,3,12,74,36,'#23282f','#3b434f','#14171c');box(x,3,8,74,6,'#2c323b','#4a525f',null);R(x,30,2,20,10,'#14171c');R(x,32,4,16,6,'#0a0b0e');R(x,34,6,12,2,'#2a2f38');
    recess(x,s.lcd,3,'#14171c');c={base:'#3b434f',hi:'#59606d',lo:'#14171c',glyph:'#e8edf3'};
    R(x,56,15,5,5,'#3b434f');R(x,64,15,5,5,'#c8402d');R(x,56,42,18,3,'#38b6a8');dots(x,3,12,4,36,'#2e343d',3,3);
  }else if(id==='mono'){
    box(x,3,10,74,38,'#2a211c','#3f332b','#16110e');dots(x,3,12,74,36,'#3d2f26',3,5);
    box(x,3,6,74,8,'#c9ced6','#f4f6fa','#8b93a0');R(x,32,1,16,6,'#aeb4be');R(x,35,3,10,3,'#14171c');R(x,62,2,14,4,'#9aa2b0');
    recess(x,s.lcd,3,'#9aa2b0');R(x,s.lcd[0]-2,s.lcd[1]-2,s.lcd[2]+4,1,'#f4f6fa');c={base:'#c9ced6',hi:'#f4f6fa',lo:'#7e8694',glyph:'#2a211c'};
    R(x,28,44,24,2,'#c9ced6');R(x,38,43,4,1,'#9aa2b0');
  }else if(id==='amber'){
    box(x,3,14,74,13,'#c9ced6','#f4f6fa','#8b93a0');box(x,3,27,74,19,'#1d1f24','#33363e','#0e0f12');dots(x,3,28,74,18,'#2c2f36',3,9);
    box(x,9,8,17,7,'#b9bfc8','#f4f6fa','#7e8694');box(x,54,8,13,7,'#b9bfc8','#f4f6fa','#7e8694');R(x,34,9,6,4,'#e07a1f');
    R(x,3,14,74,32,'#1d1f24');R(x,3,14,74,1,'#33363e');dots(x,3,15,74,31,'#2c2f36',3,9);R(x,3,12,74,3,'#c9ced6');R(x,9,6,17,7,'#b9bfc8');R(x,54,6,13,7,'#b9bfc8');R(x,34,7,6,4,'#e07a1f');
    recess(x,s.lcd,3,'#0e0f12');c={base:'#c9ced6',hi:'#f4f6fa',lo:'#7e8694',glyph:'#1d1f24'};
    R(x,52,18,3,3,'#e07a1f');R(x,56,40,16,3,'#c9ced6');
  }else if(id==='rose'){
    box(x,6,14,68,31,'#e8506a','#f59ab0','#a82a44');R(x,5,16,1,27,'#e8506a');R(x,74,16,1,27,'#e8506a');
    recess(x,s.lcd,3,'#7a1c30');c={base:'#fff0f3',hi:'#ffffff',lo:'#c93a56',glyph:'#a82a44'};
    R(x,60,15,9,6,'#f2d14b');R(x,60,15,9,1,'#fff0a0');R(x,58,40,12,2,'#fff4f6');dots(x,58,20,12,5,'#b33048',2,7);
  }else{
    box(x,3,12,74,34,'#17181c','#2a2c33','#0b0b0d');dots(x,3,18,74,28,'#24262c',3,11);box(x,3,7,74,9,'#2e3038','#5a5d68','#1a1b20');
    R(x,60,2,12,5,'#9aa1ad');R(x,10,3,8,4,'#9aa1ad');R(x,36,3,8,4,'#0a0b0e');
    recess(x,s.lcd,3,'#2e3038');c={base:'#9aa1ad',hi:'#e0e4ea',lo:'#4a4d58',glyph:'#17181c'};
    R(x,56,36,16,5,'#9aa1ad');R(x,56,36,16,1,'#e0e4ea');for(var z=0;z<6;z++)P1(x,58+z*2,39,'#4a4d58');ell(x,62,16,3,3,'#d63a2a');
  }
  pbtn(x,s.prev,-1,c);pbtn(x,s.next,1,c);
  outline(o,INK);return o.c}

/* ------------------------------------------------------------------ cassette (button beside the boombox) */
function cassette(){
  var o=mk(26,18),x=o.x;x.translate(1,1);
  R(x,0,0,24,16,'#2a2a34');R(x,0,0,24,1,'#555566');R(x,0,15,24,1,'#14141a');
  R(x,2,2,20,9,'#f0e6d2');R(x,2,2,20,3,'#d5360c');R(x,2,5,20,1,'#ee6a2c');R(x,4,7,10,1,'#b9ad92');R(x,4,9,7,1,'#b9ad92');
  R(x,6,10,12,5,'#14141a');ell(x,9,12,2,2,'#e8e0cc');ell(x,15,12,2,2,'#e8e0cc');P1(x,9,12,'#14141a');P1(x,15,12,'#14141a');
  P1(x,1,1,'#8b8b9c');P1(x,22,1,'#8b8b9c');P1(x,1,14,'#8b8b9c');P1(x,22,14,'#8b8b9c');
  outline(o,INK);return o.c}
/* the same cassette with the reels turned a quarter, for the hover spin */
function reelFrames(){return [cassette()]}

window.PArt={diary:diaryCover,cam:front,camBack:back,CAM:CAM,AW:AW,AH:AH,cassette:cassette,DIARY:DIARY,reelFrames:reelFrames};
})();
