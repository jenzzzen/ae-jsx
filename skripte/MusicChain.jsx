/*  MusicChain.jsx  \u2013  Musik \u00FCber mehrere Comps (z.B. Insta-Carousel) fortlaufend verteilen
    -----------------------------------------------------------------------------------
    Installation: in  Scripts/ScriptUI Panels  legen  -> Fenster > MusicChain.jsx

    Ablauf:
      1. Song w\u00E4hlen, L\u00E4nge aus Arbeitsbereich oder Comp-L\u00E4nge w\u00E4hlen (jederzeit umschaltbar)
      2. Slide-Comps im Projektfenster markieren -> "Musik auf markierte Comps legen"
         (Reihenfolge = Name, nat\u00FCrlich sortiert: Slide_2 vor Slide_10)
      Song wechseln: einfach im Dropdown ausw\u00E4hlen.

    Timeline-Leiste: jede Slide als Block, Breite = L\u00E4nge. Klick = Musik an/aus.
                     Rote Linie = hier ist der Song zu Ende.
    Liste:           Doppelklick = an/aus \u00B7 "Entfernen" = markierte Slides aus der Kette nehmen
                     (ohne Auswahl: alles entfernen)

    Steuerung: Ordner "\u266A Musik" > Comp "MUSIK_STEUERUNG" > Ebene "Regler" (Button "Regler", dann F3)
      Song-Start (s) \u00B7 Lautst\u00E4rke (dB) \u00B7 Einblenden (s) \u00B7 Ausblenden (s)
      \u00DCbergang: Ausblenden (s) \u00B7 \u00DCbergang: Einblenden (s)
      Pro Slide: Ebene "\u266A Musik" > Effekt "Lautst\u00E4rke dieser Slide (dB)"
      Marker auf "Regler": eine Zeile pro Slide (an/aus, Start, Dauer) \u2013 wird vom Skript gepflegt.

    Comps werden intern per ID verkn\u00FCpft. L\u00E4ngen werden per Auto-Sync oder "Aktualisieren" \u00FCbernommen.
    "Aktualisieren" repariert au\u00DFerdem doppelte/umbenannte Regler und schreibt alle Expressions neu.
*/

