/**********************************************************************
 * PrintLook.jsx  –  Digitaldruck-Duplikator (Risograph) für After Effects
 * Version 7.0
 *
 * QUELLE
 *   Markierte Ebenen im Zeitleistenfenster werden gedruckt. Ist nichts
 *   markiert, wandert die gesamte Komposition in den Druck.
 *
 * AUFBAU (Praekomposition "PrintLook", in deiner Komp nur eine Ebene)
 *   PL_Walzen        Walzenspuren, Multiplizieren
 *   PL_Platte_n..1   je eine Tinte, Multiplizieren
 *   PL_Geist         Ghosting, unter den Platten
 *   PL_Papier        Papierfarbe + Struktur
 *   PL_Quelle        Original, ausgeblendet, bleibt immer erhalten
 *
 * PERFORMANCE
 *   1) Jedes Bedienelement meldet, WAS es betrifft (Bitmaske U.*).
 *      Ein Zug am Papierkorn schreibt einen Parameter statt achtzig.
 *   2) put() liest den Istwert und schreibt nur bei echter Abweichung.
 *      Jedes setValue invalidiert sonst den Rendercache.
 *   3) Das Rig wird einmal pro Durchlauf eingesammelt (readRig), nicht
 *      pro Zugriff neu durchsucht. Effektreferenzen bleiben innerhalb
 *      eines Durchlaufs gueltig, solange nichts hinzugefuegt wird.
 *   4) Neu aufgebaut wird nur, wenn sich die Struktur aendert, also
 *      Plattenzahl oder Rasterart.
 *
 * STABILITAET
 *   ScriptUI feuert onChange auch bei programmatischen Zuweisungen.
 *   Massenaenderungen laufen deshalb zwischen BUSY = true / false, jeder
 *   Handler steigt bei BUSY sofort aus. Praekomponiert wird nur ueber
 *   "Drucken". Jede Undo-Gruppe ist in try/catch gekapselt.
 *
 * VARIANTE = Startwert des Zufallsgenerators. Passer, Schieflage,
 * Rasterphasen, Walzenphase und Ghosting-Versatz leiten sich daraus ab.
 * Gleiche Zahl heisst exakt gleicher Druck.
 *
 * PHYSIK
 *   Separation   Jede Platte nimmt EINEN Kanal direkt als Tintendichte.
 *                Blaukanal treibt Gelb, Gruen treibt Magenta, Rot treibt Cyan.
 *   Raster       Korn: Rauschen + Schwelle. Punkt: Mosaik + Weichzeichner
 *                + Schwelle, in den Rasterwinkel hinein und heraus gedreht.
 *   Deckung      Grobes Rauschen vor der Schwelle, Phase je Platte.
 *   Walzenspuren Rauschen, nur horizontal weichgezeichnet.
 *   Ueberdruck   Plattendeckkraft unter 100% = lasierende Tinte.
 *
 * DITHER  Rauschen n in [-A,+A], Schwelle 0.5 +- t. Es muss A + t = 0.5
 *         gelten, sonst kippt die Tonwertwiedergabe. Ein Regler steuert
 *         beides: A = s*0.5, t = 0.5 - A.
 *
 * KENNLINIE (a = Auftrag 0..1): Eingabe Tiefen 0.02,
 *         Eingabe Lichter 0.70 + a*0.30, Gamma 1.60 - a*0.80
 *
 * VERIFIZIERTE PARAMETERINDIZES (AE 2025 deutsch)
 *   Easy Levels2   Werte 0..1. 3 Eing.Tiefen 4 Eing.Lichter 5 Gamma
 *                  6 Ausg.Tiefen 7 Ausg.Lichter
 *   Noise HLS      Wert = Prozent/10. Korngroesse nur bei Stoerung = 3.
 *                  1 Stoerung 2 Farbton 3 Helligkeit 4 Saettigung
 *                  5 Korngroesse 6 Phase. 8 Bit, kein MFR.
 *   Box Blur2      1 Radius 2 Iterationen 3 Richtung (2 = horizontal)
 *   Shift Channels 2 Rot 3 Gruen 4 Blau. 2=R 3=G 4=B 5=Luminanz
 *   Mosaic         1 horizontal 2 vertikal 3 nicht mitteln
 *   Geometry2      3 Gleichm.Skal 4 Hoehe 5 Breite 8 Drehung
 *   Tint           1 Schwarz zuordnen 2 Weiss zuordnen 3 Faerbungsgrad
 *   Fill           3 Farbe
 *
 * REGEL  Nach addProperty() sind Referenzen auf zuvor geholte Effekte
 *        derselben Ebene ungueltig. Erst anlegen, dann frisch holen.
 **********************************************************************/

