# Medidores-CGE

Aplicación para que técnicos de terreno de CGE (Compañía General de Electricidad) ubiquen y registren medidores eléctricos perdidos o sin documentar en el Maule rural. Nace de un problema real: al revisar las rutas de lectura se detectaron 25 rutas "mal enrutadas" con cerca de 85 medidores sin registrar en el sistema, lo que obligaba a los técnicos a buscarlos a ciegas en terreno.

El backend además fue usado como base para el encargo de la Unidad 2 del ramo Programación Backend (Tec. en Ciberseguridad, IPG): login seguro, API RESTful, JWT, autorización por roles, pruebas automatizadas, caché y una estrategia de escalabilidad.

## Estado actual

| Pieza | Dónde vive | Estado |
|---|---|---|
| Backend Express | Railway (`https://medidores-cge-production.up.railway.app`) | En producción |
| Frontend web / PWA | Vercel (`https://medidores-cge.vercel.app`) | En producción |
| APK Android (Capacitor) | `frontend/android/`, sideload interno | Lee la carpeta `/TOES` sola, cachea tiles y corre verificado en un Galaxy A36 |
| Integración con logs de TOES | Solo en el teléfono (IndexedDB) | Completa: parser, visibilidad del mapa y lectura automática de `/TOES` en el APK |

Base de datos: MongoDB Atlas, base `cge_db`. Las 4 cuentas existentes son de rol `admin`; **no existe ninguna cuenta `lector` todavía**, así que ese camino de permisos está sin probar end-to-end.

## Stack

- **Backend:** Node.js, Express 5, Mongoose 9, MongoDB Atlas
- **Frontend:** React 19 + Vite 8, Leaflet 1.9 + react-leaflet 5, Bootstrap 5, react-router-dom 7, `vite-plugin-pwa`
- **Nativo:** Capacitor 8.5 (`@capacitor/core`, `cli`, `android`, `app`, `preferences`)
- **Autenticación:** JWT + bcrypt
- **Fotos:** Cloudinary (subida vía multer en memoria)
- **Importación de rutas:** KML (`@tmcw/togeojson`) y Excel de SAP (`xlsx`)
- **Testing:** backend con Jest + Supertest + `mongodb-memory-server`; frontend con `node --test` (runner nativo de Node, sin dependencias nuevas)

## Estructura del repositorio

```
backend/
├── app.js                  # Express app + rutas + CORS (sin listen, sin conexión a Mongo)
├── index.js                # Conexión a Mongo + listen + modo cluster (producción)
├── middleware/auth.js      # proteger (verifica JWT y lista negra) y soloRol (autorización)
├── models/
│   ├── Usuario.js          # rol: lector | supervisor | admin; unidadesLectura: [String]
│   ├── Medidor.js          # instalacion (único), unidadDeLectura, ubicacion GeoJSON, fotos, historial
│   └── TokenInvalido.js    # lista negra de tokens, con índice TTL
├── rutas/
│   ├── auth.js             # login, perfil, logout + gestión de usuarios (admin)
│   ├── medidores.js        # CRUD de medidores + /buscar + /uls
│   ├── fotos.js            # subida de fotos a Cloudinary
│   ├── importacion.js      # preview + confirmar de KML/Excel (admin)
│   └── rutas.js            # exportar y borrar una UL completa
├── utils/
│   ├── cache.js            # caché en memoria (TTL 60s)
│   ├── cloudinary.js
│   ├── excelSap.js         # parseo del Excel de SAP
│   ├── kml.js              # parseo de KML a medidores
│   └── mapeoMedidor.js
├── data/
│   ├── medidores.json
│   └── seed.js             # OJO: hace Medidor.deleteMany({}) — no correr contra Atlas de producción
└── tests/                  # 5 suites, 50 tests

frontend/
├── capacitor.config.json   # appId cl.mla.maule, webDir dist, androidScheme https
├── .env.native             # VITE_API_URL absoluta para el build del APK
├── vite.config.js          # PWA con injectRegister: false (el SW se registra a mano)
├── scripts/compilarApk.mjs # busca un JDK 21 y corre gradlew (sirve en cualquier shell)
├── public/sw-tiles.js      # service worker del APK: cachea tiles, no precachea nada
├── android/                # proyecto Android (Capacitor). Versionado; fuera de Vercel
│   └── app/src/main/java/cl/mla/maule/
│       ├── MainActivity.java      # registra el plugin de TOES
│       └── toes/ToesPlugin.java   # lee /TOES por SAF, solo lectura
└── src/
    ├── pages/Mapa.jsx      # el mapa; ~785 líneas, es el archivo central del frontend
    ├── pages/Login.jsx
    ├── components/
    │   ├── PanelToes.jsx       # bloque "Lecturas de TOES" del panel lateral
    │   ├── CapaMedidores.jsx   # los pines: memoizados y con culling por viewport
    │   ├── CargaKml.jsx, PreviewImportacion.jsx, CapturaFoto.jsx,
    │   └── MiUbicacion.jsx, GestionUsuarios.jsx
    ├── hooks/useToes.js        # une parser + almacén + mapa
    ├── utils/
    │   ├── toesParser.js       # parseo de los logs de TOES (lógica pura, testeada)
    │   ├── toesParser.test.js  # 25 tests
    │   ├── cursorToes.js       # cursor de lectura incremental en bytes (+ 27 tests)
    │   ├── toesNativo.js       # puente con el plugin nativo y bucle de lectura
    │   ├── toesStore.js        # persistencia en IndexedDB
    │   ├── vistaMarcador.js    # decide ocultar/atenuar/colorear cada marcador
    │   ├── agrupar.js          # junta los medidores del mismo punto (+ 9 tests)
    │   ├── iconosMapa.js       # los pines, bundleados (no traidos de la red)
    │   └── __fixtures__/logSintetico.js  # generador de logs falsos para los tests
    ├── config/clavesToes.json  # configuración editable de la integración
    ├── context/AuthContext.jsx
    └── services/api.js         # axios con el token en Authorization: Bearer
```

