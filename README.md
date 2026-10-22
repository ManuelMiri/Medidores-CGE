# Medidores-CGE

Aplicación para que técnicos de terreno de CGE (Compañía General de Electricidad) ubiquen y registren medidores eléctricos perdidos o sin documentar en el Maule rural. Nace de un problema real: al revisar las rutas de lectura se detectaron 25 rutas "mal enrutadas" con cerca de 85 medidores sin registrar en el sistema, lo que obligaba a los técnicos a buscarlos a ciegas en terreno.

El backend además fue usado como base para el encargo de la Unidad 2 del ramo Programación Backend (Tec. en Ciberseguridad, IPG): login seguro, API RESTful, JWT, autorización por roles, pruebas automatizadas, caché y una estrategia de escalabilidad.

## Estado actual

| Pieza | Dónde vive | Estado |
|---|---|---|
| Backend Express | Railway (`https://medidores-cge-production.up.railway.app`) | En producción |
| Frontend web / PWA | Vercel (`https://medidores-cge.vercel.app`) | En producción |
| APK Android (Capacitor) | `frontend/android/`, sideload interno | Versión **2.5 (8)**. Lee la carpeta `/TOES` sola, cachea tiles y corre verificado en un Galaxy A36 |
| Integración con logs de TOES | Solo en el teléfono (IndexedDB) | Completa: parser, visibilidad del mapa y lectura automática de `/TOES` en el APK |

Base de datos: MongoDB Atlas, base `cge_db`. Las 4 cuentas existentes son de rol `admin`; **no existe ninguna cuenta `lector` todavía**, así que ese camino de permisos está sin probar end-to-end (en los tests del backend sí, y el último hueco conocido, `GET /medidores?ul=` con una UL ajena, ya está cerrado).

### Lo que trae la 2.3 (octubre 2026)

Salió de una jornada de terreno con rutas nuevas:

- **Mover un pin** (admin y supervisor): ✏️ Editar → "Cambiar ubicación en el mapa", tocando el mapa o con "Usar mi GPS". Antes la única forma de corregir un punto mal ubicado por la ruta importada era borrarlo y crearlo de nuevo, perdiendo historial y fotos. La posición anterior queda en el historial.
- **"Solo casas cerradas"** en el panel de TOES: deja en el mapa solo lo tomado con una variante de casa cerrada (claves 01, 08, 09 y 30) para el repaso al final de la ruta. Mientras está prendido, el mapa muestra un aviso con "Ver todo".
- **"🚗 Ir"** en el popup: abre Google Maps con la ruta hasta el medidor.
- **"◎" centrar en mí**: vuelve a la posición del lector y prende el punto azul si estaba apagado.
- **Hasta 1500 medidores por ruta** en el mapa (antes 500; las rutas más largas tienen ~1000).
- **Medidor lupa** en el popup (ver "Importación de rutas").

Y en el backend, que les sirve también a los APK viejos: rutas grandes al importar, instalaciones repetidas en el archivo, el medidor lupa y el control de ULs del lector.

### Lo que trae la 2.4 (14 de octubre de 2026)

- **Cambio de medidor desde TOES:** la serie y la marca nuevas pasan solas a la base, y el popup muestra el medidor anterior (ver "Cambio de medidor y servicios sin pin").
- **Pin automático:** un servicio tomado en TOES que no estaba en el mapa se crea con el GPS del lector al guardar.
- **📝 Notas por UL:** la clave de un portón, un perro bravo. Se ven sin señal (copia en el teléfono) y nunca se borran: se ocultan.
- **Fotos sin señal:** se achican a 1920 px y se guardan en el teléfono antes de subir. Si no hay señal esperan (⏳) y se suben solas después; antes se perdían.

### Lo que trae la 2.5 (14 de octubre de 2026, noche)

- **📊 Reporte de ruta** en el panel de TOES: servicios, leídos, casas cerradas por tipo, eriazos, cambios, nuevos y pendientes, en un popup chico con un botón **Copiar** que deja el texto listo para WhatsApp.
- **Los pines automáticos llevan la dirección y el poste del log**, así que se ven igual que uno de la ruta de MLA. Al que la app ya había creado sin ellos se le completan solos.
- **Sin aviso en el popup** de los pines creados desde TOES (la 2.4.1 ya lo había sacado): al usuario no le gustó.

### Lo que trae la 2.6 (todavía sin repartir)

- **Abrir y trabajar sin señal.** Antes, abrir la app sin señal reemplazaba la pantalla entera por un aviso rojo: sin mapa, sin TOES y sin forma de reintentar. Ahora se trabaja con la copia que quedó en el teléfono la última vez que hubo señal, con un aviso que dice de cuándo es (ver "Trabajar sin señal").
- **Las fotos que esperan señal ya no se pierden al bajar el WebView.** Pasan a ser archivos de la app en vez de vivir en el IndexedDB del WebView (ver "TOES y el Android System WebView"). Las que estaban en cola se mueven solas.
- **Aviso del WebView 155:** si el teléfono tiene un WebView con el que TOES no sincroniza, el mapa lo dice y explica qué hacer antes de abrir TOES. El pie del panel muestra la versión del WebView junto a la de la app.
- **Listas en el reporte de ruta:** cada fila del reporte (casas cerradas, cada tipo de casa cerrada, leídos, eriazos, cambios, otras claves, pendientes y nuevos) se toca y despliega la lista "instalación - serie" con un botón **Copiar lista**, lista para pegar. En los cambios de medidor va la serie nueva con la anterior.
- **Quién subió cada UL** (solo admin): un bloque "👤 Subida por" arriba del Resumen, con cada UL marcada y el nombre de quien la importó, tenga o no lecturas de TOES. Sale del historial de la importación, así que necesita el backend nuevo.
- **Modo revisión "🚫 Por confirmar"** (admin y supervisor): junta en el mapa las marcas permanentes que esperan que alguien las confirme (sitio eriazo, no encontrado, sin empalme), de **todas** las rutas, y las lista por UL con ✓ confirmar, ✗ "sí hay medidor" y 📍 para verla en el mapa. Antes había que marcar cada UL y buscar pin por pin. También necesita el backend nuevo.
- **Arreglo en el mapa nuevo:** la ficha de un pin se cerraba sola cada vez que se recargaban los medidores (al confirmar una marca, subir una foto o cuando TOES proponía una marca).

Todo es del frontend: llega a los teléfonos con el APK, no con la web.

## Stack

