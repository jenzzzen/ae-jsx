/*  EmojiPaste.jsx - Emojis per Copy & Paste in After Effects
    -------------------------------------------------------------------------
    Emoji(s) ins Feld einfuegen -> "Einfuegen" -> landet farbig in der aktiven Comp.

    Quelle:  Microsoft Fluent Emoji (Segoe-UI-Emoji-Look, MIT-Lizenz)
             https://github.com/microsoft/fluentui-emoji  -> Code -> Download ZIP, entpacken
    Ablauf:  Emoji -> Unicode -> passendes SVG im Fluent-Ordner -> Illustrator
             wandelt einmalig in .ai um (Cache) -> Import in AE, kontinuierlich gerastert.

    Installation:
      Datei nach  .../Adobe After Effects <Version>/Support Files/Scripts/ScriptUI Panels/
      AE neu starten -> Fenster > EmojiPaste.jsx
      Voreinstellungen > Skripterstellung & Ausdruecke >
      "Skripten das Schreiben von Dateien und den Zugriff auf das Netzwerk erlauben" aktivieren.
*/

(function (thisObj) {
    var SCRIPT = "EmojiPaste";
    var CACHE = new Folder(Folder.userData.fsName + "/EmojiPaste");
    if (!CACHE.exists) CACHE.create();
    var INDEX_FILE = new File(CACHE.fsName + "/index_v1.js");
    var STYLES = ["Color", "Flat"];
    var TONE_BY_CP = { "1f3fb": "Light", "1f3fc": "Medium-Light", "1f3fd": "Medium", "1f3fe": "Medium-Dark", "1f3ff": "Dark" };

    var INDEX = null; // { path: String, map: { key: "Folder name[/Tone]" } }

    // ---------- Settings ----------
    function getSetting(k, d) { return app.settings.haveSetting(SCRIPT, k) ? app.settings.getSetting(SCRIPT, k) : d; }
    function setSetting(k, v) { app.settings.saveSetting(SCRIPT, k, String(v)); }
    function esc(s) { return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }

    // ---------- Unicode ----------
    function toCodepoints(str) {
        var out = [], i = 0;
        while (i < str.length) {
            var c = str.charCodeAt(i);
            if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
                var d = str.charCodeAt(i + 1);
                if (d >= 0xDC00 && d <= 0xDFFF) {
                    out.push(((c - 0xD800) * 0x400 + (d - 0xDC00) + 0x10000).toString(16));
                    i += 2; continue;
                }
            }
            out.push(c.toString(16)); i++;
        }
        return out;
    }
    // Normalisiert: ohne FE0F (Variation Selector), ohne fuehrende Nullen
    function normKey(arr) {
        var r = [];
        for (var i = 0; i < arr.length; i++) {
            var h = String(arr[i]).toLowerCase().replace(/^\s+|\s+$/g, "");
            if (!h) continue;
            h = parseInt(h, 16).toString(16);
            if (h !== "fe0f") r.push(h);
        }
        return r.join("-");
    }

    // ---------- Fluent-Ordner & Index ----------
    function getAssetsFolder() {
        var p = getSetting("assets", "");
        var f = p ? new Folder(p) : null;
        return (f && f.exists && looksLikeAssets(f)) ? f : null;
    }
    // Ist das ein Fluent-"assets"-Ordner? (Unterordner mit metadata.json)
    function looksLikeAssets(f) {
        var subs = f.getFiles(function (x) { return x instanceof Folder; });
        if (subs.length < 50) return false;
        var hits = 0;
        for (var i = 0; i < Math.min(subs.length, 10); i++) {
            if (new File(subs[i].fsName + "/metadata.json").exists) hits++;
        }
        return hits >= 5;
    }
    // Sucht bis 4 Ebenen tief nach dem assets-Ordner
    function findAssets(f, depth) {
        if (looksLikeAssets(f)) return f;
        if (depth <= 0) return null;
        var a = new Folder(f.fsName + "/assets");
        if (a.exists && looksLikeAssets(a)) return a;
        var subs = f.getFiles(function (x) { return x instanceof Folder; });
        if (subs.length > 30) return null; // zu gross, nicht weiter graben
        for (var i = 0; i < subs.length; i++) {
            var r = findAssets(subs[i], depth - 1);
            if (r) return r;
        }
        return null;
    }
    function chooseAssetsFolder() {
        var f = Folder.selectDialog("Fluent-Emoji-Ordner w\u00e4hlen (entpacktes 'fluentui-emoji-main')");
        if (!f) return null;
        var found = findAssets(f, 4);
        if (!found) {
            alert("In diesem Ordner wurde kein Fluent-'assets'-Ordner gefunden:\n" + f.fsName +
                  "\n\nErwartet wird ein Ordner 'assets' mit ~1500 Unterordnern (z. B. 'Grinning face').");
            return null;
        }
        setSetting("assets", found.fsName);
        INDEX = null;
        if (INDEX_FILE.exists) INDEX_FILE.remove();
        return found;
    }

    function buildIndex(assets, status) {
        var dirs = assets.getFiles(function (x) { return x instanceof Folder; });
        var map = {}, n = 0;
        for (var i = 0; i < dirs.length; i++) {
            if (status && i % 100 === 0) { status.text = "Indexiere\u2026 " + i + "/" + dirs.length; status.window.update(); }
            var mf = new File(dirs[i].fsName + "/metadata.json");
            if (!mf.exists) continue;
            mf.encoding = "UTF-8"; mf.open("r"); var s = mf.read(); mf.close();
            var m; try { m = eval("(" + s + ")"); } catch (e) { continue; }
            var name = File.decode(dirs[i].name);
            var hasTones = new Folder(dirs[i].fsName + "/Default").exists;
            if (m.unicode) map[normKey(m.unicode.split(" "))] = hasTones ? name + "/Default" : name;
            if (hasTones && m.unicodeSkintones) {
                for (var t = 0; t < m.unicodeSkintones.length; t++) {
                    var cps = m.unicodeSkintones[t].split(" "), tone = "Default";
                    for (var c = 0; c < cps.length; c++) {
                        var h = parseInt(cps[c], 16).toString(16);
                        if (TONE_BY_CP[h]) { tone = TONE_BY_CP[h]; break; }
                    }
                    map[normKey(cps)] = name + "/" + tone;
                }
            }
            n++;
        }
        if (n === 0) throw new Error("Keine Emojis im Ordner gefunden:\n" + assets.fsName + "\nBitte \u00fcber 'Fluent-Ordner\u2026' neu w\u00e4hlen.");
        // Cache schreiben
        var parts = [];
        for (var k in map) if (map.hasOwnProperty(k)) parts.push('"' + k + '":"' + esc(map[k]) + '"');
        INDEX_FILE.encoding = "UTF-8"; INDEX_FILE.open("w");
        INDEX_FILE.write('({path:"' + esc(assets.fsName) + '",map:{' + parts.join(",") + '}})');
        INDEX_FILE.close();
        return { path: assets.fsName, map: map, count: n };
    }

    function loadIndex(assets, status) {
        if (INDEX && INDEX.path === assets.fsName) return INDEX;
        if (INDEX_FILE.exists) {
            try {
                INDEX_FILE.encoding = "UTF-8"; INDEX_FILE.open("r"); var s = INDEX_FILE.read(); INDEX_FILE.close();
                var o = eval(s);
                var cnt = 0; if (o && o.map) for (var k in o.map) { cnt++; break; }
                if (o && o.path === assets.fsName && cnt > 0) { INDEX = o; return INDEX; }
            } catch (e) {}
        }
        INDEX = buildIndex(assets, status);
        return INDEX;
    }

    // Greedy Longest-Match ueber die Codepoints (ZWJ-Sequenzen, Flaggen, Hauttoene)
    function segment(text, map) {
        var cps = toCodepoints(text), res = [], i = 0, MAX = 12;
        while (i < cps.length) {
            var hit = null, len = 0;
            for (var L = Math.min(MAX, cps.length - i); L >= 1; L--) {
                var k = normKey(cps.slice(i, i + L));
                if (k && map.hasOwnProperty(k)) { hit = map[k]; len = L; break; }
            }
            if (hit) { res.push({ rel: hit, key: normKey(cps.slice(i, i + len)) }); i += len; }
            else i++;
        }
        return res;
    }

    var LAST_PROBLEM = "";
    // Sucht den Stil-Ordner case-insensitiv und darin die SVG
    function findSource(assets, rel, style) {
        var base = new Folder(assets.fsName + "/" + rel);
        if (!base.exists) { LAST_PROBLEM = "Ordner fehlt: " + base.fsName; return null; }
        var want = style.toLowerCase().replace(/\s/g, "");
        var subs = base.getFiles(function (x) { return x instanceof Folder; });
        var dir = null;
        for (var i = 0; i < subs.length; i++) {
            if (File.decode(subs[i].name).toLowerCase().replace(/\s/g, "") === want) { dir = subs[i]; break; }
        }
        if (!dir) { LAST_PROBLEM = "Kein Ordner '" + style + "' in: " + base.fsName; return null; }
        var f = dir.getFiles(function (x) { return x instanceof File && /\.svg$/i.test(File.decode(x.name)); });
        if (!f.length) { LAST_PROBLEM = "Keine SVG-Datei in: " + dir.fsName; return null; }
        return f[0];
    }

    // ---------- Illustrator-Konvertierung (SVG -> AI, gebuendelt) ----------
    function convertWithIllustrator(jobs, status) {
        if (!jobs.length) return;
        var target = BridgeTalk.getSpecifier("illustrator");
        if (!target) throw new Error("Illustrator wurde nicht gefunden \u2013 wird f\u00fcr die SVG-Umwandlung ben\u00f6tigt.");
        var arr = [];
        for (var i = 0; i < jobs.length; i++) arr.push('["' + esc(jobs[i].src.absoluteURI) + '","' + esc(jobs[i].dst.absoluteURI) + '"]');
        var body =
            "(function(){var lvl=app.userInteractionLevel;app.userInteractionLevel=UserInteractionLevel.DONTDISPLAYALERTS;" +
            "var J=[" + arr.join(",") + "];" +
            "for(var i=0;i<J.length;i++){try{var d=app.open(new File(J[i][0]));var o=new IllustratorSaveOptions();o.pdfCompatible=true;" +
            "d.saveAs(new File(J[i][1]),o);d.close(SaveOptions.DONOTSAVECHANGES);}catch(e){}}" +
            "app.userInteractionLevel=lvl;return 'ok';})();";
        if (status) { status.text = "Illustrator wandelt " + jobs.length + " Emoji(s) um\u2026"; status.window.update(); }
        var bt = new BridgeTalk();
        bt.target = target;
        bt.body = body;
        bt.send(180);
        // Auf Dateien warten (falls send nicht blockiert)
        var waited = 0;
        while (waited < 180000) {
            var done = true;
            for (var j = 0; j < jobs.length; j++) if (!jobs[j].dst.exists) { done = false; break; }
            if (done) break;
            $.sleep(250); waited += 250;
        }
        $.sleep(300);
    }

    // ---------- AE-Import ----------
    function getBin() {
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it instanceof FolderItem && it.name === "Emojis") return it;
        }
        return app.project.items.addFolder("Emojis");
    }
    function importFootage(file) {
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it instanceof FootageItem && it.file && it.file.fsName === file.fsName) return it;
        }
        var item = app.project.importFile(new ImportOptions(file));
        item.parentFolder = getBin();
        return item;
    }

    // ---------- Formebene erzeugen (sprachunabhaengig) ----------
    function shapesCommandId() {
        var names = ["Create Shapes from Vector Layer", "Formen aus Vektorebene erstellen"];
        for (var i = 0; i < names.length; i++) {
            var id = app.findMenuCommandId(names[i]);
            if (id) return id;
        }
        return 3973; // feste ID von "Create Shapes from Vector Layer"
    }
    function toShapes(comp, layer) {
        comp.openInViewer(); // Befehl braucht die Comp im Fokus
        for (var s = 1; s <= comp.numLayers; s++) comp.layer(s).selected = false;
        layer.selected = true;
        var idx = layer.index, before = comp.numLayers;
        app.executeCommand(shapesCommandId());
        if (comp.numLayers <= before) { layer.selected = false; return null; }
        var shp = comp.layer(idx);          // neue Formebene liegt direkt ueber dem Original
        if (shp === layer) return null;
        layer.remove();                      // AI-Ebene entfernen
        shp.selected = false;
        return shp;
    }

    // ---------- Gruppen nach Farbe zusammenfassen ----------
    // Liest alle Flaechen (Transformationen eingerechnet), fasst gleichfarbige zusammen,
    // solange dadurch keine Ueberdeckung kippt, und baut eine neue, flache Formebene.
    var IDENT = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0, op: 1, sw: 1 };

    function groupMatrix(tr) {
        var A = tr.property("ADBE Vector Anchor").value, P = tr.property("ADBE Vector Position").value,
            S = tr.property("ADBE Vector Scale").value, R = tr.property("ADBE Vector Rotation").value * Math.PI / 180,
            K = tr.property("ADBE Vector Skew").value;
        if (Math.abs(K) > 0.001) throw new Error("Neigung in Gruppe \u2013 kann nicht zusammengefasst werden.");
        var sx = S[0] / 100, sy = S[1] / 100, cs = Math.cos(R), sn = Math.sin(R);
        var a = cs * sx, b = sn * sx, c = -sn * sy, d = cs * sy;
        return { a: a, b: b, c: c, d: d, tx: P[0] - (a * A[0] + c * A[1]), ty: P[1] - (b * A[0] + d * A[1]),
                 op: tr.property("ADBE Vector Group Opacity").value / 100, sw: Math.sqrt(Math.abs(sx * sy)) };
    }
    function mul(M, N) {
        return { a: M.a * N.a + M.c * N.b, b: M.b * N.a + M.d * N.b, c: M.a * N.c + M.c * N.d, d: M.b * N.c + M.d * N.d,
                 tx: M.a * N.tx + M.c * N.ty + M.tx, ty: M.b * N.tx + M.d * N.ty + M.ty, op: M.op * N.op, sw: M.sw * N.sw };
    }
    function xfShape(sh, M) {
        var v = [], it = [], ot = [];
        for (var k = 0; k < sh.vertices.length; k++) {
            var p = sh.vertices[k], i = sh.inTangents[k], o = sh.outTangents[k];
            v.push([M.a * p[0] + M.c * p[1] + M.tx, M.b * p[0] + M.d * p[1] + M.ty]);
            it.push([M.a * i[0] + M.c * i[1], M.b * i[0] + M.d * i[1]]);
            ot.push([M.a * o[0] + M.c * o[1], M.b * o[0] + M.d * o[1]]);
        }
        var s = new Shape(); s.vertices = v; s.inTangents = it; s.outTangents = ot; s.closed = sh.closed;
        return s;
    }
    function signedArea(sh) {
        var v = sh.vertices, a = 0;
        for (var k = 0; k < v.length; k++) { var n = v[(k + 1) % v.length]; a += v[k][0] * n[1] - n[0] * v[k][1]; }
        return a;
    }
    function r3(x) { return Math.round(x * 1000) / 1000; }
    function hex(c) {
        var h = "#";
        for (var i = 0; i < 3; i++) { var s = Math.round(Math.max(0, Math.min(1, c[i])) * 255).toString(16).toUpperCase(); h += s.length < 2 ? "0" + s : s; }
        return h;
    }

    function collectLeaves(contents, M, out) {
        var paths = [], rends = [], subs = [];
        for (var i = 1; i <= contents.numProperties; i++) {
            var p = contents.property(i), mn = p.matchName;
            try { if (!p.enabled) continue; } catch (e) {}
            if (mn === "ADBE Vector Group") subs.push(p);
            else if (mn === "ADBE Vector Shape - Group") paths.push(p.property("ADBE Vector Shape").value);
            else if (mn === "ADBE Vector Graphic - Fill") {
                rends.push({ t: "F", c: p.property("ADBE Vector Fill Color").value,
                             o: p.property("ADBE Vector Fill Opacity").value * M.op, r: p.property("ADBE Vector Fill Rule").value });
            } else if (mn === "ADBE Vector Graphic - Stroke") {
                rends.push({ t: "S", c: p.property("ADBE Vector Stroke Color").value,
                             o: p.property("ADBE Vector Stroke Opacity").value * M.op,
                             w: p.property("ADBE Vector Stroke Width").value * M.sw,
                             cap: p.property("ADBE Vector Stroke Line Cap").value,
                             join: p.property("ADBE Vector Stroke Line Join").value,
                             miter: p.property("ADBE Vector Stroke Miter Limit").value });
            } else if (mn === "ADBE Vector Graphic - G-Fill" || mn === "ADBE Vector Graphic - G-Stroke") {
                throw new Error("Verl\u00e4ufe gefunden \u2013 Zusammenfassen geht nur mit Stil 'Flat'.");
            } else {
                throw new Error("Nicht unterst\u00fctztes Element: " + p.name);
            }
        }
        if (subs.length && (paths.length || rends.length)) throw new Error("Unerwartete Gruppenstruktur.");
        for (var j = 0; j < subs.length; j++) {
            collectLeaves(subs[j].property("ADBE Vectors Group"),
                          mul(M, groupMatrix(subs[j].property("ADBE Vector Transform Group"))), out);
        }
        if (!paths.length || !rends.length) return;

        var shapes = [], minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9, sign = null;
        for (var q = 0; q < paths.length; q++) {
            var s = xfShape(paths[q], M); shapes.push(s);
            for (var k = 0; k < s.vertices.length; k++) {
                var v = s.vertices[k];
                // Tangenten grob mit einbeziehen
                var xs = [v[0], v[0] + s.inTangents[k][0], v[0] + s.outTangents[k][0]];
                var ys = [v[1], v[1] + s.inTangents[k][1], v[1] + s.outTangents[k][1]];
                for (var z = 0; z < 3; z++) {
                    if (xs[z] < minX) minX = xs[z]; if (xs[z] > maxX) maxX = xs[z];
                    if (ys[z] < minY) minY = ys[z]; if (ys[z] > maxY) maxY = ys[z];
                }
            }
            var sg = signedArea(s) >= 0 ? 1 : -1;
            sign = (sign === null) ? sg : (sign === sg ? sign : 0);
        }
        var key = [], evenOdd = false;
        for (var m = 0; m < rends.length; m++) {
            var r = rends[m];
            if (r.t === "F") { key.push("F" + hex(r.c) + "/" + r3(r.o) + "/" + r.r); if (r.r === 2) evenOdd = true; }
            else key.push("S" + hex(r.c) + "/" + r3(r.o) + "/" + r3(r.w) + "/" + r.cap + "/" + r.join);
        }
        out.push({ shapes: shapes, rends: rends, key: key.join("|"), box: [minX, minY, maxX, maxY], sign: sign, evenOdd: evenOdd });
    }

    function boxHit(a, b) { return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]; }
    function bucketHit(bk, it) { for (var i = 0; i < bk.items.length; i++) if (boxHit(bk.items[i].box, it.box)) return true; return false; }

    function compactLayer(comp, layer) {
        var items = [];
        collectLeaves(layer.property("ADBE Root Vectors Group"), IDENT, items); // vorne -> hinten
        var before = items.length;

        // Einsortieren: so weit nach vorne wie moeglich in eine gleichfarbige Gruppe,
        // aber nie ueber eine ueberlappende andersfarbige Gruppe hinweg.
        var buckets = [];
        for (var i = 0; i < items.length; i++) {
            var it = items[i], placed = false;
            for (var j = buckets.length - 1; j >= 0; j--) {
                var bk = buckets[j];
                if (bk.key === it.key) {
                    var overlap = bucketHit(bk, it);
                    var safe = !overlap || (!it.evenOdd && it.sign !== 0 && bk.sign === it.sign);
                    if (safe) { bk.items.push(it); if (bk.sign !== it.sign) bk.sign = 0; placed = true; break; }
                }
                if (bucketHit(bk, it)) break;
            }
            if (!placed) buckets.push({ key: it.key, items: [it], sign: it.sign, rends: it.rends });
        }

        // Neue Formebene aufbauen
        var nl = comp.layers.addShape();
        nl.moveBefore(layer);
        nl.name = layer.name;
        nl.startTime = layer.startTime; nl.inPoint = layer.inPoint; nl.outPoint = layer.outPoint;
        nl.threeDLayer = layer.threeDLayer;
        var props = ["ADBE Anchor Point", "ADBE Position", "ADBE Scale", "ADBE Rotate Z", "ADBE Opacity"];
        for (var t = 0; t < props.length; t++) {
            nl.property("ADBE Transform Group").property(props[t]).setValue(layer.property("ADBE Transform Group").property(props[t]).value);
        }

        var nameCount = {};
        for (var b = 0; b < buckets.length; b++) {
            var bkt = buckets[b], first = bkt.rends[0];
            var nm = hex(first.c) + (bkt.rends.length > 1 ? " +" : "");
            nameCount[nm] = (nameCount[nm] || 0) + 1;
            var root = nl.property("ADBE Root Vectors Group");
            var g = root.addProperty("ADBE Vector Group");
            g.name = nm + (nameCount[nm] > 1 ? " (" + nameCount[nm] + ")" : "");
            var gi = g.propertyIndex;
            for (var x = 0; x < bkt.items.length; x++) {
                for (var y = 0; y < bkt.items[x].shapes.length; y++) {
                    var gc = nl.property("ADBE Root Vectors Group").property(gi).property("ADBE Vectors Group");
                    var sp = gc.addProperty("ADBE Vector Shape - Group");
                    sp.property("ADBE Vector Shape").setValue(bkt.items[x].shapes[y]);
                }
            }
            for (var rr = 0; rr < bkt.rends.length; rr++) {
                var R = bkt.rends[rr];
                var gc2 = nl.property("ADBE Root Vectors Group").property(gi).property("ADBE Vectors Group");
                if (R.t === "F") {
                    var f = gc2.addProperty("ADBE Vector Graphic - Fill");
                    f.property("ADBE Vector Fill Color").setValue(R.c);
                    f.property("ADBE Vector Fill Opacity").setValue(R.o);
                    f.property("ADBE Vector Fill Rule").setValue(R.r);
                } else {
                    var st = gc2.addProperty("ADBE Vector Graphic - Stroke");
                    st.property("ADBE Vector Stroke Color").setValue(R.c);
                    st.property("ADBE Vector Stroke Opacity").setValue(R.o);
                    st.property("ADBE Vector Stroke Width").setValue(R.w);
                    st.property("ADBE Vector Stroke Line Cap").setValue(R.cap);
                    st.property("ADBE Vector Stroke Line Join").setValue(R.join);
                    st.property("ADBE Vector Stroke Miter Limit").setValue(R.miter);
                }
            }
        }
        layer.remove();
        return { layer: nl, before: before, after: buckets.length };
    }

    // ---------- Hauptfunktion ----------
    function run(text, style, size, asShapes, compact, status) {
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem)) { alert("Bitte zuerst eine Komposition \u00f6ffnen bzw. ausw\u00e4hlen."); return; }
        if (!text) { alert("Bitte Emoji(s) ins Feld einf\u00fcgen."); return; }

        var assets = getAssetsFolder() || chooseAssetsFolder();
        if (!assets) return;
        var idx = loadIndex(assets, status);

        var segs = segment(text, idx.map);
        if (!segs.length) { alert("Kein passendes Emoji gefunden.\nTipp: Fluent-Ordner neu w\u00e4hlen, falls der Index veraltet ist."); return; }

        // Quellen aufloesen + Konvertierungs-Jobs sammeln
        var outDir = new Folder(CACHE.fsName + "/ai/" + style.replace(/\s/g, "_"));
        if (!outDir.exists) outDir.create();
        var items = [], jobs = [], missing = [], shapeFail = false, groupInfo = [], compactMsg = "";
        for (var i = 0; i < segs.length; i++) {
            var src = findSource(assets, segs[i].rel, style);
            if (!src) { missing.push(segs[i].rel); continue; }
            var file = new File(outDir.fsName + "/" + segs[i].key + ".ai");
            if (!file.exists) jobs.push({ src: src, dst: file });
            items.push({ name: segs[i].rel.split("/")[0], file: file });
        }
        if (!items.length) { alert("Nichts eingef\u00fcgt.\n\n" + LAST_PROBLEM); return; }
        try { convertWithIllustrator(jobs, status); }
        catch (e) { alert(e.message); return; }

        app.beginUndoGroup("EmojiPaste");
        try {
            var gap = size * 0.15;
            var totalW = items.length * size + (items.length - 1) * gap;
            var x = comp.width / 2 - totalW / 2 + size / 2;
            for (var s = 1; s <= comp.numLayers; s++) comp.layer(s).selected = false;

            for (var n = 0; n < items.length; n++) {
                var it = items[n];
                if (!it.file.exists) { missing.push(it.name); continue; }
                var footage = importFootage(it.file);
                var layer = comp.layers.add(footage);
                layer.startTime = comp.time;
                layer.name = it.name;
                var sc = size / footage.width * 100;
                layer.property("ADBE Transform Group").property("ADBE Scale").setValue([sc, sc]);
                layer.property("ADBE Transform Group").property("ADBE Position").setValue([x, comp.height / 2]);
                layer.collapseTransformation = true; // kontinuierlich rastern
                if (asShapes) {
                    var shp = toShapes(comp, layer);
                    if (shp) {
                        shp.name = it.name;
                        if (compact) {
                            try {
                                var res = compactLayer(comp, shp);
                                groupInfo.push(res.before + "\u2192" + res.after);
                            } catch (ce) { compactMsg = ce.message; }
                        }
                    } else shapeFail = true;
                }
                x += size + gap;
            }
        } finally {
            app.endUndoGroup();
        }
        status.text = items.length - missing.length + " Emoji(s) eingef\u00fcgt" +
            (groupInfo.length ? " \u00b7 Gruppen " + groupInfo.join(", ") : "") +
            (missing.length ? " \u2013 fehlt: " + missing.join(", ") : "");
        if (compactMsg) alert("Gruppen nicht zusammengefasst:\n" + compactMsg);
        if (shapeFail) alert("Umwandlung in Formebene hat nicht geklappt.\nManuell: Rechtsklick auf die Ebene > Erstellen > Formen aus Vektorebene erstellen.");
    }

    // ---------- UI ----------
    function buildUI(obj) {
        var w = (obj instanceof Panel) ? obj : new Window("palette", "EmojiPaste", undefined, { resizeable: true });
        w.orientation = "column"; w.alignChildren = ["fill", "top"]; w.spacing = 10; w.margins = 12;

        var grey = w.graphics.newPen(w.graphics.PenType.SOLID_COLOR, [0.55, 0.55, 0.55, 1], 1);
        function muted(t) { try { t.graphics.foregroundColor = grey; } catch (e) {} return t; }
        function font(el, size, bold) { try { el.graphics.font = ScriptUI.newFont("dialog", bold ? "BOLD" : "REGULAR", size); } catch (e) {} }

        // --- Eingabe ---
        var head = w.add("group"); head.orientation = "column"; head.alignChildren = ["fill", "top"]; head.spacing = 4;
        var lbl = head.add("statictext", undefined, "EMOJIS EINF\u00dcGEN"); muted(lbl); font(lbl, 10, true);
        var input = head.add("edittext", undefined, "");
        input.helpTip = "Emoji(s) einf\u00fcgen (Strg/Cmd+V) \u2013 Enter f\u00fcgt in die Comp ein";
        input.preferredSize.height = 36;
        font(input, 20);

        // --- Stil ---
        var pStyle = w.add("panel", undefined, "Stil");
        pStyle.orientation = "row"; pStyle.alignChildren = ["left", "center"]; pStyle.margins = [10, 14, 10, 8]; pStyle.spacing = 14;
        var rbColor = pStyle.add("radiobutton", undefined, "Color");
        var rbFlat = pStyle.add("radiobutton", undefined, "Flat");
        rbColor.helpTip = "Mit Verl\u00e4ufen \u2013 wie das Original";
        rbFlat.helpTip = "Volltonfl\u00e4chen \u2013 ideal zum Animieren";
        var savedStyle = getSetting("styleName", "Color");
        rbFlat.value = savedStyle === "Flat"; rbColor.value = !rbFlat.value;
        var sp = pStyle.add("group"); sp.alignment = ["fill", "center"];
        var szGroup = pStyle.add("group"); szGroup.alignment = ["right", "center"]; szGroup.spacing = 4;
        muted(szGroup.add("statictext", undefined, "Gr\u00f6\u00dfe"));
        var sz = szGroup.add("edittext", undefined, getSetting("size", "300")); sz.characters = 4;
        muted(szGroup.add("statictext", undefined, "px"));

        // --- Formebene ---
        var pShape = w.add("panel", undefined, "Formebene");
        pShape.orientation = "column"; pShape.alignChildren = ["left", "top"]; pShape.margins = [10, 14, 10, 8]; pShape.spacing = 4;
        var shapes = pShape.add("checkbox", undefined, "In Formebene umwandeln");
        shapes.value = getSetting("shapes", "false") === "true";
        shapes.helpTip = "Einzelne Teile (Augen, Mund \u2026) lassen sich dann separat animieren.";
        var cg = pShape.add("group"); cg.margins = [18, 0, 0, 0];
        var compactCb = cg.add("checkbox", undefined, "Gruppen nach Farbe zusammenfassen");
        compactCb.value = getSetting("compact", "true") === "true";
        compactCb.helpTip = "Gleichfarbige Fl\u00e4chen in eine Gruppe (Name = Hex-Wert). \u00dcberdeckung bleibt erhalten.";
        var shapeHint = muted(pShape.add("statictext", undefined, "Nur mit Stil \u201eFlat\u201c verf\u00fcgbar."));
        shapeHint.alignment = ["fill", "top"];

        // --- Aktion ---
        var btn = w.add("button", undefined, "Einf\u00fcgen");
        btn.preferredSize.height = 34;
        font(btn, 13, true);

        // --- Footer ---
        var foot = w.add("group"); foot.alignment = ["fill", "top"]; foot.alignChildren = ["left", "center"]; foot.spacing = 6;
        var pick = foot.add("button", undefined, "Ordner\u2026");
        var rebuild = foot.add("button", undefined, "Index neu");
        pick.preferredSize = rebuild.preferredSize = [76, 22];
        pick.helpTip = "Fluent-Emoji-Ordner w\u00e4hlen";
        rebuild.helpTip = "Emoji-Verzeichnis neu einlesen";
        var status = muted(w.add("statictext", undefined, getAssetsFolder() ? "Bereit." : "Zuerst Fluent-Ordner w\u00e4hlen.", { truncate: "end" }));
        status.alignment = ["fill", "top"];
        font(status, 10);

        function styleName() { return rbFlat.value ? "Flat" : "Color"; }
        function sync() {
            var flat = rbFlat.value;
            shapes.enabled = flat;
            compactCb.enabled = flat && shapes.value;
            shapeHint.visible = !flat;
        }
        function go() {
            try {
                var flat = rbFlat.value;
                run(input.text, styleName(), parseFloat(sz.text) || 300, flat && shapes.value, flat && shapes.value && compactCb.value, status);
            } catch (e) { alert("EmojiPaste Fehler:\n" + e.toString() + (e.line ? " (Zeile " + e.line + ")" : "")); }
        }

        rbColor.onClick = rbFlat.onClick = function () { setSetting("styleName", styleName()); sync(); };
        sz.onChange = function () { setSetting("size", sz.text); };
        shapes.onClick = function () { setSetting("shapes", shapes.value); sync(); };
        compactCb.onClick = function () { setSetting("compact", compactCb.value); };
        pick.onClick = function () { if (chooseAssetsFolder()) status.text = "Ordner gesetzt."; };
        rebuild.onClick = function () {
            try {
                var a = getAssetsFolder() || chooseAssetsFolder(); if (!a) return;
                INDEX = buildIndex(a, status);
                status.text = "Index: " + INDEX.count + " Emojis.";
            } catch (e) { alert(e.message); }
        };
        btn.onClick = go;
        input.addEventListener("keydown", function (e) {
            if (e.keyName === "Enter") { e.preventDefault(); go(); }
        });

        sync();
        w.onResizing = w.onResize = function () { this.layout.resize(); };
        if (w instanceof Window) { w.center(); w.show(); } else { w.layout.layout(true); }
        return w;
    }

    buildUI(thisObj);
})(this);
