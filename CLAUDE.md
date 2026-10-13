# CLAUDE.md

Contexto para agentes que trabajen en este repo. Se lee al abrir cada sesión: con esto alcanza para
empezar un feature o un fix sin re-descubrir el proyecto. El detalle técnico largo está en
[README.md](README.md); acá va lo que hay que saber **antes** de tocar nada.

**Medidores-CGE**: app de terreno para que técnicos de CGE ubiquen medidores eléctricos sin documentar
en el Maule rural. Backend Express en Railway, PWA en Vercel, y un APK (Capacitor) para sideload
interno que además lee los logs de TOES del teléfono.

El usuario (Luciano) desarrolla **y** hace las rutas de lectura en terreno con TOES. Trabaja en
español, en Windows (PowerShell y Git Bash). Si algo del comportamiento de TOES o de terreno está en
duda, preguntarle: lo puede verificar él. Al cerrar un trabajo, proponerle una prueba concreta en el
teléfono.

## Reglas que no se negocian

- **No fusionar nada a `main` sin preguntar** (ni `Develop` ni `map` ni ninguna otra rama, ni un
  hotfix de una línea). Instrucción explícita del usuario; que haya aprobado un merge no aprueba el
  siguiente. `main` es producción (Vercel y Railway despliegan de ahí) y la comparte con un colega
  que también empuja.
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
  - Por lo mismo, **pedir un tile al mapa le manda esa coordenada a Esri/OSM**: las coordenadas para
    bajar mapas salen de la base (`medidores[].ubicacion`), nunca del log.
- **Nunca commitear logs reales** (`Log_TOES*.txt` está en `.gitignore`). Para tests está el fixture
  anonimizado en `frontend/src/utils/__fixtures__/`.
- **Nunca borrar** puntos, fotos, descripciones ni etiquetas: solo cambiar su visibilidad. Existen
  `DELETE /medidores/:instalacion` y `DELETE /rutas/:ul` (solo admin, heredados); no agregar más
  borrados ni usarlos para "limpiar".
- **TOES propone, una persona decide.** La integración puede *proponer* una marca permanente a partir
  de una clave, pero nunca darla por buena sola: confirmarla es de `admin` o `supervisor`. Una clave
  mal puesta por un lector no puede dejar un medidor real descartado para siempre.
- **`backend/data/seed.js` ejecuta `Medidor.deleteMany({})`.** No correrlo jamás contra el Atlas de
  producción.
- **La firma del APK no se commitea** (`*.jks`, `*.keystore`, `keystore.properties` en `.gitignore`).
- **Credenciales:** van en `backend/.env` (no versionado) y en las variables de Railway. Nunca en el
  código ni en un commit.

## Cómo empezar una sesión

1. `git status` y `git fetch origin`: ver en qué rama se está y si `origin/main` se movió (el colega
   puede haber empujado). El `.gitignore` suele tener cambios locales del usuario sin commitear:
   no incluirlos en commits ajenos.
2. Trabajar en una rama, nunca directo en `main`. `Develop` es la de integración; para algo grande,
   una rama propia (como fue `map`).
3. Commits chicos y en español. No hacer push a `main` (ver abajo cómo se publica).

## Arquitectura en una pantalla

```
APK (Capacitor, sideload) ─┐                       ┌─ MongoDB Atlas (base cge_db)
                           ├─> Railway: Express ───┤
PWA en Vercel ─────────────┘   /api/...            └─ Cloudinary (fotos)
   └ el APK además lee /TOES por SAF (solo lectura) y guarda su estado en IndexedDB del teléfono
```

| | |
|---|---|
| Backend | `https://medidores-cge-production.up.railway.app/api` |
| Web | `https://medidores-cge.vercel.app` (Vercel de la cuenta `manuelmiris-projects`, no la del usuario) |
| Repo | `github.com/ManuelMiri/Medidores-CGE` |
| Paquete del APK | `cl.mla.maule` |

