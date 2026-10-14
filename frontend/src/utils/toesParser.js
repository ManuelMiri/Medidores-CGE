// toesParser.js
// Lee el texto de un Log_TOES-*.txt y devuelve solo lo necesario para el mapa:
// qué instalación se tomó, en qué UL y ciclo, con qué clave (si hubo) y a qué hora.
// No guarda lecturas ni otros datos del cliente. Sí guarda, en el teléfono, el
// medidor (serie y marca), la dirección, el poste y el GPS del lector al
// guardar: con eso se crea el pin de un servicio que no está en el mapa, y es
// lo único de esto que sale del teléfono, solo para esos servicios (ver
// CLAUDE.md). La lectura no se copia nunca.

const MARCA = 'Backup de la lectura (';

// Extrae el bloque JSON que empieza en `inicio` contando llaves (respetando strings).
function extraerJson(texto, inicio) {
  let nivel = 0;
  let enString = false;
  let escape = false;
  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i];
    if (enString) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') enString = false;
      continue;
    }
    if (c === '"') enString = true;
    else if (c === '{') nivel++;
    else if (c === '}') {
      nivel--;
      if (nivel === 0) return { json: texto.slice(inicio, i + 1), fin: i + 1 };
    }
  }
  return null; // bloque incompleto (TOES todavía está escribiendo)
}

const limpio = (v) => (v === null || v === undefined ? '' : String(v).trim());

// "2026-10-06T00:00:00.000Z" -> "2026-10-06"
const soloFecha = (v) => limpio(v).slice(0, 10);

// Dónde estaba parado el lector cuando guardó (LEC_COOR_X es la latitud,
// LEC_COOR_Y la longitud; comprobado contra 1.061 pines: mediana 8 m, p90
// 29 m). Sirve para crear el pin de un servicio que no está en el mapa
// (hooks/useAltasToes.js). Fuera de Chile continental, o en 0,0, es un GPS
// sin señal y no se usa.
// La dirección tal como la entrega MLA en los mapas de ruta: estos campos, en
// este orden y separados por espacio. Comprobado contra 1.061 servicios: la
// misma en todos (en 303 cambian solo espacios o mayúsculas).
const CAMPOS_DIRECCION = ['STREET', 'HOUSE_NUM1', 'HAUS_NUM2', 'BUILDING', 'DIST_SUPL', 'CO_ADDRESS_CITY1'];

function direccionDelLog(o) {
  const texto = CAMPOS_DIRECCION.map((c) => limpio(o[c])).filter(Boolean).join(' ').replace(/\s+/g, ' ');
  return texto || null;
}

function gpsDelLector(x, y) {
  const lat = parseFloat(x);
  const lng = parseFloat(y);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -56 || lat > -17 || lng < -76 || lng > -66) return null;
  return { lat, lng };
}

/**
 * Procesa un texto de log (completo o solo la parte nueva).
 * Devuelve { eventos, cierres, consumido }.
 *  - eventos: [{ unidad, ciclo, instalacion, medidor, orden, clave, conLectura, fecha }]
 *  - cierres: [{ unidad, fechaLog }]  (líneas "Cierre Especial realizado correctamente")
 *  - consumido: hasta qué carácter se procesó, para leer solo lo nuevo la próxima vez.
 *  - invalidos: bloques que no parsearon (0 en los logs reales).
 */