## Integración con los logs de TOES

**TOES es la app oficial de CGE** con la que los lectores toman las lecturas. No tenemos su código y **no se modifica ni se descompila**. Lo único que expone es un archivo de texto en la carpeta `/TOES` del almacenamiento compartido del teléfono, al que le agrega un bloque cada vez que se guarda un servicio.

El objetivo: a medida que el lector guarda servicios en TOES, esos puntos **desaparecen del mapa de pendientes** de su unidad de lectura (UL), respetando el ciclo mensual de cada ruta. En rutas rurales, donde encontrar un servicio ya cuesta, eso es tiempo que no se pierde buscando medidores que ya no hace falta visitar.

### Regla de privacidad (no negociable)

El log trae **datos de clientes**: direcciones, lecturas y coordenadas.

- **Todo el procesamiento ocurre dentro del teléfono.** No hay ningún endpoint de backend para esto y no debe haberlo.
- El estado derivado se guarda en **IndexedDB** del dispositivo y nunca sale de ahí. Solo se guarda: UL, ciclo, instalación, número de medidor, clave (si hubo), si hubo lectura y fecha.
- **Solo lectura:** nunca escribir, mover ni borrar archivos en `/TOES`.
- **Los logs reales no entran al repositorio.** `.gitignore` bloquea `Log_TOES*.txt` y `*.log.txt`. Los tests usan el fixture sintético de `__fixtures__/`, con datos inventados.

Esto tiene una consecuencia de arquitectura importante: **la funcionalidad central no toca nada del backend.** Ni el esquema de `Medidor`, ni la whitelist de PATCH, ni endpoints nuevos, ni permisos. La única excepción es CORS (ver más abajo).

### Cómo se lee el log

`toesParser.js` es lógica pura sin dependencias. Los puntos que importan, todos validados contra dos logs reales de la UL `E3505704`:

- Los bloques JSON se extraen **contando llaves y respetando strings y escapes**, no línea por línea: el JSON ocupa varias líneas.
- Se procesan **solo** los bloques `Backup de la lectura (`. Los bloques `Sincronizado correctamente` repiten los mismos campos — contarlos duplica todo (con un `grep` ingenuo salían 18 claves en vez de 9).
- Un bloque incompleto al final del archivo no se procesa: el cursor (`consumido`) queda antes de él, y el próximo pase lo toma completo.
- `ANLAGE` (instalación) y `ABLEINH` (UL) se comparan como **string exacto con `trim()`**, nunca convertidos a número: en los logs reales aparecen `E714264365`, `102508712` y `G3564834`.
- **Regla de ciclo:** el ciclo vigente de una UL es el `ADATSOLL` más reciente visto para esa UL. Comprobado contra datos reales: una ruta partida en dos días (`Log_TOES-2026-10-06` y `-2026-10-07`) lleva el mismo `ADATSOLL: 2026-10-06` — **dos días de trabajo son un solo ciclo**. Al cambiar el ciclo, los puntos tomados vuelven a aparecer como pendientes.
- **Correcciones:** ante repetidos de UL+ciclo+instalación, gana el `ACTUALMRDATE` mayor. Si la corrección *borra* la lectura, el punto vuelve a pendiente — de ahí el estado `noTomado`, que evita el bug de "el medidor nunca se vuelve a leer".
- **Cierres:** TOES escribe dos variantes, `Cierre Especial` (parcial, al terminar un día) y `Cierre Final` (ruta completa). Las dos se reconocen; la especificación original solo documentaba la primera.
- Un medidor con varios registros (`ZWNUMMER`) escribe un bloque por registro: se colapsan a una sola instalación.
- `parsearLog` devuelve un contador `invalidos`. Si TOES cambia de formato ese número sube y el panel lo muestra — es el canario, no un error silencioso.
- **Las claves están en `clavesToes.json`**, con la tabla oficial de la columna "Normal" de TOES: 34 códigos, 20 activos y 14 marcados `activo: false`. Los inactivos siguen ahí porque un log viejo todavía puede traerlos, y salen con el color neutro. Una clave que no esté en la tabla tampoco rompe nada: sale como "clave NN" en neutro.
- Las 7 claves que aparecieron en los logs reales (`01, 02, 08, 09, 11, 20, 26`) son **todas activas**, lo que encaja con que TOES solo escriba códigos vigentes.
- `ZZABLHINW2` (valores `"04"`, `"32"`) sigue sin significado conocido. Se ignora.

### Lo que se mide sobre datos reales