- **Backend:** Node.js, Express 5, Mongoose 9, MongoDB Atlas
- **Frontend:** React 19 + Vite 8, MapLibre GL 6 (motor del mapa por defecto) y Leaflet 1.9 + react-leaflet 5 (red de seguridad), Bootstrap 5, react-router-dom 7, `vite-plugin-pwa`
- **Nativo:** Capacitor 8.5 (`@capacitor/core`, `cli`, `android`, `app`, `preferences`, `filesystem`)
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
│   ├── Medidor.js          # instalacion (único), unidadDeLectura, ubicacion GeoJSON, fotos, historial,
│   │                       #   marcaPermanente, medidorLupa, cambioMedidor, desdeToes
│   ├── NotaUl.js           # notas de una ruta: se ocultan, nunca se borran
│   └── TokenInvalido.js    # lista negra de tokens, con índice TTL
├── rutas/
│   ├── auth.js             # login, perfil, logout + gestión de usuarios (admin)
│   ├── medidores.js        # CRUD + /buscar + /uls, marca permanente, mover el pin,
│   │                       #   cambio de medidor y pin desde TOES
│   ├── fotos.js            # subida de fotos a Cloudinary
│   ├── importacion.js      # preview + confirmar de KML/Excel (admin)
│   └── rutas.js            # exportar y borrar una UL completa + notas de la UL
├── utils/
│   ├── cache.js            # caché en memoria (TTL 60s)
│   ├── cloudinary.js
│   ├── excelSap.js         # parseo del Excel de SAP
│   ├── kml.js              # parseo de KML a medidores
│   └── mapeoMedidor.js
├── data/
│   ├── medidores.json
│   └── seed.js             # OJO: hace Medidor.deleteMany({}) — no correr contra Atlas de producción
└── tests/                  # 13 suites, 134 tests

frontend/
├── capacitor.config.json   # appId cl.mla.maule, webDir dist, androidScheme https
├── .env.native             # VITE_API_URL absoluta para el build del APK
├── vite.config.js          # PWA con injectRegister: false (el SW se registra a mano)
├── scripts/
│   ├── compilarApk.mjs     # busca un JDK 21 y corre gradlew (sirve en cualquier shell)
│   ├── medirMapa.mjs       # mide la fluidez del mapa en el teléfono, con un gesto por adb
│   └── webviewCdp.mjs      # habla con el WebView del APK por el protocolo de DevTools
├── public/sw-tiles.js      # service worker del APK: cachea tiles, no precachea nada
├── android/                # proyecto Android (Capacitor). Versionado; fuera de Vercel
│   └── app/src/main/java/cl/mla/maule/
│       ├── MainActivity.java      # registra el plugin de TOES
│       └── toes/ToesPlugin.java   # lee /TOES por SAF, solo lectura
└── src/
    ├── pages/Mapa.jsx      # ~1600 líneas, el archivo central: buscador, panel lateral, carga
    │                       #   de rutas; elige el motor del mapa
    ├── pages/Login.jsx
    ├── components/
    │   ├── MapaGL.jsx          # el mapa sobre GPU (MapLibre), el motor por defecto
    │   ├── CapaMedidores.jsx   # los pines de Leaflet: memoizados y con culling por viewport
    │   ├── DetalleMedidor.jsx  # el contenido del popup, compartido por los dos motores
    │   ├── PanelToes.jsx       # bloque "Lecturas de TOES" del panel lateral
    │   ├── ReporteRuta.jsx     # el reporte de ruta y su botón Copiar
    │   ├── NotasUl.jsx         # notas de la ruta
    │   ├── CargaKml.jsx, PreviewImportacion.jsx, CapturaFoto.jsx,
    │   └── MiUbicacion.jsx, GestionUsuarios.jsx
    ├── hooks/
    │   ├── useToes.js          # une parser + almacén + mapa
    │   ├── useMarcasToes.js    # manda al backend las marcas permanentes
    │   ├── useEnviosToes.js    # manda el cambio de medidor y crea los pines que faltan
    │   ├── useColaFotos.js     # sube las fotos que esperaban señal
    │   ├── useNotasUl.js       # notas de la ruta, con copia en el teléfono
    │   ├── useSubidasUl.js     # quién subió cada UL marcada (solo admin)
    │   ├── useMarcasPendientes.js  # las marcas por confirmar de todas las ULs (modo revisión)
    │   ├── useReintentoSinSenal.js  # vuelve a pedir rutas y medidores cuando vuelve la señal
    │   └── useMiUbicacionGL.js # el punto azul en MapLibre
    ├── utils/                  # las reglas puras llevan su .test.js al lado
    │   ├── toesParser.js       # parseo de los logs de TOES
    │   ├── cursorToes.js       # cursor de lectura incremental en bytes
    │   ├── toesNativo.js       # puente con el plugin nativo y bucle de lectura
    │   ├── toesStore.js        # persistencia en IndexedDB
    │   ├── marcasToes.js       # qué claves proponen marca permanente y cuál la quita
    │   ├── cambiosToes.js      # qué cambios de medidor faltan en la base
    │   ├── altasToes.js        # qué servicios tomados no tienen pin, con sus resguardos
    │   ├── reporteRuta.js      # las cuentas del reporte de ruta y su texto
    │   ├── vistaMarcador.js    # decide ocultar/atenuar/colorear cada grupo de pines
    │   ├── agrupar.js          # junta los medidores del mismo punto (5 m)
    │   ├── ulsActivas.js       # qué ULs quedan marcadas al abrir y al recargar la lista
    │   ├── copiaRutas.js       # copia de ULs y medidores en el teléfono (IndexedDB)
    │   ├── cargaSinSenal.js    # cuándo sirve esa copia y qué avisar
    │   ├── colaFotos.js, comprimirFoto.js  # fotos: se achican y esperan señal
    │   ├── archivosFotos.js    # la cola de fotos del APK en archivos de la app
    │   ├── avisoWebView.js     # cuándo avisar que el WebView no deja sincronizar a TOES
    │   ├── marcasPendientes.js # el modo revisión: por confirmar, agrupado por UL, y qué encuadrar
    │   ├── tilesDeRuta.js, precargaTiles.js  # bajar el mapa de una ruta
    │   ├── pinDeColor.js       # los pines de color y de contador para MapLibre
    │   ├── iconosMapa.js       # los pines, bundleados (no traídos de la red)
    │   ├── navegacion.js       # URL de Google Maps del botón "Ir"
    │   └── __fixtures__/logSintetico.js  # generador de logs falsos para los tests
    ├── config/clavesToes.json  # la tabla oficial de claves de TOES
    ├── context/AuthContext.jsx
    └── services/api.js         # axios con el token en Authorization: Bearer
