# CLAUDE.md

Contexto para agentes que trabajen en este repo. El detalle técnico está en [README.md](README.md);
acá va lo que hay que saber **antes** de tocar nada.

**Medidores-CGE**: app de terreno para que técnicos de CGE ubiquen medidores eléctricos sin documentar
en el Maule rural. Backend Express en Railway, PWA en Vercel, y un APK (Capacitor) para sideload
interno que además lee los logs de TOES del teléfono.

## Reglas que no se negocian

- **No fusionar `Develop` → `main` sin preguntar.** Instrucción explícita del usuario. `main` es
  producción (Vercel y Railway despliegan de ahí) y la comparte con un colega que también empuja.
- **TOES es la app oficial de CGE. No se modifica ni se descompila.** La carpeta `/TOES` del teléfono
  es **solo lectura**: nunca escribir, mover ni borrar nada ahí. `ToesPlugin.java` abre en modo `"r"` y
  no tiene una sola llamada que modifique; mantenerlo así.
- **El contenido de los logs no sale del teléfono.** Traen datos de clientes (direcciones, lecturas,
  coordenadas). Se procesan on-device y solo se persiste: UL, ciclo, instalación, medidor, clave, si
  hubo lectura y fecha.
  - **Única excepción, deliberada: la marca permanente** (`useMarcasToes`). Para que el lector del mes
    siguiente —otra persona, otro teléfono— vea que en un punto ya no hay medidor, el dato tiene que
    estar en el servidor. Viaja **solo** instalación, tipo de marca, clave y ciclo. Nunca dirección,
    lectura, nombre del cliente ni las coordenadas del log. Si hace falta mandar algo más, parar y
    preguntar.
- **Nunca commitear logs reales** (`Log_TOES*.txt` está en `.gitignore`). Para tests está el fixture
  anonimizado en `frontend/src/utils/__fixtures__/`.
- **Nunca borrar** puntos, fotos, descripciones ni etiquetas: solo cambiar su visibilidad.
- **TOES propone, una persona decide.** La integración puede *proponer* una marca permanente a partir
  de una clave, pero nunca darla por buena sola: confirmarla es de `admin` o `supervisor`. Una clave
  mal puesta por un lector no puede dejar un medidor real descartado para siempre.
- **`backend/data/seed.js` ejecuta `Medidor.deleteMany({})`.** No correrlo jamás contra el Atlas de
  producción.
- **La firma del APK no se commitea** (`*.jks`, `*.keystore`, `keystore.properties` en `.gitignore`).

## Comandos

```bash
cd frontend
npm test              # 130 tests con node --test (sin dependencias extra)
npm run lint          # oxlint; 3 warnings preexistentes (2 en Mapa.jsx, 1 en AuthContext.jsx)
npm run medir:mapa    # mide la fluidez del mapa en el teléfono (ver README)
npm run dev           # http://localhost:5173, ya está en el CORS de producción
npm run build         # build web (PWA)
npm run android:apk   # build nativo + cap sync + gradlew; busca el JDK solo
```

```bash
cd backend && npm test   # 62 tests: Jest + Supertest + mongodb-memory-server
```

Para probar en el teléfono con `adb`: `adb install -r frontend/android/app/build/outputs/apk/debug/app-debug.apk`.
El WebView es inspeccionable en builds de debug (`adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`),
y **`adb logcat | grep Capacitor/Console` es la única forma de ver errores de JS del APK** — más de un
bug solo apareció ahí.

## Dónde vive qué

| | |
|---|---|
| `frontend/src/pages/Mapa.jsx` | el mapa y el panel lateral; elige el motor según el flag |
| `frontend/src/components/MapaGL.jsx` | el mapa sobre GPU (MapLibre). El motor nuevo |
| `frontend/src/components/CapaMedidores.jsx` | los pines de Leaflet: memoizados y con culling |
| `frontend/src/components/DetalleMedidor.jsx` | el contenido del popup, **compartido por los dos motores** |
| `frontend/src/utils/pinDeColor.js` | dibuja los pines de color y los de contador para el motor GL |
| `frontend/src/hooks/useMiUbicacionGL.js` | el punto azul en MapLibre (la contraparte de `MiUbicacion.jsx`) |
| `frontend/src/utils/medirFluidez.js` | long tasks y frames; se prende con un flag |
| `frontend/scripts/medirMapa.mjs` | mide la fluidez con un gesto repetible por `adb` |
| `frontend/scripts/webviewCdp.mjs` | habla con el WebView por el protocolo de DevTools |
| `frontend/src/utils/tilesDeRuta.js` | qué cuadros bajar para una ruta (puro, testeado) |
| `frontend/src/utils/agrupar.js` | agrupa medidores del mismo punto (5 m) |
| `frontend/src/utils/toesParser.js` | parseo de los logs de TOES (puro, testeado) |
| `frontend/src/utils/cursorToes.js` | cursor de lectura incremental, **en bytes** |
| `frontend/src/utils/toesNativo.js` | puente con el plugin nativo y bucle de lectura |
| `frontend/src/utils/marcasToes.js` | qué claves proponen marca permanente y cuál la quita |
| `frontend/src/utils/ulsActivas.js` | qué ULs quedan marcadas al abrir la app |
| `frontend/src/hooks/useMarcasToes.js` | lo único de TOES que escribe en el backend |
| `frontend/src/hooks/useToes.js` | une parser + almacén + mapa |
| `frontend/public/sw-tiles.js` | service worker del APK: cachea tiles, no precachea |
| `frontend/android/.../toes/ToesPlugin.java` | lee `/TOES` por SAF, solo lectura |

