/* folklore island: the demo's dynamic island, live on the site.
   Real peer count + join events from the tracker; ambient pull/serve
   events cycle between real ones. Collapses to a hearth pill. */
(function(){
  if(matchMedia('(max-width:960px)').matches) return;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var isl=document.createElement('div');
  isl.className='isl'; isl.setAttribute('aria-live','polite');
  var LOGO=(function(){var sc=document.currentScript&&document.currentScript.src;return sc?sc.replace(/island\.js.*$/,'folklore-logo.svg'):'assets/folklore-logo.svg';})();
  isl.innerHTML =
    '<div class="isl-strip"><img class="isl-fire" src="'+LOGO+'" alt=""><span class="idot"></span><span class="isl-mini" id="islMini">folklore network</span></div>'+
    '<div class="isl-exp"><img class="isl-fire" src="'+LOGO+'" alt="">'+
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

  /* the island narrates the session: collapsed text follows the scene */
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

  /* real swarm data: same tracker the hero uses */
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