- **Cruce con la base:** 152 servicios tomados en dos días → 148 calzan con medidores de la misma UL, 0 en otra UL, 4 no existen en la base. La UL `E3505704` tiene 281 medidores, así que el mapa muestra **148 marcadores menos (52,7 %)**.
- Esos 4 sin punto en el mapa son el caso real de "tomados sin punto": el panel los lista con un botón para copiarlos, porque son candidatos a mapear.
- **Rendimiento:** el log completo de 744 KB se parsea en 3 ms; la peor lectura incremental individual fue de 0,1 ms. Con un sondeo de 5 s el margen es de unas 1600×, así que el costo real estará en el puente nativo, no en el parseo.
- **Simulación incremental:** los dos logs alimentados en 254 trozos de tamaño variable, **todos cortando dentro de un bloque JSON** → 159 eventos, cero duplicados, estado final idéntico al de una pasada única.

### Qué está hecho y qué falta

Hecho (lo que no dice "APK" se puede verificar en el navegador):

- Parser, almacén en IndexedDB, hook, panel lateral y lógica de visibilidad del mapa.
- Carga manual de logs con `<input type="file" multiple>` (los archivos se ordenan por nombre, que es orden cronológico).
- Contador tomados/total por UL con barra de progreso, ciclo vigente, insignia CERRADA / cierre parcial, botón "Nuevo ciclo" (con confirmación), interruptor "Ver tomados" (atenuados) y la lista de tomados sin punto en el mapa.
- **Nunca se borra** un punto, una foto, una descripción ni una etiqueta: solo cambia la visibilidad.
- **Lectura automática de `/TOES` en el APK** por el Storage Access Framework. El lector elige la carpeta una sola vez y desde ahí la app la relee sola cada 5 s, sin volver a pedir nada. Ver "Lectura automática de /TOES" más abajo.
- **Los pines van agrupados por punto** (`agruparCercanos`, 5 m), así que la decisión es por grupo y no por medidor: el pin se oculta solo cuando no queda ningún servicio por visitar, el contador cuenta los que quedan (no los que hay), y se atenúa solo si todo lo que queda en ese pin ya fue tomado. Un medidor elegido a propósito — tocado o buscado — se muestra aunque TOES lo haya tomado; sin esa excepción, buscar una instalación ya tomada no mostraría nada y el buscador parecería roto.

Pendiente:

- **Probar los 2 últimos criterios de aceptación en el teléfono.** El código de los 11 está escrito y compilado, pero el permiso persistente de `/TOES` y el "el punto desaparece en 5-10 s" solo se pueden dar por buenos con TOES real guardando un servicio. Todo lo demás está cubierto por tests.
- **Etiquetas anticipadas** (sitio eriazo / sin empalme / no encontrado) para avisarle al lector qué clave elegir en TOES. Es la única parte que sí toca el backend, porque las etiquetas son datos propios de la app y se comparten entre usuarios: campo `etiquetas: [String]` en `models/Medidor.js` y en la whitelist `camposPermitidos` de `rutas/medidores.js`. **Nunca cambiar etiquetas automáticamente.**
- **Una sola etiqueta anticipada sigue sin clave que sugerir.** "Sitio eriazo" y "No encontrado" ya apuntan a las claves 26 y 02. "Sin empalme" no: la clave 16 existe pero está inactiva, así que hasta que CGE diga con cuál se reemplaza, esa etiqueta no sugiere ninguna.
- **Crear una cuenta `lector`** con `unidadesLectura: ["E3505704"]` para probar el camino de permisos real.

### Lectura automática de /TOES

El plugin nativo vive en `frontend/android/app/src/main/java/cl/mla/maule/toes/ToesPlugin.java` y se
registra a mano en `MainActivity.java` (no es un paquete npm). El lado JS está en
`src/utils/toesNativo.js`, y `src/hooks/useToes.js` arma el bucle.

**Por qué hace falta código nativo.** Una PWA pura no puede leer esa carpeta: Chrome en Android no
expone `showDirectoryPicker()`, solo el Origin Private File System, que es un sandbox. Y
`@capacitor/filesystem` tampoco sirve, porque solo alcanza directorios propios de la app, no el
almacenamiento compartido. El Storage Access Framework (`ACTION_OPEN_DOCUMENT_TREE` +
`takePersistableUriPermission` + `DocumentFile`) resuelve las dos cosas y **no necesita ningún permiso
en el manifest**: el del APK declara solo `INTERNET`, sin `MANAGE_EXTERNAL_STORAGE`.

**Está en Java y no en Kotlin.** El proyecto Android que genera Capacitor es Java puro; meter Kotlin
obligaba a sumar su plugin de Gradle y la stdlib al APK, y el SAF es exactamente la misma API desde los
dos lenguajes.

**Solo lectura, y a propósito.** El log es la fuente de verdad de la lectura del mes de CGE: si se le
escribe encima se puede arruinar una ruta ya tomada. El plugin solo lista y abre en modo `"r"`; no hay
una sola llamada que modifique (ni `delete`, ni `renameTo`, ni `"w"`). El contenido tampoco sale del
teléfono: se lee, se extrae lo que el mapa necesita y el texto se descarta.

