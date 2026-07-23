/**********************************************************************
 * CloudGenerator.jsx
 * ---------------------------------------------------------------
 * Wolken-Generator mit Wolkentyp-Auswahl, mehr Varianz, waehlbarem
 * 3D-Volumen und Zufalls-Funktion.
 *
 *   - Wolkentyp-Dropdown: Wolkenhimmel, Grosse Cumulus (3D),
 *     Federwolken (Cirrus), Bedeckt (Stratus), Schaefchenwolken.
 *   - Mehr Varianz: kraeftigere Sub-Oktaven + Turbulente Verschiebung
 *     ("Varianz"-Regler) + Zufalls-Startwert ("Seed") -> organischere,
 *     unregelmaessigere Wolken statt gleichfoermigem Rauschen.
 *   - 3D-Volumen (Relief, rasterfrei): ein smarter Regler "3D-Volumen"
 *     (0..100) steuert Relief-Hoehe, Rundung, streifendes Licht und
 *     Schattentiefe zugleich - von flach bis prall.
 *   - "Wuerfeln": erzeugt schnell einen neuen Himmel - bei aktiver
 *     Wolken-Ebene werden Seed + Parameter live neu gewuerfelt, sonst
 *     wird frisch generiert.
 *   - Lichtebene (Sonne): radialer, warmer Glow (Screen) unter den
 *     Wolken -> hellt sie rund um die Sonne auf und laesst sie warm
 *     durchgluehen. Die POSITION kommt von einem Null-Objekt "Sonne"
 *     (intuitiv im Viewer verschiebbar). Regler Licht-Farbe,
 *     -Intensitaet, Sonnen-Groesse. Beim Wuerfeln wandert die Sonne mit.
 *   - 3D-Volumen (Relief, rasterfrei): schattiert entlang der echten
 *     Wolkenform. EIN smarter Regler "3D-Volumen" (0..100) steuert
 *     Relief-Hoehe, Rundung, streifendes Licht und Schattentiefe
 *     zugleich - von flach bis prall. Lichtrichtung folgt der Sonne.
 *
 * Basis: Fractal Noise (Cloudy + Spline) im Modus Bildschirm (Screen)
 * ueber einem Himmel-Verlauf. Alle Regler liegen auf der "Wolken"-
 * Ebene und sind live gekoppelt.
 *
 * Robust: Fractal-Noise-Eigenschaften werden rekursiv ueber ihren
 * NAMEN gesucht (deutsch + englisch), unabhaengig von Index/matchName.
 **********************************************************************/

