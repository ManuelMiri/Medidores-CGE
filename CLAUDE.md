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
  coordenadas). Se procesan on-device y solo se persiste, en el teléfono: UL, ciclo, instalación,
  medidor (serie y marca), dirección, poste, clave, si hubo lectura, fecha y el GPS del lector al
  guardar. **La lectura no se guarda ni sale nunca.**
  Hay **tres excepciones deliberadas**, aprobadas una por una por el usuario. Cada una manda solo
  lo que se lista, y nunca la lectura ni el nombre del cliente:
  - **Marca permanente** (`useMarcasToes`): instalación, tipo de marca, clave y ciclo. Para que el
    lector del mes siguiente —otra persona, otro teléfono— vea que en un punto ya no hay medidor.
  - **Cambio de medidor** (`useCambiosToes`, 2026-10-14): instalación, serie y marca nuevas, serie
    anterior, ciclo y fecha. Para que la base quede igual que SAP.
  - **Pin de un servicio sin pin** (`useAltasToes`, 2026-10-14): instalación, UL, ciclo, serie, marca,
    dirección, número de poste y el GPS del lector al guardar. **Solo** para servicios que no están
    en la base (o para completar un pin que creó la app) y **solo** lecturas de los últimos 3 días.
    Dirección y poste los aprobó el usuario porque son los mismos que entrega MLA en los mapas de
    ruta. **La lectura no sale nunca: "eso no se puede tocar".**
  Si hace falta mandar algo más, parar y preguntar.
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
  `tipo` + `situacion` propuesta/confirmada/rechazada), `medidorLupa` (opcional: `numeroDeSerie` +
  `marca`), `fotos`, `historial`.
  - **Medidor lupa:** algunos servicios tienen un segundo medidor en el poste, para comparar con el
    de la casa y detectar hurto o falla. En el archivo de la ruta viene como otra fila con la MISMA
    instalación y otra serie. Se guarda en `medidorLupa`; la coordenada es la de la casa. La
    importación puede agregarle el lupa a un existente que no lo tenga, nunca pisar uno guardado.
  - Las instalaciones son texto: numéricas o con letra (`E714171252`, `G3534036`).
  - `cambioMedidor` (opcional): el último cambio que registró TOES (serie y marca anteriores y
    nuevas, si fue el principal o el lupa). Los anteriores quedan en el historial.
  - `desdeToes` (opcional): el pin lo creó la app con el GPS del lector. Solo queda como registro;
    el popup no lo muestra, y con la dirección y el poste del log el pin se ve igual que uno de MLA.
  - `fotos[].idLocal`: id que pone el teléfono, para que reintentar una subida no la duplique.
    `fotos[].fecha` es cuándo se sacó, no cuándo llegó.
- **Modelo `NotaUl`** (`backend/models/NotaUl.js`): notas de una ruta (la clave de un portón). Se
  ocultan (`visible: false`), nunca se borran; cada edición guarda el texto anterior.
- **Endpoints** (todos bajo `/api`, todos con JWT salvo login):
  - `auth`: `login`, `perfil`, `logout`, y gestión de usuarios (solo admin).
  - `medidores`: `GET /` (por `ul`, `limite`), `GET /buscar?q=&ul=A,B`, `GET /uls`, `GET|PATCH|DELETE
    /:instalacion`, `POST /`, `POST|PATCH|DELETE /:instalacion/marca`, `POST /:instalacion/fotos`,
    `PATCH /:instalacion/ubicacion` (mover el pin; admin/supervisor, deja la posición vieja en el
    historial). El `PATCH /:instalacion` general ya **no** acepta `ubicacion`.
    `POST /:instalacion/cambio-medidor` y `POST /desde-toes` los llama la app sola desde el log
    (idempotentes; `desde-toes` nunca toca una instalación que ya existe, en ninguna UL).
    `POST /:instalacion/fotos` acepta `idLocal` y `fecha`.
  - `importacion`: sube KML/KMZ/Excel de SAP → preview → `POST /confirmar` (admin).
  - `rutas`: `GET /subidas?ul=A,B` (admin: quién subió cada UL, sacado del historial de la
    importación), `GET /:ul/exportar` (xlsx formato SAP), `DELETE /:ul` (admin), y las notas:
    `GET|POST /:ul/notas`, `PATCH /:ul/notas/:id` (cualquiera con la UL; editar u ocultar, el autor o
    admin/supervisor).