**El cursor va en bytes, no en caracteres.** Es la parte que se equivoca en silencio, así que vive
aparte en `utils/cursorToes.js` con 27 tests. El parser cuenta caracteres, el archivo se mide en bytes y
no coinciden: el log real de prueba tiene 761.639 bytes y 761.541 caracteres — 98 de diferencia por los
acentos. Mezclar las dos escalas desincroniza la lectura incremental y puede partir un carácter en dos,
rompiendo el `JSON.parse` del bloque siguiente. Los trozos se cortan siempre en un salto de línea, que
en UTF-8 nunca cae dentro de un carácter multibyte.

Los cursores guardados por versiones anteriores estaban en caracteres: se descartan una vez
(`unidadOffset`) y el archivo se relee entero. Releer es inofensivo — el estado se deduplica por
UL + ciclo + instalación y los cierres por UL + tipo + fecha.

**Lo que de verdad hace desaparecer el punto es volver a la app.** Mientras el lector está en TOES
nuestro WebView queda en segundo plano y Android congela los timers, así que el intervalo de 5 s no
corre. Por eso además se lee en el evento `appStateChange` de Capacitor: al volver al mapa la lectura
es inmediata. El intervalo cubre el caso de tener las dos apps a la vista.

Si el lector revoca el permiso desde los ajustes de Android, la siguiente lectura falla con
`SIN_PERMISO` y el panel vuelve a ofrecer "Conectar carpeta TOES". Al revés también está cubierto: si
se limpian los datos del WebView se pierde el URI guardado en IndexedDB pero el permiso de Android
sigue vivo, así que se le pregunta al plugin en vez de confiar en lo guardado.


**Ojo con logcat en los builds de debug.** Capacitor registra en el log de Android el resultado de cada
llamada a un plugin, y eso incluye el **texto completo del log de TOES** que devuelve `leerLog`: con
direcciones, lecturas y coordenadas de clientes. No sale del teléfono, pero queda legible para cualquiera
con `adb`. Solo pasa en builds de debug (el `loggingBehavior` por defecto de Capacitor solo registra si
la app es depurable), así que **antes de firmar un APK de release conviene poner
`"loggingBehavior": "none"` en `capacitor.config.json`** y verificarlo. Se deja en el default mientras
se prueba, porque es justamente ese log el que permite diagnosticar errores de JS en el teléfono.


## Rendimiento del mapa

El dato que ordena todo esto: en Atlas hay **1.765 medidores** repartidos en 8 ULs, de 83 a 302 cada
una. (Los "~85" del principio de este README son los medidores *sin registrar* que motivaron la app, no
el dataset.) El frontend pide `limite=500` por UL activa, así que con una ruta cargada hay entre 170 y
300 pines, y hasta 1.765 si se activan todas.

**Los props de `Marker` tienen que ser estables.** react-leaflet compara por identidad. Un
`position={[lat, lng]}` escrito como literal en el render da siempre distinto, y entonces cada
marcador ejecuta `marker.setLatLng()` — una escritura de layout — en cada render; un
`eventHandlers={{...}}` literal hace que se desenganchen y vuelvan a enganchar sus listeners. Con 300
pines son ~600 operaciones de DOM por cada cambio de estado de `Mapa`, aunque no tenga nada que ver con
el mapa (escribir en el buscador, abrir el panel). Por eso:

- `utils/agrupar.js` devuelve `position` ya creada, una vez por grupo.
- Las `vista` de la capa TOES se calculan en un `useMemo`, así mantienen su identidad.
- Los callbacks que bajan a `CapaMedidores` van con `useCallback`. Sin eso el `memo` de los marcadores
  no sirve de nada.

**Culling por viewport.** `CapaMedidores` solo dibuja los pines del cuadro visible más medio viewport de
margen, así que en el DOM hay ~10-40 en vez de 300. El cuadro se recalcula en `moveend`, `zoomend` y
también en `resize`: al montar, el div del mapa a veces no tiene su tamaño final y `getBounds()`
devolvería un cuadro degenerado que dejaría todos los pines afuera.

El medidor elegido **se dibuja siempre**, aunque caiga fuera del cuadro. Al buscar uno se lo selecciona
antes de que el mapa termine de moverse, y es el montaje de su marcador lo que abre el popup; si el
culling lo dejara afuera en ese instante, buscar no mostraría nada.

**Los iconos van bundleados** (`utils/iconosMapa.js`). Antes los de color salían de
`raw.githubusercontent.com` y la sombra de `unpkg.com`: dos hosts que no son CDN de producción, fuera
del `runtimeCaching` del service worker y en el camino crítico del primer dibujado. En terreno con señal
mala los pines podían tardar o no aparecer. Tampoco llevan `shadowUrl`, que era un `<img>` **extra por
marcador**.

### Memoria de terreno: puntos donde ya no hay medidor

Es lo único del mapa que **sobrevive al cierre de ciclo**, y resuelve un problema concreto: si un
lector confirma que tres puntos son sitio eriazo, antes esa información se perdía y al mes siguiente
otro lector volvía a perder tiempo buscando medidores que ya no existen.

Vive en `marcaPermanente` dentro del medidor (`backend/models/Medidor.js`), **no** en `estado`. Son
dos cosas distintas: `estado` dice si esta app tiene el medidor ubicado y documentado, y solo tiene 4
valores — metiendo ahí el motivo se perdería la diferencia entre "sitio eriazo", "se lo robaron" y "no
tiene empalme", que en terreno no son lo mismo. Al **confirmar** una marca se pone además
`estado: 'perdido'`, para que el Resumen y el color del pin queden coherentes.

