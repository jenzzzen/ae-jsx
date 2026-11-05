# ae-jsx — After-Effects-Skriptbibliothek

Sammlung eigener ExtendScript-Skripte (`.jsx`) für Adobe After Effects plus eine
statische Landingpage, die sie zum Download anbietet.

- Live: https://jenzzzen.github.io/ae-jsx/
- Repo: https://github.com/jenzzzen/ae-jsx (Branch `main`, GitHub Pages aus dem Root)
- Sprache von Doku, UI-Texten und Kommentaren: **Deutsch**

## Aufbau

```
Scripte_After_Effects/          ← Arbeitsordner des Nutzers, KEIN Repo
├─ *.jsx                        ORIGINALE – hier legt der Nutzer neue Skripte ab
│                               und bearbeitet sie. Quelle der Wahrheit.
├─ Script_BackUps/              alte Stände – nicht anfassen, nie veröffentlichen
├─ Automatisierung_Midterms/    Arbeitsprojekt – NIEMALS veröffentlichen
└─ Landing_Page/                ← Projekt-Root + Git-Repo (jenzzzen/ae-jsx)
   ├─ index.html                Landingpage – eine Datei, CSS inline, kein JS
   ├─ skripte/*.jsx             veröffentlichte KOPIEN der Originale (Download-Ziel)
   ├─ tools/sync.ps1            Kopien mit Originalen abgleichen
   ├─ tools/check.ps1           Konsistenzprüfung
   └─ docs/                     interne Doku (PDF) – nicht im Repo
```

Skripte nie in `skripte/` bearbeiten, immer das Original eine Ebene höher – sonst
überschreibt der nächste Sync die Änderung. Nicht jedes Original ist veröffentlicht:
Veröffentlicht ist, was in `skripte/` liegt; eine Karte hat, was `index.html` verlinkt.
Stand: GridBuilder, PoBaChart, MOGRT_Batch_Import liegen in `skripte/`, aber ohne Karte.

## „Aktualisieren“

Wenn der Nutzer sagt, er habe Skripte reingezogen/geändert und es soll
aktualisiert werden:

1. `powershell -ExecutionPolicy Bypass -File tools/sync.ps1` – zeigt GEAENDERT /
   NEU / FEHLT.
2. **GEAENDERT:** `tools/sync.ps1 -Apply`. Kopfkommentar des Originals mit der
   Karte vergleichen (Version, Regler, Beschreibung) und die Karte nachziehen.
3. **NEU:** Nie automatisch veröffentlichen. Pro neuem Skript nachfragen, ob es
   öffentlich werden soll (Arbeits-/Kundenbezug?). Bei Ja: `tools/sync.ps1 -Add
   Name.jsx` und Karte über den Skill `/skript-veroeffentlichen` anlegen.
4. **FEHLT:** nachfragen, ob das Skript von der Seite entfernt werden soll.
5. `tools/check.ps1`, Änderungen zusammenfassen, committen, vor dem Push fragen.

## Konventionen für die Skripte

Diese Regeln stecken in allen bestehenden Skripten – neue Skripte und Änderungen
müssen sie einhalten:

- **Nur Bordmittel.** Keine Fremd-Plugins, keine externen Bibliotheken.
- **matchName statt Anzeigename.** Effekte/Eigenschaften immer über
  `"ADBE ..."`-matchNames ansprechen, nie über lokalisierte Namen – die Skripte
  laufen in der deutschen AE-Version. Gleiches gilt in Expressions.
- **Nur ASCII im Quelltext.** Umlaute als ae/oe/ue/ss schreiben (auch in
  Kommentaren). ExtendScript liest Dateien je nach System nicht als UTF-8.
  Sichtbare Umlaute in UI-Strings nur als `\u00e4` usw.
- **ES3.** ExtendScript kennt kein `let`/`const`, keine Arrow-Functions, keine
  Template-Strings, kein `Array.prototype.forEach/map`, kein `JSON` ohne Polyfill.
- **Gerüst:** alles in einer IIFE `(function Name(thisObj){ ... })(this);`,
  UI per ScriptUI, andockbar (`thisObj instanceof Panel`), jede Änderung am
  Projekt in `app.beginUndoGroup()` / `app.endUndoGroup()`.
- **Kopfkommentar** im `/*** ... ***/`-Block: Name, Version, Zweck, Regler,
  Besonderheiten. Bei Versionssprüngen einen „NEU in vX“-Abschnitt pflegen.
- **Selbstdiagnose:** Fehler abfangen und verständlich melden statt still
  abzubrechen.
- Regler für den Nutzer starten konservativ (z. B. Bewegung = 0, Färbung aus).
- Zeilenenden LF, kein BOM (siehe `.gitattributes`/`.editorconfig`).

Testen kann nur der Nutzer in After Effects. Nach Änderungen an einem Skript klar
sagen, was in AE zu prüfen ist (welche Komp-Situation, welche Regler).

## Konventionen für die Landingpage

- Eine Karte pro veröffentlichtem Skript: `<details class="card" style="--tab:var(--c-...)">`
  mit Titel, Kurzbeschreibung, Status, Langtext, Regler-Chips und Download-Button.
- Jede Karte bekommt eine eigene Farbvariable `--c-<name>` in `:root`.
- Die Überschrift „Skripte — N“ muss zur Anzahl der Karten passen.
- Stil: dunkel, `Inter` + `JetBrains Mono`, sachlicher deutscher Ton.

Für „neues Skript auf die Seite bringen“ gibt es den Skill
`/skript-veroeffentlichen`.

## Prüfen & Veröffentlichen

```powershell
powershell -ExecutionPolicy Bypass -File tools/check.ps1
```

prüft: alle verlinkten `.jsx` existieren in `skripte/`, Kartenzahl = Überschrift,
ASCII-only, Kopien = Originale, keine verbotenen Pfade im Git-Index. Danach committen und auf `main` pushen –
GitHub Pages deployt automatisch (dauert ~1 Minute).

## Umgebung

- Windows, PowerShell 5.1 (kein `&&`). Projekt liegt in OneDrive.
- Git muss installiert sein (`winget install Git.Git`).