(function CloudGenerator(thisObj) {

    var SCRIPT_NAME = "Wolken-Generator";
    var TAG = "CLOUDGEN";

    var FN = "ADBE Fractal Noise";
    var TINT = "ADBE Tint", TINT_BLACK = "ADBE Tint-0001", TINT_WHITE = "ADBE Tint-0002", TINT_AMOUNT = "ADBE Tint-0003";
    var BLUR = "ADBE Box Blur2", BLUR_AMOUNT = "ADBE Box Blur2-0001", BLUR_ITER = "ADBE Box Blur2-0002";
    var RAMP = "ADBE Ramp";
    var RAMP_START = "ADBE Ramp-0001", RAMP_STARTC = "ADBE Ramp-0002",
        RAMP_END = "ADBE Ramp-0003", RAMP_ENDC = "ADBE Ramp-0004", RAMP_SHAPE = "ADBE Ramp-0005";

    var SLD = "ADBE Slider Control-0001", COL = "ADBE Color Control-0001";

    var NM_COVER="Deckung", NM_DENS="Dichte (Kontrast)", NM_SIZE="Groesse", NM_STRETCH="Streckung",
        NM_DETAIL="Detail", NM_SOFT="Weichheit", NM_COLOR="Wolkenfarbe",
        NM_DRIFT="Drift-Tempo", NM_MORPH="Morph-Tempo",
        NM_VAR="Varianz", NM_SEED="Seed",
        NM_3D="3D-Volumen",
        NM_SUNX="Sonne X", NM_SUNY="Sonne Y", NM_LCOL="Licht-Farbe",
        NM_LINT="Licht-Intensitaet", NM_LSIZE="Sonnen-Groesse";

    // Wolkentyp-Presets (cover/dens/size/stretch/detail/soft/drift/morph/varz)
    var TYPES = [
        ["Wolkenhimmel (flach)",   { cover:55, dens:100, size:180, stretch:15, detail:7, soft:8,  drift:30, morph:12, varz:30 }],
        ["Grosse Cumulus (3D)",    { cover:42, dens:150, size:280, stretch:5,  detail:6, soft:5,  drift:18, morph:8,  varz:45 }],
        ["Federwolken (Cirrus)",   { cover:35, dens:90,  size:130, stretch:85, detail:8, soft:12, drift:45, morph:10, varz:55 }],
        ["Bedeckt (Stratus)",      { cover:82, dens:45,  size:340, stretch:25, detail:4, soft:22, drift:15, morph:6,  varz:18 }],
        ["Schaefchenwolken",       { cover:55, dens:125, size:65,  stretch:12, detail:7, soft:4,  drift:25, morph:10, varz:28 }]
    ];

    // Wertebereiche fuer die Zufalls-Funktion (Wuerfeln)
    var RANGES = {
        cover:[32,80], dens:[55,160], size:[70,330], stretch:[5,85],
        detail:[4,8], soft:[4,20], drift:[12,45], morph:[6,14], varz:[15,70]
    };

    var STRUCT = [];
    var VSTRUCT = [];

    // ---- Hilfen ----------------------------------------------------
    function errStr(e) { try { return (e && e.message) ? e.message : ("" + e); } catch (x) { return "Fehler (nicht lesbar)"; } }
    function dumpDeep(group, prefix, out) {
        out = out || [];
        var n = 0; try { n = group.numProperties; } catch (e) { return out; }
        for (var i = 1; i <= n; i++) {
            var p = null, nm = "(?)"; try { p = group.property(i); } catch (e) {}
            try { nm = p ? p.name : "(null)"; } catch (e) {}
            out.push(prefix + "[" + i + "] " + nm);
            var isG = false; try { isG = (p.propertyType === PropertyType.INDEXED_GROUP || p.propertyType === PropertyType.NAMED_GROUP); } catch (e) {}
            if (isG) dumpDeep(p, prefix + "  ", out);
        }
        return out;
    }
    function rnd(a, b) { return a + Math.random() * (b - a); }
    function rndI(a, b) { return Math.round(rnd(a, b)); }
    function randomParams() {
        var o = {};
        for (var k in RANGES) if (RANGES.hasOwnProperty(k)) {
            var r = RANGES[k];
            o[k] = (k === "detail") ? rndI(r[0], r[1]) : Math.round(rnd(r[0], r[1]));
        }
        o.seed = rndI(1, 9999);
        return o;
    }
    function propMN(root, mn) { try { return root.property(mn); } catch (e) { return null; } }
    function setMN(root, mn, val, log, label) {
        var p = propMN(root, mn);
        if (p) { try { p.setValue(val); } catch (e) { if (log) log.push("SET " + (label || mn) + ": " + errStr(e)); } }
        else if (log) log.push("PROP fehlt: " + (label || mn));
    }
    function exprMN(root, mn, ex, log, label) {
        var p = propMN(root, mn);
        if (p) { try { p.expression = ex; } catch (e) { if (log) log.push("EXPR " + (label || mn) + ": " + errStr(e)); } }
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
    function setP(p, val, log, label) {
        if (p) { try { p.setValue(val); } catch (e) { if (log) log.push("SET " + label + ": " + errStr(e)); } }
        else if (log) log.push("nicht gefunden: " + label);
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
    function dumpGroup(group, prefix) {
        var out = []; if (!group) return out;
        var n = 0; try { n = group.numProperties; } catch (e) { return out; }
        for (var i = 1; i <= n; i++) { var p = null, nm = "(?)"; try { p = group.property(i); } catch (e) {} try { nm = p ? p.name : "(null)"; } catch (e) {} out.push(prefix + "[" + i + "] = " + nm); }
        return out;
    }
    function tagLayer(l) { l.comment = TAG; try { l.label = 6; } catch (e) {} }
    function ctrl(name, fb) { return 'var _v;try{_v=effect("' + name + '")("' + SLD + '");}catch(e){_v=' + fb + ';}'; }

    // ---- Himmel ----------------------------------------------------
    function buildSky(comp, dark, log) {
        var sky = comp.layers.addSolid([0.4, 0.6, 0.85], "Himmel", comp.width, comp.height, 1, comp.duration);
        tagLayer(sky);
        var r = null;
        try { r = sky.property("ADBE Effect Parade").addProperty(RAMP); } catch (e) { log.push("Himmel-Verlauf: " + errStr(e)); }
        setMN(r, RAMP_SHAPE, 1, log, "Verlauf-Form");
        setMN(r, RAMP_START, [comp.width / 2, 0], log, "Verlauf oben");
        setMN(r, RAMP_END, [comp.width / 2, comp.height], log, "Verlauf unten");
        setMN(r, RAMP_STARTC, [0.23, 0.47, 0.78, 1], log, "Himmel oben");
        setMN(r, RAMP_ENDC, [0.95, 0.97, 1.0, 1], log, "Himmel unten");
    }

    // ---- Lichtebene: Sonnen-Glow (radial, Screen) ------------------
    // Liegt unter den Wolken -> hellt sie rund um die Sonne auf und
    // laesst sie warm durchgluehen. Die Position kommt von einem
    // Null-Objekt "Sonne" -> intuitiv im Viewer verschiebbar.
    function buildLight(comp, o, log) {
        // Sonnen-Null (Steuer-Objekt)
        var sun = comp.layers.addNull(comp.duration);
        try { sun.name = "Sonne"; } catch (e) {}
        var sunName = sun.name;
        tagLayer(sun); try { sun.label = 11; } catch (e) {}
        try {
            sun.property("ADBE Transform Group").property("ADBE Position").setValue(
                [comp.width * ((o.sunX != null ? o.sunX : 75) / 100), comp.height * ((o.sunY != null ? o.sunY : 22) / 100)]);
        } catch (e) { log.push("Sonne Position: " + errStr(e)); }

        var ly = comp.layers.addSolid([0, 0, 0], "Licht", comp.width, comp.height, 1, comp.duration);
        tagLayer(ly);
        addCtrl(ly, "ADBE Color Control", NM_LCOL, COL, [1, 0.9, 0.72, 1]);
        addCtrl(ly, "ADBE Slider Control", NM_LINT, SLD, (o.lint != null ? o.lint : 100));
        addCtrl(ly, "ADBE Slider Control", NM_LSIZE, SLD, (o.lsize != null ? o.lsize : 60));

        // Sonnenposition aus dem Null holen (robust gegen Transform beider Ebenen)
        var sunPos = 'var s=thisComp.layer("' + sunName + '");var c;' +
                     'try{c=fromComp(s.toComp(s.anchorPoint));}catch(e){c=[thisComp.width*0.75,thisComp.height*0.22];}';

        var r = null;
        try { r = ly.property("ADBE Effect Parade").addProperty(RAMP); } catch (e) { log.push("Licht-Verlauf: " + errStr(e)); }
        setMN(r, RAMP_SHAPE, 2, log, "Licht Radial");   // 2 = radialer Verlauf
        exprMN(r, RAMP_START, sunPos + 'c;', log, "Sonnenposition");
        exprMN(r, RAMP_END,
            sunPos + 'var R=thisComp.width*effect("' + NM_LSIZE + '")("' + SLD + '")/100;[c[0]+Math.max(1,R),c[1]];',
            log, "Glow-Radius");
        exprMN(r, RAMP_STARTC,
            'var c=effect("' + NM_LCOL + '")("' + COL + '");var i=effect("' + NM_LINT + '")("' + SLD + '")/100;' +
            '[Math.min(1,c[0]*i),Math.min(1,c[1]*i),Math.min(1,c[2]*i),1];',
            log, "Licht-Farbe");
        setMN(r, RAMP_ENDC, [0, 0, 0, 1], log, "Glow aussen");

        try { ly.blendingMode = BlendingMode.SCREEN; } catch (e) { log.push("Licht-Blend: " + errStr(e)); }
        return sun;   // Null zum Verschieben
    }

    // ---- Wolken (helle Schicht) ------------------------------------
    function buildClouds(comp, o, log) {
        var cl = comp.layers.addSolid([0, 0, 0], "Wolken", comp.width, comp.height, 1, comp.duration);
        cl.moveToBeginning();
        tagLayer(cl);

        addCtrl(cl, "ADBE Slider Control", NM_COVER, SLD, o.cover);
        addCtrl(cl, "ADBE Slider Control", NM_DENS, SLD, o.dens);
        addCtrl(cl, "ADBE Slider Control", NM_SIZE, SLD, o.size);
        addCtrl(cl, "ADBE Slider Control", NM_STRETCH, SLD, o.stretch);
        addCtrl(cl, "ADBE Slider Control", NM_DETAIL, SLD, o.detail);
        addCtrl(cl, "ADBE Slider Control", NM_VAR, SLD, o.varz);
        addCtrl(cl, "ADBE Slider Control", NM_SOFT, SLD, o.soft);
        addCtrl(cl, "ADBE Color Control", NM_COLOR, COL, [1, 1, 1, 1]);
        addCtrl(cl, "ADBE Slider Control", NM_DRIFT, SLD, o.drift);
        addCtrl(cl, "ADBE Slider Control", NM_MORPH, SLD, o.morph);
        addCtrl(cl, "ADBE Slider Control", NM_SEED, SLD, o.seed);
        if (o.volume) addCtrl(cl, "ADBE Slider Control", NM_3D, SLD, (o.vol3d != null ? o.vol3d : 60));

        var fx = cl.property("ADBE Effect Parade");
        var fn = null;
        try { fn = fx.addProperty(FN); fn.name = "Wolken"; } catch (e) { log.push("Fractal anlegen: " + errStr(e)); }

        setP(findDeep(fn, /fractal type|fraktaltyp/i), 7, log, "Fraktaltyp");
        setP(findDeep(fn, /noise type|st.rungstyp/i), 4, log, "Rauschtyp");
        setP(findDeep(fn, /overflow|.berlauf/i), 1, log, "Ueberlauf");

        // Mehr Varianz: kraeftigere Sub-Oktaven + leichte Unregelmaessigkeit
        setP(findDeep(fn, /sub influence|detaileinfluss/i), 78, log, "Sub-Einfluss");
        setP(findDeep(fn, /sub scaling|detailskalierung/i), 62, log, "Sub-Skalierung");
        setP(findDeep(fn, /sub rotation|detaildrehung/i), 28, log, "Sub-Rotation");
        // Zufalls-Startwert an den "Seed"-Regler koppeln -> Wuerfeln aendert Form
        exprP(findDeep(fn, /random seed|zufalls|startwert|ausgangswert/i),
            ctrl(NM_SEED, o.seed) + 'Math.round(_v);', log, "Zufalls-Seed");

        exprP(findDeep(fn, /^contrast$|kontrast/i), ctrl(NM_DENS, o.dens) + '_v;', log, "Dichte");
        exprP(findDeep(fn, /brightness|helligkeit/i), ctrl(NM_COVER, o.cover) + '-70+_v;', log, "Deckung");
        exprP(findDeep(fn, /complexity|komplexit/i), ctrl(NM_DETAIL, o.detail) + 'Math.max(1,Math.round(_v));', log, "Detail");
        exprP(findDeep(fn, /^evolution$|^entwicklung$/i), ctrl(NM_MORPH, o.morph) + 'time*_v;', log, "Morph");

        STRUCT = dumpGroup(fn, "FN");
        var pUniform = findDeep(fn, /uniform scaling|gleichf.rmig/i);
        var pScale   = findDeep(fn, /^scale$|^skalieren$/i);
        var pWidth   = findDeep(fn, /scale width|skalierungsbreite/i);
        var pHeight  = findDeep(fn, /scale height|skalierungsh/i);
        var pOffset  = findDeep(fn, /offset turbulence|turbulenz/i);

        if (pWidth && pHeight) {
            setP(pUniform, 0, log, "Einheitl. Skalierung aus");
            exprP(pWidth,
                'var g,s;try{g=effect("' + NM_SIZE + '")("' + SLD + '");}catch(e){g=' + o.size + ';}' +
                'try{s=effect("' + NM_STRETCH + '")("' + SLD + '");}catch(e){s=' + o.stretch + ';}' +
                'g*(1+s/100*3);', log, "Breite/Streckung");
            exprP(pHeight, ctrl(NM_SIZE, o.size) + '_v;', log, "Hoehe");
        } else if (pScale) {
            setP(pUniform, 1, log, "Einheitl. Skalierung an");
            exprP(pScale, ctrl(NM_SIZE, o.size) + '_v;', log, "Groesse");
        } else if (log) log.push("nicht gefunden: Skalierung");

        exprP(pOffset, ctrl(NM_DRIFT, o.drift) + '[thisComp.width/2+time*_v, thisComp.height/2];', log, "Drift");

        // Mehr Varianz: turbulente Verschiebung warpt die Wolken organisch
        // (unregelmaessige Ballungen/Raender statt gleichfoermigem Rauschen).
        var td = null;
        try { td = fx.addProperty("ADBE Turbulent Displace"); } catch (e) { log.push("Turbulenz anlegen: " + errStr(e)); }
        if (td) {
            try { td.name = "Varianz-Warp"; } catch (e) {}
            exprP(findDeep(td, /^amount$|betrag|st.rke|menge/i), ctrl(NM_VAR, o.varz) + 'Math.max(0,_v);', log, "Warp-Betrag");
            exprP(findDeep(td, /^size$|gr[o\u00f6][\u00dfs]+e/i),
                'var g;try{g=effect("' + NM_SIZE + '")("' + SLD + '");}catch(e){g=' + o.size + ';}Math.max(20,g*0.5);', log, "Warp-Groesse");
            setP(findDeep(td, /complexity|komplex/i), 2, log, "Warp-Komplexitaet");
            exprP(findDeep(td, /^evolution$|^entwicklung$/i), ctrl(NM_MORPH, o.morph) + 'time*_v*0.4;', log, "Warp-Evolution");
        }

        // Wolkenfarbe (Tint)
        var tint = null;
        try { tint = fx.addProperty(TINT); } catch (e) { log.push("Tint anlegen: " + errStr(e)); }
        setMN(tint, TINT_BLACK, [0, 0, 0, 1], log, "Tint Schwarz");
        exprMN(tint, TINT_WHITE, 'try{effect("' + NM_COLOR + '")("' + COL + '");}catch(e){[1,1,1,1];}', log, "Wolkenfarbe");
        setMN(tint, TINT_AMOUNT, 100, log, "Tint Staerke");

        // Weichzeichnung
        var bl = null;
        try { bl = fx.addProperty(BLUR); } catch (e) { log.push("Blur anlegen: " + errStr(e)); }
        setMN(bl, BLUR_ITER, 2, log, "Blur Iterationen");
        exprMN(bl, BLUR_AMOUNT, ctrl(NM_SOFT, o.soft) + 'Math.max(0,_v);', log, "Weichheit");

        // Volumen (Relief, ueber einen smarten 3D-Regler gesteuert)
        if (o.volume) addVolumeGlass(cl, fx, log);

        try { cl.blendingMode = BlendingMode.SCREEN; } catch (e) { log.push("Blendmodus: " + errStr(e)); }
        return cl;
    }

    // ---- Volumen: Relief (CC Glass) - rasterfrei ------------------
    // Schattiert entlang der echten Wolkenform (kein Gitter). EIN smarter
    // Regler "3D-Volumen" (0..100) steuert alle relevanten Parameter:
    //   Relief-Hoehe, "Rundung" (Softness -> aufgeblaehte Puffs),
    //   streifendes Licht (Lichthoehe runter -> laengere Schatten) und
    //   Schattentiefe (Ambient runter). Lichtrichtung folgt der Sonne.
    function addVolumeGlass(cl, fx, log) {
        var g = null;
        try { g = fx.addProperty("CC Glass"); }
        catch (e) { log.push("Volumen (CC Glass) nicht verfuegbar: " + errStr(e)); return; }
        try { g.name = "Volumen (Relief)"; } catch (e) {}
        VSTRUCT = dumpDeep(g, "CCGlass");

        setP(findDeep(g, /bump map|w\u00f6lbungskarte/i), cl.index, log, "Glass Bump Map");
        setP(findDeep(g, /^property$|eigenschaft/i), 5, log, "Glass Property (Luminanz)");
        setP(findDeep(g, /displacement|verschiebung/i), 0, log, "Glass Displacement");
        setP(findDeep(g, /light intensity|lichtintensit/i), 116, log, "Glass Light Intensity");
        setP(findDeep(g, /diffuse|diffus/i), 100, log, "Glass Diffuse");
        setP(findDeep(g, /specular|spiegelnd|glanz/i), 8, log, "Glass Specular");

        // Lichtrichtung folgt der Sonne (falls Null vorhanden)
        exprP(findDeep(g, /light direction|lichtrichtung/i),
            'try{var s=thisComp.layer("Sonne");var p=s.toComp(s.anchorPoint);' +
            'var cx=thisComp.width/2,cy=thisComp.height*0.45;' +
            'radiansToDegrees(Math.atan2(p[0]-cx,-(p[1]-cy)));}catch(e){value;}', log, "Glass Lichtrichtung");

        // --- Smarter 3D-Regler: t = 0..1 steuert vier Parameter ---
        var T = ctrl(NM_3D, 60) + 'var t=Math.max(0,Math.min(100,_v))/100;';
        // Relief-Hoehe: 0 -> flach, 1 -> maximal (Bereich bis 100)
        exprP(findDeep(g, /^height$|^h\u00f6he$/i), T + '100*t;', log, "Glass Height (3D)");
        // Softness: hoeher = rundere, aufgeblaehte Puffs statt harter Kanten
        exprP(findDeep(g, /softness|weichheit/i), T + '25+135*t;', log, "Glass Softness (3D)");
        // Lichthoehe: streifender bei mehr 3D -> laengere Schatten
        exprP(findDeep(g, /light height|lichth\u00f6he/i), T + '55-33*t;', log, "Glass Light Height (3D)");
        // Umgebungslicht: dunklere Schatten bei mehr 3D
        exprP(findDeep(g, /ambient|umgebung/i), T + '58-34*t;', log, "Glass Ambient (3D)");
    }

    // ---- Aktive Wolken-Ebene finden (fuer Live-Wuerfeln) -----------
    function findCloudLayer(comp) {
        // Bevorzugt eine ausgewaehlte Wolken-Ebene, sonst irgendeine im Comp.
        try {
            var sel = comp.selectedLayers;
            for (var i = 0; i < sel.length; i++)
                if (sel[i].comment === TAG && sel[i].property("ADBE Effect Parade").property(NM_COVER)) return sel[i];
        } catch (e) {}
        for (var j = 1; j <= comp.numLayers; j++) {
            var l = comp.layer(j);
            try { if (l.comment === TAG && l.property("ADBE Effect Parade").property(NM_COVER)) return l; } catch (e) {}
        }
        return null;
    }

    function mergeOpts(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; for (k in b) o[k] = b[k]; return o; }

    // ---- Wuerfeln: schnell neuen Himmel ----------------------------
    // Wenn eine Wolken-Ebene existiert -> deren Regler + Seed live neu
    // wuerfeln (kein neuer Layer). Sonst frisch generieren.
    function randomizeSky(volume, light) {
        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) { alert("Bitte zuerst eine Komposition oeffnen und auswaehlen."); return; }
        var cl = findCloudLayer(comp);
        if (!cl) { generate(mergeOpts(randomParams(), { volume: volume, light: light })); return; }

        app.beginUndoGroup(SCRIPT_NAME + " - Wuerfeln");
        var log = [], p = randomParams(), fx = cl.property("ADBE Effect Parade");
        function put(nm, v) { try { var e = fx.property(nm); if (e) e.property(SLD).setValue(v); } catch (er) { log.push("Wuerfeln " + nm + ": " + errStr(er)); } }
        put(NM_COVER, p.cover); put(NM_DENS, p.dens); put(NM_SIZE, p.size); put(NM_STRETCH, p.stretch);
        put(NM_DETAIL, p.detail); put(NM_VAR, p.varz); put(NM_SOFT, p.soft);
        put(NM_DRIFT, p.drift); put(NM_MORPH, p.morph); put(NM_SEED, p.seed);

        // Sonne mitwuerfeln: das "Sonne"-Null verschieben (falls vorhanden)
        for (var li = 1; li <= comp.numLayers; li++) {
            var L = comp.layer(li);
            var isNull = false; try { isNull = (L.nullLayer === true); } catch (e) {}
            if (L.comment === TAG && isNull) {
                try {
                    L.property("ADBE Transform Group").property("ADBE Position").setValue(
                        [comp.width * rndI(18, 82) / 100, comp.height * rndI(10, 40) / 100]);
                } catch (e) { log.push("Sonne wuerfeln: " + errStr(e)); }
                break;
            }
        }
        app.endUndoGroup();
        if (log.length > 0) alert("Wolken-Generator - Diagnose (Wuerfeln):\n\n" + log.join("\n"));
    }

    // ---- Erzeugen --------------------------------------------------
    function generate(o) {
        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) { alert("Bitte zuerst eine Komposition oeffnen und auswaehlen."); return; }
        app.beginUndoGroup(SCRIPT_NAME);
        var log = [];
        try {
            buildSky(comp, false, log);
            var sun = null;
            if (o.light) sun = buildLight(comp, o, log);
            var cl = buildClouds(comp, o, log);
            if (sun) { try { sun.moveToBeginning(); } catch (e) {} }   // Null nach oben -> gut greifbar
            if (cl) cl.selected = true;
        } catch (e) {
            var lt = ""; try { if (e && e.line) lt = " (Zeile " + e.line + ")"; } catch (x) {}
            log.push("ABBRUCH: " + errStr(e) + lt);
        }
        app.endUndoGroup();
        if (log.length > 0)
            alert("Wolken-Generator - Diagnose:\n\n" + log.join("\n") +
                  "\n\n--- Struktur (Fractal Noise) ---\n" + STRUCT.join("\n") +
                  "\n\n--- Struktur (Volumen-Effekt) ---\n" + VSTRUCT.join("\n") +
                  "\n\n(Bitte diese Meldung 1:1 zurueckmelden.)");
    }

    // ---- UI --------------------------------------------------------
    function buildUI(thisObj) {
        var pal = (thisObj instanceof Panel) ? thisObj
            : new Window("palette", SCRIPT_NAME, undefined, { resizeable: true });
        pal.orientation = "column"; pal.alignChildren = ["fill", "top"];
        pal.spacing = 10; pal.margins = 14;

        var title = pal.add("statictext", undefined, "Wolken-Generator");
        try { title.graphics.font = ScriptUI.newFont("dialog", "BOLD", 14); } catch (x) {}

        var names = [];
        for (var i = 0; i < TYPES.length; i++) names.push(TYPES[i][0]);
        var dd = pal.add("dropdownlist", undefined, names);
        dd.selection = 0;

        var cVol = pal.add("checkbox", undefined, "3D-Volumen");
        cVol.value = true;

        var cLight = pal.add("checkbox", undefined, "Lichtebene (Sonne)");
        cLight.value = true;

        function optsFrom(idx, randomize) {
            var p = TYPES[idx][1];
            var base = randomize ? randomParams()
                                 : { cover: p.cover, dens: p.dens, size: p.size, stretch: p.stretch,
                                     detail: p.detail, soft: p.soft, drift: p.drift, morph: p.morph,
                                     varz: p.varz, seed: rndI(1, 9999) };
            base.volume = cVol.value;
            base.light = cLight.value;
            return base;
        }

        var btn = pal.add("button", undefined, "Wolken erstellen");
        btn.onClick = function () {
            generate(optsFrom(dd.selection ? dd.selection.index : 0, false));
        };

        var btnR = pal.add("button", undefined, "Wuerfeln (neuer Himmel)");
        btnR.onClick = function () {
            randomizeSky(cVol.value, cLight.value);
        };

        var info = pal.add("statictext", undefined,
            "> Typ waehlen und erstellen. \"Wuerfeln\" wechselt schnell den Himmel (Seed + Parameter). Regler liegen auf der Wolken-Ebene.",
            { multiline: true });
        info.preferredSize.height = 42;

        pal.layout.layout(true);
        pal.onResizing = pal.onResize = function () { this.layout.resize(); };
        return pal;
    }

    var ui = buildUI(thisObj);
    if (ui instanceof Window) { ui.center(); ui.show(); }

})(this);
