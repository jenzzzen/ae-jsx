/**********************************************************************
 * ChartBuilder.jsx
 * ---------------------------------------------------------------
 * Andockbares Panel zum Erzeugen von Diagrammen als Formebenen.
 *
 * Diagrammarten: Balken vertikal, Balken horizontal, Kreisdiagramm,
 *                Liniendiagramm, Flaechendiagramm.
 *
 * Achsen (getrennt einstell- und ausblendbar):
 *   X-Achse Staerke / X-Achse Farbe
 *   Y-Achse Staerke / Y-Achse Farbe
 *   Wert-Raster (an der Y-Achse):
 *     Raster Staerke / Farbe / Laenge (%) / Strich / Luecke
 *   Kategorie-Raster (an der X-Achse, senkrechte Striche):
 *     X-Raster Staerke / Farbe / Laenge (%) / Strich / Luecke
 *   Staerke 0 = unsichtbar. Strich 0 = durchgezogen, sonst Strichlaenge;
 *   Luecke 0 = Luecke wie Strich. Strichmuster und Staerken sind gegen
 *   die Ebenenskalierung kompensiert.
 *
 * Achsen auf eigenen Ebenen (Option, Standard an):
 *   X- und Y-Achse werden als ZWEI getrennte, an das Diagramm
 *   geparentete Formebenen "X-Achse ..." / "Y-Achse ..." angelegt -
 *   jeweils mit EIGENEN Effekt-Reglern. Groesse kommt via parent.effect
 *   vom Diagramm. Die Ebenen liegen unter der Datenebene.
 *
 * Einfaerbung:
 *   - Farbe je Reihe ODER je Balken/Segment (Panel-Checkbox)
 *   - Kontur (Staerke + Farbe) fuer Balken / Kreis-Segmente
 *   - Konturstaerken sind gegen die Ebenenskalierung kompensiert:
 *     die eingestellte Staerke landet exakt so im Bild, auch wenn
 *     die Ebene skaliert wird
 *   - Linienstaerke (auch fuer Flaechen -> Umrisslinie)
 *   - Kreis: Innenradius (Donut)
 *
 * Sortierung (Balken & Kreis, live per Regler auf der Ebene):
 *   Regler "Sortierung": 0=Original, 1=Aufsteigend, 2=Absteigend,
 *   3=Alphabetisch (A-Z). Bei mehreren Reihen legt "Sortier-Reihe" fest,
 *   WONACH sortiert wird: 0=Summe, 1..n=jeweilige Reihe (wichtig bei
 *   Anteilsdaten, wo alle Summen gleich sind). Kategorien werden per
 *   Expression umgeordnet - Werte, Farben und Beschriftungen wandern mit.
 *   Linie/Flaeche werden NICHT sortiert (feste X-Achsen-Reihenfolge).
 *
 * Daten: haendisch oder CSV/TXT (Komma/Semikolon/Tab), Kopfzeile opt.
 * Skalierbar: Regler "Breite"/"Hoehe" steuern alles per Expression.
 * Beschriftung: Textebenen, an das Diagramm geparentet.
 *
 * FIX: Beim Flaechendiagramm bekamen auch Raster-/Achsenlinien eine
 * Fuellung -> Linienpfade wurden flaechig gefuellt. Jetzt erhaelt nur
 * die Datenflaeche eine Fuellung.
 **********************************************************************/