```

## Integración con los logs de TOES

**TOES es la app oficial de CGE** con la que los lectores toman las lecturas. No tenemos su código y **no se modifica ni se descompila**. Lo único que expone es un archivo de texto en la carpeta `/TOES` del almacenamiento compartido del teléfono, al que le agrega un bloque cada vez que se guarda un servicio.

El objetivo: a medida que el lector guarda servicios en TOES, esos puntos **desaparecen del mapa de pendientes** de su unidad de lectura (UL), respetando el ciclo mensual de cada ruta. En rutas rurales, donde encontrar un servicio ya cuesta, eso es tiempo que no se pierde buscando medidores que ya no hace falta visitar.

### Regla de privacidad (no negociable)

El log trae **datos de clientes**: direcciones, lecturas y coordenadas.

- **Todo el procesamiento ocurre dentro del teléfono.** El log nunca se sube.
- El estado derivado se guarda en **IndexedDB** del dispositivo. Solo se guarda: UL, ciclo, instalación, medidor (serie y marca), dirección, poste, clave (si hubo), si hubo lectura, fecha y el GPS del lector al guardar. La lectura no se guarda nunca.
- **Tres excepciones deliberadas**, aprobadas una por una, mandan al servidor un mínimo y nunca la lectura ni el nombre del cliente:
  - **Marca permanente:** instalación, tipo, clave y ciclo (ver "Memoria de terreno").
  - **Cambio de medidor:** instalación, serie y marca nuevas, serie anterior, ciclo y fecha.
  - **Pin de un servicio que no estaba en el mapa:** instalación, UL, ciclo, serie, marca, dirección, poste y GPS del lector al guardar. Solo para instalaciones que no existen en la base (o para completar un pin que creó la app) y lecturas de los últimos 3 días. La dirección y el poste se aprobaron porque son los mismos que entrega MLA en los mapas de ruta.
- **Solo lectura:** nunca escribir, mover ni borrar archivos en `/TOES`.
- **Los logs reales no entran al repositorio.** `.gitignore` bloquea `Log_TOES*.txt` y `*.log.txt`. Los tests usan el fixture sintético de `__fixtures__/`, con datos inventados.

Esto tiene una consecuencia de arquitectura importante: **ocultar del mapa lo ya tomado no toca nada del backend.** Lo que sí llega al servidor son esas tres excepciones, cada una con su ruta propia.

### Cambio de medidor y servicios sin pin (2026-10-14)

Cuando el lector cambia un medidor, TOES deja dos cosas en el log: el "Backup" de la orden con **clave 10**, sin lectura y todavía con el medidor **viejo** en `GERAET`/`HERST`, y justo después un bloque aparte `/CambioMedidor` (`method: create`) con la serie (`SERNR`) y la marca (`HERST_CAMMED`) del **nuevo**. El parser junta las dos y la app actualiza la base sola (`POST /api/medidores/:instalacion/cambio-medidor`); si la serie vieja era la del lupa, cambia el lupa.

Cada lectura trae el GPS del lector al guardar (`LEC_COOR_X` = latitud, `LEC_COOR_Y` = longitud). Contra 1.061 pines reales quedó a 8 m en la mediana y a menos de 29 m en el 90 % (1,4 % a más de 500 m). Con eso la app crea el pin de un servicio tomado que no estaba en el mapa (`POST /api/medidores/desde-toes`), como `pendiente`, con la dirección y el poste del log: la dirección de la base es `STREET HOUSE_NUM1 HAUS_NUM2 BUILDING DIST_SUPL CO_ADDRESS_CITY1` (los vacíos se saltan), igual en 1.061 de 1.061 servicios, y el poste es `INVENTORY`, también 1.061 de 1.061. El popup no avisa que el pin salió de TOES, a pedido del usuario; queda en `desdeToes` y en el historial. A un pin que la app creó sin dirección ni poste se le completan, solo si están vacíos. `utils/altasToes.js` tiene los resguardos: no mira una UL cuyos medidores no cargaron, no crea nada si la serie ya está en otro pin, frena la UL si faltan demasiados (más de 10 o del 20 %) y solo usa lecturas de los últimos 3 días, para que un pin eliminado a propósito no vuelva solo. El servidor nunca toca una instalación que ya existe, en ninguna UL.

Cuando el parser empieza a sacar un dato nuevo del log, se sube `FORMATO_PARSER` (`cursorToes.js`) y cada log se relee una vez: lo ya leído había quedado sin ese dato.

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
- `ZZABLHINW2: "04"` es el lector confirmando una lectura que TOES encontró rara (esas vienen con `MOT_LEC_INVEROSIMIL`). No tiene que ver con una devolución de la analista. El `"32"` sigue sin significado conocido. El parser no usa ninguno de los dos.

### Lo que se mide sobre datos reales

- **Cruce con la base:** 152 servicios tomados en dos días → 148 calzan con medidores de la misma UL, 0 en otra UL, 4 no existen en la base. La UL `E3505704` tiene 281 medidores, así que el mapa muestra **148 marcadores menos (52,7 %)**.
- Esos 4 sin punto en el mapa son el caso real de "tomados sin punto": el panel los lista con un botón para copiarlos, porque son candidatos a mapear. Desde la 2.4 la app les crea el pin sola con el GPS del lector (ver "Cambio de medidor y servicios sin pin"); la lista queda para los que frenan los resguardos.
- **Rendimiento:** el log completo de 744 KB se parsea en 3 ms; la peor lectura incremental individual fue de 0,1 ms. Con un sondeo de 5 s el margen es de unas 1600×, así que el costo real estará en el puente nativo, no en el parseo.
- **Simulación incremental:** los dos logs alimentados en 254 trozos de tamaño variable, **todos cortando dentro de un bloque JSON** → 159 eventos, cero duplicados, estado final idéntico al de una pasada única.

### Qué está hecho y qué falta

Hecho (lo que no dice "APK" se puede verificar en el navegador):

- Parser, almacén en IndexedDB, hook, panel lateral y lógica de visibilidad del mapa.
- Carga manual de logs con `<input type="file" multiple>` (los archivos se ordenan por nombre, que es orden cronológico).
- Contador tomados/total por UL con barra de progreso, ciclo vigente, insignia CERRADA / cierre parcial, botón "Nuevo ciclo" (con confirmación), interruptor "Ver tomados" (atenuados) y la lista de tomados sin punto en el mapa.
- Interruptor **"Solo casas cerradas (N)"** para el repaso: muestra solo lo tomado con una clave de `clavesRepaso` en `clavesToes.json` (01, 08, 09, 30), en firme y sin marcas permanentes. No se recuerda entre sesiones a propósito. Como el interruptor vive en un bloque del panel que se esconde si ninguna UL marcada tiene lecturas, el mapa muestra además un aviso con "Ver todo": ya pasó que quedó prendido, se marcó una ruta recién importada y el mapa salió vacío sin explicación.
- **Nunca se borra** un punto, una foto, una descripción ni una etiqueta: solo cambia la visibilidad.
- **Lectura automática de `/TOES` en el APK** por el Storage Access Framework. El lector elige la carpeta una sola vez y desde ahí la app la relee sola cada 5 s, sin volver a pedir nada. Ver "Lectura automática de /TOES" más abajo.
- **Probada con TOES real en terreno**, que eran los 2 criterios de aceptación que los tests no podían cubrir: el permiso de `/TOES` sobrevive a cerrar la app y a reinstalar el APK con `adb install -r`, y lo que TOES guarda llega al mapa (el 14 de octubre creó solo el pin 103694009 y actualizó la serie de E713709426). El punto tomado no desaparece mientras TOES está adelante sino **al volver al mapa**, porque Android congela los timers del WebView en segundo plano.
- **Los pines van agrupados por punto** (`agruparCercanos`, 5 m), así que la decisión es por grupo y no por medidor: el pin se oculta solo cuando no queda ningún servicio por visitar, el contador cuenta los que quedan (no los que hay), y se atenúa solo si todo lo que queda en ese pin ya fue tomado. Un medidor elegido a propósito — tocado o buscado — se muestra aunque TOES lo haya tomado; sin esa excepción, buscar una instalación ya tomada no mostraría nada y el buscador parecería roto.

Pendiente:

- **Decirle al lector qué clave elegir en TOES** en un punto marcado. Las "etiquetas anticipadas" que se planearon (sitio eriazo / no encontrado / sin empalme) quedaron hechas como la marca permanente (ver "Memoria de terreno"), que ya se comparte entre usuarios por el backend. Lo que falta es mostrar en el popup el `textoToes` de cada tipo, que ya está en `etiquetas` de `clavesToes.json` ("26 - Sitio eriazo", "02 - Medidor no ubicado") y hoy no se usa.
- **"Sin empalme" sigue sin clave que sugerir.** "Sitio eriazo" y "No encontrado" apuntan a las claves 26 y 02. La clave 16 existe pero está inactiva, y el lector lo marca en el submenú de la 05 (ver el punto siguiente).
- **El submenú de la clave 05 ("Problema en medidor – Sin lectura").** "Sin empalme" y "Mica quemada" se eligen ahí, y `METERREADINGNOTE` solo trae `05`. Revisados los 55 logs de un teléfono, el único campo que cambia es **`COD_ESTADO_MED`**: viene `null` en todos los bloques salvo en los de clave 05, donde trae `"4"` o `"6"`. Falta saber qué opción es cada código; para eso hay que anotar la instalación o la hora la próxima vez que se marque una en terreno. Con esa tabla, "sin empalme" puede pasar a proponerse desde TOES.
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
de almacenamiento en el manifest**: el del APK declara `INTERNET` y la ubicación (para el punto azul
y las fotos), sin `MANAGE_EXTERNAL_STORAGE`. La cola de fotos sí usa `@capacitor/filesystem`, pero en
el directorio propio de la app, que tampoco pide permisos.

**Está en Java y no en Kotlin.** El proyecto Android que genera Capacitor es Java puro; meter Kotlin
obligaba a sumar su plugin de Gradle y la stdlib al APK, y el SAF es exactamente la misma API desde los
dos lenguajes.

**Solo lectura, y a propósito.** El log es la fuente de verdad de la lectura del mes de CGE: si se le
escribe encima se puede arruinar una ruta ya tomada. El plugin solo lista y abre en modo `"r"`; no hay
una sola llamada que modifique (ni `delete`, ni `renameTo`, ni `"w"`). El contenido tampoco sale del
teléfono: se lee, se extrae lo que el mapa necesita y el texto se descarta.

**El cursor va en bytes, no en caracteres.** Es la parte que se equivoca en silencio, así que vive
aparte en `utils/cursorToes.js`, con sus propios tests. El parser cuenta caracteres, el archivo se mide en bytes y
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


**El log de TOES ya no sale por logcat, y eso fue a propósito.** Capacitor registra en el log de
Android el resultado de cada llamada a un plugin, y eso incluía el **texto completo del log de TOES**
que devuelve `leerLog`: direcciones, lecturas y coordenadas de clientes, legibles para cualquiera con
un cable. Por eso `capacitor.config.json` lleva `"loggingBehavior": "none"`.

Antes se dejaba prendido porque era la única forma de diagnosticar errores de JS en el teléfono. Ya no
lo es: `scripts/webviewCdp.mjs` habla con el WebView por el protocolo de DevTools y da algo mejor —
las excepciones de verdad, con su stack, y la posibilidad de evaluar JavaScript en la página. El bug
que dejó la app en blanco por un `useState` sin importar **solo apareció por ahí**; en logcat no había
ni una línea.

Verificado: con la app leyendo `/TOES`, `adb logcat | grep Capacitor` devuelve cero líneas.

### TOES y el Android System WebView (2026-10-16)

Con la versión **155** del Android System WebView, TOES deja de sincronizar ("No se pudo establecer
la conexión"): sus consultas salen sin cookies y el servidor les contesta 403. Con la 154 funciona.
No es nuestra app, pero la afecta igual:

- **Bajar de versión el WebView borra el IndexedDB y el localStorage de todas las apps**: una versión
  vieja no abre lo que escribió una más nueva y lo recrea vacío. A TOES se le va su cola de lecturas
  pendientes. A esta app, la sesión, las ULs marcadas, el estado de TOES (se reconstruye releyendo
  los logs, pero hay que volver a elegir la carpeta) y la copia sin señal. Antes de bajarlo, que
  TOES no tenga nada pendiente.
- **Las fotos en cola se salvan desde la 2.6.** Hasta la 2.5 vivían en el IndexedDB y se perdían
  igual. Ahora son archivos de la app (`files/colaFotos/`, aparte de `app_webview/`, que es lo que
  se borra), escritos con `@capacitor/filesystem` (`utils/archivosFotos.js`). Cada foto es un `.jpg`
  y un `.json`, y el `.json` se escribe al final, así que una foto a medio escribir no entra a la
  cola. Las que había en IndexedDB pasan solas a archivos: cada una se saca de ahí recién después de
  escribirla, y la base vieja se borra cuando queda vacía. En el navegador la cola sigue en IndexedDB.
- **El aviso:** como esta app corre sobre el mismo WebView del sistema que TOES, sabe qué versión va
  a usar TOES. Con la 155 o una posterior muestra arriba del mapa qué hacer antes de abrir TOES
  (`utils/avisoWebView.js`), y el pie del panel muestra siempre la versión del WebView.
- El WebView se actualiza desde Play Store, y Google ya no deja apagar la actualización solo para él.
  Poner Play Store en "No actualizar apps automáticamente" **no alcanza**: usar Chrome o Maps vuelve a
  instalar la 155. Lo que funciona es desinstalar las actualizaciones del WebView (Ajustes → Apps →
  Android System WebView), que lo deja en la versión de fábrica, y hacerlo **antes de abrir TOES o
  esta app**: si alguna alcanzó a abrirse con la 155, al volver atrás pierde lo que tenía guardado.


## Rendimiento del mapa

El dato que ordenó todo esto: cuando se midió, en Atlas había **1.765 medidores** repartidos en 8 ULs,
de 83 a 302 cada una. (Los "~85" del principio de este README son los medidores *sin registrar* que
motivaron la app, no el dataset.) Con una ruta cargada había entre 170 y 300 pines, y hasta 1.765 si
se activaban todas. Hoy el frontend pide hasta 1.500 por UL activa (`limite=1500` en `Mapa.jsx`; el
backend no tiene tope propio): las rutas más largas tienen ~1.000, y con el límite anterior de 500
una ruta de 515 dejaba 15 fuera del mapa sin avisar.

### Lo que se midió, y con qué

Medido en el teléfono real (Galaxy A36, Android 16, pantalla de 60 Hz), con `dumpsys gfxinfo`, en la
UL `E3505704`, a z16, en satelital y **con la vista anclada** para que las corridas sean comparables:

| motor | pines en pantalla | p50 | p95 | frames janky |
|---|---|---|---|---|
| Leaflet | 0 | 22 ms | 36–53 ms | 50–62 % |
| Leaflet | ~130 | **41 ms** | **57 ms** | 94–100 % |
| MapLibre GL | 0 | 13 ms | 17 ms | 2,5 % |
| MapLibre GL | ~130 | **13 ms** | **16 ms** | 1,4–2,4 % |

Lo que dice esa tabla: en Leaflet **los marcadores cuestan +19 ms por frame**. Solos se comen más que
el presupuesto entero de un frame a 60 Hz (16,7 ms), y no hay forma de arreglarlo dentro de Leaflet
porque son `<img>` del DOM que el navegador reposiciona uno por uno. En MapLibre son sprites de una
capa `symbol` y **no cuestan nada medible**: el p95 queda por debajo del presupuesto, o sea que el
mapa llega a 60 fps donde antes andaba en unos 17.

La herramienta para medirlo vive en el repo, porque sin ella estos números no se pueden repetir:

```bash
cd frontend
npm run medir:mapa -- --etiqueta "lo que estés probando"
```

Tres cosas de ese script costaron y conviene no volver a pisarlas:

- **El gesto lo hace `adb`, no el dedo.** Arrastrar a mano nunca es dos veces el mismo gesto, así que
  lo que se mide termina siendo la diferencia del dedo y no la del código.
- **El arrastre va con `input motionevent` y no con `input swipe`.** Con `swipe` los resultados
  alternaban entre 90 % y 35 % de frames janky sin que cambiara nada: `swipe` suelta el dedo con
  velocidad, Leaflet hace *fling* y el mapa termina en una zona distinta cada vez, a veces con los
  tiles cacheados y a veces no. Con `motionevent` el dedo se levanta quieto y no hay inercia.
- **El centro y el zoom se anclan antes de medir**, por el protocolo de DevTools del WebView
  (`scripts/webviewCdp.mjs`). Sin eso cambia la cantidad de marcadores en pantalla —la variable que
  más pesa de todas— y dos builds dan 0,3 % y 100 % de janky sin que el código tenga nada que ver.
  Eso pasó, y las conclusiones de esa tanda hubo que tirarlas. Por eso **la cuenta de pines sale en la
  tabla junto a los tiempos**: una corrida con otra densidad no puede volver a pasar inadvertida.

### El motor sobre GPU (MapLibre GL)

`components/MapaGL.jsx`. **Es el motor de producción.** Leaflet sigue entero como red de seguridad,
a un flag de distancia:

Se cambia desde el **pie del panel lateral** ("usar el mapa clásico"), que recarga la app. Que esté
en la interfaz y no solo en `localStorage` es justamente el punto: una salida de emergencia que
necesita un PC con `adb` y DevTools no le sirve a un lector en terreno.

Leaflet se queda por una razón concreta y no por indecisión: la distribución es por **sideload**, así
que si algo aparece en terreno no hay forma de publicar un arreglo — habría que reinstalar en cada
teléfono. Con el motor viejo a un flag de distancia, el lector sigue trabajando el mismo día.

**No cambia el aspecto, y es un requisito, no un gusto**: la gota con el contador rojo es la identidad
del mapa. Se usan los MISMOS PNG de `utils/iconosMapa.js`, con el mismo anclaje abajo, y el contador
se dibuja con el mismo círculo y el mismo borde que le da `index.css` a los de Leaflet.

Lo que hubo que resolver distinto:

- **Los pines de color por clave de TOES.** En Leaflet son un `divIcon` con un SVG y el color sale del
  atributo `fill`; en MapLibre un color nuevo es una IMAGEN nueva. Teñir tampoco alcanzaba: MapLibre
  sabe teñir imágenes SDF pero un SDF es de un solo color, y este pin tiene la gota, su borde blanco y
  el círculo blanco del medio. `utils/pinDeColor.js` los dibuja en un canvas con exactamente la misma
  geometría, y `vistaDeGrupo` ahora devuelve también el hex suelto para que la regla de qué color le
  toca a cada punto siga escrita en un solo lado.
- **El contador va dentro de la imagen del pin**, no como texto de una capa. Dibujarlo como texto
  obliga a declarar `glyphs`, o sea archivos de fuente que MapLibre pide **por red** para que el mapa
  se vea completo. Depender de un host ajeno para eso es justo lo que ya pasó con CARTO.
- **El worker.** maplibre-gl 6 lo carga de un archivo aparte que resuelve relativo a la URL de su
  propio módulo, y al bundlear esa URL deja de existir. El síntoma es brutal: el mapa se ve, la foto
  satelital y los caminos cargan (son raster y no pasan por el worker) pero la fuente GeoJSON se queda
  en cero features y no dibuja un solo pin, **sin un error en la consola ni en el evento `error` del
  mapa**. Se arregla con `?url` + `setWorkerUrl`.
- **El popup.** Leaflet movía el mapa solo para que entrara (`autoPanPadding`); MapLibre no tiene
  equivalente. Ahora se corre el mapa lo mínimo, y el margen de arriba son 58 px y no el borde del
  canvas, porque el buscador **flota** sobre el mapa. Además espera a que el mapa deje de moverse: un
  `panBy` en medio del `easeTo` del buscador lo cancela y dejaba el zoom a mitad de camino.
- **El contenido del popup es el mismo componente para los dos motores** (`DetalleMedidor.jsx`). Si
  cada uno tuviera su copia, un arreglo en el bloque de marca permanente o en el botón de foto quedaría
  aplicado en uno solo, y la diferencia no se vería hasta que alguien en terreno usara el otro.

**El mapa ahora se puede rotar**, con dos dedos. En Leaflet no se podía porque rotar era un truco de
CSS sobre el contenedor, y ahí sí rompía el clic para colocar un punto; en MapLibre la rotación es una
propiedad de la cámara, así que `e.lngLat` sale bien a cualquier ángulo y los pines, los contadores y
el punto azul se quedan derechos solos. Sirve de verdad en terreno: girar el mapa hacia donde uno
camina es la diferencia entre leer el mapa y traducirlo mentalmente. Van con ella la brújula del
control de zoom —la única forma de volver al norte sin pelearse con los dedos— y la corrección del
rumbo de "mi ubicación", que le resta el ángulo del mapa: sin eso, con el mapa girado 90° la flecha
apuntaría 90° equivocados **y seguiría pareciendo correcta**. La inclinación queda apagada: sobre foto
satelital desubica más de lo que ayuda.

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

Fue la primera de las tres excepciones de la regla de privacidad que escriben en el backend (las
otras dos son el cambio de medidor y el pin de un servicio sin pin), y es deliberada: la marca tiene
que verla el lector del mes siguiente, que puede ser otra persona y otro teléfono, así que no puede
vivir solo en IndexedDB. Viaja el mínimo — instalación, tipo, clave y ciclo — y nunca la dirección,
la lectura ni las coordenadas del log.

**"Sin empalme" todavía no llega desde TOES.** Su clave 16 está inactiva: el lector lo reporta como
submenú de la clave 05, así que `METERREADINGNOTE` trae `05`. Revisados los 55 logs de un teléfono, el
detalle está en **`COD_ESTADO_MED`**, el único campo que cambia: viene `null` en todos los bloques
salvo en los de clave 05, donde trae `"4"` o `"6"`. Falta saber qué opción es cada código; hasta tener
esa tabla, esa marca solo se pone a mano desde el popup.


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

**Descargar una ruta con wifi.** Cada UL marcada tiene, en el APK, un botón para bajar los cuadros
del mapa de esa ruta antes de salir. Van a un **segundo caché** (`tiles-rutas-v1`) que **no se poda**:
si se podara, una jornada larga mirando el mapa terminaría botando justo la ruta que se bajó para
trabajar sin señal. Al responder, el service worker mira primero ese caché, y un cuadro que ya estaba
en el caché podable se pasa al de rutas en vez de volver a bajarse.

- **Qué cuadros** lo decide `utils/tilesDeRuta.js` (puro, testeado): el rectángulo completo en los
  zooms bajos, que son pocos tiles, y solo la vecindad de cada medidor en los altos. Van ordenados por
  zoom, así que si se corta por el tope queda lo general.
- **Antes de empezar se pregunta**, con la cantidad de cuadros y los MB estimados: son decenas de MB,
  y empezar sin avisar con datos móviles sería gastarle el plan al lector.
- **Las coordenadas salen de la base** (`medidores[].ubicacion`) y **nunca del log de TOES**: pedir un
  tile le manda esa coordenada a Esri, y las del log son datos de clientes.
- Si se acaba el espacio, la descarga se corta y avisa, con lo bajado hasta ahí intacto.

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

- **Sacar Leaflet, cuando MapLibre lleve un ciclo de ruta completo sin sorpresas.** Hoy conviven los
  dos a propósito (ver arriba), pero mantener dos motores tiene un costo: todo lo que toque el mapa
  hay que probarlo dos veces, y ya pasó que un cambio rompiera el de Leaflet sin que lo vieran ni el
  build ni el linter ni los tests.
- **Los tiles siguen siendo raster y de Esri.** El cambio de motor no hace que Esri responda más
  rápido: eso lo ataca la precarga de la ruta. El paso siguiente sería un mapa base vectorial propio
  (PMTiles de la Región del Maule), que además sacaría la dependencia de OSM y de Esri — los dos
  pueden cortar el acceso, como ya pasó con CARTO.


## Trabajar sin señal

Caso real del 2026-10-16: el lector abrió la app en una zona sin señal y la pantalla entera quedó en
"Error al cargar las unidades de lectura" — sin mapa, sin panel de TOES, sin los cuadros del mapa ya
bajados y sin forma de reintentar. Un error de carga **reemplazaba la app entera** por ese aviso.

Ahora cada carga de la lista de ULs y de los medidores de una UL deja una copia en el teléfono
(`utils/copiaRutas.js`). Al abrir se muestra primero la copia y después lo que llega de la red; sin
red queda la copia, con el aviso "📵 Sin señal: … copia guardada del dd-mm hh:mm" y un botón
**Reintentar**.

- **IndexedDB y no localStorage:** una UL de 1.000 servicios con su historial pesa del orden de un MB,
  y localStorage se acaba en ~5 MB.
- **La copia es por usuario:** en un teléfono compartido, el que entra después no ve las rutas del
  anterior. "Salir" las borra todas.
- **Son datos de la base**, lo mismo que ya muestra el mapa. El log de TOES sigue sin salir de su
  almacén propio.
- **Cada UL cae a su copia por separado.** Antes la carga era un `Promise.all`: una sola UL sin
  respuesta dejaba el mapa vacío para todas.
- **Cuándo sirve la copia** vive en `utils/cargaSinSenal.js`, con tests, porque equivocarse no da
  ningún error. Sin respuesta del servidor (la señal, o el tope de espera), un 5xx, un 408 o un 429:
  sí. Un 403 o un 404 no, porque es una respuesta de verdad: la UL ya no es tuya o ya no existe. Un
  401 vuelve al login.
- **El aviso muestra la fecha de la copia más vieja**, que es la que dice cuánto puede estar atrasado
  lo que se ve.
- **Se vuelve a pedir solo** (`hooks/useReintentoSinSenal.js`): cuando Android avisa que volvió la
  red, al volver a la app y cada minuto. El evento `online` solo no alcanza: en terreno el teléfono
  puede quedar "conectado" a una antena que no deja pasar nada, y ese evento no se repite.
- **Topes de espera: 20 s la lista de ULs y 60 s los medidores.** Con poca señal una petición no
  falla, queda colgada minutos, y la app se quedaba en "Cargando sistema..." sin fin.
- **El buscador** revisa primero lo cargado, que puede ser la copia. Si no está ahí y no se puede
  preguntar al servidor, lo dice con esas palabras en vez de "Error al buscar".

Lo demás ya funcionaba sin señal: la lectura de TOES (nunca dependió de la red), las notas de la UL
(copia en el teléfono), las fotos (cola en el teléfono, con ⏳ en el popup) y los cuadros del mapa ya
visitados o bajados con el botón de descargar la ruta (`sw-tiles.js`).

**`indexedDB.open('copiaRutas')` sin versión, desde DevTools, deja la base sin almacén.** Si no
existía, la crea vacía en la versión 1 y la app ya no corre su `onupgradeneeded`: la copia no se
guardaría nunca, sin ningún error. Pasó el mismo 16 de octubre. `copiaRutas.js` se repara solo
(abre en la versión siguiente y crea el almacén); `toesStore.js` no, ni `colaFotos.js` en el
navegador (en el APK ya no usa IndexedDB). Para mirar una
base desde DevTools, preguntar antes con `indexedDB.databases()`.


## Autenticación y autorización

- El login genera un JWT que el cliente envía en el header `Authorization: Bearer <token>`.
- `proteger` (en `middleware/auth.js`) verifica el token en cada ruta protegida y revisa que no esté en la lista negra (colección `TokenInvalido`, con índice TTL para que los expirados se limpien solos).
- `soloRol('rol1', 'rol2', ...)` restringe según el rol: `lector`, `supervisor` o `admin`.
- El logout invalida el token agregándolo a la lista negra, así un token robado deja de servir aunque no haya expirado.
- Un `lector` solo ve y modifica medidores de las ULs que tiene en `unidadesLectura`; el resto ve todas. Eso incluye `GET /api/medidores?ul=`: hasta octubre de 2026 el parámetro `ul` pasaba directo al filtro y un lector podía leer cualquier ruta con solo nombrarla. Ahora una UL ajena devuelve una lista vacía y no un 403, porque la app pide todas las ULs marcadas a la vez y un error en una tumbaría la carga de las demás.
- **Mover un pin** es solo de `admin` y `supervisor`, por su propia ruta. El `PATCH` general ya no acepta `ubicacion`.

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
| GET | `/api/medidores/marcas-pendientes` | **admin**, supervisor | Las marcas permanentes en `propuesta` de todas las ULs (modo revisión) |
| GET | `/api/medidores/:instalacion` | autenticado | Detalle de un medidor |
| POST | `/api/medidores` | autenticado | Crea un medidor (`lector` solo en sus ULs) |
| PATCH | `/api/medidores/:instalacion` | autenticado | Actualiza un medidor (`lector` solo en sus ULs). No acepta `ubicacion` |
| PATCH | `/api/medidores/:instalacion/ubicacion` | **admin**, supervisor | Mueve el pin (`lat`, `lng`); la posición anterior queda en el historial |
| POST | `/api/medidores/:instalacion/marca` | autenticado | Propone una marca permanente (`lector` solo en sus ULs) |
| PATCH | `/api/medidores/:instalacion/marca` | **admin**, supervisor | Confirma o rechaza la marca |
| DELETE | `/api/medidores/:instalacion/marca` | autenticado | Quita la marca |
| DELETE | `/api/medidores/:instalacion` | **admin** | Elimina un medidor |
| POST | `/api/medidores/:instalacion/fotos` | autenticado | Sube una foto a Cloudinary (con coordenadas). `idLocal` evita duplicarla al reintentar; `fecha` es cuándo se sacó |
| POST | `/api/medidores/:instalacion/cambio-medidor` | autenticado | Serie y marca nuevas desde TOES (idempotente; `lector` solo en sus ULs) |
| POST | `/api/medidores/desde-toes` | autenticado | Crea el pin de un servicio tomado sin pin (GPS del lector, dirección y poste). Solo completa los campos vacíos de un pin que creó la app; nunca toca otro |
| POST | `/api/importacion/preview` | **admin** | Parsea un `.kml`/`.xlsx` y devuelve lo que falta, sin escribir. Informa repetidos y lupas |
| POST | `/api/importacion/confirmar` | **admin** | Inserta los medidores del preview y agrega los lupas que falten (`lupas`, opcional) |
| GET | `/api/rutas/subidas` | **admin** | Quién subió cada UL (`ul=A,B` opcional), sacado del historial de la importación. Si la subieron en partes, la primera persona y cuántas más |
| GET | `/api/rutas/:ul/exportar` | **admin**, supervisor | Exporta una UL completa |
| DELETE | `/api/rutas/:ul` | **admin** | Borra todos los medidores de una UL |
| GET | `/api/rutas/:ul/notas` | con la UL | Notas visibles de la ruta |
| POST | `/api/rutas/:ul/notas` | con la UL | Agrega una nota (`texto`, máx. 1000) |
| PATCH | `/api/rutas/:ul/notas/:id` | autor, admin, supervisor | Edita (guarda el texto anterior) u oculta (`visible: false`). No hay DELETE |

## Importación de rutas

El admin sube el archivo de la ruta (el KML de Google My Maps o el Excel de SAP), el backend lo parsea y devuelve una **vista previa** sin escribir nada; recién al confirmar se crean los medidores. Los que ya existen **nunca se sobreescriben**: pueden tener estado, fotos o historial de terreno.

- **El formato se decide por el contenido, no por el nombre.** Android guarda un KML descargado como `ruta.kml.xml`, y eso antes se rechazaba.
- **Las instalaciones son texto**: numéricas o con letra según la zona (`103613434`, `E714171252`, `G3534036`). Nada asume que sean números; el buscador compara el final como texto.
- **Rutas grandes.** `/confirmar` recibe la ruta entera, unos 340 bytes por medidor. El límite por defecto de `express.json()` es 100 KB, y una ruta de 515 medidores (176 KB) daba **413 en HTML**, que la app solo podía mostrar como "Error al importar". El límite ahora es 10 MB. Si el servidor no explica un error, la app muestra el código HTTP.
- **Instalaciones repetidas dentro del archivo.** La instalación es única en la base, pero el archivo de origen puede traerla varias veces (la G3509004 trae 231 filas y 226 instalaciones). Antes `insertMany` cortaba con `E11000` y dejaba la ruta a medias. Ahora preview y confirmar dejan una fila por instalación, la primera, y el preview avisa cuántas venían repetidas.
- **Medidor lupa.** Algunos servicios tienen un segundo medidor en el poste para comparar con el de la casa y detectar hurto o falla. En el archivo viene como otra fila con la **misma instalación y otra serie**. Se guarda en `medidorLupa` (`numeroDeSerie`, `marca`), un campo opcional, y el popup lo muestra. La coordenada es la de la casa. A un medidor que ya existía sin lupa, la importación se lo puede **agregar** (`lupasNuevas` en el preview, `lupas` en confirmar), pero nunca pisa uno ya guardado.

Los campos nuevos de la respuesta (`totalFilas`, `repetidos`, `lupasNuevas`) son opcionales: un APK viejo los ignora y sigue funcionando.

## Arquitectura del backend

Dos archivos de entrada, para poder testear sin conexión real a MongoDB ni puerto abierto:

- **`app.js`**: arma la aplicación de Express (middlewares, CORS, rutas). No conecta a Mongo ni levanta el servidor. Es lo que importan los tests con Supertest.
- **`index.js`**: conecta a MongoDB Atlas y ejecuta `app.listen()`. Con `NODE_ENV=production` activa además el módulo nativo `cluster` de Node para levantar un worker por núcleo de CPU. El proceso principal solo despacha conexiones; los workers conectan a Mongo y atienden las peticiones. En desarrollo está desactivado para simplificar el debug.

### CORS

`app.js` permite tres orígenes: `http://localhost:5173` (dev), `https://medidores-cge.vercel.app` (web) y **`https://localhost`**, que es el origen del WebView de Capacitor con `androidScheme: https`. Sin ese tercero el APK **no pasa ni el login**: el token viaja como header `Authorization`, eso dispara un preflight, y el preflight se rechaza.