- **Variables del backend:** `MONGODB_URI`, `JWT_SECRET`, `CLOUDINARY_CLOUD_NAME`,
  `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `PORT`. Frontend: solo `VITE_API_URL`.

## Comandos

```bash
cd frontend
npm test              # 235 tests con node --test (234 pasan; 1 se salta sin log real)
npm run lint          # oxlint; 3 warnings preexistentes (2 en Mapa.jsx, 1 en AuthContext.jsx)
npm run medir:mapa    # mide la fluidez del mapa en el teléfono (ver README)
npm run dev           # http://localhost:5173, ya está en el CORS de producción
npm run build         # build web (PWA)
npm run android:apk   # build nativo + cap sync + gradlew; busca el JDK solo
```

```bash
cd backend && npm test   # 129 tests: Jest + Supertest + mongodb-memory-server
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
  `adb shell svc power stayon usb` solo sirve si el teléfono **carga** por ese cable, y con el cable
  del PC del usuario no carga (`dumpsys battery`: `USB powered: false`). Lo que funciona es subir el
  apagado de pantalla mientras se prueba —`settings put system screen_off_timeout 1800000`— y
  **devolverlo al terminar: el valor del usuario es `30000`**. Si está en la pantalla de bloqueo,
  pedirle que la desbloquee (`dumpsys window | grep isKeyguardShowing`).
- **En Git Bash, `adb shell ls /sdcard/...` falla** porque Git Bash convierte la ruta a
  `C:/Program Files/Git/sdcard`. Anteponer `MSYS_NO_PATHCONV=1`.
- Los logs se pueden copiar al PC para analizarlos (`adb pull /sdcard/TOES/<archivo>`, solo
  lectura), siempre al scratchpad y nunca al repo. Mostrar solo estructura y conteos, nunca
  direcciones, lecturas ni nombres, y borrarlos al terminar.
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
| `frontend/src/hooks/useMarcasToes.js` | manda al backend las marcas permanentes |
| `frontend/src/hooks/useEnviosToes.js` | manda el cambio de medidor y crea los pines que faltan |
| `frontend/src/utils/cambiosToes.js` | qué cambios de medidor faltan en la base (puro, testeado) |
| `frontend/src/utils/altasToes.js` | qué servicios tomados no tienen pin, con sus resguardos (puro, testeado) |
| `frontend/src/hooks/useNotasUl.js` + `components/NotasUl.jsx` | notas de la ruta, con copia en el teléfono |
| `frontend/src/hooks/useSubidasUl.js` | quién subió cada UL marcada (solo admin) |
| `frontend/src/utils/colaFotos.js` + `hooks/useColaFotos.js` | fotos que esperan señal: archivos en el APK, IndexedDB en la web |
| `frontend/src/utils/archivosFotos.js` | la cola de fotos en archivos de la app y el paso desde IndexedDB (puro, testeado) |
| `frontend/src/utils/avisoWebView.js` | cuándo avisar que el WebView no deja sincronizar a TOES (puro, testeado) |
| `frontend/src/utils/copiaRutas.js` + `utils/cargaSinSenal.js` | copia de ULs y medidores en el teléfono, y qué mostrar sin señal |
| `frontend/src/hooks/useReintentoSinSenal.js` | vuelve a pedir ULs y medidores solo cuando vuelve la señal |
| `frontend/src/utils/comprimirFoto.js` | achica la foto a 1920 px antes de guardarla |
| `frontend/src/utils/reporteRuta.js` + `components/ReporteRuta.jsx` | el reporte de ruta y su texto para WhatsApp |
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
- **Cambio de medidor desde TOES:** la app actualiza sola serie y marca. Si la serie vieja era la
  del lupa, cambia el lupa. El popup muestra "Medidor cambiado: dd-mm · antes X (MARCA)".
