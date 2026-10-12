// agrupar.js
// Junta en un solo pin los medidores que están prácticamente en el mismo
// punto (mismo poste o misma casa), porque si no quedan uno encima de otro y
// no hay forma de tocar los de abajo.
//
// Vive acá y no en Mapa.jsx para poder testearlo sin montar el mapa.

// Agrupa medidores que están a menos de `metros` entre sí. Para distancias
// tan chicas basta con pasar grados a metros a mano (no hace falta la
// fórmula de haversine). Comparo contra el primer medidor de cada grupo.
//
// Devuelve { lat, lng, position, medidores }. `position` se crea UNA vez por
// grupo y no en cada render a propósito: react-leaflet compara los props por
// identidad, así que un literal `[lat, lng]` nuevo le hace ejecutar
// marker.setLatLng() — una escritura de layout — en los ~300 marcadores cada
// vez que Mapa se re-renderiza, aunque ninguno se haya movido.
//
// Va por rejilla espacial y no comparando contra todos los grupos: solo se
// miran las 9 celdas vecinas. Medido con el tamaño real del dataset, por
// llamada (y esto corre entero en cada setMedidores: al guardar, al resolver
// una marca, al cambiar de UL):
//
//     281 medidores (una UL)      0,20 ms -> 0,03 ms
//   1.765 medidores (las 8 ULs)   6,61 ms -> 0,25 ms
//
// La rejilla va en un Map ANIDADO (cx -> cy -> grupos) y no en uno solo con
// clave `cx + ':' + cy`. Eso no es gusto: con la clave de texto se arma una
// cadena nueva por medidor, y medido salía 0,45 ms con una UL — o sea MÁS
// LENTO que el O(n^2) que venía a reemplazar. Anidado gana en todos los
// tamaños.
export function agruparCercanos(lista, metros) {
  const grupos = []
  // cx -> (cy -> índices de los grupos cuya ancla cae en esa celda)
  const celdas = new Map()

  // El alto de la celda en grados es fijo, pero el ancho depende de la
  // latitud: un grado de longitud mide menos lejos del ecuador. Se usa la
  // latitud MÁS alejada del ecuador de toda la lista, porque es la que da la
  // celda más ancha en grados — y la celda tiene que ser lo bastante grande
  // como para que dos puntos dentro del radio nunca queden a más de una celda
  // de distancia. Si se quedara corta, dos medidores del mismo poste podrían
  // caer en celdas no vecinas y el grupo se partiría en dos pines: justo lo
  // que este archivo existe para evitar, y encima en silencio.
  let latMax = 0
  for (const m of lista) {
    const c = m.ubicacion?.coordinates
    if (c) latMax = Math.max(latMax, Math.abs(c[1]))
  }
  const altoCelda = metros / 110540
  // El piso del coseno es para que una coordenada basura cerca de los polos no
  // haga una celda infinita. Con metros = 0 el ancho da 0, las claves salen
  // todas iguales y el agrupado degrada a comparar contra todos: más lento,
  // pero igual de correcto.
  const anchoCelda = metros / (111320 * Math.max(Math.cos(latMax * Math.PI / 180), 0.01))

  for (const m of lista) {
    const c = m.ubicacion?.coordinates
    if (!c) continue
    const [lng, lat] = c
    const cx = Math.floor(lng / anchoCelda)
    const cy = Math.floor(lat / altoCelda)

    // De todos los grupos candidatos gana el de MENOR índice de creación, que
    // es exactamente lo que devolvía el grupos.find() que esto reemplaza: el
    // primero del array en cumplir la condición. Por eso la regla "se compara
    // contra el primero" sigue decidiendo igual ante empates.
    let elegido = -1
    for (let dx = -1; dx <= 1; dx++) {
      const fila = celdas.get(cx + dx)
      if (!fila) continue
      for (let dy = -1; dy <= 1; dy++) {
        const enCelda = fila.get(cy + dy)
        if (!enCelda) continue
        for (const i of enCelda) {
          if (elegido !== -1 && i > elegido) continue
          const g = grupos[i]
          const ex = (lng - g.lng) * 111320 * Math.cos(lat * Math.PI / 180)
          const ey = (lat - g.lat) * 110540
          if (ex * ex + ey * ey <= metros * metros) elegido = i
        }
      }
    }

    if (elegido !== -1) {
      grupos[elegido].medidores.push(m)
      continue
    }

    grupos.push({ lat, lng, position: [lat, lng], medidores: [m] })
    let fila = celdas.get(cx)
    if (!fila) {
      fila = new Map()
      celdas.set(cx, fila)
    }
    const enCelda = fila.get(cy)
    if (enCelda) enCelda.push(grupos.length - 1)
    else fila.set(cy, [grupos.length - 1])
  }

  return grupos
}
