# Drayton Wiser Heating

Steuere deine Drayton-Wiser-Heizung aus Gladys: Räume, Warmwasser, smarte
Steckdosen, Heizkörperthermostate und Raumthermostate. Die Integration spricht
**direkt in deinem lokalen Netzwerk mit deinem Wiser HeatHub**: kein
Wiser-Cloud-Konto, nichts geht ins Internet, und sie funktioniert auch, wenn
deine Internetverbindung ausfällt.

## Was du bekommst

Nach der Konfiguration listet der Reiter **Erkennung**:

- **Wiser HeatHub** — Abwesenheitsmodus, Eco-Modus und ob der Heizkessel heizt.
- **Ein Gerät pro Raum** — Temperatur, Luftfeuchtigkeit (wenn ein Raumthermostat
  den Raum bedient), Solltemperatur, Modus (**Aus**, **Manuell**,
  **Zeitplan**), Heizzustand, **Boost** und Fenster (wenn ein
  Heizkörperthermostat es erkennt).
- **Warmwasser** (wenn der Hub einen Speicher steuert) — Modus (**Aus**,
  **An**, **Zeitplan**), Heizzustand und **Boost**.
- **Smarte Steckdosen** — an/aus, Leistung (W) und Energie (kWh).
- **Heizkörperthermostate** und **Raumthermostate** — Batterie, Funksignal und
  bei einem Heizkörperthermostat die Temperatur am Heizkörper.

So verhalten sich die Bedienelemente, wie in der Wiser-App:

- eine **Solltemperatur**, die gesetzt wird, während der Raum seinem Zeitplan
  folgt, gilt bis zum nächsten Abschnitt des Zeitplans; im manuellen Modus
  bleibt sie;
- **Boost** fügt der aktuellen Temperatur eine Zeit lang (standardmäßig 1
  Stunde) einige Grad hinzu (standardmäßig 2 °C);
- der **Abwesenheitsmodus** senkt alle Räume auf die in der Wiser-App
  eingestellte Abwesenheitstemperatur.

## Bevor du beginnst

Diese Integration erfordert **Gladys 5.3.0 oder neuer**: Der Store bietet sie
einer älteren Instanz nicht an.

Du brauchst zwei Dinge: die **Adresse** des Hubs und sein **Secret**.

### 1. Die Adresse des Hubs

Suche den HeatHub in deinem Router (sein Name beginnt mit `WiserHeat`) und
notiere seine IP-Adresse. Gib ihm eine **feste Adresse** (DHCP-Reservierung),
damit sie sich nicht ändert.

### 2. Das Secret des Hubs

Das Secret ist ein langer Schlüssel, den der Hub nur im Setup-Modus anzeigt.
Der Hub hört dabei nicht auf zu arbeiten: Deine Heizung läuft während dieser
Schritte weiter.

1. Drücke einmal die **Setup-Taste** des Hubs (je nach Modell hinten oder
   seitlich). Seine Leuchte beginnt zu blinken.
2. Verbinde dich mit einem Telefon oder Computer mit dem WLAN namens
   **WiserHeatXXXXXX**, das der Hub öffnet.
3. Öffne <http://192.168.8.1/secret> in einem Browser: Kopiere den angezeigten
   langen Text (er endet oft mit `==`).
4. Drücke die Setup-Taste erneut (oder warte ein paar Minuten), damit der Hub
   den Setup-Modus verlässt, und verbinde dein Gerät wieder mit deinem WLAN.

Das Secret bleibt danach gleich; du musst es nur erneut auslesen, wenn du den
Hub zurücksetzt.

## Konfiguration

1. Öffne den Reiter **Konfiguration** der Integration.
2. Trage **Adresse des HeatHub** und **Secret des HeatHub** ein.
3. Lass **Verbindung** auf **Automatisch**: Neuere Hubs der 2. Generation
   antworten nur über HTTPS, die Integration erkennt das selbst.
4. Ändere bei Bedarf das **Aktualisierungsintervall** (standardmäßig 60
   Sekunden: ein Lesevorgang umfasst alle Räume und Geräte), den **Boost**
   (Grad und Dauer) und die Dauer des **Warmwasser-Boosts**.