export function parsearLog(texto) {
  const eventos = [];
  // Bloques que no se pudieron parsear. En los logs reales vale 0; si empieza
  // a subir es la señal de que TOES cambió de formato, y conviene que el
  // lector lo vea en el panel antes de desconfiar del mapa.
  let invalidos = 0;
  let pos = 0;
  let consumido = 0;

  while (true) {
    const idx = texto.indexOf(MARCA, pos);
    if (idx === -1) break;
    // ojo: no llamar a esto `llave`, que es el nombre de la función exportada
    // más abajo y quedaba sombreada dentro de este bloque.
    const inicioJson = texto.indexOf('{', idx);
    if (inicioJson === -1) break;
    const bloque = extraerJson(texto, inicioJson);
    if (!bloque) break; // se completará en la próxima lectura

    try {
      const o = JSON.parse(bloque.json).oData || {};
      const clave = limpio(o.METERREADINGNOTE);
      eventos.push({
        unidad: limpio(o.ABLEINH), // UL (Unidad de Lectura)
        ciclo: soloFecha(o.ADATSOLL), // fecha programada = identifica el ciclo
        instalacion: limpio(o.ANLAGE),
        medidor: limpio(o.GERAET),
        marca: limpio(o.HERST) || null,
        direccion: direccionDelLog(o),
        // INVENTORY es el número de poste: igual al de la base en 1.061 de 1.061.
        poste: limpio(o.INVENTORY) || null,
        orden: limpio(o.ABLBELNR),
        clave: clave || null,
        conLectura: limpio(o.READINGRESULT) !== '',
        fecha: o.ACTUALMRDATE || null,
        gps: gpsDelLector(o.LEC_COOR_X, o.LEC_COOR_Y),
      });
    } catch {
      invalidos++; // bloque corrupto: se salta, pero queda contado
    }
    pos = bloque.fin;
    consumido = bloque.fin;
  }

  // Cierres de unidad. Se buscan en todo el texto recibido y pueden repetirse
  // entre lecturas incrementales: marcar una UL como cerrada debe ser idempotente.
  // `consumido` NO avanza por los cierres, solo por bloques completos.
  //
  // TOES escribe DOS variantes y el README solo documentaba la primera:
  //   "Cierre Especial" -> apareció al terminar el dia 1 de la ruta (cierre parcial)
  //   "Cierre Final"    -> apareció al terminar el dia 2, con la ruta completa
  // Se capturan ambas y se guarda el tipo, porque no significan lo mismo: una UL
  // con cierre final ya no deberia recibir mas lecturas de ese ciclo.
  const cierres = [];
  const reCierre = /^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3}) : DEBUG : Cierre (Especial|Final) realizado correctamente: (.*)$/gm;
  let m;
  while ((m = reCierre.exec(texto))) {
    for (const u of m[3].matchAll(/'([^']+)'/g)) {
      const ul = u[1].trim();
      if (ul) cierres.push({ unidad: ul, tipo: m[2].toLowerCase(), fechaLog: m[1] });
    }
  }

  // Cambios de medidor (clave 10). TOES deja la serie y la marca NUEVAS en un
  // bloque aparte, /CambioMedidor, que escribe al sincronizar justo después
  // del "Backup" de la orden — y ese backup todavía trae el medidor VIEJO en
  // GERAET. Igual que los cierres: se buscan en todo el trozo, pueden
  // repetirse entre lecturas y no mueven `consumido`.
  //
  // El bloque trae también la lectura del medidor nuevo (READINGRESULT): no
  // se copia, como todo lo demás que es del cliente.
  const cambiosMedidor = [];
  const MARCA_CAMBIO = '"sPath": "/CambioMedidor"';
  let pc = 0;
  while (true) {
    const idx = texto.indexOf(MARCA_CAMBIO, pc);
    if (idx === -1) break;
    pc = idx + MARCA_CAMBIO.length;
    const inicioJson = texto.lastIndexOf('{', idx);
    if (inicioJson === -1) continue;
    const bloque = extraerJson(texto, inicioJson);
    if (!bloque) break; // incompleto: llega en la próxima lectura
    try {
      const d = JSON.parse(bloque.json);
      const o = d.oData || {};
      const serie = limpio(o.SERNR);
      const instalacion = limpio(o.ANLAGE);
      if (d.sPath === '/CambioMedidor' && serie && instalacion) {
        cambiosMedidor.push({
          unidad: limpio(o.ABLEINH),
          ciclo: soloFecha(o.ADATSOLL),
          instalacion,
          serie,
          marca: limpio(o.HERST_CAMMED) || null,
          fecha: Number.isFinite(d.timestamp) ? new Date(d.timestamp).toISOString() : null,
        });
      }
    } catch {
      invalidos++;
    }
    pc = bloque.fin;
  }

  return { eventos, cierres, cambiosMedidor, consumido, invalidos };
}

/**
 * Suma cambios de medidor nuevos a los ya conocidos, sin repetir: el mismo
 * bloque se lee varias veces (relecturas, cursor perdido). La serie anterior
 * sale del estado: es el GERAET del último guardado de esa orden, que es el de
 * la clave 10 y todavía trae el medidor viejo.
 */
