/**********************************************************************
 * ChartAnimator.jsx
 * ---------------------------------------------------------------
 * Andockbares Panel zum Erzeugen von ANIMIERBAREN Diagrammen als
 * Formebenen. Basiert auf ChartBuilder, Fokus: jede Diagrammart per
 * EINEM Master-Regler animieren, mit voller Timing-Kontrolle.
 *
 * Diagrammarten: Balken vertikal, Balken horizontal, Kreisdiagramm,
 *                Liniendiagramm, Flaechendiagramm.
 *
 * ===== ANIMATION (Kern) =========================================
 * Ein Regler "Animation" (0..100) auf der Ebene steuert den gesamten
 * Ablauf und ist KEYFRAMEBAR -> Timing, Tempo, Pausen und Easing
 * regelst du komplett ueber die Keyframes (jederzeit editierbar).
 * Der Fortschritt mappt logisch auf die X-Achse:
 *   - Linie/Flaeche: zeichnen sich von links nach rechts auf; ein
 *     mitlaufender Punkt + eine mitlaufende Wertanzeige sitzen an der
 *     Spitze (Punkt: Regler "Punkt Groesse").
 *   - Balken vertikal: wachsen von der Grundlinie; der Aufbau wandert
 *     ueber die X-Achse. Regler "Staffelung" = wie stark nacheinander
 *     (0=alle gleichzeitig, 100=streng nacheinander links->rechts).
 *   - Balken horizontal: fahren nach rechts aus, gestaffelt von oben
 *     nach unten ("Staffelung" steuert die Ueberlappung).
 *   - Kreis: wischt im Uhrzeigersinn auf (Segment fuer Segment).
 * Beim Erstellen werden optional zwei Keyframes (0->100) angelegt;
 * Dauer im Panel (kein Verzoegerungs-Feld mehr - startet immer bei 0s).
 * Alles danach frei aenderbar.
 * Bei Animation=100 entspricht das Bild exakt dem statischen Diagramm.
 *
 * Sortierung (Balken & Kreis): Regler "Sortierung" 0=Original,
 * 1=Auf, 2=Ab, 3=A-Z. "Sortier-Reihe" (mehrere Reihen) = wonach:
 * 0=Summe, 1..n=Reihe. Der Animationsablauf folgt der sortierten
 * Reihenfolge automatisch.
 *
 * Achsen/Raster, Einfaerbung, Kontur, Innenradius wie ChartBuilder.
 *
 * Negative Werte: Balken (gruppiert) und Linie/Flaeche koennen ins
 *   Minus gehen. Die Achse deckt dann [min..max] ab, 0 liegt auf einer
 *   eigenen Nulllinie (X-Achse wandert dorthin); Flaechen fuellen bis 0.
 *   Gestapelt bleibt auf 0 als Basis.
 * Null-Objekte am Pfad (Option): je Reihe ein Anker-Null, das der
 *   Spitze folgt - zum Anhaengen eigener Icons/Callouts/Grafiken.
 * Mitlaufende Beschriftung: zeigt wahlweise den laufenden WERT oder
 *   den REIHENNAMEN (Panel-Auswahl).
 *
 * Balken laufen wie das animierte Liniendiagramm:
 *   - ALLE Balken starten gleichzeitig ("Staffelung" 0; >0 versetzt sie)
 *     und laufen mit GLEICHER Geschwindigkeit; jeder bleibt stehen,
 *     sobald er seinen Wert erreicht hat (kurze Balken sind frueher da).
 *   - "Verfolgen": das Sichtfenster laeuft mit der LAENGE mit, die
 *     fuehrende Balkenspitze bleibt bei "Verfolg-Position". Wertraster,
 *     Achsenlinie und Wertbeschriftung wandern mit.
 *   - "Sichtfenster" (analog zur Linie): bei Linie/Flaeche die Anzahl
 *     sichtbarer Datenpunkte, bei Balken die Anzahl sichtbarer
 *     RASTERSCHRITTE auf der Werteachse -> daraus ergibt sich, wie weit
 *     die Balken laufen. Kleiner Wert = staerker herangezoomt.
 *   - "Gesamtansicht" blendet am Ende so, dass alle Balken ins Bild
 *     passen; der LAENGSTE Balken endet dabei exakt auf der
 *     "Verfolg-Position" (Standard 85%), es bleibt also der gleiche
 *     Vorlauf wie waehrend der Fahrt.
 * Start-Position (Linie/Flaeche): analog zur Verfolg-Position legt sie
 *   fest, wo der ERSTE Datenpunkt auf der X-Achse sitzt (0-90%, Standard
 *   0%). Wirkt auf Linie, Punkt, X-Raster und Kategorie-Beschriftung
 *   gleichermassen (alle nutzen dieselbe MX()-Abbildung) - und zwar
 *   sowohl in der Vollansicht als auch waehrend Verfolgen aktiv das
 *   Fenster mitlaufen laesst. Die Verfolg-Position bleibt davon
 *   unberuehrt: sie landet weiterhin exakt an ihrer eigenen Prozentzahl.
 * Ebene je Balken/Linie (Option, Standard an): jeder Balken, jede Linie
 *   und jedes Kreissegment bekommt eine EIGENE Formebene, geparentet an
 *   die Ebene "Diagramm - ... (Steuerung)", die alle Regler traegt. Die
 *   Ausdruecke greifen dann via parent.effect auf die Regler zu; jede
 *   Element-Ebene bekommt bei Linie/Flaeche ihre eigene, nach links
 *   offene Sichtfenster-Maske. Punkt und Linie einer Reihe teilen sich
 *   dabei EINE Ebene (Punkt als zweite, oben liegende Gruppe darin -
 *   ueber die Contents-Liste ein-/ausblendbar). Achsen-Ebenen werden
 *   ZUERST erzeugt, Reihe/Punkt/Balken-Ebenen liegen daher im Stack
 *   darueber. So kannst du
 *   einzelne Balken/Linien getrennt bewegen, faerben oder maskieren.
 * Achsen auf eigenen Ebenen (Option): X- und Y-Achse werden als ZWEI
 *   getrennte, an das Diagramm geparentete Ebenen "X-Achse ..." /
 *   "Y-Achse ..." angelegt - jeweils mit EIGENEN Effekt-Reglern
 *   (Staerke/Farbe/Raster). Groesse & Verfolgen kommen via parent.effect
 *   vom Diagramm; die X-Achse-Ebene hat eine eigene Verfolgen-Maske.
 * Y-Achse rechts (Option): Achsenlinie und Wert-Beschriftung nach
 *   rechts gespiegelt (nur bei vertikalen Charts).
 * Verfolgen: die X-Achsen-Werte blenden an den Fensterraendern sanft
 *   ein/aus (Smoothstep). Bei der Gesamtansicht sitzt der Endpunkt an
 *   der Verfolg-Position (Platz/Lead-Space bleibt rechts).
 * Verfolgen (Linie/Flaeche): Checkbox "Verfolgen" laesst den Plot der
 *   Spitze folgen; "Sichtfenster" = ANZAHL sichtbarer Punkte/Jahre,
 *   "Verfolg-Position" (%) = wo die Spitze im Bild sitzt (Lead-Space
 *   voraus). Am Anfang steht das Fenster am Start und die Spitze laeuft
 *   bis zur Position, danach scrollt es mit. Y-Achse und ihre Werte
 *   bleiben fest; weggescrolltes schneidet eine mitgebaute Maske ab.
 *   Gesamtansicht (Regler 0..100): blendet am Ende smooth von der
 *   Verfolg-Ansicht zurueck auf das ganze Diagramm (alle Werte). Die
 *   Maske oeffnet dabei mit. Optional werden dafuer Keyframes ans
 *   Animationsende gelegt ("Am Ende zur Gesamtansicht zoomen").
 * Daten: haendisch oder CSV/TXT (Komma/Semikolon/Tab), Kopfzeile opt.
 * Skalierbar: Regler "Breite"/"Hoehe" steuern alles per Expression.
 * ZIEL & AKTUALISIEREN
 *   "Ziel > Komposition": das Panel laesst sich fest an eine Komposition
 *   binden (ueber die Item-ID, Umbenennen schadet nicht). Einstellung
 *   "Aktive Komposition" = Verhalten wie bisher.
 *   "Aktualisieren" baut das Diagramm in der Zielkomposition NEU auf und
 *   uebernimmt dabei die Handarbeit an der Ebene: Stapelposition,
 *   Transform (Werte und Keyframes), Ebenenattribute und alle Regler,
 *   die nicht direkt aus dem Panel kommen - also auch die Keyframes auf
 *   "Animation" und "Gesamtansicht" sowie Farben, Kontur, Abstand,
 *   Staffelung, Punkt Groesse, Achsen und Raster. Aus dem Panel kommen
 *   frisch: Breite, Hoehe, Sortierung, Verfolgen, Sichtfenster,
 *   Verfolg-Position, Start-Position. Eigenschaften mit Ausdruck werden
 *   nie zurueckgeschrieben - der Aufbau ist dort die Quelle der Wahrheit.
 *   Willst du das Timing frisch aus dem Panel (Dauer, Auto-Keyframes),
 *   nimm "Diagramm erstellen".
 **********************************************************************/

