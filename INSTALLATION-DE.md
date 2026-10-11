# YouTube Live: Broadcast und neuen Stream per Stream Deck erstellen

Entwicklungsfassung **3.2.0-create-broadcast.3**, Stand 10. Oktober 2026.
Die neue Action heißt **Create Broadcast + Stream**. Sie erstellt Broadcast,
RTMP-Stream und einen neuen Key. Standardmäßig bleibt der Broadcast offline und
wird mit den vorhandenen Actions live geschaltet. Seit Version .3 gibt es die
Option **Auto-start when encoder sends video** (standardmäßig aus). Aktivierst
du sie, kann YouTube live schalten, sobald der ATEM mit dem neuen Key sendet.
Dann sind **Start broadcast test** und **Go live** nicht als Startschritte nötig.
Auto-Stop bleibt aus: weiterhin mit **Finish broadcast** beenden.

**Importkorrektur in Version .2:** Das erste Paket (.1) enthielt für den Ordner
`companion` die Rechte `0555`. Unter Linux konnte Companion darin `HELP.md`
nicht anlegen (`EACCES`). Das neue Paket setzt Verzeichnisse auf `0755` und
Dateien auf `0644`; alle Archiveinträge werden beim Paketieren geprüft.
Diese Importkorrektur ist auch im aktuellen Paket enthalten.
Die neue Versionsnummer verwendet einen eigenen Installationsordner; für den
erneuten Versuch muss der fehlgeschlagene `.1`-Ordner nicht manuell bearbeitet werden.

## Installation des fertigen Pakets

1. Verwende **Companion 4.1 oder neuer**. Das Modul verwendet die bereits im
   Upstream eingesetzte Modul-API 1.13 und Companions Node-22-Laufzeit.
2. Sichere deine Companion-Konfiguration vor dem Wechsel der Modulversion.
3. Öffne die Companion-Weboberfläche und den Bereich **Modules**. Wähle
   **Import module package** und importiere
   `youtube-live-3.2.0-create-broadcast.3.tgz`. Das Archiv nicht vorher entpacken.
4. Falls nötig, aktiviere in der Versionsübersicht die Anzeige von
   Vorab-/Beta-Versionen. Wähle für deine YouTube-Verbindung ausdrücklich
   **3.2.0-create-broadcast.3**. Der Paketname bleibt `youtube-live`.
5. Verwende die bestehende YouTube-Verbindung mit ihren OAuth-Zugangsdaten.
   Ein zweiter OAuth-Client ist nicht erforderlich. Für eine neue Verbindung
   beschreibt die Modulhilfe die erstmalige Einrichtung.
6. Warte, bis die Verbindung erfolgreich initialisiert ist. Prüfe, ob in der
   Action-Auswahl **Create Broadcast + Stream** erscheint.
7. Bei einem Rückwechsel wählst du für die Verbindung wieder die vorherige
   Modulversion. Bereits auf YouTube angelegte Ressourcen bleiben bestehen.