- **El APK y la PWA pegan al MISMO backend de producción** (`VITE_API_URL` en `frontend/.env.native`
  para el APK; la web usa la misma URL por defecto en `services/api.js`). No hay staging.
- **Roles:** `admin` (todo, incluso usuarios, importar y borrar), `supervisor` (ve todo, exporta,
  confirma marcas), `lector` (solo sus `unidadesLectura`; propone marcas). El JWT va en
  `localStorage.token`. Hoy las 4 cuentas son `admin`.
- **Modelo `Medidor`** (`backend/models/Medidor.js`): `instalacion` (única, es la clave de las rutas
  `/:instalacion`), `unidadDeLectura` (UL = ruta), `ubicacion` GeoJSON `[lng, lat]`, `estado`
  (`pendiente | localizado | perdido | revision`), `marcaPermanente` (opcional:
  `tipo` + `situacion` propuesta/confirmada/rechazada), `fotos`, `historial`.
- **Endpoints** (todos bajo `/api`, todos con JWT salvo login):
  - `auth`: `login`, `perfil`, `logout`, y gestión de usuarios (solo admin).
  - `medidores`: `GET /` (por `ul`, `limite`), `GET /buscar?q=&ul=A,B`, `GET /uls`, `GET|PATCH|DELETE
    /:instalacion`, `POST /`, `POST|PATCH|DELETE /:instalacion/marca`, `POST /:instalacion/fotos`,
    `PATCH /:instalacion/ubicacion` (mover el pin; admin/supervisor, deja la posición vieja en el
    historial). El `PATCH /:instalacion` general ya **no** acepta `ubicacion`.
  - `importacion`: sube KML/KMZ/Excel de SAP → preview → `POST /confirmar` (admin).
  - `rutas`: `GET /:ul/exportar` (xlsx formato SAP), `DELETE /:ul` (admin).
- **Variables del backend:** `MONGODB_URI`, `JWT_SECRET`, `CLOUDINARY_CLOUD_NAME`,
  `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `PORT`. Frontend: solo `VITE_API_URL`.

## Comandos

```bash
cd frontend
npm test              # 142 tests con node --test (1 se salta sin log real)
npm run lint          # oxlint; 3 warnings preexistentes (2 en Mapa.jsx, 1 en AuthContext.jsx)
npm run medir:mapa    # mide la fluidez del mapa en el teléfono (ver README)
npm run dev           # http://localhost:5173, ya está en el CORS de producción
npm run build         # build web (PWA)
npm run android:apk   # build nativo + cap sync + gradlew; busca el JDK solo
```

```bash
cd backend && npm test   # 88 tests: Jest + Supertest + mongodb-memory-server
```

Antes de dar algo por terminado: `npm test` en los dos lados, `npm run lint` (que sigan siendo 3
warnings) y `npm run build`. Si toca el mapa, además probarlo en el teléfono **en los dos motores**.

## Publicar a producción

1. Push de la rama de trabajo (no `main`). Vercel compila un **preview** de cada push: es la forma de
   saber si el build pasa en Vercel sin tocar producción. El estado se ve sin login en
   `https://api.github.com/repos/ManuelMiri/Medidores-CGE/commits/<sha>/status` (contexto `Vercel`;
   Railway aparece como `angelic-wisdom`). Los logs de Vercel no son accesibles desde acá.
2. Preguntarle al usuario. Con su OK, `git fetch` de nuevo, merge a `main` y push.
   **En modo automático el push a `main` lo bloquea el clasificador de permisos** (lo trata como
   despliegue a producción) y no aparece ninguna ventana para aprobarlo: darle al usuario el comando
   exacto para que lo corra él en una terminal (por ejemplo `git push origin map:main map:Develop`).