(function ChartBuilder(thisObj) {

    var SCRIPT_NAME = "ChartBuilder";
    var TAG = "CHARTGEN";
    var SLD = "ADBE Slider Control-0001", COL = "ADBE Color Control-0001", CHK = "ADBE Checkbox Control-0001";
    // Live-Umordnung ueber einen Regler auf der Ebene:
    //   0 = Original | 1 = Aufsteigend | 2 = Absteigend | 3 = Alphabetisch (A-Z)
    var DIVS_HINT = 5;                   // Richtwert fuer die Rasterlinien-Anzahl
    var SORT_NAME = "Sortierung", SORT_MODES = 4;
    var SBASIS_NAME = "Sortier-Reihe";   // Basis: 0=Summe, 1..nSer=jeweilige Reihe

    var TYPES = ["Balken vertikal", "Balken vertikal gestapelt",
                 "Balken horizontal", "Balken horizontal gestapelt",
                 "Kreisdiagramm", "Liniendiagramm", "Flaechendiagramm"];
    var T_VBAR = 0, T_VSTACK = 1, T_HBAR = 2, T_HSTACK = 3,
        T_PIE = 4, T_LINE = 5, T_AREA = 6;

    var PALETTE = [
        [0.20, 0.55, 0.90, 1], [0.95, 0.60, 0.20, 1], [0.30, 0.75, 0.45, 1],
        [0.85, 0.30, 0.35, 1], [0.60, 0.45, 0.85, 1], [0.95, 0.80, 0.25, 1],
        [0.35, 0.75, 0.80, 1], [0.90, 0.45, 0.70, 1], [0.55, 0.65, 0.30, 1],
        [0.40, 0.50, 0.75, 1]
    ];

    // ---- Hilfen ----------------------------------------------------
    function errStr(e) { try { return (e && e.message) ? e.message : ("" + e); } catch (x) { return "Fehler"; } }
    function addCtrl(layer, type, name, valMN, val) {
        var e = layer.property("ADBE Effect Parade").addProperty(type);
        e.name = name;
        try { e.property(valMN).setValue(val); } catch (x) {}
    }
    function setExpr(prop, ex, log, label) {
        if (!prop) { if (log) log.push("nicht gefunden: " + label); return; }
        try { prop.expression = ex; } catch (e) { if (log) log.push("EXPR " + label + ": " + errStr(e)); }
    }
    function num(f, fb) { var v = parseFloat(f.text); return isNaN(v) ? fb : v; }
    function arrLit(a) { return "[" + a.join(",") + "]"; }
    // Effektnamen duerfen keine Anfuehrungszeichen enthalten (Expression-Referenz)
    function safeName(s) { return String(s).replace(/["\\]/g, "").substr(0, 24); }
    function isVertical(t) { return (t === T_VBAR || t === T_VSTACK || t === T_LINE || t === T_AREA); }
    function isStacked(t)  { return (t === T_VSTACK || t === T_HSTACK); }
    // Waehlt eine glatte Schrittweite (1/2/2.5/5/10 x Zehnerpotenz) so,
    // dass die Achse MOEGLICHST KNAPP ueber dem Hoechstwert endet.
    // (max 88 -> Achse 90, nicht 100). "divs" ist nur ein Richtwert
    // fuer die Linienanzahl und entscheidet nur bei Gleichstand.
    function chooseScale(maxV, divs) {
        if (!(maxV > 0)) return { step: 1, lines: 1, axisMax: 1 };
        var bases = [1, 2, 2.5, 5, 10];
        var k0 = Math.floor(Math.log(maxV / Math.max(1, divs)) / Math.LN10) - 1;
        var best = null;
        for (var k = k0; k <= k0 + 3; k++) {
            var mag = Math.pow(10, k);
            for (var b = 0; b < bases.length; b++) {
                var step = bases[b] * mag;
                if (!(step > 0)) continue;
                var lines = Math.ceil(maxV / step - 1e-9);
                if (lines < 2 || lines > 12) continue;          // sinnvolle Bandbreite
                var axisMax = step * lines;
                var over = (axisMax - maxV) / maxV;             // relativer Ueberstand
                // Bewertung: knapper Ueberstand zaehlt am meisten, aber eine
                // Linienzahl weit weg vom Wunsch wird leicht bestraft ->
                // verhindert sehr kleinteilige Raster bei krummen Maxima
                var score = over + Math.abs(lines - divs) * 0.012;
                var cand = { step: step, lines: lines, axisMax: axisMax, over: over, score: score };
                if (best === null || score < best.score - 1e-9) best = cand;
            }
        }
        if (!best) { var st = maxV / Math.max(1, divs); best = { step: st, lines: divs, axisMax: maxV }; }
        return best;
    }
    // Zahl huebsch ausgeben (ganze Zahlen ohne Nachkomma)
    function fmtNum(v) {
        var r = Math.round(v * 1000) / 1000;
        if (Math.abs(r - Math.round(r)) < 1e-9) return String(Math.round(r));
        return String(Math.round(r * 100) / 100).replace(".", ",");
    }
    function isBarLike(t) { return (t === T_VBAR || t === T_VSTACK || t === T_HBAR || t === T_HSTACK); }
    function canSortType(t) { return (isBarLike(t) || t === T_PIE); }
    function r6(x) { return Math.round(x * 1e6) / 1e6; }   // Nachkommastellen kurz halten

    // ---- Sortier-Reihenfolgen ---------------------------------------
    // Je Modus die ANZEIGE-Reihenfolge (Sequenz von Original-Indizes):
    //   Modus 0 Original | 1 Aufsteigend | 2 Absteigend | 3 Alphabetisch
    // "basis" bestimmt WONACH sortiert wird:
    //   0 = Summe der (positiven) Werte je Kategorie
    //   b>=1 = die Werte der Reihe (b-1), so wie sie sind (auch negativ)
    // Wichtig bei Anteils-/Prozentdaten: da sind alle Summen gleich ->
    // dann nach einer konkreten Reihe sortieren (basis>=1).
    // Sortierung ist STABIL (bei Gleichstand bleibt die Originalfolge).
    function ordersForBasis(data, nCat, nSer, basis) {
        var metric = [];
        for (var i = 0; i < nCat; i++) {
            var s;
            if (basis <= 0) { s = 0; for (var j = 0; j < nSer; j++) s += Math.max(0, data.series[j].values[i]); }
            else { s = data.series[Math.min(basis - 1, nSer - 1)].values[i]; }
            metric[i] = s;
        }
        var base = [];
        for (i = 0; i < nCat; i++) base[i] = i;
        var asc = base.slice().sort(function (a, b) { return (metric[a] !== metric[b]) ? (metric[a] - metric[b]) : (a - b); });
        var desc = base.slice().sort(function (a, b) { return (metric[a] !== metric[b]) ? (metric[b] - metric[a]) : (a - b); });
        var alpha = base.slice().sort(function (a, b) {
            var la = String(data.labels[a]).toLowerCase(), lb = String(data.labels[b]).toLowerCase();
            return (la < lb) ? -1 : (la > lb) ? 1 : (a - b);
        });
        return [base, asc, desc, alpha];   // [mode] = Sequenz Original-Indizes
    }
    // Alle Basen buendeln: [basis][mode] = Sequenz. nBasis=1 -> nur Summe.
    function computeAllOrders(data, nCat, nSer, nBasis) {
        var all = [];
        for (var b = 0; b < nBasis; b++) all.push(ordersForBasis(data, nCat, nSer, b));
        return all;
    }

    // Expression-Fragment, das 'var slot' setzt: Anzeige-Position dieses
    // Elements je nach Regler(n). 'ref' = "effect" (Ebene) oder
    // "parent.effect" (geparentete Textebenen). hasBasis = zweiter Regler da.
    function sortSlotExpr(all, origIdx, ref, hasBasis) {
        ref = ref || "effect";
        if (!all) return "var slot=" + origIdx + ";";
        var mat = [];                                   // [basis][mode] = slot
        for (var b = 0; b < all.length; b++) {
            var orders = all[b], row = [];
            for (var m = 0; m < orders.length; m++) {
                var seq = orders[m], pos = origIdx;
                for (var p = 0; p < seq.length; p++) if (seq[p] === origIdx) { pos = p; break; }
                row.push(pos);
            }
            mat.push("[" + row.join(",") + "]");
        }
        var nM = all[0].length, nB = all.length;
        var e = "var SM=Math.round(" + ref + '("' + SORT_NAME + '")("' + SLD + '"));' +
                "SM=(SM<0)?0:(SM>" + (nM - 1) + ")?" + (nM - 1) + ":SM;";
        if (hasBasis && nB > 1) {
            e += "var SB=Math.round(" + ref + '("' + SBASIS_NAME + '")("' + SLD + '"));' +
                 "SB=(SB<0)?0:(SB>" + (nB - 1) + ")?" + (nB - 1) + ":SB;";
        } else { e += "var SB=0;"; }
        return e + "var slot=[" + mat.join(",") + "][SB][SM];";
    }

    // Fuer den Kreis: je Modus der kumulierte Startanteil (0..1) dieses
    // Segments plus sein eigener Anteil (konstant, egal wie sortiert).
    // 'orders' ist EINE Basis (Kreis hat nur eine Reihe).
    function pieFractions(orders, data, nCat, origIdx) {
        var total = 0, f = [];
        for (var i = 0; i < nCat; i++) { var v = Math.max(0, data.series[0].values[i]); f[i] = v; total += v; }
        if (total <= 0) total = 1;
        for (i = 0; i < nCat; i++) f[i] = f[i] / total;
        var starts = [];
        for (var m = 0; m < orders.length; m++) {
            var seq = orders[m], acc = 0;
            for (var p = 0; p < seq.length; p++) { if (seq[p] === origIdx) break; acc += f[seq[p]]; }
            starts.push(r6(acc));
        }
        return { starts: starts, own: r6(f[origIdx]) };
    }

    // ---- Daten parsen (robust) --------------------------------------
    // Erkennt automatisch: Trennzeichen (Tab/Semikolon/Komma), Kopfzeile,
    // Spaltenreihenfolge (Label links ODER rechts), deutsches Dezimal-
    // komma, Tausenderpunkte, %-/Waehrungszeichen, Anfuehrungszeichen,
    // Leerzeilen und durchnummerierte Labels ("1. Text").

    // CSV-Zeile splitten (respektiert "..." in Anfuehrungszeichen)
    function splitLine(ln, delim) {
        var out = [], cur = "", q = false;
        for (var i = 0; i < ln.length; i++) {
            var ch = ln.charAt(i);
            if (ch === '"') { q = !q; continue; }
            if (!q && ch === delim) { out.push(cur); cur = ""; continue; }
            cur += ch;
        }
        out.push(cur);
        for (var k = 0; k < out.length; k++) out[k] = out[k].replace(/^\s+|\s+$/g, "");
        return out;
    }

    // Trennzeichen bestimmen: das, welches die meisten Zeilen in >=2 Spalten teilt
    function detectDelim(lines) {
        var cands = ["\t", ";", ",", "|"], best = "\t", bestScore = -1;
        for (var c = 0; c < cands.length; c++) {
            var d = cands[c], score = 0;
            for (var i = 0; i < lines.length; i++)
                if (splitLine(lines[i], d).length >= 2) score++;
            if (score > bestScore) { bestScore = score; best = d; }
        }
        return (bestScore > 0) ? best : "\t";
    }

    // Zahl parsen - deutsch UND englisch, mit Tausendertrennung
    function parseNum(raw, delim) {
        if (raw === undefined || raw === null) return NaN;
        var t = String(raw).replace(/^\s+|\s+$/g, "");
        if (t === "") return NaN;
        t = t.replace(/[%\u20AC$\u00A3\s\u00A0]/g, "");      // %, Waehrung, Leerzeichen
        if (!/[0-9]/.test(t)) return NaN;
        var hasDot = t.indexOf(".") >= 0, hasCom = t.indexOf(",") >= 0;
        var decimalDone = false;
        if (hasDot && hasCom) {
            // das zuletzt stehende Zeichen ist das Dezimaltrennzeichen
            if (t.lastIndexOf(",") > t.lastIndexOf(".")) t = t.replace(/\./g, "").replace(",", ".");
            else t = t.replace(/,/g, "");
            decimalDone = true;
        } else if (hasCom) {
            // Komma ist Dezimaltrenner, ausser es ist selbst das Spalten-Trennzeichen
            if (delim === ",") { t = t.replace(/,/g, ""); }
            else { t = t.replace(",", "."); decimalDone = true; }
        }
        // Reine Tausenderpunkte (1.234) nur dann entschaerfen, wenn das
        // Dezimaltrennzeichen NICHT schon aufgeloest wurde (sonst wuerde
        // aus "69,875" -> "69.875" faelschlich 69875 werden)
        if (!decimalDone && /^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
        var v = parseFloat(t);
        return isNaN(v) ? NaN : v;
    }

    function parseData(txt, log) {
        var raw = String(txt).split(/[\r\n]+/), lines = [];
        for (var i = 0; i < raw.length; i++) if (/\S/.test(raw[i])) lines.push(raw[i]);
        if (lines.length === 0) { log.push("Keine Daten gefunden."); return null; }

        var delim = detectDelim(lines);
        var rows = [];
        for (i = 0; i < lines.length; i++) rows.push(splitLine(lines[i], delim));

        var nCols = 0;
        for (i = 0; i < rows.length; i++) nCols = Math.max(nCols, rows[i].length);
        if (nCols < 2) { log.push("Nur eine Spalte erkannt. Format: Label + Wert (Tab/Semikolon/Komma)."); return null; }

        // Kopfzeile = erste Zeile ganz ohne Zahl
        var header = null;
        var firstHasNum = false;
        for (var c = 0; c < rows[0].length; c++)
            if (!isNaN(parseNum(rows[0][c], delim))) { firstHasNum = true; break; }
        if (!firstHasNum && rows.length > 1) header = rows.shift();
        if (rows.length === 0) { log.push("Keine Datenzeilen."); return null; }

        // Je Spalte zaehlen, wie oft sie numerisch ist
        var numCount = [], textCount = [];
        for (c = 0; c < nCols; c++) { numCount[c] = 0; textCount[c] = 0; }
        for (i = 0; i < rows.length; i++) {
            for (c = 0; c < nCols; c++) {
                var cell = rows[i][c];
                if (cell === undefined || cell === "") continue;
                if (isNaN(parseNum(cell, delim))) textCount[c]++; else numCount[c]++;
            }
        }

        // Label-Spalte = die "textigste" Spalte (funktioniert auch, wenn
        // der Wert LINKS und das Label RECHTS steht)
        var labelCol = 0, bestText = -1;
        for (c = 0; c < nCols; c++) {
            if (textCount[c] > bestText) { bestText = textCount[c]; labelCol = c; }
        }
        // Wertespalten = alle uebrigen mit mindestens einer Zahl
        var valCols = [];
        for (c = 0; c < nCols; c++) if (c !== labelCol && numCount[c] > 0) valCols.push(c);
        if (valCols.length === 0) { log.push("Keine Wertespalte mit Zahlen gefunden."); return null; }

        // Reihen aufbauen, unvollstaendige Zeilen ueberspringen
        var labels = [], series = [], skipped = 0;
        for (var s = 0; s < valCols.length; s++) {
            var nm = (header && header[valCols[s]]) ? header[valCols[s]] : ("Reihe " + (s + 1));
            series.push({ name: nm, values: [] });
        }
        for (i = 0; i < rows.length; i++) {
            var vals = [], ok = false;
            for (s = 0; s < valCols.length; s++) {
                var v = parseNum(rows[i][valCols[s]], delim);
                if (!isNaN(v)) ok = true;
                vals.push(isNaN(v) ? 0 : v);
            }
            if (!ok) { skipped++; continue; }   // z.B. "..."-Zeilen
            var lb = rows[i][labelCol];
            labels.push((lb === undefined || lb === "") ? String(labels.length + 1) : lb);
            for (s = 0; s < valCols.length; s++) series[s].values.push(vals[s]);
        }
        if (labels.length === 0) { log.push("Keine gueltigen Datenzeilen gefunden."); return null; }

        // Fuehrende Nummerierung entfernen, wenn ALLE Labels sie haben ("1. Text")
        var allNumbered = true;
        for (i = 0; i < labels.length; i++)
            if (!/^\s*\d+\s*[.)\-]\s+/.test(labels[i])) { allNumbered = false; break; }
        if (allNumbered)
            for (i = 0; i < labels.length; i++)
                labels[i] = labels[i].replace(/^\s*\d+\s*[.)\-]\s+/, "");

        if (skipped > 0) log.push("Hinweis: " + skipped + " unvollstaendige Zeile(n) uebersprungen.");
        return { labels: labels, series: series };
    }

    // ---- Textebene (an Diagramm geparentet) -------------------------
    function addLabel(comp, chart, txt, posExpr, size, justify, log, lname) {
        var t = null;
        try { t = comp.layers.addText(String(txt)); } catch (e) { log.push("Textebene: " + errStr(e)); return; }
        try { t.name = lname ? lname : ("Text - " + txt); } catch (e) {}
        t.comment = TAG;
        try { t.label = 12; } catch (e) {}
        try {
            var sp = t.property("ADBE Text Properties").property("ADBE Text Document");
            var td = sp.value;
            td.fontSize = size; td.fillColor = [0.9, 0.9, 0.9]; td.justification = justify;
            sp.setValue(td);
        } catch (e) { log.push("Textformat: " + errStr(e)); }
        try { t.parent = chart; } catch (e) { log.push("Label parenten: " + errStr(e)); }
        var tg = t.property("ADBE Transform Group");
        try { tg.property("ADBE Anchor Point").setValue([0, 0]); } catch (e) {}
        setExpr(tg.property("ADBE Position"), posExpr, log, "Label-Position");
    }

    // ---- Diagramm bauen --------------------------------------------
    function buildChart(comp, type, data, opt, log) {
        var nCat = data.labels.length, nSer = data.series.length;

        var layer = comp.layers.addShape();
        layer.name = "Diagramm - " + TYPES[type];
        layer.comment = TAG;
        try { layer.label = 8; } catch (e) {}

        // ---- Regler: Groesse ----
        addCtrl(layer, "ADBE Slider Control", "Breite", SLD, opt.w);
        addCtrl(layer, "ADBE Slider Control", "Hoehe", SLD, opt.h);
        if (isBarLike(type)) addCtrl(layer, "ADBE Slider Control", "Abstand", SLD, opt.gap);
        // Zweiter Abstand nur sinnvoll, wenn Balken innerhalb einer Gruppe stehen
        var hasSerGap = (isBarLike(type) && !isStacked(type) && nSer > 1);
        if (hasSerGap) addCtrl(layer, "ADBE Slider Control", "Reihenabstand", SLD, opt.serGap);

        // ---- Regler: Sortierung (nur wo sinnvoll: Balken & Kreis) ----
        // Ordnet die Kategorien LIVE um: 0=Original 1=Auf 2=Ab 3=A-Z.
        // Zweiter Regler "Sortier-Reihe" (nur bei mehreren Reihen): WONACH
        // sortiert wird - 0=Summe, 1..nSer=jeweilige Reihe. Wichtig bei
        // Anteilsdaten (Zeilen summieren auf 100), wo die Summe nichts
        // unterscheidet. Linie/Flaeche bleiben aussen vor.
        var canSort = canSortType(type);
        var hasBasis = (isBarLike(type) && nSer > 1);
        var nBasis = hasBasis ? (nSer + 1) : 1;
        var ordersAll = canSort ? computeAllOrders(data, nCat, nSer, nBasis) : null;
        if (canSort) addCtrl(layer, "ADBE Slider Control", SORT_NAME, SLD, opt.sort || 0);
        if (hasBasis) {
            // Standard: gruppiert -> Reihe 1 (aussagekraeftig), gestapelt -> Summe
            var basisDef = isStacked(type) ? 0 : 1;
            addCtrl(layer, "ADBE Slider Control", SBASIS_NAME, SLD, basisDef);
        }

        // ---- Regler: Einfaerbung ----
        if (type === T_LINE || type === T_AREA)
            addCtrl(layer, "ADBE Slider Control", "Linienstaerke", SLD, (type === T_LINE) ? 6 : 0);
        if (isBarLike(type)) {
            addCtrl(layer, "ADBE Slider Control", "Kontur Staerke", SLD, 0);
            addCtrl(layer, "ADBE Color Control", "Kontur Farbe", COL, [1, 1, 1, 1]);
        }
        if (type === T_PIE) {
            addCtrl(layer, "ADBE Slider Control", "Innenradius", SLD, 0);
            addCtrl(layer, "ADBE Slider Control", "Kontur Staerke", SLD, 3);
            addCtrl(layer, "ADBE Color Control", "Kontur Farbe", COL, [0.08, 0.08, 0.10, 1]);
        }

        // ---- Farben: EIN Picker pro gezeichnetem Element ----
        // Balken (auch gestapelt): nCat*nSer Picker, Index = cat*nSer + ser
        // Kreis: nCat Picker (je Segment) | Linie/Flaeche: nSer (je Reihe)
        // Vorbelegung ist "smart": bei mehreren Reihen richtet sich die
        // Startfarbe nach der REIHE (gestapelte Segmente einer Reihe also
        // gleich), sonst nach der Kategorie.
        var colorNames = [], colorDefs = [];
        function colorIndex(catIdx, serIdx) {
            if (isBarLike(type)) return catIdx * nSer + serIdx;
            if (type === T_PIE)  return catIdx;
            return serIdx;
        }
        if (isBarLike(type)) {
            for (var ic = 0; ic < nCat; ic++) {
                for (var sc = 0; sc < nSer; sc++) {
                    var nm = "Farbe " + (colorNames.length + 1) + " - " + safeName(data.labels[ic]) +
                             (nSer > 1 ? (" / " + safeName(data.series[sc].name)) : "");
                    colorNames.push(nm);
                    colorDefs.push(PALETTE[(nSer > 1 ? sc : ic) % PALETTE.length]);
                }
            }
        } else if (type === T_PIE) {
            for (var ip = 0; ip < nCat; ip++) {
                colorNames.push("Farbe " + (ip + 1) + " - " + safeName(data.labels[ip]));
                colorDefs.push(PALETTE[ip % PALETTE.length]);
            }
        } else {
            for (var sp2 = 0; sp2 < nSer; sp2++) {
                colorNames.push("Farbe " + (sp2 + 1) + " - " + safeName(data.series[sp2].name));
                colorDefs.push(PALETTE[sp2 % PALETTE.length]);
            }
        }
        for (var ci = 0; ci < colorNames.length; ci++)
            addCtrl(layer, "ADBE Color Control", colorNames[ci], COL, colorDefs[ci]);

        // ---- Regler: Achsen (X und Y getrennt) ----
        // Als wiederverwendbare Sets -> koennen auf die Datenebene ODER
        // (bei getrennten Achsen) auf die jeweilige Achsen-Ebene.
        // Staerke 0 = ausgeblendet (keine extra Checkbox noetig).
        var hasAxes = (type !== T_PIE);
        // Kategorien liegen auf der X-Achse -> senkrechtes Kategorie-Raster
        var catX = (type === T_LINE || type === T_AREA || type === T_VBAR || type === T_VSTACK);
        var sepAxes = (opt.sepAxes && hasAxes);
        function od(v, d) { return (v === undefined || v === null || isNaN(v)) ? d : v; }
        function addXAxisCtrls(lyr) {
            addCtrl(lyr, "ADBE Slider Control", "X-Achse Staerke", SLD, 3);
            addCtrl(lyr, "ADBE Color Control", "X-Achse Farbe", COL, [0.85, 0.85, 0.88, 1]);
            if (catX) {
                addCtrl(lyr, "ADBE Slider Control", "X-Raster Staerke", SLD, od(opt.xgW, 0));
                addCtrl(lyr, "ADBE Color Control", "X-Raster Farbe", COL, [0.45, 0.45, 0.50, 1]);
                addCtrl(lyr, "ADBE Slider Control", "X-Raster Laenge", SLD, od(opt.xgLen, 100));
                addCtrl(lyr, "ADBE Slider Control", "X-Raster Strich", SLD, od(opt.xgDash, 0));
                addCtrl(lyr, "ADBE Slider Control", "X-Raster Luecke", SLD, od(opt.xgGap, 0));
            }
        }
        function addYAxisCtrls(lyr) {
            addCtrl(lyr, "ADBE Slider Control", "Y-Achse Staerke", SLD, 3);
            addCtrl(lyr, "ADBE Color Control", "Y-Achse Farbe", COL, [0.85, 0.85, 0.88, 1]);
            addCtrl(lyr, "ADBE Slider Control", "Raster Staerke", SLD, od(opt.grW, 1));
            addCtrl(lyr, "ADBE Color Control", "Raster Farbe", COL, [0.45, 0.45, 0.50, 1]);
            addCtrl(lyr, "ADBE Slider Control", "Raster Laenge", SLD, od(opt.grLen, 100));
            addCtrl(lyr, "ADBE Slider Control", "Raster Strich", SLD, od(opt.grDash, 0));
            addCtrl(lyr, "ADBE Slider Control", "Raster Luecke", SLD, od(opt.grGap, 0));
        }
        if (hasAxes && !sepAxes) { addXAxisCtrls(layer); addYAxisCtrls(layer); }

        var W = 'effect("Breite")("' + SLD + '")';
        var H = 'effect("Hoehe")("' + SLD + '")';
        // Groesse vom Diagramm aus Sicht einer geparenteten Achsen-Ebene
        var Wp = 'parent.effect("Breite")("' + SLD + '")';
        var Hp = 'parent.effect("Hoehe")("' + SLD + '")';
        // gC = Abstand zwischen Kategorien, gS = Abstand innerhalb der Gruppe
        var GC = (isBarLike(type) ? 'var gC=clamp(effect("Abstand")("' + SLD + '")/100,0,0.9);' : 'var gC=0;');
        var GS = (hasSerGap ? 'var gS=clamp(effect("Reihenabstand")("' + SLD + '")/100,0,0.9);' : 'var gS=0;');

        // Konturstaerke in ECHTEN Pixeln: teilt durch die Ebenenskalierung,
        // damit die angegebene Staerke unabhaengig von Scale/Breite/Hoehe
        // exakt so im Bild landet, wie eingestellt.
        function strokeExpr(ctrlName) {
            return 'var s=transform.scale;' +
                   'var f=(Math.abs(s[0])+Math.abs(s[1]))/200;f=Math.max(0.0001,f);' +
                   'var w=effect("' + ctrlName + '")("' + SLD + '");' +
                   'Math.max(0,w)/f;';
        }

        // Strichelung an eine Kontur haengen. prefix -> Regler
        //   "<prefix> Strich" (Strichlaenge, 0 = durchgezogen) und
        //   "<prefix> Luecke" (0 = Luecke wie Strich). Skalen-kompensiert,
        //   damit das Muster im Bild konstant bleibt.
        function addDashes(strokeGroup, prefix) {
            try {
                var dg = strokeGroup.property("ADBE Vector Stroke Dashes");
                var dash = dg.addProperty("ADBE Vector Stroke Dash 1");
                var gap = dg.addProperty("ADBE Vector Stroke Gap 1");
                var cmp = 'var s=transform.scale;var f=(Math.abs(s[0])+Math.abs(s[1]))/200;f=Math.max(0.0001,f);' +
                          'var DW=' + W + ',DH=' + H + ';' +
                          // "durchgezogen" = ein Strich, der sicher laenger ist
                          // als jeder Pfad (kein 100000 -> sonst Rendergrieseln)
                          'var SOLID=(Math.abs(DW)+Math.abs(DH))*4+1000;';
                setExpr(dash, cmp + 'var d=effect("' + prefix + ' Strich")("' + SLD + '");(d>0)?(d/f):SOLID;',
                    log, prefix + " Strich");
                setExpr(gap, cmp + 'var d=effect("' + prefix + ' Strich")("' + SLD + '");' +
                    'var gp=effect("' + prefix + ' Luecke")("' + SLD + '");(d>0)?((gp>0?gp:d)/f):0;',
                    log, prefix + " Luecke");
            } catch (e) { log.push(prefix + " Strichelung: " + errStr(e)); }
        }

        // Pfad einer Wert-Rasterlinie. "Raster Laenge" (%) misst von der
        // Achse aus: waagerecht ab der Y-Achse (links) nach rechts,
        // senkrecht ab der Grundlinie (unten) nach oben.
        function gridPath(gIdx, w, h, ref) {
            var frac = gIdx / nGrid;
            var pre = 'var W=' + w + ',H=' + h + ';' +
                      'var L=' + ref + '("Raster Laenge")("' + SLD + '")/100;';
            return isVertical(type)
                ? pre + 'var y=H/2-' + frac + '*H;createPath([[-W/2,y],[-W/2+L*W,y]],[],[],false);'
                : pre + 'var x=-W/2+' + frac + '*W;createPath([[x,H/2],[x,H/2-L*H]],[],[],false);';
        }
        // Pfad eines Kategorie-Rasters: senkrechter Strich genau dort, wo
        // die Kategorie-Beschriftung steht. Bei Balken folgt er der
        // Sortierung, bei Linie/Flaeche sitzt er am Datenpunkt.
        // lenRef = wo der Laengen-Regler sitzt (lokal), sortRef = wo die
        // Sortier-Regler sitzen (immer auf dem Diagramm).
        function xGridPath(idx, w, h, lenRef, sortRef) {
            var pre = 'var W=' + w + ',H=' + h + ';' +
                      'var L=' + lenRef + '("X-Raster Laenge")("' + SLD + '")/100;';
            var xE = (type === T_LINE || type === T_AREA)
                ? 'var x=(' + nCat + '>1)?(-W/2+' + idx + '*(W/' + (nCat - 1 || 1) + ')):0;'
                : (sortSlotExpr(ordersAll, idx, sortRef, hasBasis) +
                   'var x=-W/2+(slot+0.5)*(W/' + nCat + ');');
            return pre + xE + 'createPath([[x,H/2],[x,H/2-L*H]],[],[],false);';
        }

        // Farb-Expression je Element (mit Absicherung gegen fehlende Picker)
        function colorExpr(catIdx, serIdx) {
            var n = colorIndex(catIdx, serIdx);
            var nm = colorNames[n];
            if (nm === undefined) {                       // darf nicht passieren -> Notfarbe
                log.push("Farb-Picker fehlt (Index " + n + ") - Ersatzfarbe gesetzt.");
                var c = colorDefs[0] || [1, 1, 1, 1];
                return '[' + c[0] + ',' + c[1] + ',' + c[2] + ',1];';
            }
            return 'effect("' + nm + '")("' + COL + '");';
        }

        // ---- Maximalwert + glatte Rasterschritte ----
        var maxV = 0, i, s2;
        if (isStacked(type)) {
            for (i = 0; i < nCat; i++) {
                var sum = 0;
                for (s2 = 0; s2 < nSer; s2++) sum += Math.max(0, data.series[s2].values[i]);
                maxV = Math.max(maxV, sum);
            }
        } else {
            for (s2 = 0; s2 < nSer; s2++)
                for (i = 0; i < nCat; i++) maxV = Math.max(maxV, Math.abs(data.series[s2].values[i]));
        }
        if (maxV <= 0) maxV = 1;

        // Achsenmaximum auf ein Vielfaches einer "schoenen" Schrittweite
        // hochziehen -> Rasterwerte sind glatt (10er, 20er, 50er ...)
        var axisMax = maxV, gridStep = 0, nGrid = 0;
        if (hasAxes) {
            // Richtwert fuer die Linienanzahl; chooseScale() weicht davon ab,
            // wenn eine glattere Schrittweite naeher am Hoechstwert liegt.
            var sc = chooseScale(maxV, DIVS_HINT);
            gridStep = sc.step; nGrid = sc.lines; axisMax = sc.axisMax;
        }

        // ---- Phase 1: Struktur (Daten zuerst, Raster/Achsen dahinter) ----
        var root = layer.property("ADBE Root Vectors Group");
        var plan = [];
        // X- und Y-Achse zuerst -> rendern in Formebenen GANZ OBEN (ueber allen Daten).
        // Bei getrennten Achsen wandern sie stattdessen auf eigene Ebenen.
        if (hasAxes && !sepAxes) { plan.push({ kind: "axisX" }); plan.push({ kind: "axisY" }); }
        if (isBarLike(type)) {
            for (s2 = 0; s2 < nSer; s2++) for (i = 0; i < nCat; i++) plan.push({ kind: "rect", s: s2, i: i });
        } else if (type === T_PIE) {
            for (i = 0; i < nCat; i++) plan.push({ kind: "pie", s: 0, i: i });
        } else {
            for (s2 = 0; s2 < nSer; s2++) plan.push({ kind: "poly", s: s2, i: -1 });
        }
        if (hasAxes && !sepAxes) {
            for (var gI = 1; gI <= nGrid; gI++) plan.push({ kind: "grid", g: gI }); // ganz hinten
            // Kategorie-Raster: senkrechte Striche (nur wo Kategorien auf X liegen)
            if (catX) for (i = 0; i < nCat; i++) plan.push({ kind: "xgrid", i: i });
        }

        for (var p = 0; p < plan.length; p++) {
            var k0 = plan[p].kind;
            var grp = root.addProperty("ADBE Vector Group");
            var gname;
            if (k0 === "rect")       gname = isStacked(type)
                                        ? ("Wert " + (plan[p].i + 1) + " - Reihe " + (plan[p].s + 1))
                                        : ("Wert " + (plan[p].i * nSer + plan[p].s + 1));
            else if (k0 === "pie")   gname = "Wert " + (plan[p].i + 1);
            else if (k0 === "poly")  gname = "Reihe " + (plan[p].s + 1);
            else if (k0 === "grid")  gname = "Raster " + plan[p].g;
            else if (k0 === "xgrid") gname = "X-Raster " + (plan[p].i + 1);
            else if (k0 === "axisX") gname = "X-Achse";
            else                     gname = "Y-Achse";
            try { grp.name = gname; } catch (e) { log.push("Name " + gname + ": " + errStr(e)); }

            var gc = grp.property("ADBE Vectors Group");
            if (k0 === "rect") gc.addProperty("ADBE Vector Shape - Rect");
            else gc.addProperty("ADBE Vector Shape - Group");

            // FIX: Fuellung NUR fuer Datenformen, nie fuer Raster/Achsen
            if (k0 === "rect" || k0 === "pie" || (k0 === "poly" && type === T_AREA))
                gc.addProperty("ADBE Vector Graphic - Fill");
            // Konturen
            if (k0 === "rect" || k0 === "pie" ||
                (k0 === "poly" && (type === T_LINE || type === T_AREA)) ||
                k0 === "grid" || k0 === "xgrid" || k0 === "axisX" || k0 === "axisY")
                gc.addProperty("ADBE Vector Graphic - Stroke");
        }

        // ---- Phase 2: frische Referenzen + Expressions ----
        var rootF = layer.property("ADBE Root Vectors Group");

        for (var q = 0; q < plan.length; q++) {
            var it = plan[q];
            var g = rootF.property(q + 1).property("ADBE Vectors Group");

            if (it.kind === "rect") {
                var rect = g.property("ADBE Vector Shape - Rect");
                var v = data.series[it.s].values[it.i];
                var below = 0;
                if (isStacked(type))
                    for (var bb = 0; bb < it.s; bb++) below += Math.max(0, data.series[bb].values[it.i]);

                // Aufbau: Kategorie-Slot (cw) -> Gruppe (gw) -> Balken (bw)
                //   cw = Achse / nCat
                //   gw = cw * (1 - Abstand)                 <- Luft zwischen Kategorien
                //   bs = gw / nSer   (Slot je Reihe)
                //   bw = bs * (1 - Reihenabstand)           <- Luft innerhalb der Gruppe
                var STACK = isStacked(type);
                // 'slot' = Anzeige-Position dieser Kategorie (haengt am Regler);
                // ersetzt den frueher fest eingebackenen Kategorie-Index it.i.
                var geo = GC + GS + sortSlotExpr(ordersAll, it.i, "effect", hasBasis) +
                    'var cw=AXIS/' + nCat + ';' +
                    'var gw=cw*(1-gC);' +
                    (STACK
                        ? 'var bw=gw;var off=cw*(slot+0.5);'
                        : 'var bs=gw/' + nSer + ';var bw=bs*(1-gS);' +
                          'var off=cw*slot+cw/2-gw/2+bs*' + (it.s + 0.5) + ';');

                if (type === T_VBAR || type === T_VSTACK) {
                    setExpr(rect.property("ADBE Vector Rect Size"),
                        'var W=' + W + ',H=' + H + ';var AXIS=W;' + geo +
                        'var hh=(' + v + '/' + axisMax + ')*H;[bw,hh];', log, "Balkengroesse");
                    setExpr(rect.property("ADBE Vector Rect Position"),
                        'var W=' + W + ',H=' + H + ';var AXIS=W;' + geo +
                        'var hh=(' + v + '/' + axisMax + ')*H;' +
                        'var bl=(' + below + '/' + axisMax + ')*H;' +
                        '[-W/2+off, H/2-bl-hh/2];', log, "Balkenposition");
                } else {
                    setExpr(rect.property("ADBE Vector Rect Size"),
                        'var W=' + W + ',H=' + H + ';var AXIS=H;' + geo +
                        'var ln=(' + v + '/' + axisMax + ')*W;[ln,bw];', log, "Balkengroesse");
                    setExpr(rect.property("ADBE Vector Rect Position"),
                        'var W=' + W + ',H=' + H + ';var AXIS=H;' + geo +
                        'var ln=(' + v + '/' + axisMax + ')*W;' +
                        'var bl=(' + below + '/' + axisMax + ')*W;' +
                        '[-W/2+bl+ln/2, -H/2+off];', log, "Balkenposition");
                }
                var fl = g.property("ADBE Vector Graphic - Fill");
                setExpr(fl.property("ADBE Vector Fill Color"), colorExpr(it.i, it.s), log, "Balkenfarbe");
                var bst = g.property("ADBE Vector Graphic - Stroke");
                setExpr(bst.property("ADBE Vector Stroke Color"), 'effect("Kontur Farbe")("' + COL + '");', log, "Konturfarbe");
                setExpr(bst.property("ADBE Vector Stroke Width"), strokeExpr("Kontur Staerke"), log, "Konturstaerke");

            } else if (it.kind === "pie") {
                // Eigener Anteil ist konstant; nur der Startwinkel haengt an
                // der Reihenfolge -> je Modus vorberechnet, Regler waehlt aus.
                var pf0 = pieFractions(ordersAll[0], data, nCat, it.i);
                setExpr(g.property("ADBE Vector Shape - Group").property("ADBE Vector Shape"),
                    'var W=' + W + ',H=' + H + ';var R=Math.min(W,H)/2;' +
                    'var ir=effect("Innenradius")("' + SLD + '")/100;var Ri=R*Math.max(0,Math.min(0.95,ir));' +
                    'var SM=Math.round(effect("' + SORT_NAME + '")("' + SLD + '"));SM=(SM<0)?0:(SM>' + (SORT_MODES - 1) + ')?' + (SORT_MODES - 1) + ':SM;' +
                    'var a0=-Math.PI/2+([' + pf0.starts.join(",") + '][SM])*2*Math.PI;' +
                    'var a1=a0+(' + pf0.own + ')*2*Math.PI;' +
                    'var N=Math.max(2,Math.ceil(Math.abs(a1-a0)/0.06));var pts=[];' +
                    'for(var k=0;k<=N;k++){var a=a0+(a1-a0)*k/N;pts.push([Math.cos(a)*R,Math.sin(a)*R]);}' +
                    'if(Ri>0){for(var k2=N;k2>=0;k2--){var a2=a0+(a1-a0)*k2/N;pts.push([Math.cos(a2)*Ri,Math.sin(a2)*Ri]);}}' +
                    'else{pts.push([0,0]);}createPath(pts,[],[],true);', log, "Segment-Pfad");
                var pf = g.property("ADBE Vector Graphic - Fill");
                setExpr(pf.property("ADBE Vector Fill Color"), colorExpr(it.i, 0), log, "Segmentfarbe");
                var pst = g.property("ADBE Vector Graphic - Stroke");
                setExpr(pst.property("ADBE Vector Stroke Color"), 'effect("Kontur Farbe")("' + COL + '");', log, "Konturfarbe");
                setExpr(pst.property("ADBE Vector Stroke Width"), strokeExpr("Kontur Staerke"), log, "Konturstaerke");

            } else if (it.kind === "poly") {
                var vals = data.series[it.s].values;
                var closed = (type === T_AREA) ? "true" : "false";
                var extra = (type === T_AREA) ? 'pts.push([W/2,H/2]);pts.push([-W/2,H/2]);' : '';
                setExpr(g.property("ADBE Vector Shape - Group").property("ADBE Vector Shape"),
                    'var W=' + W + ',H=' + H + ';var d=' + arrLit(vals) + ';var n=d.length;var pts=[];' +
                    'for(var k=0;k<n;k++){var x=(n>1)?(-W/2+k*(W/(n-1))):0;' +
                    'var y=H/2-(d[k]/' + axisMax + ')*H;pts.push([x,y]);}' + extra +
                    'createPath(pts,[],[],' + closed + ');', log, "Pfad");
                if (type === T_AREA) {
                    var af = g.property("ADBE Vector Graphic - Fill");
                    setExpr(af.property("ADBE Vector Fill Color"), colorExpr(0, it.s), log, "Flaechenfarbe");
                }
                var lst = g.property("ADBE Vector Graphic - Stroke");
                setExpr(lst.property("ADBE Vector Stroke Color"), colorExpr(0, it.s), log, "Linienfarbe");
                setExpr(lst.property("ADBE Vector Stroke Width"), strokeExpr("Linienstaerke"), log, "Linienstaerke");

            } else if (it.kind === "grid") {
                setExpr(g.property("ADBE Vector Shape - Group").property("ADBE Vector Shape"),
                    gridPath(it.g, W, H, "effect"), log, "Rasterlinie");
                var gst = g.property("ADBE Vector Graphic - Stroke");
                setExpr(gst.property("ADBE Vector Stroke Color"), 'effect("Raster Farbe")("' + COL + '");', log, "Rasterfarbe");
                setExpr(gst.property("ADBE Vector Stroke Width"), strokeExpr("Raster Staerke"), log, "Rasterstaerke");
                addDashes(gst, "Raster");

            } else if (it.kind === "xgrid") {
                setExpr(g.property("ADBE Vector Shape - Group").property("ADBE Vector Shape"),
                    xGridPath(it.i, W, H, "effect", "effect"), log, "X-Rasterlinie");
                var xgst = g.property("ADBE Vector Graphic - Stroke");
                setExpr(xgst.property("ADBE Vector Stroke Color"), 'effect("X-Raster Farbe")("' + COL + '");', log, "X-Rasterfarbe");
                setExpr(xgst.property("ADBE Vector Stroke Width"), strokeExpr("X-Raster Staerke"), log, "X-Rasterstaerke");
                addDashes(xgst, "X-Raster");

            } else if (it.kind === "axisX") {
                setExpr(g.property("ADBE Vector Shape - Group").property("ADBE Vector Shape"),
                    'var W=' + W + ',H=' + H + ';createPath([[-W/2,H/2],[W/2,H/2]],[],[],false);', log, "X-Achse");
                var xs = g.property("ADBE Vector Graphic - Stroke");
                setExpr(xs.property("ADBE Vector Stroke Color"), 'effect("X-Achse Farbe")("' + COL + '");', log, "X-Farbe");
                setExpr(xs.property("ADBE Vector Stroke Width"), strokeExpr("X-Achse Staerke"), log, "X-Staerke");

            } else if (it.kind === "axisY") {
                setExpr(g.property("ADBE Vector Shape - Group").property("ADBE Vector Shape"),
                    'var W=' + W + ',H=' + H + ';createPath([[-W/2,-H/2],[-W/2,H/2]],[],[],false);', log, "Y-Achse");
                var ys = g.property("ADBE Vector Graphic - Stroke");
                setExpr(ys.property("ADBE Vector Stroke Color"), 'effect("Y-Achse Farbe")("' + COL + '");', log, "Y-Farbe");
                setExpr(ys.property("ADBE Vector Stroke Width"), strokeExpr("Y-Achse Staerke"), log, "Y-Staerke");
            }
        }

        try {
            layer.property("ADBE Transform Group").property("ADBE Position")
                 .setValue([comp.width / 2, comp.height / 2]);
        } catch (e) {}

        // ---- Achsen auf eigenen Ebenen (X und Y getrennt) ----
        // Zwei separate, an das Diagramm geparentete Formebenen mit EIGENEN
        // Effekt-Reglern (Staerke/Farbe/Raster/Strichelung). Die Groesse
        // kommt ueber parent.effect vom Diagramm; die Ebenen liegen unter
        // der Datenebene, damit Balken/Linien immer davor stehen.
        function strokeExprL(c) {   // Breite lokal, Skalen-Kompensation ueber Parent
            return 'var s=parent.transform.scale;var f=(Math.abs(s[0])+Math.abs(s[1]))/200;f=Math.max(0.0001,f);' +
                   'var w=effect("' + c + '")("' + SLD + '");Math.max(0,w)/f;';
        }
        function dashesL(st, pre) {
            try {
                var dg = st.property("ADBE Vector Stroke Dashes");
                var dash = dg.addProperty("ADBE Vector Stroke Dash 1");
                var gap = dg.addProperty("ADBE Vector Stroke Gap 1");
                var cmp = 'var s=parent.transform.scale;var f=(Math.abs(s[0])+Math.abs(s[1]))/200;f=Math.max(0.0001,f);' +
                          'var DW=' + Wp + ',DH=' + Hp + ';var SOLID=(Math.abs(DW)+Math.abs(DH))*4+1000;';
                setExpr(dash, cmp + 'var d=effect("' + pre + ' Strich")("' + SLD + '");(d>0)?(d/f):SOLID;',
                    log, pre + " Strich");
                setExpr(gap, cmp + 'var d=effect("' + pre + ' Strich")("' + SLD + '");' +
                    'var gp=effect("' + pre + ' Luecke")("' + SLD + '");(d>0)?((gp>0?gp:d)/f):0;',
                    log, pre + " Luecke");
            } catch (e) { log.push(pre + " Strichelung(Achse): " + errStr(e)); }
        }
        function newAxisLayer(nm, lab, addCtrls) {
            var ax = comp.layers.addShape();
            try { ax.name = nm; } catch (e) {}
            ax.comment = TAG;
            try { ax.label = lab; } catch (e) {}
            try {
                ax.property("ADBE Transform Group").property("ADBE Position")
                  .setValue([comp.width / 2, comp.height / 2]);
            } catch (e) {}
            try { ax.parent = layer; } catch (e) { log.push(nm + " parenten: " + errStr(e)); }
            try { ax.moveAfter(layer); } catch (e) {}   // hinter die Datenebene
            if (addCtrls) addCtrls(ax);
            return ax;
        }
        function newGroup(rootG, nm) {
            var grp = rootG.addProperty("ADBE Vector Group");
            try { grp.name = nm; } catch (e) { log.push("Name " + nm + ": " + errStr(e)); }
            var gc = grp.property("ADBE Vectors Group");
            gc.addProperty("ADBE Vector Shape - Group");
            gc.addProperty("ADBE Vector Graphic - Stroke");
            return gc;
        }
        function buildYLayer() {
            var ax = newAxisLayer("Y-Achse - " + TYPES[type], 10, addYAxisCtrls);
            var rg = ax.property("ADBE Root Vectors Group");
            var gY = newGroup(rg, "Y-Achse");
            setExpr(gY.property("ADBE Vector Shape - Group").property("ADBE Vector Shape"),
                'var W=' + Wp + ',H=' + Hp + ';createPath([[-W/2,-H/2],[-W/2,H/2]],[],[],false);', log, "Y-Achse");
            var yst = gY.property("ADBE Vector Graphic - Stroke");
            setExpr(yst.property("ADBE Vector Stroke Color"), 'effect("Y-Achse Farbe")("' + COL + '");', log, "Y-Farbe");
            setExpr(yst.property("ADBE Vector Stroke Width"), strokeExprL("Y-Achse Staerke"), log, "Y-Staerke");
            for (var gg = 1; gg <= nGrid; gg++) {
                var gG = newGroup(rg, "Raster " + gg);
                setExpr(gG.property("ADBE Vector Shape - Group").property("ADBE Vector Shape"),
                    gridPath(gg, Wp, Hp, "effect"), log, "Rasterlinie");
                var gs = gG.property("ADBE Vector Graphic - Stroke");
                setExpr(gs.property("ADBE Vector Stroke Color"), 'effect("Raster Farbe")("' + COL + '");', log, "Rasterfarbe");
                setExpr(gs.property("ADBE Vector Stroke Width"), strokeExprL("Raster Staerke"), log, "Rasterstaerke");
                dashesL(gs, "Raster");
            }
            return ax;
        }
        function buildXLayer() {
            var ax = newAxisLayer("X-Achse - " + TYPES[type], 11, addXAxisCtrls);
            var rg = ax.property("ADBE Root Vectors Group");
            var gX = newGroup(rg, "X-Achse");
            setExpr(gX.property("ADBE Vector Shape - Group").property("ADBE Vector Shape"),
                'var W=' + Wp + ',H=' + Hp + ';createPath([[-W/2,H/2],[W/2,H/2]],[],[],false);', log, "X-Achse");
            var xst = gX.property("ADBE Vector Graphic - Stroke");
            setExpr(xst.property("ADBE Vector Stroke Color"), 'effect("X-Achse Farbe")("' + COL + '");', log, "X-Farbe");
            setExpr(xst.property("ADBE Vector Stroke Width"), strokeExprL("X-Achse Staerke"), log, "X-Staerke");
            if (catX) {
                for (var ii = 0; ii < nCat; ii++) {
                    var gXg = newGroup(rg, "X-Raster " + (ii + 1));
                    // Sortier-Regler stehen auf dem Diagramm -> parent.effect
                    setExpr(gXg.property("ADBE Vector Shape - Group").property("ADBE Vector Shape"),
                        xGridPath(ii, Wp, Hp, "effect", "parent.effect"),
                        log, "X-Rasterlinie");
                    var xgs = gXg.property("ADBE Vector Graphic - Stroke");
                    setExpr(xgs.property("ADBE Vector Stroke Color"), 'effect("X-Raster Farbe")("' + COL + '");', log, "X-Rasterfarbe");
                    setExpr(xgs.property("ADBE Vector Stroke Width"), strokeExprL("X-Raster Staerke"), log, "X-Rasterstaerke");
                    dashesL(xgs, "X-Raster");
                }
            }
            return ax;
        }
        if (sepAxes) { buildYLayer(); buildXLayer(); }

        // ---- Beschriftung (Regler stehen auf dem Parent!) ----
        var WL = 'parent.effect("Breite")("' + SLD + '")';
        var HL = 'parent.effect("Hoehe")("' + SLD + '")';
        if (opt.labels) {
            var fs = opt.fontSize, k;
            if (type === T_PIE) {
                var totP = 0;
                for (k = 0; k < nCat; k++) totP += Math.max(0, data.series[0].values[k]);
                if (totP <= 0) totP = 1;
                for (k = 0; k < nCat; k++) {
                    var fr = Math.max(0, data.series[0].values[k]) / totP;
                    var pfK = pieFractions(ordersAll[0], data, nCat, k);
                    var mids = [];   // Mittelwinkel-Anteil je Modus (Start + halber Anteil)
                    for (var mk = 0; mk < pfK.starts.length; mk++) mids.push(r6(pfK.starts[mk] + pfK.own / 2));
                    addLabel(comp, layer, data.labels[k] + " (" + Math.round(fr * 100) + "%)",
                        'var W=' + WL + ',H=' + HL + ';var R=Math.min(W,H)/2;' +
                        'var SM=Math.round(parent.effect("' + SORT_NAME + '")("' + SLD + '"));SM=(SM<0)?0:(SM>' + (SORT_MODES - 1) + ')?' + (SORT_MODES - 1) + ':SM;' +
                        'var a=-Math.PI/2+([' + mids.join(",") + '][SM])*2*Math.PI;' +
                        '[Math.cos(a)*R*1.18, Math.sin(a)*R*1.18];',
                        fs, ParagraphJustification.CENTER_JUSTIFY, log, "Text Wert " + (k + 1));
                }
            } else {
                for (k = 0; k < nCat; k++) {
                    // Bei Balken folgt das Label dem Slot (Regler); bei Linie/
                    // Flaeche bleibt es an der festen Datenposition.
                    var barLbl = (isBarLike(type) && canSort);
                    if (isVertical(type)) {
                        var xE = (type === T_LINE || type === T_AREA)
                            ? 'var x=(' + nCat + '>1)?(-W/2+' + k + '*(W/' + (nCat - 1 || 1) + ')):0;'
                            : (sortSlotExpr(ordersAll, k, "parent.effect", hasBasis) + 'var x=-W/2+(slot+0.5)*(W/' + nCat + ');');
                        addLabel(comp, layer, data.labels[k],
                            'var W=' + WL + ',H=' + HL + ';' + xE + '[x, H/2+' + Math.round(fs * 1.4) + '];',
                            fs, ParagraphJustification.CENTER_JUSTIFY, log, "Text Wert " + (k + 1));
                    } else {
                        addLabel(comp, layer, data.labels[k],
                            'var W=' + WL + ',H=' + HL + ';' +
                            (barLbl ? sortSlotExpr(ordersAll, k, "parent.effect", hasBasis) : 'var slot=' + k + ';') +
                            ('var y=-H/2+(slot+0.5)*(H/' + nCat + ')+' + Math.round(fs * 0.35) + ';') +
                            '[-W/2-' + Math.round(fs * 0.6) + ', y];',
                            fs, ParagraphJustification.RIGHT_JUSTIFY, log, "Text Wert " + (k + 1));
                    }
                }
                if (nGrid > 0) {
                    for (var gi = 0; gi <= nGrid; gi++) {
                        var f2 = gi / nGrid;
                        var vt = fmtNum(gridStep * gi);
                        if (isVertical(type)) {
                            addLabel(comp, layer, vt,
                                'var W=' + WL + ',H=' + HL + ';var y=H/2-' + f2 + '*H+' + Math.round(fs * 0.35) + ';' +
                                '[-W/2-' + Math.round(fs * 0.6) + ', y];',
                                fs, ParagraphJustification.RIGHT_JUSTIFY, log, "Text Achse " + gi);
                        } else {
                            addLabel(comp, layer, vt,
                                'var W=' + WL + ',H=' + HL + ';var x=-W/2+' + f2 + '*W;' +
                                '[x, H/2+' + Math.round(fs * 1.4) + '];',
                                fs, ParagraphJustification.CENTER_JUSTIFY, log, "Text Achse " + gi);
                        }
                    }
                }
            }
        }
        return layer;
    }

    // ---- Aktion ----------------------------------------------------
    function run(typeIdx, txt, opt) {
        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) { alert("Bitte eine Komposition auswaehlen."); return; }
        var log = [];
        var data = parseData(txt, log);
        if (!data) { alert("ChartBuilder:\n\n" + log.join("\n")); return; }
        app.beginUndoGroup(SCRIPT_NAME);
        try {
            var l = buildChart(comp, typeIdx, data, opt, log);
            if (l) l.selected = true;
        } catch (e) {
            var lt = ""; try { if (e && e.line) lt = " (Zeile " + e.line + ")"; } catch (x) {}
            log.push("ABBRUCH: " + errStr(e) + lt);
        }
        app.endUndoGroup();
        if (log.length > 0)
            alert("ChartBuilder - Diagnose:\n\n" + log.join("\n") + "\n\n(Bitte diese Meldung 1:1 zurueckmelden.)");
    }

    function removeGenerated() {
        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) { alert("Bitte eine Komposition auswaehlen."); return; }
        app.beginUndoGroup(SCRIPT_NAME + " - Entfernen");
        var n = 0;
        for (var i = comp.numLayers; i >= 1; i--) { var ly = comp.layer(i); if (ly.comment === TAG) { ly.remove(); n++; } }
        app.endUndoGroup();
        if (n === 0) alert("Keine erzeugten Diagramm-Ebenen gefunden.");
    }

    // ---- UI ---------------------------------------------------------
    function buildUI(thisObj) {
        var pal = (thisObj instanceof Panel) ? thisObj
            : new Window("palette", SCRIPT_NAME, undefined, { resizeable: true });
        pal.orientation = "column"; pal.alignChildren = ["fill", "top"];
        pal.spacing = 8; pal.margins = 12;

        var title = pal.add("statictext", undefined, "ChartBuilder");
        try { title.graphics.font = ScriptUI.newFont("dialog", "BOLD", 14); } catch (x) {}

        var dd = pal.add("dropdownlist", undefined, TYPES);
        dd.selection = 0;

        var gData = pal.add("panel", undefined, "Daten");
        gData.orientation = "column"; gData.alignChildren = ["fill", "top"];
        gData.margins = 10; gData.spacing = 6;
        var ta = gData.add("edittext", undefined,
            "Label,Wert\nJan,120\nFeb,180\nMrz,90\nApr,150",
            { multiline: true, scrolling: true });
        ta.preferredSize.height = 95;
        var btnImp = gData.add("button", undefined, "CSV / TXT importieren");
        btnImp.onClick = function () {
            var f = File.openDialog("Datendatei waehlen (CSV/TXT)");
            if (!f) return;
            if (f.open("r")) { ta.text = f.read(); f.close(); }
            else alert("Datei konnte nicht geoeffnet werden.");
        };

        function row(parent, label, def) {
            var r = parent.add("group");
            r.orientation = "row"; r.alignChildren = ["left", "center"];
            var st = r.add("statictext", undefined, label); st.preferredSize.width = 120;
            var et = r.add("edittext", undefined, String(def)); et.characters = 6;
            return et;
        }

        var gSize = pal.add("panel", undefined, "Groesse");
        gSize.orientation = "column"; gSize.alignChildren = ["fill", "top"];
        gSize.margins = 10; gSize.spacing = 6;
        var eW = row(gSize, "Breite (px)", 800);
        var eH = row(gSize, "Hoehe (px)", 450);
        var eG = row(gSize, "Abstand (%)", 30);
        var eGS = row(gSize, "Reihenabstand (%)", 10);

        var gAx = pal.add("panel", undefined, "Achsen & Raster");
        gAx.orientation = "column"; gAx.alignChildren = ["fill", "top"];
        gAx.margins = 10; gAx.spacing = 6;
        // Die Rasterschritte waehlt chooseScale() automatisch passend zur
        // Datenlage - deshalb gibt es hier keine Unterteilungs-Eingabe mehr.
        var cSep = gAx.add("checkbox", undefined, "X-/Y-Achse als eigene Ebenen");
        cSep.value = true;


        var gSort = pal.add("panel", undefined, "Sortierung (Balken & Kreis)");
        gSort.orientation = "column"; gSort.alignChildren = ["fill", "top"];
        gSort.margins = 10; gSort.spacing = 6;
        var rSort = gSort.add("group"); rSort.orientation = "row"; rSort.alignChildren = ["left", "center"];
        var stSort = rSort.add("statictext", undefined, "Start"); stSort.preferredSize.width = 120;
        var ddSort = rSort.add("dropdownlist", undefined,
            ["Original", "Aufsteigend", "Absteigend", "Alphabetisch (A-Z)"]);
        ddSort.selection = 0;

        var gCol = pal.add("panel", undefined, "Farben & Beschriftung");
        gCol.orientation = "column"; gCol.alignChildren = ["fill", "top"];
        gCol.margins = 10; gCol.spacing = 6;
        var cLb = gCol.add("checkbox", undefined, "Textebenen anlegen"); cLb.value = true;
        var eF = row(gCol, "Schriftgroesse", 24);

        var btn = pal.add("button", undefined, "Diagramm erstellen");
        btn.onClick = function () {
            run(dd.selection ? dd.selection.index : 0, ta.text, {
                w: num(eW, 800), h: num(eH, 450), gap: num(eG, 30), serGap: num(eGS, 10),
                labels: cLb.value, fontSize: num(eF, 24),
                sort: (ddSort.selection ? ddSort.selection.index : 0),
                sepAxes: cSep.value
            });
        };
        var btnDel = pal.add("button", undefined, "Diagramme entfernen");
        btnDel.onClick = function () { removeGenerated(); };

        pal.layout.layout(true);
        pal.onResizing = pal.onResize = function () { this.layout.resize(); };
        return pal;
    }

    var ui = buildUI(thisObj);
    if (ui instanceof Window) { ui.center(); ui.show(); }

})(this);
