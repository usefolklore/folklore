/* folklore island — the demo's dynamic island, live on the site.
   Real peer count + join events from the tracker; ambient pull/serve
   events cycle between real ones. Collapses to a hearth pill. */
(function(){
  if(matchMedia('(max-width:960px)').matches) return;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var isl=document.createElement('div');
  isl.className='isl'; isl.setAttribute('aria-live','polite');
  isl.innerHTML =
    '<div class="isl-strip">'+'<svg class="isl-fire" viewBox="0 0 64 64" aria-hidden="true">'+'<rect width="64" height="64" rx="14" fill="#1d1813"/>'+'<g class="fl-o"><path d="M32 13C34.2 19 40 24 41 31c.8 6.6-1.2 12-5.4 14.6Q32 47.3 28.4 45.6C24.3 43 22.4 38 23.2 33s5.8-8.2 7-12.2c.6-2.4 1.3-5.2 1.8-7.8Z" fill="#ff4f6d"/><path d="M32 24c1.6 3.5 5.2 6.8 5.6 11.4.4 4.2-1.4 8-4.2 9.5Q32 45.6 30.6 44.9c-2.8-1.5-4.4-5.1-4-9.3.4-4.6 3.8-8 5.4-11.6Z" fill="#ff7a3d"/></g>'+'<g class="fl-i"><path d="M32 31c1 2.8 3.4 5.4 3.4 8.8 0 3.2-1.6 5-3.4 5.2-1.8-.2-3.4-2-3.4-5.2 0-3.4 2.4-6 3.4-8.8Z" fill="#f5b921"/><ellipse cx="32" cy="41.5" rx="2" ry="2.8" fill="#ffe9b0" opacity=".95"/></g>'+'<g stroke="#f4ecd8" stroke-width="3.2" stroke-linecap="round"><path d="M20 52 L44 47"/><path d="M20 47 L44 52"/></g>'+'<g fill="#f4ecd8"><circle cx="12" cy="38" r="4.5"/><path d="M4 53c0-5 3.5-8 8-8s8 3 8 8z"/></g>'+'<g fill="#f4ecd8"><circle cx="52" cy="38" r="4.5"/><path d="M44 53c0-5 3.5-8 8-8s8 3 8 8z"/></g>'+'</svg>'+'<span class="idot"></span><span class="isl-mini" id="islMini">folklore network</span></div>'+
    '<div class="isl-exp">'+'<svg class="isl-fire" viewBox="0 0 64 64" aria-hidden="true">'+'<rect width="64" height="64" rx="14" fill="#1d1813"/>'+'<g class="fl-o"><path d="M32 13C34.2 19 40 24 41 31c.8 6.6-1.2 12-5.4 14.6Q32 47.3 28.4 45.6C24.3 43 22.4 38 23.2 33s5.8-8.2 7-12.2c.6-2.4 1.3-5.2 1.8-7.8Z" fill="#ff4f6d"/><path d="M32 24c1.6 3.5 5.2 6.8 5.6 11.4.4 4.2-1.4 8-4.2 9.5Q32 45.6 30.6 44.9c-2.8-1.5-4.4-5.1-4-9.3.4-4.6 3.8-8 5.4-11.6Z" fill="#ff7a3d"/></g>'+'<g class="fl-i"><path d="M32 31c1 2.8 3.4 5.4 3.4 8.8 0 3.2-1.6 5-3.4 5.2-1.8-.2-3.4-2-3.4-5.2 0-3.4 2.4-6 3.4-8.8Z" fill="#f5b921"/><ellipse cx="32" cy="41.5" rx="2" ry="2.8" fill="#ffe9b0" opacity=".95"/></g>'+'<g stroke="#f4ecd8" stroke-width="3.2" stroke-linecap="round"><path d="M20 52 L44 47"/><path d="M20 47 L44 52"/></g>'+'<g fill="#f4ecd8"><circle cx="12" cy="38" r="4.5"/><path d="M4 53c0-5 3.5-8 8-8s8 3 8 8z"/></g>'+'<g fill="#f4ecd8"><circle cx="52" cy="38" r="4.5"/><path d="M44 53c0-5 3.5-8 8-8s8 3 8 8z"/></g>'+'</svg>'+
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