3. Comprobar el despliegue con una señal que solo tenga el código nuevo. Útiles:
   - Backend: el status `angelic-wisdom` del commit, o una ruta nueva que conteste 401 sin token
     (la vieja da 404).
   - Web: bajar el `index-*.js` de la web y buscar un texto que solo exista en el código nuevo.
     `Last-Modified` en las cabeceras dice de cuándo es lo que se sirve.
4. Si Vercel falla, **producción se queda con la versión anterior sin avisar**. Ya pasó: estuvo del
   9 al 12 de octubre sin actualizarse y nadie lo notó.

**Compatibilidad hacia atrás del backend:** hay APKs viejos instalados en teléfonos que no se
actualizan solos. Un cambio de API tiene que seguir funcionando con lo que manda la versión anterior
(parámetros nuevos opcionales, campos nuevos opcionales en el modelo, sin migraciones).

**Para repartir un APK:** subir `versionCode` y `versionName` en `frontend/android/app/build.gradle`
(sale en el pie del panel lateral). Para pruebas propias no hace falta.

## Probar en el teléfono

- `adb` **no está en el PATH**: `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe` (en Git Bash,
  `"$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"`). Los scripts de `frontend/scripts/` lo
  encuentran solos.
- Si `adb devices` dice `unauthorized`, el usuario tiene que aceptar el aviso de depuración USB.
- `adb install -r frontend/android/app/build/outputs/apk/debug/app-debug.apk` conserva los datos y el
  permiso de la carpeta TOES. Abrir: `adb shell monkey -p cl.mla.maule -c android.intent.category.LAUNCHER 1`.
- **Con la pantalla apagada o bloqueada, Android pausa el WebView** y `webviewCdp.mjs` da timeout.
  `adb shell svc power stayon usb` la mantiene encendida mientras haya cable (ya quedó puesto;
  se quita con `svc power stayon false`). Si está en la pantalla de bloqueo, pedirle al usuario que
  la desbloquee (`dumpsys window | grep isKeyguardShowing`).
- **`scripts/webviewCdp.mjs`** es la herramienta para ver qué pasa dentro del APK: exporta
  `conectar(adb, 'cl.mla.maule')` y `evaluar(urlWs, expresion)`. Un script de 4 líneas que los importe
  deja leer el DOM, el estado y llamar a la API con el token de la sesión
  (`localStorage.getItem('token')`). Solo funciona en builds de debug.
