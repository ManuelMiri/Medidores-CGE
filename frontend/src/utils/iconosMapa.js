// iconosMapa.js
// Los iconos de los pines del mapa, en un solo lugar.
//
// Van BUNDLEADOS, no traídos de la red. Antes los de color salían de
// raw.githubusercontent.com y la sombra de unpkg.com, lo que ponía el primer
// dibujado del mapa detrás de dos hosts que no son CDN de producción
// — raw.githubusercontent limita por tasa y desalienta el hotlinking — y
// encima quedaban fuera del runtimeCaching del service worker. En terreno,
// con señal mala, los pines podían tardar o no aparecer. Ahora los sirve Vite
// desde el mismo origen, con hash y cacheados para siempre, y en el APK salen
// del propio paquete.

import L from 'leaflet'
import iconoLeaflet from 'leaflet/dist/images/marker-icon.png'
import iconoLeaflet2x from 'leaflet/dist/images/marker-icon-2x.png'
import sombraLeaflet from 'leaflet/dist/images/marker-shadow.png'
import pinVerde from '../assets/pines/marker-icon-green.png'
import pinVerde2x from '../assets/pines/marker-icon-2x-green.png'
import pinRojo from '../assets/pines/marker-icon-red.png'
import pinRojo2x from '../assets/pines/marker-icon-2x-red.png'
import pinAzul from '../assets/pines/marker-icon-blue.png'
import pinAzul2x from '../assets/pines/marker-icon-2x-blue.png'
import pinNaranja from '../assets/pines/marker-icon-orange.png'
import pinNaranja2x from '../assets/pines/marker-icon-2x-orange.png'
import pinMorado from '../assets/pines/marker-icon-violet.png'
import pinMorado2x from '../assets/pines/marker-icon-2x-violet.png'
import pinDorado from '../assets/pines/marker-icon-gold.png'
import pinDorado2x from '../assets/pines/marker-icon-2x-gold.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: iconoLeaflet2x,
  iconUrl: iconoLeaflet,
  shadowUrl: sombraLeaflet,
})

/**
 * Pin de un color.
 *
 * Sin `shadowUrl` a propósito: la sombra es un <img> EXTRA POR MARCADOR, así
 * que con ~300 pines en pantalla son 300 nodos de DOM más que Leaflet tiene
 * que reposicionar en cada zoom — a cambio de una sombra que sobre la foto
 * satelital casi no se distingue.
 *
 * `iconRetinaUrl` ahora va en todos (antes solo en el dorado): los pines se
 * ven nítidos en el celular y, al estar bundleados, no cuesta una request.
 */
function pin(url, url2x) {
  return new L.Icon({
    iconUrl: url,
    iconRetinaUrl: url2x,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  })
}

/** Por estado de mapeo del medidor. */
export const iconos = {
  localizado: pin(pinVerde, pinVerde2x),
  perdido: pin(pinRojo, pinRojo2x),
  pendiente: pin(pinAzul, pinAzul2x),
  revision: pin(pinNaranja, pinNaranja2x),
  nuevo: pin(pinMorado, pinMorado2x),
}

// Icono del medidor seleccionado (el que tocaste o encontraste con el
// buscador): mismo tamaño que los demás, solo cambia a dorado para que se
// note cuál es sin tapar los pines de al lado
export const iconoSeleccionado = pin(pinDorado, pinDorado2x)

// Pin con un circulito rojo y el número de medidores que hay en ese punto.
// Uso la misma imagen del pin normal (o dorado) y le pego el contador encima.
const cacheIconosContador = {}
export function iconoConContador(iconoBase, cantidad) {
  const url = iconoBase.options.iconUrl
  // Los pines de color de la capa TOES son divIcon con SVG embebido y no
  // tienen iconUrl, así que no se les puede pegar el contador encima: sin
  // esta guarda saldría un <img> roto. Hoy no llegan acá (el color se usa
  // solo cuando hay un medidor visible), pero es un pin menos que romper.
  if (!url) return iconoBase
  const clave = url + cantidad
  if (!cacheIconosContador[clave]) {
    cacheIconosContador[clave] = L.divIcon({
      className: '',
      html: `<div class="pin-grupo"><img src="${url}" alt="" /><span class="pin-grupo-contador">${cantidad}</span></div>`,
      iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
    })
  }
  return cacheIconosContador[clave]
}
