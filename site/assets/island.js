/* folklore island — the demo's dynamic island, live on the site.
   Real peer count + join events from the tracker; ambient pull/serve
   events cycle between real ones. Collapses to a hearth pill. */
(function(){
  if(matchMedia('(max-width:960px)').matches) return;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var isl=document.createElement('div');
  isl.className='isl'; isl.setAttribute('aria-live','polite');
  isl.innerHTML =
    '<div class="isl-strip">'+'<svg class="isl-fire" viewBox="0 0 64 64" aria-hidden="true">'+'<rect width="64" height="64" rx="14" fill="#1d1813"/>'+'<g class="fl-o"><path d="M32 12.5 C34.2 18 39.6 22.6 40.9 29 C41.9 34.4 40.6 40.6 36.6 45.4 Q32 49.2 27.4 45.4 C23.4 40.6 22.1 34.4 23.1 29 C24.1 23.6 29.6 20.4 30.6 16.6 C31.1 15 31.6 13.8 32 12.5 Z" fill="#ff4f6d"/><path d="M32 22.6 C33.5 26.4 37.3 29.6 38.2 34.1 C38.9 37.9 38 42.2 35.2 44.7 Q32 47 28.8 44.7 C26 42.2 25.1 37.9 25.8 34.1 C26.5 29.8 30.4 26.6 31 24.2 C31.4 23.5 31.7 23 32 22.6 Z" fill="#ff7a3d"/></g>'+'<g class="fl-i"><path d="M32 30 C33 32.6 35.6 34.9 36.2 38 C36.7 40.6 36 43.5 34.2 45.2 Q32 46.7 29.8 45.2 C28 43.5 27.3 40.6 27.8 38 C28.3 35 30.9 32.7 31.4 31.3 C31.6 30.8 31.8 30.4 32 30 Z" fill="#f5b921"/><ellipse cx="32" cy="43.5" rx="1.9" ry="2.6" fill="#ffe9b0" opacity=".95"/></g>'+'<g stroke="#f4ecd8" stroke-width="3.2" stroke-linecap="round"><path d="M20 52 L44 47"/><path d="M20 47 L44 52"/></g>'+'<g fill="#f4ecd8"><circle cx="12" cy="38" r="4.5"/><path d="M4 53c0-5 3.5-8 8-8s8 3 8 8z"/></g>'+'<g fill="#f4ecd8"><circle cx="52" cy="38" r="4.5"/><path d="M44 53c0-5 3.5-8 8-8s8 3 8 8z"/></g>'+'</svg>'+'<span class="idot"></span><span class="isl-mini" id="islMini">folklore network</span></div>'+
    '<div class="isl-exp">'+'<svg class="isl-fire" viewBox="0 0 64 64" aria-hidden="true">'+'<rect width="64" height="64" rx="14" fill="#1d1813"/>'+'<g class="fl-o"><path d="M32 12.5 C34.2 18 39.6 22.6 40.9 29 C41.9 34.4 40.6 40.6 36.6 45.4 Q32 49.2 27.4 45.4 C23.4 40.6 22.1 34.4 23.1 29 C24.1 23.6 29.6 20.4 30.6 16.6 C31.1 15 31.6 13.8 32 12.5 Z" fill="#ff4f6d"/><path d="M32 22.6 C33.5 26.4 37.3 29.6 38.2 34.1 C38.9 37.9 38 42.2 35.2 44.7 Q32 47 28.8 44.7 C26 42.2 25.1 37.9 25.8 34.1 C26.5 29.8 30.4 26.6 31 24.2 C31.4 23.5 31.7 23 32 22.6 Z" fill="#ff7a3d"/></g>'+'<g class="fl-i"><path d="M32 30 C33 32.6 35.6 34.9 36.2 38 C36.7 40.6 36 43.5 34.2 45.2 Q32 46.7 29.8 45.2 C28 43.5 27.3 40.6 27.8 38 C28.3 35 30.9 32.7 31.4 31.3 C31.6 30.8 31.8 30.4 32 30 Z" fill="#f5b921"/><ellipse cx="32" cy="43.5" rx="1.9" ry="2.6" fill="#ffe9b0" opacity=".95"/></g>'+'<g stroke="#f4ecd8" stroke-width="3.2" stroke-linecap="round"><path d="M20 52 L44 47"/><path d="M20 47 L44 52"/></g>'+'<g fill="#f4ecd8"><circle cx="12" cy="38" r="4.5"/><path d="M4 53c0-5 3.5-8 8-8s8 3 8 8z"/></g>'+'<g fill="#f4ecd8"><circle cx="52" cy="38" r="4.5"/><path d="M44 53c0-5 3.5-8 8-8s8 3 8 8z"/></g>'+'</svg>'+
    '<div class="isl-txt">'+
      '<div class="isl-kick"><span class="idot"></span><span id="islKick"></span></div>'+
      '<div class="isl-flow" id="islFlow"></div>'+
    '</div></div>';
  document.body.appendChild(isl);
  var kick=isl.querySelector('#islKick'), flow=isl.querySelector('#islFlow'), mini=isl.querySelector('#islMini');

  var peers=null, queue=[];
  var AMBIENT=[
    {t:'pull', k:"you pulled from a peer's tree", f:'tokio-rc-send-across-await ← <span class="who">@sam-rs</span>'},
    {t:'serve',k:'peer pulled from your tree',    f:'<span class="who">@tia-async</span> ← arc-mutex-token-cache'},
    {t:'pull', k:"you pulled from a peer's tree", f:'axum-extractor-order ← <span class="who">@leo-k</span>'},
    {t:'serve',k:'peer pulled from your tree',    f:'<span class="who">@noah-go</span> ← sqlx-offline-prepare'},
    {t:'pull', k:"you pulled from a peer's tree", f:'sqlx-offline-prepare ← <span class="who">@mira-dev</span>'},
    {t:'serve',k:'peer pulled from your tree',    f:'<span class="who">@priya-rs</span> ← axum-extractor-order'},
  ];
  var ai=0;

  function idle(){
    isl.classList.remove('open','pull','serve','join');
    mini.innerHTML = peers===null ? 'folklore network' : '<b>'+peers+'</b> peers · live';
  }
  function show(ev){
    isl.classList.remove('pull','serve','join');
    isl.classList.add('open', ev.t);
    kick.textContent=ev.k;
    flow.innerHTML=ev.f;
  }
  function cycle(){
    if(document.hidden || reduced) return;
    var ev = queue.length ? queue.shift() : AMBIENT[ai++ % AMBIENT.length];
    show(ev);
    setTimeout(idle, 3600);
  }
  idle();
  setTimeout(function(){ cycle(); setInterval(cycle, 8200); }, 2500);

  /* the island narrates the session — collapsed text follows the scene */
  var NARRATE=[['last-scene','light your fire'],['ledger-scene','the reckoning'],
               ['paper-scene','the creed'],['tree-scene','the inheritance'],
               ['s-full','the exchange'],['hero-scene','folklore network']];
  var sceneName='folklore network';
  if('IntersectionObserver'in window){
    var sio=new IntersectionObserver(function(es){es.forEach(function(e){
      if(!e.isIntersecting)return;
      var c=e.target.className;
      for(var i=0;i<NARRATE.length;i++){if(c.indexOf(NARRATE[i][0])>=0){sceneName=NARRATE[i][1];break;}}
      if(!isl.classList.contains('open')) mini.innerHTML = peers===null? sceneName : '<b>'+peers+'</b> peers · '+sceneName;
    });},{threshold:.5});
    document.querySelectorAll('.scene').forEach(function(sc){sio.observe(sc);});
  }

  /* real swarm data — same tracker the hero uses */
  var seen=null;
  function short(id){ return id.length>12 ? id.slice(0,6)+'…'+id.slice(-4) : id; }
  function tick(){
    fetch('/tracker/peers?ns=folklore',{cache:'no-store'})
      .then(function(r){ if(!r.ok) throw 0; return r.json(); })
      .then(function(d){
        var ps=(d&&d.peers)||[];
        peers=ps.length;
        var ids=ps.map(function(p){return p.peerId;});
        if(seen){
          ids.filter(function(id){return seen.indexOf(id)<0;}).forEach(function(id){
            queue.push({t:'join', k:'a hand joins the fire', f:'peer <b>'+short(id)+'</b> joined the network'});
          });
        }
        seen=ids;
        if(!isl.classList.contains('open')) idle();
      })
      .catch(function(){ /* island keeps ambient cycle */ });
  }
  tick(); setInterval(tick, 6000);
})();