**TOES propone, una persona decide.** `utils/marcasToes.js` mira la clave del ciclo y propone marca
solo con las que significan que el medidor **no está**: `26` (sitio eriazo) y `02` (medidor no
ubicado). Las de "no se pudo leer esta vez" — casa cerrada, vidrio empañado, sin acceso — **no
proponen nada** a propósito: el medidor sigue ahí y el mes que viene puede leerse. Confirmar es de
`admin` o `supervisor`: una clave mal puesta por un lector no puede dejar un medidor real descartado
para siempre.

Tres situaciones, y la tercera no es decorativa:

| Situación | Qué significa | En el mapa |
|---|---|---|
| `propuesta` | la reportó TOES, falta confirmar | pin del color del tipo, algo más suave |
| `confirmada` | una persona la dio por buena | pin del color del tipo, en firme |
| `rechazada` | alguien revisó y sí hay medidor | se comporta como un punto normal |

`rechazada` existe porque borrar la marca no alcanzaría: TOES sigue teniendo esa clave en el ciclo, así
que el sondeo la volvería a proponer a los 5 segundos.

**Un punto marcado no se oculta nunca**, aunque TOES lo haya tomado. Es justo lo que el lector nuevo
necesita ver al empezar la ruta; si se ocultara, la marca no serviría para nada.

**Si TOES registra después una lectura real, la marca se quita sola** — incluso una confirmada. Esa
lectura prueba que el medidor sí está, y es el lado seguro del error: como mucho alguien vuelve a
buscar un medidor. Lo caro es lo contrario.

Esto es lo **único** de la integración con TOES que escribe en el backend, y es deliberado: la marca
tiene que verla el lector del mes siguiente, que puede ser otra persona y otro teléfono, así que no
puede vivir solo en IndexedDB. Viaja el mínimo — instalación, tipo, clave y ciclo — y nunca la
dirección, la lectura ni las coordenadas del log.

**"Sin empalme" todavía no llega desde TOES.** Su clave 16 está inactiva: el lector lo reporta como
submenú de la clave 05, así que `METERREADINGNOTE` trae `05` y el detalle debe estar en otro campo del
bloque (candidatos vistos en logs reales: `ZZABLHINW2`, `ZZABLHINW3`, `NOTA_APK`, `RESPUESTA`). Hasta
confirmarlo contra un log real, esa marca solo se pone a mano desde el popup.


### Caché de tiles en el APK

El service worker **con precache** sigue siendo solo del navegador: dentro del WebView, Android conserva
el storage entre actualizaciones del APK y seguiría sirviendo el bundle viejo después de instalar una
versión nueva. Pero al apagarlo se iba también el caché de tiles, así que el APK volvía a bajar cada
zona ya visitada. En terreno rural eso pesa más que los pines.

La salida es un service worker propio del APK, `frontend/public/sw-tiles.js`, que **no precachea nada**
y solo intercepta los hosts de tiles. Para cualquier otra petición ni siquiera llama a `respondWith`,
así que los assets de la app y las llamadas a `/api` pasan de largo: el problema que motivó apagar el
SW no aplica. Lo registra `main.jsx` en la rama nativa.

Cuatro decisiones que no son obvias:

- **Solo respuestas `200` y no opacas.** Una respuesta opaca le cuesta ~7 MB de cuota a Chrome; con unos
  cientos de tiles el teléfono se quedaba sin espacio. Ya le pasó a este proyecto. Los tiles se piden con
  `crossOrigin="anonymous"`, así que llegan como `cors`.
- **Sin red vale una copia vencida** antes que un cuadro gris: la foto satelital de hace dos meses sirve
  igual para ubicar un medidor.
- Si se acaba la cuota igual, se bota el caché entero en vez de dejar el SW fallando en cada tile.
- La fecha de cacheo va como cabecera propia (`x-cacheado-en`) porque la Cache API no guarda cuándo se
  escribió cada entrada, y las cabeceras de una `Response` son inmutables.

`CAPAS_RETIRADAS` borra al activarse lo que quedó cacheado de capas que ya no se usan, para que no ocupe
parte de las 1.500 entradas hasta que la poda FIFO lo alcance.

### Cuántos tiles cuesta cada capa

Medido con DevTools sobre el caché real del teléfono, con 1.093 tiles acumulados:

| Capa | Tiles | Peso |
|---|---|---|
| foto respaldo (z15) | 154 | 14% |
| foto buena | 313 | 29% |
| calles (World_Transportation) | 313 | 29% |
| ~~lugares (World_Boundaries_and_Places)~~ | ~~313~~ | **retirada** |

`World_Boundaries_and_Places` costaba lo mismo que la foto misma y no se usaba en terreno: se quitó, y
el caché bajó de 1.093 a 788 tiles.

**El respaldo z15 se queda.** Cuesta 14% y no el 50% que parecía: solo pide tiles hasta z15 y de ahí
para arriba reutiliza los mismos estirados. Verificado además que a z18 la foto buena carga sus tiles
**sin un solo fallo**, o sea que el respaldo queda tapado — lo borroso del zoom máximo es el límite de
resolución de Esri, no el respaldo asomando. Sacarlo no quitaría esa borrosidad y cambiaría una foto
borrosa pero usable por un cuadro gris en un sector sin cobertura, justo en los casos difíciles.


