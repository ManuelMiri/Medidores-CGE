package cl.mla.maule;

import android.os.Bundle;
import cl.mla.maule.toes.ToesPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // El plugin de TOES vive en esta app, no en un paquete npm, asi que se
        // registra a mano. Tiene que ir ANTES de super.onCreate: ahi es donde
        // el Bridge arma la lista de plugins que expone al WebView.
        //
        // "cap sync" no reescribe este archivo (solo toca assets/public y los
        // capacitor.*.json generados), asi que el registro sobrevive a los
        // builds.
        registerPlugin(ToesPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