(function MusicChain(thisObj) {
    var TAG = "MUSIC_CHAIN";
    var FOLDER = "\u266A Musik";
    var CTRL_COMP = "MUSIK_STEUERUNG";
    var CTRL_LAYER = "Regler";
    var PREVIEW_COMP = "MUSIK_VORSCHAU";
    var OLD_CTRL_COMP = "MUSIC_CTRL";
    var OLD_PREVIEW_COMP = "MUSIC_PREVIEW";
    var SEP = "\u241E";

    var C_START = "Song-Start (s)";
    var C_VOL = "Lautst\u00E4rke (dB)";
    var C_IN = "Einblenden (s)";
    var C_OUT = "Ausblenden (s)";
    var C_TOUT = "\u00DCbergang: Ausblenden (s)";
    var C_TIN = "\u00DCbergang: Einblenden (s)";
    var C_CUT = "\u00DCbergangs-Fade (Frames)"; // alt, wird migriert
    var C_SLIDE_VOL = "Lautst\u00E4rke dieser Slide (dB)";
    var SLIDERS = [[C_START, 0], [C_VOL, 0], [C_IN, 0.5], [C_OUT, 1], [C_TOUT, 1], [C_TIN, 0.8]];

    // Farben
    var COL_ACCENT = [0.23, 0.78, 0.58, 1];
    var COL_OFF = [0.26, 0.26, 0.28, 1];
    var COL_BG = [0.13, 0.13, 0.14, 1];
    var COL_TEXT = [0.92, 0.92, 0.92, 1];
    var COL_DIM = [0.55, 0.55, 0.58, 1];
    var COL_WARN = [0.95, 0.33, 0.33, 1];
    var COL_SEL = [1, 1, 1, 0.9];

    // ---------- Helpers ----------
    function natCmp(a, b) {
        var ax = a.name.match(/(\d+|\D+)/g) || [];
        var bx = b.name.match(/(\d+|\D+)/g) || [];
        var n = Math.min(ax.length, bx.length);
        for (var i = 0; i < n; i++) {
            var an = /^\d+$/.test(ax[i]), bn = /^\d+$/.test(bx[i]);
            if (an && bn) {
                var d = parseInt(ax[i], 10) - parseInt(bx[i], 10);
                if (d !== 0) return d;
            } else {
                var s1 = ax[i].toLowerCase(), s2 = bx[i].toLowerCase();
                if (s1 < s2) return -1;
                if (s1 > s2) return 1;
            }
        }
        return ax.length - bx.length;
    }

    function q(s) { return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"'; }
    function pad(n) { return (n < 10 ? "0" : "") + n; }
    function tc(t, fps) { try { return timeToCurrentFormat(t, fps); } catch (e) { return t.toFixed(2) + " s"; } }
    function secs(t) { return t.toFixed(2).replace(".", ",") + " s"; }

    function findItem(name, type) {
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it instanceof type && it.name === name) return it;
        }
        return null;
    }
    function findComp(name) { return findItem(name, CompItem); }
    function compById(id) {
        try { var it = app.project.itemByID(id); if (it instanceof CompItem) return it; } catch (e) {}
        for (var i = 1; i <= app.project.numItems; i++) {
            var x = app.project.item(i);
            if (x instanceof CompItem && x.id === id) return x;
        }
        return null;
    }
    function getFolder() { return findItem(FOLDER, FolderItem) || app.project.items.addFolder(FOLDER); }

    function audioItems() {
        var a = [];
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it instanceof FootageItem && it.hasAudio) a.push(it);
        }
        return a;
    }

    function isHelperComp(c) {
        return c.name === CTRL_COMP || c.name === PREVIEW_COMP || c.name === OLD_CTRL_COMP || c.name === OLD_PREVIEW_COMP;
    }

    function selectedComps() {
        var s = app.project.selection, c = [];
        for (var i = 0; i < s.length; i++) if (s[i] instanceof CompItem && !isHelperComp(s[i])) c.push(s[i]);
        c.sort(natCmp);
        return c;
    }

    function ctrlLayerOf(cc) {
        if (!cc) return null;
        for (var i = 1; i <= cc.numLayers; i++) if (cc.layer(i).name === CTRL_LAYER) return cc.layer(i);
        return null;
    }

    // ---------- Effekte robust finden ----------
    // Umlaute in Effektnamen k\u00F6nnen nach Speichern/\u00D6ffnen anders kodiert sein
    // (falsch dekodiert oder als a + Trema zerlegt). Deshalb tolerant vergleichen.
    function nameKey(s) {
        s = String(s)
            .replace(/\u00C3\u00A4|\u00E4|a\u0308/g, "ae").replace(/\u00C3\u00B6|\u00F6|o\u0308/g, "oe")
            .replace(/\u00C3\u00BC|\u00FC|u\u0308/g, "ue").replace(/\u00C3\u0084|\u00C3\u201E|\u00C4|A\u0308/g, "ae")
            .replace(/\u00C3\u0096|\u00C3\u2013|\u00D6|O\u0308/g, "oe").replace(/\u00C3\u009C|\u00C3\u0153|\u00DC|U\u0308/g, "ue")
            .replace(/\u00C3\u009F|\u00C3\u0178|\u00DF/g, "ss");
        return s.toLowerCase().replace(/[^a-z0-9]/g, "");
    }
    function asciiKey(s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ""); }
    function sameName(a, b) { return nameKey(a) === nameKey(b) || asciiKey(a) === asciiKey(b); }

    function findEffects(L, name) {
        var fx = L.property("ADBE Effect Parade"), r = [];
        for (var i = 1; i <= fx.numProperties; i++) if (sameName(fx.property(i).name, name)) r.push(fx.property(i));
        return r;
    }

    // genau einen Slider "name" an Position pos sicherstellen (Duplikate weg, Name reparieren)
    function ensureOne(L, name, def, pos) {
        var found = findEffects(L, name), e;
        if (found.length) {
            e = found[0];
            for (var k = found.length - 1; k >= 1; k--) found[k].remove();
            e = findEffects(L, name)[0];
        } else {
            e = L.property("ADBE Effect Parade").addProperty("ADBE Slider Control");
            e.name = name;
            e.property(1).setValue(def);
        }
        if (e.name !== name) e.name = name;
        if (pos && e.propertyIndex !== pos) { try { e.moveTo(pos); } catch (x) {} }
        return e;
    }

    function ensureSliders(L) {
        var olds = findEffects(L, C_CUT), oldSec = null;
        if (olds.length) {
            oldSec = olds[0].property(1).value * L.containingComp.frameDuration;
            for (var i = olds.length - 1; i >= 0; i--) olds[i].remove();
        }
        for (var k = 0; k < SLIDERS.length; k++) {
            var nm = SLIDERS[k][0], v = SLIDERS[k][1];
            if (oldSec !== null && (nm === C_TOUT || nm === C_TIN)) v = oldSec;
            ensureOne(L, nm, v, k + 1);
        }
    }

    function sliderIndex(name) {
        for (var k = 0; k < SLIDERS.length; k++) if (SLIDERS[k][0] === name) return k + 1;
        return -1;
    }
    function ctrlValue(L, name) {
        var f = findEffects(L, name);
        return f.length ? f[0].property(1).value : 0;
    }

    function getCtrl(fps) {
        var cc = findComp(CTRL_COMP);
        if (!cc) {
            cc = app.project.items.addComp(CTRL_COMP, 100, 100, 1, 60, fps || 25);
            cc.parentFolder = getFolder();
        }
        var L = ctrlLayerOf(cc);
        if (!L) { L = cc.layers.addNull(cc.duration); L.name = CTRL_LAYER; L.label = 9; }
        ensureSliders(L);
        return L;
    }

    function musicLayers(comp) {
        var a = [];
        if (!comp) return a;
        for (var i = 1; i <= comp.numLayers; i++) if (comp.layer(i).comment === TAG) a.push(comp.layer(i));
        return a;
    }

    // entfernt Musik-Layer, gibt vorherige Slide-Lautst\u00E4rke zur\u00FCck (oder null)
    function removeMusic(comp) {
        var prev = null, ls = musicLayers(comp);
        for (var i = ls.length - 1; i >= 0; i--) {
            if (prev === null) {
                try {
                    var f = findEffects(ls[i], C_SLIDE_VOL);
                    if (f.length) prev = f[0].property(1).value;
                } catch (x) {}
            }
            ls[i].remove();
        }
        return prev;
    }

    function cleanupOld() {
        var o = findComp(OLD_CTRL_COMP); if (o) o.remove();
        var p = findComp(OLD_PREVIEW_COMP); if (p) p.remove();
    }

    // ---------- Chain (gespeichert im Kommentar der Regler-Ebene) ----------
    // Format: MODE \u241E 1:id:Name \u241E 0:id:Name ...
    function chainLoad() {
        var L = ctrlLayerOf(findComp(CTRL_COMP));
        if (!L || !L.comment) return null;
        var parts = L.comment.split(SEP);
        var mode = parts.shift();
        var entries = [], missing = [];
        for (var j = 0; j < parts.length; j++) {
            var p = parts[j], on = true, name = p, id = 0, m;
            if ((m = p.match(/^([01]):(\d+):([\s\S]*)$/))) { on = m[1] === "1"; id = parseInt(m[2], 10); name = m[3]; }
            else if (/^[01]:/.test(p)) { on = p.charAt(0) === "1"; name = p.substring(2); }
            if (!name && !id) continue;
            var c = id ? compById(id) : findComp(name);
            if (c) name = c.name; else missing.push(name);
            entries.push({ name: name, on: on, comp: c });
        }
        return { ctrl: L, useWA: mode === "WA", entries: entries, missing: missing };
    }

    function chainSave(ch) {
        var parts = [];
        for (var i = 0; i < ch.entries.length; i++) {
            var en = ch.entries[i];
            parts.push((en.on ? "1:" : "0:") + (en.comp ? en.comp.id : 0) + ":" + en.name);
        }
        ch.ctrl.comment = (ch.useWA ? "WA" : "DUR") + SEP + parts.join(SEP);
    }

    function slideStart(e, useWA) { return (e.comp && useWA) ? e.comp.workAreaStart : 0; }
    function slideDur(e, useWA) { return e.comp ? (useWA ? e.comp.workAreaDuration : e.comp.duration) : 0; }

    function songOf(ch) {
        for (var i = 0; i < ch.entries.length; i++) {
            var ls = musicLayers(ch.entries[i].comp);
            if (ls.length && ls[0].source) return ls[0].source;
        }
        return null;
    }

    function markerTexts(ch) {
        var t = [];
        for (var j = 0; j < ch.entries.length; j++) {
            var e = ch.entries[j];
            t.push(pad(j) + " " + e.name + " | " + (e.on ? "an" : "aus") +
                   " | Start " + slideStart(e, ch.useWA).toFixed(4) + " s | Dauer " + slideDur(e, ch.useWA).toFixed(4) + " s");
        }
        return t;
    }

    function markersUpToDate(ch) {
        var mk = ch.ctrl.property("ADBE Marker"), want = markerTexts(ch);
        if (mk.numKeys !== want.length) return false;
        for (var i = 0; i < want.length; i++) if (mk.keyValue(i + 1).comment !== want[i]) return false;
        return true;
    }

    function writeMarkers(ch) {
        var mk = ch.ctrl.property("ADBE Marker");
        for (var i = mk.numKeys; i >= 1; i--) mk.removeKey(i);
        var fd = ch.ctrl.containingComp.frameDuration, want = markerTexts(ch);
        for (var j = 0; j < want.length; j++) mk.setValueAtTime(j * fd, new MarkerValue(want[j]));
    }

    // ---------- Expressions ----------
    function head() { return "var c = comp(" + q(CTRL_COMP) + ").layer(" + q(CTRL_LAYER) + ");"; }
    // per Index, damit die Kodierung der Namen egal ist (Name steht als Kommentar dabei)
    function fx(name) { return "c.effect(" + sliderIndex(name) + ")(1).value /* " + name + " */"; }

    var INFO_FN = [
        "function info(i) {",
        "  var m = c.marker.key(i + 1).comment.match(/\\| (an|aus) \\| Start (-?[\\d.]+) s \\| Dauer ([\\d.]+) s/);",
        "  return { on: m[1] == \"an\", s: parseFloat(m[2]), d: parseFloat(m[3]) };",
        "}"
    ].join("\n");

    function remapExpr(idx) {
        return [
            "// MusicChain \u2013 Song-Position",
            head(), INFO_FN,
            "var idx = " + idx + ";",
            "var t = " + fx(C_START) + ";",
            "for (var i = 0; i < idx; i++) if (info(i).on) t += info(i).d;",
            "t + time - info(idx).s;"
        ].join("\n");
    }

    function levelsExpr(idx) {
        return [
            "// MusicChain \u2013 Lautst\u00E4rke & Fades",
            head(), INFO_FN,
            "var idx = " + idx + ", n = c.marker.numKeys, me = info(idx);",
            "var t0 = me.s, d = me.d;",
            "var first = -1, last = -1;",
            "for (var i = 0; i < n; i++) if (info(i).on) { if (first < 0) first = i; last = i; }",
            "var lt = time - t0;",
            "var vol = " + fx(C_VOL) + " + effect(1)(1); /* " + C_SLIDE_VOL + " */",
            "var fin = " + fx(C_IN) + ", fout = " + fx(C_OUT) + ";",
            "var tout = " + fx(C_TOUT) + ", tin = " + fx(C_TIN) + ";",
            "// S-Kurve (Raised Cosine): startet und endet weich",
            "function S(x) { x = Math.max(0, Math.min(1, x)); return 0.5 - 0.5 * Math.cos(Math.PI * x); }",
            "var g = (!me.on || lt < 0 || lt > d) ? 0 : 1;",
            "var a = (idx == first) ? fin : tin;",
            "var b = (idx == last) ? fout : tout;",
            "if (a > 0) g *= S(lt / a);",
            "if (b > 0) g *= S((d - lt) / b);",
            "var db = (g <= 0.0001) ? -192 : 20 * Math.log(g) / Math.LN10;",
            "[db + vol, db + vol];"
        ].join("\n");
    }

    // Regler reparieren + Expressions aller Musik-Layer neu schreiben
    function rebuild(ch) {
        ensureSliders(ch.ctrl);
        for (var j = 0; j < ch.entries.length; j++) {
            var e = ch.entries[j], ls = musicLayers(e.comp);
            for (var k = 0; k < ls.length; k++) {
                var L = ls[k];
                ensureOne(L, C_SLIDE_VOL, 0, 1);
                L.property("ADBE Time Remapping").expression = remapExpr(j);
                L.property("ADBE Audio Group").property("ADBE Audio Levels").expression = levelsExpr(j);
                L.audioEnabled = e.on;
            }
        }
    }

    function totals(ch) {
        var all = 0, music = 0;
        for (var i = 0; i < ch.entries.length; i++) {
            var d = slideDur(ch.entries[i], ch.useWA);
            all += d;
            if (ch.entries[i].on) music += d;
        }
        return { all: all, music: music, start: ctrlValue(ch.ctrl, C_START) };
    }

    // ---------- Actions ----------
    // Song in allen Musik-Layern der Kette austauschen (alles andere bleibt)
    function swapSong(audio) {
        var ch = chainLoad();
        if (!ch || !audio) return false;
        app.beginUndoGroup("MusicChain: Song wechseln");
        try {
            for (var i = 0; i < ch.entries.length; i++) {
                var e = ch.entries[i], ls = musicLayers(e.comp);
                for (var k = 0; k < ls.length; k++) {
                    var L = ls[k];
                    if (L.source === audio) continue;
                    L.replaceSource(audio, false);
                    L.enabled = !audio.hasVideo;
                    L.inPoint = 0;
                    L.outPoint = e.comp.duration;
                    L.audioEnabled = e.on;
                }
            }
        } catch (x) { alert("Fehler beim Song-Wechsel: " + x.toString()); }
        app.endUndoGroup();
        fillList();
        return true;
    }

    function apply(audio, useWA) {
        var comps = selectedComps();
        if (!audio) { alert("Bitte einen Song w\u00E4hlen."); return; }
        if (comps.length < 1) {
            if (chainLoad()) { swapSong(audio); return; }
            alert("Bitte die Slide-Comps im Projektfenster markieren.");
            return;
        }

        app.beginUndoGroup("MusicChain: Musik anlegen");
        try {
            cleanupOld();
            var prev = chainLoad(), prevOn = {};
            if (prev) for (var p = 0; p < prev.entries.length; p++) if (prev.entries[p].comp) prevOn[prev.entries[p].comp.id] = prev.entries[p].on;

            var ctrl = getCtrl(comps[0].frameRate);
            var ch = { ctrl: ctrl, useWA: useWA, entries: [], missing: [] };
            for (var i = 0; i < comps.length; i++) {
                var cid = comps[i].id;
                ch.entries.push({ name: comps[i].name, comp: comps[i], on: prevOn.hasOwnProperty(cid) ? prevOn[cid] : true });
            }
            chainSave(ch);
            writeMarkers(ch);

            for (var j = 0; j < comps.length; j++) {
                var comp = comps[j];
                var prevVol = removeMusic(comp);
                var L = comp.layers.add(audio);
                L.comment = TAG;
                L.name = "\u266A Musik";
                L.label = 9;
                L.startTime = 0;
                L.timeRemapEnabled = true;
                L.inPoint = 0;
                L.outPoint = comp.duration;
                if (audio.hasVideo) L.enabled = false;
                L.moveToEnd();
                ensureOne(L, C_SLIDE_VOL, prevVol === null ? 0 : prevVol, 1);
            }
            rebuild(ch);
        } catch (e) {
            alert("Fehler: " + e.toString());
        }
        app.endUndoGroup();
        fillList();
    }

    function setMode(useWA) {
        var ch = chainLoad();
        if (!ch || ch.useWA === useWA) { fillList(); return; }
        app.beginUndoGroup("MusicChain: L\u00E4ngen-Modus");
        ch.useWA = useWA;
        chainSave(ch);
        writeMarkers(ch);
        rebuild(ch);
        app.endUndoGroup();
        fillList();
    }

    function setOn(indices, mode) {
        var ch = chainLoad();
        if (!ch || !indices.length) return;
        app.beginUndoGroup("MusicChain: Musik an/aus");
        for (var k = 0; k < indices.length; k++) {
            var e = ch.entries[indices[k]];
            if (!e) continue;
            e.on = (mode === "toggle") ? !e.on : mode;
            var ls = musicLayers(e.comp);
            for (var m = 0; m < ls.length; m++) ls[m].audioEnabled = e.on;
        }
        chainSave(ch);
        writeMarkers(ch);
        app.endUndoGroup();
        fillList(indices);
    }

    function removeSlides(indices) {
        var ch = chainLoad();
        if (!ch) { alert("Noch keine Musik angelegt."); return; }
        var all = !indices.length || indices.length === ch.entries.length;
        if (all && !confirm("Musik aus allen " + ch.entries.length + " Slides entfernen?")) return;

        app.beginUndoGroup("MusicChain: Entfernen");
        if (all) {
            for (var i = 0; i < ch.entries.length; i++) removeMusic(ch.entries[i].comp);
            var cc = findComp(CTRL_COMP); if (cc) cc.remove();
            var pc = findComp(PREVIEW_COMP); if (pc) pc.remove();
            var f = findItem(FOLDER, FolderItem); if (f && f.numItems === 0) f.remove();
        } else {
            var drop = {};
            for (var k = 0; k < indices.length; k++) drop[indices[k]] = true;
            var keep = [];
            for (var j = 0; j < ch.entries.length; j++) {
                if (drop[j]) removeMusic(ch.entries[j].comp);
                else keep.push(ch.entries[j]);
            }
            ch.entries = keep;
            chainSave(ch);
            writeMarkers(ch);
            rebuild(ch);
        }
        app.endUndoGroup();
        fillList();
    }

    function syncNow(silent) {
        var ch = chainLoad();
        if (!ch) { if (!silent) fillList(); return false; }
        if (silent && markersUpToDate(ch)) return false;
        app.beginUndoGroup(silent ? "MusicChain: Auto-Sync" : "MusicChain: Aktualisieren");
        writeMarkers(ch);
        if (!silent) rebuild(ch);
        app.endUndoGroup();
        fillList();
        return true;
    }

    function openCtrl() {
        var cc = findComp(CTRL_COMP);
        var L = ctrlLayerOf(cc);
        if (!L) { alert("Noch keine Musik angelegt."); return; }
        cc.openInViewer();
        for (var i = 1; i <= cc.numLayers; i++) cc.layer(i).selected = false;
        L.selected = true;
        try {
            var id = app.findMenuCommandId("Effect Controls");
            if (!id) id = app.findMenuCommandId("Effekteinstellungen");
            if (id) app.executeCommand(id);
        } catch (e) {}
    }

    function openSlide(i) {
        var ch = chainLoad();
        if (ch && ch.entries[i] && ch.entries[i].comp) ch.entries[i].comp.openInViewer();
    }

    function buildPreview() {
        var ch = chainLoad();
        if (!ch || !ch.entries.length) { alert("Bitte zuerst Musik anlegen."); return; }
        app.beginUndoGroup("MusicChain: Vorschau");
        var old = findComp(PREVIEW_COMP);
        if (old) old.remove();
        var first = null, total = 0;
        for (var i = 0; i < ch.entries.length; i++) {
            if (!ch.entries[i].comp) continue;
            if (!first) first = ch.entries[i].comp;
            total += slideDur(ch.entries[i], ch.useWA);
        }
        if (!first || total <= 0) { app.endUndoGroup(); alert("Keine Slides gefunden."); return; }
        var pc = app.project.items.addComp(PREVIEW_COMP, first.width, first.height, first.pixelAspect, total, first.frameRate);
        pc.parentFolder = getFolder();
        var acc = 0;
        for (var j = 0; j < ch.entries.length; j++) {
            var e = ch.entries[j];
            if (!e.comp) continue;
            var s = slideStart(e, ch.useWA), d = slideDur(e, ch.useWA);
            var L = pc.layers.add(e.comp);
            L.startTime = acc - s;
            L.inPoint = acc;
            L.outPoint = acc + d;
            acc += d;
        }
        pc.openInViewer();
        app.endUndoGroup();
    }

    // =====================================================================
    // UI
    // =====================================================================
    var win = (thisObj instanceof Panel) ? thisObj
            : new Window("palette", "MusicChain", undefined, { resizeable: true });
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.spacing = 10; win.margins = 12;

    var F_TITLE = ScriptUI.newFont("dialog", "BOLD", 15);
    var F_HEAD = ScriptUI.newFont("dialog", "BOLD", 10);
    var F_SMALL = ScriptUI.newFont("dialog", "REGULAR", 10);
    var F_BLOCK = ScriptUI.newFont("dialog", "BOLD", 10);

    function colorText(st, col, font) {
        var g = st.graphics;
        g.foregroundColor = g.newPen(g.PenType.SOLID_COLOR, col, 1);
        if (font) g.font = font;
    }

    function section(title) {
        var g = win.add("group");
        g.orientation = "column"; g.alignChildren = ["fill", "top"]; g.spacing = 6;
        var h = g.add("group"); h.alignChildren = ["left", "center"]; h.spacing = 8;
        var t = h.add("statictext", undefined, title.toUpperCase());
        colorText(t, COL_ACCENT, F_HEAD);
        var line = h.add("group"); line.alignment = ["fill", "center"]; line.preferredSize.height = 1;
        line.onDraw = function () {
            var gr = this.graphics;
            gr.newPath(); gr.rectPath(0, 0, this.size[0], 1);
            gr.fillPath(gr.newBrush(gr.BrushType.SOLID_COLOR, [1, 1, 1, 0.12]));
        };
        return g;
    }

    // Header
    var hdr = win.add("group"); hdr.alignChildren = ["left", "center"];
    var title = hdr.add("statictext", undefined, "\u266A  MusicChain");
    colorText(title, COL_TEXT, F_TITLE);
    var sub = hdr.add("statictext", undefined, "Musik \u00FCber Slides verteilen");
    colorText(sub, COL_DIM, F_SMALL);

    // Song
    var sSong = section("Song");
    var rowSong = sSong.add("group"); rowSong.alignChildren = ["fill", "center"];
    var dd = rowSong.add("dropdownlist", undefined, []);
    dd.alignment = ["fill", "center"]; dd.preferredSize.width = 220;
    var btnRefresh = rowSong.add("button", undefined, "\u21BB");
    btnRefresh.preferredSize = [30, 24]; btnRefresh.alignment = ["right", "center"];
    btnRefresh.helpTip = "Song-Liste und \u00DCbersicht neu laden";
    var songInfo = sSong.add("statictext", undefined, "");
    songInfo.alignment = ["fill", "top"];
    colorText(songInfo, COL_DIM, F_SMALL);

    var rowMode = sSong.add("group"); rowMode.alignChildren = ["left", "center"];
    var lm = rowMode.add("statictext", undefined, "Slide-L\u00E4nge aus");
    colorText(lm, COL_DIM, F_SMALL);
    var rbWA = rowMode.add("radiobutton", undefined, "Arbeitsbereich");
    var rbDur = rowMode.add("radiobutton", undefined, "Comp-L\u00E4nge");
    rbWA.value = true;
    rbWA.helpTip = rbDur.helpTip = "Kann jederzeit umgeschaltet werden";

    var btnApply = sSong.add("button", undefined, "\u266A  Musik auf markierte Comps legen");
    btnApply.preferredSize.height = 34;
    btnApply.helpTip = "Song wechseln: einfach im Dropdown ausw\u00E4hlen.\nComps im Projektfenster markieren. Reihenfolge = Name (Slide_2 vor Slide_10).\nAn/Aus und Slide-Lautst\u00E4rke bleiben erhalten.";

    // Timeline
    var sTl = section("Timeline");
    var tl = sTl.add("group");
    tl.alignment = ["fill", "top"];
    tl.preferredSize = [330, 54];
    tl.helpTip = "Klick auf eine Slide = Musik an/aus";
    var tlSegs = [];
    var cache = { ch: null, tot: null, song: null, sel: {} };

    tl.onDraw = function () {
        var g = this.graphics, W = this.size[0], H = this.size[1];
        var TOP = 16, BH = H - TOP;
        g.newPath(); g.rectPath(0, TOP, W, BH);
        g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, COL_BG));
        tlSegs = [];
        var ch = cache.ch;
        var dimPen = g.newPen(g.PenType.SOLID_COLOR, COL_DIM, 1);
        if (!ch || !ch.entries.length || cache.tot.all <= 0) {
            g.drawString("Noch keine Musik angelegt", dimPen, 8, TOP + BH / 2 - 7, F_SMALL);
            return;
        }
        var total = cache.tot.all, x = 0;
        var txtPen = g.newPen(g.PenType.SOLID_COLOR, [0.08, 0.08, 0.08, 1], 1);
        var offTxt = g.newPen(g.PenType.SOLID_COLOR, COL_DIM, 1);
        var selPen = g.newPen(g.PenType.SOLID_COLOR, COL_SEL, 2);
        for (var i = 0; i < ch.entries.length; i++) {
            var e = ch.entries[i];
            var w = slideDur(e, ch.useWA) / total * W;
            var col = !e.comp ? COL_WARN : (e.on ? COL_ACCENT : COL_OFF);
            g.newPath(); g.rectPath(x + 1, TOP + 1, Math.max(1, w - 2), BH - 2);
            g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, col));
            if (cache.sel[i]) { g.newPath(); g.rectPath(x + 1, TOP + 1, Math.max(1, w - 2), BH - 2); g.strokePath(selPen); }
            var lbl = pad(i);
            var sz = g.measureString(lbl, F_BLOCK);
            if (w > sz[0] + 4) g.drawString(lbl, e.on ? txtPen : offTxt, x + (w - sz[0]) / 2, TOP + (BH - sz[1]) / 2, F_BLOCK);
            tlSegs.push({ x0: x, x1: x + w, i: i });
            x += w;
        }
        g.drawString("0", dimPen, 0, 0, F_SMALL);
        var endLbl = secs(total);
        g.drawString(endLbl, dimPen, W - g.measureString(endLbl, F_SMALL)[0], 0, F_SMALL);
        if (cache.song) {
            var avail = cache.song.duration - cache.tot.start, acc = 0, sx = 0;
            for (var j = 0; j < ch.entries.length; j++) {
                var ej = ch.entries[j], d = slideDur(ej, ch.useWA), wj = d / total * W;
                if (ej.on) {
                    if (acc + d > avail) {
                        var lx = sx + Math.max(0, (avail - acc)) / d * wj;
                        var wp = g.newPen(g.PenType.SOLID_COLOR, COL_WARN, 2);
                        g.newPath(); g.moveTo(lx, TOP - 4); g.lineTo(lx, H); g.strokePath(wp);
                        var sl = "Song-Ende";
                        var sw = g.measureString(sl, F_SMALL)[0];
                        g.drawString(sl, g.newPen(g.PenType.SOLID_COLOR, COL_WARN, 1), Math.min(Math.max(lx - sw / 2, 30), W - sw - 50), 0, F_SMALL);
                        break;
                    }
                    acc += d;
                }
                sx += wj;
            }
        }
    };

    tl.addEventListener("mousedown", function (ev) {
        var x = ev.clientX;
        for (var k = 0; k < tlSegs.length; k++) {
            if (x >= tlSegs[k].x0 && x < tlSegs[k].x1) { setOn([tlSegs[k].i], "toggle"); return; }
        }
    });

    // Liste
    var sList = section("Slides");
    var lb = sList.add("listbox", undefined, [], {
        multiselect: true, numberOfColumns: 5, showHeaders: true,
        columnTitles: ["Musik", "#", "Comp", "L\u00E4nge", "fps"],
        columnWidths: [58, 30, 120, 90, 42]
    });
    lb.alignment = ["fill", "fill"];
    lb.preferredSize = [340, 220];
    lb.helpTip = "Doppelklick = Musik an/aus";

    var sumTxt = sList.add("statictext", undefined, "", { multiline: false });
    sumTxt.alignment = ["fill", "top"];

    var r1 = sList.add("group"); r1.alignChildren = ["fill", "center"]; r1.spacing = 4;
    var btnOn = r1.add("button", undefined, "\u2714 An");
    var btnOff = r1.add("button", undefined, "\u2013 Aus");
    var btnOpen = r1.add("button", undefined, "\u00D6ffnen");
    var btnDel = r1.add("button", undefined, "Entfernen");
    btnOpen.helpTip = "Markierte Slide-Comp \u00F6ffnen";
    btnDel.helpTip = "Markierte Slides aus der Kette nehmen (Musik-Layer wird gel\u00F6scht).\nOhne Auswahl: alles entfernen.";

    var r2 = sList.add("group"); r2.alignChildren = ["left", "center"];
    var btnSync = r2.add("button", undefined, "Aktualisieren");
    btnSync.helpTip = "L\u00E4ngen neu einlesen, Regler reparieren, Expressions neu schreiben";
    var cbAuto = r2.add("checkbox", undefined, "Auto-Sync");
    cbAuto.helpTip = "Pr\u00FCft jede Sekunde auf ge\u00E4nderte L\u00E4ngen / Arbeitsbereiche (solange das Panel offen ist)";

    // Werkzeuge
    var sTools = section("Werkzeuge");
    var r3 = sTools.add("group"); r3.alignChildren = ["fill", "center"]; r3.spacing = 4;
    var btnCtrl = r3.add("button", undefined, "Regler");
    btnCtrl.helpTip = "\u00D6ffnet MUSIK_STEUERUNG und w\u00E4hlt die Regler-Ebene aus. Effekte siehst du mit F3 (Effekteinstellungen).";
    var btnPrev = r3.add("button", undefined, "Vorschau-Comp");
    btnPrev.helpTip = "Alle Slides hintereinander zum Anh\u00F6ren";

    // ---------- UI-Logik ----------
    function redrawTl() { tl.visible = false; tl.visible = true; }

    function selIdx() {
        var a = [];
        if (!lb.selection) return a;
        var s = lb.selection instanceof Array ? lb.selection : [lb.selection];
        for (var i = 0; i < s.length; i++) a.push(s[i].index);
        return a;
    }

    var items = [];
    var ddLock = false;
    function selectSong(item) {
        ddLock = true;
        var idx = -1;
        for (var i = 0; i < items.length; i++) if (items[i] === item) idx = i;
        if (idx < 0) for (var j = 0; j < items.length; j++) if (cache.song && items[j] === cache.song) idx = j;
        if (idx < 0 && items.length) idx = 0;
        if (idx >= 0) dd.selection = idx;
        ddLock = false;
    }
    function refreshSongs() {
        ddLock = true;
        var keep = dd.selection ? items[dd.selection.index] : null;
        dd.removeAll();
        items = audioItems();
        for (var i = 0; i < items.length; i++) dd.add("item", items[i].name + "   (" + secs(items[i].duration) + ")");
        selectSong(keep);
        ddLock = false;
    }

    var filling = false;
    function fillList(keepSel) {
        filling = true;
        lb.removeAll();
        var ch = null;
        try { ch = chainLoad(); } catch (e) {}
        cache.ch = ch; cache.sel = {};
        cache.tot = ch ? totals(ch) : null;
        cache.song = ch ? songOf(ch) : null;

        if (!ch) {
            sumTxt.text = "Noch keine Musik angelegt.";
            colorText(sumTxt, COL_DIM, F_SMALL);
            songInfo.text = "";
            filling = false; redrawTl();
            return;
        }
        rbWA.value = ch.useWA; rbDur.value = !ch.useWA;

        for (var i = 0; i < ch.entries.length; i++) {
            var e = ch.entries[i];
            var it = lb.add("item", e.on ? "\u2714  an" : "\u2013  aus");
            it.subItems[0].text = pad(i);
            it.subItems[1].text = e.comp ? e.name : e.name + " (fehlt!)";
            it.subItems[2].text = e.comp ? tc(slideDur(e, ch.useWA), e.comp.frameRate) : "\u2013";
            it.subItems[3].text = e.comp ? String(Math.round(e.comp.frameRate * 100) / 100) : "\u2013";
        }
        if (keepSel) for (var k = 0; k < keepSel.length; k++) {
            if (lb.items[keepSel[k]]) { lb.items[keepSel[k]].selected = true; cache.sel[keepSel[k]] = true; }
        }

        var t = cache.tot, status = "", col = COL_DIM;
        if (cache.song) {
            var avail = cache.song.duration - t.start, rest = avail - t.music;
            if (rest >= 0) {
                status = "   \u2714 Song reicht (" + secs(rest) + " Reserve)";
                col = COL_ACCENT;
            } else {
                status = "   \u26A0 Song zu kurz: " + secs(avail) + " verf\u00FCgbar ab Song-Start " + secs(t.start) +
                         ", es fehlen " + secs(-rest);
                col = COL_WARN;
            }
        }
        sumTxt.text = "Mit Musik: " + secs(t.music) + " von " + secs(t.all) + status;
        colorText(sumTxt, col, F_SMALL);

        if (cache.song && items.length) selectSong(cache.song);
        songInfo.text = cache.song ? "Aktiv: " + cache.song.name + "  \u00B7  " + secs(cache.song.duration) +
                        (t.start ? "  \u00B7  Start bei " + secs(t.start) : "") : "";
        filling = false;
        redrawTl();
    }

    // Auto-Sync
    var taskId = null;
    $.global.MusicChainTick = function () {
        try { if (cbAuto.value && app.project) syncNow(true); } catch (e) {}
    };
    cbAuto.onClick = function () {
        if (taskId !== null) { try { app.cancelTask(taskId); } catch (e) {} taskId = null; }
        if (cbAuto.value) taskId = app.scheduleTask("$.global.MusicChainTick()", 1000, true);
    };

    dd.onChange = function () {
        if (ddLock || !dd.selection) return;
        var it = items[dd.selection.index];
        if (cache.ch && cache.song && it !== cache.song) swapSong(it);
    };
    btnRefresh.onClick = function () { refreshSongs(); fillList(); };
    btnApply.onClick = function () { apply(dd.selection ? items[dd.selection.index] : null, rbWA.value); };
    rbWA.onClick = function () { setMode(true); };
    rbDur.onClick = function () { setMode(false); };
    lb.onChange = function () {
        if (filling) return;
        cache.sel = {};
        var s = selIdx();
        for (var i = 0; i < s.length; i++) cache.sel[s[i]] = true;
        redrawTl();
    };
    lb.onDoubleClick = function () { setOn(selIdx(), "toggle"); };
    btnOn.onClick = function () { setOn(selIdx(), true); };
    btnOff.onClick = function () { setOn(selIdx(), false); };
    btnOpen.onClick = function () { var s = selIdx(); if (s.length) openSlide(s[0]); };
    btnDel.onClick = function () { removeSlides(selIdx()); };
    btnSync.onClick = function () { syncNow(false); };
    btnCtrl.onClick = openCtrl;
    btnPrev.onClick = buildPreview;

    refreshSongs();
    fillList();
    cbAuto.value = true;
    cbAuto.onClick();
    win.onResizing = win.onResize = function () { this.layout.resize(); redrawTl(); };
    if (win instanceof Window) {
        win.onClose = function () { if (taskId !== null) try { app.cancelTask(taskId); } catch (e) {} };
        win.center(); win.show();
    } else { win.layout.layout(true); }
})(this);
