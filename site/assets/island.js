/* folklore island — the demo's dynamic island, live on the site.
   Real peer count + join events from the tracker; ambient pull/serve
   events cycle between real ones. Collapses to a hearth pill. */
(function(){
  if(matchMedia('(max-width:960px)').matches) return;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var isl=document.createElement('div');
  isl.className='isl'; isl.setAttribute('aria-live','polite');
  isl.innerHTML =
    '<div class="isl-strip">'+'<svg class="isl-fire" viewBox="0 0 64 64" aria-hidden="true">'+'<rect width="64" height="64" rx="14" fill="#1d1813"/>'+'<g class="fl-o"><path d="M32 12c2.5 7-5 9.5-5 15.5a5 5 0 0 0 10 0c0-2.2-1-3.5-1-3.5 3 2 5 5 5 9.2a9 9 0 1 1-18 0c0-8 6.5-10.5 9-21.2z" fill="#ff4f6d"/></g>'+'<g class="fl-i"><path d="M32 27c1.4 3.5-2.5 4.5-2.5 8a2.6 2.6 0 0 0 5 0c0-2-1.2-2.6-1.2-3.7 1.8 5.5-1.3 7-1.3 7" fill="#f5b921"/></g>'+'<g stroke="#f4ecd8" stroke-width="3.2" stroke-linecap="round"><path d="M20 52 L44 47"/><path d="M20 47 L44 52"/></g>'+'<g fill="#f4ecd8"><circle cx="12" cy="38" r="4.5"/><path d="M4 53c0-5 3.5-8 8-8s8 3 8 8z"/></g>'+'<g fill="#f4ecd8"><circle cx="52" cy="38" r="4.5"/><path d="M44 53c0-5 3.5-8 8-8s8 3 8 8z"/></g>'+'</svg>'+'<span class="idot"></span><span class="isl-mini" id="islMini">folklore network</span></div>'+
    '<div class="isl-exp">'+'<svg class="isl-fire" viewBox="0 0 64 64" aria-hidden="true">'+'<rect width="64" height="64" rx="14" fill="#1d1813"/>'+'<g class="fl-o"><path d="M32 12c2.5 7-5 9.5-5 15.5a5 5 0 0 0 10 0c0-2.2-1-3.5-1-3.5 3 2 5 5 5 9.2a9 9 0 1 1-18 0c0-8 6.5-10.5 9-21.2z" fill="#ff4f6d"/></g>'+'<g class="fl-i"><path d="M32 27c1.4 3.5-2.5 4.5-2.5 8a2.6 2.6 0 0 0 5 0c0-2-1.2-2.6-1.2-3.7 1.8 5.5-1.3 7-1.3 7" fill="#f5b921"/></g>'+'<g stroke="#f4ecd8" stroke-width="3.2" stroke-linecap="round"><path d="M20 52 L44 47"/><path d="M20 47 L44 52"/></g>'+'<g fill="#f4ecd8"><circle cx="12" cy="38" r="4.5"/><path d="M4 53c0-5 3.5-8 8-8s8 3 8 8z"/></g>'+'<g fill="#f4ecd8"><circle cx="52" cy="38" r="4.5"/><path d="M44 53c0-5 3.5-8 8-8s8 3 8 8z"/></g>'+'</svg>'+
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
            queue.push({t:'join', k:'a hand joins the fire', f:'peer <b>'+short(id)+'</b> joined the swarm'});
          });
        }
        seen=ids;
        if(!isl.classList.contains('open')) idle();
      })
      .catch(function(){ /* island keeps ambient cycle */ });
  }
  tick(); setInterval(tick, 6000);
})();
