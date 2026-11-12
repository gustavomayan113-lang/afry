(function(){
  "use strict";

  /* ---------------- mural API ---------------- */
  /* Se SUPABASE_URL está configurado → usa Supabase REST direto (Vercel)     *
   * Senão → usa /api/wall (Flask + SQLite local).                        */
  var POLL_MS = 5000;

  var SUPABASE_URL = (window.APP_CONFIG && window.APP_CONFIG.SUPABASE_URL) || "";
  var SUPABASE_ANON_KEY = (window.APP_CONFIG && window.APP_CONFIG.SUPABASE_ANON_KEY) || "";
  var USE_SUPABASE = !!SUPABASE_URL;

  var API_BASE;
  var HEADERS;

  if (USE_SUPABASE) {
    API_BASE = SUPABASE_URL.replace(/\/+$/, "").replace(/\/rest\/v1$/, "") + "/rest/v1/entries";
    HEADERS = {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": "Bearer " + SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    };
  } else {
    API_BASE = "/api/wall";
    HEADERS = { "Content-Type": "application/json" };
  }

  var grid = document.getElementById('wall-grid');
  var form = document.getElementById('wall-form');
  var nameInput = document.getElementById('f-name');
  var textInput = document.getElementById('f-text');
  var charCount = document.getElementById('char-count');
  var submitBtn = document.getElementById('submit-btn');
  var formMsg = document.getElementById('form-msg');
  var wallMsg = document.getElementById('wall-msg');

  var MAX_LEN = 220;
  var LOCAL_PASSWORD = "Carlos Marigela 13338457";

  function localAsk(acao){
    return window.prompt(
      "Digite a senha de administrador para " + acao + ".\n" +
      "A senha não é exibida. Se não souber, cancele."
    );
  }

  function localCheck(pwd){
    if (!pwd) return false;
    return pwd.trim().toLowerCase() === LOCAL_PASSWORD.toLowerCase();
  }
  textInput.addEventListener('input', function(){
    var left = MAX_LEN - textInput.value.length;
    charCount.textContent = left + ' caracteres restantes';
  });

  function escapeHtml(str){
    return String(str).replace(/[&<>"']/g, function(c){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }

  function hueFor(id){
    var str = String(id);
    var h = 0;
    for (var i=0; i<str.length; i++){ h = (h*31 + str.charCodeAt(i)) >>> 0; }
    return h % 3;
  }

  function timeAgo(iso){
    try{
      var then = new Date(iso).getTime();
      var diff = Math.max(0, Date.now() - then);
      var m = Math.floor(diff/60000);
      if (m < 1) return 'agora';
      if (m < 60) return m + ' min atrás';
      var h = Math.floor(m/60);
      if (h < 24) return h + 'h atrás';
      var d = Math.floor(h/24);
      return d + 'd atrás';
    } catch(e){ return ''; }
  }

  function renderEntries(entries){
    if (!entries.length){
      grid.innerHTML = '<p class="wall-status">O mural ainda está em silêncio. Seja a primeira voz.</p>';
      return;
    }
    var html = entries.map(function(entry){
      var text = escapeHtml(entry.text || '');
      var who = entry.name ? escapeHtml(entry.name) : 'anônimo';
      var when = timeAgo(entry.ts);
      var hue = hueFor(entry.id);
      return '<div class="entry-card" data-hue="' + hue + '" data-id="' + entry.id + '">' +
               '<button class="entry-delete" data-id="' + entry.id + '" ' +
                 'title="Remover comentário (exige senha)" aria-label="Remover comentário">&times;</button>' +
               '<p class="entry-text">' + text + '</p>' +
               '<div class="entry-meta"><span class="who">' + who + '</span><span>' + when + '</span></div>' +
             '</div>';
    }).join('');
    grid.innerHTML = html;
  }

  /* ---------------- remover comentário (admin) ---------------- */
  var wallMsgTimer = null;

  function showWallMsg(text, cls){
    if (!wallMsg) return;
    wallMsg.textContent = text;
    wallMsg.className = 'form-msg ' + (cls || '');
    if (wallMsgTimer) clearTimeout(wallMsgTimer);
    wallMsgTimer = setTimeout(function(){
      wallMsg.textContent = '';
      wallMsg.className = 'form-msg';
    }, 5000);
  }

  function deleteEntry(id){
    /* A senha nunca é exibida: só é pedida.
       auth.js é o dono da trava; LOCAL_PASSWORD é a rede de segurança caso
       ele não tenha carregado. */
    var senhaCorreta = (window.AdminAuth && window.AdminAuth.exigir)
      ? window.AdminAuth.exigir("remover este comentário")
      : localCheck(localAsk("remover este comentário"));

    if (!senhaCorreta){
      showWallMsg('Senha incorreta — o comentário continua no mural.', 'error');
      return;
    }

    var url = USE_SUPABASE ? (API_BASE + '?id=eq.' + encodeURIComponent(id)) : (API_BASE + '/' + encodeURIComponent(id));

    fetch(url, { method: 'DELETE', headers: HEADERS })
      .then(function(res){
        if (!res.ok) throw new Error('delete_falhou');
        /* No Supabase, RLS bloqueado devolve 200 com lista vazia:
           conferimos que a linha realmente saiu. */
        if (!USE_SUPABASE) return;
        return res.json().then(function(rows){
          if (!rows || !rows.length) throw new Error('nao_apagou');
        });
      })
      .then(function(){
        lastIds = '';
        loadWall(false);
        showWallMsg('Comentário removido do mural.', 'ok');
      })
      .catch(function(){
        showWallMsg('Não foi possível remover o comentário. Verifique as permissões no Supabase.', 'error');
      });
  }

  grid.addEventListener('click', function(e){
    var btn = e.target.closest ? e.target.closest('.entry-delete') : null;
    if (!btn || !grid.contains(btn)) return;
    e.preventDefault();
    deleteEntry(btn.getAttribute('data-id'));
  });

  var lastIds = '';

  function loadWall(showLoadingState){
    if (showLoadingState){
      grid.innerHTML = '<p class="wall-status">Convocando as vozes do mural…</p>';
    }

    var url = API_BASE;
    var opts = { headers: HEADERS };

    if (USE_SUPABASE) {
      url += "?order=ts.desc&limit=60";
    }

    fetch(url, opts)
      .then(function(res){
        if (!res.ok) throw new Error('bad_response');
        if (USE_SUPABASE) return res.json();
        return res.json();
      })
      .then(function(data){
        var entries;
        if (USE_SUPABASE) {
          entries = data || [];
        } else {
          entries = data.entries || [];
        }
        var ids = entries.map(function(e){ return e.id; }).join(',');
        if (ids !== lastIds){
          lastIds = ids;
          renderEntries(entries);
        }
      })
      .catch(function(){
        if (showLoadingState){
          if (USE_SUPABASE) {
            grid.innerHTML = '<p class="wall-status">Não conectou ao Supabase. Configure SUPABASE_URL e SUPABASE_ANON_KEY em static/config.js.</p>';
          } else {
            grid.innerHTML = '<p class="wall-status">Não foi possível carregar o mural. Confira se o servidor Flask está rodando.</p>';
          }
        }
      });
  }

  form.addEventListener('submit', function(e){
    e.preventDefault();
    var text = textInput.value.trim();
    if (!text){
      formMsg.textContent = 'Escreva algo antes de enviar.';
      formMsg.className = 'form-msg error';
      return;
    }

    submitBtn.disabled = true;
    formMsg.textContent = 'Enviando…';
    formMsg.className = 'form-msg';

    var name = nameInput.value.trim().slice(0, 40);

    var body;
    if (USE_SUPABASE) {
      body = JSON.stringify({ name: name || null, text: text.slice(0, MAX_LEN), ts: new Date().toISOString() });
    } else {
      body = JSON.stringify({ name: name, text: text.slice(0, MAX_LEN) });
    }

    fetch(API_BASE, {
      method: "POST",
      headers: HEADERS,
      body: body
    })
      .then(function(res){
        if (!res.ok) return res.json().then(function(body){ throw body; });
        return res.json();
      })
      .then(function(){
        formMsg.textContent = 'Sua visão entrou no mural.';
        formMsg.className = 'form-msg ok';
        form.reset();
        charCount.textContent = MAX_LEN + ' caracteres restantes';
        submitBtn.disabled = false;
        loadWall(false);
      })
      .catch(function(err){
        var message = (err && err.message) || 'Algo falhou ao enviar. Tente novamente.';
        formMsg.textContent = message;
        formMsg.className = 'form-msg error';
        submitBtn.disabled = false;
      });
  });

  loadWall(true);
  setInterval(function(){ loadWall(false); }, POLL_MS);

  /* ---------------- quiz ---------------- */
  var quizRoot = document.getElementById('quiz');
  if (quizRoot){
    var QUIZ = [
      {
        q: "O que é afrofuturismo, em poucas palavras?",
        options: [
          "Um tipo de música que só existe no espaço",
          "A cultura negra imaginando e construindo os próprios futuros",
          "Um ramo da ciência que estuda estrelas",
          "Um gênero de quadrinhos sobre super-heróis"
        ],
        answer: 1,
        why: "Afrofuturismo é a cultura negra falando do porvir: ficção, música, cinema, games, ciência e tecnologia com a experiência negra no centro."
      },
      {
        q: "Quem é conhecido como o \"mestre do cosmos\" e abriu o caminho do afrofuturismo?",
        options: [
          "Sun Ra",
          "Michael Jackson",
          "Octavia Butler",
          "Bob Marley"
        ],
        answer: 0,
        why: "Sun Ra (1914–1993) misturou jazz, egito, astrologia e espacialidade. Para ele, o universo inteiro era uma bateria de percussão."
      },
      {
        q: "Octavia Butler ficou conhecida por romances em que pessoas negras são jogadas no futuro e…",
        options: [
          "Perdem a memória e viram robôs",
          "Desistem e abandonam a Terra",
          "Têm que reconstruir a vida do zero, com a própria identidade",
          "Ganham um prêmio de milhões"
        ],
        answer: 2,
        why: "É o que Butler faz em <em>Parable of the Sower</em> e na trilogia <em>Xenogenesis</em>: sobreviver sem identidade pronta."
      },
      {
        q: "Em qual filme de 1984 uma personagem vira ciborgue e o corpo feito de metal passa a ser o centro da história?",
        options: [
          "O Exterminador do Futuro",
          "Star Wars",
          "De Volta para o Futuro",
          "Matrix"
        ],
        answer: 0,
        why: "<em>O Exterminador do Futuro</em> (1984), de James Cameron, consolidou a ideia de corpo reconstruído por máquinas."
      },
      {
        q: "O filme <em>Pantera Negra</em> (2018) mostra qual país africano fictício?",
        options: [
          "Wakanda",
          "Gotham",
          "Nárvore",
          "Krypton"
        ],
        answer: 0,
        why: "Wakanda, o país de T'Challa, o Pantera Negra, virou um dos maiores sucessos de bilheteria do cinema negro."
      },
      {
        q: "Na palavra \"desterrar\", usada por Octavia Butler, a ideia é:",
        options: [
          "Ficar parado esperando o tempo passar",
          "Sair de um lugar e ainda assim levar o mundo e a si mesmo junto",
          "Desistir de tudo que é difícil",
          "Trocar de planeta sem sentir falta"
        ],
        answer: 1,
        why: "É a travessia do exílio reescrita: a mudança de lugar não apaga quem você é nem o que você carrega."
      },
      {
        q: "O que é \"nome de batismo\" no afrofuturismo?",
        options: [
          "O sobrenome que a pessoa recebe no registro",
          "A história de origem do personagem: a lenda que diz de onde ele veio",
          "O nome do planeta onde a história acontece",
          "A música que toca na abertura do filme"
        ],
        answer: 1,
        why: "Nome de batismo é a <em>origin story</em> do personagem — a mitologia pessoal que dá sentido à sua chegada ao mundo."
      },
      {
        q: "Qual destas é uma característica bem afrofuturista?",
        options: [
          "O futuro visto a partir da experiência negra, com mitologia e ciência juntas",
          "Um mundo onde ninguém nunca muda de lugar",
          "Personagens que nunca enfrentam nenhum problema",
          "Histórias que só acontecem no passado"
        ],
        answer: 0,
        why: "É essa mistura — memória, magia, viagem e tecnologia — que define o movimento. O resto é só um planeta qualquer."
      }
    ];

    var quizStep = document.getElementById('quiz-step');
    var quizQuestion = document.getElementById('quiz-question');
    var quizOptions = document.getElementById('quiz-options');
    var quizFeedback = document.getElementById('quiz-feedback');
    var quizNext = document.getElementById('quiz-next');
    var quizFill = document.getElementById('quiz-progress-fill');
    var quizScoreLive = document.getElementById('quiz-score-live');
    var quizNote = document.getElementById('quiz-note');

    var LETTERS = ['A', 'B', 'C', 'D'];
    var current = 0;
    var score = 0;
    var answered = false;

    function plural(n, one, many){
      return n === 1 ? one : many;
    }

    function renderQuestion(){
      var item = QUIZ[current];
      answered = false;

      quizStep.textContent = 'Pergunta ' + (current + 1) + ' de ' + QUIZ.length;
      quizScoreLive.textContent = score + (score === 1 ? ' acerto' : ' acertos');
      quizFill.style.width = ((current / QUIZ.length) * 100) + '%';

      quizQuestion.innerHTML = item.q;

      quizOptions.innerHTML = item.options.map(function(text, i){
        return '<button type="button" class="quiz-option" data-index="' + i + '">' +
                 '<span class="mark">' + LETTERS[i] + '</span>' +
                 '<span class="opt-text">' + text + '</span>' +
               '</button>';
      }).join('');

      quizFeedback.textContent = '';
      quizFeedback.className = 'quiz-feedback';
      quizNote.textContent = '';
      quizNext.textContent = 'Próxima pergunta';
      quizNext.disabled = true;
    }

    quizOptions.addEventListener('click', function(e){
      if (answered) return;
      var btn = e.target.closest ? e.target.closest('.quiz-option') : null;
      if (!btn || !quizOptions.contains(btn)) return;

      var item = QUIZ[current];
      var chosen = parseInt(btn.getAttribute('data-index'), 10);
      if (isNaN(chosen)) return;

      answered = true;
      var isCorrect = chosen === item.answer;
      var buttons = quizOptions.querySelectorAll('.quiz-option');

      for (var i = 0; i < buttons.length; i++){
        var el = buttons[i];
        var idx = parseInt(el.getAttribute('data-index'), 10);
        el.disabled = true;
        el.classList.add('is-locked');
        if (idx === item.answer){
          el.classList.add('correct');
          el.querySelector('.mark').textContent = '✓';
        } else if (idx === chosen){
          el.classList.add('wrong');
          el.querySelector('.mark').textContent = '✕';
        }
      }

      if (isCorrect){
        score++;
        quizFeedback.className = 'quiz-feedback ok';
        quizFeedback.innerHTML = '<strong>Isso mesmo.</strong> ' + item.why;
        quizScoreLive.textContent = score + (score === 1 ? ' acerto' : ' acertos');
      } else {
        quizFeedback.className = 'quiz-feedback err';
        quizFeedback.innerHTML = '<strong>Não foi essa.</strong> A resposta certa era <strong>' +
          LETTERS[item.answer] + ') ' + item.options[item.answer] + '</strong>. ' + item.why;
      }

      quizFill.style.width = (((current + 1) / QUIZ.length) * 100) + '%';
      quizNext.disabled = false;
    });

    quizNext.addEventListener('click', function(){
      if (quizNext.dataset.restart === '1'){
        delete quizNext.dataset.restart;
        current = 0;
        score = 0;
        renderQuestion();
        return;
      }

      if (current < QUIZ.length - 1){
        current++;
        renderQuestion();
        return;
      }

      var finalScore = score;
      var pct = Math.round((finalScore / QUIZ.length) * 100);
      current = 0;
      score = 0;

      quizStep.textContent = 'Resultado';
      quizFill.style.width = '100%';
      quizScoreLive.textContent = finalScore + (finalScore === 1 ? ' acerto' : ' acertos');
      quizQuestion.textContent = pct === 100
        ? 'Nota máxima. Você voou longe.'
        : (pct >= 50 ? 'Muito bem — o destino está garantido.' : 'Bom começo. Dá para ir mais longe ainda.');
      quizOptions.innerHTML = '';
      quizFeedback.className = 'quiz-feedback ' + (pct >= 50 ? 'ok' : 'err');
      quizFeedback.innerHTML = 'Você acertou <strong>' + finalScore + ' de ' + QUIZ.length + '</strong> ' +
        plural(finalScore, 'pergunta', 'perguntas') + ' (' + pct + '%). ' +
        'Se quiser refazer, é só clicar abaixo.';
      quizNote.textContent = '';
      quizNext.textContent = 'Recomeçar o quiz';
      quizNext.disabled = false;
      quizNext.dataset.restart = '1';
    });

    renderQuestion();
  }
})();