### Optimización

`GET /api/medidores/uls` calcula los valores distintos de `unidadDeLectura` con un `distinct` sobre toda la colección, caro de repetir en cada llamada. `utils/cache.js` guarda el resultado en memoria con TTL de 60 s.

Toda ruta que crea o borra medidores (crear uno, crear un pin desde TOES, eliminar uno, confirmar una importación, eliminar una ruta) llama a `cache.invalidarUls()`, porque puede cambiar qué ULs existen. Con el cluster eso no alcanza en un solo proceso: cada worker tiene su propio almacén, así que el que invalida le avisa al proceso principal y este reenvía el aviso a los demás (`reenviarInvalidaciones`). Antes una ruta recién importada podía no aparecer durante un minuto, según qué worker atendiera. `tests/cache.test.js` lo prueba con un cluster real de 3 workers.

El modelo `Medidor` mantiene **un solo índice**: `{ unidadDeLectura: 1 }`, que acelera los filtros por ruta y ese `distinct`. Se quitaron a propósito (commit `9cb382e`) el índice de texto y el `2dsphere`: el de texto no se usaba porque el buscador va por `$regex`, y el `2dsphere` solo lo usaba la ruta `/cercanos`, que el frontend nunca llamaba. Los dos hacían más lentos los inserts al importar rutas de cientos de medidores.

