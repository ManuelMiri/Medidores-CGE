# Medidores-CGE

Aplicación web para que técnicos de terreno de CGE (Compañía General de Electricidad) ubiquen y registren medidores eléctricos perdidos o sin documentar. Nace de un problema real: al revisar las rutas de lectura se detectaron 25 rutas "mal enrutadas" con cerca de 85 medidores sin registrar en el sistema, lo que obligaba a los técnicos a buscarlos a ciegas en terreno.

Este documento cubre el backend del proyecto (carpeta `backend/`), que además fue usado como base para el encargo de la Unidad 2 del ramo Programación Backend (Tec. en Ciberseguridad, IPG): backend con login seguro, API RESTful, JWT, autorización por roles, pruebas automatizadas, caché y una estrategia de escalabilidad.

## Stack

- **Backend:** Node.js, Express 5, Mongoose 9, MongoDB Atlas
- **Frontend:** React 19 + Vite, Leaflet (mapa), Bootstrap, react-router-dom (deployado en Vercel)
- **Autenticación:** JWT + bcrypt
- **Testing:** Jest, Supertest, mongodb-memory-server

## Arquitectura del backend

El backend está dividido en dos archivos de entrada para que se pueda testear sin depender de una conexión real a MongoDB ni de un puerto abierto:

- **`app.js`**: arma la aplicación de Express (middlewares, rutas). No conecta a Mongo ni levanta el servidor. Esto es lo que importan los tests con Supertest.
- **`index.js`**: conecta a MongoDB Atlas y ejecuta `app.listen()`. Cuando `NODE_ENV=production`, además activa el módulo nativo `cluster` de Node para levantar un proceso worker por cada núcleo de CPU disponible, repartiendo la carga de peticiones entre ellos (estrategia de escalabilidad horizontal a nivel de proceso).

```
backend/
├── app.js                 # Express app + rutas (sin listen, sin conexión a Mongo)
├── index.js                # Conexión a Mongo + listen + modo cluster (producción)
├── middleware/
│   └── auth.js             # proteger (verifica JWT y lista negra) y soloRol (autorización)
├── models/
│   ├── Usuario.js
│   ├── Medidor.js
│   └── TokenInvalido.js    # lista negra de tokens, con índice TTL
├── rutas/
│   ├── auth.js              # /registro, /login, /perfil, /logout
│   └── medidores.js         # CRUD de medidores
├── utils/
│   └── cache.js             # caché en memoria (TTL 60s)
└── tests/
    ├── setupTestDB.js
    ├── auth.test.js
    └── medidores.test.js
```

## Autenticación y autorización

- El login genera un JWT que el cliente debe enviar en el header `Authorization: Bearer <token>`.
- El middleware `proteger` (en `middleware/auth.js`) verifica ese token en cada ruta protegida y, además, revisa que no esté en la lista negra de tokens invalidados (colección `TokenInvalido`, con índice TTL para que los tokens expirados se limpien solos).
- `soloRol('rol1', 'rol2', ...)` restringe el acceso según el rol del usuario autenticado: `lector`, `supervisor` o `admin`.
- El logout invalida el token agregándolo a la lista negra, así un token robado o filtrado deja de servir aunque no haya expirado todavía.

Antes había dos formas distintas de verificar el token: una función local `verificarToken` en `rutas/auth.js` y el middleware `proteger` en `middleware/medidores.js`. Se unificó todo para usar `proteger` en ambos módulos, evitando que un fix de seguridad (como la lista negra) quedara aplicado en un solo lugar y no en el otro.

## Endpoints principales

| Método | Ruta | Rol requerido | Descripción |
|---|---|---|---|
| POST | `/api/auth/registro` | - | Crea un usuario |
| POST | `/api/auth/login` | - | Autentica y devuelve JWT |
| GET | `/api/auth/perfil` | cualquiera autenticado | Datos del usuario logueado |
| POST | `/api/auth/logout` | cualquiera autenticado | Invalida el token actual |
| GET | `/api/medidores` | cualquiera autenticado | Lista medidores (filtros: `pagina`, `limite`, `estado`, `ul`) |
| GET | `/api/medidores/uls` | cualquiera autenticado | Unidades de lectura (un `lector` solo ve las suyas; el resto ve todas, con caché) |
| GET | `/api/medidores/:instalacion` | cualquiera autenticado | Detalle de un medidor |
| POST | `/api/medidores` | cualquiera autenticado | Crea un medidor (`lector` solo en sus unidades de lectura asignadas) |
| PATCH | `/api/medidores/:instalacion` | cualquiera autenticado | Actualiza un medidor (`lector` solo en sus unidades de lectura asignadas) |
| DELETE | `/api/medidores/:instalacion` | **admin** | Elimina un medidor |

## Optimización

`GET /api/medidores/uls` calcula los valores distintos de `unidadDeLectura` con una consulta `distinct` sobre toda la colección, que es cara de ejecutar en cada llamada. Se agregó una caché en memoria (`utils/cache.js`) con TTL de 60 segundos: mientras el caché es válido, se devuelve el resultado guardado en vez de volver a consultar Mongo.