- Para escribir en un input de React desde CDP: usar el setter nativo
  (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set`) y disparar `input`.
- `adb logcat` no sirve para la app: `loggingBehavior` está en `"none"` a propósito (ver Trampas).

## Dónde vive qué

| | |
|---|---|
| `backend/app.js` | Express, CORS (orígenes permitidos) y montaje de rutas |
| `backend/rutas/medidores.js` | CRUD, buscador, lista de ULs (con caché) y marca permanente |
| `backend/rutas/importacion.js` | KML/KMZ/Excel → preview → confirmar |
| `backend/rutas/rutas.js` | exportar una UL a xlsx y eliminar una ruta |
| `backend/middleware/auth.js` | `proteger` (JWT + tokens invalidados) y `soloRol(...)` |
| `backend/tests/helpers.js` | `crearUsuarioYObtenerToken(rol, { unidadesLectura })` para tests |
| `frontend/src/pages/Mapa.jsx` | el mapa, el buscador y el panel lateral; elige el motor según el flag |
| `frontend/src/components/MapaGL.jsx` | el mapa sobre GPU (MapLibre). El motor nuevo |
| `frontend/src/components/CapaMedidores.jsx` | los pines de Leaflet: memoizados y con culling |
| `frontend/src/components/DetalleMedidor.jsx` | el contenido del popup, **compartido por los dos motores** |
| `frontend/src/components/PanelToes.jsx` | el bloque de TOES del panel lateral |
| `frontend/src/components/CargaKml.jsx` | importar rutas (admin) |
| `frontend/src/services/api.js` | axios con la URL del backend y el token |
| `frontend/src/utils/pinDeColor.js` | dibuja los pines de color y los de contador para el motor GL |
| `frontend/src/hooks/useMiUbicacionGL.js` | el punto azul en MapLibre (la contraparte de `MiUbicacion.jsx`) |
| `frontend/src/utils/medirFluidez.js` | long tasks y frames; se prende con un flag |
| `frontend/scripts/medirMapa.mjs` | mide la fluidez con un gesto repetible por `adb` |
| `frontend/scripts/webviewCdp.mjs` | habla con el WebView por el protocolo de DevTools |
| `frontend/scripts/compilarApk.mjs` | busca el JDK 21 y corre gradlew por ruta absoluta |
| `frontend/src/utils/tilesDeRuta.js` | qué cuadros bajar para una ruta (puro, testeado) |
| `frontend/src/utils/agrupar.js` | agrupa medidores del mismo punto (5 m) |
| `frontend/src/utils/vistaMarcador.js` | qué muestra cada pin según TOES y la selección |
| `frontend/src/utils/toesParser.js` | parseo de los logs de TOES (puro, testeado) |
| `frontend/src/utils/cursorToes.js` | cursor de lectura incremental, **en bytes** |
| `frontend/src/utils/toesNativo.js` | puente con el plugin nativo y bucle de lectura |
| `frontend/src/utils/marcasToes.js` | qué claves proponen marca permanente y cuál la quita |
| `frontend/src/config/clavesToes.json` | la tabla oficial de claves de TOES |
| `frontend/src/utils/ulsActivas.js` | qué ULs quedan marcadas al abrir la app y al recargar la lista |
| `frontend/src/hooks/useMarcasToes.js` | lo único de TOES que escribe en el backend |
| `frontend/src/hooks/useToes.js` | une parser + almacén + mapa |
| `frontend/public/sw-tiles.js` | service worker del APK: cachea tiles, no precachea |
| `frontend/android/.../toes/ToesPlugin.java` | lee `/TOES` por SAF, solo lectura |

Las reglas con lógica que falla en silencio van en `utils/` como funciones puras con su `.test.js`
al lado (ver `ulsActivas.js`, `marcasToes.js`). Seguir ese patrón en vez de dejarlas en el JSX.

## Comportamientos decididos (no "arreglarlos")

- **El buscador busca solo en las ULs marcadas.** Antes caía a una búsqueda en todas las rutas y
  marcaba sola la UL del resultado: los últimos dígitos se repiten entre rutas y el lector terminaba
  en un medidor ajeno. Si no está en lo marcado, avisa. Si es puro número, primero compara el
  **final** de la instalación contra lo cargado; si no aparece, pregunta al servidor (que busca
  "contiene", escapando el texto) limitado a las mismas ULs.
- **El panel de ULs es desplegable:** cerrado muestra solo las marcadas, con sus botones (bajar mapa,
  exportar, eliminar); abierto, el filtro y la lista entera. Arranca abierto solo si no había nada
  guardado.
- **Las ULs marcadas se recuerdan** (`localStorage.ulsActivas`). Al abrir se restauran; al recargar la
  lista (importar, eliminar ruta) se conserva lo marcado y solo se saca lo que ya no existe.
- **MapLibre es el motor por defecto** y Leaflet la red de seguridad, que se cambia desde el pie del
  panel lateral (`localStorage.motorMapa = 'leaflet'`). Que esté en la interfaz es el punto: una
  salida de emergencia que necesita un PC con `adb` no le sirve a un lector en terreno.
- **"Solo casas cerradas"** (panel TOES) deja en el mapa solo lo tomado con una clave de
  `clavesRepaso` (01, 08, 09, 30), en firme y sin marcas permanentes, para el repaso al final de la
  ruta. **No se recuerda** entre sesiones a propósito: prendido al día siguiente, el mapa saldría vacío.
- **Mover un pin** es desde "✏️ Editar" → "Cambiar ubicación en el mapa" (tocar el mapa o "Usar mi
  GPS"). Reemplaza a borrar y recrear, que perdía historial y fotos.
- **"🚗 Ir"** en el popup abre Google Maps con la URL universal (`utils/navegacion.js`); en el APK
  Android la pasa a la app de Maps. **"◎"** (abajo a la derecha) centra en tu posición y prende el
  punto azul si estaba apagado; es un contador (`pedidoCentrar`) que escuchan los dos motores.

## Trampas que ya costaron tiempo

Están explicadas en el README, pero conviene tenerlas presentes:

- **Todo lo que toque el mapa hay que probarlo en los DOS motores.** Ya pasó que un cambio rompiera
  Leaflet —la app en blanco— sin que lo vieran el build, oxlint ni los tests, porque el archivo que
  se rompió solo se monta con ese motor.
- **Vercel compila en Linux.** Nada de configuración que solo exista en Windows: un `.npmrc` con
  `script-shell=cmd.exe` (para que `android:apk` anduviera desde Git Bash) dejó **todos** los
  despliegues fallando durante días. Lo que sea de Windows va dentro de `scripts/*.mjs`, que
  preguntan `platform()`.
- **Un import que falta no lo ve el build.** Sacar `useState` del import de un archivo que lo sigue
  usando pasa el build, pasa oxlint y pasa los tests — y deja **la app en blanco**. Ya pasó. Por eso
  `no-undef` está activado en `.oxlintrc.json`, con el entorno declarado por carpeta (browser,
  node para `scripts/` y tests, serviceworker para `sw-tiles.js`). Si lo tocás, que siga atrapándolo.
- **Un `const` del hook referenciado en un array de dependencias que está más arriba.** Los arrays se
  evalúan durante el render y un `const` no se hoistea: `Cannot access 'X' before initialization`, el
  componente revienta y **la app queda en blanco**. Ni el build ni oxlint lo detectan.
- **El worker de MapLibre no se empaqueta solo.** maplibre-gl 6 lo carga de un archivo aparte que
  resuelve relativo a la URL de su módulo, y al bundlear esa URL no existe. El mapa se ve igual — la
  foto satelital es raster y no pasa por el worker — pero la fuente GeoJSON queda en cero features y
  no dibuja un solo pin, sin ningún error. Se arregla con `?url` + `setWorkerUrl`.
- **Props de `Marker` con literales.** react-leaflet compara por identidad: un
  `position={[lat, lng]}` o un `eventHandlers={{...}}` creados en el render hacen que **cada** marcador
  ejecute `setLatLng()` y reenganche sus listeners en cada render. Con 300 pines eso se siente. Lo
  mismo con los callbacks que recibe `CapaMedidores`: van con `useCallback`.
- **En producción el backend corre en `cluster`** (un worker por núcleo, `index.js`), y cada worker
  tiene su propia memoria. Cualquier estado en memoria (como `utils/cache.js`) existe una vez por
  worker: invalidar solo en el que atendió la petición deja a los otros con datos viejos. Por eso
  `cache.invalidarUls()` avisa a los demás por el proceso principal; lo que se cachee de nuevo tiene
  que ir por ese mismo camino. En local y en los tests no hay cluster, así que el problema no se ve:
  `tests/cache.test.js` levanta uno de verdad.
- **Toda ruta que cree o borre medidores tiene que llamar a `cache.invalidarUls()`**: la lista de ULs
  (`GET /medidores/uls`) se cachea 60 s y si no, una ruta importada tarda un minuto en aparecer.
- **La carga de medidores trae hasta 500 por UL** (`limite=500`). Lo que busque solo en lo cargado
  puede no ver todo; por eso el buscador termina preguntando al servidor.
- **Respuestas opacas en el caché.** Chrome le cobra ~7 MB de cuota a cada una. Cachear solo `200` con
  `type !== 'opaque'`.
- **Capacitor 8 exige JDK 21.** Con 17 el build muere con `invalid source release: 21`, mensaje que no
  menciona los JDK. De eso se encarga `scripts/compilarApk.mjs`.
- **`cap sync` reescribe `capacitor.build.gradle` y `capacitor.settings.gradle`** con otros finales de
  línea. Si `git diff` no muestra contenido, descartarlos con `git checkout --`.
- **El repo trabaja en Windows con `core.autocrlf=true`.** El README y CLAUDE.md son CRLF: al
  editarlos con scripts hay que normalizar y devolverlos a CRLF, o quedan con finales mezclados.
  `gradlew` está fijado a LF en `.gitattributes` porque con CRLF no arranca en macOS ni Linux.
- **Capacitor escribía en logcat el texto completo del log de TOES**, con datos de clientes, porque
  registra el resultado de cada llamada a un plugin. Ya está cerrado con `"loggingBehavior": "none"`
  en `capacitor.config.json`; si alguien lo vuelve a prender para depurar, que no quede así.
- **Un `confirm()` o `alert()` abierto cuelga `webviewCdp.mjs`.** El diálogo bloquea el hilo de la
  página y `Runtime.evaluate` no contesta hasta que alguien lo cierra en el teléfono. Para probar algo
  que pregunta (cambiar de motor, eliminar), reemplazar `window.confirm`/`window.alert` antes, o hacer
  directo lo que haría el botón (el motor es `localStorage.motorMapa`).
- **`git merge -F -` no lee el mensaje de stdin** (`git commit -F -` sí). Escribirlo a un archivo.

## Estado y qué falta

Al 2026-10-13, `main`, `Develop` y `map` están en el mismo commit y en el remoto, y producción
(Railway y Vercel) tiene todo: TOES, la marca permanente, MapLibre, el buscador por UL y el panel
desplegable. El APK repartido es la **2.2 (code 4)**.

La migración a MapLibre está medida en el teléfono: el p95 por frame pasa de 57 ms a 16 ms y los
marcadores dejan de costar (+19 ms por frame en Leaflet, 0 medible en GL).

Pendiente:

- **Rotar las credenciales de Atlas y Cloudinary**: quedaron expuestas en una sesión anterior.
- Sacar Leaflet cuando MapLibre lleve un ciclo de ruta completo sin sorpresas.
- Crear una cuenta `lector` (hoy las 4 cuentas son `admin`, ese camino de permisos está sin probar en
  producción; en los tests del backend sí).
- **Submenú de la clave 05 ("Sin empalme", "Mica quemada"…).** Revisados los 55 logs del teléfono
  (2026-10-13): los únicos bloques con `COD_ESTADO_MED` distinto de `null` son los tres con clave 05
  (valores `"4"` y `"6"`), así que el submenú va ahí. Falta saber qué código es cada opción: el sábado
  10-10 hubo un 05 con `"6"` (log de las 09:13) y otro con `"4"` (10:20); uno es la "Mica quemada".
  Con la tabla de códigos, "sin empalme" puede pasar a proponerse desde TOES; hasta entonces, a mano.
- Firmar el APK para release.
- **Tiles vectoriales propios** (PMTiles de la Región del Maule). Quitaría la dependencia de OSM y
  Esri, que pueden cortar el acceso — ya pasó con CARTO.

Al cerrar un trabajo, actualizar esta sección y los conteos de tests de arriba.

## Estilo

Código, comentarios y mensajes de commit **en español**. Los comentarios explican *por qué*, no *qué*:
el repo está lleno de notas que justifican una decisión o documentan un caso real que falló, y conviene
seguir esa línea en vez de describir lo que el código ya dice. Mensajes de commit con prefijo
convencional (`feat(mapa):`, `fix(toes):`, `docs:`, `chore(apk):`…) y un cuerpo que cuente el porqué.
