#!/usr/bin/env python3
"""Arma app/src/main/assets/www a partir del código original de Capri (el contenido de app.asar).

Uso:
    node tools/extraer_asar.js  Capri.app/Contents/Resources/app.asar  app_src
    python3 tools/preparar_assets.py --src app_src

Qué hace:
  1. Copia solo lo que la versión de teléfono necesita (personaje 3D, frases, comandos, modelos .glb...).
  2. Genera android-backend.js y android-main.js pegando, SIN CAMBIOS, trozos de main.js / vida.js / acciones.js / movil.js
     dentro de los templates de tools/. Si un trozo no se encuentra, el script falla (así no queda nada a medias).
  3. Parcha renderer.js para usar el reconocedor de voz de Android en lugar de Whisper.
  4. Genera android.html, pj.html, sheet-api.js, blank.html y los íconos de la app.
"""
import argparse, os, re, shutil, sys

ap = argparse.ArgumentParser()
ap.add_argument('--src', required=True, help='carpeta con app.asar extraído')
ap.add_argument('--out', default=None)
a = ap.parse_args()
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.abspath(a.src)
OUT = os.path.abspath(a.out or os.path.join(RAIZ, 'app/src/main/assets/www'))
RES = os.path.join(RAIZ, 'app/src/main/res')

def leer(p): return open(p, encoding='utf-8').read()
def escribir(p, s):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w', encoding='utf-8', newline='\n').write(s)

def trozo(texto, ini, fin, nombre):
    """texto entre dos marcadores (ini incluido, fin excluido); cada uno tiene que aparecer exactamente una vez"""
    if texto.count(ini) != 1: sys.exit(f'[{nombre}] marcador inicial encontrado {texto.count(ini)} veces: {ini!r}')
    i = texto.index(ini)
    j = texto.find(fin, i + len(ini))
    if j < 0 or texto.count(fin) < 1: sys.exit(f'[{nombre}] marcador final no encontrado: {fin!r}')
    return texto[i:j].rstrip() + '\n'

def reemplazar_unico(texto, viejo, nuevo, nombre):
    if texto.count(viejo) != 1: sys.exit(f'[{nombre}] el texto a reemplazar aparece {texto.count(viejo)} veces')
    return texto.replace(viejo, nuevo)

shutil.rmtree(OUT, ignore_errors=True)
os.makedirs(OUT)

# ---------- 1. archivos que se copian ----------
imports = re.compile(r"""(?:from\s+|import\s+)['"](\.{1,2}/[^'"]+)['"]""")
def dependencias(rel, vistos):
    if rel in vistos: return
    vistos.add(rel)
    base = os.path.dirname(rel)
    for m in imports.finditer(leer(os.path.join(SRC, rel))):
        dependencias(os.path.normpath(os.path.join(base, m.group(1))), vistos)
js = set()
dependencias('renderer.js', js)
js |= {'traducciones.js', 'i18n.js', 'pixel.js', 'movil-api.js', 'vida.js'}
for f in sorted(js):
    destino = os.path.join(OUT, f); os.makedirs(os.path.dirname(destino), exist_ok=True)
    shutil.copy(os.path.join(SRC, f), destino)
for f in ['clave.html', 'memoria.html', 'mente.html', 'vida.html', 'ayudante.html', 'icono.png']:
    shutil.copy(os.path.join(SRC, f), os.path.join(OUT, f))
shutil.copytree(os.path.join(SRC, 'modelos'), os.path.join(OUT, 'modelos'))
print('copiados', len(js), 'js,', len(os.listdir(os.path.join(OUT, 'modelos'))), 'modelos')

# ---------- 2. backend y página principal ----------
main = leer(os.path.join(SRC, 'main.js')); acc = leer(os.path.join(SRC, 'acciones.js')); movil = leer(os.path.join(SRC, 'movil.js'))
slices_backend = {
    'SLICE_TRIA':     trozo(main, 'const IDI = () =>', 'let remoto = null, sistema = null', 'TRIA'),
    'SLICE_OLLAMA':   trozo(main, 'const urlOllama = () =>', '// ---------- chat con la API (opcional) ----------', 'OLLAMA'),
    'SLICE_CHAT':     trozo(main, '// ---------- chat con la API (opcional) ----------', '// ---------- mirar la pantalla', 'CHAT'),
    'SLICE_MEM':      trozo(main, '// ---------- memoria: lo que le enseñás ----------', 'function abrirOido()', 'MEM'),
    'ACC_DATOS':      trozo(acc, '// nombres en inglés para la lista inicial', 'module.exports = function iniciarAcciones', 'ACC_DATOS'),
    'SLICE_RESOLVER': trozo(acc, '  function resolver(que) {', '  // ---------- ejecutar ----------', 'RESOLVER'),
}
t = leer(os.path.join(RAIZ, 'tools/android-backend.template.js'))
for k, v in slices_backend.items():
    t = reemplazar_unico(t, f'/*@@{k}@@*/', v, k)