Die Beschriftung der Oberfläche kann je nach Companion-Version leicht abweichen.
Der offizielle Importweg ist in der
[Companion-Moduldokumentation](https://companion.free/user-guide/beta/config/modules/)
beschrieben. Die Mindestversion folgt aus der
[Companion-API-Übersicht](https://companion.free/for-developers/module-development/).

## Button zum Erstellen

1. Öffne **Buttons** und wähle eine freie Taste auf einer Seite, die dein
   Stream Deck über Companion anzeigt.
2. Füge unter den Aktionen für **Press** die YouTube-Action
   **Create Broadcast + Stream** hinzu. Nicht zusätzlich unter **Release**.
3. Lasse zum ersten Test die Vorgaben stehen:
   Titel `Neuer Livestream`, Beschreibung leer, Sichtbarkeit **Unlisted**,
   Auflösung **Variable**, Framerate **Variable**.
4. Titel und Beschreibung können Companion-Variablen enthalten. Bei festen
   Videoformaten wähle sowohl eine feste Auflösung als auch 30fps oder 60fps.
5. Beschrifte die Taste beispielsweise mit `YouTube vorbereiten`.
6. Drücke die Taste einmal. Nach erfolgreichem Abschluss stehen die sechs
   Variablen in der YouTube-Verbindung bereit. Kontrolliere in YouTube Studio,
   dass der neue Broadcast vorbereitet ist und noch nicht live sendet.

Während der Erstellung werden weitere Tastendrücke derselben Verbindung ignoriert.
Ein erneuter Tastendruck nach Abschluss erzeugt absichtlich einen weiteren Broadcast.
Die geplante Startzeit liegt fünf Minuten in der Zukunft; es gibt keinen
automatischen Start beim Erreichen dieser Uhrzeit.

## Variablen und Encoder

**Wartet Create auf den neuen Key?** Die Action wartet auf Erstellung und Binding
und meldet anschließend alle sechs Variablen an Companion, bevor ihr Callback
abgeschlossen wird. Das bedeutet nicht, dass nachfolgende Actions auf derselben
Taste automatisch warten: eine normale Liste läuft parallel.

Eine **internal: Action Group** mit Modus **Sequential** wartet grundsätzlich auf
die vorherige Action. Companion dokumentiert aber ein Ausführungszeitlimit von
fünf Sekunden. Bei Timeout oder Fehler können Folgeaktionen trotzdem weiterlaufen;
bei einer fehlgeschlagenen Erstellung bleiben die bisherigen Variablen erhalten.
Ein einfaches „Key ist nicht leer“ prüft daher nicht den Erfolg dieses Versuchs.

Für den sicheren Ablauf entweder einen neuen Broadcast/Key bestätigen und danach
die separate Encoder-Taste drücken, oder einen bewusst freigegebenen Trigger auf
eine Änderung der Broadcast-ID/des Keys verwenden. Einen solchen Trigger nicht
ungeprüft dauerhaft aktivieren: Auch die Wiederherstellung nach einem Neustart
kann eine Variablenänderung auslösen. Siehe die offiziellen Hinweise zu
[Aktionsgruppen](https://companion.free/user-guide/v4.3/config/buttons/creating/actions/)
und zum [Ausführungszeitlimit](https://companion.free/for-developers/module-development/connection-basics/actions/).

In diesen Beispielen heißt die Verbindung `youtube-live`. Ersetze diesen Teil,
falls deine Verbindung anders beschriftet ist.

| Variable                             | Verwendung                               |
| ------------------------------------ | ---------------------------------------- |
| `$(youtube-live:last_broadcast_id)`  | Ziel-ID für vorhandene Broadcast-Actions |
| `$(youtube-live:last_broadcast_url)` | Link zur YouTube-Watch-Seite             |
| `$(youtube-live:last_stream_id)`     | ID des neu erstellten RTMP-Streams       |
| `$(youtube-live:last_stream_key)`    | Geheimer Key für den Encoder             |
| `$(youtube-live:last_rtmp_url)`      | RTMP-Serveradresse für den Encoder       |
| `$(youtube-live:last_stream_title)`  | Titel des erstellten Broadcasts          |

Füge auf einer **separaten Taste** die Konfigurationsaktion deines Encoder-Moduls
hinzu. Falls diese variablefähige Server- und Key-Felder anbietet, setze dort
`$(youtube-live:last_rtmp_url)` und `$(youtube-live:last_stream_key)` ein.
Geräte mit einer kombinierten Zieladresse benötigen gegebenenfalls
`$(youtube-live:last_rtmp_url)/$(youtube-live:last_stream_key)`.

Welche Aktion dafür passt, hängt vom Encoder ab; das YouTube-Modul konfiguriert
kein anderes Gerät selbst. Warte mit der Übertragung, bis die Erstellung
erfolgreich beendet ist. Nach einem Fehler bleiben die Daten des vorherigen
Erfolgs erhalten. Benutze keinen festen Zeitabstand als Erfolgskontrolle.
Stream-Key nicht auf öffentlichen Tasten, Overlays oder Screenshots anzeigen.
Prüfe auch, ob das empfangende Encoder-Modul den Key in seine Logs schreibt.

## Broadcast kontrolliert starten und beenden

Die folgende Anleitung gilt mit **Auto-start ausgeschaltet**. Für Auto-Start:
Broadcast erstellen → neuen Server/Key am ATEM setzen → ATEM-Stream starten.
YouTube übernimmt dann den Live-Start, sobald es Video empfängt. Dies entspricht
der [YouTube-Auto-Start-Einstellung](https://developers.google.com/youtube/v3/live/docs/liveBroadcasts#contentDetails.enableAutoStart).

1. Übertrage Serveradresse und Key an den Encoder und starte dessen RTMP-Ausgabe.
2. Optional: Erstelle eine Taste mit **Start broadcast test**. Aktiviere
   **Specify broadcast ID from text** und trage
   `$(youtube-live:last_broadcast_id)` ein. Kontrolliere das Bild in Studio.
3. Erstelle eine zweite Taste mit **Go live**, derselben Checkbox und derselben
   ID-Variable. Erst dieser Tastendruck schaltet den Broadcast live. Die Action
   durchläuft bei Bedarf zuerst den Testzustand.
4. Erstelle eine Taste mit **Finish broadcast** und derselben ID-Variable.
   Benutze sie zum Beenden des laufenden Broadcasts. Auto-Stop ist deaktiviert;
   nur den Encoder zu stoppen beendet den Broadcast daher nicht automatisch.
5. **Advance broadcast to next phase** funktioniert ebenfalls mit dieser ID.
   Diese Action kann je nach aktuellem Zustand live schalten; nicht auf die
   Vorbereitungstaste legen, wenn diese ausschließlich vorbereiten soll.

## Neustart und Fehler

Das Modul speichert nur die beiden Ressourcen-IDs. Nach einem Neustart holt es
den Key und die übrigen Daten über die vorhandene autorisierte YouTube-Verbindung
neu ab. Ohne Internetzugang, gültige Autorisierung oder vorhandene Ressourcen
bleiben die Variablen nach einem Neustart leer. Nach Behebung des Problems
**Reload everything from YouTube** ausführen. Der Key wird vom Modul weder in
der Konfiguration noch in Logs gespeichert; er ist zur Weitergabe aber als
Companion-Variable verfügbar.

Bei API-Fehlern werden neu angelegte Teilressourcen nach Möglichkeit entfernt.
Scheitert das Löschen des Broadcasts, bleibt ein möglicherweise gebundener Stream
zur manuellen Prüfung erhalten. Logmeldungen nennen nur die Ressourcen-IDs.
Bei verlorenen Antworten oder einem Prozessabbruch können Ressourcen übrigbleiben,
deren ID das Modul nie erhalten hat. Vor einem erneuten Versuch in Studio prüfen.
Quota-Limits, gesperrtes Live-Streaming oder widerrufene OAuth-Einwilligung können
sowohl Erstellung als auch Bereinigung verhindern.

## Was geprüft wurde und was du noch testen musst

**Automatisiert bestanden:** 183 Tests in 10 Dateien, darunter 47 neue Tests zu
Erstellung, Binding, Variablen, Fehlern, Bereinigung, Neustart, Parallelität,
vorhandenen Actions und Cache-Aktualisierung. Zusätzlich bestanden:
TypeScript-Typprüfung, ESLint, Build, Paket-/Manifestprüfung und Start mit
erfolgreicher Registrierung an einer simulierten Companion-Modulschnittstelle.
Die vollständige aktuelle Testsuite bestand unter Node 22.23.3.

**Noch nicht mit einem echten Konto/Companion/Encoder geprüft:** Paketimport in
deine Companion-Installation, OAuth-Erneuerung gegen Google, reale Broadcast-
Erstellung, Key-Übergabe an dein Gerät, Test-/Live-/Finish-Übergänge und
Wiederherstellung nach einem echten Companion-Neustart. Dafür wurden keine
Kanalzugangsdaten verwendet und keine echten Broadcasts angelegt.

Für den ersten Praxistest Auto-Start ausgeschaltet lassen, privat oder unlisted erstellen, den
Offline-Zustand in Studio kontrollieren, den Key am Encoder setzen, Testbild
prüfen, dann bewusst live schalten und anschließend mit **Finish broadcast**
beenden. Erstelle für den Neustarttest einen weiteren vorbereiteten Broadcast,
starte Companion neu und prüfe die Wiederherstellung seiner IDs und Encoder-Daten.

## Aus dem Quellcode bauen

Im Repository auf Branch `codex/create-broadcast-stream`:

```text
corepack yarn install --immutable
corepack yarn check-types
corepack yarn lint
corepack yarn test
corepack yarn build
corepack yarn package:portable
```

Benötigt eine vollständige Node-22-Installation mit npm/npx sowie Yarn 4.14.1.
Das fertige TGZ enthält die Laufzeit-Abhängigkeiten; zur normalen Installation
des Pakets brauchst du diese Entwicklungswerkzeuge nicht.
