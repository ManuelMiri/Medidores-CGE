// toesParser.js
// Lee el texto de un Log_TOES-*.txt y devuelve solo lo necesario para el mapa:
// qué instalación se tomó, en qué UL y ciclo, con qué clave (si hubo) y a qué hora.
// No guarda lecturas, direcciones ni otros datos del cliente.

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
        orden: limpio(o.ABLBELNR),
        clave: clave || null,
        conLectura: limpio(o.READINGRESULT) !== '',
        fecha: o.ACTUALMRDATE || null,
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

  return { eventos, cierres, consumido, invalidos };
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