5. Speichere und klicke dann auf **Verbindung testen**: Die Antwort zeigt die
   Firmware des Hubs und die Anzahl der Räume und Geräte.
6. Öffne den Reiter **Erkennung** und füge die gewünschten Geräte hinzu.

## Aktionen

- **Verbindung testen** — liest den Hub sofort und sagt, was er bereitstellt,
  oder was zu korrigieren ist (falsche Adresse, abgelehntes Secret…).
- **Gerät identifizieren** — wähle ein Gerät: Seine LEDs blinken. Wähle einen
  Raum, und alle Heizkörperthermostate und das Thermostat des Raums blinken.

## Szenen

Die Integration fügt dem Szeneneditor (Gladys 5.1 oder neuer) eigene Karten in
der Kategorie **Integrationen** hinzu.

Auslöser:

- **Fenster geöffnet oder geschlossen** — ein Heizkörperthermostat hat ein
  offenes Fenster (plötzlicher Temperaturabfall) oder sein Schließen erkannt.
  Variablen: `room`, `state` (`open` / `closed`).
- **Abwesenheitsmodus geändert** — der Abwesenheitsmodus wurde **außerhalb von
  Gladys** ein- oder ausgeschaltet (Wiser-App, Hub-Taste). Variable: `state`
  (`on` / `off`).
- **Batterie schwach** — ein Heizkörperthermostat oder Thermostat braucht bald
  neue Batterien. Variablen: `device_name`, `room`, `level`, `battery` (%).
- **Verbindung zum HeatHub verloren oder wiederhergestellt** — der Hub antwortet
  nicht mehr (Stromausfall, WLAN, falsches Secret) oder wieder. Variablen:
  `state` (`lost` / `restored`), `reason`.

Aktionen (jede liefert ein Ergebnis, das die folgenden Aktionen prüfen können):

- **Raum boosten** — Grad und Dauer; lass den Raum leer, um alle Räume zu
  boosten.
- **Raumtemperatur einstellen** — eine Dauer von 0 gilt bis zum nächsten
  Abschnitt des Zeitplans.
- **Zurück zum Zeitplan** — hebt Boosts und vorübergehende Temperaturen eines
  Raums oder aller Räume auf.
- **Abwesenheitsmodus einstellen** — an oder aus.
- **Warmwasser boosten** — für eine Anzahl von Minuten.

## Dashboard

- **Wiser-Heizung** — alle Räume auf einen Blick (Temperatur, Sollwert, Modus
  und ein Abzeichen: heizt, Boost, Fenster offen, aus), die Verbindung zum Hub,
  Abwesenheits- und Eco-Modus, der Heizkessel, Warmwasser und Batterien.
  Tasten: Abwesenheitsmodus, zurück zum Zeitplan, Warmwasser-Boost.
- **Wiser-Raum** — wähle in den Widget-Einstellungen einen Raum: Temperatur,
  Sollwert und Luftfeuchtigkeit live, Modus, Heizen, Boost und Fenster. Tasten:
  **Boost** (fragt Grad und Dauer ab), **Übersteuerung weg**, **Zeitplan
  folgen**.

## Fehlerbehebung

- **„Der HeatHub hat das Secret abgelehnt“** — lies das Secret erneut aus
  (siehe oben); es ändert sich, wenn der Hub zurückgesetzt wird.
- **„Der HeatHub antwortet nicht“** — prüfe die Adresse (sie kann sich ohne
  DHCP-Reservierung geändert haben) und ob der Hub Strom hat. Die Integration
  meldet den Hub erst nach zwei fehlgeschlagenen Lesevorgängen in Folge als
  verloren, nicht bei der ersten langsamen Antwort.
- **Keine Luftfeuchtigkeit oder kein Fenster** — sie gibt es nur, wenn der Raum
  ein Raumthermostat (Luftfeuchtigkeit) oder Heizkörperthermostate (Fenster)
  hat.
- Heizungsaktoren, Fußbodenheizungsregler, Lampen und Rollläden der
  Wiser-Reihe werden noch nicht unterstützt.
- Detaillierte Logs: Sieh dir die Logs der Integration in Gladys an (oder
  `docker logs` auf dem Host).
