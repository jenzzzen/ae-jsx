/**********************************************************************
 * TextureLoop.jsx
 * ---------------------------------------------------------------
 * Animiert Textur-Ebenen zu einem zufaelligen "Loop": Die Textur
 * versetzt/dreht/zoomt sich in einem einstellbaren Takt (FPS), ohne
 * dass an den Raendern Luecken entstehen (gespiegelte Kacheln).
 *
 * WICHTIG: Alle Bewegungs-Regler stehen anfangs auf 0 -> direkt nach
 * dem Anwenden passiert NICHTS, bis du bewusst einen Wert hochziehst.
 *
 * Regler auf der Ebene:
 *   FPS            : Takt der zufaelligen Aenderung (Bilder/Sek.)
 *   Rotation       : max. zufaellige Drehung pro Takt (+/- Grad; 0 = aus)
 *   Offset Geschw. : gleichmaessiges Scrollen (px/Sek.; 0 = aus)
 *   Offset Richtung: Scroll-Richtung (Winkel)
 *   Mirror Edges   : Kachelraender spiegeln (nahtlos)
 *   + Levels-Stufe zum Anpassen von Kontrast/Helligkeit.
 *
 * Technik: Versatz ueber das Kachel-Zentrum von Motion Tile (nahtlos);
 * Textur-Zoom ueber die Kachelgroesse (deckt weiter voll); Rotation
 * ueber die Ebenendrehung mit EXAKTER Deckungs-Skalierung (aus der
 * aktuellen Drehung berechnet). Alles ueber Seed reproduzierbar.
 **********************************************************************/

