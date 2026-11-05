/**
 * MOGRT Batch Import
 * ---------------------------------------------------------------
 * Importiert beliebig viele .mogrt-Dateien in das aktive
 * AE-Projekt.
 *
 * Funktionsweise:
 *   .mogrt  ist ein ZIP  ->  enthaelt .aegraphic
 *   .aegraphic ist ein ZIP  ->  enthaelt .aep + gesammelte Assets
 *   die .aep wird per app.project.importFile() eingelesen
 *
 * Entpackt wird ueber die Kommandozeile (PowerShell unter Windows,
 * unzip unter macOS), da ExtendScript kein ZIP kann.
 *
 * Premiere-native .mogrt enthalten keine .aegraphic und werden
 * uebersprungen.
 *
 * Ablage: .../Support Files/Scripts/ScriptUI Panels/
 * ---------------------------------------------------------------
 */

(function (thisObj) {

    var SCRIPT_NAME  = "MOGRT Batch Import";
    var SETTINGS_SEC = "MogrtBatchImport";

    // ============================================================
    // Basis-Helfer
    // ============================================================

    function errStr(e) {
        if (!e) return "Unbekannter Fehler";
        var s = "";
        try { s = e.toString(); } catch (ignore) { s = "Fehler"; }
        try { if (e.line) s += "  (Zeile " + e.line + ")"; } catch (ignore) {}
        return s;
    }

    function pad(n) { return (n < 10 ? "0" : "") + n; }

    function timestamp() {
        var d = new Date();
        return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
    }

    function isWin() {
        return ($.os.toLowerCase().indexOf("windows") !== -1);
    }

    function getSetting(key, fallback) {
        try {
            if (app.settings.haveSetting(SETTINGS_SEC, key)) {
                return app.settings.getSetting(SETTINGS_SEC, key);
            }
        } catch (ignore) {}
        return fallback;
    }

    function putSetting(key, value) {
        try { app.settings.saveSetting(SETTINGS_SEC, key, String(value)); } catch (ignore) {}
    }

    /** Dateinamen ohne Endung, bereinigt fuer Projektordner-Namen. */
    function baseName(file) {
        var n = decodeURI(file.name).replace(/\.[^.]+$/, "");
        return n.replace(/[\\\/:\*\?"<>\|]/g, "_");
    }

    /** Ordner sicher anlegen (inkl. Elternebenen). */
    function ensureDiskFolder(path) {
        var f = new Folder(path);
        if (!f.exists) f.create();
        return f;
    }

    /** Rekursiv nach Dateien mit passender Endung suchen. */
    function findByExt(folder, extRegex, depth) {
        var out = [];
        if (depth === undefined) depth = 0;
        if (depth > 6 || !folder.exists) return out;
        var items = folder.getFiles();
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (it instanceof Folder) {
                out = out.concat(findByExt(it, extRegex, depth + 1));
            } else if (extRegex.test(it.name)) {
                out.push(it);
            }
        }
        return out;
    }

    // ============================================================
    // Entpacken
    // ============================================================

    /** Einfachanfuehrungszeichen fuer PowerShell maskieren. */
    function psQuote(p) {
        return "'" + String(p).replace(/'/g, "''") + "'";
    }

    /**
     * ZIP-Archiv entpacken, unabhaengig von der Dateiendung.
     * Rueckgabe: true bei Erfolg (Zielordner nicht leer).
     */
    function unzip(srcPath, dstPath) {
        ensureDiskFolder(dstPath);
        var cmd;

        if (isWin()) {
            // ZipFile::ExtractToDirectory ignoriert die Endung,
            // im Gegensatz zu Expand-Archive.
            cmd = 'cmd.exe /c powershell -NoProfile -ExecutionPolicy Bypass -Command ' +
                  '"Add-Type -AssemblyName System.IO.Compression.FileSystem; ' +
                  '[System.IO.Compression.ZipFile]::ExtractToDirectory(' +
                  psQuote(srcPath) + ',' + psQuote(dstPath) + ')"';
        } else {
            cmd = 'unzip -o "' + srcPath + '" -d "' + dstPath + '"';
        }

        try { system.callSystem(cmd); } catch (ignore) {}

        var check = new Folder(dstPath);
        try {
            return check.exists && check.getFiles().length > 0;
        } catch (ignore) {
            return false;
        }
    }

    // ============================================================
    // Import einer einzelnen Vorlage
    // ============================================================

    /**
     * Rueckgabe: { ok:Boolean, msg:String, folderItem:FolderItem|null }
     */
    function importMogrt(file, workRoot) {
        var name = baseName(file);
        var stage = workRoot + "/" + name;

        // Alten Extraktionsstand wegraeumen, sonst wirft
        // ExtractToDirectory einen Fehler wegen vorhandener Dateien.
        var old = new Folder(stage);
        if (old.exists) {
            stage = workRoot + "/" + name + "_" + (new Date()).getTime();
        }
        ensureDiskFolder(stage);

        // Stufe 1: .mogrt aufmachen
        if (!unzip(file.fsName, stage)) {
            return { ok: false, msg: name + " -> Archiv liess sich nicht entpacken", folderItem: null };
        }

        // Stufe 2: .aegraphic suchen und aufmachen
        var graphics = findByExt(new Folder(stage), /\.aegraphic$/i);
        if (!graphics.length) {
            return { ok: false, msg: name + " -> keine .aegraphic enthalten (Premiere-nativ)", folderItem: null };
        }

        var inner = stage + "/_aep";
        if (!unzip(graphics[0].fsName, inner)) {
            return { ok: false, msg: name + " -> .aegraphic liess sich nicht entpacken", folderItem: null };
        }

        // Stufe 3: .aep finden
        var aeps = findByExt(new Folder(inner), /\.aep$/i);
        if (!aeps.length) {
            return { ok: false, msg: name + " -> keine .aep gefunden", folderItem: null };
        }

        // Stufe 4: importieren
        var imported = null;
        try {
            var opts = new ImportOptions(aeps[0]);
            imported = app.project.importFile(opts);
        } catch (e) {
            return { ok: false, msg: name + " -> Import fehlgeschlagen: " + errStr(e), folderItem: null };
        }

        try { if (imported) imported.name = name; } catch (ignore) {}

        return { ok: true, msg: name + " -> importiert", folderItem: imported };
    }

    /**
     * Top-Level-Kompositionen eines importierten Ordners finden:
     * Comps, die von keiner anderen Comp verwendet werden.
     */
    function topLevelComps(folderItem) {
        var out = [];
        if (!folderItem) return out;

        function walk(fld, depth) {
            if (depth > 6) return;
            for (var i = 1; i <= fld.numItems; i++) {
                var it = fld.item(i);
                if (it instanceof FolderItem) {
                    walk(it, depth + 1);
                } else if (it instanceof CompItem) {
                    var used = [];
                    try { used = it.usedIn; } catch (ignore) {}
                    if (!used || used.length === 0) out.push(it);
                }
            }
        }
        walk(folderItem, 0);
        return out;
    }

    /**
     * Format, Bildrate, Pixel-Seitenverhaeltnis und Gesamtlaenge
     * aus den importierten Kompositionen ableiten.
     *
     * Groesse: groesstes vorkommendes Format, damit nichts beschnitten wird.
     * Bildrate: die haeufigste; bei Gleichstand die hoechste.
     * Laenge: Summe aller Einzellaengen.
     */
    function deriveSpec(comps) {
        var width = 0, height = 0, par = 1.0, total = 0;
        var fpsCount = {}, sizes = {};

        for (var i = 0; i < comps.length; i++) {
            var c = comps[i];
            var cw = 0, ch = 0, cf = 0, cd = 0, cp = 1.0;
            try { cw = c.width; ch = c.height; } catch (ignore) {}
            try { cf = c.frameRate; } catch (ignore) {}
            try { cd = c.duration; } catch (ignore) {}
            try { cp = c.pixelAspect; } catch (ignore) {}

            if (cw > 0 && ch > 0) {
                sizes[cw + "x" + ch] = true;
                if (cw * ch > width * height) {
                    width = cw; height = ch; par = cp;
                }
            }
            if (cf > 0) {
                var key = cf.toFixed(3);
                fpsCount[key] = (fpsCount[key] || 0) + 1;
            }
            if (cd > 0) total += cd;
        }

        // Haeufigste Bildrate bestimmen
        var fps = 0, best = -1, distinct = 0;
        for (var k in fpsCount) {
            if (!fpsCount.hasOwnProperty(k)) continue;
            distinct++;
            var v = parseFloat(k);
            if (fpsCount[k] > best || (fpsCount[k] === best && v > fps)) {
                best = fpsCount[k];
                fps = v;
            }
        }

        var sizeCount = 0;
        for (var s in sizes) { if (sizes.hasOwnProperty(s)) sizeCount++; }

        return {
            width:  width  > 0 ? width  : 1920,
            height: height > 0 ? height : 1080,
            par:    par    > 0 ? par    : 1.0,
            fps:    fps    > 0 ? fps    : 25,
            total:  total  > 0 ? total  : 10,
            mixedSize: (sizeCount > 1),
            mixedFps:  (distinct > 1)
        };
    }

    // ============================================================
    // Oberflaeche
    // ============================================================

    function buildUI(parent) {
        var pal = (parent instanceof Panel)
            ? parent
            : new Window("palette", SCRIPT_NAME, undefined, { resizeable: true });
        if (pal === null) return null;

        pal.orientation = "column";
        pal.alignChildren = ["fill", "top"];
        pal.spacing = 8;
        pal.margins = 12;

        var selected = [];                              // Array of File
        var workRoot = getSetting("workRoot", "");      // Entpack-Ziel

        // --- Auswahl ---
        var pnlPick = pal.add("panel", undefined, "Vorlagen");
        pnlPick.orientation = "column";
        pnlPick.alignChildren = ["fill", "top"];
        pnlPick.margins = 10;
        pnlPick.spacing = 6;

        var rowPick = pnlPick.add("group");
        rowPick.alignChildren = ["fill", "center"];
        var btnFiles = rowPick.add("button", undefined, "Dateien waehlen…");
        var btnFolder = rowPick.add("button", undefined, "Ganzen Ordner…");
        var btnClearSel = rowPick.add("button", undefined, "Leeren");
        btnClearSel.preferredSize.width = 60;

        var lstFiles = pnlPick.add("listbox", undefined, [], { multiselect: false });
        lstFiles.preferredSize.height = 120;

        var lblCount = pnlPick.add("statictext", undefined, "0 Dateien ausgewaehlt");

        // --- Ziel ---
        var pnlOpt = pal.add("panel", undefined, "Optionen");
        pnlOpt.orientation = "column";
        pnlOpt.alignChildren = ["fill", "top"];
        pnlOpt.margins = 10;
        pnlOpt.spacing = 6;

        var rowWork = pnlOpt.add("group");
        rowWork.alignChildren = ["fill", "center"];
        rowWork.add("statictext", undefined, "Entpacken nach:").preferredSize.width = 95;
        var txtWork = rowWork.add("edittext", undefined, workRoot || "(Temp-Ordner)");
        txtWork.enabled = false;
        var btnWork = rowWork.add("button", undefined, "…");
        btnWork.preferredSize.width = 34;

        var chkMaster = pnlOpt.add("checkbox", undefined, "Uebersichtskomposition mit allen Vorlagen anlegen");
        chkMaster.value = (getSetting("buildMaster", "1") === "1");

        var rowMaster = pnlOpt.add("group");
        rowMaster.add("statictext", undefined, "Name:").preferredSize.width = 95;
        var txtMaster = rowMaster.add("edittext", undefined, getSetting("masterName", "MASTER_UEBERSICHT"));
        txtMaster.characters = 20;

        var lblFmt = pnlOpt.add("statictext", undefined,
            "Format, Bildrate und Laenge werden aus den Vorlagen uebernommen.");
        lblFmt.alignment = ["fill", "top"];

        // --- Aktion ---
        var btnRun = pal.add("button", undefined, "Importieren");
        btnRun.preferredSize.height = 30;

        var bar = pal.add("progressbar", undefined, 0, 100);
        bar.preferredSize.height = 6;

        var log = pal.add("edittext", undefined, "", { multiline: true, readonly: true, scrolling: true });
        log.preferredSize.height = 140;
        log.alignment = ["fill", "fill"];

        var rowFoot = pal.add("group");
        var btnClearLog = rowFoot.add("button", undefined, "Log leeren");
        var btnSave = rowFoot.add("button", undefined, "Projekt sichern unter…");

        /** Oberflaeche neu zeichnen - nur das Fenster kennt update(). */
        function refreshUI() {
            try {
                var win = (pal instanceof Window) ? pal : pal.window;
                if (win && win.update) win.update();
            } catch (ignore) {}
        }

        function addLog(msg) {
            log.text = log.text + (log.text ? "\n" : "") + timestamp() + "  " + msg;
            refreshUI();
        }

        function refreshList() {
            lstFiles.removeAll();
            for (var i = 0; i < selected.length; i++) {
                lstFiles.add("item", decodeURI(selected[i].name));
            }
            lblCount.text = selected.length + " Datei(en) ausgewaehlt";
        }

        function addFiles(files) {
            var known = {};
            for (var i = 0; i < selected.length; i++) known[selected[i].fsName] = true;
            for (var j = 0; j < files.length; j++) {
                if (!known[files[j].fsName]) {
                    selected.push(files[j]);
                    known[files[j].fsName] = true;
                }
            }
            refreshList();
        }

        // --- Ereignisse ---
        btnFiles.onClick = function () {
            var filter = isWin() ? "Motion Graphics Templates:*.mogrt,Alle Dateien:*.*" : function (f) {
                return (f instanceof Folder) || /\.mogrt$/i.test(f.name);
            };
            var res = File.openDialog("MOGRT-Dateien waehlen (Mehrfachauswahl moeglich)", filter, true);
            if (!res) return;
            if (!(res instanceof Array)) res = [res];
            addFiles(res);
            addLog(res.length + " Datei(en) hinzugefuegt.");
        };

        btnFolder.onClick = function () {
            var fld = Folder.selectDialog("Ordner mit .mogrt-Dateien waehlen");
            if (!fld) return;
            var found = fld.getFiles(function (f) {
                return (f instanceof File) && /\.mogrt$/i.test(f.name);
            });
            if (!found.length) { addLog("Keine .mogrt in diesem Ordner."); return; }
            found.sort(function (a, b) {
                return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
            });
            addFiles(found);
            addLog(found.length + " Datei(en) aus Ordner uebernommen.");
        };

        btnClearSel.onClick = function () {
            selected = [];
            refreshList();
        };

        btnWork.onClick = function () {
            var fld = Folder.selectDialog("Zielordner fuer entpackte Projekte");
            if (!fld) return;
            workRoot = fld.fsName;
            txtWork.text = workRoot;
            putSetting("workRoot", workRoot);
        };

        btnClearLog.onClick = function () { log.text = ""; };

        btnSave.onClick = function () {
            var f = File.saveDialog("Projekt sichern unter", "After Effects:*.aep");
            if (!f) return;
            if (!/\.aep$/i.test(f.name)) f = new File(f.fsName + ".aep");
            try {
                app.project.save(f);
                addLog("Projekt gesichert: " + f.fsName);
            } catch (e) {
                addLog("FEHLER  " + errStr(e));
            }
        };

        function doImport() {
            addLog("Import gestartet…");

            if (!selected.length) { addLog("Nichts ausgewaehlt."); return; }

            var root = workRoot || (Folder.temp.fsName + "/MOGRT_Extract");
            ensureDiskFolder(root);

            var mName = txtMaster.text || "MASTER_UEBERSICHT";

            putSetting("masterName", mName);
            putSetting("buildMaster", chkMaster.value ? "1" : "0");

            btnRun.enabled = false;
            bar.value = 0;
            bar.maxvalue = selected.length;

            app.beginUndoGroup(SCRIPT_NAME);

            var ok = 0, fail = 0;
            var mainComps = [];

            try {
                for (var i = 0; i < selected.length; i++) {
                    var res;
                    try {
                        res = importMogrt(selected[i], root);
                    } catch (e) {
                        res = { ok: false, msg: decodeURI(selected[i].name) + " -> " + errStr(e), folderItem: null };
                    }

                    if (res.ok) {
                        ok++;
                        var tops = topLevelComps(res.folderItem);
                        for (var t = 0; t < tops.length; t++) mainComps.push(tops[t]);
                    } else {
                        fail++;
                    }
                    addLog((res.ok ? "OK      " : "FEHLER  ") + res.msg);

                    bar.value = i + 1;
                    refreshUI();
                }

                // Uebersichtskomposition
                if (chkMaster.value && mainComps.length) {
                    var spec = deriveSpec(mainComps);

                    var master = app.project.items.addComp(
                        mName, spec.width, spec.height, spec.par,
                        Math.max(spec.total, 1 / spec.fps), spec.fps
                    );
                    master.bgColor = [0.08, 0.08, 0.09];

                    var cursor = 0;
                    for (var m = 0; m < mainComps.length; m++) {
                        var L = master.layers.add(mainComps[m]);
                        L.startTime = cursor;
                        cursor += mainComps[m].duration;
                    }

                    try { master.openInViewer(); } catch (ignore) {}

                    addLog("Uebersicht: " + mainComps.length + " Kompositionen, " +
                           spec.width + "x" + spec.height + " @ " + spec.fps + " fps, " +
                           spec.total.toFixed(2) + " s");
                    if (spec.mixedSize) {
                        addLog("Hinweis: unterschiedliche Bildgroessen - groesstes Format gewaehlt.");
                    }
                    if (spec.mixedFps) {
                        addLog("Hinweis: unterschiedliche Bildraten - haeufigste gewaehlt.");
                    }
                }

            } catch (eAll) {
                addLog("FEHLER  Durchlauf abgebrochen: " + errStr(eAll));
            } finally {
                app.endUndoGroup();
                btnRun.enabled = true;
            }

            addLog("--- " + ok + " importiert, " + fail + " fehlgeschlagen ---");
            addLog("Entpackte Projekte liegen in: " + root);
        }

        btnRun.onClick = function () {
            try {
                doImport();
            } catch (e) {
                try { addLog("FEHLER  " + errStr(e)); } catch (ignore) {}
                alert(SCRIPT_NAME + "\n\n" + errStr(e));
            }
        };

        // --- Start ---
        addLog("Bereit. Dateien oder Ordner waehlen, dann importieren.");
        if (!isWin()) addLog("Hinweis: macOS-Modus, entpackt wird per unzip.");

        pal.layout.layout(true);
        pal.layout.resize();
        pal.onResizing = pal.onResize = function () { this.layout.resize(); };

        return pal;
    }

    var ui = buildUI(thisObj);

    // Referenz global festhalten. Ohne das raeumt der Garbage
    // Collector bei "Skriptdatei ausfuehren" die Event-Handler weg -
    // das Fenster steht dann sichtbar, aber tot da.
    $.global.MOGRT_BATCH_PANEL = ui;

    if (ui instanceof Window) {
        ui.center();
        ui.show();
    }

})(this);