(function ChartAnimator(thisObj) {

    var SCRIPT_NAME = "ChartAnimator";
    var TAG = "CHARTANIM";
    var SLD = "ADBE Slider Control-0001", COL = "ADBE Color Control-0001", CHK = "ADBE Checkbox Control-0001";
    // Live-Umordnung ueber einen Regler auf der Ebene:
    //   0 = Original | 1 = Aufsteigend | 2 = Absteigend | 3 = Alphabetisch (A-Z)
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
    // Signierte Skala: deckt [vmin..vmax] ab, 0 liegt IMMER auf einer
    // Rasterlinie (Schrittweite teilt 0). Bei vmin>=0 identisch zur
    // bisherigen Logik (Untergrenze 0). Liefert zusaetzlich axisMin.
    function chooseScaleSigned(vmin, vmax, divs) {
        if (vmin >= 0) { var sp = chooseScale(vmax, divs); return { step: sp.step, lines: sp.lines, axisMin: 0, axisMax: sp.axisMax }; }
        if (vmax <= 0) { var sn = chooseScale(-vmin, divs); return { step: sn.step, lines: sn.lines, axisMin: -sn.axisMax, axisMax: 0 }; }
        var span = vmax - vmin;
        var bases = [1, 2, 2.5, 5, 10];
        var k0 = Math.floor(Math.log(span / Math.max(1, divs)) / Math.LN10) - 1;
        var best = null;
        for (var k = k0; k <= k0 + 3; k++) {
            var mag = Math.pow(10, k);
            for (var b = 0; b < bases.length; b++) {
                var step = bases[b] * mag;
                if (!(step > 0)) continue;
                var amin = Math.floor(vmin / step + 1e-9) * step;   // <= vmin, Vielfaches von step
                var amax = Math.ceil(vmax / step - 1e-9) * step;    // >= vmax, Vielfaches von step
                var lines = Math.round((amax - amin) / step);
                if (lines < 2 || lines > 14) continue;
                var over = ((amax - amin) - span) / span;
                var cand = { step: step, lines: lines, axisMin: amin, axisMax: amax, score: over + Math.abs(lines - divs) * 0.012 };
                if (best === null || cand.score < best.score - 1e-9) best = cand;
            }
        }
        if (!best) { var stp = span / Math.max(1, divs); best = { step: stp, lines: divs, axisMin: vmin, axisMax: vmax }; }
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

    // ---- Animation: Expression-Bausteine ----------------------------
    // Master-Fortschritt 0..1 aus dem Regler "Animation". 'acc' ist der
    // Zugriff: "effect" (auf der Ebene) oder "parent.effect" (Textebenen).
    function pExpr(acc) { return 'clamp(' + acc + '("Animation")("' + SLD + '")/100,0,1)'; }

    // Kamera-/Verfolg-Mapping fuer Linie/Flaeche. MX(u) bildet die
    // normierte X-Position u in [0..1] auf die Ebenen-x ab.
    //   VN = "Sichtfenster" als ANZAHL sichtbarer Punkte (geklemmt 2..N)
    //   FP = "Verfolg-Position": wo die Spitze im Bild sitzt (0.2..1)
    //   ZO = "Gesamtansicht": blendet zurueck auf die volle Zeitachse;
    //        der Endpunkt sitzt dann bei FP (Lead-Space bleibt rechts).
    // Voraussetzung: W und P sind bereits definiert.
    // Weiche Randblende fuer X-Rasterlinien. Setzt 'x' und 'W' voraus.
    // Ersetzt das frueher harte Abschneiden (Laenge -> 0 in einem Bild),
    // das als Blinken sichtbar war. Gleiche Kurve wie bei den Labels,
    // damit Linie und Beschriftung gemeinsam aus- und einblenden.
    function xEdgeFade(pre, marg) {
        return pre + 'var m=Math.max(1,W*' + marg + ');' +
               'var e=Math.min(x-(-W/2),(W/2)-x);' +
               'var o=clamp(e/m,0,1);(o*o*(3-2*o))*100;';
    }
    function followPrelude(acc, N) {
        return 'var FOL=' + acc + '("Verfolgen")("' + CHK + '");' +
               // Fenster nie breiter als die vorhandenen Punkte -> passen
               // ohnehin alle rein, verhaelt sich "Verfolgen" beim Start
               // identisch zu "aus" (kein Ruckler/Zoom beim Umschalten).
               'var VN=Math.max(2,Math.min(' + N + ',Math.round(' + acc + '("Sichtfenster")("' + SLD + '"))));' +
               'var FP=clamp(' + acc + '("Verfolg-Position")("' + SLD + '")/100,0.2,1);' +
               'var ZO=clamp(' + acc + '("Gesamtansicht")("' + SLD + '")/100,0,1);' +
               // Start-Position: wo der erste Punkt (u=0) sitzt - sowohl in
               // der Vollansicht als auch waehrend das Fenster aktiv
               // mitlaeuft (nicht nur bei Gesamtansicht=100%).
               'var SP=clamp(' + acc + '("Start-Position")("' + SLD + '")/100,0,0.9);' +
               'if(SP>FP-0.05)SP=Math.max(0,FP-0.05);' +
               'function MX(u){if(FOL>0.5&&' + N + '>1&&VN<' + N + '){' +
                 'var NS=' + (N - 1) + ';var xFull=-W/2+SP*W+u*((FP-SP)*W);' +
                 'if(ZO>=1)return xFull;' +
                 'var tipU=P*NS;var wL=tipU-(VN-1)*(FP-SP)/(1-SP);if(wL<0)wL=0;' +
                 'var xw=-W/2+SP*W+((u*NS-wL)/(VN-1))*((1-SP)*W);' +
                 'return xw+(xFull-xw)*ZO;}' +
               'return -W/2+SP*W+u*((1-SP)*W);}';
    }

    // Balken-Layout: Kategorien gleichmaessig ueber die Laufachse.
    // CTR(i) = Mitte des Kategorie-Slots i. Setzt AXIS (=W bzw. H) voraus.
    function barLayout(acc, nCat) {
        return 'var cw=AXIS/' + nCat + ';function CTR(i){return -AXIS/2+(i+0.5)*cw;}';
    }
    // Wertachsen-Kamera (Balken laufen eine ABSOLUTE Strecke):
    //   "Sichtfenster" = Anzahl sichtbarer RASTERSCHRITTE auf der
    //   Werteachse (analog zu den Datenpunkten beim Liniendiagramm).
    //   Daraus folgt der Massstab: kleiner Wert = weiter herangezoomt,
    //   die Balken laufen entsprechend weiter. Bei "Verfolgen" wandert
    //   die Ansicht mit den Spitzen mit; "Gesamtansicht" blendet auf
    //   den eingepassten Massstab -> alles im Bild.
    // Setzt P, FOL, FP und ZO voraus (camBase).
    //   PV(v) = Position des Wertes v auf der Werteachse.
    function valueCam(acc, dim, aMin, aRange, maxVal, vertical, gStep) {
        return 'var VN=Math.max(1,Math.round(' + acc + '("Sichtfenster")("' + SLD + '")));' +
               'var VC=(FOL>0.5)?1:0;' +
               'var AMIN=' + aMin + ';var AR=' + aRange + ';var MV=' + maxVal + ';' +
               'var GS=' + gStep + ';' +
               // Einpassung: der laengste Balken endet exakt auf der
               // Verfolg-Position (FP) -> davor bleibt der gleiche Vorlauf
               // wie waehrend der Fahrt.
               'var SCfit=(VC>0)?(FP*' + dim + '/Math.max(1e-6,MV-AMIN)):(' + dim + '/AR);' +
               'var SCwin=' + dim + '/Math.max(1e-6,VN*GS);' +   // VN Rasterschritte im Bild
               'var SC=(VC>0)?(SCwin+(SCfit-SCwin)*ZO):SCfit;' +
               'var dist=SC*(MV*P-AMIN);' +
               'var OFS=VC*Math.max(0,dist-FP*' + dim + ');' +
               (vertical ? 'function PV(v){return H/2+OFS-SC*(v-AMIN);}'
                         : 'function PV(v){return -W/2-OFS+SC*(v-AMIN);}');
    }
    // Minimal-Prelude fuer Raster/Beschriftung: P, FP, ZO ohne Kategorie-Kamera
    function camBase(acc) {
        return 'var P=' + pExpr(acc) + ';' +
               'var FOL=' + acc + '("Verfolgen")("' + CHK + '");' +
               'var FP=clamp(' + acc + '("Verfolg-Position")("' + SLD + '")/100,0.2,1);' +
               'var ZO=clamp(' + acc + '("Gesamtansicht")("' + SLD + '")/100,0,1);';
    }
    // Wandelt einen Ausdruck von der Steuer-Ebene auf eine Kind-Ebene um:
    // Regler und Skalierung kommen dann vom Parent.
    function childExpr(ex) {
        return String(ex)
            .replace(/parent\.effect\(/g, "\u0001")     // vorhandene parent.effect schuetzen
            .replace(/effect\(/g, "parent.effect(")
            .replace(/\u0001/g, "parent.effect(")
            .replace(/var s=transform\.scale;/g, "var s=parent.transform.scale;");
    }
    // Wachstum: alle Balken laufen mit GLEICHER Geschwindigkeit los und
    // bleiben stehen, sobald sie ihren eigenen Wert erreicht haben.
    // VD(V) = aktuell gezeichneter Wert des Balkens (Front = MVa*pb).
    // "Staffelung" 0 = alle zugleich, >0 = leicht versetzter Start.
    function barGrowth(acc, nCat, maxAbs) {
        return 'var uc=(slot+0.5)/' + nCat + ';' +
               'var S=clamp(' + acc + '("Staffelung")("' + SLD + '")/100,0,1);' +
               'var pb=clamp((P-uc*S)/Math.max(0.001,1-S),0,1);' +
               'var MVa=' + maxAbs + ';var front=MVa*pb;' +
               'function VD(V){return (V>=0)?Math.min(V,front):Math.max(V,-front);}';
    }
    // Linie/Flaeche: Pfad, der sich entlang X bis zur Front aufbaut.
    function polyRevealExpr(vals, isArea, axisMin, axisMax, Wex, Hex, acc, follow) {
        var s = 'var W=' + Wex + ',H=' + Hex + ';var d=' + arrLit(vals) + ';var n=d.length;' +
                'var amin=' + axisMin + ';var arng=(' + axisMax + ')-(' + axisMin + ');' +
                'var P=' + pExpr(acc) + ';';
        if (follow) s += followPrelude(acc, vals.length);
        var mx = follow ? 'MX(u)' : '(-W/2+u*W)';
        var mx0 = follow ? 'MX(u0)' : '(-W/2+u0*W)';
        var xff = follow ? 'MX(P)' : '(-W/2+P*W)';
        s += 'var xf=' + xff + ';var yz=H/2-((0-amin)/arng)*H;var pts=[];' +
             'for(var k=0;k<n;k++){var u=(n>1)?(k/(n-1)):0;var x=' + mx + ';var y=H/2-((d[k]-amin)/arng)*H;' +
               'if(u<=P+1e-9){pts.push([x,y]);}' +
               'else{if(k>0){var u0=(k-1)/(n-1);var x0=' + mx0 + ';var y0=H/2-((d[k-1]-amin)/arng)*H;' +
               'var tt=(P-u0)/((u-u0)||1);pts.push([xf,y0+(y-y0)*tt]);}break;}}' +
             'if(pts.length===0){pts.push([xf,H/2-((d[0]-amin)/arng)*H]);}' +
             'if(pts.length===1){pts.push([pts[0][0],pts[0][1]]);}';
        if (isArea) s += 'var lx=pts[pts.length-1][0];pts.push([lx,yz]);pts.push([pts[0][0],yz]);createPath(pts,[],[],true);';
        else s += 'createPath(pts,[],[],false);';
        return s;
    }
    // Spitze der Linie (Position der Front) -> fuer Punkt & Wertanzeige.
    function tipExpr(vals, axisMin, axisMax, Wex, Hex, acc, out, follow) {
        var s = 'var W=' + Wex + ',H=' + Hex + ';var d=' + arrLit(vals) + ';var n=d.length;' +
                'var amin=' + axisMin + ';var arng=(' + axisMax + ')-(' + axisMin + ');' +
                'var P=' + pExpr(acc) + ';';
        if (follow) s += followPrelude(acc, vals.length);
        s += 'var xf=' + (follow ? 'MX(P)' : '(-W/2+P*W)') + ';' +
             'var fp=P*(n-1);var i0=Math.floor(fp);if(i0<0)i0=0;if(i0>n-1)i0=n-1;' +
             'var i1=Math.min(n-1,i0+1);var fr=fp-i0;' +
             'var y=H/2-(((d[i0]+(d[i1]-d[i0])*fr)-amin)/arng)*H;' + out;
        return s;
    }
    // Mitlaufende Wertanzeige (sourceText-Expression): interpolierter Wert.
    function runningTextExpr(vals, axisMax, acc, suffix) {
        var sfx = String(suffix).replace(/["\\]/g, "");
        return 'var d=' + arrLit(vals) + ';var n=d.length;var am=' + axisMax + ';' +
               'var P=' + pExpr(acc) + ';var fp=P*(n-1);' +
               'var i0=Math.floor(fp);if(i0<0)i0=0;if(i0>n-1)i0=n-1;' +
               'var i1=Math.min(n-1,i0+1);var fr=fp-i0;' +
               'var v=d[i0]+(d[i1]-d[i0])*fr;Math.round(v)+"' + sfx + '";';
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
    function addLabel(comp, chart, txt, posExpr, size, justify, log, lname, opacityExpr) {
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
        if (opacityExpr) setExpr(tg.property("ADBE Opacity"), opacityExpr, log, "Label-Opacity");
        return t;
    }

    // ---- Mitlaufende Wertanzeige (Text via Expression) --------------
    // Wie addLabel, aber der Textinhalt (sourceText) ist ebenfalls eine
    // Expression und aktualisiert sich mit dem Animations-Fortschritt.
    // Wird bei P<=0 ausgeblendet, damit vor dem Start nichts steht.
    function addRunningValue(comp, chart, initTxt, textExpr, posExpr, size, log, lname) {
        var t = null;
        try { t = comp.layers.addText(String(initTxt)); } catch (e) { log.push("Laufwert-Ebene: " + errStr(e)); return; }
        try { t.name = lname; } catch (e) {}
        t.comment = TAG;
        try { t.label = 12; } catch (e) {}
        try {
            var sp = t.property("ADBE Text Properties").property("ADBE Text Document");
            var td = sp.value;
            td.fontSize = size; td.fillColor = [0.96, 0.96, 0.99];
            td.justification = ParagraphJustification.CENTER_JUSTIFY;
            sp.setValue(td);
        } catch (e) { log.push("Laufwert-Format: " + errStr(e)); }
        try { t.parent = chart; } catch (e) { log.push("Laufwert parenten: " + errStr(e)); }
        var tg = t.property("ADBE Transform Group");
        try { tg.property("ADBE Anchor Point").setValue([0, 0]); } catch (e) {}
        setExpr(t.property("ADBE Text Properties").property("ADBE Text Document"), textExpr, log, "Laufwert-Text");
        setExpr(tg.property("ADBE Position"), posExpr, log, "Laufwert-Position");
        setExpr(tg.property("ADBE Opacity"),
            'var P=' + pExpr("parent.effect") + ';(P>0)?100:0;', log, "Laufwert-Opacity");
    }

    // ---- Null-Objekt, das der Linien-Spitze folgt --------------------
    // An das Diagramm geparentet; Position = Spitze (im Ebenen-Raum).
    // Zum Anhaengen eigener Grafiken/Icons/Callouts (z.B. Daumen-Symbol).
    function addPathNull(comp, chart, posExpr, name, log) {
        var nl = null;
        try { nl = comp.layers.addNull(); } catch (e) { log.push("Null-Objekt: " + errStr(e)); return; }
        try { nl.name = name; } catch (e) {}
        nl.comment = TAG;
        try { nl.label = 9; } catch (e) {}
        try { nl.parent = chart; } catch (e) { log.push("Null parenten: " + errStr(e)); }
        var tg = nl.property("ADBE Transform Group");
        setExpr(tg.property("ADBE Position"), posExpr, log, "Null-Position");
    }

    // ---- Diagramm bauen --------------------------------------------
    function buildChart(comp, type, data, opt, log) {
        var nCat = data.labels.length, nSer = data.series.length;

        var layer = comp.layers.addShape();
        layer.name = "Diagramm - " + TYPES[type] + ((opt.perElement !== false) ? " (Steuerung)" : "");
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

        // ---- Regler: Animation (Master + typgerechte Zusatzregler) ----
        // "Animation" 0..100 ist der keyframebare Master-Fortschritt.
        addCtrl(layer, "ADBE Slider Control", "Animation", SLD, opt.animKeys ? 0 : 100);
        if (isBarLike(type))
            addCtrl(layer, "ADBE Slider Control", "Staffelung", SLD, opt.stagger);
        if (type === T_LINE || type === T_AREA)
            addCtrl(layer, "ADBE Slider Control", "Punkt Groesse", SLD, (type === T_LINE) ? opt.dotSize : 0);

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

        // ---- Regler: Achsen (X und Y) ----
        // Als wiederverwendbare Sets -> koennen auf die Datenebene ODER
        // (bei getrennten Achsen) auf die jeweilige Achsen-Ebene.
        var hasAxes = (type !== T_PIE);
        var catX = (type === T_LINE || type === T_AREA || type === T_VBAR || type === T_VSTACK);
        var sepAxes = (opt.sepAxes && type !== T_PIE);
        function addXAxisCtrls(lyr) {
            addCtrl(lyr, "ADBE Slider Control", "X-Achse Staerke", SLD, 2);
            addCtrl(lyr, "ADBE Color Control", "X-Achse Farbe", COL, [1, 1, 1, 1]);
            if (catX) {
                addCtrl(lyr, "ADBE Slider Control", "X-Raster Staerke", SLD, 1);   // 1px
                addCtrl(lyr, "ADBE Color Control", "X-Raster Farbe", COL, [1, 1, 1, 1]);  // weiss
                addCtrl(lyr, "ADBE Slider Control", "X-Raster Laenge", SLD, 100);
                addCtrl(lyr, "ADBE Slider Control", "X-Raster Strich", SLD, 0);
                addCtrl(lyr, "ADBE Slider Control", "X-Raster Luecke", SLD, 0);
            }
        }
        function addYAxisCtrls(lyr) {
            addCtrl(lyr, "ADBE Slider Control", "Y-Achse Staerke", SLD, 2);
            addCtrl(lyr, "ADBE Color Control", "Y-Achse Farbe", COL, [1, 1, 1, 1]);
            addCtrl(lyr, "ADBE Slider Control", "Raster Staerke", SLD, 1);          // 1px
            addCtrl(lyr, "ADBE Color Control", "Raster Farbe", COL, [1, 1, 1, 1]);  // weiss
            addCtrl(lyr, "ADBE Slider Control", "Raster Laenge", SLD, 100);
            addCtrl(lyr, "ADBE Slider Control", "Raster Strich", SLD, 0);
            addCtrl(lyr, "ADBE Slider Control", "Raster Luecke", SLD, 0);
        }
        if (hasAxes && !sepAxes) { addXAxisCtrls(layer); addYAxisCtrls(layer); }

        // Verfolgen (Kamera folgt der Linie, Y-Achse bleibt fest) - Linie/Flaeche.
        var canFollow = (type === T_LINE || type === T_AREA || isBarLike(type));
        // Balken: wie lange die Kamera an jedem Datenpunkt stoppt (Race)
        if (canFollow) {
            addCtrl(layer, "ADBE Checkbox Control", "Verfolgen", CHK, opt.follow ? 1 : 0);
            // Linie/Flaeche: Anzahl sichtbarer Datenpunkte
            // Balken: Anzahl sichtbarer Rasterschritte auf der Werteachse
            addCtrl(layer, "ADBE Slider Control", "Sichtfenster", SLD,
                    isBarLike(type) ? (opt.windowBars || 4) : opt.window);
            addCtrl(layer, "ADBE Slider Control", "Verfolg-Position", SLD, opt.followPos);
            // 0 = Verfolg-Ansicht, 100 = Gesamtansicht (smooth Blend am Ende)
            addCtrl(layer, "ADBE Slider Control", "Gesamtansicht", SLD, 0);
        }
        // Wo der erste Punkt auf der X-Achse sitzt (analog zur Verfolg-
        // Position fuer den letzten Punkt) - nur Linie/Flaeche.
        if (type === T_LINE || type === T_AREA)
            addCtrl(layer, "ADBE Slider Control", "Start-Position", SLD, opt.startPos || 0);

        var W = 'effect("Breite")("' + SLD + '")';
        var Wp = 'parent.effect("Breite")("' + SLD + '")', Hp = 'parent.effect("Hoehe")("' + SLD + '")';
        var H = 'effect("Hoehe")("' + SLD + '")';
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
                var comp = 'var s=transform.scale;var f=(Math.abs(s[0])+Math.abs(s[1]))/200;f=Math.max(0.0001,f);' +
                           'var DW=effect("Breite")("' + SLD + '"),DH=effect("Hoehe")("' + SLD + '");' +
                           // "durchgezogen" = ein Strich, der sicher laenger ist
                           // als jeder Pfad. Frueher 100000 - so grosse Werte
                           // erzeugen in AE Rendergrieseln an duennen Linien.
                           'var SOLID=(Math.abs(DW)+Math.abs(DH))*4+1000;';
                // Strich: bei 0 durchgezogen, sonst Wert/scale
                setExpr(dash, comp + 'var d=effect("' + prefix + ' Strich")("' + SLD + '");(d>0)?(d/f):SOLID;',
                    log, prefix + " Strich");
                // Luecke: bei durchgezogen 0; sonst Luecke (0 -> wie Strich)
                setExpr(gap, comp + 'var d=effect("' + prefix + ' Strich")("' + SLD + '");' +
                    'var gp=effect("' + prefix + ' Luecke")("' + SLD + '");(d>0)?((gp>0?gp:d)/f):0;',
                    log, prefix + " Luecke");
            } catch (e) { log.push(prefix + " Strichelung: " + errStr(e)); }
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

        // ---- Wertebereich (mit Vorzeichen) + glatte Rasterschritte ----
        // Balken/Linie koennen ins Minus gehen: die Achse deckt dann
        // [vmin..vmax] ab und 0 bekommt eine eigene Nulllinie.
        // Gestapelt bleibt auf 0 als Basis (negative Stapel sind mehrdeutig).
        var vmax = 0, vmin = 0, i, s2;
        if (isStacked(type)) {
            for (i = 0; i < nCat; i++) {
                var sum = 0;
                for (s2 = 0; s2 < nSer; s2++) sum += Math.max(0, data.series[s2].values[i]);
                vmax = Math.max(vmax, sum);
            }
            vmin = 0;
        } else {
            for (s2 = 0; s2 < nSer; s2++)
                for (i = 0; i < nCat; i++) {
                    var vv = data.series[s2].values[i];
                    if (vv > vmax) vmax = vv;
                    if (vv < vmin) vmin = vv;
                }
        }
        if (vmax === 0 && vmin === 0) vmax = 1;   // alles 0 -> Notfall-Skala

        // Achsengrenzen glaetten; axisMin<=0<=axisMax, 0 auf einer Rasterlinie
        var axisMin = 0, axisMax = (vmax > 0 ? vmax : 1), gridStep = 0, nGrid = 0;
        if (hasAxes) {
            var sc = chooseScaleSigned(vmin, vmax, Math.max(1, Math.round(opt.divs)));
            gridStep = sc.step; nGrid = sc.lines; axisMin = sc.axisMin; axisMax = sc.axisMax;
        } else if (isStacked(type)) {
            var sc0 = chooseScale(vmax, Math.max(1, Math.round(opt.divs)));
            gridStep = sc0.step; nGrid = sc0.lines; axisMin = 0; axisMax = sc0.axisMax;
        }
        var axisRange = (axisMax - axisMin) || 1;
        var zeroFrac = r6((0 - axisMin) / axisRange);   // 0..1 Position der Nulllinie

        // Wert -> y (vertikal) bzw. x (horizontal); Nulllinien-Ausdruecke.
        var yZeroEx = 'H/2-(' + zeroFrac + ')*H';
        var xZeroEx = '-W/2+(' + zeroFrac + ')*W';

        // Y-Achse rechts (nur bei vertikalen Charts sinnvoll) + Achsen-Ebene
        var yRight = (opt.yRight && isVertical(type));
        var yAxX = isVertical(type) ? (yRight ? '(W/2)' : '(-W/2)') : xZeroEx;   // Y-Achsenlinie x
        var maxAbs = Math.max(Math.abs(vmax), Math.abs(vmin)) || 1;
        function vcam(acc) { return valueCam(acc, isVertical(type) ? 'H' : 'W', axisMin, axisRange, maxAbs, isVertical(type), r6(gridStep)); }

        // ---- Phase 1: Struktur (Daten zuerst, Raster/Achsen dahinter) ----
        var root = layer.property("ADBE Root Vectors Group");
        // Achsen-Ebenen ZUERST erzeugen, damit Reihe/Punkt/Balken (danach
        // erzeugt) im Ebenen-Stack darueber liegen (spaeter erzeugt = oben).
        if (sepAxes) { buildYLayer(); buildXLayer(); }

        var plan = [];
        var perEl = (opt.perElement !== false);   // eine Ebene je Balken/Linie
        // Achsenlinien + Wertraster: auf Datenebene ODER (sepAxes) auf eigene Ebene.
        // X-Raster bleibt IMMER auf der Datenebene (wegen der Verfolgen-Maske).
        if (type !== T_PIE && !sepAxes) { plan.push({ kind: "axisX" }); plan.push({ kind: "axisY" }); }
        if (isBarLike(type)) {
            for (s2 = 0; s2 < nSer; s2++) for (i = 0; i < nCat; i++) plan.push({ kind: "rect", s: s2, i: i });
        } else if (type === T_PIE) {
            for (i = 0; i < nCat; i++) plan.push({ kind: "pie", s: 0, i: i });
        } else {
            // Punkt und Linie teilen sich EINE Ebene je Reihe; innerhalb der
            // Ebene rendert die zuerst hinzugefuegte Gruppe oben -> Punkt zuerst.
            for (s2 = 0; s2 < nSer; s2++) plan.push({ kind: "dot", s: s2, i: -1 });
            for (s2 = 0; s2 < nSer; s2++) plan.push({ kind: "poly", s: s2, i: -1 });
        }
        if (hasAxes && !sepAxes) {
            var gSlots = nGrid;
            for (var gI = 1; gI <= gSlots; gI++) plan.push({ kind: "grid", g: gI }); // ganz hinten
        }
        // X-Raster: senkrechte Linie je Kategorie (nur wo Kategorien auf X).
        // Bei getrennten Achsen wandert es auf die X-Achse-Ebene.
        if (catX && !sepAxes) {
            for (i = 0; i < nCat; i++) plan.push({ kind: "xgrid", i: i });
        }

        // Bei "Ebene je Element": Datenformen bekommen eine eigene, an die
        // Steuer-Ebene geparentete Formebene. Achsen/Raster bleiben zusammen.
        var itemRoot = [], itemChild = [], itemIdx = [], childLayers = [], masterCount = 0;
        // Punkt und Linie derselben Reihe teilen sich EINE Ebene (Punkt als
        // zweite Gruppe darin -> ueber die Contents-Liste ein-/ausblendbar).
        var seriesLayer = {}, seriesGCount = {};
        for (var p = 0; p < plan.length; p++) {
            var k0 = plan[p].kind;
            var gname;
            if (k0 === "rect")       gname = isStacked(type)
                                        ? ("Wert " + (plan[p].i + 1) + " - Reihe " + (plan[p].s + 1))
                                        : ("Wert " + (plan[p].i * nSer + plan[p].s + 1));
            else if (k0 === "pie")   gname = "Wert " + (plan[p].i + 1);
            else if (k0 === "poly")  gname = "Linie";
            else if (k0 === "dot")   gname = "Punkt";
            else if (k0 === "grid")  gname = "Raster " + plan[p].g;
            else if (k0 === "xgrid") gname = "X-Raster " + (plan[p].i + 1);
            else if (k0 === "axisX") gname = "X-Achse";
            else                     gname = "Y-Achse";
            var isData = (k0 === "rect" || k0 === "poly" || k0 === "dot" || k0 === "pie");
            var isSeries = (k0 === "poly" || k0 === "dot");
            var rootP = root, isChild = false, gIdx;
            if (perEl && isSeries) {
                var eL = seriesLayer[plan[p].s];
                if (!eL) {
                    eL = comp.layers.addShape();
                    try { eL.name = "Reihe " + (plan[p].s + 1); } catch (e) {}
                    eL.comment = TAG;
                    try { eL.label = 8; } catch (e) {}
                    try { eL.property("ADBE Transform Group").property("ADBE Position").setValue([comp.width / 2, comp.height / 2]); } catch (e) {}
                    try { eL.parent = layer; } catch (e) { log.push("Element parenten: " + errStr(e)); }
                    seriesLayer[plan[p].s] = eL;
                    seriesGCount[plan[p].s] = 0;
                    childLayers.push(eL);
                }
                rootP = eL.property("ADBE Root Vectors Group");
                isChild = true;
                seriesGCount[plan[p].s]++; gIdx = seriesGCount[plan[p].s];
            } else if (perEl && isData) {
                var eL2 = comp.layers.addShape();
                try { eL2.name = gname; } catch (e) {}
                eL2.comment = TAG;
                try { eL2.label = 8; } catch (e) {}
                try { eL2.property("ADBE Transform Group").property("ADBE Position").setValue([comp.width / 2, comp.height / 2]); } catch (e) {}
                try { eL2.parent = layer; } catch (e) { log.push("Element parenten: " + errStr(e)); }
                rootP = eL2.property("ADBE Root Vectors Group");
                isChild = true; gIdx = 1;
                childLayers.push(eL2);
            } else { masterCount++; gIdx = masterCount; }
            itemRoot[p] = rootP; itemChild[p] = isChild; itemIdx[p] = gIdx;

            var grp = rootP.addProperty("ADBE Vector Group");
            try { grp.name = gname; } catch (e) { log.push("Name " + gname + ": " + errStr(e)); }

            var gc = grp.property("ADBE Vectors Group");
            if (k0 === "rect") gc.addProperty("ADBE Vector Shape - Rect");
            else if (k0 === "dot") gc.addProperty("ADBE Vector Shape - Ellipse");
            else gc.addProperty("ADBE Vector Shape - Group");

            // FIX: Fuellung NUR fuer Datenformen, nie fuer Raster/Achsen
            if (k0 === "rect" || k0 === "pie" || k0 === "dot" || (k0 === "poly" && type === T_AREA))
                gc.addProperty("ADBE Vector Graphic - Fill");
            // Konturen
            if (k0 === "rect" || k0 === "pie" ||
                (k0 === "poly" && (type === T_LINE || type === T_AREA)) ||
                k0 === "grid" || k0 === "xgrid" || k0 === "axisX" || k0 === "axisY")
                gc.addProperty("ADBE Vector Graphic - Stroke");
        }

        // ---- Phase 2: frische Referenzen + Expressions ----
        var rootF = layer.property("ADBE Root Vectors Group");
        var curChild = false;
        // Auf Kind-Ebenen werden die Ausdruecke auf parent.effect umgeschrieben
        function setE(prop, ex, lg, label) { setExpr(prop, curChild ? childExpr(ex) : ex, lg, label); }

        for (var q = 0; q < plan.length; q++) {
            var it = plan[q];
            curChild = itemChild[q];
            var g = itemRoot[q].property(itemIdx[q]).property("ADBE Vectors Group");

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
                    camBase("effect") + barLayout("effect", nCat) + barGrowth("effect", nCat, maxAbs) +
                    'var gw=cw*(1-gC);' +
                    (STACK
                        ? 'var bw=gw;var ctr=CTR(slot);'
                        : 'var bs=gw/' + nSer + ';var bw=bs*(1-gS);' +
                          'var ctr=CTR(slot)-gw/2+bs*' + (it.s + 0.5) + ';');

                if (type === T_VBAR || type === T_VSTACK) {
                    if (STACK) {
                        setE(rect.property("ADBE Vector Rect Size"),
                            'var W=' + W + ',H=' + H + ';var AXIS=W;' + geo +
                            vcam("effect") + 'var hh=Math.abs(PV(VD(' + (v + below) + '))-PV(VD(' + below + ')));[bw,hh];', log, "Balkengroesse");
                        setE(rect.property("ADBE Vector Rect Position"),
                            'var W=' + W + ',H=' + H + ';var AXIS=W;' + geo +
                            vcam("effect") + 'var a=PV(VD(' + below + ')),b=PV(VD(' + (v + below) + '));' +
                            '[ctr,(a+b)/2];', log, "Balkenposition");
                    } else {
                        // Von der Nulllinie zur Balkenspitze (Vorzeichen -> hoch/runter)
                        setE(rect.property("ADBE Vector Rect Size"),
                            'var W=' + W + ',H=' + H + ';var AXIS=W;' + geo +
                            vcam("effect") + 'var yv=PV(VD(' + v + ')),y0=PV(0);[bw,Math.abs(yv-y0)];', log, "Balkengroesse");
                        setE(rect.property("ADBE Vector Rect Position"),
                            'var W=' + W + ',H=' + H + ';var AXIS=W;' + geo +
                            vcam("effect") + 'var yv=PV(VD(' + v + ')),y0=PV(0);[ctr,(y0+yv)/2];', log, "Balkenposition");
                    }
                } else {
                    if (STACK) {
                        setE(rect.property("ADBE Vector Rect Size"),
                            'var W=' + W + ',H=' + H + ';var AXIS=H;' + geo +
                            vcam("effect") + 'var ln=Math.abs(PV(VD(' + (v + below) + '))-PV(VD(' + below + ')));[ln,bw];', log, "Balkengroesse");
                        setE(rect.property("ADBE Vector Rect Position"),
                            'var W=' + W + ',H=' + H + ';var AXIS=H;' + geo +
                            vcam("effect") + 'var a=PV(VD(' + below + ')),b=PV(VD(' + (v + below) + '));' +
                            '[(a+b)/2, ctr];', log, "Balkenposition");
                    } else {
                        setE(rect.property("ADBE Vector Rect Size"),
                            'var W=' + W + ',H=' + H + ';var AXIS=H;' + geo +
                            vcam("effect") + 'var xv=PV(VD(' + v + ')),x0=PV(0);[Math.abs(xv-x0),bw];', log, "Balkengroesse");
                        setE(rect.property("ADBE Vector Rect Position"),
                            'var W=' + W + ',H=' + H + ';var AXIS=H;' + geo +
                            vcam("effect") + 'var xv=PV(VD(' + v + ')),x0=PV(0);[(x0+xv)/2, ctr];', log, "Balkenposition");
                    }
                }
                var fl = g.property("ADBE Vector Graphic - Fill");
                setE(fl.property("ADBE Vector Fill Color"), colorExpr(it.i, it.s), log, "Balkenfarbe");
                var bst = g.property("ADBE Vector Graphic - Stroke");
                setE(bst.property("ADBE Vector Stroke Color"), 'effect("Kontur Farbe")("' + COL + '");', log, "Konturfarbe");
                setE(bst.property("ADBE Vector Stroke Width"), strokeExpr("Kontur Staerke"), log, "Konturstaerke");

            } else if (it.kind === "pie") {
                // Eigener Anteil ist konstant; nur der Startwinkel haengt an
                // der Reihenfolge -> je Modus vorberechnet, Regler waehlt aus.
                var pf0 = pieFractions(ordersAll[0], data, nCat, it.i);
                setE(g.property("ADBE Vector Shape - Group").property("ADBE Vector Shape"),
                    'var W=' + W + ',H=' + H + ';var R=Math.min(W,H)/2;' +
                    'var ir=effect("Innenradius")("' + SLD + '")/100;var Ri=R*Math.max(0,Math.min(0.95,ir));' +
                    'var SM=Math.round(effect("' + SORT_NAME + '")("' + SLD + '"));SM=(SM<0)?0:(SM>' + (SORT_MODES - 1) + ')?' + (SORT_MODES - 1) + ':SM;' +
                    'var s0=([' + pf0.starts.join(",") + '][SM]);var own=(' + pf0.own + ');' +
                    // Uhrzeigersinn-Wisch: Segment oeffnet sich, sobald die Front s0 erreicht
                    'var Pg=' + pExpr("effect") + ';var rev=clamp((Pg-s0)/Math.max(1e-6,own),0,1);' +
                    'var a0=-Math.PI/2+s0*2*Math.PI;var a1=a0+own*rev*2*Math.PI;' +
                    'var N=Math.max(2,Math.ceil(Math.abs(a1-a0)/0.06));var pts=[];' +
                    'for(var k=0;k<=N;k++){var a=a0+(a1-a0)*k/N;pts.push([Math.cos(a)*R,Math.sin(a)*R]);}' +
                    'if(Ri>0){for(var k2=N;k2>=0;k2--){var a2=a0+(a1-a0)*k2/N;pts.push([Math.cos(a2)*Ri,Math.sin(a2)*Ri]);}}' +
                    'else{pts.push([0,0]);}createPath(pts,[],[],true);', log, "Segment-Pfad");
                var pf = g.property("ADBE Vector Graphic - Fill");
                setE(pf.property("ADBE Vector Fill Color"), colorExpr(it.i, 0), log, "Segmentfarbe");
                var pst = g.property("ADBE Vector Graphic - Stroke");
                setE(pst.property("ADBE Vector Stroke Color"), 'effect("Kontur Farbe")("' + COL + '");', log, "Konturfarbe");
                setE(pst.property("ADBE Vector Stroke Width"), strokeExpr("Kontur Staerke"), log, "Konturstaerke");

            } else if (it.kind === "poly") {
                var vals = data.series[it.s].values;
                setE(g.property("ADBE Vector Shape - Group").property("ADBE Vector Shape"),
                    polyRevealExpr(vals, (type === T_AREA), axisMin, axisMax, W, H, "effect", true), log, "Pfad");
                if (type === T_AREA) {
                    var af = g.property("ADBE Vector Graphic - Fill");
                    setE(af.property("ADBE Vector Fill Color"), colorExpr(0, it.s), log, "Flaechenfarbe");
                }
                var lst = g.property("ADBE Vector Graphic - Stroke");
                setE(lst.property("ADBE Vector Stroke Color"), colorExpr(0, it.s), log, "Linienfarbe");
                setE(lst.property("ADBE Vector Stroke Width"), strokeExpr("Linienstaerke"), log, "Linienstaerke");

            } else if (it.kind === "dot") {
                // Mitlaufender Punkt an der Spitze der Linie (Reihe it.s).
                var dvals = data.series[it.s].values;
                var el = g.property("ADBE Vector Shape - Ellipse");
                setE(el.property("ADBE Vector Ellipse Size"),
                    'var r=effect("Punkt Groesse")("' + SLD + '");' +
                    'var P=' + pExpr("effect") + ';r=(P>0)?r:0;[2*r,2*r];', log, "Punktgroesse");
                setE(el.property("ADBE Vector Ellipse Position"),
                    tipExpr(dvals, axisMin, axisMax, W, H, "effect", '[xf,y];', true), log, "Punktposition");
                var dfl = g.property("ADBE Vector Graphic - Fill");
                setE(dfl.property("ADBE Vector Fill Color"), colorExpr(0, it.s), log, "Punktfarbe");

            } else if (it.kind === "grid") {
                var frac = it.g / nGrid;
                // Laenge % - Wertlinien von der Achse aus: waagerecht ab
                // Y-Achse (links) nach rechts, senkrecht ab Grundlinie (unten) hoch.
                var gPre = 'var W=' + W + ',H=' + H + ';var L=effect("Raster Laenge")("' + SLD + '")/100;';
                var gp = isBarLike(type)
                    ? (gPre + camBase("effect") + vcam("effect") +
                       (isVertical(type)
                          ? 'var y=PV(' + r6(axisMin + gridStep * it.g) + ');createPath([[-W/2,y],[-W/2+L*W,y]],[],[],false);'
                          : 'var x=PV(' + r6(axisMin + gridStep * it.g) + ');createPath([[x,H/2],[x,H/2-L*H]],[],[],false);'))
                    : (isVertical(type)
                    ? gPre + 'var y=H/2-' + frac + '*H;createPath([[-W/2,y],[-W/2+L*W,y]],[],[],false);'
                    : gPre + 'var x=-W/2+' + frac + '*W;createPath([[x,H/2],[x,H/2-L*H]],[],[],false);');
                setE(g.property("ADBE Vector Shape - Group").property("ADBE Vector Shape"), gp, log, "Rasterlinie");
                var gst = g.property("ADBE Vector Graphic - Stroke");
                setE(gst.property("ADBE Vector Stroke Color"), 'effect("Raster Farbe")("' + COL + '");', log, "Rasterfarbe");
                setE(gst.property("ADBE Vector Stroke Width"), strokeExpr("Raster Staerke"), log, "Rasterstaerke");
                addDashes(gst, "Raster");

            } else if (it.kind === "xgrid") {
                // Senkrechter Strich an der Kategorie-Position (wo das Label steht).
                // Laenge % ab der Grundlinie (unten) nach oben.
                var xLen = 'var L=effect("X-Raster Laenge")("' + SLD + '")/100;';
                var xgp, xPre, xMarg;
                if (type === T_LINE || type === T_AREA) {
                    var uX = (nCat > 1) ? (it.i / (nCat - 1)) : 0;
                    xPre = 'var W=' + W + ',H=' + H + ';' + xLen + 'var P=' + pExpr("effect") + ';' +
                           followPrelude("effect", nCat) + 'var x=MX(' + uX + ');';
                    xMarg = 0.09;   // gleiche Blende wie die Kategorie-Labels
                } else { // Saeulen: an der (ggf. sortierten) Slot-Mitte
                    xPre = 'var W=' + W + ',H=' + H + ';var AXIS=W;' + xLen +
                           sortSlotExpr(ordersAll, it.i, "effect", hasBasis) +
                           camBase("effect") + barLayout("effect", nCat) + 'var x=CTR(slot);';
                    xMarg = 0.08;
                }
                xgp = xPre + 'createPath([[x,H/2],[x,H/2-L*H]],[],[],false);';
                setE(g.property("ADBE Vector Shape - Group").property("ADBE Vector Shape"), xgp, log, "X-Rasterlinie");
                var xgst = g.property("ADBE Vector Graphic - Stroke");
                setE(xgst.property("ADBE Vector Stroke Color"), 'effect("X-Raster Farbe")("' + COL + '");', log, "X-Rasterfarbe");
                setE(xgst.property("ADBE Vector Stroke Width"), strokeExpr("X-Raster Staerke"), log, "X-Rasterstaerke");
                // Weiches Aus-/Einblenden am Rand statt hartem Abschneiden:
                // der harte Schnitt liess Linien in EINEM Bild verschwinden
                // (sichtbares Blinken), waehrend ihr Label sanft ausblendete.
                setE(xgst.property("ADBE Vector Stroke Opacity"), xEdgeFade(xPre, xMarg), log, "X-Rasterdeckkraft");
                addDashes(xgst, "X-Raster");


            } else if (it.kind === "axisX") {
                // Vertikale Charts: X-Achse liegt auf der Nulllinie (bei Minus in der Mitte).
                var axPre = 'var W=' + W + ',H=' + H + ';';
                var axXY;
                if (isBarLike(type) && isVertical(type)) { axPre += camBase("effect") + vcam("effect"); axXY = 'PV(0)'; }
                else axXY = isVertical(type) ? yZeroEx : 'H/2';
                setE(g.property("ADBE Vector Shape - Group").property("ADBE Vector Shape"),
                    axPre + 'var yz=' + axXY + ';createPath([[-W/2,yz],[W/2,yz]],[],[],false);', log, "X-Achse");
                var xs = g.property("ADBE Vector Graphic - Stroke");
                setE(xs.property("ADBE Vector Stroke Color"), 'effect("X-Achse Farbe")("' + COL + '");', log, "X-Farbe");
                setE(xs.property("ADBE Vector Stroke Width"), strokeExpr("X-Achse Staerke"), log, "X-Staerke");

            } else if (it.kind === "axisY") {
                // Vertikal: links/rechts (Option); horizontal: Nulllinie.
                var ayPre = 'var W=' + W + ',H=' + H + ';', axYX;
                if (isBarLike(type) && !isVertical(type)) { ayPre += camBase("effect") + vcam("effect"); axYX = 'PV(0)'; }
                else axYX = yAxX;
                setE(g.property("ADBE Vector Shape - Group").property("ADBE Vector Shape"),
                    ayPre + 'var xz=' + axYX + ';createPath([[xz,-H/2],[xz,H/2]],[],[],false);', log, "Y-Achse");
                var ys = g.property("ADBE Vector Graphic - Stroke");
                setE(ys.property("ADBE Vector Stroke Color"), 'effect("Y-Achse Farbe")("' + COL + '");', log, "Y-Farbe");
                setE(ys.property("ADBE Vector Stroke Width"), strokeExpr("Y-Achse Staerke"), log, "Y-Staerke");
            }
        }

        try {
            layer.property("ADBE Transform Group").property("ADBE Position")
                 .setValue([comp.width / 2, comp.height / 2]);
        } catch (e) {}

        // ---- Achsen auf eigenen Ebenen (X und Y getrennt) ----
        // Zwei separate, an das Diagramm geparentete Ebenen mit EIGENEN
        // Effekt-Reglern (Staerke/Farbe/Raster). Groesse & Verfolgen kommen
        // ueber parent.effect vom Diagramm. Die X-Achse-Ebene bekommt eine
        // eigene Verfolgen-Maske, damit ihr X-Raster mitscrollt/beschnitten wird.
        function strokeExprL(c) {   // Breite lokal, Skalen-Kompensation ueber Parent
            return 'var s=parent.transform.scale;var f=(Math.abs(s[0])+Math.abs(s[1]))/200;f=Math.max(0.0001,f);' +
                   'var w=effect("' + c + '")("' + SLD + '");Math.max(0,w)/f;';
        }
        function dashesL(st, pre) {
            try {
                var dg = st.property("ADBE Vector Stroke Dashes");
                var dash = dg.addProperty("ADBE Vector Stroke Dash 1"), gap = dg.addProperty("ADBE Vector Stroke Gap 1");
                var cmp = 'var s=parent.transform.scale;var f=(Math.abs(s[0])+Math.abs(s[1]))/200;f=Math.max(0.0001,f);' +
                          'var DW=' + Wp + ',DH=' + Hp + ';var SOLID=(Math.abs(DW)+Math.abs(DH))*4+1000;';
                setExpr(dash, cmp + 'var d=effect("' + pre + ' Strich")("' + SLD + '");(d>0)?(d/f):SOLID;', log, pre + " Strich");
                setExpr(gap, cmp + 'var d=effect("' + pre + ' Strich")("' + SLD + '");var gp=effect("' + pre + ' Luecke")("' + SLD + '");(d>0)?((gp>0?gp:d)/f):0;', log, pre + " Luecke");
            } catch (e) { log.push(pre + " Strichelung(Achse): " + errStr(e)); }
        }
        function newAxisLayer(nm, lab, addCtrls) {
            var ax = comp.layers.addShape();
            try { ax.name = nm; } catch (e) {}
            ax.comment = TAG;
            try { ax.label = lab; } catch (e) {}
            try { ax.property("ADBE Transform Group").property("ADBE Position").setValue([comp.width / 2, comp.height / 2]); } catch (e) {}
            try { ax.parent = layer; } catch (e) { log.push(nm + " parenten: " + errStr(e)); }
            if (addCtrls) addCtrls(ax);
            return ax;
        }
        function newGroup(rootG, nm) {
            var grp = rootG.addProperty("ADBE Vector Group");
            try { grp.name = nm; } catch (e) {}
            var gc = grp.property("ADBE Vectors Group");
            gc.addProperty("ADBE Vector Shape - Group");
            gc.addProperty("ADBE Vector Graphic - Stroke");
            return grp.property("ADBE Vectors Group");
        }
        function buildYLayer() {
            var ax = newAxisLayer("Y-Achse - " + TYPES[type], 10, addYAxisCtrls);
            var rg = ax.property("ADBE Root Vectors Group");
            var gYaxis = newGroup(rg, "Y-Achse");
            setExpr(gYaxis.property("ADBE Vector Shape - Group").property("ADBE Vector Shape"),
                'var W=' + Wp + ',H=' + Hp + ';var xz=' + yAxX + ';createPath([[xz,-H/2],[xz,H/2]],[],[],false);', log, "Y-Achse");
            var yst = gYaxis.property("ADBE Vector Graphic - Stroke");
            setExpr(yst.property("ADBE Vector Stroke Color"), 'effect("Y-Achse Farbe")("' + COL + '");', log, "Y-Farbe");
            setExpr(yst.property("ADBE Vector Stroke Width"), strokeExprL("Y-Achse Staerke"), log, "Y-Staerke");
            var ggMax = nGrid;
            for (var gg = 1; gg <= ggMax; gg++) {
                var frac = gg / nGrid;
                var gGrid = newGroup(rg, "Raster " + gg);
                var gPre2 = 'var W=' + Wp + ',H=' + Hp + ';var L=effect("Raster Laenge")("' + SLD + '")/100;';
                var gp2 = isBarLike(type)
                    ? (gPre2 + camBase("parent.effect") + vcam("parent.effect") +
                       (isVertical(type)
                          ? 'var y=PV(' + r6(axisMin + gridStep * gg) + ');createPath([[-W/2,y],[-W/2+L*W,y]],[],[],false);'
                          : 'var x=PV(' + r6(axisMin + gridStep * gg) + ');createPath([[x,H/2],[x,H/2-L*H]],[],[],false);'))
                    : (isVertical(type)
                    ? gPre2 + 'var y=H/2-' + frac + '*H;createPath([[-W/2,y],[-W/2+L*W,y]],[],[],false);'
                    : gPre2 + 'var x=-W/2+' + frac + '*W;createPath([[x,H/2],[x,H/2-L*H]],[],[],false);');
                setExpr(gGrid.property("ADBE Vector Shape - Group").property("ADBE Vector Shape"), gp2, log, "Rasterlinie");
                var gs = gGrid.property("ADBE Vector Graphic - Stroke");
                setExpr(gs.property("ADBE Vector Stroke Color"), 'effect("Raster Farbe")("' + COL + '");', log, "Rasterfarbe");
                setExpr(gs.property("ADBE Vector Stroke Width"), strokeExprL("Raster Staerke"), log, "Rasterstaerke");
                dashesL(gs, "Raster");
            }
            return ax;
        }
        function buildXLayer() {
            var ax = newAxisLayer("X-Achse - " + TYPES[type], 11, addXAxisCtrls);
            var rg = ax.property("ADBE Root Vectors Group");
            var gXaxis = newGroup(rg, "X-Achse");
            var axXY = isVertical(type) ? yZeroEx : 'H/2';
            setExpr(gXaxis.property("ADBE Vector Shape - Group").property("ADBE Vector Shape"),
                'var W=' + Wp + ',H=' + Hp + ';var yz=' + axXY + ';createPath([[-W/2,yz],[W/2,yz]],[],[],false);', log, "X-Achse");
            var xst = gXaxis.property("ADBE Vector Graphic - Stroke");
            setExpr(xst.property("ADBE Vector Stroke Color"), 'effect("X-Achse Farbe")("' + COL + '");', log, "X-Farbe");
            setExpr(xst.property("ADBE Vector Stroke Width"), strokeExprL("X-Achse Staerke"), log, "X-Staerke");
            if (catX) {
                for (var ii = 0; ii < nCat; ii++) {
                    var gXg = newGroup(rg, "X-Raster " + (ii + 1));
                    var xLen = 'var L=effect("X-Raster Laenge")("' + SLD + '")/100;';
                    var xgp, xPre2, xMarg2;
                    if (type === T_LINE || type === T_AREA) {
                        var uX = (nCat > 1) ? (ii / (nCat - 1)) : 0;
                        xPre2 = 'var W=' + Wp + ',H=' + Hp + ';' + xLen + 'var P=' + pExpr("parent.effect") + ';' +
                                followPrelude("parent.effect", nCat) + 'var x=MX(' + uX + ');';
                        xMarg2 = 0.09;
                    } else {
                        xPre2 = 'var W=' + Wp + ',H=' + Hp + ';var AXIS=W;' + xLen +
                                sortSlotExpr(ordersAll, ii, "parent.effect", hasBasis) +
                                camBase("parent.effect") + barLayout("parent.effect", nCat) + 'var x=CTR(slot);';
                        xMarg2 = 0.08;
                    }
                    xgp = xPre2 + 'createPath([[x,H/2],[x,H/2-L*H]],[],[],false);';
                    setExpr(gXg.property("ADBE Vector Shape - Group").property("ADBE Vector Shape"), xgp, log, "X-Rasterlinie");
                    var xgs = gXg.property("ADBE Vector Graphic - Stroke");
                    setExpr(xgs.property("ADBE Vector Stroke Color"), 'effect("X-Raster Farbe")("' + COL + '");', log, "X-Rasterfarbe");
                    setExpr(xgs.property("ADBE Vector Stroke Width"), strokeExprL("X-Raster Staerke"), log, "X-Rasterstaerke");
                    setExpr(xgs.property("ADBE Vector Stroke Opacity"), xEdgeFade(xPre2, xMarg2), log, "X-Rasterdeckkraft");
                    dashesL(xgs, "X-Raster");
                }
            }
            // Eigene Maske fuer das X-Raster (ebenfalls nach links offen)
            if (type === T_LINE || type === T_AREA) {
                try {
                    var mA = ax.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
                    try { mA.name = "Sichtfenster"; } catch (e) {}
                    setExpr(mA.property("ADBE Mask Shape"),
                        'var W=' + Wp + ',H=' + Hp + ';var FOL=parent.effect("Verfolgen")("' + CHK + '");' +
                        'var ZO=clamp(parent.effect("Gesamtansicht")("' + SLD + '")/100,0,1);' +
                        'var L=-W*20;var R=W*20;var my=H*20;' +   // nach links offen
                        'createPath([[L,-my],[R,-my],[R,my],[L,my]],[],[],true);',
                        log, "X-Achse Maske");
                } catch (eM) { log.push("X-Achse Maske: " + errStr(eM)); }
            }
            return ax;
        }
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
                    // Flaeche der X-Position - und beim Verfolgen wandert es mit
                    // und blendet an den Fensterraendern aus.
                    var barLbl = (isBarLike(type) && canSort);
                    if (isVertical(type)) {
                        if (type === T_LINE || type === T_AREA) {
                            var uL = (nCat > 1) ? (k / (nCat - 1)) : 0;
                            var lp = 'var W=' + WL + ',H=' + HL + ';var P=' + pExpr("parent.effect") + ';' +
                                     followPrelude("parent.effect", nCat) + 'var x=MX(' + uL + ');';
                            addLabel(comp, layer, data.labels[k],
                                lp + '[x, H/2+' + Math.round(fs * 1.4) + '];',
                                fs, ParagraphJustification.CENTER_JUSTIFY, log, "X-Achse " + data.labels[k],
                                // sanftes Ein-/Ausblenden an den Fensterraendern (Smoothstep)
                                lp + 'var m=Math.max(1,W*0.09);var e=Math.min(x-(-W/2),(W/2)-x);' +
                                'var o=clamp(e/m,0,1);(o*o*(3-2*o))*100;');
                        } else {
                            var lpB = 'var W=' + WL + ',H=' + HL + ';var AXIS=W;' +
                                      sortSlotExpr(ordersAll, k, "parent.effect", hasBasis) +
                                      camBase("parent.effect") + barLayout("parent.effect", nCat) +
                                      'var x=CTR(slot);';
                            addLabel(comp, layer, data.labels[k],
                                lpB + '[x, H/2+' + Math.round(fs * 1.4) + '];',
                                fs, ParagraphJustification.CENTER_JUSTIFY, log, "X-Achse " + data.labels[k],
                                lpB + 'var m=Math.max(1,W*0.08);var e=Math.min(x-(-W/2),(W/2)-x);' +
                                'var o=clamp(e/m,0,1);(o*o*(3-2*o))*100;');
                        }
                    } else {
                        var lpH = 'var W=' + WL + ',H=' + HL + ';var AXIS=H;' +
                                  (barLbl ? sortSlotExpr(ordersAll, k, "parent.effect", hasBasis) : 'var slot=' + k + ';') +
                                  camBase("parent.effect") + barLayout("parent.effect", nCat) +
                                  'var y=CTR(slot);';
                        addLabel(comp, layer, data.labels[k],
                            lpH + '[-W/2-' + Math.round(fs * 0.6) + ', y+' + Math.round(fs * 0.35) + '];',
                            fs, ParagraphJustification.RIGHT_JUSTIFY, log, "Y-Kat " + data.labels[k],
                            lpH + 'var m=Math.max(1,H*0.08);var e=Math.min(y-(-H/2),(H/2)-y);' +
                            'var o=clamp(e/m,0,1);(o*o*(3-2*o))*100;');
                    }
                }
                if (nGrid > 0) {
                    var yLx = yRight ? ('W/2+' + Math.round(fs * 0.6)) : ('-W/2-' + Math.round(fs * 0.6));
                    var yJust = yRight ? ParagraphJustification.LEFT_JUSTIFY : ParagraphJustification.RIGHT_JUSTIFY;
                    var giMax = nGrid;
                    for (var gi = 0; gi <= giMax; gi++) {
                        var f2 = gi / nGrid;
                        var vt = fmtNum(axisMin + gridStep * gi);
                        var lVal = r6(axisMin + gridStep * gi);
                        var lPre = 'var W=' + WL + ',H=' + HL + ';';
                        if (isBarLike(type)) lPre += camBase("parent.effect") + vcam("parent.effect");
                        if (isVertical(type)) {
                            addLabel(comp, layer, vt,
                                lPre + (isBarLike(type) ? ('var y=PV(' + lVal + ')+' + Math.round(fs * 0.35) + ';')
                                                        : ('var y=H/2-' + f2 + '*H+' + Math.round(fs * 0.35) + ';')) +
                                '[' + yLx + ', y];',
                                fs, yJust, log, "Y-Achse " + vt);
                        } else {
                            addLabel(comp, layer, vt,
                                lPre + (isBarLike(type) ? ('var x=PV(' + lVal + ');')
                                                        : ('var x=-W/2+' + f2 + '*W;')) +
                                '[x, H/2+' + Math.round(fs * 1.4) + '];',
                                fs, ParagraphJustification.CENTER_JUSTIFY, log, "X-Achse " + vt);
                        }
                    }
                }
            }
        }

        // ---- Sichtfenster-Maske (nur Linie/Flaeche) ----
        // Die Maske ist NACH LINKS OFFEN: weggescrolltes Material wird nicht
        // abgeschnitten, es begrenzt nur der Kompositionsrand. Wer doch
        // beschneiden will, zieht die Maskenkante einfach von Hand zu.
        if (type === T_LINE || type === T_AREA) {
            var maskTargets = (perEl && childLayers.length) ? childLayers : [layer];
            for (var mi = 0; mi < maskTargets.length; mi++) try {
                var mTgt = maskTargets[mi];
                var mAtom = mTgt.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
                try { mAtom.name = "Sichtfenster"; } catch (eMn) {}
                setExpr(mAtom.property("ADBE Mask Shape"),
                    (mTgt === layer ? (function (x) { return x; }) : childExpr)(
                    'var W=' + W + ',H=' + H + ';var FOL=effect("Verfolgen")("' + CHK + '");' +
                    'var ZO=clamp(effect("Gesamtansicht")("' + SLD + '")/100,0,1);' +
                    'var L=-W*20;var R=W*20;var my=H*20;' +   // nach links offen
                    'createPath([[L,-my],[R,-my],[R,my],[L,my]],[],[],true);',
                    ), log, "Sichtfenster-Maske");
            } catch (eMask) { log.push("Maske: " + errStr(eMask)); }
        }

        // ---- Mitlaufende Beschriftung (nur Linie/Flaeche) ----
        // Zeigt entweder den laufenden Wert ODER den Reihennamen (Option
        // "Beschriftung: Name"). Beides sitzt an der Spitze und wandert mit.
        if ((type === T_LINE || type === T_AREA) && opt.runningValue) {
            var showName = (opt.labelMode === "name");
            for (var rv = 0; rv < nSer; rv++) {
                var rvals = data.series[rv].values;
                var sname = data.series[rv].name || ("Reihe " + (rv + 1));
                var initTxt = showName ? sname : (Math.round(rvals[0]) + String(opt.suffix || ""));
                var txtExpr = showName
                    ? ('"' + String(sname).replace(/["\\]/g, "") + '";')
                    : runningTextExpr(rvals, axisMax, "parent.effect", opt.suffix || "");
                addRunningValue(comp, layer, initTxt, txtExpr,
                    tipExpr(rvals, axisMin, axisMax, WL, HL, "parent.effect", '[xf, y-' + Math.round(opt.fontSize * 1.2) + '];', true),
                    opt.fontSize, log, (showName ? "Name " : "Wert laufend ") + (rv + 1));
            }
        }

        // ---- Null-Objekte am Pfad (Linie/Flaeche) ----
        // Ein Anker je Reihe, der der Spitze folgt - zum Anhaengen von
        // Icons/Callouts/Grafiken (parenten an das Null).
        if ((type === T_LINE || type === T_AREA) && opt.pathNulls) {
            for (var pn = 0; pn < nSer; pn++) {
                var pvals = data.series[pn].values;
                addPathNull(comp, layer,
                    tipExpr(pvals, axisMin, axisMax, WL, HL, "parent.effect", '[xf,y];', true),
                    "Anker Reihe " + (pn + 1), log);
            }
        }
        // Anker an den Balkenspitzen (folgen Kamera, Wachstum und Sortierung)
        if (isBarLike(type) && opt.pathNulls) {
            for (var bn = 0; bn < nCat; bn++) {
                for (var bs2 = 0; bs2 < nSer; bs2++) {
                    var vB = data.series[bs2].values[bn];
                    var axB = isVertical(type) ? 'W' : 'H';
                    var preB = 'var W=' + WL + ',H=' + HL + ';var AXIS=' + axB + ';' +
                               (GC.replace(/effect\(/g, 'parent.effect(')) +
                               (GS.replace(/effect\(/g, 'parent.effect(')) +
                               sortSlotExpr(ordersAll, bn, "parent.effect", hasBasis) +
                               camBase("parent.effect") + barLayout("parent.effect", nCat) +
                               barGrowth("parent.effect", nCat, maxAbs) +
                               'var gw=cw*(1-gC);' +
                               (isStacked(type)
                                   ? 'var ctr=CTR(slot);'
                                   : 'var bs=gw/' + nSer + ';var ctr=CTR(slot)-gw/2+bs*' + (bs2 + 0.5) + ';');
                    addPathNull(comp, layer,
                        preB + vcam("parent.effect") + (isVertical(type)
                            ? ('[ctr,PV(VD(' + vB + '))];')
                            : ('[PV(VD(' + vB + ')),ctr];')),
                        "Anker " + safeName(data.labels[bn]) + (nSer > 1 ? (" R" + (bs2 + 1)) : ""), log);
                }
            }
        }

        // ---- Animation: zwei Keyframes 0->100 automatisch anlegen ----
        // Danach frei editier-/eas-bar. Master-Regler bleibt auch ohne
        // Keyframes voll funktionsfaehig (manuell scrubben).
        if (opt.animKeys) {
            try {
                var ap = layer.property("ADBE Effect Parade").property("Animation").property(SLD);
                var t0 = Math.max(0, opt.animDelay || 0);
                var t1 = t0 + Math.max(0.1, opt.animDur || 2.5);
                ap.setValueAtTime(t0, 0);
                ap.setValueAtTime(t1, 100);
                // Hinweis, wenn die Animation ueber das Kompositionsende
                // hinausragt - sonst laeuft sie unbemerkt ins Leere.
                if (t1 > comp.duration + 0.001)
                    log.push("Hinweis: Die Animation dauert bis " + (Math.round(t1 * 10) / 10) +
                             "s, die Komposition ist aber nur " + (Math.round(comp.duration * 10) / 10) +
                             "s lang. Entweder Dauer im Panel verringern oder die Komposition verlaengern.");
                try {
                    ap.setTemporalEaseAtKey(1, [new KeyframeEase(0, 40)], [new KeyframeEase(0, 85)]);
                    ap.setTemporalEaseAtKey(2, [new KeyframeEase(0, 85)], [new KeyframeEase(0, 40)]);
                } catch (eE) { log.push("Ease: " + errStr(eE)); }
            } catch (eK) { log.push("Keyframes: " + errStr(eK)); }
        }

        // ---- Auto-Keyframes: am Ende smooth zur Gesamtansicht zoomen ----
        // Startet, wenn die Linie fertig gezeichnet ist (Animationsende),
        // und blendet ueber "Zoom-Dauer" auf die volle Ansicht. Nur wenn
        // Verfolgen aktiv ist. Danach frei editier-/eas-bar.
        if ((type === T_LINE || type === T_AREA || isBarLike(type)) && opt.zoomOut && opt.follow) {
            try {
                var zp = layer.property("ADBE Effect Parade").property("Gesamtansicht").property(SLD);
                var z0 = Math.max(0, opt.animDelay || 0) + Math.max(0.1, opt.animDur || 2.5) + Math.max(0, opt.zoomHold || 0);
                var z1 = z0 + Math.max(0.1, opt.zoomDur || 2);
                zp.setValueAtTime(z0, 0);
                zp.setValueAtTime(z1, 100);
                try {
                    zp.setTemporalEaseAtKey(1, [new KeyframeEase(0, 40)], [new KeyframeEase(0, 75)]);
                    zp.setTemporalEaseAtKey(2, [new KeyframeEase(0, 75)], [new KeyframeEase(0, 40)]);
                } catch (eZe) { log.push("Zoom-Ease: " + errStr(eZe)); }
            } catch (eZ) { log.push("Zoom-Keyframes: " + errStr(eZ)); }
        }

        return layer;
    }

    /* ================================================================
     * ZIEL & AKTUALISIEREN
     * ----------------------------------------------------------------
     * 1) ZIELKOMPOSITION
     *    Das Panel kann fest an eine Komposition gebunden werden
     *    (Auswahl "Ziel > Komposition"). "Aktive Komposition" =
     *    Verhalten wie bisher. Gebunden wird ueber die Item-ID, ein
     *    Umbenennen der Komp schadet also nicht. Ist die gebundene
     *    Komp geloescht, faellt das Panel still auf "aktiv" zurueck.
     *
     * 2) AKTUALISIEREN
     *    Baut das Diagramm mit den aktuellen Panel-Werten NEU auf,
     *    behaelt aber alles, was an der Ebene selbst eingestellt wurde:
     *      - Position im Ebenenstapel
     *      - Transform der Diagramm-Ebenen (Werte UND Keyframes)
     *      - Ebenenattribute (An/Aus, Modus, Ein-/Ausstieg, Shy, ...)
     *      - alle Effektregler, die NICHT aus dem Panel kommen
     *        (Farben, Kontur, Achsen, Raster, Staffelung ...)
     *      - Keyframes auf allen uebernommenen Reglern
     *    Regler, die das Panel direkt schreibt (PANEL_CTRLS), kommen
     *    bewusst frisch aus dem Panel - sonst waere das Panel wirkungslos.
     *
     *    Eigenschaften mit AUSDRUCK werden nie zurueckgeschrieben. Der
     *    Aufbau ist dort die Quelle der Wahrheit; ein alter Ausdruck
     *    wuerde sonst mit alten Daten den neuen ueberschreiben.
     *
     *    Zuordnung alt -> neu: die Steuer-Ebene wird an ihrem Regler
     *    "Breite" erkannt (nicht am Namen, der sich mit dem Diagrammtyp
     *    aendert), alle uebrigen Ebenen ueber ihren Namen. Aendern sich
     *    die Daten, aendern sich die Namen - diese Ebenen starten dann
     *    zu Recht mit Standardwerten.
     * ================================================================ */

    // Regler, die direkt aus dem Panel kommen: beim Aktualisieren NICHT
    // aus dem Altbestand zurueckholen.
    var PANEL_CTRLS = {};
    (function () {
        var n = ["Breite", "Hoehe", SORT_NAME,
                 "Verfolgen", "Sichtfenster", "Verfolg-Position", "Start-Position"];
        for (var i = 0; i < n.length; i++) { PANEL_CTRLS[n[i]] = 1; }
    })();

    var boundCompId = 0;   // 0 = aktive Komposition

    function compList() {
        var out = [];
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it instanceof CompItem) { out.push(it); }
        }
        return out;
    }
    function compById(id) {
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if ((it instanceof CompItem) && it.id === id) { return it; }
        }
        return null;
    }
    // Gebundene Komp, sonst die aktive. null = nichts brauchbar offen.
    function targetComp() {
        if (boundCompId) {
            var c = compById(boundCompId);
            if (c) { return c; }
            boundCompId = 0;
        }
        var a = app.project.activeItem;
        return (a && a instanceof CompItem) ? a : null;
    }

    // ---- Eigenschaften sichern / zurueckschreiben -------------------
    function tfProp(ly, mn) {
        try { return ly.property("ADBE Transform Group").property(mn); } catch (e) { return null; }
    }
    // 2D-Ebenen kennen "ADBE Rotation" nicht -> zuerst Rotate Z.
    function rotProp(ly) { return tfProp(ly, "ADBE Rotate Z") || tfProp(ly, "ADBE Rotation"); }

    function grabProp(p) {
        if (!p) { return null; }
        var r = { keys: [], val: null, ex: "" };
        try { if (p.expressionEnabled && p.expression) { r.ex = p.expression; } } catch (e) {}
        try {
            if (p.numKeys > 0) {
                for (var k = 1; k <= p.numKeys; k++) {
                    var rec = { t: p.keyTime(k), v: p.keyValue(k) };
                    try { rec.ii = p.keyInInterpolationType(k); rec.oi = p.keyOutInterpolationType(k); } catch (e1) {}
                    try { rec.ie = p.keyInTemporalEase(k);      rec.oe = p.keyOutTemporalEase(k); } catch (e2) {}
                    r.keys.push(rec);
                }
            } else {
                r.val = p.value;
            }
        } catch (e3) { return null; }
        return r;
    }
    function sameVal(a, b) {
        if (a instanceof Array && b instanceof Array) {
            if (a.length !== b.length) { return false; }
            for (var i = 0; i < a.length; i++) { if (Math.abs(a[i] - b[i]) > 1e-9) { return false; } }
            return true;
        }
        if (typeof a === "number" && typeof b === "number") { return Math.abs(a - b) < 1e-9; }
        return (a === b);
    }
    // Schreibt nur bei echter Abweichung (jedes setValue verwirft Cache).
    // Liegt auf der frisch gebauten Eigenschaft ein Ausdruck, bleibt sie
    // unangetastet - der Aufbau gewinnt.
    function putProp(p, r, log, label) {
        if (!p || !r) { return; }
        try { if (p.expressionEnabled && p.expression) { return; } } catch (e) {}
        try {
            if (r.keys.length > 0) {
                for (var d = p.numKeys; d >= 1; d--) { p.removeKey(d); }
                for (var i = 0; i < r.keys.length; i++) { p.setValueAtTime(r.keys[i].t, r.keys[i].v); }
                for (var j = 0; j < r.keys.length; j++) {
                    var kk = j + 1, rc = r.keys[j];
                    try { if (rc.ii !== undefined && rc.ii !== null) { p.setInterpolationTypeAtKey(kk, rc.ii, rc.oi); } } catch (e1) {}
                    try { if (rc.ie) { p.setTemporalEaseAtKey(kk, rc.ie, rc.oe); } } catch (e2) {}
                }
            } else if (r.val !== null) {
                for (var d2 = p.numKeys; d2 >= 1; d2--) { p.removeKey(d2); }
                if (!sameVal(p.value, r.val)) { p.setValue(r.val); }
            }
        } catch (e3) { if (log) { log.push("Uebernahme " + label + ": " + errStr(e3)); } }
    }

    // Die Steuer-Ebene traegt als einzige den Regler "Breite".
    function isCtrlLayer(ly) {
        try { return !!ly.property("ADBE Effect Parade").property("Breite"); } catch (e) { return false; }
    }

    var XF_MN = ["ADBE Anchor Point", "ADBE Position", "ADBE Scale", "ADBE Opacity"];

    function grabLayer(ly) {
        var s = { name: ly.name, ctrl: isCtrlLayer(ly), xf: {}, fx: {}, at: {} };
        for (var i = 0; i < XF_MN.length; i++) { s.xf[XF_MN[i]] = grabProp(tfProp(ly, XF_MN[i])); }
        s.xf.ROT = grabProp(rotProp(ly));
        try {
            var par = ly.property("ADBE Effect Parade");
            for (var e = 1; e <= par.numProperties; e++) {
                var fx = par.property(e), bag = {};
                for (var q = 1; q <= fx.numProperties; q++) {
                    var pr = null;
                    try { pr = fx.property(q); } catch (eP) { continue; }
                    if (!pr || pr.propertyType !== PropertyType.PROPERTY) { continue; }
                    var g = grabProp(pr);
                    if (g) { bag[q] = g; }
                }
                s.fx[fx.name] = bag;
            }
        } catch (e2) {}
        try {
            s.at.enabled = ly.enabled; s.at.shy = ly.shy; s.at.locked = ly.locked;
            s.at.motionBlur = ly.motionBlur; s.at.blend = ly.blendingMode; s.at.label = ly.label;
            s.at.startTime = ly.startTime; s.at.inPoint = ly.inPoint; s.at.outPoint = ly.outPoint;
        } catch (e3) {}
        return s;
    }

    // Zustand aller erzeugten Ebenen einsammeln - VOR dem Purge.
    function snapshotGenerated(comp) {
        var snap = { index: 0, aboveName: "", ctrl: null, byName: {}, n: 0 };
        for (var i = 1; i <= comp.numLayers; i++) {
            var ly = comp.layer(i);
            if (ly.comment !== TAG) { continue; }
            if (!snap.index) {
                snap.index = i;
                // Naechste NICHT erzeugte Ebene darueber merken: daran
                // wird der Block spaeter wieder eingehaengt.
                for (var a = i - 1; a >= 1; a--) {
                    var la = comp.layer(a);
                    if (la.comment !== TAG) { snap.aboveName = la.name; break; }
                }
            }
            var s = grabLayer(ly);
            snap.n++;
            if (s.ctrl && !snap.ctrl) { snap.ctrl = s; }
            if (!snap.byName[s.name]) { snap.byName[s.name] = s; }
        }
        return snap;
    }

    // Zustand auf die frisch gebauten Ebenen zurueckspielen.
    function restoreGenerated(comp, snap, log) {
        if (!snap || snap.n === 0) { return; }

        var fresh = [], i;
        for (i = 1; i <= comp.numLayers; i++) {
            if (comp.layer(i).comment === TAG) { fresh.push(comp.layer(i)); }
        }
        if (fresh.length === 0) { return; }

        // 1) Stapelposition: hinter die gemerkte Ebene zurueck. Rueckwaerts
        //    einhaengen, damit die Reihenfolge im Block erhalten bleibt.
        if (snap.aboveName) {
            var ref = null;
            for (i = 1; i <= comp.numLayers; i++) {
                var lr = comp.layer(i);
                if (lr.comment !== TAG && lr.name === snap.aboveName) { ref = lr; break; }
            }
            if (ref) {
                for (var m = fresh.length - 1; m >= 0; m--) {
                    try { fresh[m].moveAfter(ref); } catch (eM) {}
                }
            }
        }

        // 2) Je Ebene: Transform, Effektwerte, Attribute
        for (var f = 0; f < fresh.length; f++) {
            var ly = fresh[f];
            var s = (isCtrlLayer(ly) && snap.ctrl) ? snap.ctrl : snap.byName[ly.name];
            if (!s) { continue; }
            try { if (ly.locked) { ly.locked = false; } } catch (eL) {}

            for (var x = 0; x < XF_MN.length; x++) {
                putProp(tfProp(ly, XF_MN[x]), s.xf[XF_MN[x]], log, XF_MN[x]);
            }
            putProp(rotProp(ly), s.xf.ROT, log, "Drehung");

            try {
                var par = ly.property("ADBE Effect Parade");
                for (var e = 1; e <= par.numProperties; e++) {
                    var fx = par.property(e);
                    if (PANEL_CTRLS[fx.name]) { continue; }      // Panel gewinnt
                    var bag = s.fx[fx.name];
                    if (!bag) { continue; }
                    for (var q = 1; q <= fx.numProperties; q++) {
                        if (!bag[q]) { continue; }
                        putProp(fx.property(q), bag[q], log, fx.name);
                    }
                }
            } catch (eF) { if (log) { log.push("Effekt-Uebernahme " + ly.name + ": " + errStr(eF)); } }

            try { if (s.at.blend !== undefined) { ly.blendingMode = s.at.blend; } } catch (e1) {}
            try { if (s.at.label !== undefined) { ly.label = s.at.label; } } catch (e2) {}
            try { if (s.at.motionBlur !== undefined) { ly.motionBlur = s.at.motionBlur; } } catch (e3) {}
            try { if (s.at.startTime !== undefined) { ly.startTime = s.at.startTime; } } catch (e4) {}
            try { if (s.at.outPoint !== undefined) { ly.outPoint = s.at.outPoint; } } catch (e5) {}
            try { if (s.at.inPoint !== undefined) { ly.inPoint = s.at.inPoint; } } catch (e6) {}
            try { if (s.at.enabled !== undefined) { ly.enabled = s.at.enabled; } } catch (e7) {}
            try { if (s.at.shy !== undefined) { ly.shy = s.at.shy; } } catch (e8) {}
            try { if (s.at.locked) { ly.locked = true; } } catch (e9) {}
        }
    }

    // ---- Aktion ----------------------------------------------------
    // keep = true -> Aktualisieren: alten Stand sichern, neu bauen,
    // Handarbeit zurueckspielen. keep = false -> alles frisch aus dem Panel.
    function run(typeIdx, txt, opt, keep) {
        var comp = targetComp();
        if (!comp) { alert("Keine Zielkomposition.\n\nBitte unter \"Ziel\" eine Komposition waehlen\noder eine Komposition oeffnen."); return; }
        var log = [];
        var data = parseData(txt, log);
        if (!data) { alert(SCRIPT_NAME + ":\n\n" + log.join("\n")); return; }
        app.beginUndoGroup(SCRIPT_NAME + (keep ? " - Aktualisieren" : ""));
        var snap = null;
        if (keep) {
            snap = snapshotGenerated(comp);
            if (snap.n === 0)
                log.push("Hinweis: In \"" + comp.name + "\" lag noch kein Diagramm - es wurde neu angelegt.");
        }
        // Vorherige, von diesem Script erzeugte Ebenen IMMER zuerst entfernen.
        // Verhindert, dass sich alte und neue Ebenen ueberlagern (z.B. nach
        // einem Skript-Fehler mitten im Aufbau) -> Ursache fuer Faelle wie
        // "Raster passt nicht zur Beschriftung", weil zwei Staende gemischt
        // im Bild lagen.
        purgeGenerated(comp);
        try {
            var l = buildChart(comp, typeIdx, data, opt, log);
            if (keep && snap && snap.n > 0) restoreGenerated(comp, snap, log);
            if (l) l.selected = true;
        } catch (e) {
            var lt = ""; try { if (e && e.line) lt = " (Zeile " + e.line + ")"; } catch (x) {}
            log.push("ABBRUCH: " + errStr(e) + lt);
        }
        app.endUndoGroup();
        if (log.length > 0)
            alert(SCRIPT_NAME + " - Diagnose:\n\n" + log.join("\n") + "\n\n(Bitte diese Meldung 1:1 zurueckmelden.)");
    }

    // Entfernt alle von diesem Script erzeugten Ebenen (per TAG markiert).
    // Wird sowohl vom "Entfernen"-Knopf als auch vor jedem Neuaufbau genutzt.
    function purgeGenerated(comp) {
        var n = 0;
        for (var i = comp.numLayers; i >= 1; i--) {
            var ly = comp.layer(i);
            if (ly.comment === TAG) {
                try { if (ly.locked) ly.locked = false; } catch (eL) {}
                try { ly.remove(); n++; } catch (e) {}
            }
        }
        return n;
    }
    function removeGenerated() {
        var comp = targetComp();
        if (!comp) { alert("Keine Zielkomposition.\n\nBitte unter \"Ziel\" eine Komposition waehlen\noder eine Komposition oeffnen."); return; }
        app.beginUndoGroup(SCRIPT_NAME + " - Entfernen");
        var n = purgeGenerated(comp);
        app.endUndoGroup();
        if (n === 0) alert("Keine erzeugten Diagramm-Ebenen gefunden.");
    }

    // ---- UI ---------------------------------------------------------
    function buildUI(thisObj) {
        var pal = (thisObj instanceof Panel) ? thisObj
            : new Window("palette", SCRIPT_NAME, undefined, { resizeable: true });
        pal.orientation = "column"; pal.alignChildren = ["fill", "top"];
        pal.spacing = 8; pal.margins = 12;

        var title = pal.add("statictext", undefined, "ChartAnimator");
        try { title.graphics.font = ScriptUI.newFont("dialog", "BOLD", 14); } catch (x) {}

        // ---- Ziel: Komposition zuweisen ----
        // Ohne Zuweisung arbeitet das Panel wie bisher auf der aktiven
        // Komposition. Gebunden wird ueber die Item-ID, nicht den Namen.
        var gTgt = pal.add("panel", undefined, "Ziel");
        gTgt.orientation = "column"; gTgt.alignChildren = ["fill", "top"];
        gTgt.margins = 10; gTgt.spacing = 6;
        var rTgt = gTgt.add("group"); rTgt.orientation = "row"; rTgt.alignChildren = ["left", "center"];
        var stTgt = rTgt.add("statictext", undefined, "Komposition"); stTgt.preferredSize.width = 120;
        var ddComp = rTgt.add("dropdownlist", undefined, []);
        ddComp.alignment = ["fill", "center"];
        var btnRe = rTgt.add("button", undefined, "\u21BB");
        btnRe.preferredSize.width = 30;
        btnRe.helpTip = "Kompositionsliste neu einlesen";

        var compIds = [0];
        var TGT_BUSY = false;   // ScriptUI feuert onChange auch bei Zuweisung
        function fillComps() {
            TGT_BUSY = true;
            var want = boundCompId, i;
            ddComp.removeAll();
            compIds = [0];
            ddComp.add("item", "Aktive Komposition");
            var cs = compList();
            for (i = 0; i < cs.length; i++) { ddComp.add("item", cs[i].name); compIds.push(cs[i].id); }
            var sel = 0;
            for (i = 0; i < compIds.length; i++) { if (compIds[i] === want) { sel = i; break; } }
            boundCompId = compIds[sel];
            ddComp.selection = sel;
            TGT_BUSY = false;
        }
        ddComp.onChange = function () {
            if (TGT_BUSY) { return; }
            var i = this.selection ? this.selection.index : 0;
            boundCompId = compIds[i] || 0;
        };
        btnRe.onClick = function () { fillComps(); };
        fillComps();

        var dd = pal.add("dropdownlist", undefined, TYPES);
        var syncWin = null;   // wird weiter unten gesetzt
        dd.onChange = function () { if (syncWin) syncWin(); };
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
            et.lbl = st;                       // Beschriftung nachtraeglich aenderbar
            return et;
        }

        var gSize = pal.add("panel", undefined, "Groesse");
        gSize.orientation = "column"; gSize.alignChildren = ["fill", "top"];
        gSize.margins = 10; gSize.spacing = 6;
        var eW = row(gSize, "Breite (px)", 800);
        var eH = row(gSize, "Hoehe (px)", 450);

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
        var cYR = gCol.add("checkbox", undefined, "Y-Achse rechts"); cYR.value = false;
        var cSep = gCol.add("checkbox", undefined, "Achsen auf eigener Ebene"); cSep.value = true;
        var cPer = gCol.add("checkbox", undefined, "Eine Ebene je Balken/Linie"); cPer.value = true;

        var gAn = pal.add("panel", undefined, "Animation");
        gAn.orientation = "column"; gAn.alignChildren = ["fill", "top"];
        gAn.margins = 10; gAn.spacing = 6;
        var cKey = gAn.add("checkbox", undefined, "Keyframes automatisch (0 \u2192 100)"); cKey.value = true;
        var eDur = row(gAn, "Dauer (s)", 25);
        var cRun = gAn.add("checkbox", undefined, "Mitlaufende Beschriftung (Linie/Flaeche)"); cRun.value = true;
        var rLm = gAn.add("group"); rLm.orientation = "row"; rLm.alignChildren = ["left", "center"];
        var stLm = rLm.add("statictext", undefined, "Beschriftung zeigt"); stLm.preferredSize.width = 120;
        var ddLm = rLm.add("dropdownlist", undefined, ["Wert", "Reihenname"]); ddLm.selection = 0;
        var eSuf = row(gAn, "Werteinheit (Suffix)", "%");
        var cNul = gAn.add("checkbox", undefined, "Null-Objekte am Pfad (Anker)"); cNul.value = false;
        var cFol = gAn.add("checkbox", undefined, "Verfolgen (Linie/Balken, Achse bleibt)"); cFol.value = false;
        var eWin = row(gAn, "Sichtfenster (Punkte)", 6);
        // Bedeutung haengt vom Diagrammtyp ab -> Beschriftung mitfuehren
        function syncWinLabel() {
            var t = dd.selection ? dd.selection.index : 0;
            var bar = (t === T_VBAR || t === T_VSTACK || t === T_HBAR || t === T_HSTACK);
            try {
                eWin.lbl.text = bar ? "Sichtfenster (Raster)" : "Sichtfenster (Punkte)";
                if (eWin.__auto !== false) eWin.text = bar ? "4" : "6";
            } catch (e) {}
        }
        eWin.onChange = function () { eWin.__auto = false; };
        syncWin = syncWinLabel;
        syncWinLabel();
        var eSpos = row(gAn, "Start-Position (%)", 0);   // nur Linie/Flaeche
        var eFpos = row(gAn, "Verfolg-Position (%)", 85);
        var cZoom = gAn.add("checkbox", undefined, "Am Ende zur Gesamtansicht zoomen"); cZoom.value = true;

        function currentType() { return dd.selection ? dd.selection.index : 0; }
        function currentOpts() {
            return {
                w: num(eW, 800), h: num(eH, 450), gap: 30, serGap: 10, divs: 5,
                labels: cLb.value, fontSize: num(eF, 24), yRight: cYR.value, sepAxes: cSep.value, perElement: cPer.value,
                sort: (ddSort.selection ? ddSort.selection.index : 0),
                animKeys: cKey.value, animDur: num(eDur, 25), animDelay: 0,
                stagger: 0, dotSize: 8,
                runningValue: cRun.value, suffix: eSuf.text,
                labelMode: (ddLm.selection && ddLm.selection.index === 1) ? "name" : "value",
                pathNulls: cNul.value,
                xGrid: 0, follow: cFol.value, window: num(eWin, 6), windowBars: num(eWin, 4), followPos: num(eFpos, 85),
                startPos: num(eSpos, 0),
                zoomOut: cZoom.value, zoomHold: 0.5, zoomDur: 2
            };
        }

        var gDo = pal.add("group"); gDo.orientation = "row"; gDo.alignChildren = ["fill", "center"];
        var btn = gDo.add("button", undefined, "Diagramm erstellen");
        btn.onClick = function () { run(currentType(), ta.text, currentOpts(), false); };
        var btnUpd = gDo.add("button", undefined, "Aktualisieren");
        btnUpd.helpTip = "Baut das Diagramm in der Zielkomposition neu auf.\n" +
                         "Stapelposition, Transform, Keyframes und alle Regler,\n" +
                         "die nicht aus dem Panel kommen, bleiben erhalten.";
        btnUpd.onClick = function () { run(currentType(), ta.text, currentOpts(), true); };

        var btnDel = pal.add("button", undefined, "Diagramme entfernen");
        btnDel.onClick = function () { removeGenerated(); };

        pal.layout.layout(true);
        pal.onResizing = pal.onResize = function () { this.layout.resize(); };
        return pal;
    }

    var ui = buildUI(thisObj);
    if (ui instanceof Window) { ui.center(); ui.show(); }

})(this);