### Lo que se probó y se descartó

- **Mover un `const` del hook debajo de un `useEffect` que lo declara en sus dependencias.** Los arrays
  de dependencias se evalúan **durante el render** y un `const` no se hoistea como una `function`, así
  que da `Cannot access 'X' before initialization`: el componente revienta, React desmonta el árbol y la
  app queda **en blanco**. Pasó de verdad al "cerrar" una advertencia de `exhaustive-deps`. Ni el build
  ni oxlint lo ven (oxlint no implementa `no-use-before-define`), y solo apareció en `adb logcat`. En
  `Mapa.jsx` las funciones de carga van arriba de los efectos por esto.
- **`markerZoomAnimation={false}`**: ahorra el handler de `zoomanim` por marcador, pero Leaflet lo
  implementa poniéndole `leaflet-zoom-hide` al panel de marcadores, o sea que **los pines se ocultan
  durante toda la animación de zoom** y reaparecen de golpe. Se lee como una falla, no como fluidez. El
  culling ataca lo mismo sin ese costo. Queda comentado en el `MapContainer`.

### Lo que falta

- **El techo es la arquitectura.** Google Maps usa tiles vectoriales sobre GPU; esto son tiles raster y
  marcadores de DOM. Esa diferencia no se cierra sin cambiar de motor (MapLibre GL).


## Autenticación y autorización

- El login genera un JWT que el cliente envía en el header `Authorization: Bearer <token>`.
- `proteger` (en `middleware/auth.js`) verifica el token en cada ruta protegida y revisa que no esté en la lista negra (colección `TokenInvalido`, con índice TTL para que los expirados se limpien solos).
- `soloRol('rol1', 'rol2', ...)` restringe según el rol: `lector`, `supervisor` o `admin`.
- El logout invalida el token agregándolo a la lista negra, así un token robado deja de servir aunque no haya expirado.
- Un `lector` solo ve y modifica medidores de las ULs que tiene en `unidadesLectura`; el resto ve todas.

Antes había dos formas distintas de verificar el token: una función local `verificarToken` en `rutas/auth.js` y el middleware `proteger`. Se unificó para usar `proteger` en ambos módulos, evitando que un fix de seguridad (como la lista negra) quedara aplicado en un solo lugar.

`POST /api/auth/registro` **requiere rol admin**: antes estaba abierto y cualquiera podía crearse una cuenta admin sin loguearse.

## Endpoints

| Método | Ruta | Rol requerido | Descripción |
|---|---|---|---|
| POST | `/api/auth/login` | — | Autentica y devuelve JWT |
| POST | `/api/auth/registro` | **admin** | Crea un usuario |
| GET | `/api/auth/perfil` | autenticado | Datos del usuario logueado |
| POST | `/api/auth/logout` | autenticado | Invalida el token actual |
| GET | `/api/auth/usuarios` | **admin** | Lista usuarios |
| PATCH | `/api/auth/usuarios/:id/rol` | **admin** | Cambia el rol |
| PATCH | `/api/auth/usuarios/:id/uls` | **admin** | Cambia las ULs asignadas a un lector |
| PATCH | `/api/auth/usuarios/:id/estado` | **admin** | Activa/desactiva (no puede desactivarse a sí mismo) |
| DELETE | `/api/auth/usuarios/:id` | **admin** | Borra la cuenta (no puede borrarse a sí mismo) |
| GET | `/api/medidores` | autenticado | Lista medidores (`pagina`, `limite`, `estado`, `ul`) |
| GET | `/api/medidores/buscar` | autenticado | Busca por `q` (instalación, dirección, poste) y `ul` |
| GET | `/api/medidores/uls` | autenticado | Unidades de lectura (un `lector` solo ve las suyas; con caché) |
| GET | `/api/medidores/:instalacion` | autenticado | Detalle de un medidor |
| POST | `/api/medidores` | autenticado | Crea un medidor (`lector` solo en sus ULs) |
| PATCH | `/api/medidores/:instalacion` | autenticado | Actualiza un medidor (`lector` solo en sus ULs) |
| DELETE | `/api/medidores/:instalacion` | **admin** | Elimina un medidor |
| POST | `/api/medidores/:instalacion/fotos` | autenticado | Sube una foto a Cloudinary (con coordenadas) |
| POST | `/api/importacion/preview` | **admin** | Parsea un `.kml`/`.xlsx` y devuelve lo que falta, sin escribir |
| POST | `/api/importacion/confirmar` | **admin** | Inserta los medidores del preview |
| GET | `/api/rutas/:ul/exportar` | **admin**, supervisor | Exporta una UL completa |
| DELETE | `/api/rutas/:ul` | **admin** | Borra todos los medidores de una UL |

## Arquitectura del backend

Dos archivos de entrada, para poder testear sin conexión real a MongoDB ni puerto abierto:

- **`app.js`**: arma la aplicación de Express (middlewares, CORS, rutas). No conecta a Mongo ni levanta el servidor. Es lo que importan los tests con Supertest.
- **`index.js`**: conecta a MongoDB Atlas y ejecuta `app.listen()`. Con `NODE_ENV=production` activa además el módulo nativo `cluster` de Node para levantar un worker por núcleo de CPU. El proceso principal solo despacha conexiones; los workers conectan a Mongo y atienden las peticiones. En desarrollo está desactivado para simplificar el debug.