## Pruebas

**Backend — 134 tests en 13 suites, todos pasando.** Jest + Supertest + `mongodb-memory-server`: los tests levantan un MongoDB en memoria, así que corren en cualquier máquina sin configurar nada y sin tocar el Atlas real. Cubren auth (registro, login, logout, token invalidado rechazado), CRUD de medidores con autorización por roles (incluido que un lector no lea una UL ajena), mover un pin, marca permanente, cambio de medidor y pin desde TOES (los dos idempotentes), fotos (sin duplicar al reintentar), notas de la UL, quién subió cada UL (importando por la ruta real), las marcas por confirmar (y que esa ruta no la tome `/:instalacion`), la caché de ULs con un cluster real, rutas e importación (rutas grandes, instalaciones repetidas y medidor lupa).

```bash
cd backend
npm test
```

**Frontend — 245 tests** (244 pasan, 1 se omite): el parser de TOES, el cursor de lectura incremental, la visibilidad de los pines (incluido el repaso de casas cerradas), qué claves proponen marca permanente, qué cambios de medidor faltan en la base, qué servicios tomados no tienen pin (con sus resguardos), el reporte de ruta y sus listas para copiar (con la serie nueva en los cambios), qué lista y encuadra el modo revisión, el agrupado por punto, qué ULs se restauran al abrir, cuándo sirve la copia sin señal, las medidas de las fotos comprimidas y cuándo se reintenta subirlas, la cola de fotos en archivos (con un sistema de archivos falso: escrituras cortadas, el paso desde IndexedDB sin perder ninguna), cuándo avisar del WebView, qué tiles bajar por ruta y el enlace a Google Maps (que no invierta `[lng, lat]`). Usan `node --test`, el runner nativo de Node: cero dependencias nuevas.

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
# -> android/app/build/outputs/apk/debug/app-debug.apk  (~5,5 MB)
```

Scripts disponibles: `android:sync` (build nativo + `cap sync`), `android:apk` (lo anterior + `scripts/compilarApk.mjs`, que busca un JDK y corre `gradlew assembleDebug`), `android:open` (abrir en Android Studio).

Datos del build: package `cl.mla.maule`, `minSdk 24` (Android 7+), `compileSdk`/`targetSdk 36`.

**Antes de repartir un APK, subir la versión** en `android/app/build.gradle` (`versionCode` y
`versionName`). No hay Play Store ni actualización automática, así que la única forma de saber qué
build tiene un teléfono es preguntársela — y para eso tiene que cambiar. El `versionName` sale en el
pie del panel lateral, así que se lee sin entrar a los ajustes de Android. La repartida hoy es la
**2.5 (code 8)**; conviene copiar el APK con un nombre que la diga (`MLA-Maule-2.5.apk`), porque
`app-debug.apk` se sobreescribe en cada build. **La copia va en la raíz del repo** (`*.apk` está en
el `.gitignore`) y no al lado de `app-debug.apk`: cuando Gradle vuelve a empaquetar, limpia esa
carpeta entera. Así se perdió la copia de la 2.5 el 2026-10-21.

Todavía es un build de **debug**: funciona igual, pero permite inspeccionar la app por cable. Firmar
para release sigue pendiente.

**Si el teléfono ya tuvo un APK compilado en otra máquina**, la instalación falla con
`INSTALL_FAILED_UPDATE_INCOMPATIBLE`: cada PC firma los builds de debug con su propia llave. Hay que
desinstalar primero, y eso borra el estado local de TOES de ese teléfono (el permiso de la carpeta y
el ciclo vigente); lo que está en el servidor no se toca.

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

- **Fin de línea:** el repo trabaja con `core.autocrlf=true`. En Windows los archivos antiguos (este README, `Mapa.jsx`) quedan **CRLF** y los módulos nuevos de TOES, LF. Al editar con scripts, respetar el que ya tiene el archivo o el diff sale entero. **No usar `sed -i` de Git Bash**: le saca los CR al archivo entero, y devolverlos con `sed 's/$/\r/'` deja un `\r` suelto que hace que git trate el archivo como binario (ya pasó con `Mapa.jsx`). Para revisar, `git ls-files --eol <archivo>` tiene que decir `i/lf w/crlf`.
- **Estilo del frontend:** sin punto y coma, comillas simples, comentarios explicativos en español que dicen *por qué*, no *qué*. `npm run lint` (oxlint) tiene 3 avisos preexistentes.
- **Nunca commitear logs reales de TOES.** Para los tests existe el fixture sintético.
- **No subir el contenido del log a ningún servidor.** Si aparece la tentación de un endpoint para "sincronizar lecturas", es exactamente lo que la regla de privacidad prohíbe.
- **No raspar tiles de Google** (`mt{s}.google.com/vt/`): viola los términos de Google Maps. El mapa usa OpenStreetMap y satelital de Esri.
- El archivo central del frontend es `src/pages/Mapa.jsx` (~1600 líneas): ahí viven el buscador, el panel lateral, la carga de rutas (con su copia sin señal) y los botones flotantes (centrar en mí, avisos de mover y de repaso), y ahí se elige el motor del mapa. **El render de los pines ya no está ahí**: está en `components/MapaGL.jsx` (MapLibre) y en `components/CapaMedidores.jsx` (Leaflet), por rendimiento (ver "Rendimiento del mapa"). Los pines se agrupan por punto (`utils/agrupar.js`, 5 m), así que la decisión de visibilidad es **por grupo**: vive en `vistaDeGrupo` (`utils/vistaMarcador.js`) y tiene tests propios en `utils/vistaMarcador.test.js`.
- **Las reglas que fallan en silencio van en `utils/`** como funciones puras con su `.test.js` al lado (`ulsActivas.js`, `marcasToes.js`, `cargaSinSenal.js`…), no en el JSX.
- **Todo lo que toque el mapa se prueba en los dos motores.** Ya pasó que un cambio dejara a Leaflet en blanco sin que lo vieran el build, oxlint ni los tests, porque el archivo que se rompió solo se monta con ese motor.

## Decisiones de diseño (resumen)

- **Separar `app.js` de `index.js`**: para testear la API con Supertest sin abrir un puerto real ni depender de Atlas.
- **Unificar la verificación de JWT en un solo middleware**: evita bugs de seguridad por tener dos implementaciones desincronizadas.
- **Lista negra de tokens con TTL**: permite un logout real (no solo del lado del cliente) sin guardar tokens invalidados para siempre.
- **Caché en memoria simple en vez de Redis**: suficiente para el volumen actual y evita infraestructura adicional.
- **Cluster de Node en vez de un orquestador externo**: aprovecha los núcleos del servidor sin la complejidad de Kubernetes o un load balancer para un proyecto de este tamaño.
- **El estado de TOES solo en el dispositivo**: lo exige la regla de privacidad, y de paso deja la integración sin dependencias de backend — el parser y el mapa se pueden probar y usar sin desplegar nada.
- **Envolver la PWA con Capacitor en vez de reescribir en nativo**: una sola base de código mantiene la web viva para supervisores y habilita el acceso a `/TOES` en terreno, que es el único requisito que el navegador no puede cumplir.
- **`node --test` en vez de Vitest en el frontend**: el parser es JavaScript puro sin DOM, así que el runner nativo alcanza y no agrega dependencias.