- **Pin automático:** un servicio tomado en TOES que no está en la base se crea con el GPS del
  lector al guardar, como `pendiente`, con la dirección y el poste del log. **Sin aviso en el
  popup, a propósito**: hubo uno ("Pin creado solo desde TOES…") y al usuario no le gustó. Un pin
  que la app creó sin dirección ni poste (el 103694009, antes del formato 3) se completa solo, y
  solo en los campos vacíos. Medido contra 1.061 pines: mediana 8 m, p90 29 m, y 1,4 % a más de
  500 m. Resguardos (en `altasToes.js`):
  - no considera una UL sin medidores cargados;
  - no crea nada si la serie ya está en otro pin;
  - frena la UL si faltan más de 10 o del 20 %;
  - solo considera lecturas de los últimos 3 días, para que un pin eliminado no vuelva solo.
- **Reporte de ruta:** "📊 Reporte", al lado de "Nuevo ciclo", en el panel de TOES. Abre un popup
  con servicios, avance, leídos, casas cerradas por tipo, eriazos, cambios de medidor, otras claves,
  pendientes y nuevos, y un botón **Copiar** que arma el texto para WhatsApp. Las categorías no se
  pisan (cada tomado va a una sola según su clave), así que suman el total. "Nuevos" va aparte:
  son los que no venían en la ruta, o sea creados desde TOES en ese ciclo o todavía sin pin.
  **Cada fila se toca** (y cada clave del detalle) y despliega su lista "instalación - serie" con
  un **Copiar lista**, una a la vez. Sin encabezado, para pegarla directo. Los tomados van en el
  orden en que se leyeron; los pendientes, por instalación (comparación numérica). En los cambios
  de medidor va la serie **nueva** con "(antes X)": la lectura con clave 10 trae la vieja, la nueva
  sale de `toes.cambiosMedidor` o, si ese bloque no llegó, de la base.
- **"👤 Subida por"** (solo admin): bloque propio en el panel, **justo arriba del Resumen**, con
  cada UL marcada y quién la importó (`GET /rutas/subidas`). Si la subieron en partes, la primera
  persona "y N más". **No va en el bloque de TOES**: ahí estuvo primero, entre la UL y el ciclo, y
  una UL sin lecturas del ciclo no tiene bloque de TOES, así que no se veía (lo pidió el usuario:
  "debe estar siempre disponible"). Cada fila dice el nombre, "sin registro" si la UL no viene de
  una importación (E3559701, al 2026-10-21) o "…" si no hubo respuesta (sin señal, o un backend sin
  la ruta).
- **Notas de la UL:** botón 📝 en cada UL marcada, con el número de notas a la vista. Sin señal
  muestra la última copia guardada en el teléfono.
- **Fotos:** se achican a 1920 px (JPEG 0,75: de varios MB a unos cientos de KB) y se guardan en el
  teléfono **antes** de subir. Sin señal quedan en la cola, se ven con ⏳ en el popup y el panel
  avisa cuántas esperan. Se suben solas al volver la red o la app, o cada minuto. Un 4xx no se
  reintenta solo, pero la foto nunca se descarta. **En el APK (desde la 2.6) la cola son archivos de
  la app** (`files/colaFotos/<idLocal>.jpg` + `.json`, con `@capacitor/filesystem` y
  `Directory.Data`), y no el IndexedDB del WebView: así sobrevive a bajar de versión el WebView. Las
  que había en IndexedDB pasan solas a archivos (cada una se saca de IndexedDB recién después de
  escribirla) y la base `fotos` se borra cuando queda vacía. En la web sigue en IndexedDB.
- **Aviso del WebView** (desde la 2.6): si la app corre sobre un WebView 155 o posterior, el mapa
  avisa en rojo que TOES no va a sincronizar y que hay que bajar el WebView **antes** de abrir TOES.
  "Entendido" lo cierra hasta la próxima vez que se abra la app (no se recuerda a propósito: mientras
  siga la 155, el problema sigue). Solo en el APK. El pie del panel muestra además la versión del
  WebView junto a la de la app ("Versión 2.6 (9) · WebView 134").
- **"🚗 Ir"** en el popup abre Google Maps con la URL universal (`utils/navegacion.js`); en el APK
  Android la pasa a la app de Maps. **"◎"** (abajo a la derecha) centra en tu posición y prende el
  punto azul si estaba apagado; es un contador (`pedidoCentrar`) que escuchan los dos motores.
