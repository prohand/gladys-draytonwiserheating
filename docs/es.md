# Drayton Wiser Heating

Controle su calefacción Drayton Wiser desde Gladys: habitaciones, agua
caliente, enchufes inteligentes, cabezales termostáticos y termostatos de
ambiente. La integración se comunica **directamente con su HeatHub Wiser en su
red local**: sin cuenta en la nube de Wiser, nada sale a internet, y sigue
funcionando cuando su conexión a internet se corta.

## Lo que obtiene

Tras la configuración, la pestaña **Descubrimiento** muestra:

- **Wiser HeatHub** — modo ausente, modo eco y si la caldera está calentando.
- **Un dispositivo por habitación** — temperatura, humedad (si un termostato
  de ambiente da servicio a la habitación), consigna, modo (**Apagado**,
  **Manual**, **Programa**), estado de calefacción, **Boost** y ventana (si un
  cabezal termostático la detecta).
- **Agua caliente** (si el hub controla un acumulador) — modo (**Apagado**,
  **Encendido**, **Programa**), estado de calentamiento y **Boost**.
- **Enchufes inteligentes** — encendido/apagado, potencia (W) y energía (kWh).
- **Cabezales termostáticos** y **termostatos de ambiente** — pilas, señal de
  radio y, para un cabezal, la temperatura junto al radiador.

Cómo se comportan los controles, como en la app Wiser:

- una **consigna** fijada mientras la habitación sigue su programa dura hasta
  el siguiente tramo del programa; en modo Manual, se mantiene;
- el **Boost** añade unos grados (2 °C por defecto) a la temperatura actual
  durante un tiempo (1 hora por defecto);
- el **modo ausente** baja todas las habitaciones a la temperatura de ausencia
  fijada en la app Wiser.

## Antes de empezar

Necesita dos cosas: la **dirección** del hub y su **secreto**.

### 1. La dirección del hub

Busque el HeatHub en su router (su nombre empieza por `WiserHeat`) y anote su
dirección IP. Asígnele una **dirección fija** (reserva DHCP) para que no
cambie.

### 2. El secreto del hub

El secreto es una clave larga que el hub solo muestra en modo configuración.
El hub no deja de funcionar: su calefacción sigue en marcha durante estos
pasos.

1. Pulse una vez el **botón de configuración** del hub (detrás o en el lateral,
   según el modelo). Su luz empieza a parpadear.
2. Con un teléfono o un ordenador, conéctese a la red Wi-Fi llamada
   **WiserHeatXXXXXX** que abre el hub.
3. Abra <http://192.168.8.1/secret> en un navegador: copie el texto largo que
   aparece (suele terminar en `==`).
4. Pulse de nuevo el botón de configuración (o espere unos minutos) para que el
   hub salga del modo configuración, y vuelva a conectar su dispositivo a su
   Wi-Fi.

El secreto ya no cambia después; solo tiene que volver a leerlo si
reinicializa el hub.

## Configuración

1. Abra la pestaña **Configuración** de la integración.
2. Rellene **Dirección del HeatHub** y **Secreto del HeatHub**.
3. Deje **Conexión** en **Automático**: los hubs recientes de 2.ª generación
   solo responden en HTTPS, la integración lo detecta sola.
4. Si lo desea, cambie el **intervalo de actualización** (60 segundos por
   defecto: una lectura cubre todas las habitaciones y dispositivos), el
   **boost** (grados y duración) y la duración del **boost de agua caliente**.
5. Guarde y pulse **Probar la conexión**: la respuesta indica el firmware del
   hub y el número de habitaciones y dispositivos.
6. Abra la pestaña **Descubrimiento** y añada los dispositivos que quiera.

## Acciones

- **Probar la conexión** — lee el hub ahora y dice lo que ofrece, o qué hay que
  corregir (dirección incorrecta, secreto rechazado…).
- **Identificar un dispositivo** — elija un dispositivo: sus LED parpadean.
  Elija una habitación y parpadean todos sus cabezales y su termostato.

## Escenas

La integración añade sus propias tarjetas al editor de escenas (Gladys 5.1 o
posterior), en la categoría **Integraciones**.

Disparadores:

- **Ventana abierta o cerrada** — un cabezal termostático detectó una ventana
  abierta (caída brusca de temperatura) o su cierre. Variables: `room`,
  `state` (`open` / `closed`).
- **Modo ausente cambiado** — el modo ausente se activó o desactivó **fuera de
  Gladys** (app Wiser, botón del hub). Variable: `state` (`on` / `off`).
- **Pilas bajas** — un cabezal o un termostato necesitará pilas nuevas pronto.
  Variables: `device_name`, `room`, `level`, `battery` (%).
- **Conexión con el HeatHub perdida o restablecida** — el hub dejó de responder
  (corte de luz, Wi-Fi, secreto incorrecto) o vuelve a responder. Variables:
  `state` (`lost` / `restored`), `reason`.

Acciones (cada una devuelve un resultado que las acciones siguientes pueden
comprobar):

- **Boost de una habitación** — grados y duración; deje la habitación vacía
  para aplicar el boost a todas.
- **Ajustar la temperatura de una habitación** — una duración de 0 dura hasta
  el siguiente tramo del programa.
- **Volver a la programación** — anula los boosts y consignas temporales de una
  habitación, o de todas.
- **Ajustar el modo ausente** — activado o desactivado.
- **Boost de agua caliente** — durante un número de minutos.

## Panel

- **Calefacción Wiser** — todas las habitaciones de un vistazo (temperatura,
  consigna, modo y una etiqueta: calentando, boost, ventana abierta, apagado),
  la conexión con el hub, los modos ausente y eco, la caldera, el agua caliente
  y las pilas. Botones: modo ausente, volver al programa, boost de agua
  caliente.
- **Habitación Wiser** — elija una habitación en los ajustes del widget:
  temperatura, consigna y humedad en directo, modo, calefacción, boost y
  ventana. Botones: **Boost** (pide los grados y la duración), **Anular
  cambio**, **Seguir programa**.

## Solución de problemas

- **«El HeatHub rechazó el secreto»** — vuelva a leer el secreto (ver arriba);
  cambia cuando se reinicializa el hub.
- **«El HeatHub no responde»** — compruebe la dirección (puede haber cambiado
  sin reserva DHCP) y que el hub esté alimentado. La integración da el hub por
  perdido tras dos lecturas fallidas seguidas, no en la primera respuesta
  lenta.
- **Sin humedad o sin ventana** — solo existen si la habitación tiene un
  termostato de ambiente (humedad) o cabezales termostáticos (ventana).
- Los actuadores de calefacción, controladores de suelo radiante, luces y
  persianas de la gama Wiser aún no son compatibles.
- Registros detallados: consulte los registros de la integración desde Gladys
  (o `docker logs` en el host).