(function TextureLoop(thisObj) {

    var SCRIPT_NAME = "TextureLoop";
    var TAG = "TEXLOOP";

    var TILE = "ADBE Tile";
    var LEVELS = "ADBE Easy Levels2";
    var SLD = "ADBE Slider Control-0001", CHK = "ADBE Checkbox Control-0001", ANG = "ADBE Angle Control-0001";

    var NM_FPS="FPS", NM_ROT="Rotation", NM_AUTOSCALE="Auto Scale",
        NM_OFF_SPD="Offset Geschwindigkeit", NM_OFF_DIR="Offset Richtung", NM_MIRROR="Mirror Edges";

    // Alle Bewegungswerte 0 -> nach dem Anwenden passiert nichts
    var DEF = { fps: 12, rot: 0, autoScale: 1, offSpd: 0, offDir: 0, mirror: 1 };
    var STRUCT = [];

    // ---- Hilfen ----------------------------------------------------
    function errStr(e) { try { return (e && e.message) ? e.message : ("" + e); } catch (x) { return "Fehler (nicht lesbar)"; } }
    function propMN(root, mn) { try { return root.property(mn); } catch (e) { return null; } }
    function exprMN(root, mn, ex, log, label) {
        var p = propMN(root, mn);
        if (p) { try { p.expression = ex; } catch (e) { if (log) log.push("EXPR " + (label || mn) + ": " + errStr(e)); } }
        else if (log) log.push("PROP fehlt: " + (label || mn));
    }
    function findDeep(group, re) {
        if (!group) return null;
        var n = 0; try { n = group.numProperties; } catch (e) { return null; }
        for (var i = 1; i <= n; i++) {
            var p = null; try { p = group.property(i); } catch (e) {}
            if (!p) continue;
            var nm = ""; try { nm = p.name; } catch (e) {}
            if (re.test(nm)) return p;
            var isGroup = false;
            try { isGroup = (p.propertyType === PropertyType.INDEXED_GROUP || p.propertyType === PropertyType.NAMED_GROUP); } catch (e) {}
            if (isGroup) { var r = findDeep(p, re); if (r) return r; }
        }
        return null;
    }
    function exprP(p, ex, log, label) {
        if (p) { try { p.expression = ex; } catch (e) { if (log) log.push("EXPR " + label + ": " + errStr(e)); } }
        else if (log) log.push("nicht gefunden: " + label);
    }
    function addCtrl(layer, type, name, valMN, val) {
        var e = layer.property("ADBE Effect Parade").addProperty(type);
        e.name = name;
        try { e.property(valMN).setValue(val); } catch (x) {}
    }
    function checkExpr(root, mn, label, log) {
        var p = propMN(root, mn); if (!p) return;
        try { var v = p.value; var er = p.expressionError; if (er && ("" + er).length > 0) log.push(label + " -> " + er); }
        catch (e) { log.push(label + " (Zugriff): " + errStr(e)); }
    }
    function dumpGroup(group, prefix) {
        var out = []; if (!group) { out.push(prefix + " = (nicht vorhanden)"); return out; }
        var n = 0; try { n = group.numProperties; } catch (e) { return out; }
        for (var i = 1; i <= n; i++) { var p = null, nm = "(?)"; try { p = group.property(i); } catch (e) {} try { nm = p ? p.name : "(null)"; } catch (e) {} out.push(prefix + "[" + i + "] = " + nm); }
        return out;
    }

    // Takt-Vorspann: _f (FPS), _k (Schrittnummer)
    var STEP = 'var _f=Math.max(1,effect("' + NM_FPS + '")("' + SLD + '"));var _k=Math.floor(time*_f);';

    // ---- Anwenden --------------------------------------------------
    function apply(layer, o, log) {
        if (!(layer instanceof AVLayer)) { log.push("uebersprungen (keine AV-Ebene): " + layer.name); return; }
        layer.comment = TAG;
        try { layer.label = 5; } catch (e) {}

        // Regler
        addCtrl(layer, "ADBE Slider Control", NM_FPS, SLD, o.fps);
        addCtrl(layer, "ADBE Angle Control", NM_ROT, ANG, o.rot);
        addCtrl(layer, "ADBE Checkbox Control", NM_AUTOSCALE, CHK, o.autoScale);
        addCtrl(layer, "ADBE Slider Control", NM_OFF_SPD, SLD, o.offSpd);
        addCtrl(layer, "ADBE Angle Control", NM_OFF_DIR, ANG, o.offDir);
        addCtrl(layer, "ADBE Checkbox Control", NM_MIRROR, CHK, o.mirror);

        var fx = layer.property("ADBE Effect Parade");

        // Motion Tile
        var mt = null;
        try { mt = fx.addProperty(TILE); } catch (e) { log.push("Motion Tile anlegen: " + errStr(e)); }
        STRUCT = dumpGroup(mt, "TILE");
        exprP(findDeep(mt, /mirror edges|spiegelr.nder/i),
            'effect("' + NM_MIRROR + '")("' + CHK + '");', log, "Mirror Edges");
        // Kachel-Zentrum = gleichmaessiges gerichtetes Scrollen (kein Random)
        exprP(findDeep(mt, /tile center|mittelpunkt/i),
            'var _sp=effect("' + NM_OFF_SPD + '")("' + SLD + '");' +
            'var _d=effect("' + NM_OFF_DIR + '")("' + ANG + '")*Math.PI/180;' +
            'value+[Math.cos(_d)*_sp*time, Math.sin(_d)*_sp*time];', log, "Offset (Scroll)");

        // Levels-Stufe
        try { fx.addProperty(LEVELS).name = "Levels"; } catch (e) { log.push("Levels anlegen: " + errStr(e)); }

        // Rotation: einfache zufaellige Drehung (+/- Winkel), 0 = aus
        var tg = layer.property("ADBE Transform Group");
        exprMN(tg, "ADBE Rotate Z",
            STEP + 'var _r=effect("' + NM_ROT + '")("' + ANG + '");' +
            'if(_r!=0){seedRandom(_k*2+1,true);value+random(-_r,_r);}else{value;}',
            log, "Rotation");

        // Skalierung = EXAKTE Deckung der aktuellen Drehung (nur bei "Auto Scale")
        exprMN(tg, "ADBE Scale",
            'var _on=1;try{_on=effect("' + NM_AUTOSCALE + '")("' + CHK + '");}catch(e){}' +
            'if(_on){' +
            'var _rot=transform.rotation;var _th=_rot*Math.PI/180;' +
            'var _c=Math.abs(Math.cos(_th)),_sn=Math.abs(Math.sin(_th));' +
            'var _w=thisComp.width,_h=thisComp.height;' +
            'var _cov=Math.max((_w*_c+_h*_sn)/_w,(_w*_sn+_h*_c)/_h);' +
            '[value[0]*_cov, value[1]*_cov];' +
            '}else{value;}', log, "Skalierung (Auto Scale)");

        checkExpr(tg, "ADBE Rotate Z", "Rotation", log);
        checkExpr(tg, "ADBE Scale", "Skalierung", log);
    }

    // ---- Aktion ----------------------------------------------------
    function run() {
        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) { alert("Bitte eine Komposition auswaehlen."); return; }
        var sel = comp.selectedLayers;
        if (sel.length === 0) { alert("Bitte mindestens eine Textur-Ebene auswaehlen."); return; }
        app.beginUndoGroup(SCRIPT_NAME);
        var log = [];
        try { for (var i = 0; i < sel.length; i++) apply(sel[i], DEF, log); }
        catch (e) {
            var lt = ""; try { if (e && e.line) lt = " (Zeile " + e.line + ")"; } catch (x) {}
            log.push("ABBRUCH: " + errStr(e) + lt);
        }
        app.endUndoGroup();
        if (log.length > 0) alert("TextureLoop - Diagnose:\n\n" + log.join("\n") +
            "\n\n--- Struktur (Motion Tile) ---\n" + STRUCT.join("\n") +
            "\n\n(Bitte diese Meldung 1:1 zurueckmelden.)");
    }

    // ---- UI --------------------------------------------------------
    function buildUI(thisObj) {
        var pal = (thisObj instanceof Panel) ? thisObj
            : new Window("palette", SCRIPT_NAME, undefined, { resizeable: true });
        pal.orientation = "column"; pal.alignChildren = ["fill", "top"];
        pal.spacing = 10; pal.margins = 14;

        var title = pal.add("statictext", undefined, "TextureLoop");
        try { title.graphics.font = ScriptUI.newFont("dialog", "BOLD", 14); } catch (x) {}

        var info = pal.add("statictext", undefined, "Textur-Ebene(n) auswaehlen > Parameter einstellen", { multiline: true });
        info.preferredSize.height = 18;

        var btn = pal.add("button", undefined, "TextureLoop anwenden");
        btn.onClick = function () { run(); };

        pal.layout.layout(true);
        pal.onResizing = pal.onResize = function () { this.layout.resize(); };
        return pal;
    }

    var ui = buildUI(thisObj);
    if (ui instanceof Window) { ui.center(); ui.show(); }

})(this);