- **Sin señal** (caso del 2026-10-16): cada carga de ULs y de medidores deja una copia en el
  teléfono (`utils/copiaRutas.js`: IndexedDB, por usuario; "Salir" la borra). Al abrir se muestra
  primero la copia y después lo que llega de la red; sin red queda la copia con el aviso "📵 Sin
  señal: … copia guardada del dd-mm hh:mm" y un Reintentar, y se vuelve a pedir solo (al volver la
  red, al volver a la app y cada minuto). Cada UL cae a su copia por separado. Un 403/404 no usa la
  copia: la UL ya no es tuya. Antes un error de carga **reemplazaba la app entera** por un aviso
  rojo, sin mapa ni TOES ni forma de reintentar. Tope de espera: 20 s la lista, 60 s los medidores.

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
- **La carga de medidores trae hasta 1500 por UL** (`limite=1500`; las rutas más largas tienen ~1000).
  Era 500 y una ruta de 515 dejaba 15 fuera del mapa sin aviso. El backend no tiene tope propio, así
  que el límite vive solo en `Mapa.jsx`. El buscador igual termina preguntando al servidor.
- **Respuestas opacas en el caché.** Chrome le cobra ~7 MB de cuota a cada una. Cachear solo `200` con
  `type !== 'opaque'`.
- **Capacitor 8 exige JDK 21.** Con 17 el build muere con `invalid source release: 21`, mensaje que no
  menciona los JDK. De eso se encarga `scripts/compilarApk.mjs`.
- **`cap sync` reescribe `capacitor.build.gradle` y `capacitor.settings.gradle`** con otros finales de
  línea. Si `git diff` no muestra contenido, descartarlos con `git checkout --`.
- **El repo trabaja en Windows con `core.autocrlf=true`.** El README y CLAUDE.md son CRLF: al
  editarlos con scripts hay que normalizar y devolverlos a CRLF, o quedan con finales mezclados.
  `gradlew` está fijado a LF en `.gitattributes` porque con CRLF no arranca en macOS ni Linux.
  **`sed -i` de Git Bash le saca los CR a todo el archivo**, y un `sed 's/$/\r/'` para devolverlos deja
  un `\r` suelto al final: git pasa a tratar el archivo como binario (`git ls-files --eol` dice
  `-text`) y el diff sale entero. Ya pasó con `Mapa.jsx`. Para editar, usar el editor y no `sed -i`;
  para revisar, `git ls-files --eol <archivo>` tiene que decir `i/lf w/crlf`.
- **Capacitor escribía en logcat el texto completo del log de TOES**, con datos de clientes, porque
  registra el resultado de cada llamada a un plugin. Ya está cerrado con `"loggingBehavior": "none"`
  en `capacitor.config.json`; si alguien lo vuelve a prender para depurar, que no quede así.
- **Un `confirm()` o `alert()` abierto cuelga `webviewCdp.mjs`.** El diálogo bloquea el hilo de la
  página y `Runtime.evaluate` no contesta hasta que alguien lo cierra en el teléfono. Para probar algo
  que pregunta (cambiar de motor, eliminar), reemplazar `window.confirm`/`window.alert` antes, o hacer
  directo lo que haría el botón (el motor es `localStorage.motorMapa`).
- **Si se publica el backend con la app abierta, los envíos automáticos no se reintentan hasta
  reabrirla.** La marca, el cambio de medidor y el pin nuevo se intentan una vez por sesión cuando
  el servidor contesta. Una app abierta antes del deploy recibe 404 del backend viejo y no
  insiste. Pasó el 2026-10-14: el pin recién se creó al recargar. Reintentar cada 10 minutos lo
  evitaría; se ofreció y no está hecho.
- **`git merge -F -` no lee el mensaje de stdin** (`git commit -F -` sí). Escribirlo a un archivo.
- **Bajar la versión del Android System WebView borra el IndexedDB y el localStorage de las apps**
  (2026-10-16): una versión vieja no abre lo que escribió una más nueva y lo recrea vacío. En el APK
  eso es la sesión, las ULs marcadas, el estado de TOES (se reconstruye releyendo los logs, pero hay
  que volver a elegir la carpeta) y la copia sin señal. **Las fotos en cola ya no** desde la 2.6:
  son archivos de la app (`files/`, fuera de `app_webview/`); con la 2.5 o anterior sí se pierden.
  A TOES le pasa lo mismo con sus lecturas pendientes (ver Estado).