escribir(os.path.join(OUT, 'android-backend.js'), t)

slices_main = {
    'MARCO':      trozo(movil, '  // ---------- el "marco" del personaje', '  const api = window.CAPRI_API = {', 'MARCO'),
    'API_PUNTERO': trozo(movil, '    _ox: () => P.x', '    cargarModelo:', 'API_PUNTERO'),
    'API_MOV':    trozo(movil, '    mover: dx => {', '    ignorar: () => { }', 'API_MOV'),
}
t = leer(os.path.join(RAIZ, 'tools/android-main.template.js'))
for k, v in slices_main.items():
    t = reemplazar_unico(t, f'/*@@{k}@@*/', v, k)
escribir(os.path.join(OUT, 'android-main.js'), t)

# ---------- 3. renderer.js: micrófono de Android ----------
r = leer(os.path.join(OUT, 'renderer.js'))
ancla = "  let r;\n  try { r = await escucha.empezar({ silencioFinal: cfg.oidoSilencio || 3000 }); }"
rama = """  if (api._androidSTT === true) {                    // Android: reconocedor de voz del teléfono (reemplaza a Whisper)
    let tx; try { tx = await api.escucharNativo({ idioma: LG() }); } catch (e) { tx = { error: String(e) }; }
    botonMic.classList.remove('grabando');
    if (tx && tx.error === 'permiso') { decir(COMUN.oido.sinPermiso, { forzar: true, ms: 12000 }); planificarQuieta(); return; }
    if (!tx || !tx.texto) { decir(tx && tx.error && tx.error !== 'nada' ? COMUN.oido.error : COMUN.oido.nada, { forzar: true, ms: 4000, callar: true }); avisoJuego(COMUN.oido.nada); planificarQuieta(); return; }
    decir('[[chat]] ' + tx.texto, { forzar: true, ms: 3000, callar: true }); avisoJuego('🎤 «' + tx.texto + '»');
    entrada.value = tx.texto;
    setTimeout(() => form.requestSubmit(), 450);
    return;
  }
"""
r = reemplazar_unico(r, ancla, rama + ancla, 'renderer-STT')
escribir(os.path.join(OUT, 'renderer.js'), r)

# ---------- 4. páginas ----------
idx = leer(os.path.join(SRC, 'index.html'))
idx = reemplazar_unico(idx, '<script src="i18n.js"></script>', '<script src="movil-api.js"></script>\n<script src="i18n.js"></script>', 'pj.html')
escribir(os.path.join(OUT, 'pj.html'), idx)            # el personaje, con la conexión de la página de afuera

h = leer(os.path.join(SRC, 'movil.html'))
h = re.sub(r'\s*<div id="vincular">.*?</div></div>\n', '\n', h, flags=re.S)
assert 'id="vincular"' not in h.split('<style>')[0] and '<div id="vincular"' not in h, 'no se pudo quitar #vincular'
h = reemplazar_unico(h, '<p class="info" id="infoHoja"></p>', '<div class="g" id="mas" style="margin-top:10px"></div><p class="info" id="infoHoja"></p>', 'hoja-mas')
css = """  #sheet { position: fixed; inset: 0; z-index: 20; display: none; flex-direction: column; background: #fbfbff; overflow: hidden; touch-action: auto; }
  #sheet.on { display: flex; }
  #sheet .bar { display: flex; align-items: center; gap: 10px; padding: calc(8px + env(safe-area-inset-top)) 12px 8px; background: #1b1036; color: #f2eefe; }
  #sheet .bar button { border: 2px solid #4a4470; border-radius: 10px; background: #24203f; color: #f2eefe; font: 700 16px system-ui, sans-serif; padding: 6px 14px; }
  #sheet .bar span { font: 700 16px system-ui, sans-serif; }
  #sheetFrame { flex: 1; border: 0; width: 100%; background: #fbfbff; touch-action: auto; }
</style>"""
h = reemplazar_unico(h, '</style>', css, 'css-sheet')
sheet = '<div id="sheet"><div class="bar"><button id="sheetCerrar">✕</button><span id="sheetTitulo"></span></div><iframe id="sheetFrame" src="blank.html" title="Capri"></iframe></div>\n'
h = reemplazar_unico(h, '  <script src="pixel.js"></script>\n<script src="movil.js"></script>',
    sheet + '  <script src="traducciones.js"></script>\n  <script src="pixel.js"></script>\n  <script src="android-backend.js"></script>\n  <script src="android-main.js"></script>', 'scripts')
