---
name: skript-veroeffentlichen
description: Ein After-Effects-Skript (.jsx) auf der Landingpage veroeffentlichen oder seine Karte aktualisieren. Nutzen, wenn ein Skript neu auf die Seite soll, eine Karte nach einer Skript-Aenderung angepasst werden muss oder "auf die Seite bringen / veroeffentlichen" gesagt wird.
---

# Skript veröffentlichen

Argument: Dateiname des Skripts (z. B. `GridBuilder.jsx`). Fehlt es, nachfragen.

0. **Kopie aktualisieren:** Das Original liegt eine Ebene höher
   (`../<Datei>.jsx`). `tools/sync.ps1 -Add <Datei>.jsx` (neu) bzw.
   `tools/sync.ps1 -Apply` (geändert) ausführen. Konventionsverstöße immer im
   Original beheben, nie in `skripte/`.
1. **Skript lesen** – vor allem den Kopfkommentar und die UI-Definition
   (Regler-Namen exakt so übernehmen, wie sie in AE erscheinen).
2. **Konventionen prüfen** (siehe CLAUDE.md): ASCII-only, matchNames, Undo-Gruppe,
   ES3. Verstöße melden und vor der Veröffentlichung beheben – nicht stillschweigend.
3. **Karte in `index.html` anlegen oder aktualisieren**, Aufbau exakt wie die
   bestehenden Karten:
   - neue Farbvariable `--c-<kurzname>` in `:root`, gedeckter Ton, der sich von den
     vorhandenen Farben unterscheidet
   - `h3` = Dateiname, `.desc` = ein Satz, `.status` = kurzes Etikett
     (z. B. Panel, Ein-Klick, Versionsnummer)
   - Langtext 2–4 Sätze: Was baut das Skript, wie funktioniert es, was ist das
     Besondere. Sachlich, deutsch, echte Umlaute (die HTML-Datei ist UTF-8).
   - Chips mit den Reglern bzw. dem Aufbau
   - Download-Button `href="skripte/<Datei>.jsx" download`
   Bei Updates: Versionsnummer/Status und geänderte Regler nachziehen.
4. **Zähler** „Skripte — N“ anpassen.
5. `powershell -ExecutionPolicy Bypass -File tools/check.ps1` ausführen – muss mit
   0 Fehlern enden.
6. Änderung zusammenfassen und anbieten zu committen (`Skript <Name> veröffentlicht`)
   und zu pushen. Nicht ohne Zustimmung pushen – Push = sofort öffentlich.
