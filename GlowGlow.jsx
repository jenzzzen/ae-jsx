/**********************************************************************
 * GlowGlow.jsx  (Deep-Glow-orientiert)
 * ---------------------------------------------------------------
 * Ein-Klick-Glow nach dem Deep-Glow-Prinzip mit AE-Bordmitteln.
 *
 * Aufbau (auf einer Duplikat-Ebene "Glow - [Name]", Modus HINZUFUEGEN):
 *   - Der Glow wird ISOLIERT erzeugt (nur der Schein, ohne Original)
 *     und additiv ueber die unveraenderte Quelle gelegt -> das
 *     Original bleibt scharf.
 *   - Mehrstufiger Glow (4 Oktaven, geometrisch) = weicher, tiefer
 *     Falloff.
 *
 * Regler auf der "Glow"-Ebene:
 *   Belichtung (0-100), Radius, Schwellenwert,
 *   Flacker-Tempo, Flacker-Staerke (0 = kein Flackern),
 *   Einfaerben (Checkbox), Glow-Farbe, Faerbung (0-100).
 *
 * Faerbung:
 *   Ein Toenung-Effekt (ADBE Tint) sitzt am ENDE der Effektkette,
 *   faerbt also nur den isolierten Schein - das Original bleibt
 *   farblich unangetastet. Checkbox aus = keinerlei Wirkung.
 *   "Faerbung" mischt zwischen Originalfarbe des Scheins (0) und
 *   voller Einfaerbung (100).
 *
 * Belichtungs-Kennlinie: quadratisch -> im unteren Bereich fein
 * dosierbar, nach oben genug Reserve.
 *   ca.  25 = sehr dezent
 *        50 = moderat (Standard)
 *        75 = kraeftig
 *       100 = sehr stark
 *
 * HINWEIS: Kein GPU/HDR-Tonemapping wie im Original-Plugin -
 * Naeherung mit Bordmitteln, dafuer ohne Plugin.
 **********************************************************************/

