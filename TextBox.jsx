/**********************************************************************
 * TextBox.jsx  -  v2
 * ---------------------------------------------------------------
 * Ein-Klick-Textbox: legt hinter jede ausgewaehlte Text-Ebene eine
 * automatische Box an, die per sourceRectAtTime() live mit dem Text
 * waechst/schrumpft.
 *
 * Die Box wird an die Text-Ebene geparentet (erbt Position/Skalierung/
 * Drehung); die Expressions referenzieren thisLayer.parent - kein
 * Ebenenname noetig.
 *
 * PADDING (additiv, daher "beides auf einmal" moeglich):
 *   Abstand (Alle)  -> wirkt auf alle vier Seiten
 * + Abstand X       -> links + rechts
 * + Abstand Y       -> oben  + unten
 * + Extra Links / Extra Rechts / Extra Oben / Extra Unten
 *   Ergebnis: L = Alle + X + ExtraLinks   usw.
 *   Alle Werte duerfen auch negativ sein.
 *
 * NEU in v2:
 *  - Asymmetrisches Padding verschiebt die Box korrekt mit
 *    (Mitte wandert um (R-L)/2 bzw. (B-T)/2).
 *  - Reglerabfrage per matchName MIT Index-Fallback (deutsche AE).
 *  - Erzwungene Abhaengigkeit auf sourceText -> Box aktualisiert
 *    sich auch, wenn der Text per Expression/Keyframe wechselt.
 *  - Uebernimmt den 3D-Status der Textebene, setzt das Transform der
 *    Box auf Identitaet und warnt bei Keyframes/Expressions darauf.
 *  - Selbstdiagnose: das Skript rechnet Soll-Groesse/Soll-Position
 *    nach und meldet Abweichungen zur Expression.
 *  - Zweiter Lauf auf derselben Textebene erzeugt KEINE zweite Box,
 *    sondern aktualisiert (und repariert) die vorhandene.
 *
 * NUTZUNG: Text-Ebene(n) auswaehlen -> Button "TextBox erstellen".
 **********************************************************************/

