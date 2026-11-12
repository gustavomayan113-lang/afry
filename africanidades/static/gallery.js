(function(){
  "use strict";

  /* ============== CONFIG ============== */
  var SUPABASE_URL = (window.APP_CONFIG && window.APP_CONFIG.SUPABASE_URL) || "";
  var SUPABASE_ANON_KEY = (window.APP_CONFIG && window.APP_CONFIG.SUPABASE_ANON_KEY) || "";
  var USE_SUPABASE = !!SUPABASE_URL;

  var STORAGE_URL;
  var BASE;
  var HEADERS;

  /* Quantas fotos aparecem por ano antes de apertar "carregar mais" */
  var PAGINA = 24;

  if (USE_SUPABASE) {
    var cleanUrl = SUPABASE_URL.replace(/\/+$/, "");
    STORAGE_URL = cleanUrl + "/storage/v1";
    BASE = cleanUrl + "/rest/v1/gallery_photos";
    HEADERS = {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": "Bearer " + SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    };
  } else {
    BASE = "/api/gallery";
    HEADERS = { "Content-Type": "application/json" };
  }

  /* ============== ELEMENTOS ============== */
  var blocks = document.getElementById('gallery-blocks');
  var form = document.getElementById('gallery-form');
  var yearInput = document.getElementById('g-year');
  var fileInput = document.getElementById('g-file');
  var captionInput = document.getElementById('g-caption');
  var submitBtn = document.getElementById('submit-btn');
  var formMsg = document.getElementById('form-msg');
  var yearNav = document.getElementById('year-nav');
  var yearSuggestions = document.getElementById('year-suggestions');
  var yearHint = document.getElementById('year-hint');
  var formTitle = document.getElementById('gallery-form-title');
  var toolbarMsg = document.getElementById('gallery-msg');
  var addBtn = document.getElementById('add-photo-btn');
  var addIcon = document.getElementById('add-icon');
  var formCard = document.getElementById('gallery-form-card');
  var cancelBtn = document.getElementById('cancel-add');

  var toolbarMsgTimer = null;
  var allPhotos = [];
  var visiveis = {};   /* ano -> quantas fotos já estão na grade */
  var listaAberta = []; /* fotos do ano aberto no lightbox */

  /* ============== UTILIDADES ============== */
  function escapeHtml(str){
    return String(str).replace(/[&<>"']/g, function(c){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
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

  /* A miniatura mora numa pasta "thumbs/" dentro do mesmo ano.
     Se a foto não tiver miniatura, usamos a completa. */
  function thumbUrl(url){
    if (!url) return url;
    var m = url.match(/^(.*\/gallery\/)(\d{4})\/(.+)$/);
    if (m) return m[1] + m[2] + '/thumbs/' + m[3];
    m = url.match(/^(.*\/static\/uploads\/)(.+)$/);
    if (m) return m[1] + 'thumbs/' + m[2];
    return url;
  }

  function basename(url){
    try{ return decodeURIComponent(String(url).split('/').pop()); }
    catch(e){ return 'foto'; }
  }

  /* ============== SENHA ============== */
  /* A senha mora em static/auth.js e nunca é mostrada na tela.
     Se o auth.js não tiver carregado, usamos a cópia local abaixo para que
     o botão "Adicionar foto" nunca pare de funcionar. */
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

  function askPassword(actionText){
    return (window.AdminAuth && window.AdminAuth.ask)
      ? window.AdminAuth.ask(actionText)
      : localAsk(actionText);
  }

  function checkPassword(pwd){
    return (window.AdminAuth && window.AdminAuth.check)
      ? window.AdminAuth.check(pwd)
      : localCheck(pwd);
  }

  /* ============== AGRUPAR POR ANO ============== */
  var BASE_YEARS = [2026, 2025, 2024];

  function groupByYear(photos){
    var groups = {};
    var order = [];

    BASE_YEARS.forEach(function(y){
      groups[y] = [];
      order.push(y);
    });

    photos.forEach(function(p){
      var y = p.year || 0;
      if (!groups[y]){
        groups[y] = [];
        order.push(y);
      }
      groups[y].push(p);
    });

    order.sort(function(a, b){ return b - a; });
    return order.map(function(y){ return { year: y, photos: groups[y] }; });
  }

  /* ============== RENDER BLOCOS ============== */
  function renderBlocks(photos){
    if (!photos.length && !BASE_YEARS.length){
      blocks.innerHTML = '<p class="wall-status">Nenhuma edição ainda. Clique em <strong>Adicionar foto</strong>, escolha o ano e a primeira edição nasce aqui.</p>';
      return;
    }

    var groups = groupByYear(photos);

    blocks.innerHTML = groups.map(function(group){
      var total = group.photos.length;
      var label = total === 1 ? 'foto' : 'fotos';
      var mostradas = Math.min(visiveis[group.year] || PAGINA, total);
      var restantes = total - mostradas;

      var inner;
      if (!total){
        inner = '<p class="gallery-empty">Nenhuma foto em ' + group.year + ' ainda. ' +
                '<button type="button" class="link-btn year-add" data-year="' + group.year + '">' +
                'Adicionar a primeira foto desta edição</button>.</p>';
      } else {
        var cards = group.photos.slice(0, mostradas).map(function(photo){
          var grande = escapeHtml(photo.image_url || '');
          var mini = escapeHtml(thumbUrl(photo.image_url));
          var cap = photo.caption ? escapeHtml(photo.caption) : '';
          var when = timeAgo(photo.ts);
          var hue = hueFor(photo.id);

          return '<div class="gallery-card" data-id="' + photo.id + '" data-hue="' + hue + '">' +
                   '<button class="gallery-delete" data-id="' + photo.id + '" aria-label="Remover foto">&times;</button>' +
                   '<button class="gallery-open" data-id="' + photo.id + '" aria-label="Ampliar foto">' +
                     '<img class="gallery-img" src="' + mini + '" data-full="' + grande + '" ' +
                     'alt="' + (cap || basename(grande)) + '" loading="lazy" decoding="async">' +
                   '</button>' +
                   (cap ? '<p class="gallery-caption">' + cap + '</p>' : '') +
                   (cap ? '<div class="gallery-meta"><span>enviado ' + when + '</span></div>' : '') +
                 '</div>';
        }).join('');

        inner = '<div class="gallery-grid">' + cards + '</div>';

        if (restantes > 0){
          inner += '<div class="gallery-more"><button type="button" class="btn btn-ghost btn-sm load-more" data-year="' +
                   group.year + '">Carregar mais ' + Math.min(restantes, PAGINA) + ' de ' + restantes + '</button></div>';
        }
      }

      return '<section class="year-block" id="ano-' + group.year + '">' +
               '<header class="year-block-head">' +
                 '<div class="year-block-title">' +
                   '<h3>Edição ' + group.year + '</h3>' +
                   '<span class="year-count">' + total + ' ' + label + '</span>' +
                 '</div>' +
                 (total ? '<button class="btn btn-ghost btn-sm year-add" data-year="' + group.year + '">+ Adicionar foto de ' + group.year + '</button>' : '') +
               '</header>' +
               inner +
             '</section>';
    }).join('');

    ligarEventos();
  }

  function ligarEventos(){
    blocks.querySelectorAll('.gallery-delete').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        deletePhoto(this.getAttribute('data-id'));
      });
    });

    blocks.querySelectorAll('.gallery-open').forEach(function(btn){
      btn.addEventListener('click', function(){
        var card = btn.closest('.gallery-card');
        var id = btn.getAttribute('data-id');
        var ano = card ? (card.closest('.year-block') || {}).id : '';
        var grupo = groupByYear(allPhotos).filter(function(g){
          return 'ano-' + g.year === ano;
        })[0];
        abrirLightbox(id, grupo ? grupo.photos : []);
      });
    });

    blocks.querySelectorAll('.load-more').forEach(function(btn){
      btn.addEventListener('click', function(){
        var ano = parseInt(btn.getAttribute('data-year'), 10);
        visiveis[ano] = (visiveis[ano] || PAGINA) + PAGINA;
        renderBlocks(allPhotos);
        var alvo = document.getElementById('ano-' + ano);
        if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    blocks.querySelectorAll('.year-add').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.preventDefault();
        try {
          openForm(parseInt(btn.getAttribute('data-year'), 10) || null);
        } catch (err) {
          showToolbarMsg('Erro ao abrir o formulário: ' + ((err && err.message) || err), 'error');
        }
      });
    });

    /* Se a miniatura não existir, cai na foto completa */
    blocks.querySelectorAll('.gallery-img').forEach(function(img){
      img.addEventListener('error', function(){
        var full = img.getAttribute('data-full');
        if (full && img.src !== full){
          img.src = full;
        }
      });
    });
  }

  /* ============== LIGHTBOX ============== */
  var lightbox = null;
  var lbImg, lbCap, lbCount, lbIndex = 0;

  function criarLightbox(){
    if (lightbox) return;
    lightbox = document.createElement('div');
    lightbox.className = 'lightbox';
    lightbox.setAttribute('role', 'dialog');
    lightbox.setAttribute('aria-modal', 'true');
    lightbox.hidden = true;
    lightbox.innerHTML =
      '<button class="lightbox-close" aria-label="Fechar">&times;</button>' +
      '<button class="lightbox-prev" aria-label="Foto anterior">&#8249;</button>' +
      '<figure class="lightbox-figure">' +
        '<img class="lightbox-img" alt="">' +
        '<figcaption class="lightbox-cap"></figcaption>' +
      '</figure>' +
      '<button class="lightbox-next" aria-label="Próxima foto">&#8250;</button>' +
      '<span class="lightbox-count"></span>';

    document.body.appendChild(lightbox);

    lbImg = lightbox.querySelector('.lightbox-img');
    lbCap = lightbox.querySelector('.lightbox-cap');
    lbCount = lightbox.querySelector('.lightbox-count');

    lightbox.querySelector('.lightbox-close').addEventListener('click', fecharLightbox);
    lightbox.querySelector('.lightbox-prev').addEventListener('click', function(e){ e.stopPropagation(); mover(-1); });
    lightbox.querySelector('.lightbox-next').addEventListener('click', function(e){ e.stopPropagation(); mover(1); });
    lightbox.addEventListener('click', function(e){
      if (e.target === lightbox || e.target.classList.contains('lightbox-figure')) fecharLightbox();
    });

    document.addEventListener('keydown', function(e){
      if (!lightbox || lightbox.hidden) return;
      if (e.key === 'Escape') fecharLightbox();
      if (e.key === 'ArrowLeft') mover(-1);
      if (e.key === 'ArrowRight') mover(1);
    });
  }

  function mostrar(posicao){
    if (!listaAberta.length) return;
    lbIndex = (posicao + listaAberta.length) % listaAberta.length;
    var foto = listaAberta[lbIndex];
    lbImg.src = foto.image_url;
    lbImg.alt = foto.caption || basename(foto.image_url);
    lbCap.textContent = foto.caption || '';
    lbCap.hidden = !foto.caption;
    lbCount.textContent = (lbIndex + 1) + ' / ' + listaAberta.length;
    lightbox.hidden = false;
    document.body.classList.add('lightbox-open');
  }

  function abrirLightbox(id, lista){
    listaAberta = lista || [];
    if (!listaAberta.length) return;
    criarLightbox();
    var posicao = 0;
    for (var i = 0; i < listaAberta.length; i++){
      if (String(listaAberta[i].id) === String(id)){ posicao = i; break; }
    }
    mostrar(posicao);
  }

  function mover(passo){
    mostrar(lbIndex + passo);
  }

  function fecharLightbox(){
    if (!lightbox) return;
    lightbox.hidden = true;
    lbImg.src = '';
    document.body.classList.remove('lightbox-open');
  }

  /* ============== RENDER ÍNDICE DE ANOS ============== */
  function renderYearNav(photos){
    var groups = groupByYear(photos);

    yearNav.innerHTML = groups.map(function(g){
      return '<button class="year-btn" data-year="' + g.year + '">' + g.year + '</button>';
    }).join('');

    yearSuggestions.innerHTML = groups.map(function(g){
      return '<option value="' + g.year + '"></option>';
    }).join('');

    yearHint.textContent = 'Edições que já existem: ' +
      groups.map(function(g){ return g.year; }).join(', ') + '.';

    yearNav.querySelectorAll('.year-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var target = document.getElementById('ano-' + btn.getAttribute('data-year'));
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function hueFor(id){
    var str = String(id);
    var h = 0;
    for (var i=0; i<str.length; i++){ h = (h*31 + str.charCodeAt(i)) >>> 0; }
    return h % 3;
  }

  /* ============== CARREGAR GALERIA ============== */
  function loadGallery(){
    blocks.innerHTML = '<p class="wall-status">Carregando o arquivo de fotos…</p>';

    var url = BASE;
    if (USE_SUPABASE) {
      url += "?select=id,year,image_url,caption,ts&order=id.desc&limit=1000";
    }

    fetch(url, { headers: HEADERS })
      .then(function(res){
        if (!res.ok) throw new Error('bad_response');
        return res.json();
      })
      .then(function(data){
        allPhotos = data || [];
        visiveis = {};
        renderYearNav(allPhotos);
        renderBlocks(allPhotos);
      })
      .catch(function(){
        if (USE_SUPABASE) {
          blocks.innerHTML = '<p class="wall-status">Não conectou ao Supabase. Configure SUPABASE_URL e SUPABASE_ANON_KEY em static/config.js.</p>';
        } else {
          blocks.innerHTML = '<p class="wall-status">Não foi possível carregar a galeria. Confira se o servidor Flask está rodando.</p>';
        }
      });
  }

  /* ============== ADICIONAR FOTO ============== */
  /* O formulário só abre se a senha digitada for exatamente a senha de
     administrador. Senão ele continua fechado e o botão volta ao estado
     bloqueado — não existe caminho para abrir o form sem a senha. */
  function showToolbarMsg(text, cls){
    toolbarMsg.textContent = text;
    toolbarMsg.className = 'form-msg ' + (cls || '');
    if (toolbarMsgTimer) clearTimeout(toolbarMsgTimer);
    toolbarMsgTimer = setTimeout(function(){
      toolbarMsg.textContent = '';
      toolbarMsg.className = 'form-msg';
    }, 5000);
  }

  function openForm(year){
    var pwd = askPassword("adicionar uma foto");
    if (!checkPassword(pwd)){
      formCard.style.display = 'none';
      addIcon.textContent = '🔒 Adicionar foto';
      formTitle.textContent = 'Adicionar nova foto';
      showToolbarMsg('Senha incorreta — o formulário continua fechado.', 'error');
      return;
    }

    addIcon.textContent = '✓ Adicionar foto';
    formCard.style.display = 'block';
    form.reset();
    formMsg.textContent = '';
    formMsg.className = 'form-msg';
    showToolbarMsg('', '');

    if (year){
      yearInput.value = year;
      formTitle.textContent = 'Adicionar foto na edição ' + year;
    } else {
      formTitle.textContent = 'Adicionar nova foto';
    }

    formCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    yearInput.focus();
  }

  addBtn.addEventListener('click', function(){
    try {
      openForm(null);
    } catch (err) {
      showToolbarMsg('Erro ao abrir o formulário: ' + ((err && err.message) || err), 'error');
    }
  });

  cancelBtn.addEventListener('click', function(){
    formCard.style.display = 'none';
    addIcon.textContent = '🔒 Adicionar foto';
    formTitle.textContent = 'Adicionar nova foto';
    form.reset();
    formMsg.textContent = '';
    showToolbarMsg('Adição cancelada. O formulário foi fechado.', '');
  });

  /* ============== UPLOAD DE ARQUIVO ============== */
  /* Corrige orientação EXIF (fotos de celular) antes do upload */
  function readExifOrientation(file){
    return new Promise(function(resolve){
      var reader = new FileReader();
      reader.onload = function(e){
        var view = new DataView(e.target.result);
        var orientation = 1;
        try {
          if (view.getUint16(0, false) === 0xFFD8) {
            var len = view.byteLength;
            var offset = 2;
            while (offset < len){
              if (view.getUint8(offset) !== 0xFF) break;
              var marker = view.getUint8(offset + 1);
              if (marker === 0xE1) {
                if (view.getUint32(offset + 4, false) === 0x45786966) {
                  var tiffOff = view.getUint32(offset + 10, false) + offset + 8;
                  var bigEnd = view.getUint16(tiffOff, false) === 0x4D4D;
                  var ifd0 = tiffOff + view.getUint32(tiffOff + 4, !bigEnd);
                  var n = view.getUint16(ifd0, !bigEnd);
                  for (var i = 0; i<n; i++){
                    var entry = ifd0 + 2 + (i*12);
                    if (view.getUint16(entry, !bigEnd) === 0x0112){
                      orientation = view.getUint16(entry + 10, !bigEnd);
                      break;
                    }
                  }
                }
              }
              offset += 2 + view.getUint16(offset + 2, false);
            }
          }
        } catch(e){}
        resolve(orientation);
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function correctOrientation(file){
    return readExifOrientation(file).then(function(orientation){
      if (orientation === 1 || orientation === 0 || !orientation) return file;

      return new Promise(function(resolve){
        var img = new Image();
        var url = URL.createObjectURL(file);
        img.onload = function(){
          var w = img.width, h = img.height;
          var canvas = document.createElement('canvas');
          var ctx = canvas.getContext('2d');
          if (orientation > 4){ canvas.width = h; canvas.height = w; }
          else { canvas.width = w; canvas.height = h; }

          ctx.save();
          switch(orientation){
            case 2: ctx.transform(-1, 0, 0, 1, w, 0); break;
            case 3: ctx.transform(-1, 0, 0, -1, w, h); break;
            case 4: ctx.transform(1, 0, 0, -1, 0, h); break;
            case 5: ctx.transform(0, 1, 1, 0, 0, -h); break;
            case 6: ctx.transform(0, 1, -1, 0, h, 0); break;
            case 7: ctx.transform(0, -1, -1, 0, w, h); break;
            case 8: ctx.transform(0, -1, 1, 0, 0, w); break;
          }
          ctx.drawImage(img, 0, 0);
          ctx.restore();

          canvas.toBlob(function(blob){
            URL.revokeObjectURL(url);
            resolve(blob);
          }, 'image/jpeg', 0.9);
        };
        img.src = url;
      });
    });
  }

  function uploadFile(file){
    console.log('uploadFile: iniciando upload para Supabase Storage');

    /* Para Supabase: corrige orientação, upload direto ao Storage bucket */
    if (USE_SUPABASE) {
      var fileName;
      return correctOrientation(file).then(function(blob){
        fileName = Date.now() + '_' + file.name;
        var formData = new FormData();
        formData.append('file', blob, fileName);

        return fetch(STORAGE_URL + '/object/gallery/' + fileName, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
          },
          body: formData
        });
      }).then(function(res){
        console.log('Upload storage:', res.status, res.statusText);
        if (!res.ok) {
          throw new Error('Upload falhou (' + res.status + '). Rode a migration 20240102000000_create_gallery.sql no Supabase.');
        }
        return res.json();
      }).then(function(){
        return STORAGE_URL + '/object/public/gallery/' + fileName;
      });
    }

    /* Para Flask local: envia o arquivo ao endpoint (que gera a miniatura) */
    return fetch('/api/upload', {
      method: 'POST',
      body: (function(){
        var fd = new FormData();
        fd.append('file', file);
        return fd;
      })()
    }).then(function(res){
      if (!res.ok) throw new Error('upload_falhou');
      return res.json();
    }).then(function(data){
      return data.url;
    });
  }

  /* ============== SUBMIT DO FORM ============== */
  form.addEventListener('submit', function(e){
    e.preventDefault();
    formMsg.textContent = '';

    var file = fileInput.files[0];
    if (!file){
      formMsg.textContent = 'Selecione uma imagem.';
      formMsg.className = 'form-msg error';
      return;
    }

    var yearVal = parseInt(yearInput.value, 10);
    if (!yearVal){
      formMsg.textContent = 'Insira um ano válido.';
      formMsg.className = 'form-msg error';
      return;
    }

    var caption = captionInput.value.trim().slice(0, 120);

    submitBtn.disabled = true;
    formMsg.textContent = 'Enviando imagem…';
    formMsg.className = 'form-msg';

    console.log('Submit form: year=' + yearVal + ', file=' + file.name);

    uploadFile(file)
      .then(function(imageUrl){
        var payload = {
          year: yearVal,
          image_url: imageUrl,
          caption: caption
        };

        return fetch(BASE, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify(payload)
        });
      })
      .then(function(res){
        if (!res.ok) {
          return res.text().then(function(txt){ throw new Error(txt || 'bad_response'); });
        }
        return res.json().catch(function(){ return {}; });
      })
      .then(function(){
        formMsg.textContent = 'Foto adicionada na edição ' + yearVal + '!';
        formMsg.className = 'form-msg ok';
        var addedYear = yearVal;
        form.reset();
        submitBtn.disabled = false;
        formCard.style.display = 'none';
        addIcon.textContent = '🔒 Adicionar foto';
        formTitle.textContent = 'Adicionar nova foto';
        visiveis[addedYear] = PAGINA;
        loadGallery();
        var target = document.getElementById('ano-' + addedYear);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
      .catch(function(err){
        var message = (err && err.message) || 'Algo falhou. Tente novamente.';
        formMsg.textContent = message;
        formMsg.className = 'form-msg error';
        submitBtn.disabled = false;
      });
  });

  /* ============== DELETAR FOTO ============== */
  function deletePhoto(id){
    var pwd = askPassword("remover esta foto");
    if (!checkPassword(pwd)){
      alert('Senha incorreta. A foto não foi removida.');
      return;
    }

    if (USE_SUPABASE) {
      fetch(BASE + '?id=eq.' + id, {
        method: 'DELETE',
        headers: HEADERS
      }).then(function(res){
        if (!res.ok) throw new Error('delete_falhou');
        /* RLS bloqueado devolve 200 com lista vazia: conferimos a remoção. */
        return res.json().then(function(rows){
          if (!rows || !rows.length) throw new Error('nao_apagou');
        });
      }).then(function(){
        fecharLightbox();
        loadGallery();
      }).catch(function(){
        alert('Não foi possível remover a foto. Verifique as permissões no Supabase.');
      });
    } else {
      fetch(BASE + '/' + id, {
        method: 'DELETE',
        headers: HEADERS
      }).then(function(res){
        if (!res.ok) throw new Error('delete_falhou');
        fecharLightbox();
        loadGallery();
      }).catch(function(){
        alert('Não foi possível remover a foto.');
      });
    }
  }

  /* ============== INICIALIZA ============== */
  loadGallery();
})();