escribir(os.path.join(OUT, 'android.html'), h)

escribir(os.path.join(OUT, 'blank.html'), '<!doctype html><meta charset="utf-8"><body style="background:#fbfbff">')
escribir(os.path.join(OUT, 'sheet-api.js'), """// Las ventanas de ajustes (charla, memoria, vida…) se abren en una hoja dentro de la app y usan el mismo cerebro local.
(function () {
  var P = window.parent && window.parent.CAPRI_API; if (!P) return;
  window.api = new Proxy(P, { get: function (o, k) { return k in o ? o[k] : async function () { return null; }; } });
  window.close = function () { try { window.parent.__cerrarHoja(); } catch (e) { } };
})();
""")
meta = '<meta name="viewport" content="width=device-width, initial-scale=1">\n<script src="sheet-api.js"></script>'
for f in ['clave.html', 'memoria.html', 'mente.html', 'vida.html', 'ayudante.html']:
    p = os.path.join(OUT, f); s = leer(p)
    m = re.search(r'<meta http-equiv="Content-Security-Policy"[^>]*>', s)
    if not m: sys.exit(f'{f}: no tiene la etiqueta CSP donde insertar')
    escribir(p, s[:m.end()] + '\n' + meta + s[m.end():])

# ---------- 4b. clave.html: textos que en el teléfono dirían algo falso o inútil ----------
p = os.path.join(OUT, 'clave.html'); c = leer(p)
c = reemplazar_unico(c, '    <input id="url" type="text" placeholder="http://localhost:11434">\n',
  '    <input id="url" type="text" placeholder="http://localhost:11434">\n'
  '    <p data-en="On your phone, “localhost” is the phone itself. Type your PC’s address instead (for example http://192.168.1.20:11434), with Ollama open on the same Wi-Fi and started with &lt;code&gt;OLLAMA_HOST=0.0.0.0&lt;/code&gt;.">'
  'En el teléfono, «localhost» es el propio teléfono. Escribí la dirección de tu PC (por ejemplo http://192.168.1.20:11434), con Ollama abierto en el mismo Wi-Fi e iniciado con <code>OLLAMA_HOST=0.0.0.0</code>.</p>\n', 'clave-ip')
c = reemplazar_unico(c, '<p>Clave de console.anthropic.com. Se cobra aparte de tu plan de Claude, según el uso. Se guarda cifrada en esta computadora.</p>',
  '<p data-en="Key from console.anthropic.com. Billed separately from your Claude plan, based on usage. It is stored only inside this app (the phone’s private app storage).">'
  'Clave de console.anthropic.com. Se cobra aparte de tu plan de Claude, según el uso. Se guarda solo dentro de esta app (almacenamiento privado del teléfono).</p>', 'clave-clave')
c = reemplazar_unico(c, '¡Listo! Clic derecho sobre ella → «Hablar con ella…».', '¡Listo! Tocá «Hablar» para charlar con ella.', 'clave-listo')
escribir(p, c)
p = os.path.join(OUT, 'i18n.js'); c = leer(p)
c = reemplazar_unico(c, "  const EN = {\n", "  const EN = {\n    '¡Listo! Tocá «Hablar» para charlar con ella.': 'Done! Tap “Talk” to chat with her.',\n", 'i18n-listo')
escribir(p, c)

# ---------- 5. íconos ----------
try:
    from PIL import Image
    ico = Image.open(os.path.join(SRC, 'icono.png')).convert('RGBA')
    for carpeta, px in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
        d = os.path.join(RES, f'mipmap-{carpeta}'); os.makedirs(d, exist_ok=True)
        ico.resize((px, px), Image.LANCZOS).save(os.path.join(d, 'ic_launcher.png'))
    print('íconos listos')
except ImportError:
    print('AVISO: sin Pillow no se generaron los íconos (pip install pillow)')
print('assets en', OUT)