(function TextBox(thisObj) {

    var SCRIPT_NAME = "TextBox";
    var TAG = "TBGEN";

    // Feste Startwerte (danach pro Ebene in den Effekten einstellbar)
    var DEF = {
        all: 0, padX: 24, padY: 14,
        exL: 0, exR: 0, exT: 0, exB: 0,
        round: 0, opacity: 100, color: [0, 0, 0, 1], strokeW: 3
    };

    var NM_ALL = "Abstand (Alle)", NM_PADX = "Abstand X", NM_PADY = "Abstand Y",
        NM_EXL = "Extra Links", NM_EXR = "Extra Rechts",
        NM_EXT = "Extra Oben", NM_EXB = "Extra Unten",
        NM_ROUND = "Rundheit", NM_OPAC = "Deckkraft", NM_COLOR = "Farbe",
        NM_STRK = "Kontur", NM_STRKW = "Konturbreite", NM_STRKC = "Konturfarbe";

    var SLD = "ADBE Slider Control-0001", COL = "ADBE Color Control-0001",
        CHK = "ADBE Checkbox Control-0001";

    // =================================================================
    // kleine Helfer (Skript-Seite)
    // =================================================================
    function ensureCtrl(layer, type, name, valMN, val) {
        var par = layer.property("ADBE Effect Parade");
        var e = null;
        try { e = par.property(name); } catch (x) { e = null; }
        if (!e) {
            e = par.addProperty(type);
            e.name = name;
            try { e.property(valMN).setValue(val); }
            catch (x) { try { e.property(1).setValue(val); } catch (y) {} }
        }
        return e;
    }

    // Reglerwert lesen - matchName zuerst, dann Index 1 (deutsche AE)
    function ctrlVal(layer, name, mn, def) {
        var e = null;
        try { e = layer.property("ADBE Effect Parade").property(name); } catch (x) { return def; }
        if (!e) return def;
        try { return e.property(mn).value; } catch (x) {}
        try { return e.property(1).value; } catch (x) {}
        return def;
    }

    function setVal(parent, mn, val, log, label) {
        try { parent.property(mn).setValue(val); }
        catch (x) { if (log) log.push("SET " + (label || mn) + ": " + x.toString()); }
    }
    function setExpr(parent, mn, ex, log, label) {
        try { parent.property(mn).expression = ex; }
        catch (x) { if (log) log.push("EXPR " + (label || mn) + ": " + x.toString()); }
    }
    function checkExpr(parent, mn, label, log) {
        try {
            var p = parent.property(mn);
            var er = p.expressionError;
            if (er && ("" + er).length > 0) log.push(label + " -> " + er);
        } catch (x) { log.push(label + " (Zugriff): " + x.toString()); }
    }
    function near(a, b, tol) { return Math.abs(a - b) <= tol; }

    // =================================================================
    // Expression-Bausteine
    // =================================================================
    // Universeller Reglerzugriff in der Expression:
    // erst matchName, dann Index 1 -> unabhaengig von der Sprachversion.
    var EXHELP =
        'function tbGet(n,mn,d){var e;try{e=effect(n);}catch(er){return d;}' +
        'if(!e)return d;' +
        'try{return e(mn).value;}catch(er){}' +
        'try{return e(1).value;}catch(er){}return d;}';

    // Padding-Auswertung: pL/pR/pT/pB
    var EXPAD =
        'var pA=tbGet("' + NM_ALL + '","' + SLD + '",' + DEF.all + ');' +
        'var pX=tbGet("' + NM_PADX + '","' + SLD + '",' + DEF.padX + ');' +
        'var pY=tbGet("' + NM_PADY + '","' + SLD + '",' + DEF.padY + ');' +
        'var pL=pA+pX+tbGet("' + NM_EXL + '","' + SLD + '",0);' +
        'var pR=pA+pX+tbGet("' + NM_EXR + '","' + SLD + '",0);' +
        'var pT=pA+pY+tbGet("' + NM_EXT + '","' + SLD + '",0);' +
        'var pB=pA+pY+tbGet("' + NM_EXB + '","' + SLD + '",0);';

    // Quell-Rechteck der Elternebene holen.
    // Der Zugriff auf sourceText erzwingt eine Abhaengigkeit -> AE
    // rechnet neu, wenn sich der Textinhalt aendert (kein Versatz).
    var EXRECT =
        'var t=thisLayer.parent;var r=null;' +
        'if(t){try{t.text.sourceText;}catch(er){}' +
        'try{r=t.sourceRectAtTime(time,false);}catch(er){r=null;}}' +
        'if(!r)r={left:-100,top:-40,width:200,height:80};';

    // =================================================================
    // Regler anlegen / sicherstellen
    // =================================================================
    function ensureAllCtrls(shape, o) {
        ensureCtrl(shape, "ADBE Slider Control", NM_ALL, SLD, o.all);
        ensureCtrl(shape, "ADBE Slider Control", NM_PADX, SLD, o.padX);
        ensureCtrl(shape, "ADBE Slider Control", NM_PADY, SLD, o.padY);
        ensureCtrl(shape, "ADBE Slider Control", NM_EXL, SLD, o.exL);
        ensureCtrl(shape, "ADBE Slider Control", NM_EXR, SLD, o.exR);
        ensureCtrl(shape, "ADBE Slider Control", NM_EXT, SLD, o.exT);
        ensureCtrl(shape, "ADBE Slider Control", NM_EXB, SLD, o.exB);
        ensureCtrl(shape, "ADBE Slider Control", NM_ROUND, SLD, o.round);
        ensureCtrl(shape, "ADBE Color Control", NM_COLOR, COL, o.color);
        ensureCtrl(shape, "ADBE Slider Control", NM_OPAC, SLD, o.opacity);
        ensureCtrl(shape, "ADBE Checkbox Control", NM_STRK, CHK, 0);
        ensureCtrl(shape, "ADBE Slider Control", NM_STRKW, SLD, o.strokeW);
        ensureCtrl(shape, "ADBE Color Control", NM_STRKC, COL, [1, 1, 1, 1]);
    }

    // =================================================================
    // Transform der Box auf Identitaet (Box sitzt dann exakt auf dem
    // Ankerpunkt der Textebene - Basis der ganzen Rechnung)
    // =================================================================
    function resetTransform(shape, textLayer, log) {
        try { if (textLayer) shape.threeDLayer = textLayer.threeDLayer; } catch (x) {}
        var d3 = false;
        try { d3 = shape.threeDLayer; } catch (x) {}

        var tg = shape.property("ADBE Transform Group");

        // Warnen, wenn das Transform der Box "verbogen" ist
        var names = ["ADBE Anchor Point", "ADBE Position", "ADBE Scale", "ADBE Rotate Z"];
        var labels = ["Ankerpunkt", "Position", "Skalierung", "Drehung"];
        for (var i = 0; i < names.length; i++) {
            try {
                var p = tg.property(names[i]);
                if (p.numKeys > 0)
                    log.push("WARNUNG: " + shape.name + " - " + labels[i] + " hat Keyframes (Box kann verrutschen).");
                else if (p.expressionEnabled)
                    log.push("WARNUNG: " + shape.name + " - " + labels[i] + " hat eine Expression (Box kann verrutschen).");
            } catch (x) {}
        }

        setVal(tg, "ADBE Anchor Point", d3 ? [0, 0, 0] : [0, 0], log, "Ankerpunkt");
        setVal(tg, "ADBE Position", d3 ? [0, 0, 0] : [0, 0], log, "Position(Ebene)");
        setVal(tg, "ADBE Scale", d3 ? [100, 100, 100] : [100, 100], log, "Skalierung");
        setVal(tg, "ADBE Rotate Z", 0, log, "Drehung");
        if (d3) {
            setVal(tg, "ADBE Orientation", [0, 0, 0], log, "Ausrichtung");
            setVal(tg, "ADBE Rotate X", 0, log, "Drehung X");
            setVal(tg, "ADBE Rotate Y", 0, log, "Drehung Y");
        }
    }

    // =================================================================
    // Expressions setzen
    // =================================================================
    function applyExpressions(shape, log) {
        var gc;
        try {
            gc = shape.property("ADBE Root Vectors Group")
                      .property("ADBE Vector Group")
                      .property("ADBE Vectors Group");
        } catch (x) { log.push("Gruppe nicht gefunden (" + shape.name + "): " + x.toString()); return null; }

        var rect = gc.property("ADBE Vector Shape - Rect");
        var stroke = gc.property("ADBE Vector Graphic - Stroke");
        var fill = gc.property("ADBE Vector Graphic - Fill");
        if (!rect || !fill) { log.push("Rechteck/Fuellung fehlt in " + shape.name); return null; }

        setExpr(rect, "ADBE Vector Rect Size",
            EXHELP + EXPAD + EXRECT +
            '[Math.max(0,r.width+pL+pR),Math.max(0,r.height+pT+pB)];',
            log, "Groesse");

        setExpr(rect, "ADBE Vector Rect Position",
            EXHELP + EXPAD + EXRECT +
            'var a=[0,0];if(t){try{a=t.transform.anchorPoint;}catch(er){}}' +
            '[r.left+r.width/2+(pR-pL)/2-a[0],r.top+r.height/2+(pB-pT)/2-a[1]];',
            log, "Position");

        setExpr(rect, "ADBE Vector Rect Roundness",
            EXHELP + 'Math.max(0,tbGet("' + NM_ROUND + '","' + SLD + '",' + DEF.round + '));',
            log, "Rundheit");

        setExpr(fill, "ADBE Vector Fill Color",
            EXHELP + 'tbGet("' + NM_COLOR + '","' + COL + '",[0,0,0,1]);',
            log, "Fuellfarbe");

        if (stroke) {
            setExpr(stroke, "ADBE Vector Stroke Color",
                EXHELP + 'tbGet("' + NM_STRKC + '","' + COL + '",[1,1,1,1]);',
                log, "Konturfarbe");

            setExpr(stroke, "ADBE Vector Stroke Width",
                EXHELP +
                'var on=tbGet("' + NM_STRK + '","' + CHK + '",0);' +
                'var sw=tbGet("' + NM_STRKW + '","' + SLD + '",' + DEF.strokeW + ');' +
                'on?Math.max(0,sw):0;',
                log, "Konturbreite");
        }

        setExpr(shape.property("ADBE Transform Group"), "ADBE Opacity",
            EXHELP + 'clamp(tbGet("' + NM_OPAC + '","' + SLD + '",' + DEF.opacity + '),0,100);',
            log, "Deckkraft");

        return rect;
    }

    // =================================================================
    // Selbstdiagnose: Soll-Werte im Skript nachrechnen und vergleichen
    // =================================================================
    function verify(shape, rect, log) {
        var t = shape.parent;
        if (!t) { log.push("HINWEIS: '" + shape.name + "' hat keine Eltern-Ebene - Box kann nicht ausgerichtet werden."); return; }

        checkExpr(rect, "ADBE Vector Rect Size", "Groesse", log);
        checkExpr(rect, "ADBE Vector Rect Position", "Position", log);

        var comp = shape.containingComp;
        var r, ap;
        try {
            r = t.sourceRectAtTime(comp.time, false);
            ap = t.property("ADBE Transform Group").property("ADBE Anchor Point").value;
        } catch (x) { log.push("Pruefung " + shape.name + ": " + x.toString()); return; }

        var pA = ctrlVal(shape, NM_ALL, SLD, DEF.all);
        var pX = ctrlVal(shape, NM_PADX, SLD, DEF.padX);
        var pY = ctrlVal(shape, NM_PADY, SLD, DEF.padY);
        var pL = pA + pX + ctrlVal(shape, NM_EXL, SLD, 0);
        var pR = pA + pX + ctrlVal(shape, NM_EXR, SLD, 0);
        var pT = pA + pY + ctrlVal(shape, NM_EXT, SLD, 0);
        var pB = pA + pY + ctrlVal(shape, NM_EXB, SLD, 0);

        var sollW = Math.max(0, r.width + pL + pR);
        var sollH = Math.max(0, r.height + pT + pB);
        var sollX = r.left + r.width / 2 + (pR - pL) / 2 - ap[0];
        var sollY = r.top + r.height / 2 + (pB - pT) / 2 - ap[1];

        var istS, istP;
        try {
            istS = rect.property("ADBE Vector Rect Size").value;
            istP = rect.property("ADBE Vector Rect Position").value;
        } catch (x) { log.push("Pruefung (Werte) " + shape.name + ": " + x.toString()); return; }

        var tol = 0.6;
        if (!near(istS[0], sollW, tol) || !near(istS[1], sollH, tol))
            log.push("ABWEICHUNG Groesse (" + shape.name + "): ist [" +
                     istS[0].toFixed(1) + "," + istS[1].toFixed(1) + "] / soll [" +
                     sollW.toFixed(1) + "," + sollH.toFixed(1) + "]");
        if (!near(istP[0], sollX, tol) || !near(istP[1], sollY, tol))
            log.push("ABWEICHUNG Position (" + shape.name + "): ist [" +
                     istP[0].toFixed(1) + "," + istP[1].toFixed(1) + "] / soll [" +
                     sollX.toFixed(1) + "," + sollY.toFixed(1) + "]");
    }

    // =================================================================
    // vorhandene Box zu einer Textebene finden
    // =================================================================
    function findBox(comp, textLayer) {
        for (var i = 1; i <= comp.numLayers; i++) {
            var L = comp.layer(i);
            if (L === textLayer) continue;
            if (("" + L.comment).indexOf(TAG) < 0) continue;
            try { if (L.parent && L.parent.index === textLayer.index) return L; } catch (x) {}
        }
        return null;
    }

    // =================================================================
    // Box bauen
    // =================================================================
    function createBox(comp, textLayer, o, log) {

        var shape = comp.layers.addShape();
        shape.name = "TextBox - " + textLayer.name;
        shape.comment = TAG;
        try { shape.label = 11; } catch (x) {}

        ensureAllCtrls(shape, o);

        // 1) Struktur komplett anlegen
        var root = shape.property("ADBE Root Vectors Group");
        var grp = root.addProperty("ADBE Vector Group"); grp.name = "TextBox";
        var gcBuild = grp.property("ADBE Vectors Group");
        gcBuild.addProperty("ADBE Vector Shape - Rect");
        gcBuild.addProperty("ADBE Vector Graphic - Stroke");
        gcBuild.addProperty("ADBE Vector Graphic - Fill");

        // 2) Parenten + Transform auf Identitaet
        try { shape.parent = textLayer; } catch (x) { log.push("Parenten: " + x.toString()); }
        resetTransform(shape, textLayer, log);

        // 3) Zeitbereich an die Textebene angleichen
        try { shape.startTime = textLayer.startTime; } catch (x) {}
        try { shape.inPoint = textLayer.inPoint; } catch (x) {}
        try { shape.outPoint = textLayer.outPoint; } catch (x) {}

        // 4) FRISCHE Referenzen (nach allen Struktur-Aenderungen)
        var gc = shape.property("ADBE Root Vectors Group")
                      .property("ADBE Vector Group")
                      .property("ADBE Vectors Group");
        var rect = gc.property("ADBE Vector Shape - Rect");
        var stroke = gc.property("ADBE Vector Graphic - Stroke");
        var fill = gc.property("ADBE Vector Graphic - Fill");

        // 5) Statische Startwerte (Sicherheitsnetz, falls Expressions scheitern)
        var w = 200, h = 80, cx = 0, cy = 0;
        try {
            var r = textLayer.sourceRectAtTime(comp.time, false);
            var ap = textLayer.property("ADBE Transform Group").property("ADBE Anchor Point").value;
            w = r.width; h = r.height;
            cx = r.left + r.width / 2 + (o.exR - o.exL) / 2 - ap[0];
            cy = r.top + r.height / 2 + (o.exB - o.exT) / 2 - ap[1];
        } catch (x) { log.push("sourceRectAtTime (Skript): " + x.toString()); }

        setVal(rect, "ADBE Vector Rect Size",
            [w + 2 * (o.all + o.padX) + o.exL + o.exR,
             h + 2 * (o.all + o.padY) + o.exT + o.exB], log, "Groesse(statisch)");
        setVal(rect, "ADBE Vector Rect Position", [cx, cy], log, "Position(statisch)");
        setVal(rect, "ADBE Vector Rect Roundness", o.round, log, "Rundheit(statisch)");
        setVal(fill, "ADBE Vector Fill Color", o.color, log, "Fuellfarbe(statisch)");
        setVal(stroke, "ADBE Vector Stroke Width", 0, log, "Konturbreite(statisch)");

        // 6) Expressions
        applyExpressions(shape, log);

        // 7) Hinter die Text-Ebene legen
        try { shape.moveAfter(textLayer); } catch (x) {}

        // 8) Selbstdiagnose
        verify(shape, rect, log);

        return shape;
    }

    // =================================================================
    // vorhandene Box auffrischen
    // =================================================================
    function refreshBox(shape, textLayer, log) {
        ensureAllCtrls(shape, DEF);
        if (textLayer) { try { if (!shape.parent) shape.parent = textLayer; } catch (x) {} }
        resetTransform(shape, shape.parent, log);
        var rect = applyExpressions(shape, log);
        if (rect) verify(shape, rect, log);
        return shape;
    }

    // =================================================================
    // Aktionen
    // =================================================================
    function run() {
        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) { alert("Bitte eine Komposition auswaehlen."); return; }
        var sel = comp.selectedLayers, texts = [];
        for (var i = 0; i < sel.length; i++) if (sel[i] instanceof TextLayer) texts.push(sel[i]);
        if (texts.length === 0) { alert("Bitte mindestens eine TEXT-Ebene auswaehlen."); return; }

        app.beginUndoGroup(SCRIPT_NAME);
        var log = [], made = null, updated = 0;
        try {
            for (var j = 0; j < texts.length; j++) {
                var exist = findBox(comp, texts[j]);
                if (exist) { made = refreshBox(exist, texts[j], log); updated++; }
                else { made = createBox(comp, texts[j], DEF, log); }
            }
            if (made) made.selected = true;
        } catch (e) {
            log.push("ABBRUCH: " + e.toString() + (e.line ? (" (Zeile " + e.line + ")") : ""));
        }
        app.endUndoGroup();

        if (updated > 0)
            log.unshift("Hinweis: " + updated + " vorhandene Box(en) aktualisiert statt neu angelegt.");

        report(log);
    }

    function report(log) {
        if (log.length > 0)
            alert("TextBox - Diagnose:\n\n" + log.join("\n") +
                  "\n\n(Bitte diese Meldung 1:1 zurueckmelden.)");
    }

    // =================================================================
    // UI
    // =================================================================
    function buildUI(thisObj) {
        var pal = (thisObj instanceof Panel) ? thisObj
            : new Window("palette", SCRIPT_NAME, undefined, { resizeable: true });
        pal.orientation = "column"; pal.alignChildren = ["fill", "top"];
        pal.spacing = 8; pal.margins = 14;

        var title = pal.add("statictext", undefined, "TextBox");
        try { title.graphics.font = ScriptUI.newFont("dialog", "BOLD", 14); } catch (x) {}

        var btn = pal.add("button", undefined, "TextBox erstellen");
        btn.onClick = function () { run(); };

        var info = pal.add("statictext", undefined,
            "Textebene(n) auswaehlen > erstellen.\nPadding: Alle + X/Y + Extra pro Seite.",
            { multiline: true });
        info.preferredSize.height = 32;

        pal.layout.layout(true);
        pal.onResizing = pal.onResize = function () { this.layout.resize(); };
        return pal;
    }

    var ui = buildUI(thisObj);
    if (ui instanceof Window) { ui.center(); ui.show(); }

})(this);