Además, el modelo `Medidor` define índices en MongoDB para que las consultas más frecuentes no tengan que recorrer toda la colección:

```js
medidorSchema.index({ ubicacion: '2dsphere' })                                  // búsquedas geoespaciales (medidores cercanos a un punto)
medidorSchema.index({ unidadDeLectura: 1 })                                     // filtrar/agrupar por unidad de lectura
medidorSchema.index({ instalacion: 'text', direccion: 'text', numeroDePoste: 'text' }) // búsqueda de texto libre
```

- El índice `2dsphere` es necesario para poder ubicar medidores por cercanía geográfica en el mapa (sin él, ese tipo de consulta no funciona en Mongo).
- El índice sobre `unidadDeLectura` acelera los filtros y el `distinct` que usa la caché de arriba.
- El índice de texto permite buscar un medidor por instalación, dirección o número de poste sin tener que escanear toda la colección campo por campo.

## Escalabilidad

En producción (`NODE_ENV=production`), `index.js` usa el módulo `cluster` de Node para levantar un proceso worker por núcleo de CPU disponible. El proceso principal solo hace de "despachador": distribuye las conexiones entrantes entre los workers, que son los que realmente conectan a Mongo y atienden las peticiones. Si un worker muere, se puede relanzar sin afectar a los demás. En desarrollo esto está desactivado para simplificar el debug (un solo proceso).

## Pruebas automatizadas

Se usa Jest + Supertest + `mongodb-memory-server`: los tests levantan una instancia de MongoDB en memoria (no tocan el Atlas real), lo que permite correrlos en cualquier máquina sin configurar nada externo ni arriesgar datos de producción.

Cobertura actual: registro, login, logout (incluyendo que un token ya invalidado sea rechazado) y autorización por roles en el CRUD de medidores. Estado actual: **8/8 tests pasando**.

```bash
cd backend
npm test
```

## Ejecución rápida (para evaluación)

El backend ya está desplegado y funcionando en Railway, así que para probar la app **no es necesario levantar el backend en local**. Basta con correr el frontend y apuntarlo al backend real:

```bash
git clone https://github.com/ManuelMiri/Medidores-CGE.git
cd Medidores-CGE/frontend
npm install
```

Crear un archivo `.env` en `frontend/` con:

```
VITE_API_URL=https://medidores-cge-production.up.railway.app/api
```

Levantar el frontend:

```bash
npm run dev
```

Esto abre la app en `http://localhost:5173`, funcionando igual que la versión pública en Vercel, pero corriendo en local.

**Credenciales de acceso para evaluación:**

| Rol | Email | Contraseña | Qué puede hacer |
|---|---|---|---|
| `admin` | `profesora.evaluacion@ipg.cl` | `Evaluacion2026` | CRUD completo: crear, editar y **eliminar** cualquier medidor |
| `lector` | `tecnico.demo@ipg.cl` | `Demo2026lector` | Solo ve/crea/edita medidores de su unidad de lectura asignada (`E3510021`); si intenta eliminar un medidor, la API responde `403 Acceso denegado. Se requiere rol: admin` |

Con las dos cuentas se puede comparar el mismo CRUD con y sin restricciones — es la forma más directa de ver la autorización por roles funcionando en la práctica.

Si en cambio se prefiere correr todo el backend en local también (con base de datos propia), ver la sección "Instalación y ejecución local" más abajo.

## Instalación y ejecución local

### Requisitos

- Node.js 20 LTS o superior
- Una base de datos MongoDB (Atlas o local)

### Pasos

```bash
git clone https://github.com/ManuelMiri/Medidores-CGE.git
cd Medidores-CGE/backend
npm install
```

Crear un archivo `.env` en `backend/` con:

```
MONGODB_URI=<tu string de conexión a MongoDB>
JWT_SECRET=<un secreto largo y aleatorio>
PORT=5000
```

Levantar el servidor en modo desarrollo:

```bash
npm run dev
```

Levantar el servidor en modo producción (con cluster activado):

```bash
NODE_ENV=production npm start
```

Correr los tests:

```bash
npm test
```

El frontend (React + Vite) vive en `frontend/` y se conecta a este backend vía variable de entorno con la URL de la API.

## Decisiones de diseño (resumen)

- **Separar `app.js` de `index.js`**: para poder testear la API con Supertest sin abrir un puerto real ni depender de MongoDB Atlas.
- **Unificar la verificación de JWT en un solo middleware**: evita bugs de seguridad por tener dos implementaciones desincronizadas.
- **Lista negra de tokens con TTL**: permite un logout real (no solo del lado del cliente) sin tener que guardar tokens invalidados para siempre.
- **Caché en memoria simple en vez de Redis**: suficiente para el volumen actual de la app y evita agregar infraestructura adicional.
- **Cluster de Node en vez de un orquestador externo**: escalabilidad vertical aprovechando los núcleos del servidor, sin la complejidad de configurar Kubernetes o un load balancer externo para un proyecto de este tamaño.