### CORS

`app.js` permite tres orígenes: `http://localhost:5173` (dev), `https://medidores-cge.vercel.app` (web) y **`https://localhost`**, que es el origen del WebView de Capacitor con `androidScheme: https`. Sin ese tercero el APK **no pasa ni el login**: el token viaja como header `Authorization`, eso dispara un preflight, y el preflight se rechaza.

### Optimización

`GET /api/medidores/uls` calcula los valores distintos de `unidadDeLectura` con un `distinct` sobre toda la colección, caro de repetir en cada llamada. `utils/cache.js` guarda el resultado en memoria con TTL de 60 s.

El modelo `Medidor` mantiene **un solo índice**: `{ unidadDeLectura: 1 }`, que acelera los filtros por ruta y ese `distinct`. Se quitaron a propósito (commit `9cb382e`) el índice de texto y el `2dsphere`: el de texto no se usaba porque el buscador va por `$regex`, y el `2dsphere` solo lo usaba la ruta `/cercanos`, que el frontend nunca llamaba. Los dos hacían más lentos los inserts al importar rutas de cientos de medidores.

## Pruebas

**Backend — 50 tests en 5 suites, todos pasando.** Jest + Supertest + `mongodb-memory-server`: los tests levantan un MongoDB en memoria, así que corren en cualquier máquina sin configurar nada y sin tocar el Atlas real. Cubren auth (registro, login, logout, token invalidado rechazado), CRUD de medidores con autorización por roles, fotos, importación y rutas.

```bash
cd backend
npm test
```

**Frontend — 97 tests** (96 pasan, 1 se omite): 25 del parser de TOES, 27 del cursor de lectura incremental, 20 de la visibilidad de los pines, 16 de qué claves proponen marca permanente y 9 del agrupado por punto. Usan `node --test`, el runner nativo de Node: cero dependencias nuevas.

```bash
cd frontend
npm test
```

El test que se omite es un control contra un log real, activado solo si existe la variable de entorno `TOES_LOG_REAL` apuntando a un archivo. Así el log real nunca necesita estar en el repo:

```bash
TOES_LOG_REAL=/ruta/al/Log_TOES-2026-10-06_134628.txt npm test
```

Los demás corren contra el fixture sintético y cubren, entre otros: inmunidad a los bloques de sincronización, corte en medio de un bloque, equivalencia entre lectura incremental y de una pasada, llaves dentro de strings, los dos tipos de cierre, dos días = un ciclo, ciclo nuevo devuelve los puntos a pendientes, corrección que gana por fecha, corrección que borra la lectura, y lectura de valor `0` como válida.

## Ejecución local

### Requisitos

- Node.js 20 LTS o superior (los tests del frontend necesitan una versión con `node --test`, Node 22 en adelante)
- Para el backend local: una base MongoDB (Atlas o local)

### Solo el frontend, contra el backend ya desplegado

Es la vía más rápida: el backend en Railway ya está funcionando.

```bash
git clone https://github.com/ManuelMiri/Medidores-CGE.git
cd Medidores-CGE/frontend
npm install
```

Crear `frontend/.env`:

```
VITE_API_URL=https://medidores-cge-production.up.railway.app/api
```

```bash
npm run dev     # http://localhost:5173
```

Para entrar hace falta una cuenta real de la base. **Este README no trae credenciales**: las cuentas las crea un admin desde la pantalla de gestión de usuarios o con `POST /api/auth/registro`.

### Backend completo en local

```bash
cd Medidores-CGE/backend
npm install
```

Crear `backend/.env`:

```
MONGODB_URI=<tu string de conexión a MongoDB>
JWT_SECRET=<un secreto largo y aleatorio>
PORT=5000
CLOUDINARY_CLOUD_NAME=<...>
CLOUDINARY_API_KEY=<...>
CLOUDINARY_API_SECRET=<...>
```

```bash
npm run dev                        # desarrollo (nodemon, un proceso)
NODE_ENV=production npm start      # producción (cluster activado)
```

`backend/data/seed.js` empieza con `Medidor.deleteMany({})`. **Nunca correrlo con `MONGODB_URI` apuntando a Atlas de producción**: borra todos los medidores.

## Compilar el APK

El APK y la web salen del **mismo código**. Lo único que cambia es de dónde sale el texto del log: en el navegador lo elige el usuario, en el APK lo lee el plugin nativo desde `/TOES`. Se distingue con `Capacitor.isNativePlatform()`.

```bash
cd frontend
npm run android:apk
# -> android/app/build/outputs/apk/debug/app-debug.apk  (~7,3 MB)
```

Scripts disponibles: `android:sync` (build nativo + `cap sync`), `android:apk` (lo anterior + `scripts/compilarApk.mjs`, que busca un JDK y corre `gradlew assembleDebug`), `android:open` (abrir en Android Studio).

Datos del build: package `cl.mla.maule`, `minSdk 24` (Android 7+), `compileSdk`/`targetSdk 36`.

### Requisitos y trampas conocidas

