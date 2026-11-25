/* Games loader. Keeps the card games (and the PeerJS library) off every other page: nothing here is fetched until
   someone opens #/games. The game code itself is plain ES modules in assets/games/. */
(function(){
'use strict';
var peer=null;
function loadPeer(){
  if(window.Peer)return Promise.resolve();
  if(peer)return peer;
  peer=new Promise(function(ok,fail){
    var s=document.createElement('script');s.src='vendor/peerjs.min.js?v=1';
    s.onload=ok;s.onerror=function(){peer=null;fail(new Error('peerjs'))};
    document.head.appendChild(s);
  });
  return peer;
}
window.Games={
  /* mount(root, {sub:'hub'|'rummy'|'jelly', params:URLSearchParams, config:{...}}) -> cleanup function */
  mount:function(root,opts){
    var dead=false,stop=null;
    root.innerHTML='<p class="g-hint" role="status">Loading…</p>';
    /* Sticky Jelly is a single-player puzzle: no PeerJS, no card engine, just its own two modules. */
    var jelly=opts&&opts.sub==='jelly';
    var load=jelly?import('./games/jelly.js?v=2'):Promise.all([loadPeer().catch(function(){}),import('./games/ui.js?v=5')]).then(function(r){return r[1]});
    load.then(function(m){
      if(!dead)stop=m.mount(root,opts);
    }).catch(function(){
      if(!dead)root.innerHTML='<p class="g-alert" role="alert">The games could not load. Check your connection and refresh the page.</p>';
    });
    return function(){dead=true;if(stop)stop()};
  }
};
})();
