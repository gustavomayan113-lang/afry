/* Trilha sonora do Africanidades — toca em loop o tempo todo.
 *
 * Como o site tem várias páginas, cada uma carrega este script e o áudio
 * recomeça do início a cada navegação. O que este script garante é que,
 * depois de ligá-lo uma vez, ele **retoma sozinho** em todas as páginas:
 * a escolha fica guardada em localStorage.
 *
 * Por causa da regra de autoplay dos navegadores, som só começa depois de
 * um clique do visitante. O botão flutuante serve para isso.
 */
(function(){
  "use strict";

  var CHAVE = "africanidades:audio";
  var ARQUIVO = "/static/audio/audioafricano.mpeg";

  /* O .mpeg é MP3 (MPEG-2.5 Layer III), que toca em todos os navegadores,
     inclusive Safari e iOS — o Opus em .ogg não tocava lá. */
  var FONTES = [
    { src: ARQUIVO, type: "audio/mpeg" }
  ];

  var audio = document.getElementById("trilha-africanidades");
  if (!audio){
    audio = document.createElement("audio");
    audio.id = "trilha-africanidades";
    audio.loop = true;
    audio.preload = "auto";
    audio.setAttribute("aria-hidden", "true");
    FONTES.forEach(function(fonte){
      var source = document.createElement("source");
      source.src = fonte.src;
      source.type = fonte.type;
      audio.appendChild(source);
    });
    document.body.appendChild(audio);
  }

  var botao = document.createElement("button");
  botao.type = "button";
  botao.className = "trilha-toggle";
  botao.setAttribute("aria-pressed", "false");
  document.body.appendChild(botao);

  function querSom(){
    try { return window.localStorage.getItem(CHAVE) === "on"; }
    catch(e){ return false; }
  }

  function guardar(valor){
    try { window.localStorage.setItem(CHAVE, valor ? "on" : "off"); }
    catch(e){ /* modo privado: segue sem guardar */ }
  }

  function pintar(tocando){
    botao.setAttribute("aria-pressed", tocando ? "true" : "false");
    botao.setAttribute("aria-label", tocando ? "Pausar a trilha sonora" : "Tocar a trilha sonora");
    botao.querySelector(".trilha-texto").textContent = tocando ? "Pausar" : "Trilha";
    botao.classList.toggle("is-tocando", tocando);
  }

  function tocar(){
    var promessa = audio.play();
    if (promessa && typeof promessa.catch === "function"){
      promessa.catch(function(){
        /* navegador bloqueou: fica com o botão visível para o visitante ligar */
        pintar(false);
      });
    }
  }

  function desligar(){
    audio.pause();
    guardar(false);
    pintar(false);
  }

  function ligar(){
    guardar(true);
    tocar();
    pintar(true);
  }

  botao.innerHTML =
    '<span class="trilha-icone" aria-hidden="true"></span>' +
    '<span class="trilha-texto">Trilha</span>';

  botao.addEventListener("click", function(){
    if (audio.paused) ligar(); else desligar();
  });

  audio.addEventListener("play", function(){ pintar(true); });
  audio.addEventListener("pause", function(){ pintar(audio.ended === false && !audio.paused); });

  if (querSom()){
    pintar(true);
    tocar();
    /* Se o navegador exigir um gesto antes de deixar tocar, aproveitamos
       o primeiro clique/tecla do visitante em vez de esperar ele achar o botão. */
    function noPrimeiroGesto(){
      if (!audio.paused) return;
      audio.play().catch(function(){});
      window.removeEventListener("pointerdown", noPrimeiroGesto, true);
      window.removeEventListener("keydown", noPrimeiroGesto, true);
    }
    window.addEventListener("pointerdown", noPrimeiroGesto, true);
    window.addEventListener("keydown", noPrimeiroGesto, true);
  } else {
    pintar(false);
  }

  /* Voltando pelo botão "voltar" do navegador (bfcache), o áudio volta
     pausado mesmo com a escolha salva. */
  window.addEventListener("pageshow", function(){
    if (querSom() && audio.paused) tocar();
  });
})();