- **`indexedDB.open('x')` sin versión, desde DevTools, crea la base vacía** si no existía, y la app ya
  no corre su `onupgradeneeded`: queda sin almacén y falla sin avisar. Para mirar una base, preguntar
  antes con `indexedDB.databases()`. `copiaRutas.js` se repara solo; `toesStore.js` no (y
  `colaFotos.js` en la web tampoco; en el APK ya no usa IndexedDB).
- **Un `element.click()` desde `webviewCdp.mjs` no es un gesto del usuario**, así que copiar al
  portapapeles falla (`writeText` y `execCommand` dan error) aunque con un dedo funcione. Para
  probar algo que pide gesto, tocar con `Input.dispatchMouseEvent` (pressed + released) en el
  centro del botón: pasa por el mismo camino que un toque real. Pasó con el Copiar del reporte.
- **En un script `node -e`, un template literal se come las barras invertidas** (`\s` queda `s`,
  `\n` queda salto de línea). Para editar código con regex o con `\n`, usar el editor y no
  `node -e`. Ya rompió una regex sin que fallara nada.
- **Si el parser empieza a sacar algo nuevo del log, subir `FORMATO_PARSER`** (`cursorToes.js`).
  Lo ya leído quedó guardado sin ese dato, y el cursor no vuelve atrás. Con el formato nuevo, cada
  log se relee una vez (es inofensivo: todo se deduplica).
- **Lo que se sabe del log** (revisado el 2026-10-14 sobre 53 logs y 2.315 lecturas):
  - `LEC_COOR_X` es la **latitud** y `LEC_COOR_Y` la longitud: el GPS del lector al guardar.
    Viene en todas las lecturas. `COORDENADA_X/Y` no sirve: falta en el 27 % y, donde viene, queda
    a ~1,8 km del GPS.
  - **La dirección de MLA** es `STREET HOUSE_NUM1 HAUS_NUM2 BUILDING DIST_SUPL CO_ADDRESS_CITY1`,
    con los vacíos salteados y separados por espacio (igual a la de la base en 1.061 de 1.061).
    **El poste es `INVENTORY`** (1.061 de 1.061).
  - **Cambio de medidor:** el "Backup" de la orden lleva clave 10, sin lectura, y el medidor
    **viejo** en `GERAET`/`HERST`. Justo después viene un bloque aparte, `/CambioMedidor`
    (`method: create`), con `SERNR` y `HERST_CAMMED` del **nuevo** y su lectura (que no se copia).
  - `MOT_LEC_INVEROSIMIL` marca una lectura que TOES encontró rara, y `ZZABLHINW2: "04"` es el
    lector confirmándola. **No tiene que ver con una devolución** (lo aclaró el usuario).
  - Dos "Backup" de la misma instalación al mismo segundo con distinto `ZWKENN` (AC/AR) son dos
    registros del mismo medidor, no una relectura.
  - El cierre parcial TOES lo escribe **"Cierre Especial"** (`tipo: 'especial'` en el parser), no
    "parcial". El reporte lo mostró como "en curso" por buscar la palabra equivocada.

## Estado y qué falta

Producción está en `bd933de`, publicado el 2026-10-21 (`main` y `Develop`; Vercel en `success` y
la web ya sirve el bundle con "copia guardada"). El backend no cambia desde `61ef7af`, del
2026-10-14. Tiene:
- lo anterior: TOES, la marca permanente, MapLibre, el buscador por UL y el panel desplegable;
- de la rama `terreno-oct`: mover un pin, "Solo casas cerradas" (con aviso "Ver todo"), "Ir",
  "centrar en mí", hasta 1500 medidores por UL, rutas grandes al importar (límite 10 MB),
  instalaciones repetidas en el archivo, medidor lupa y el control de ULs del lector en
  `GET /medidores?ul=`;
- de la rama `ajustes-terreno`: cambio de medidor desde TOES, pin automático (con dirección y poste
  del log, `FORMATO_PARSER` 3, y sin aviso en el popup), notas por UL, fotos comprimidas con cola
  sin señal y el reporte de ruta (con el cierre "Especial" bien leído);
