/* =====================================================================================================
   BACKEND DE CAPRI PARA ANDROID  (archivo generado por tools/preparar_assets.py: no lo edites a mano,
   editá tools/android-backend.template.js y volvé a generarlo)

   En la versión de PC, el "cerebro" de Capri (chat con Ollama/Claude, memoria, vida, acciones) vive en el proceso
   principal de Electron (main.js, vida.js, acciones.js). En Android no hay Electron ni Node: acá corre el mismo código
   dentro de la página, con un pequeño "simulador" de Node (fs, path, ipcMain) y la red/voz/avisos hechos por Kotlin
   (window.CapriNative, ver NativeBridge.kt).

   - Los bloques marcados "ORIGINAL" son texto copiado SIN CAMBIOS de main.js / acciones.js / vida.js.
   - Lo demás (configuración, red, acciones de Android) es código nuevo.
   ===================================================================================================== */
(function () {
  'use strict';

  window.crearBackendCapri = async function crearBackendCapri({ emitir }) {
    const N = window.CapriNative || null;           // null si se abre en un navegador de escritorio (pruebas)
    const TRAD = window.TRAD;

    // ---------- almacenamiento ----------
    const LS = {
      get(k) { try { return localStorage.getItem('capri:' + k); } catch { return null; } },
      set(k, v) { try { localStorage.setItem('capri:' + k, v); } catch (e) { console.warn('almacenamiento:', e); } }
    };

    // ---------- red: todo pasa por Kotlin (sin CORS ni bloqueo de http:// en la red local) ----------
    let idPedido = 1;
    const pendientes = new Map();
    window.__nativoRespuesta = (id, b64) => {
      const f = pendientes.get(id); if (!f) return; pendientes.delete(id);
      let o;
      try { o = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)))); } catch { o = { error: 'respuesta' }; }
      f(o);
    };
    const llamarNativo = (fn, esperaMax = 0) => new Promise(res => {
      const id = idPedido++; pendientes.set(id, res);
      if (esperaMax) setTimeout(() => { if (pendientes.delete(id)) res({ error: 'nada' }); }, esperaMax);
      try { fn(id); } catch (e) { pendientes.delete(id); res({ error: String(e && e.message || e) }); }
    });
    async function netFetch(url, op = {}) {
      const cabeceras = op.headers || {}, ms = (op.signal && op.signal.__ms) || op.timeout || 60000;
      let r;
      if (N && N.http) r = await llamarNativo(id => N.http(id, op.method || 'GET', url, JSON.stringify(cabeceras), typeof op.body === 'string' ? op.body : '', ms));
      else {                                       // navegador de escritorio (solo para probar)
        try { const x = await window.fetch(url, { method: op.method || 'GET', headers: cabeceras, body: op.body }); r = { status: x.status, body: await x.text() }; }
        catch (e) { r = { error: String(e && e.message || e) }; }
      }
      if (r.error) throw new Error(r.error);
      return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => r.body, json: async () => JSON.parse(r.body) };
    }

    // ---------- pequeño simulador de Node/Electron para poder usar vida.js y main.js tal cual ----------
    const manejadores = new Map();
    const ipcMain = { handle: (canal, fn) => manejadores.set(canal, fn), on: () => { } };
    const BrowserWindow = { getAllWindows: () => [] };
    const app = { getPath: () => '/datos' };
    const path = { join: (...a) => a.join('/') };
    const fs = {
      readFileSync: p => { const v = LS.get('f:' + p); if (v == null) { const e = new Error('ENOENT: ' + p); e.code = 'ENOENT'; throw e; } return v; },
      writeFileSync: (p, d) => LS.set('f:' + p, String(d)),
      existsSync: p => LS.get('f:' + p) != null,
      mkdirSync: () => { }
    };
    const AbortSignal = { timeout: ms => ({ __ms: ms }) };     // netFetch lee __ms
    const fetch = netFetch;

    // ---------- configuración ----------
    let cfg, vida = null, mc = null, tray = null, acciones = null;
    const remoto = { emitir: (canal, dato) => emitir(canal, dato) };      // main.js avisa cambios de memoria por acá
    const idiomaInicial = () => { const l = (navigator.language || 'es').slice(0, 2).toLowerCase(); return TRAD.IDIOMAS.includes(l) ? l : 'es'; };
    const CONFIG_DEF = { idioma: idiomaInicial(), nombre: 'Capri', personaje: 'roja', tamano: 'mediana', pasear: true, frases: true, silencio: false, tiempoGlobo: 'normal',
      fija: '', fijaX: null, portapapeles: false, proveedor: 'ollama', ollamaUrl: 'http://localhost:11434', ollamaModelo: '', modelo: 'claude-haiku-5-5',
      autoAprender: true, voz: true, vozModo: 'todo', vozNombre: '', vozVolumen: 1, vozMotor: 'windows', oidoSilencio: 3000, pausas: 60 };
    function leerConfig() {
      try { cfg = { ...CONFIG_DEF, ...JSON.parse(LS.get('config') || '{}') }; } catch { cfg = { ...CONFIG_DEF }; }
      cfg.personaje = 'roja';          // un solo aspecto
      cfg.vozMotor = 'windows';        // = la voz del sistema (en Android: el motor de texto a voz del teléfono)
      cfg.manosLibres = false; cfg.oidoAtajo = false; cfg.portapapeles = false;
    }
    const guardarConfig = () => LS.set('config', JSON.stringify(cfg));
    const obtenerClave = () => { try { return (N ? N.secretGet('apiKey') : LS.get('apiKey')) || null; } catch { return null; } };
    const guardarClaveSecreta = c => { try { if (N) N.secretSet('apiKey', c || ''); else LS.set('apiKey', c || ''); } catch (e) { console.warn(e); } };
    const configPublica = () => ({ ...cfg, apiKey: undefined, tieneClave: !!obtenerClave(), altoPersonaje: 320,
      puedeChatear: cfg.proveedor === 'ollama' ? !!cfg.ollamaModelo : !!obtenerClave() });
    const enviarConfig = () => emitir('config', configPublica());

    leerConfig();

    // ===== ORIGINAL (main.js): idioma de la IA ===================================================================
    /*@@SLICE_TRIA@@*/
    // ===== ORIGINAL (main.js): Ollama (lista de modelos) ============================================================
    /*@@SLICE_OLLAMA@@*/
    // ===== ORIGINAL (main.js): chat con Ollama / Claude, redactar notas, cambiar nombre ===========================
    /*@@SLICE_CHAT@@*/
    // ===== ORIGINAL (main.js): memoria que aprende ==================================================================
    /*@@SLICE_MEM@@*/

    // ---------- manejadores propios de Android ----------
    ipcMain.handle('config', () => configPublica());
    ipcMain.handle('guardar-clave', (_e, d) => {
      if (d.clave !== undefined) guardarClaveSecreta((d.clave || '').trim() || null);
      for (const k of ['modelo', 'proveedor', 'ollamaUrl', 'ollamaModelo']) if (typeof d[k] === 'string') cfg[k] = d[k].trim();
      guardarConfig(); enviarConfig();
      return configPublica();
    });
    ipcMain.handle('cambiar-idioma', (_e, l) => { if (!TRAD.IDIOMAS.includes(l) || cfg.idioma === l) return cfg.idioma; cfg.idioma = l; guardarConfig(); return l; });
    ipcMain.handle('cfg-set', (_e, d) => {            // interruptores del menú del teléfono
      for (const k of ['silencio', 'pasear', 'frases', 'autoAprender', 'tiempoGlobo', 'vozModo', 'vozVolumen', 'vozNombre', 'pausas', 'oidoSilencio']) if (d && k in d) cfg[k] = d[k];
      guardarConfig(); enviarConfig(); return configPublica();
    });
    ipcMain.handle('chat', (_e, { sistema, mensajes }) => llamarIA(sistema + textoMemoria() + (acciones ? acciones.descripcionIA() : ''), mensajes, { max: 400 }));
    ipcMain.handle('oido-listo', () => true);                                   // el reconocedor de voz es el de Android
    ipcMain.handle('piper-hablar', () => ({ error: 'no-disponible' }));        // sin Piper: se usa la voz del sistema

    // ===== ORIGINAL (vida.js, completo): ánimo, logros, diario, fechas, clima ======================================
    const fuenteVida = await (await window.fetch('vida.js')).text();
    {
      const modulo = { exports: {} };
      const requerir = n => ({ path, fs })[n];
      new Function('require', 'module', 'exports', 'fetch', 'AbortSignal', fuenteVida + '\n//# sourceURL=vida.js')(requerir, modulo, modulo.exports, netFetch, AbortSignal);
      vida = modulo.exports({ app, ipcMain, BrowserWindow, screen: null, obtenerCfg: () => cfg, guardarCfg: guardarConfig, llamarIA,
        alEvento: (canal, dato) => emitir(canal, dato) });
    }

    // =====================================================================================================
    //  ACCIONES EN EL TELÉFONO  (reemplazan a acciones.js, que abre programas de Windows/Mac/Linux)
    // =====================================================================================================
    // ===== ORIGINAL (acciones.js): nombres y alias de programas en los 8 idiomas ==================================
    /*@@ACC_DATOS@@*/
    const L = () => (AVISO[IDI()] ? IDI() : 'es');
    const ENG = () => IDI() !== 'es';
    const A = {
      programas: [
        { id: 'calc', nombre: 'Calculadora', alias: ['calculadora', 'calc', 'calculator'], nativo: 'calc' },
        { id: 'camara', nombre: 'Cámara', alias: ['camara', 'cámara', 'camera', 'caméra', 'câmera', 'камера', 'камеру', 'カメラ', 'الكاميرا'], nativo: 'camera' },
        { id: 'config', nombre: 'Configuración', alias: ['configuracion', 'ajustes', 'settings'], nativo: 'settings' },
        { id: 'galeria', nombre: 'Galería', alias: ['galeria', 'galería', 'gallery', 'galerie', 'fotos', 'photos'], nativo: 'gallery' },
        { id: 'musica', nombre: 'Música', alias: ['musica', 'música', 'music', 'musique', 'reproductor'], nativo: 'music' },
        { id: 'mapas', nombre: 'Mapas', alias: ['mapas', 'mapa', 'maps', 'cartes', 'карты', '地図'], nativo: 'maps' },
        { id: 'contactos', nombre: 'Contactos', alias: ['contactos', 'contacts', 'contatos', 'контакты', '連絡先'], nativo: 'contacts' },
        { id: 'calendario', nombre: 'Calendario', alias: ['calendario', 'calendar', 'agenda', 'calendrier', 'календарь', 'カレンダー'], nativo: 'calendar' },
        { id: 'reloj', nombre: 'Reloj', alias: ['reloj', 'alarmas', 'clock', 'alarms', 'horloge', 'relógio', 'relogio', 'часы', '時計'], nativo: 'clock' },
        { id: 'descargas', nombre: 'Descargas', alias: ['descargas', 'downloads'], nativo: 'downloads' },
        { id: 'navegador', nombre: 'Navegador', alias: ['navegador', 'internet', 'chrome', 'firefox'], url: 'https://www.google.com' }
      ],
      carpetas: [],
      sitios: [
        { id: 'youtube', nombre: 'YouTube', alias: ['youtube', 'yutu'], url: 'https://www.youtube.com' },
        { id: 'google', nombre: 'Google', alias: ['google'], url: 'https://www.google.com' },
        { id: 'gmail', nombre: 'Gmail', alias: ['gmail', 'correo', 'mail', 'mi correo'], url: 'https://mail.google.com' },
        { id: 'drive', nombre: 'Google Drive', alias: ['drive', 'google drive'], url: 'https://drive.google.com' },
        { id: 'whatsapp', nombre: 'WhatsApp', alias: ['whatsapp', 'wasap'], url: 'https://wa.me/' },
        { id: 'wikipedia', nombre: 'Wikipedia', alias: ['wikipedia', 'wiki'], url: 'https://es.wikipedia.org' }
      ]
    };
    // ===== ORIGINAL (acciones.js): buscar un programa o sitio por su nombre =======================================
    /*@@SLICE_RESOLVER@@*/

    const nombreVisible = x => (NOMBRES_L[L()] || {})[x.id] || x.nombre;
    async function buscar(que) {
      if (!que || !que.trim()) return { ok: false, error: 'vacio' };
      if (!N || !N.openUrl('https://www.google.com/search?q=' + encodeURIComponent(que.trim()))) return { ok: false, error: 'url' };
      return { ok: true, nombre: que.trim() };
    }
    async function abrir(que) {
      const r = resolver(que);
      if (!r) {                                    // no está en la lista: lo busca en internet
        const q = (que || '').trim().replace(/^(?:el|la|los|las|the|le|les|l'|o|a|os|as)\s+/i, '');
        if (!q) return { ok: false, error: 'desconocido', que };
        await buscar(q); return { ok: true, clase: 'busqueda', nombre: q };
      }
      const { clase, x } = r;
      if (x.url) { if (!/^https?:\/\//i.test(x.url)) return { ok: false, error: 'url' }; if (!N || !N.openUrl(x.url)) return { ok: false, error: 'no-existe', nombre: nombreVisible(x) }; }
      else if (x.nativo) { if (!N || !N.openApp(x.nativo)) return { ok: false, error: 'no-existe', nombre: nombreVisible(x) }; }
      else return { ok: false, error: 'no-existe', nombre: nombreVisible(x) };
      return { ok: true, clase, nombre: nombreVisible(x) };
    }
    async function web(url) {
      url = String(url || '').trim();
      if (!/^https?:\/\/[\w.-]+\.[a-z]{2,}/i.test(url)) return { ok: false, error: 'url' };
      if (!N || !N.openUrl(url)) return { ok: false, error: 'url' };
      return { ok: true, clase: 'sitio', nombre: url.replace(/^https?:\/\/(www\.)?/i, '').split(/[/?#]/)[0] };
    }
    function media(que) {
      if (!['play', 'pausa', 'siguiente', 'anterior', 'subir', 'bajar', 'silencio'].includes(que)) return { ok: false, error: 'tipo' };
      try { return N && N.media(que) ? { ok: true } : { ok: false, error: 'media' }; } catch { return { ok: false, error: 'media' }; }
    }

    // ---------- notas: se guardan en la carpeta de la app y se ofrecen a tu app de notas ----------
    let ultimaNota = null;
    const pad = n => String(n).padStart(2, '0');
    function nombreNota(titulo, texto) {
      const d = new Date(), sello = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}`;
      const base = (titulo || texto.split('\n')[0]).replace(/[\\/:*?"<>|]/g, '').slice(0, 40).trim() || 'nota';
      return `${sello} ${base}`;
    }
    function guardarNota(n) {
      let archivo = '';
      try { if (N) { archivo = N.saveNote(n.nombre, n.texto); N.shareText(n.titulo || n.texto.split('\n')[0].slice(0, 40), n.texto); } } catch (e) { console.warn(e); }
      return archivo;
    }
    function nota(texto, titulo) {
      texto = (texto || '').trim(); if (!texto) return { ok: false, error: 'vacio' };
      ultimaNota = { nombre: nombreNota(titulo, texto), texto, titulo };
      return { ok: true, archivo: guardarNota(ultimaNota) };
    }
    function agregarANota(texto) {
      texto = (texto || '').trim(); if (!texto) return { ok: false, error: 'vacio' };
      if (!ultimaNota) return nota(texto);
      ultimaNota.texto += '\n' + texto;
      return { ok: true, archivo: guardarNota(ultimaNota), agregado: true };
    }

    // ---------- recordatorios: temporizador en la página + alarma de Android (suena aunque cierres la app) ----------
    let recs = []; const timers = new Map();
    try { recs = JSON.parse(LS.get('recordatorios') || '[]'); } catch { recs = []; }
    const guardarRecs = () => LS.set('recordatorios', JSON.stringify(recs));
    function disparar(r, tarde) {
      timers.delete(r.id); recs = recs.filter(x => x.id !== r.id); guardarRecs();
      try { if (N) N.cancelReminder(r.id); } catch { }
      emitir('recordatorio', { texto: r.texto, tarde: !!tarde });
    }
    function programar(r) {
      const ms = r.cuando - Date.now();
      if (ms <= 0) return disparar(r, ms < -60000);
      timers.set(r.id, setTimeout(() => disparar(r), Math.min(ms, 2 ** 31 - 1)));
      // la alarma nativa va 1,5 s después: si la app está abierta, la página avisa primero y la cancela
      try { if (N) N.scheduleReminder(r.id, r.cuando + 1500, AVISO[L()][0], r.texto || AVISO[L()][2]); } catch (e) { console.warn(e); }
    }
    function recordatorio(cuando, texto) {
      if (!cuando || cuando < Date.now() - 1000) return { ok: false, error: 'hora' };
      const r = { id: nuevoId(), cuando, texto: (texto || '').trim() };
      recs.push(r); guardarRecs(); programar(r);
      return { ok: true, cuando };
    }
    function cancelar(id) {
      const quitar = id === 'todos' ? recs.slice() : recs.filter(r => r.id === id);
      for (const r of quitar) { clearTimeout(timers.get(r.id)); timers.delete(r.id); try { if (N) N.cancelReminder(r.id); } catch { } }
      recs = recs.filter(r => !quitar.includes(r)); guardarRecs();
      return { ok: true, cantidad: quitar.length };
    }

    ipcMain.handle('recordatorio-cancelar', (_e, id) => cancelar(id));
    ipcMain.handle('accion', async (_e, a) => {
      try {
        switch (a && a.tipo) {
          case 'abrir': return await abrir(a.que || '');
          case 'buscar': return await buscar(a.que || '');
          case 'nota': return nota(a.texto, a.titulo);
          case 'agregar-nota': return agregarANota(a.texto);
          case 'recordatorio': return recordatorio(a.cuando || (a.minutos ? Date.now() + a.minutos * 60000 : 0), a.texto);
          case 'cancelar-recordatorios': return cancelar('todos');
          case 'listar-recordatorios': return { ok: true, recordatorios: recs };
          case 'media': return media(a.que);
          case 'web': return await web(a.url);
          default: return { ok: false, error: 'tipo' };
        }
      } catch (e) { return { ok: false, error: String(e.message || e) }; }
    });

    // lo que la IA sabe que puede hacer (mismo formato "ACCION: {json}" que en la PC)
    acciones = {
      descripcionIA: () => {
        const n = l => l.map(x => x.nombre).join(', ');
        if (ENG()) return '\n\nACTIONS ON THE PHONE: you can help the user do things on their phone. If they CLEARLY ask for one of these, ' +
          'answer with a short sentence and at the end a line exactly like this: ACCION: {json}\n' +
          `- open something: {"tipo":"abrir","que":"name"} (apps: ${n(A.programas)}; sites: ${n(A.sitios)})\n` +
          '- search the internet: {"tipo":"buscar","que":"text to search"}\n' +
          '- save a note (the phone offers to send it to a notes app): {"tipo":"nota","texto":"full content, already written"}. If they ask for a poem, list, summary, etc., write it entirely in "texto".\n' +
          '- open a website by its address: {"tipo":"web","url":"https://..."} (only well-known sites whose address you are sure of)\n' +
          '- control the music that is playing: {"tipo":"media","que":"play|pausa|siguiente|anterior|subir|bajar|silencio"}\n' +
          '- reminder or timer: {"tipo":"recordatorio","minutos":N,"texto":"what to remember"}. Use it ONLY if the user explicitly asks you to remind them, for an alarm or a timer. NEVER offer, suggest or ask about creating reminders.\n' +
          'Only those actions exist. Never delete, move or install anything. If they do not ask for an action, do not write ACCION.';
        return '\n\nACCIONES EN EL TELÉFONO: podés ayudar al usuario a hacer cosas en su teléfono. Si te pide CLARAMENTE una de estas, ' +
          'respondé una frase corta y al final una línea exactamente así: ACCION: {json}\n' +
          `- abrir algo: {"tipo":"abrir","que":"nombre"} (apps: ${n(A.programas)}; sitios: ${n(A.sitios)})\n` +
          '- buscar en internet: {"tipo":"buscar","que":"texto a buscar"}\n' +
          '- guardar una nota (el teléfono ofrece mandarla a una app de notas): {"tipo":"nota","texto":"contenido completo, ya redactado"}. Si te pide un poema, lista, resumen, etc., escribilo vos entero en "texto".\n' +
          '- abrir un sitio web por su dirección: {"tipo":"web","url":"https://..."} (solo sitios conocidos cuya dirección sepas seguro)\n' +
          '- controlar la música que está sonando: {"tipo":"media","que":"play|pausa|siguiente|anterior|subir|bajar|silencio"}\n' +
          '- recordatorio o temporizador: {"tipo":"recordatorio","minutos":N,"texto":"qué recordar"}. Usalo SOLO si el usuario te pide explícitamente que le recuerdes algo, una alarma o un temporizador. NUNCA ofrezcas, sugieras ni preguntes si quiere crear un recordatorio.\n' +
          'Solo existen esas acciones. Nunca borres, muevas ni instales nada. Si no te pide una acción, no escribas ACCION.';
      }
    };

    // ---------- micrófono: reconocedor de voz de Android ----------
    const BCP47 = { es: 'es-AR', en: 'en-US', fr: 'fr-FR', pt: 'pt-BR', ru: 'ru-RU', uk: 'uk-UA', ar: 'ar-SA', ja: 'ja-JP' };
    async function escuchar(idioma) {
      if (!N || !N.listen) return { error: 'no-disponible' };
      const r = await llamarNativo(id => N.listen(id, BCP47[idioma] || 'es-AR'), 45000);
      if (r.error === 'nada') { try { N.stopListen(); } catch { } }
      return r;
    }

    // ---------- arranque ----------
    leerMemoria();
    setTimeout(() => recs.slice().forEach(programar), 6000);     // da tiempo a que el personaje esté escuchando los avisos

    const copiar = v => v === undefined ? null : (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));
    async function invocar(canal, args) {
      const h = manejadores.get(canal);
      if (!h) return null;
      return copiar(await h({ remoto: true }, ...(args || [])));
    }
    return { invocar, escuchar, canales: () => [...manejadores.keys()] };
  };
})();
