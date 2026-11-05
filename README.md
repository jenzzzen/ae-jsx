# ae-jsx

Skripte für Adobe After Effects: Sie reizen native AE-Werkzeuge aus, sind
expression-getrieben und robust gegen die deutsche Lokalisierung. Sie brauchen
keine Fremd-Plugins.

**→ Übersicht & Downloads: https://jenzzzen.github.io/ae-jsx/**

## Installation

1. Gewünschte `.jsx` herunterladen.
2. In After Effects: *Datei → Skripte → Skriptdatei ausführen …*, oder die Datei
   nach `…/Adobe After Effects <Version>/Support Files/Scripts/ScriptUI Panels/`
   kopieren und nach einem Neustart über das Menü *Fenster* als andockbares Panel
   öffnen.
3. Für Skripte, die Dateien schreiben oder lesen: *Einstellungen → Skripterstellung &
   Expressions → „Skripten das Schreiben von Dateien und den Netzwerkzugriff
   erlauben“* aktivieren.

## Skripte

| Skript | Zweck |
|---|---|
| GlowGlow.jsx | Additiver Glow mit mehreren Stufen nach dem Deep-Glow-Prinzip |
| ArrowBuilder.jsx | Parametrische Pfeile als Formebene |
| ChartBuilder.jsx | Diagramme als Formebenen, CSV-Import |
| ChartAnimator.jsx | ChartBuilder mit einem einzigen Master-Animationsregler |
| PrintLook.jsx | Risograph-/Digitaldruck-Look |
| TextBox.jsx | Box hinter Text, wächst live mit |
| CloudGenerator.jsx | Wolken-Generator mit 3D-Volumen |
| TextureLoop.jsx | Randlose Textur-Loops über Motion Tile |

## Entwicklung

Siehe [CLAUDE.md](CLAUDE.md) für Aufbau und Konventionen. Vor jedem Commit:

```powershell
powershell -ExecutionPolicy Bypass -File tools/check.ps1
```
