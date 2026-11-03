/* Página principal de Capri en Android (hecha a partir de movil.js, el modo "teléfono" de la versión de PC).
   Diferencia clave: en lugar de hablar con una PC por Wi-Fi, usa el backend local (android-backend.js).
   Los bloques "ORIGINAL" se copian sin cambios de movil.js al generar este archivo. */
(async () => {
  const $ = id => document.getElementById(id);
  const TXT = {
    es: ['Hablar', 'Acciones', '¿Qué hago?', 'Voz activada', 'Voz apagada', 'Más', 'Idioma / Language'],
    en: ['Talk', 'Actions', 'What should I do?', 'Voice on', 'Voice off', 'More', 'Idioma / Language'],
    fr: ['Parler', 'Actions', 'Que faire ?', 'Voix activée', 'Voix coupée', 'Plus', 'Idioma / Language'],
    pt: ['Falar', 'Ações', 'O que eu faço?', 'Voz ligada', 'Voz desligada', 'Mais', 'Idioma / Language'],
    ru: ['Говорить', 'Действия', 'Что мне делать?', 'Голос включён', 'Голос выключен', 'Ещё', 'Idioma / Language'],
    uk: ['Говорити', 'Дії', 'Що мені робити?', 'Голос увімкнено', 'Голос вимкнено', 'Ще', 'Idioma / Language'],
    ar: ['تحدث', 'إجراءات', 'ماذا أفعل؟', 'الصوت مفعل', 'الصوت متوقف', 'المزيد', 'Idioma / Language'],
    ja: ['話す', 'アクション', '何をすればいい？', '音声オン', '音声オフ', 'その他', 'Idioma / Language']
  };
  const IDX = { 'Hablar': 0, 'Acciones': 1, '¿Qué hago?': 2 };
  let lang = (navigator.language || 'es').slice(0, 2).toLowerCase(); if (!TXT[lang]) lang = 'es';
  const T = i => TXT[lang][i];
  const tr = (es, en) => TRAD.traducir(lang, es, en);
  const traducir = () => document.querySelectorAll('[data-t]').forEach(e => { e.textContent = T(IDX[e.dataset.t]); });
  traducir();
  if (lang === 'ar') document.documentElement.dir = 'rtl';

  // ===== ORIGINAL (movil.js): el "marco" del personaje: se mueve por la pantalla como la ventana en la PC =======
  /*@@MARCO@@*/

  // ---------- el cerebro local ----------
  let backend;
  const invocar = (canal, ...args) => backend.invocar(canal, args);
  const ajustarConfig = c => {
    lang = c.idioma || 'es'; if (!TXT[lang]) lang = 'es'; traducir(); document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    let voz = null; try { voz = localStorage.getItem('capriVoz'); } catch { }
    return { ...c, altoPersonaje: alto(), voz: voz == null ? c.voz : voz === '1', oidoAtajo: false, manosLibres: false };
  };
  backend = await crearBackendCapri({ emitir: (canal, dato) => emitir(canal, canal === 'config' && dato ? ajustarConfig(dato) : dato) });

  const api = window.CAPRI_API = {
    // ===== ORIGINAL (movil.js): posición del puntero y movimiento del personaje ===============================
    /*@@API_PUNTERO@@*/
    /*@@API_MOV@@*/
    ignorar: () => { }, enfocar: () => { }, abrirOido: () => { },
    cambiarIdioma: async l => { await invocar('cambiar-idioma', l); location.reload(); },
    menu: extra => abrirHoja(extra),
    cargarModelo: async n => new Uint8Array(await (await fetch('/modelos/' + n + '.glb')).arrayBuffer()),
    config: async () => ajustarConfig(await invocar('config')),
    cfgSet: d => invocar('cfg-set', d),
    chat: d => invocar('chat', d), redactar: p => invocar('redactar', p), cambiarNombre: n => invocar('cambiar-nombre', n),
    memoria: () => invocar('memoria'), memoriaGuardar: m => invocar('memoria-guardar', m), memoriaHecho: t => invocar('memoria-hecho', t),
    memoriaRespuesta: d => invocar('memoria-respuesta', d), memoriaFrase: t => invocar('memoria-frase', t),
    memoriaOlvidar: t => invocar('memoria-olvidar', t), memoriaExtraer: d => invocar('memoria-extraer', d),
    accion: a => invocar('accion', a), recordatorioCancelar: id => invocar('recordatorio-cancelar', id),
    piperHablar: d => invocar('piper-hablar', d),
    vidaLeer: () => invocar('vida-leer'), vidaGuardar: c => invocar('vida-guardar', c), vidaFecha: f => invocar('vida-fecha', f),
    vidaPendiente: d => invocar('vida-pendiente', d), vidaDiario: d => invocar('vida-diario', d), clima: () => invocar('clima'), ciudad: c => invocar('ciudad', c),
    guardarClave: d => invocar('guardar-clave', d), ollamaModelos: u => invocar('ollama-modelos', u),
    // micrófono: reconocedor de voz de Android (reemplaza a Whisper)
    oidoListo: async () => true, oidoTranscribir: async () => ({ error: 'no-disponible' }),
    _androidSTT: true, escucharNativo: d => backend.escuchar(d && d.idioma),
    on: (canal, fn) => { (oyentes[canal] = oyentes[canal] || []).push(fn); }
  };

  // ---------- hoja de abajo: animaciones, juegos, ajustes ----------
  const enMarco = () => marco.contentWindow;
  const boton = (texto, fn, cont) => { const b = document.createElement('button'); b.textContent = texto; b.onclick = fn; cont.appendChild(b); return b; };
  $('bChat').onclick = () => emitir('accion', 'chat');
  $('bMenu').onclick = () => { try { enMarco().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); } catch { } };
  const cerrarHoja = () => $('hoja').classList.remove('on');
  $('hoja').onclick = e => { if (e.target.id === 'hoja') cerrarHoja(); };

  const sheet = $('sheet'), sheetFrame = $('sheetFrame');
  function abrirSheet(archivo, titulo) { $('sheetTitulo').textContent = titulo; sheetFrame.src = archivo; sheet.classList.add('on'); cerrarHoja(); }
  window.__cerrarHoja = () => { sheet.classList.remove('on'); sheetFrame.src = 'blank.html'; };
  $('sheetCerrar').onclick = () => window.__cerrarHoja();
  window.__atras = () => {                                  // botón "atrás" de Android
    if (sheet.classList.contains('on')) { window.__cerrarHoja(); return true; }
    if ($('hoja').classList.contains('on')) { cerrarHoja(); return true; }
    return false;
  };

  async function abrirHoja(extra) {
    const g = $('anims'), m = $('mas'); g.innerHTML = ''; m.innerHTML = '';
    for (const a of (extra && extra.anims) || []) boton(a.nombre, () => { cerrarHoja(); emitir('accion', 'anim:' + a.id); }, g);
    const c = await invocar('config');
    const juegos = [['ppt', tr('Piedra, papel o tijera', 'Rock, paper, scissors')], ['adivinanza', tr('Adivinanza', 'Riddle')], ['trivia', 'Trivia'], ['atrapar', tr('Atrapá el glitch', 'Catch the glitch')]];
    for (const [id, n] of juegos) boton('🎮 ' + n, () => { cerrarHoja(); emitir('accion', 'juego:' + id); }, m);
    boton(tr('Modo concentración (25 min)', 'Focus mode (25 min)'), () => { cerrarHoja(); emitir('accion', 'pomodoro'); }, m);
    boton(tr('Resumen del día', 'Daily summary'), () => { cerrarHoja(); emitir('accion', 'resumen'); }, m);
    const casilla = (activo, es, en, clave) => boton((activo ? '☑ ' : '☐ ') + tr(es, en), async () => { await invocar('cfg-set', { [clave]: !activo }); cerrarHoja(); }, m);
    casilla(!!c.silencio, 'Modo silencioso (solo habla si le hablás)', 'Quiet mode (only talks when you talk to her)', 'silencio');
    casilla(c.pasear !== false, 'Pasear por la pantalla', 'Wander around the screen', 'pasear');
    casilla(c.frases !== false, 'Decir frases', 'Say phrases', 'frases');
    casilla(c.autoAprender !== false, 'Aprender sola de las charlas', 'Learn on her own from chats', 'autoAprender');
    boton('⚙ ' + tr('Configurar charla (Ollama / Claude)…', 'Chat settings (Ollama / Claude)…'), () => abrirSheet('clave.html', tr('Configurar charla', 'Chat settings')), m);
    boton(tr('Su memoria…', 'Her memory…'), () => abrirSheet('memoria.html', tr('Su memoria', 'Her memory')), m);
    boton(tr('Su mente (red neuronal)…', 'Her mind (neural network)…'), () => abrirSheet('mente.html', tr('Su mente', 'Her mind')), m);
    boton(tr('Su vida (ánimo, logros, diario)…', 'Her life (mood, achievements, diary)…'), () => abrirSheet('vida.html', tr('Su vida', 'Her life')), m);
    boton(tr('Ayudante para clases…', 'Class helper…'), () => abrirSheet('ayudante.html', tr('Ayudante para clases', 'Class helper')), m);
    const titulo = document.createElement('h3'); titulo.textContent = T(6); titulo.style.gridColumn = '1 / -1'; m.appendChild(titulo);
    for (const [l, n] of Object.entries(TRAD.NOMBRES)) boton((l === c.idioma ? '● ' : '') + n, async () => { await invocar('cambiar-idioma', l); location.reload(); }, m);
    $('infoHoja').textContent = '';
    $('hoja').classList.add('on');
  }

  function pintarVoz(v) { $('bVoz').innerHTML = `<i data-px="${v ? 'parlante' : 'mudo'}"></i>`; $('bVoz').classList.toggle('off', !v); }
  $('bVoz').onclick = async () => {
    let v = true; try { v = localStorage.getItem('capriVoz') !== '1'; localStorage.setItem('capriVoz', v ? '1' : '0'); } catch { }
    pintarVoz(v); aviso(T(v ? 3 : 4));
    emitir('config', ajustarConfig(await invocar('config')));
  };
  let avisoT; function aviso(t) { const a = $('aviso'); a.textContent = t; a.style.display = 'block'; clearTimeout(avisoT); avisoT = setTimeout(() => a.style.display = 'none', 2600); }

  // ---------- arrancar ----------
  const c0 = await api.config();
  let v0 = null; try { v0 = localStorage.getItem('capriVoz'); } catch { } pintarVoz(v0 == null ? true : v0 === '1');
  addEventListener('resize', () => medir(false));
  medir(true); marco.src = '/pj.html';
  // primera vez: sin cerebro elegido no puede charlar → se abren directo los ajustes (Ollama o clave de Claude)
  let vista = null; try { vista = localStorage.getItem('capriPrimera'); } catch { }
  if (!c0.puedeChatear && !vista) { try { localStorage.setItem('capriPrimera', '1'); } catch { } setTimeout(() => abrirSheet('clave.html', tr('Configurar charla', 'Chat settings')), 2500); }
})();