## Trampas que ya costaron tiempo

Están explicadas en el README, pero conviene tenerlas presentes:

- **Un import que falta no lo ve el build.** Sacar `useState` del import de un archivo que lo sigue
  usando pasa el build, pasa oxlint y pasa los tests — y deja **la app en blanco**. Ya pasó. Por eso
  `no-undef` está activado en `.oxlintrc.json`, con el entorno declarado por carpeta (browser,
  node para `scripts/` y tests, serviceworker para `sw-tiles.js`). Si lo tocás, que siga atrapándolo.
- **El worker de MapLibre no se empaqueta solo.** maplibre-gl 6 lo carga de un archivo aparte que
  resuelve relativo a la URL de su módulo, y al bundlear esa URL no existe. El mapa se ve igual — la
  foto satelital es raster y no pasa por el worker — pero la fuente GeoJSON queda en cero features y
  no dibuja un solo pin, sin ningún error. Se arregla con `?url` + `setWorkerUrl`.
- **Props de `Marker` con literales.** react-leaflet compara por identidad: un
  `position={[lat, lng]}` o un `eventHandlers={{...}}` creados en el render hacen que **cada** marcador
  ejecute `setLatLng()` y reenganche sus listeners en cada render. Con 300 pines eso se siente.
- **Un `const` del hook referenciado en un array de dependencias que está más arriba.** Los arrays se
  evalúan durante el render y un `const` no se hoistea: `Cannot access 'X' before initialization`, el
  componente revienta y **la app queda en blanco**. Ni el build ni oxlint lo detectan.
- **Respuestas opacas en el caché.** Chrome le cobra ~7 MB de cuota a cada una. Cachear solo `200` con
  `type !== 'opaque'`.
- **Capacitor 8 exige JDK 21.** Con 17 el build muere con `invalid source release: 21`, mensaje que no
  menciona los JDK. De eso se encarga `scripts/compilarApk.mjs`.
- **El repo trabaja en Windows con `core.autocrlf=true`.** El README es CRLF: al editarlo con scripts
  hay que normalizar y devolverlo a CRLF, o queda con finales mezclados. `gradlew` está fijado a LF en
  `.gitattributes` porque con CRLF no arranca en macOS ni Linux.
- **En builds de debug, Capacitor escribe en logcat el texto completo del log de TOES**, con datos de
  clientes. Antes de firmar un release hay que poner `"loggingBehavior": "none"` en
  `capacitor.config.json`.

## Estado y qué falta

`Develop` está adelante de `main` y **ya está respaldada en el remoto** (`origin/Develop`).

La rama **`map`** tiene la migración del motor del mapa a MapLibre GL, medida en el teléfono: el p95
por frame pasa de 57 ms a 16 ms y los marcadores dejan de costar (+19 ms por frame en Leaflet, 0
medible en GL). **MapLibre es el motor por defecto**; Leaflet sigue entero como red de seguridad,
porque con sideload un problema en terreno no se arregla publicando:

```js
localStorage.setItem('motorMapa', 'leaflet')   // volver a Leaflet, y recargar
```

**Todo lo que toque el mapa hay que probarlo en los DOS motores.** Ya pasó que un cambio rompiera el
de Leaflet —la app en blanco— sin que lo vieran el build, oxlint ni los 130 tests, porque el archivo
que se rompió solo se monta en esa rama.

Pendiente:

- Sacar Leaflet cuando MapLibre lleve un ciclo de ruta completo sin sorpresas.
- Crear una cuenta `lector` (hoy las 4 cuentas son `admin`, ese camino de permisos está sin probar en
  producción; en los tests del backend sí).
- **"Sin empalme" desde TOES.** Es un submenú de la clave 05, así que `METERREADINGNOTE` trae `05` y el
  detalle tiene que estar en otro campo del bloque (candidatos: `ZZABLHINW2`, `ZZABLHINW3`, `NOTA_APK`,
  `RESPUESTA`). Hasta confirmarlo con un log real, esa marca solo se pone a mano desde el popup.
- Firmar el APK para release.
- **Tiles vectoriales propios** (PMTiles de la Región del Maule). El cambio de motor ya está hecho;
  esto es lo otro que faltaba, y quitaría la dependencia de OSM y Esri, que pueden cortar el acceso
  — ya pasó con CARTO.

## Estilo

Código, comentarios y mensajes de commit **en español**. Los comentarios explican *por qué*, no *qué*:
el repo está lleno de notas que justifican una decisión o documentan un caso real que falló, y conviene
seguir esa línea en vez de describir lo que el código ya dice.