- **Capacitor 8 exige JDK 21**, y con un JDK 17 en el `PATH` el build muere en `:capacitor-android:compileDebugJavaWithJavac` con `error: invalid source release: 21` — un mensaje que no menciona los JDK. De eso ya se encarga `scripts/compilarApk.mjs`: busca uno 21 o mayor (`JAVA_HOME`, `~/.jdks`, el `jbr` que trae Android Studio, `Program Files/Java`…), imprime cuál eligió y se lo pasa a Gradle. Si no encuentra ninguno, lo dice y explica cómo apuntarlo con `JAVA_HOME`.
  - No se usa `org.gradle.java.home` en `gradle.properties` porque ese archivo está versionado y fijaría la ruta de **una** máquina, rompiéndoselo al resto del equipo.
- **`android/local.properties` necesita barras normales**, no invertidas: Java trata `\` como escape en un archivo `.properties` y el build falla con `El nombre de archivo, el nombre de directorio o la sintaxis de la etiqueta del volumen no son correctos`.
  ```
  sdk.dir=C:/Users/<usuario>/AppData/Local/Android/Sdk
  ```
- **`ANDROID_HOME` debe ser una ruta nativa de Windows.** Una ruta estilo MSYS (`/c/Users/...`) no la entienden ni Java ni Gradle.
- **El APK necesita el CORS de `https://localhost` en el backend**, ya desplegado. Si alguna vez se cae ese origen de la lista, el APK deja de poder iniciar sesión: el preflight vuelve `204` sin `access-control-allow-origin` y no hay mensaje de error que lo explique.
- `frontend/.env.native` tiene que llevar la API con **URL absoluta**. Una ruta relativa (`/api`) apuntaría al servidor local de Capacitor y daría 404.
- El service worker se registra **solo en navegador** (`main.jsx`), con `injectRegister: false` en `vite.config.js`. Dentro del WebView, Android conserva el storage entre actualizaciones y el SW seguiría sirviendo el bundle viejo después de instalar una versión nueva.
- `frontend/android/` **sí está versionado** (ahí vive el plugin nativo de TOES, que es código fuente), pero queda fuera de Vercel por `.vercelignore`, así que el despliegue web no cambia. Lo que no entra al repo son las salidas del build: el `.gitignore` que genera Capacitor ya excluye `build/`, `*.apk`, `local.properties`, los `capacitor.*.json` generados y los assets web copiados.
- **La firma del APK nunca se commitea** (`*.jks`, `*.keystore`, `keystore.properties` están en `.gitignore`). Si se filtra, cualquiera puede publicar una actualización falsa; si se pierde, no hay forma de actualizar los APK ya instalados y hay que reinstalar en todos los teléfonos.

La distribución es por **sideload interno**, no Play Store. Conviene agregar una verificación de versión contra el backend que le avise al técnico cuando haya un APK nuevo, porque el sideload no se actualiza solo.

## Convenciones para quien trabaje en este repo

- **Fin de línea:** los archivos antiguos son **CRLF**; los módulos nuevos de TOES son LF. Al editar con scripts, respetar el que ya tiene el archivo o el diff sale entero.
- **Estilo del frontend:** sin punto y coma, comillas simples, comentarios explicativos en español que dicen *por qué*, no *qué*. `npm run lint` (oxlint) tiene 4 avisos preexistentes.
- **Nunca commitear logs reales de TOES.** Para los tests existe el fixture sintético.
- **No subir el contenido del log a ningún servidor.** Si aparece la tentación de un endpoint para "sincronizar lecturas", es exactamente lo que la regla de privacidad prohíbe.
- **No raspar tiles de Google** (`mt{s}.google.com/vt/`): viola los términos de Google Maps. El mapa usa OpenStreetMap y satelital de Esri.
- El archivo central del frontend es `src/pages/Mapa.jsx` (~785 líneas): ahí viven el mapa y el panel lateral. **El render de los pines ya no está ahí**, está en `components/CapaMedidores.jsx` por rendimiento (ver "Rendimiento del mapa"). Los pines se agrupan por punto (`utils/agrupar.js`, 5 m), así que la decisión de visibilidad es **por grupo**: vive en `utils/vistaDeGrupo` y tiene tests propios en `utils/vistaMarcador.test.js`.

## Decisiones de diseño (resumen)

- **Separar `app.js` de `index.js`**: para testear la API con Supertest sin abrir un puerto real ni depender de Atlas.
- **Unificar la verificación de JWT en un solo middleware**: evita bugs de seguridad por tener dos implementaciones desincronizadas.
- **Lista negra de tokens con TTL**: permite un logout real (no solo del lado del cliente) sin guardar tokens invalidados para siempre.
- **Caché en memoria simple en vez de Redis**: suficiente para el volumen actual y evita infraestructura adicional.
- **Cluster de Node en vez de un orquestador externo**: aprovecha los núcleos del servidor sin la complejidad de Kubernetes o un load balancer para un proyecto de este tamaño.
- **El estado de TOES solo en el dispositivo**: lo exige la regla de privacidad, y de paso deja la integración sin dependencias de backend — el parser y el mapa se pueden probar y usar sin desplegar nada.
- **Envolver la PWA con Capacitor en vez de reescribir en nativo**: una sola base de código mantiene la web viva para supervisores y habilita el acceso a `/TOES` en terreno, que es el único requisito que el navegador no puede cumplir.
- **`node --test` en vez de Vitest en el frontend**: el parser es JavaScript puro sin DOM, así que el runner nativo alcanza y no agrega dependencias.