export function acumularCambios(previos, nuevos, estado) {
  const vistos = new Set(previos.map((c) => `${c.instalacion}|${c.serie}`));
  const salida = [...previos];
  for (const c of nuevos) {
    const k = `${c.instalacion}|${c.serie}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    const previo = estado?.get(llave(c.unidad, c.ciclo, c.instalacion));
    const anterior = previo?.medidor && previo.medidor !== c.serie ? previo.medidor : null;
    salida.push({ ...c, serieAnterior: anterior });
  }
  return salida;
}

/** Llave única: UL + ciclo + instalación. */
export const llave = (ul, ciclo, instalacion) => `${ul}|${ciclo}|${instalacion}`;

/**
 * Acumula eventos en un estado. Vale el guardado más reciente de cada UL + ciclo + instalación.
 * Devuelve Map llave -> { tomado, estado: 'leido' | 'clave' | 'noTomado', unidad, ciclo, ... }
 *
 * Un servicio está tomado solo si tiene lectura O clave. Se guardan también los
 * no tomados, porque si no, una corrección que borra la lectura no podría pisar
 * al guardado anterior y el punto quedaría oculto para siempre: ese medidor no
 * se leería nunca más. `estadoDeUL` es el que filtra para el mapa.
 */
export function estadoPorInstalacion(eventos, estadoPrevio = new Map()) {
  const estado = new Map(estadoPrevio);
  for (const ev of eventos) {
    if (!ev.unidad || !ev.instalacion) continue;
    const k = llave(ev.unidad, ev.ciclo, ev.instalacion);
    const previo = estado.get(k);
    if (previo && previo.fecha && ev.fecha && previo.fecha > ev.fecha) continue;
    const tomado = Boolean(ev.clave) || ev.conLectura;
    estado.set(k, {
      ...ev,
      tomado,
      estado: ev.clave ? 'clave' : tomado ? 'leido' : 'noTomado',
    });
  }
  return estado;
}

/** Ciclo vigente de una UL = la fecha ADATSOLL más reciente vista para esa UL. */
export function cicloVigente(estado, ul) {
  let max = null;
  for (const v of estado.values()) {
    if (v.unidad === ul && v.ciclo && (!max || v.ciclo > max)) max = v.ciclo;
  }
  return max;
}

/**
 * Instalaciones TOMADAS de una UL en un ciclo (por defecto, el vigente).
 * Devuelve Map instalacion -> estado. Se ignoran los otros ciclos y los
 * servicios que quedaron sin lectura ni clave tras una corrección.
 */
export function estadoDeUL(estado, ul, ciclo = cicloVigente(estado, ul)) {
  const res = new Map();
  if (!ciclo) return res;
  for (const v of estado.values()) {
    if (v.unidad === ul && v.ciclo === ciclo && v.tomado) res.set(v.instalacion, v);
  }
  return res;
}

/**
 * Cierre que corresponde al ciclo indicado (por defecto, el vigente), o null.
 *
 * La línea de cierre que escribe TOES trae la UL pero NO el ciclo, así que hay
 * que atarla por tiempo: un cierre es de este ciclo si ocurrió después de que
 * el ciclo empezó. Sin esto, el cierre del mes pasado seguiría marcando la
 * ruta como CERRADA al empezar la del mes siguiente — y eso le diría al lector
 * que ya terminó una ruta que ni siquiera empezó.
 *
 * Ojo con las dos escalas de tiempo del log, que no son la misma:
 *   - ACTUALMRDATE viene en UTC  ("2026-10-06T17:53:49.520Z")
 *   - la línea de cierre, en hora local ("2026-10-06 14:53:49.266")
 * Date.parse() interpreta bien las dos (la segunda como local) y las deja
 * comparables, pero no se pueden comparar como texto.
 *
 * Límite conocido: si el lector abriera un ciclo nuevo de la misma UL ANTES de
 * cerrar el anterior, ese cierre se atribuiría al ciclo nuevo. No pasa con una
 * ruta mensual por UL, que es como se trabaja hoy.
 */
export function cierreDeCiclo(cierres, estado, ul, ciclo = cicloVigente(estado, ul)) {
  if (!ciclo || !cierres?.length) return null;

  let inicio = Infinity;
  for (const v of estado.values()) {
    if (v.unidad !== ul || v.ciclo !== ciclo || !v.fecha) continue;
    const t = Date.parse(v.fecha);
    if (!Number.isNaN(t) && t < inicio) inicio = t;
  }
  if (inicio === Infinity) return null;

  let mejor = null;
  let mejorT = -Infinity;
  for (const c of cierres) {
    if (c.unidad !== ul) continue;
    const t = Date.parse(String(c.fechaLog).replace(' ', 'T'));
    if (Number.isNaN(t) || t < inicio || t <= mejorT) continue;
    mejor = c;
    mejorT = t;
  }
  return mejor;
}

/**
 * Índice paralelo por número de medidor (GERAET), para el respaldo de §5.4:
 * cuando un punto del mapa no trae instalación, se intenta calzar por medidor.
 * Solo dentro de la misma UL y ciclo, nunca cruzando.
 */
export function tomadosPorMedidor(estado, ul, ciclo = cicloVigente(estado, ul)) {
  const res = new Map();
  if (!ciclo) return res;
  for (const v of estado.values()) {
    if (v.unidad === ul && v.ciclo === ciclo && v.tomado && v.medidor) {
      res.set(v.medidor, v);
    }
  }
  return res;
}
