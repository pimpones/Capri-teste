# Capri para Android

Port de **Capri 1.12.2** (la compañera 3D de escritorio hecha con Electron) a un proyecto Android que genera un **APK**.

> **Estado honesto:** el código está completo y el lado web se probó en un Chromium real (ver "Qué se verificó"), pero
> **el APK no se compiló ni se probó en un teléfono**: el entorno donde se hizo no tenía Android SDK ni internet.
> Los 3 archivos Kotlin se escribieron sin compilador. Es probable que la primera compilación necesite algún ajuste menor.

## Cómo obtener el APK

### Opción A: GitHub Actions (sin instalar nada)
1. Creá un repositorio nuevo en GitHub y subí **todo el contenido de esta carpeta** (incluida `.github/`).
2. Pestaña **Actions → Build APK → Run workflow**.
3. Cuando termine (unos 5-10 min), bajá **Capri-debug-apk** de *Artifacts*. Adentro está `app-debug.apk`.
4. Pasalo al teléfono e instalalo (hay que permitir "instalar apps desconocidas" para el navegador o el gestor de archivos).

### Opción B: Android Studio
1. Abrí esta carpeta con Android Studio (Hedgehog o más nuevo, JDK 17). Sincroniza Gradle solo.
2. **Build → Build APK(s)**. El archivo queda en `app/build/outputs/apk/debug/app-debug.apk`.

Es un APK de **depuración** (firmado con la clave de depuración de Android). Para publicarlo en Play Store hace falta uno *release* con tu propia clave.
Si falla la compilación, copiá el error: casi seguro es un detalle de una línea.

## Cómo se conecta la IA (necesario para charlar)
Un teléfono no puede correr un modelo grande, así que el "cerebro" es externo. La primera vez que abrís la app aparece **Configurar charla**:

- **Ollama en tu PC (gratis):** en la PC iniciá Ollama escuchando en la red (`OLLAMA_HOST=0.0.0.0`, en Windows con la variable de entorno y reiniciando Ollama),
  con el teléfono en el mismo Wi-Fi. En la app escribí `http://IP-DE-TU-PC:11434` (ej. `http://192.168.1.20:11434`), tocá ↻ y elegí un modelo. Si no responde, revisá el Firewall de la PC (puerto 11434).
- **API de Claude (de pago, aparte de tu plan):** pegá tu clave de console.anthropic.com. Se guarda en el almacenamiento privado de la app (no está cifrada con una clave extra).
- Ollama dentro del propio teléfono (por ejemplo con Termux) también sirve: dejá `http://localhost:11434`.

## Qué cambió respecto a la versión de escritorio
| Escritorio (Electron) | Android |
|---|---|
| Ventana transparente que pasea por el escritorio | Capri camina y cae dentro de la pantalla de la app (el marco ya existía en el "modo teléfono" original) |
| Chat con Ollama/Claude desde Node | El mismo código (`main.js`), pero la red la hace Kotlin (`NativeBridge.http`) |
| Memoria, vida (ánimo, logros, diario, clima) | El **mismo** `vida.js` y las mismas funciones de memoria, guardadas en el almacenamiento de la app |
| Voz: voces de Windows / Piper | Voz del sistema Android (`speechSynthesis`) |
| Micrófono: Whisper local | Reconocedor de voz de Android (`SpeechRecognizer`); pide permiso de micrófono la primera vez |
| Acciones: abrir programas, Bloc de notas | Abrir apps del teléfono (calculadora, cámara, ajustes, galería, mapas, calendario, reloj…), sitios web, búsquedas, música (play/pausa/siguiente/volumen) |
| Notas en Documentos | Se guardan en la carpeta de la app y se abre el menú "Compartir" para mandarlas a tu app de notas |
| Recordatorios con notificación de Windows | Alarma de Android + notificación (suena con la app cerrada; en Android 13+ pide permiso de notificaciones) |

**Quitado a propósito** (no tiene sentido en un teléfono): Minecraft, sentarse sobre otras ventanas, modo juego automático, reacción al portapapeles,
instalador de Ollama/Piper/Whisper, "manos libres" por nombre, "Mirá mi pantalla" y la vinculación con una PC.

## Limitaciones conocidas
- Los recordatorios usan alarmas *no exactas* de Android (`setAndAllowWhileIdle`): con la app cerrada pueden llegar con algunos minutos de demora. Si reiniciás el teléfono, las alarmas pendientes se vuelven a programar la próxima vez que abras Capri.
- La voz depende de que el teléfono tenga un motor de texto a voz con el idioma elegido (Ajustes de Android → Salida de texto a voz). El japonés ya dependía de la voz del sistema en la versión original.
- Capri vive **dentro** de la app; no flota sobre otras apps (eso pediría el permiso "mostrar sobre otras apps" y es una decisión de diseño aparte).
- El APK pesa unos 70 MB por los 17 modelos 3D.

## Qué se verificó (y qué no)
**Verificado en este entorno:**
- `tools/tests/test_backend.js` (Node, 40 comprobaciones): config, chat con Ollama y Claude (incluidos errores), memoria, acciones, recordatorios, clima, micrófono, ajustes, usando un `CapriNative` simulado.
- `tools/tests/e2e_navegador.js` (Chromium headless): carga `android.html`, el personaje 3D se dibuja, el chat pasa por el puente hasta el globo de diálogo, el botón del micrófono usa el reconocedor nativo, se abren el menú y la hoja de ajustes; 0 errores de consola.

**No verificado (hay que probarlo en un teléfono):**
- Que el proyecto **compile** (Kotlin sin compilador).
- `speechSynthesis` y `SpeechRecognizer` reales, permisos, alarmas, notificaciones, intents de apps.
- Rendimiento de WebGL en tu modelo de teléfono.
- Cómo se ven en pantallas chicas las ventanas de Memoria, Mente y Vida (se reutilizaron las de PC en una hoja a pantalla completa; Configurar charla sí se vio bien).

## Estructura
```
app/src/main/java/com/asistente/capri/   Kotlin: MainActivity (WebView), NativeBridge (red, micrófono, intents, alarmas), ReminderReceiver
app/src/main/assets/www/                 la app web (personaje 3D + backend); es el resultado de tools/preparar_assets.py
tools/preparar_assets.py                 regenera assets/www desde el app.asar original (copia trozos de main.js, vida.js, acciones.js, movil.js sin cambios)
tools/android-*.template.js              el código nuevo (backend local y página principal)
tools/tests/                             pruebas (Node y navegador)
.github/workflows/build-apk.yml          compila el APK en GitHub
```
Para regenerar los assets: `node tools/extraer_asar.js <Capri.app>/Contents/Resources/app.asar app_src` y luego `python3 tools/preparar_assets.py --src app_src` (necesita Pillow para los íconos).
