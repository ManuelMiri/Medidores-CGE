package cl.mla.maule.toes;

import android.content.ContentResolver;
import android.content.Intent;
import android.content.UriPermission;
import android.net.Uri;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract;
import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Lectura de la carpeta TOES del telefono mediante el Storage Access Framework.
 *
 * Por que SAF y no un File normal: desde Android 11 la app no puede abrir rutas
 * arbitrarias del almacenamiento compartido, y Chrome en Android no expone
 * showDirectoryPicker(), asi que la PWA sola no puede leer /TOES. SAF resuelve
 * las dos cosas y NO necesita ningun permiso en el manifest: el permiso lo
 * concede el usuario al elegir la carpeta una sola vez, y
 * takePersistableUriPermission lo hace sobrevivir a reinicios.
 *
 * SOLO LECTURA, a proposito. TOES es la app oficial de CGE y sus logs son la
 * fuente de verdad de la lectura del mes: escribir, mover o borrar algo ahi
 * podria arruinar una ruta ya tomada. Este plugin solo lista y abre en modo
 * "r"; no hay ni una llamada que modifique (ni delete, ni renameTo, ni "w").
 */
@CapacitorPlugin(name = "Toes")
public class ToesPlugin extends Plugin {

    /** Ventana por defecto. El log real de un dia pesa ~760 KB, asi que entra
     *  de una; el tope existe para que un archivo anormal no arme un JSON
     *  gigante cruzando el puente hacia el WebView. Si sobra, el JS vuelve a
     *  llamar con el cursor mas adelante, y si un bloque no entro, vuelve a
     *  llamar con un `tope` mayor. */
    private static final int TOPE_POR_DEFECTO = 1024 * 1024;

    /** Minimo y maximo de la ventana que el JS puede pedir. */
    private static final int TOPE_MINIMO = 4 * 1024;
    private static final int TOPE_MAXIMO = 16 * 1024 * 1024;

    private static final String PREFIJO_LOG = "Log_TOES";
    private static final String SUFIJO_LOG = ".txt";

    /** Codigos de error que el JS distingue para decidir si pedir la carpeta de nuevo. */
    private static final String SIN_PERMISO = "SIN_PERMISO";
    private static final String SIN_ARCHIVO = "SIN_ARCHIVO";

    // ---------------------------------------------------------------- carpeta

    /**
     * Carpeta que ya tenemos concedida, o null.
     *
     * Se consulta al ContentResolver en vez de confiar en lo guardado por el
     * JS: el usuario puede revocar el permiso desde los ajustes de Android y
     * ahi IndexedDB seguiria diciendo que la carpeta esta conectada.
     */
    @PluginMethod
    public void carpetaActual(PluginCall call) {
        String pedida = call.getString("uri");
        String uri = buscarPermiso(pedida);
        JSObject res = new JSObject();
        // JSONObject.NULL y no null pelado: un put con null BORRA la clave, y
        // el JS veria undefined donde espera "no hay carpeta".
        res.put("uri", uri == null ? JSONObject.NULL : uri);
        call.resolve(res);
    }