- de la rama `sin-senal`: la app abre y trabaja sin señal con la copia del teléfono (ver "Sin
  señal" en Comportamientos decididos), y el README al día.

Verificado en producción: se creó el pin 103694009 (E3550001) y E713709426 quedó con la serie
nueva.

El APK repartido es la **2.5 (code 8)**, build de debug del commit `2a876ed`. Su copia
(`MLA-Maule-2.5.apk`) estaba en `frontend/android/app/build/outputs/apk/debug/` y **se perdió el
2026-10-21**: cuando Gradle vuelve a empaquetar, limpia esa carpeta. Si hace falta, se recompila
desde ese commit (la llave de debug es la de este PC). Las copias para repartir van en la **raíz
del repo**, al lado de `MLA-Maule-2.2.apk` (`*.apk` está en el `.gitignore`). Lo de solo frontend
no llega a los teléfonos que sigan con una versión anterior; lo del backend sí.

En la rama `fotos-y-webview` (sin publicar), la **2.6 (code 9)**: la cola de fotos en archivos y el
aviso del WebView 155, sobre todo lo de `sin-senal` (que tampoco está en ningún APK repartido).
Agrega `@capacitor/filesystem` 8.1.4, fijado exacto (la 8.1.5 tenía 6 días), que no suma permisos
al manifest. Copiada como `MLA-Maule-2.6.apk` en la raíz del repo. Instalada en el teléfono del
usuario el 2026-10-21 y probada:
- una foto sintética puesta en la cola vieja (IndexedDB) para la instalación `PRUEBA-COLA-FOTOS`
  pasó sola a `files/colaFotos/`, la base `fotos` se borró, la subida leyó el archivo y el servidor
  contestó 404 (antes de Cloudinary: no queda nada), y la foto quedó marcada con el motivo. Después
  se borró a mano;
- con el user agent cambiado a Chrome/155 por CDP, el aviso sale en los dos motores y "Entendido"
  lo cierra; con el real (134) no sale.
Lo que falta probar es sacar una foto de verdad con la cámara, sin señal, y verla subir sola.

Encima, en la rama `reporte-y-subidas` (sin publicar, sale en la misma 2.6): las listas del reporte
y "Subida por …". **Toca el backend** (`GET /rutas/subidas`, ruta nueva: los APK viejos no la usan).
Probado en el teléfono el 2026-10-21 sobre E3515013, con la respuesta de `/subidas` puesta por CDP
(`Fetch`, porque producción todavía no la tiene) igual a la que da la consulta real: casas
cerradas 16 líneas y pendientes 6, todas "instalación - serie", una lista abierta a la vez; el
cambio de medidor con "(antes …)"; "Copiar lista" con un toque de verdad da "✓ Copiada". El bloque
"👤 Subida por", sobre E3510001 (sin lecturas de TOES en el ciclo): "Ccastillo" con la respuesta
real, "sin registro" con una vacía y "…" contra producción, que hoy da 404. La agregación se corrió
solo-lectura contra la base: 25 de 27 ULs tienen quién la subió. **Hasta publicar el backend, el
bloque muestra "…"**.

La migración a MapLibre está medida en el teléfono: el p95 por frame pasa de 57 ms a 16 ms y los
marcadores dejan de costar (+19 ms por frame en Leaflet, 0 medible en GL).

El modo sin señal está probado en el teléfono con la red cortada al WebView
(`Network.emulateNetworkConditions`), en los dos motores, el 2026-10-16 y de nuevo el 2026-10-21:
con la red cortada, el mapa con la copia y el aviso "📵"; al volver la red, el aviso se va solo en
menos de 5 s.

**TOES y el WebView (2026-10-16):** con el Android System WebView 155, TOES deja de sincronizar ("No
se pudo establecer la conexión"): sus consultas salen sin cookies y el servidor contesta 403. Con la
154 funciona. Bajar de versión borra lo pendiente de TOES (su cola vive en el IndexedDB del WebView),
así que solo se cambia con TOES sin nada pendiente. Play Store está en "No actualizar apps
automáticamente" (Google ya no deja apagarlo solo para el WebView), **y no alcanza**: usar Chrome o
Maps vuelve a instalar la 155. Desde entonces el usuario desinstala las actualizaciones del WebView
**todos los días** y trabaja con la **134.0.6998.135 de fábrica** (visto el 2026-10-21), con la que
TOES sincroniza. El riesgo es el orden: si TOES o esta app alcanzan a abrirse con la 155, al volver
a la 134 se borra lo que tengan en el WebView (en TOES, las lecturas sin sincronizar; acá, la sesión
y, hasta la 2.5, las fotos en cola). Quedan dos respaldos de TOES en `/data/local/tmp` del teléfono, para borrar
cuando el supervisor confirme.

Pendiente:

- **Comprimir las respuestas del backend** (`compression` en Express): hoy no se comprimen, y con poca
  señal bajar los medidores de una UL larga (del orden de un MB) tarda.
- **Avisar del WebView 155 a CGE o al supervisor:** la falla es de TOES (sus consultas salen sin
  cookies) y les va a pasar a todos los lectores a los que se les actualice el WebView.
- **Servicio devuelto por la analista** (pedido del usuario: que vuelva al mapa con un color
  especial). Está en pausa hasta analizar un caso real. **El log no registra la devolución**: lo
  único que se ve es la misma orden (`ABLBELNR`) guardada de nuevo horas después, cuando el lector
  vuelve. El caso del 2026-10-14 (E713709426) se tomó a las 11:59 y se volvió a guardar a las 16:53,
  después de terminar la ruta y antes del cierre de las 17:07. Mirar en el próximo caso si TOES
  escribe algo al **recibir** la orden devuelta: una descarga, otro `sPath` o algún campo que cambie.
  Si no escribe nada, habrá que marcarlo a mano (un botón en el popup).
- **Rotar las credenciales de Atlas y Cloudinary**: quedaron expuestas en una sesión anterior.
- Sacar Leaflet cuando MapLibre lleve un ciclo de ruta completo sin sorpresas.
- Crear una cuenta `lector` (hoy las 4 cuentas son `admin`, ese camino de permisos está sin probar en
  producción; en los tests del backend sí). El último hueco conocido (`?ul=` ajena) ya está cerrado.
- **Submenú de la clave 05 ("Sin empalme", "Mica quemada"…).** Revisados los 55 logs del teléfono
  (2026-10-13): los únicos bloques con `COD_ESTADO_MED` distinto de `null` son los tres con clave 05
  (valores `"4"` y `"6"`), así que el submenú va ahí. Falta saber qué código es cada opción: el sábado
  10-10 hubo un 05 con `"6"` (guardado a las 10:12, UL E3508013) y otro con `"4"` (12:29, misma UL);
  el usuario no recuerda cuál fue la "Mica quemada". La próxima vez que marque una en terreno va a
  anotar la hora o la instalación: buscar ese bloque y armar la tabla. Con eso, "sin empalme" puede
  pasar a proponerse desde TOES; hasta entonces, a mano.
- **Decirle al lector qué clave elegir en TOES** en un punto con marca permanente: `etiquetas` de
  `clavesToes.json` ya trae `textoToes` por tipo ("26 - Sitio eriazo"), pero el popup no lo usa.
  (Las "etiquetas anticipadas" del plan original son la marca permanente: no hace falta otro campo.)
- **El medidor lupa en TOES:** no se sabe si TOES lo muestra como una lectura aparte del mismo
  servicio (mismo `ANLAGE`, otro `GERAET`). Si es así, el índice por instalación de `useToes` los
  juntaría. Revisar con un log real cuando toque uno.
- Firmar el APK para release.
- **Tiles vectoriales propios** (PMTiles de la Región del Maule). Quitaría la dependencia de OSM y
  Esri, que pueden cortar el acceso — ya pasó con CARTO.

Al cerrar un trabajo, actualizar esta sección y los conteos de tests de arriba.

## Estilo

Código, comentarios y mensajes de commit **en español**. Los comentarios explican *por qué*, no *qué*:
el repo está lleno de notas que justifican una decisión o documentan un caso real que falló, y conviene
seguir esa línea en vez de describir lo que el código ya dice. Mensajes de commit con prefijo
convencional (`feat(mapa):`, `fix(toes):`, `docs:`, `chore(apk):`…) y un cuerpo que cuente el porqué.
