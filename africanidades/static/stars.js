/* Campo de estrelas compartilhado (página inicial e galeria). */
(function(){
  "use strict";

  var canvas = document.getElementById('stars');
  if (!canvas || !canvas.getContext) return;

  var ctx = canvas.getContext('2d');
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);

  /* Paleta nova: ouro africano, âmbar, creme quente e turquesa ancestral.
     A maioria das estrelas é dourada; uma minoria nasce turquesa. */
  var TINTS = [
    [242, 198, 109],  /* ouro claro        */
    [212, 162, 76],   /* ouro africano     */
    [255, 236, 200],  /* creme quente      */
    [60, 207, 197]    /* turquesa ancestral*/
  ];

  /* chance de cada tom aparecer (soma 100) */
  var TINT_WEIGHTS = [40, 30, 22, 8];

  /* Acumulado dos pesos, normalizado em 0..1 — usado por pickTint() */
  var TINT_CUMULATIVE = (function(){
    var total = TINT_WEIGHTS.reduce(function(sum, w){ return sum + w; }, 0);
    var acc = 0;
    return TINT_WEIGHTS.map(function(w){
      acc += w;
      return acc / total;
    });
  })();

  var SIZES = [
    { name: 'small',  radius: 0.45, weight: 58, glow: 0 },
    { name: 'medium', radius: 0.95, weight: 30, glow: 5 },
    { name: 'large',  radius: 1.75, weight: 12, glow: 11 }
  ];

  var SIZE_CUMULATIVE = (function(){
    var acc = [];
    var total = 0;
    SIZES.forEach(function(s){ total += s.weight; acc.push(total); });
    return acc.map(function(v){ return v / total; });
  })();

  var stars = [];
  var shooting = [];
  var sprites = [];
  var lastShot = 0;
  var nextShotIn = 3000;

  /* ---------- sprites pré-renderizados (glow sem custo por frame) ---------- */
  function buildSprites(){
    sprites = [];
    SIZES.forEach(function(size){
      var tints = [];
      TINTS.forEach(function(tint){
      var pad = size.glow + size.radius + 2;
      var size_px = Math.ceil(pad * 2 * dpr);
      var off = document.createElement('canvas');
      off.width = size_px;
      off.height = size_px;
      var c = off.getContext('2d');
      var cx = size_px / 2;

      if (size.glow > 0){
        var halo = c.createRadialGradient(cx, cx, 0, cx, cx, pad * dpr);
        halo.addColorStop(0, 'rgba(' + tint.join(',') + ',0.45)');
        halo.addColorStop(0.45, 'rgba(' + tint.join(',') + ',0.12)');
        halo.addColorStop(1, 'rgba(' + tint.join(',') + ',0)');
        c.fillStyle = halo;
        c.fillRect(0, 0, size_px, size_px);
      }

      var core = c.createRadialGradient(cx, cx, 0, cx, cx, Math.max(size.radius, 0.6) * dpr * 1.6);
      core.addColorStop(0, 'rgba(255,255,246,1)');
      core.addColorStop(0.4, 'rgba(' + tint.join(',') + ',0.95)');
      core.addColorStop(1, 'rgba(' + tint.join(',') + ',0)');
      c.fillStyle = core;
      c.beginPath();
      c.arc(cx, cx, Math.max(size.radius, 0.6) * dpr * 1.6, 0, Math.PI * 2);
      c.fill();

      /* brilho em cruz para as estrelas grandes */
      if (size.glow >= 11){
        c.strokeStyle = 'rgba(' + tint.join(',') + ',0.35)';
        c.lineWidth = Math.max(1, 0.6 * dpr);
        c.beginPath();
        c.moveTo(cx - size.glow * dpr, cx); c.lineTo(cx + size.glow * dpr, cx);
        c.moveTo(cx, cx - size.glow * dpr); c.lineTo(cx, cx + size.glow * dpr);
        c.stroke();
      }

        tints.push({ image: off, radius: size.radius, glow: size.glow, pad: pad });
      });
      sprites.push(tints);
    });
  }

  function pickSize(){
    var r = Math.random();
    for (var i = 0; i < SIZE_CUMULATIVE.length; i++){
      if (r <= SIZE_CUMULATIVE[i]) return i;
    }
    return 0;
  }

  function pickTint(){
    var r = Math.random();
    for (var i = 0; i < TINT_CUMULATIVE.length; i++){
      if (r <= TINT_CUMULATIVE[i]) return i;
    }
    return 0;
  }

  /* ---------- campo ---------- */
  function resize(){
    var rect = canvas.parentElement.getBoundingClientRect();
    var w = Math.max(rect.width, 1);
    var h = Math.max(rect.height, 1);

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    /* densidade alta: ~1 estrela a cada 1400px², com teto de 1200 */
    var count = Math.min(1200, Math.round((w * h) / 1400));
    if (count < 120) count = 120;

    stars = [];
    for (var i = 0; i < count; i++){
      var sizeIndex = pickSize();
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        sprite: sizeIndex,
        tint: pickTint(),
        scale: 0.65 + Math.random() * 0.85,
        phase: Math.random() * Math.PI * 2,
        speed: 0.35 + Math.random() * 1.5,
        depth: 0.25 + Math.random() * 0.75,
        steady: Math.random() < 0.18
      });
    }
  }

  /* ---------- estrela cadente ---------- */
  function spawnShooting(now){
    shooting.push({
      x: Math.random() * canvas.width * 0.7,
      y: Math.random() * canvas.height * 0.35,
      vx: (2.2 + Math.random() * 2.4) * dpr,
      vy: (1.4 + Math.random() * 1.8) * dpr,
      life: 1,
      fade: 0.006 + Math.random() * 0.006
    });
    lastShot = now;
    nextShotIn = 5000 + Math.random() * 11000;
  }

  function drawShooting(){
    for (var i = shooting.length - 1; i >= 0; i--){
      var s = shooting[i];
      var tail = 26 * dpr * s.life;
      var grad = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 14, s.y - s.vy * 14);
      grad.addColorStop(0, 'rgba(255,246,224,' + (0.95 * s.life).toFixed(3) + ')');
      grad.addColorStop(0.5, 'rgba(242,198,109,' + (0.7 * s.life).toFixed(3) + ')');
      grad.addColorStop(1, 'rgba(60,207,197,0)');

      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.8 * dpr;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 14, s.y - s.vy * 14);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,240,' + (0.9 * s.life).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 1.6 * dpr, 0, Math.PI * 2);
      ctx.fill();

      s.x += s.vx;
      s.y += s.vy;
      s.life -= s.fade;
      if (s.life <= 0 || s.x > canvas.width + tail || s.y > canvas.height + tail){
        shooting.splice(i, 1);
      }
    }
  }

  /* ---------- desenho ---------- */
  function draw(t){
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (var i = 0; i < stars.length; i++){
      var st = stars[i];
      var sp = sprites[st.sprite][st.tint];

      var alpha;
      if (reduceMotion || st.steady){
        alpha = 0.35 + st.depth * 0.5;
      } else {
        var tw = 0.5 + 0.5 * Math.sin(st.phase + t * 0.0009 * st.speed);
        alpha = (0.18 + tw * 0.82) * (0.45 + st.depth * 0.55);
      }

      var size = (sp.pad * 2) * st.scale * dpr;
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.drawImage(sp.image, st.x - size / 2, st.y - size / 2, size, size);
    }

    ctx.globalAlpha = 1;

    if (!reduceMotion){
      if (t - lastShot > nextShotIn) spawnShooting(t);
      drawShooting();
      requestAnimationFrame(draw);
    }
  }

  buildSprites();
  window.addEventListener('resize', resize);
  resize();

  if (reduceMotion){
    draw(0);
  } else {
    requestAnimationFrame(draw);
  }
})();