    @PluginMethod
    public void elegirCarpeta(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        );
        // Abre el selector ya parado en /TOES para que el lector no tenga que
        // navegar. Es solo una sugerencia: si la carpeta no existe o el
        // proveedor la ignora, el selector abre donde quiera y no pasa nada.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                Uri inicial = DocumentsContract.buildDocumentUri(
                    "com.android.externalstorage.documents",
                    "primary:TOES"
                );
                intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI, inicial);
            } catch (Exception e) {
                // sugerencia fallida: da igual, el selector abre en su raiz
            }
        }
        startActivityForResult(call, intent, "carpetaElegida");
    }

    @ActivityCallback
    private void carpetaElegida(PluginCall call, ActivityResult resultado) {
        if (call == null) return;

        Intent datos = resultado.getData();
        Uri arbol = datos != null ? datos.getData() : null;
        if (arbol == null) {
            // El lector salio del selector sin elegir. No es un error: la UI
            // se queda como estaba y el boton sigue disponible.
            JSObject res = new JSObject();
            res.put("cancelado", true);
            res.put("uri", JSONObject.NULL);
            call.resolve(res);
            return;
        }

        try {
            // Sin esto el permiso dura lo que vive el proceso y el lector
            // tendria que volver a elegir la carpeta cada vez que abre la app.
            getContext()
                .getContentResolver()
                .takePersistableUriPermission(arbol, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (SecurityException e) {
            call.reject("Android no dejo recordar el permiso de la carpeta", SIN_PERMISO);
            return;
        }

        JSObject res = new JSObject();
        res.put("cancelado", false);
        res.put("uri", arbol.toString());
        res.put("nombre", nombreDe(arbol));
        call.resolve(res);
    }

    /** Suelta el permiso. Lo usa el boton "cambiar carpeta" del panel. */
    @PluginMethod
    public void olvidarCarpeta(PluginCall call) {
        String uri = call.getString("uri");
        if (uri != null) {
            try {
                getContext()
                    .getContentResolver()
                    .releasePersistableUriPermission(
                        Uri.parse(uri),
                        Intent.FLAG_GRANT_READ_URI_PERMISSION
                    );
            } catch (Exception e) {
                // ya no lo teniamos: el resultado buscado es el mismo
            }
        }
        call.resolve();
    }

    // --------------------------------------------------------------- archivos

    /** Lista los Log_TOES-*.txt de la carpeta, ordenados por nombre. */
    @PluginMethod
    public void listarLogs(PluginCall call) {
        DocumentFile carpeta = abrirCarpeta(call);
        if (carpeta == null) return;

        JSArray salida = new JSArray();
        DocumentFile[] hijos = carpeta.listFiles();
        java.util.Arrays.sort(hijos, (a, b) -> {
            String na = a.getName() == null ? "" : a.getName();
            String nb = b.getName() == null ? "" : b.getName();
            return na.compareTo(nb);
        });
        for (DocumentFile hijo : hijos) {
            String nombre = hijo.getName();
            if (nombre == null || !hijo.isFile()) continue;
            if (!nombre.startsWith(PREFIJO_LOG) || !nombre.endsWith(SUFIJO_LOG)) continue;
            JSObject item = new JSObject();
            item.put("nombre", nombre);
            item.put("tamano", hijo.length());
            item.put("modificado", hijo.lastModified());
            salida.put(item);
        }

        JSObject res = new JSObject();
        res.put("archivos", salida);
        call.resolve(res);
    }

    /**
     * Lee un log desde el byte `desde`. Devuelve { texto, bytes, tamano }.
     *
     * `bytes` es cuanto se consumio del archivo en esta pasada y es lo que el
     * JS suma a su cursor: NO coincide con texto.length(), porque los acentos
     * del log ocupan dos bytes en UTF-8 y uno solo como caracter (el log de
     * prueba tiene 761.639 bytes y 761.541 caracteres). Mezclar las dos escalas
     * desincroniza la lectura incremental, asi que el cursor se lleva en bytes
     * de punta a punta.
     */
    @PluginMethod
    public void leerLog(PluginCall call) {
        DocumentFile carpeta = abrirCarpeta(call);
        if (carpeta == null) return;

        String nombre = call.getString("nombre");
        if (nombre == null || nombre.isEmpty()) {
            call.reject("Falta el nombre del log", SIN_ARCHIVO);
            return;
        }

        DocumentFile doc = carpeta.findFile(nombre);
        if (doc == null || !doc.isFile()) {
            call.reject("El log ya no esta en la carpeta: " + nombre, SIN_ARCHIVO);
            return;
        }

        long tamano = doc.length();
        // optLong y no call.getLong(): getLong solo devuelve el valor si el
        // puente lo entrego como Long, y un numero chico desde JS llega como
        // Integer. Con getLong el cursor se quedaba pegado en 0 y cada vuelta
        // releia el archivo completo. optLong coerce Integer, Long y Double.
        long desde = call.getData().optLong("desde", 0L);
        // Si el archivo se achico, el cursor viejo ya no significa nada:
        // se relee entero. Reprocesar es inofensivo (el estado se deduplica
        // por UL + ciclo + instalacion).
        if (desde < 0 || desde > tamano) desde = 0;

        long tope = call.getData().optLong("tope", TOPE_POR_DEFECTO);
        if (tope < TOPE_MINIMO) tope = TOPE_MINIMO;
        if (tope > TOPE_MAXIMO) tope = TOPE_MAXIMO;

        int aLeer = (int) Math.min(tamano - desde, tope);
        byte[] datos = new byte[Math.max(aLeer, 0)];
        int leidos = 0;

        try (
            ParcelFileDescriptor pfd = getContext()
                .getContentResolver()
                .openFileDescriptor(doc.getUri(), "r");
            FileInputStream entrada = new FileInputStream(pfd.getFileDescriptor())
        ) {
            FileChannel canal = entrada.getChannel();
            canal.position(desde);
            ByteBuffer buffer = ByteBuffer.wrap(datos);
            while (buffer.hasRemaining()) {
                if (canal.read(buffer) < 0) break;
            }
            leidos = buffer.position();
        } catch (SecurityException e) {
            call.reject("Se perdio el permiso de la carpeta TOES", SIN_PERMISO);
            return;
        } catch (IOException e) {
            call.reject("No se pudo leer " + nombre + ": " + e.getMessage());
            return;
        }

        int fin = leidos;
        boolean hayMas = desde + leidos < tamano;
        if (hayMas) {
            // Cortar en el ultimo salto de linea. En UTF-8 el byte 0x0A no
            // aparece nunca dentro de un caracter multibyte (las continuaciones
            // son todas >= 0x80), asi que cortar ahi siempre cae en frontera
            // de caracter y el proximo trozo empieza limpio.
            for (int i = leidos - 1; i >= 0; i--) {
                if (datos[i] == '\n') {
                    fin = i + 1;
                    break;
                }
            }
        }

        JSObject res = new JSObject();
        res.put("texto", new String(datos, 0, fin, StandardCharsets.UTF_8));
        res.put("bytes", fin);
        res.put("tamano", tamano);
        call.resolve(res);
    }

    // ---------------------------------------------------------------- helpers

    /**
     * Resuelve la carpeta del call verificando el permiso primero. Si no hay,
     * rechaza con SIN_PERMISO y devuelve null: el llamador solo tiene que
     * cortar, el JS ya sabe que ese codigo significa "pedi la carpeta de nuevo".
     */
    private DocumentFile abrirCarpeta(PluginCall call) {
        String uri = buscarPermiso(call.getString("uri"));
        if (uri == null) {
            call.reject("No hay carpeta TOES concedida", SIN_PERMISO);
            return null;
        }
        DocumentFile carpeta = DocumentFile.fromTreeUri(getContext(), Uri.parse(uri));
        if (carpeta == null || !carpeta.isDirectory()) {
            call.reject("La carpeta TOES ya no existe", SIN_PERMISO);
            return null;
        }
        return carpeta;
    }

    /**
     * Devuelve `pedida` si todavia tenemos permiso de lectura sobre ella; si no,
     * el primer permiso persistido que haya.
     *
     * Ese respaldo importa: si se limpian los datos del WebView se pierde el URI
     * guardado en IndexedDB, pero el permiso de Android sigue concedido. Sin
     * esto le pediriamos la carpeta al lector teniendola ya.
     */
    private String buscarPermiso(String pedida) {
        ContentResolver cr = getContext().getContentResolver();
        String respaldo = null;
        for (UriPermission p : cr.getPersistedUriPermissions()) {
            if (!p.isReadPermission()) continue;
            String uri = p.getUri().toString();
            if (pedida != null && uri.equals(pedida)) return uri;
            if (respaldo == null) respaldo = uri;
        }
        return respaldo;
    }

    /** Ultimo segmento del tree URI, para mostrarle al lector que eligio. */
    private String nombreDe(Uri arbol) {
        String id = DocumentsContract.getTreeDocumentId(arbol);
        if (id == null) return "";
        int corte = id.lastIndexOf(':');
        String ruta = corte >= 0 ? id.substring(corte + 1) : id;
        int barra = ruta.lastIndexOf('/');
        return barra >= 0 ? ruta.substring(barra + 1) : ruta;
    }
}