(function PrintLook(thisObj) {

/* ====================================================================
 * 1  Konstanten und Bibliotheken
 * ==================================================================== */

var SCRIPT = "PrintLook", VERSION = "7.0", COMP_NAME = "PrintLook";
var MAX_PLATES = 4, NOISE_FULL = 50, SCALE_UP = 150, SCALE_DOWN = 100 / 1.5;

/* Update-Bereiche */
var U = { INK:1, TONE:2, SCREEN:4, COVER:8, XFORM:16, PAPER:32,
          WALZ:64, GHOST:128 };
U.ALL  = 255;
U.SEED = U.SCREEN | U.COVER | U.XFORM | U.WALZ | U.GHOST;

var LOG = [];

var INKS = [
    ["Black","000000"],["Burgundy","914E72"],["Blue","0078BF"],["Green","00A95C"],
    ["Medium Blue","3255A4"],["Bright Red","F15060"],["Risofederal Blue","3D5588"],
    ["Purple","765BA7"],["Teal","00838A"],["Flat Gold","BB8B41"],["Hunter Green","407060"],
    ["Red","FF665E"],["Brown","925F52"],["Yellow","FFE800"],["Marine Red","D2515E"],
    ["Orange","FF6C2F"],["Fluorescent Pink","FF48B0"],["Light Gray","88898A"],
    ["Metallic Gold","AC936E"],["Crimson","E45D50"],["Fluorescent Orange","FF7477"],
    ["Cornflower","62A8E5"],["Sky Blue","0086A8"],["Sea Blue","0074A2"],["Lake","235BA8"],
    ["Indigo","484D7A"],["Midnight","435060"],["Mist","D5E4C0"],["Granite","A5AAA8"],
    ["Charcoal","70747C"],["Smoky Teal","5F8289"],["Steel","375E77"],["Slate","5E695E"],
    ["Turquoise","00AA93"],["Emerald","19975D"],["Grass","397E58"],["Forest","516E5A"],
    ["Spruce","4A6C55"],["Moss","6B6F5F"],["Sea Foam","62C2B1"],["Kelly Green","67B346"],
    ["Light Teal","009DA5"],["Ivy","169B62"],["Pine","237E74"],["Lagoon","2F6165"],
    ["Violet","9D7AD2"],["Orchid","BB8BC3"],["Plum","B0819D"],["Brick","A75638"],
    ["Light Lime","E3ED55"],["Sunflower","FFB511"],["Melon","FFAE3B"],["Apricot","F6A04D"],
    ["Paprika","EE7F4B"],["Bubble Gum","F984CA"]
];

var PAPERS = [
    ["Weiss","FFFFFF"],["Naturweiss","F7F3E8"],["Recycling","EDE7D6"],
    ["Kraft","D9C4A3"],["Grau","D8D6D1"],["Creme","F5E9C8"]
];

var CHANS = [["Luminanz",5],["Rot",2],["Gruen",3],["Blau",4]];

var BLACK=0, BURGUNDY=1, BLUE=2, BRIGHT_RED=5, TEAL=8, YELLOW=13,
    FL_PINK=16, FL_ORANGE=20, INDIGO=25;

var RECIPES = [
    ["Vollfarbe, 3 Tinten", { platten:[[YELLOW,3],[BRIGHT_RED,2],[BLUE,1]], papier:1, auftrag:32 }],
    ["Duoton warm",         { platten:[[YELLOW,3],[BURGUNDY,2]],            papier:1, auftrag:45 }],
    ["Duoton kuehl",        { platten:[[TEAL,1],[BURGUNDY,2]],              papier:2, auftrag:42 }],
    ["Zine, Neon",          { platten:[[FL_ORANGE,3],[FL_PINK,2],[INDIGO,1]], papier:0, auftrag:58 }],
    ["Schwarz + Akzent",    { platten:[[BLACK,0],[FL_PINK,2]],              papier:1, auftrag:40 }],
    ["Einfarbig",           { platten:[[INDIGO,0]],                         papier:1, auftrag:50 }]
];

var STATES = [
    ["Neu, gewartet",  { passer:0.6, drehung:0.04, deckung: 4, walzen: 0, geist: 0, papierkorn: 8, ueberdruck:96 }],
    ["Alltag",         { passer:2.5, drehung:0.14, deckung:12, walzen:12, geist: 6, papierkorn:14, ueberdruck:90 }],
    ["Abgenutzt",      { passer:5.0, drehung:0.30, deckung:20, walzen:26, geist:14, papierkorn:20, ueberdruck:86 }],
    ["Zine, ruiniert", { passer:9.0, drehung:0.60, deckung:32, walzen:42, geist:24, papierkorn:30, ueberdruck:80 }]
];

var DEF_ANGLES = [15, 75, 45, 0];

/* ====================================================================
 * 2  Hilfsfunktionen
 * ==================================================================== */

function log(s) { LOG.push(s); }

function hex(h) {
    return [parseInt(h.substr(0,2),16)/255,
            parseInt(h.substr(2,2),16)/255,
            parseInt(h.substr(4,2),16)/255, 1];
}

function prng(seed) {
    var s = Math.floor(seed) || 1;
    return function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

/* alle Zufallsgroessen eines Druckvorgangs */
function pressRun(seed, n) {
    var r = prng(seed), p = [], i;
    for (i = 0; i < n; i++) {
        p.push({ dx:r()*2-1, dy:r()*2-1, rot:r()*2-1, phRaster:r()*360, phDeckung:r()*360 });
    }
    return { plates:p, phWalzen:r()*360, geistY:0.12+r()*0.14, geistX:(r()*2-1)*0.01 };
}

/* Wert nur schreiben, wenn er sich wirklich unterscheidet */
function putVal(p, v, label) {
    if (!p) { log("! " + label + ": Eigenschaft fehlt"); return; }
    try {
        if (typeof v === "number") {
            if (p.hasMin && v < p.minValue) { v = p.minValue; }
            if (p.hasMax && v > p.maxValue) { v = p.maxValue; }
            if (Math.abs(p.value - v) < 1e-6) { return; }
        } else if (v instanceof Array) {
            var cur = p.value, same = true, k;
            for (k = 0; k < v.length; k++) {
                if (Math.abs(cur[k] - v[k]) > 1e-6) { same = false; break; }
            }
            if (same) { return; }
        } else if (typeof v === "boolean") {
            if ((!!p.value) === v) { return; }
        }
        p.setValue(v);
    } catch (e) { log("! " + label + ": " + e.toString()); }
}

function put(fx, idx, v, label) {
    if (!fx) { log("! " + label + ": Effekt fehlt"); return; }
    var p = null;
    try { p = fx.property(idx); } catch (e) {}
    putVal(p, v, label);
}

function fxAdd(layer, matchName, name) {
    try { layer.property("ADBE Effect Parade").addProperty(matchName).name = name; }
    catch (e) { log("! Effekt nicht verfuegbar: " + name); }
}

function fxOf(layer, name) { try { return layer.effect(name); } catch (e) { return null; } }

function tf(layer, prop) {
    try { return layer.property("ADBE Transform Group").property(prop); }
    catch (e) { return null; }
}

/* ====================================================================
 * 3  Effekt-Setter
 * ==================================================================== */

function setLevels(e, black, white, gamma) {
    put(e, 3, black, "Eingabe Tiefen");
    put(e, 4, white, "Eingabe Lichter");
    put(e, 5, gamma, "Gamma");
    put(e, 6, 0,     "Ausgabe Tiefen");
    put(e, 7, 1,     "Ausgabe Lichter");
}

function setAuftrag(e, pct) {
    var a = Math.max(0, Math.min(1, pct / 100));
    setLevels(e, 0.02, 0.70 + a * 0.30, 1.60 - a * 0.80);
}

function setNoise(e, percent, grain, phase) {
    put(e, 1, 3,            "Stoerungsart");
    put(e, 2, 0,            "Farbton");
    put(e, 3, percent / 10, "Helligkeit");
    put(e, 4, 0,            "Saettigung");
    put(e, 5, grain,        "Korngroesse");
    put(e, 6, phase,        "Phase");
}

function setChannel(e, value) {
    put(e, 2, value, "Kanal Rot");
    put(e, 3, value, "Kanal Gruen");
    put(e, 4, value, "Kanal Blau");
}

function setGeometry(e, rotation, scale) {
    put(e, 3, true,  "Gleichm. Skalieren");
    put(e, 4, scale, "Skalierung Hoehe");
    put(e, 5, scale, "Skalierung Breite");
    put(e, 8, rotation, "Drehung");
}

function grainFromPitch(pitch) {
    var g = pitch / 4;
    return (g < 0.5) ? 0.5 : (g > 10 ? 10 : g);
}

/* ====================================================================
 * 4  Platten
 * ==================================================================== */

function addPlateEffects(lay, dot) {
    fxAdd(lay, "ADBE Shift Channels", "01 Kanal");
    fxAdd(lay, "ADBE Easy Levels2",   "02 Auftrag");
    fxAdd(lay, "ADBE Noise HLS",      "03 Deckung");
    if (dot) {
        fxAdd(lay, "ADBE Geometry2",    "04 Rasterwinkel");
        fxAdd(lay, "ADBE Mosaic",       "05 Rasterweite");
        fxAdd(lay, "ADBE Box Blur2",    "06 Punktform");
        fxAdd(lay, "ADBE Easy Levels2", "07 Schwelle");
        fxAdd(lay, "ADBE Geometry2",    "08 Winkel zurueck");
    } else {
        fxAdd(lay, "ADBE Noise HLS",    "04 Raster");
        fxAdd(lay, "ADBE Easy Levels2", "05 Schwelle");
    }
    fxAdd(lay, "ADBE Tint", "09 Tinte");
}

/* schreibt nur die Bereiche, die in mask stehen */
function tunePlate(comp, lay, idx, pl, o, roll, mask) {
    if (mask & U.INK) {
        lay.comment = INKS[pl.ink][0] + " \u2013 Kanal " + CHANS[pl.chan][0];
        setChannel(fxOf(lay, "01 Kanal"), CHANS[pl.chan][1]);
        var ti = fxOf(lay, "09 Tinte");
        put(ti, 1, hex(INKS[pl.ink][1]), "Tinte dunkel");
        put(ti, 2, [1,1,1,1],            "Tinte hell");
        put(ti, 3, 100,                  "Faerbungsgrad");
    }
    if (mask & U.TONE)  { setAuftrag(fxOf(lay, "02 Auftrag"), o.auftrag); }
    if (mask & U.COVER) { setNoise(fxOf(lay, "03 Deckung"), o.deckung * 0.35, 9.0, roll.phDeckung); }

    if (mask & U.SCREEN) {
        if (o.dot) {
            var ang = DEF_ANGLES[(idx - 1) % 4], f = SCALE_UP / 100;
            setGeometry(fxOf(lay, "04 Rasterwinkel"), ang, SCALE_UP);
            var mo = fxOf(lay, "05 Rasterweite");
            put(mo, 1, Math.round(comp.width  / (o.pitch * f)), "Mosaik horizontal");
            put(mo, 2, Math.round(comp.height / (o.pitch * f)), "Mosaik vertikal");
            put(mo, 3, false, "Farben nicht mitteln");
            var bl = fxOf(lay, "06 Punktform");
            put(bl, 1, o.pitch * f * 0.55, "Radius");
            put(bl, 2, 3, "Iterationen");
            var td = 0.5 - Math.max(0, Math.min(1, o.staerke / 100)) * 0.45;
            setLevels(fxOf(lay, "07 Schwelle"), 0.5 - td, 0.5 + td, 1.0);
            setGeometry(fxOf(lay, "08 Winkel zurueck"), -ang, SCALE_DOWN);
        } else {
            var s = Math.max(0, Math.min(1, o.staerke / 100));
            var t = 0.5 - s * 0.5;
            if (t < 0.005) { t = 0.005; }
            setNoise(fxOf(lay, "04 Raster"), s * NOISE_FULL, grainFromPitch(o.pitch), roll.phRaster);
            setLevels(fxOf(lay, "05 Schwelle"), 0.5 - t, 0.5 + t, 1.0);
        }
    }

    if (mask & U.XFORM) {
        putVal(tf(lay, "ADBE Position"),
               [comp.width/2 + roll.dx * o.passer, comp.height/2 + roll.dy * o.passer],
               "Passer Position");
        putVal(tf(lay, "ADBE Rotation"), roll.rot * o.drehung, "Schieflage");
        putVal(tf(lay, "ADBE Opacity"),  o.ueberdruck, "Ueberdruck");
    }
}

/* der Geist traegt dieselbe Kette wie Platte 1, nur andere Lage */
function tuneGhost(comp, gh, o, run, mask) {
    if (!gh) { return; }
    tunePlate(comp, gh, 1, o.plates[0], o, run.plates[0], mask & ~U.XFORM);
    if (mask & (U.GHOST | U.XFORM)) {
        putVal(tf(gh, "ADBE Position"),
               [comp.width/2 + run.geistX * comp.width,
                comp.height/2 + run.geistY * comp.height], "Geist Position");
        putVal(tf(gh, "ADBE Opacity"), o.geist, "Geist Deckkraft");
        gh.enabled = (o.geist > 0.5);
    }
}

function tunePaper(paper, o) {
    if (!paper) { return; }
    put(fxOf(paper, "01 Papierfarbe"), 3, hex(o.paperHex), "Papierfarbe");
    setNoise(fxOf(paper, "02 Papierstruktur"), o.papierkorn, 3.0, 0);
}

function tuneWalzen(walz, o, run) {
    if (!walz) { return; }
    setNoise(fxOf(walz, "01 Rauschen"), 100, 5.0, run.phWalzen);
    var bl = fxOf(walz, "02 Streifen");
    put(bl, 1, 90, "Radius");
    put(bl, 2, 2,  "Iterationen");
    put(bl, 3, 2,  "Richtung horizontal");
    setLevels(fxOf(walz, "03 Kontrast"), 0.30, 0.80, 1.0);
    putVal(tf(walz, "ADBE Opacity"), o.walzen, "Walzenspuren");
    walz.enabled = (o.walzen > 0.5);
}

/* ====================================================================
 * 5  Rig: lesen, aufbauen, aktualisieren
 * ==================================================================== */

function innerComp() {
    var host = app.project.activeItem;
    if (!(host && host instanceof CompItem)) { return null; }
    if (host.name === COMP_NAME) { return host; }
    for (var i = 1; i <= host.numLayers; i++) {
        var l = host.layer(i);
        if (l.name === COMP_NAME && l.source instanceof CompItem) { return l.source; }
    }
    return null;
}

/* einmal durchlaufen statt pro Zugriff suchen */
function readRig(comp) {
    var rig = { comp:comp, plates:[], ghost:null, paper:null, walzen:null, quelle:null };
    for (var i = 1; i <= comp.numLayers; i++) {
        var l = comp.layer(i), n = l.name;
        if (n.indexOf("PL_Platte_") === 0) { rig.plates[parseInt(n.substr(10),10) - 1] = l; }
        else if (n === "PL_Geist")  { rig.ghost  = l; }
        else if (n === "PL_Papier") { rig.paper  = l; }
        else if (n === "PL_Walzen") { rig.walzen = l; }
        else if (n === "PL_Quelle") { rig.quelle = l; }
    }
    return rig;
}

function structureOK(rig, o) {
    if (rig.plates.length !== o.plates.length) { return false; }
    var p1 = rig.plates[0];
    if (!p1) { return false; }
    return ((fxOf(p1, "04 Raster") !== null) === !o.dot);
}

function buildInside(comp, o) {
    var i;
    for (i = comp.numLayers; i >= 1; i--) {
        if (comp.layer(i).name !== "PL_Quelle") { comp.layer(i).remove(); }
    }
    var rig = readRig(comp), src = rig.quelle;
    if (!src) { log("! PL_Quelle fehlt"); return null; }
    src.enabled = false;

    var run = pressRun(o.seed, o.plates.length);

    for (i = 0; i < o.plates.length; i++) {
        var lay = src.duplicate();
        lay.name = "PL_Platte_" + (i + 1);
        lay.enabled = true;
        lay.blendingMode = BlendingMode.MULTIPLY;
        lay.label = 4;
        lay.moveToBeginning();
        addPlateEffects(lay, o.dot);
        tunePlate(comp, lay, i + 1, o.plates[i], o, run.plates[i], U.ALL);
    }
    src.moveToEnd();

    rig = readRig(comp);
    if (rig.plates[0]) {
        var gh = rig.plates[0].duplicate();
        gh.name = "PL_Geist";
        gh.label = 5;
        gh.moveAfter(rig.plates[0]);
        tuneGhost(comp, gh, o, run, U.ALL);
    }

    var paper = comp.layers.addSolid([1,1,1], "PL_Papier", comp.width, comp.height, 1, comp.duration);
    paper.moveToEnd();
    paper.label = 12;
    fxAdd(paper, "ADBE Fill",      "01 Papierfarbe");
    fxAdd(paper, "ADBE Noise HLS", "02 Papierstruktur");
    tunePaper(paper, o);

    var walz = comp.layers.addSolid([1,1,1], "PL_Walzen", comp.width, comp.height, 1, comp.duration);
    walz.moveToBeginning();
    walz.blendingMode = BlendingMode.MULTIPLY;
    walz.label = 11;
    fxAdd(walz, "ADBE Noise HLS",    "01 Rauschen");
    fxAdd(walz, "ADBE Box Blur2",    "02 Streifen");
    fxAdd(walz, "ADBE Easy Levels2", "03 Kontrast");
    tuneWalzen(walz, o, run);

    return readRig(comp);
}

function tuneInside(rig, o, mask) {
    var run = pressRun(o.seed, o.plates.length), i;
    for (i = 0; i < rig.plates.length && i < o.plates.length; i++) {
        if (rig.plates[i]) {
            tunePlate(rig.comp, rig.plates[i], i + 1, o.plates[i], o, run.plates[i], mask);
        }
    }
    if (mask & (U.GHOST | U.INK | U.TONE | U.SCREEN | U.COVER)) {
        tuneGhost(rig.comp, rig.ghost, o, run, mask | U.GHOST);
    }
    if (mask & U.PAPER) { tunePaper(rig.paper, o); }
    if (mask & U.WALZ)  { tuneWalzen(rig.walzen, o, run); }
}

/* aktualisiert ein vorhandenes Rig, legt niemals eines an */
function sync(o, mask) {
    LOG = [];
    var comp = innerComp();
    if (!comp) { return null; }
    var rig = readRig(comp);
    app.beginUndoGroup(SCRIPT);
    try {
        if (structureOK(rig, o)) { tuneInside(rig, o, mask); }
        else { rig = buildInside(comp, o) || rig; }
    } catch (e) { log("! " + e.toString()); }
    app.endUndoGroup();
    return rig;
}

/* der einzige Ort, an dem praekomponiert wird */
function firstPrint(o) {
    LOG = [];
    var host = app.project.activeItem;
    if (!(host && host instanceof CompItem)) { return "keine Komposition aktiv"; }
    if (innerComp()) { return null; }
    if (host.numLayers < 1) { return "Komposition ist leer"; }

    var idx = [], i;
    var sel = host.selectedLayers;
    if (sel && sel.length) { for (i = 0; i < sel.length; i++) { idx.push(sel[i].index); } }
    else { for (i = 1; i <= host.numLayers; i++) { idx.push(i); } }

    app.beginUndoGroup(SCRIPT + " drucken");
    try {
        host.layers.precompose(idx, COMP_NAME, idx.length === 1);
        var comp = innerComp();
        if (comp) {
            if (comp.numLayers === 1) { comp.layer(1).name = "PL_Quelle"; }
            else {
                /* mehrere Ebenen: zu einer Quelle zusammenfassen */
                var all = [];
                for (i = 1; i <= comp.numLayers; i++) { all.push(i); }
                comp.layers.precompose(all, "PL_Quelle_Inhalt", false);
                comp.layer(1).name = "PL_Quelle";
            }
            buildInside(comp, o);
        } else { log("! Praekomposition nicht gefunden"); }
    } catch (e) { log("! " + e.toString()); }
    app.endUndoGroup();
    return null;
}

/* ====================================================================
 * 6  Aktionen
 * ==================================================================== */

function view(which) {
    var comp = innerComp();
    if (!comp) { return; }
    app.beginUndoGroup(SCRIPT + " Ansicht");
    try {
        var rig = readRig(comp);
        for (var i = 0; i < rig.plates.length; i++) {
            if (rig.plates[i]) { rig.plates[i].enabled = (which === 0) || (which === i + 1); }
        }
    } catch (e) {}
    app.endUndoGroup();
}

function removeRig() {
    var host = app.project.activeItem;
    if (!(host && host instanceof CompItem)) { return false; }
    for (var i = 1; i <= host.numLayers; i++) {
        if (host.layer(i).name === COMP_NAME) {
            app.beginUndoGroup(SCRIPT + " entfernen");
            try { host.layer(i).remove(); } catch (e) {}
            app.endUndoGroup();
            return true;
        }
    }
    return false;
}

function diagnose() {
    var comp = innerComp();
    if (!comp) { alert("Kein PrintLook-Druck gefunden."); return; }
    var rig = readRig(comp);
    var out = [SCRIPT + " " + VERSION + " – Parameterkarte", ""];
    var targets = [["Platte 1", rig.plates[0]], ["Walzen", rig.walzen], ["Papier", rig.paper]];
    for (var t = 0; t < targets.length; t++) {
        var lay = targets[t][1];
        if (!lay) { out.push("(" + targets[t][0] + " fehlt)"); continue; }
        out.push("=== " + lay.name + " ===");
        var par = lay.property("ADBE Effect Parade");
        for (var f = 1; f <= par.numProperties; f++) {
            var e = par.property(f);
            out.push("  " + e.name + " [" + e.matchName + "]");
            for (var m = 1; m <= e.numProperties; m++) {
                var pr = e.property(m), val = "-";
                try { val = String(pr.value); } catch (x) { val = "(kein Wert)"; }
                out.push("    (" + m + ") " + pr.name + " = " + val);
            }
        }
        out.push("");
    }
    if (LOG.length) { out.push("Letzte Meldungen:", LOG.join("\n")); }
    alert(out.join("\n"));
}

/* ====================================================================
 * 7  Oberflaeche
 * ==================================================================== */

function ui(thisObj) {
    var w = (thisObj instanceof Panel) ? thisObj
          : new Window("palette", SCRIPT + " " + VERSION, undefined, { resizeable:true });
    w.orientation = "column";
    w.alignChildren = ["fill", "top"];
    w.spacing = 5; w.margins = 11;

    var seed = 1234, currentView = 0, BUSY = true;

    function lab(parent, txt, width) {
        var t = parent.add("statictext", undefined, txt);
        t.preferredSize.width = width || 84;
        return t;
    }
    function dd(parent, items, sel, width) {
        var d = parent.add("dropdownlist", undefined, []);
        for (var i = 0; i < items.length; i++) { d.add("item", items[i]); }
        d.selection = sel;
        if (width) { d.preferredSize.width = width; } else { d.alignment = ["fill","center"]; }
        return d;
    }
    function nameList(arr) {
        var o = [], i;
        for (i = 0; i < arr.length; i++) { o.push(arr[i][0]); }
        return o;
    }
    function sld(txt, min, max, val, dec, unit, mask) {
        var g = w.add("group");
        lab(g, txt);
        var s = g.add("slider", undefined, val, min, max);
        s.alignment = ["fill", "center"];
        var t = g.add("statictext", undefined, "");
        t.preferredSize.width = 44;
        var o = { sl:s, tx:t, mask:mask };
        o.show = function () { o.tx.text = o.sl.value.toFixed(dec) + (unit || ""); };
        o.set  = function (v) { o.sl.value = v; o.show(); };
        o.show();
        s.onChanging = o.show;
        return o;
    }
    function rule() { w.add("panel").preferredSize.height = 1; }

    lab(w.add("group"), "Quelle: Auswahl in der Zeitleiste, sonst ganze Komp", 320);

    rule();
    var gk = w.add("group");
    lab(gk, "Tintenkit");
    var recDD = dd(gk, nameList(RECIPES), 0);

    var gp = w.add("group");
    lab(gp, "Papier");
    var paDD  = dd(gp, nameList(PAPERS), 1);
    lab(gp, "Platten", 48);
    var cntDD = dd(gp, ["1","2","3","4"], 2, 46);

    var rows = [], p;
    for (p = 0; p < MAX_PLATES; p++) {
        var g = w.add("group");
        lab(g, "P" + (p + 1), 24);
        rows.push({ ink: dd(g, nameList(INKS), 0),
                    ch:  dd(g, nameList(CHANS), 0, 80),
                    grp: g });
    }

    rule();
    var gr = w.add("group");
    lab(gr, "Raster");
    var scrDD = dd(gr, ["Korn (Grain Touch)", "Punktraster"], 0);

    var sPitch   = sld("Rasterweite",   2,  30,   8, 0, " px", U.SCREEN);
    var sStaerke = sld("Rasterstaerke", 0, 100,  55, 0, "%",   U.SCREEN);
    var sAuftrag = sld("Tintenauftrag", 0, 100,  32, 0, "%",   U.TONE);
    var sUeber   = sld("Ueberdruck",   50, 100,  90, 0, "%",   U.XFORM);

    rule();
    var gs = w.add("group");
    lab(gs, "Zustand");
    var stDD = dd(gs, nameList(STATES), 1);

    var sPasser  = sld("Passer",       0,  20, 2.5,  1, " px", U.XFORM);
    var sDrehung = sld("Schieflage",   0, 1.5, 0.14, 2, "\u00B0", U.XFORM);
    var sDeckung = sld("Deckung",      0, 100,  12, 0, "%", U.COVER);
    var sWalzen  = sld("Walzenspuren", 0, 100,  12, 0, "%", U.WALZ);
    var sGeist   = sld("Ghosting",     0,  60,   6, 0, "%", U.GHOST);
    var sPapier  = sld("Papierkorn",   0,  60,  14, 0, "%", U.PAPER);

    rule();
    var gb = w.add("group"); gb.alignChildren = ["fill", "center"];
    var bPrint = gb.add("button", undefined, "Drucken");
    var bNew   = gb.add("button", undefined, "Neu w\u00fcrfeln");
    var bDice  = gb.add("button", undefined, "Alles zuf\u00e4llig");

    var gv = w.add("group");
    lab(gv, "Variante", 52);
    var seedET = gv.add("edittext", undefined, "" + seed);
    seedET.preferredSize.width = 56;
    lab(gv, "Ansicht", 46);
    var vAll = gv.add("button", undefined, "Alle"); vAll.preferredSize.width = 36;
    var vBtn = [], v;
    for (v = 1; v <= MAX_PLATES; v++) {
        var b = gv.add("button", undefined, "P" + v);
        b.preferredSize.width = 25;
        vBtn.push(b);
    }

    var gx = w.add("group"); gx.alignChildren = ["fill", "center"];
    var bDel  = gx.add("button", undefined, "Entfernen");
    var bDiag = gx.add("button", undefined, "Diagnose");

    var statusTx = w.add("statictext", undefined, "bereit \u2013 Ebene w\u00e4hlen, dann Drucken");
    statusTx.alignment = ["fill", "bottom"];
    function say(t) { statusTx.text = t; }

    function opts() {
        var n = parseInt(cntDD.selection.text, 10), plates = [], q;
        for (q = 0; q < n; q++) {
            plates.push({ ink: rows[q].ink.selection.index, chan: rows[q].ch.selection.index });
        }
        return {
            plates:     plates,
            paperHex:   PAPERS[paDD.selection.index][1],
            dot:        (scrDD.selection.index === 1),
            pitch:      sPitch.sl.value,
            staerke:    sStaerke.sl.value,
            auftrag:    sAuftrag.sl.value,
            ueberdruck: sUeber.sl.value,
            passer:     sPasser.sl.value,
            drehung:    sDrehung.sl.value,
            deckung:    sDeckung.sl.value,
            walzen:     sWalzen.sl.value,
            geist:      sGeist.sl.value,
            papierkorn: sPapier.sl.value,
            seed:       seed
        };
    }

    function report(rig) {
        var hint = LOG.length ? "  \u00b7 " + LOG.length + " Hinweise" : "";
        say("Variante " + seed + "  \u00b7  " + rig.plates.length + " Platten  \u00b7  " +
            (scrDD.selection.index === 1 ? "Punkt" : "Korn") + "  \u00b7  " +
            STATES[stDD.selection.index][0] + hint);
    }

    function go(mask) {
        if (BUSY) { return; }
        BUSY = true;
        try {
            var rig = sync(opts(), mask || U.ALL);
            if (!rig) { say("noch nicht gedruckt \u2013 Ebene w\u00e4hlen, dann Drucken"); }
            else {
                if (currentView !== 0) { view(currentView); }
                report(rig);
            }
        } catch (e) { say("Fehler: " + e.toString()); }
        BUSY = false;
    }

    function syncRows() {
        var n = parseInt(cntDD.selection.text, 10), q;
        for (q = 0; q < MAX_PLATES; q++) {
            rows[q].grp.visible = (q < n);
            vBtn[q].enabled = (q < n);
        }
        w.layout.layout(true);
    }

    function loadRecipe(run) {
        var was = BUSY; BUSY = true;
        var r = RECIPES[recDD.selection.index][1], q;
        cntDD.selection = r.platten.length - 1;
        for (q = 0; q < r.platten.length; q++) {
            rows[q].ink.selection = r.platten[q][0];
            rows[q].ch.selection  = r.platten[q][1];
        }
        paDD.selection = r.papier;
        sAuftrag.set(r.auftrag);
        syncRows();
        BUSY = was;
        if (run) { go(U.ALL); }
    }

    function loadState(run) {
        var was = BUSY; BUSY = true;
        var s = STATES[stDD.selection.index][1];
        sPasser.set(s.passer);   sDrehung.set(s.drehung);
        sDeckung.set(s.deckung); sWalzen.set(s.walzen);
        sGeist.set(s.geist);     sPapier.set(s.papierkorn);
        sUeber.set(s.ueberdruck);
        BUSY = was;
        if (run) { go(U.XFORM | U.COVER | U.WALZ | U.GHOST | U.PAPER); }
    }

    recDD.onChange  = function () { if (!BUSY) { loadRecipe(true); } };
    stDD.onChange   = function () { if (!BUSY) { loadState(true); } };
    cntDD.onChange  = function () { if (BUSY) { return; } syncRows(); go(U.ALL); };
    scrDD.onChange  = function () { go(U.ALL); };
    paDD.onChange   = function () { go(U.PAPER); };
    seedET.onChange = function () {
        if (BUSY) { return; }
        var val = parseInt(seedET.text, 10);
        if (!isNaN(val) && val > 0) { seed = val; go(U.SEED); }
        else { seedET.text = "" + seed; }
    };

    var ctrls = [sPitch, sStaerke, sAuftrag, sUeber, sPasser,
                 sDrehung, sDeckung, sWalzen, sGeist, sPapier], c;
    for (c = 0; c < ctrls.length; c++) {
        (function (o) { o.sl.onChange = function () { go(o.mask); }; })(ctrls[c]);
    }
    for (c = 0; c < rows.length; c++) {
        rows[c].ink.onChange = function () { go(U.INK); };
        rows[c].ch.onChange  = function () { go(U.INK); };
    }

    bPrint.onClick = function () {
        if (BUSY) { return; }
        BUSY = true;
        try {
            var o = opts();
            if (innerComp()) {
                var rig = sync(o, U.ALL);
                if (rig) { report(rig); }
            } else {
                var err = firstPrint(o);
                if (err) { say(err); }
                else {
                    var comp = innerComp();
                    if (comp) { report(readRig(comp)); } else { say("Druck fehlgeschlagen"); }
                }
            }
        } catch (e) { say("Fehler: " + e.toString()); }
        BUSY = false;
    };

    bNew.onClick = function () {
        if (BUSY) { return; }
        seed = Math.floor(Math.random() * 99999) + 1;
        seedET.text = "" + seed;
        go(U.SEED);
    };

    bDice.onClick = function () {
        if (BUSY) { return; }
        BUSY = true;
        var n = parseInt(cntDD.selection.text, 10), q;
        for (q = 0; q < n; q++) { rows[q].ink.selection = Math.floor(Math.random() * INKS.length); }
        paDD.selection = Math.floor(Math.random() * PAPERS.length);
        seed = Math.floor(Math.random() * 99999) + 1;
        seedET.text = "" + seed;
        BUSY = false;
        go(U.INK | U.PAPER | U.SEED);
    };

    bDel.onClick  = function () { currentView = 0; say(removeRig() ? "entfernt" : "nichts zu entfernen"); };
    bDiag.onClick = diagnose;
    vAll.onClick  = function () { currentView = 0; view(0); say("Ansicht: alle Platten"); };
    for (c = 0; c < vBtn.length; c++) {
        (function (n) {
            vBtn[n].onClick = function () {
                currentView = n + 1; view(currentView);
                say("Ansicht: nur Platte " + currentView);
            };
        })(c);
    }

    loadRecipe(false);
    loadState(false);
    BUSY = false;

    if (w instanceof Window) { w.center(); w.show(); }
    else { w.layout.layout(true); w.layout.resize(); }
    return w;
}

ui(thisObj);

})(this);