(function GlowGlowScript(thisObj) {

    var SCRIPT_NAME = "GlowGlow";
    var TAG = "GLOWGEN";

    var DEF = {
        exposure: 50, radius: 40, threshold: 50, fspeed: 10, famount: 0,
        tintOn: false,                 // konservativ: Faerbung ist erst mal aus
        tintColor: [1, 0.82, 0.55],    // warmes Licht als Startfarbe
        tintAmount: 100
    };

    // ---- matchNames ------------------------------------------------
    var GLOW = "ADBE Glo2";
    var G_THRESH = "ADBE Glo2-0002", G_RADIUS = "ADBE Glo2-0003",
        G_INTENS = "ADBE Glo2-0004", G_COMPOSITE = "ADBE Glo2-0005";
    var COMPOSITE_NONE = 3; // 1=Darueber, 2=Dahinter, 3=Ohne (nur Glow)

    var TINT = "ADBE Tint";
    var T_WHITE = "ADBE Tint-0002",   // "Zuordnen zu Weiss"
        T_AMOUNT = "ADBE Tint-0003";  // "Betrag zum Toenen"

    var SLD = "ADBE Slider Control-0001";
    var CHK = "ADBE Checkbox Control-0001";
    var COL = "ADBE Color Control-0001";

    var NM_EXP = "Belichtung", NM_RAD = "Radius", NM_THR = "Schwellenwert",
        NM_FLICK_SPD = "Flacker-Tempo", NM_FLICK_AMT = "Flacker-Staerke",
        NM_TINT_ON = "Einfaerben", NM_TINT_COL = "Glow-Farbe", NM_TINT_AMT = "Faerbung";

    // ---- Hilfen ----------------------------------------------------
    function errStr(e) { try { return (e && e.message) ? e.message : ("" + e); } catch (x) { return "Fehler (nicht lesbar)"; } }
    function propMN(root, mn) { try { return root.property(mn); } catch (e) { return null; } }

    // matchName zuerst, notfalls ueber den Index (matchNames sind nicht
    // ueber alle AE-Versionen zuverlaessig)
    function propAny(root, mn, idx) {
        var p = propMN(root, mn);
        if (!p && idx) { try { p = root.property(idx); } catch (e) { p = null; } }
        return p;
    }
    function setAny(root, mn, idx, val, log, label) {
        var p = propAny(root, mn, idx);
        if (p) { try { p.setValue(val); } catch (e) { if (log) log.push("SET " + (label || mn) + ": " + errStr(e)); } }
        else if (log) log.push("PROP fehlt: " + (label || mn));
    }
    function exprAny(root, mn, idx, ex, log, label) {
        var p = propAny(root, mn, idx);
        if (p) { try { p.expression = ex; } catch (e) { if (log) log.push("EXPR " + (label || mn) + ": " + errStr(e)); } }
        else if (log) log.push("PROP fehlt: " + (label || mn));
    }
    function setMN(root, mn, val, log, label) { setAny(root, mn, null, val, log, label); }
    function exprMN(root, mn, ex, log, label) { exprAny(root, mn, null, ex, log, label); }

    function addCtrl(layer, type, name, valMN, val) {
        var e = layer.property("ADBE Effect Parade").addProperty(type);
        e.name = name;
        try { e.property(valMN).setValue(val); } catch (x) {}
        return e;
    }
    function checkExpr(root, mn, label, log) {
        var p = propMN(root, mn); if (!p) return;
        try { var v = p.value; var er = p.expressionError; if (er && ("" + er).length > 0) log.push(label + " -> " + er); }
        catch (e) { log.push(label + " (Zugriff): " + errStr(e)); }
    }

    // ---- Glow bauen ------------------------------------------------
    function createGlow(comp, src, o, log) {
        var glow = src.duplicate();
        glow.name = "Glow - " + src.name;
        glow.comment = TAG;
        try { glow.label = 10; } catch (e) {}
        glow.moveBefore(src); // ueber dem Original

        // Regler
        addCtrl(glow, "ADBE Slider Control", NM_EXP, SLD, o.exposure);
        addCtrl(glow, "ADBE Slider Control", NM_RAD, SLD, o.radius);
        addCtrl(glow, "ADBE Slider Control", NM_THR, SLD, o.threshold);
        addCtrl(glow, "ADBE Slider Control", NM_FLICK_SPD, SLD, o.fspeed);
        addCtrl(glow, "ADBE Slider Control", NM_FLICK_AMT, SLD, o.famount);
        addCtrl(glow, "ADBE Checkbox Control", NM_TINT_ON, CHK, o.tintOn);
        addCtrl(glow, "ADBE Color Control", NM_TINT_COL, COL, o.tintColor);
        addCtrl(glow, "ADBE Slider Control", NM_TINT_AMT, SLD, o.tintAmount);

        var fx = glow.property("ADBE Effect Parade");

        // Flacker-Faktor (gemeinsam fuer alle Oktaven -> synchron)
        // Flacker-Staerke 0 = kein Flackern (keine Checkbox noetig)
        var FLICK =
            'var _a=0,_sp=10;' +
            'try{_a=effect("' + NM_FLICK_AMT + '")("' + SLD + '")/100;}catch(e){}' +
            'try{_sp=effect("' + NM_FLICK_SPD + '")("' + SLD + '");}catch(e){}' +
            'var _f=1;if(_a>0){_f=Math.max(0,1+_a*noise(time*_sp));}';

        // Belichtung 0-100 -> quadratische Kennlinie (fein im unteren Bereich)
        // base = (v/100)^2 * 2 * Gewicht   (bei 50 ca. 0.5 * Gewicht)
        function intensExpr(weight) {
            return 'var v;try{v=effect("' + NM_EXP + '")("' + SLD + '");}catch(e){v=' + o.exposure + ';}' +
                   'var n=Math.max(0,v)/100;var base=n*n*2*' + weight + ';' +
                   FLICK + 'Math.max(0,base*_f);';
        }
        function radiusExpr(mult) {
            return 'var v;try{v=effect("' + NM_RAD + '")("' + SLD + '");}catch(e){v=' + o.radius + ';}' +
                   'Math.max(0,v*' + mult + ');';
        }
        var threshExpr = 'var v;try{v=effect("' + NM_THR + '")("' + SLD + '");}catch(e){v=' + o.threshold + ';}' +
                         'Math.min(100,Math.max(0,v));';

        // strip=true: nur den Schein ausgeben (Composite "Ohne")
        function addOctave(name, radMult, weight, useThresh, strip) {
            var g = null;
            try { g = fx.addProperty(GLOW); g.name = name; } catch (e) { log.push(name + " anlegen: " + errStr(e)); }
            if (useThresh) exprMN(g, G_THRESH, threshExpr, log, name + " Schwelle");
            else setMN(g, G_THRESH, 0, log, name + " Schwelle");
            exprMN(g, G_RADIUS, radiusExpr(radMult), log, name + " Radius");
            exprMN(g, G_INTENS, intensExpr(weight), log, name + " Intensitaet");
            if (strip) setMN(g, G_COMPOSITE, COMPOSITE_NONE, log, name + " nur-Glow");
            return g;
        }

        var g1 = addOctave("Glow (eng)",    0.4, 0.80, true,  true);
        var g2 = addOctave("Glow (mittel)", 0.9, 0.50, false, false);
        var g3 = addOctave("Glow (breit)",  1.8, 0.35, false, false);
        var g4 = addOctave("Glow (weit)",   3.6, 0.22, false, false);

        // ---- Faerbung (am Ende der Kette: faerbt nur den Schein) ----
        var tint = null;
        try { tint = fx.addProperty(TINT); tint.name = "Faerbung"; }
        catch (e) { log.push("Toenung anlegen: " + errStr(e)); }

        if (tint) {
            // Zuordnen zu Weiss -> Color Control
            var whiteExpr =
                'var c=[1,1,1,1];' +
                'try{c=effect("' + NM_TINT_COL + '")("' + COL + '");}catch(e){}' +
                'c;';
            // Betrag zum Toenen -> Checkbox * Slider  (Checkbox aus = 0 = wirkungslos)
            var amtExpr =
                'var on=0,a=100;' +
                'try{on=effect("' + NM_TINT_ON + '")("' + CHK + '");}catch(e){}' +
                'try{a=effect("' + NM_TINT_AMT + '")("' + SLD + '");}catch(e){}' +
                'on ? Math.min(100,Math.max(0,a)) : 0;';

            exprAny(tint, T_WHITE, 2, whiteExpr, log, "Faerbung Farbe");
            exprAny(tint, T_AMOUNT, 3, amtExpr, log, "Faerbung Betrag");
        }

        // Additiv ueber das Original
        try { glow.blendingMode = BlendingMode.ADD; } catch (e) { log.push("Blendmodus: " + errStr(e)); }

        // Selbstdiagnose
        checkExpr(g1, G_INTENS, "Glow (eng) Intensitaet", log);
        checkExpr(g4, G_RADIUS, "Glow (weit) Radius", log);
        if (tint) {
            checkExpr(tint, T_WHITE, "Faerbung Farbe", log);
            checkExpr(tint, T_AMOUNT, "Faerbung Betrag", log);
        }
        return glow;
    }

    // ---- Aktion ----------------------------------------------------
    function run() {
        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) { alert("Bitte eine Komposition auswaehlen."); return; }
        var sel = comp.selectedLayers;
        if (sel.length === 0) { alert("Bitte mindestens eine Ebene auswaehlen."); return; }
        app.beginUndoGroup(SCRIPT_NAME);
        var log = [], made = null;
        try {
            for (var i = 0; i < sel.length; i++) { if (sel[i].comment === TAG) continue; made = createGlow(comp, sel[i], DEF, log); }
            if (made) made.selected = true;
        } catch (e) {
            var lt = ""; try { if (e && e.line) lt = " (Zeile " + e.line + ")"; } catch (x) {}
            log.push("ABBRUCH: " + errStr(e) + lt);
        }
        app.endUndoGroup();
        if (log.length > 0) alert(SCRIPT_NAME + " - Diagnose:\n\n" + log.join("\n") + "\n\n(Bitte diese Meldung 1:1 zurueckmelden.)");
    }

    // ---- UI (ein Button) -------------------------------------------
    function buildUI(thisObj) {
        var pal = (thisObj instanceof Panel) ? thisObj
            : new Window("palette", SCRIPT_NAME, undefined, { resizeable: true });
        pal.orientation = "column"; pal.alignChildren = ["fill", "top"];
        pal.spacing = 10; pal.margins = 14;

        var title = pal.add("statictext", undefined, "GlowGlow");
        try { title.graphics.font = ScriptUI.newFont("dialog", "BOLD", 14); } catch (x) {}

        var info = pal.add("statictext", undefined, "Ebene(n) auswaehlen > Parameter einstellen", { multiline: true });
        info.preferredSize.height = 18;

        var btn = pal.add("button", undefined, "Glow erstellen");
        btn.onClick = function () { run(); };

        pal.layout.layout(true);
        pal.onResizing = pal.onResize = function () { this.layout.resize(); };
        return pal;
    }

    var ui = buildUI(thisObj);
    if (ui instanceof Window) { ui.center(); ui.show(); }

})(this);
