/**********************************************************************
 * ArrowBuilder.jsx  -  parametrische Pfeile fuer Adobe After Effects
 *
 * Erzeugt einen Shape-Layer, dessen kompletter Pfad per Expression aus
 * Effekt-Reglern berechnet wird. Keine Fremd-Plugins.
 *
 * Regler auf der Ebene:
 *   Pfeil-Typ       Gerade | Bogen | S-Kurve | Winkel | Zickzack |
 *                   Welle | Stufe | U-Form | Kreispfeil |
 *                   Blockpfeil | Blockpfeil Bogen
 *   Laenge          Laenge in px (Grundlinie), beim Kreispfeil Durchmesser
 *   Kruemmung       -100 .. 100  (Richtung/Staerke der Biegung bzw. des
 *                   Versatzes, beim Kreispfeil der Oeffnungswinkel)
 *   Segmente        Anzahl Zacken (Zickzack), Boegen (Welle), Stufen (Stufe)
 *   Rundung         Eckenradius der Linie (natives "Runde Ecken")
 *   Konturstaerke   Linienstaerke in px, bei Blockpfeilen die Koerperdicke
 *   Spitzen-Stil    Dreieck | Offen (V) | Konkav  (nicht bei Blockpfeilen)
 *   Spitzen-Laenge  Faktor x Konturstaerke
 *   Spitzen-Breite  Faktor x Konturstaerke
 *   Doppelspitze    Spitze auch am Anfang
 *   Farbe           Kontur- und Fuellfarbe
 *
 * Bei gefuellten Spitzen wird die Linie um ein Stueck vor dem Scheitel
 * gekappt (exakt per de-Casteljau-Teilung, also auch auf Kurven). Sonst
 * ragt die Kontur dort seitlich aus der schmal zulaufenden Spitze heraus
 * und stumpft den Punkt zu einem Stummel ab. Bei der offenen Spitze (V)
 * bleibt die Linie stehen - dort treffen sich Linie und Spitze im Scheitel.
 *
 * Blockpfeile sind ein einziger geschlossener, gefuellter Pfad. Spitze und
 * Koerper stecken dort in der Liniengruppe, die Spitzen-Gruppen werden per
 * Deckkraft-Expression stummgeschaltet.
 *
 * Datei bewusst komplett ASCII. Umlaute in der Oberflaeche kommen ueber
 * \u-Escapes, damit die Datei-Codierung nichts kaputt machen kann.
 **********************************************************************/

(function (thisObj) {

var SCRIPT_NAME = "ArrowBuilder";

/* ================================================================
 * 1) Helfer - sprachunabhaengiger Property-Zugriff
 * ================================================================ */

/* Versucht der Reihe nach matchName, lokalisierte Namen und Index. */
function propAny(grp, keys) {
    if (!grp) return null;
    for (var i = 0; i < keys.length; i++) {
        try {
            var p = grp.property(keys[i]);
            if (p) return p;
        } catch (e) {}
    }
    return null;
}

/* Letzte Rettung: erste Property eines bestimmten Wertetyps. */
function propByType(grp, type) {
    if (!grp) return null;
    for (var i = 1; i <= grp.numProperties; i++) {
        try {
            var p = grp.property(i);
            if (p.propertyValueType === type) return p;
        } catch (e) {}
    }
    return null;
}

function setAny(p, v) {
    try { p.setValue(v); return true; } catch (e) { return false; }
}

function exprAny(p, e) {
    try {
        if (p && p.canSetExpression) { p.expression = e; return true; }
    } catch (err) {}
    return false;
}

/* ================================================================
 * 2) Expression-Bibliothek (wird in jede Expression eingebettet)
 * ================================================================ */

var LIB = [
"function ev(n){ try{ return effect(n)(1).value; }catch(e){ return 0; } }",
"function sgn(x){ return (x<0) ? -1 : 1; }",
"function nrm(v){ var m=Math.sqrt(v[0]*v[0]+v[1]*v[1]); if(m<0.0001) return [1,0]; return [v[0]/m, v[1]/m]; }",
"function zt(n){ var z=[]; for(var i=0;i<n;i++) z.push([0,0]); return z; }",
"function res(P,I,O,C,eP,eD,sP,sD){ return {p:P,i:I,o:O,c:C,eP:eP,eD:eD,sP:sP,sD:sD}; }",
"function pol(cx,cy,R,a){ return [cx+R*Math.cos(a), cy+R*Math.sin(a)]; }",
"",
"/* Kreisbogen als Bezier: Punkte + Tangenten, Richtung ueber sw. */",
"function bg(cx,cy,R,a0,sw){",
"  var n = Math.max(1, Math.ceil(Math.abs(sw)/(Math.PI/2)));",
"  var st = sw/n;",
"  var h  = R*(4/3)*Math.tan(Math.abs(st)/4);",
"  var sg = (st<0) ? -1 : 1;",
"  var P=[], I=[], O=[], eD=[1,0], sD=[-1,0];",
"  for(var i=0;i<=n;i++){",
"    var a = a0 + st*i;",
"    var u = [-Math.sin(a)*sg, Math.cos(a)*sg];",
"    P.push(pol(cx,cy,R,a));",
"    O.push([ u[0]*h,  u[1]*h]);",
"    I.push([-u[0]*h, -u[1]*h]);",
"    if(i==0) sD=[-u[0],-u[1]];",
"    if(i==n) eD=u;",
"  }",
"  return {p:P,i:I,o:O,eP:P[n],eD:eD,sP:P[0],sD:sD};",
"}",
"",
"/* Bogen rueckwaerts durchlaufen (Tangenten tauschen). */",
"function rev(b){",
"  var P=[], I=[], O=[];",
"  for(var i=b.p.length-1;i>=0;i--){ P.push(b.p[i]); I.push(b.o[i]); O.push(b.i[i]); }",
"  return {p:P,i:I,o:O};",
"}",
"",
"function geo(){",
"  var T = Math.round(ev('Pfeil-Typ'));",
"  var L = Math.max(2, ev('Laenge'));",
"  var K = ev('Kruemmung');",
"  var P=[], I=[], O=[];",
"",
"  /* --- 2: Kreisbogen ------------------------------------------ */",
"  if(T==2){",
"    var A = Math.abs(K)/100*180;",
"    if(A < 1){ T = 1; }",
"    else{",
"      if(A > 350) A = 350;",
"      A = A*Math.PI/180;",
"      var s  = sgn(K);",
"      var R  = (L/2)/Math.sin(A/2);",
"      var d  = (L/2)/Math.tan(A/2);",
"      var cx = L/2, cy = -d;",
"      var a0 = Math.atan2(0-cy, 0-cx);",
"      var n  = Math.ceil(A/(Math.PI/2));",
"      var seg = -A/n;",
"      var h  = R*(4/3)*Math.tan(Math.abs(seg)/4);",
"      var eP=[L,0], eD=[1,0], sP=[0,0], sD=[-1,0];",
"      for(var i=0;i<=n;i++){",
"        var a  = a0 + seg*i;",
"        var pt = [ cx + R*Math.cos(a), -s*(cy + R*Math.sin(a)) ];",
"        var u  = nrm([ Math.sin(a), s*Math.cos(a) ]);",
"        P.push(pt);",
"        O.push([ u[0]*h,  u[1]*h]);",
"        I.push([-u[0]*h, -u[1]*h]);",
"        if(i==0){ sP=pt; sD=[-u[0],-u[1]]; }",
"        if(i==n){ eP=pt; eD=u; }",
"      }",
"      return res(P,I,O,false,eP,eD,sP,sD);",
"    }",
"  }",
"",
"  /* --- 3: S-Kurve --------------------------------------------- */",
"  if(T==3){",
"    var c = K/100*L*0.5;",
"    P=[[0,0],[L,0]];",
"    O=[[L*0.35,-c],[0,0]];",
"    I=[[0,0],[-L*0.35, c]];",
"    return res(P,I,O,false,[L,0],nrm([L*0.35,-c]),[0,0],nrm([-L*0.35,c]));",
"  }",
"",
"  /* --- 4: Winkel (90 Grad, Rundung ueber den RC-Filter) ------- */",
"  if(T==4){",
"    var H = K/100*L;",
"    if(Math.abs(H) < 1){ T = 1; }",
"    else{",
"      var sy = sgn(H), p2 = [L,-H];",
"      P=[[0,0],[L,0],p2];",
"      return res(P,zt(3),zt(3),false,p2,[0,-sy],[0,0],[-1,0]);",
"    }",
"  }",
"",
"  /* --- 5: Zickzack -------------------------------------------- */",
"  if(T==5){",
"    var nz = Math.max(2, Math.min(64, Math.round(ev('Segmente'))));",
"    var amp = K/100*L*0.25;",
"    P=[]; I=[]; O=[];",
"    for(var j=0;j<=nz;j++){",
"      var yy = 0;",
"      if(j>0 && j<nz) yy = (j%2==1) ? -amp : amp;",
"      P.push([j*L/nz, yy]); I.push([0,0]); O.push([0,0]);",
"    }",
"    var eD2 = nrm([P[nz][0]-P[nz-1][0], P[nz][1]-P[nz-1][1]]);",
"    var sD2 = nrm([P[0][0]-P[1][0], P[0][1]-P[1][1]]);",
"    return res(P,I,O,false,P[nz],eD2,P[0],sD2);",
"  }",
"",
"  /* --- 6: Welle (Sinus) --------------------------------------- */",
"  if(T==6){",
"    var nw = Math.max(1, Math.min(48, Math.round(ev('Segmente'))));",
"    var aw = K/100*L*0.25;",
"    if(Math.abs(aw) < 0.5){ T = 1; }",
"    else{",
"      var sw2 = L/nw;",
"      var hw  = sw2*0.4244;",
"      var m   = aw*Math.PI/sw2;",
"      P=[]; I=[]; O=[];",
"      var d0=[1,0], dn=[1,0];",
"      for(var jw=0;jw<=nw;jw++){",
"        var sl = -m*((jw%2==0) ? 1 : -1);",
"        P.push([jw*sw2, 0]);",
"        O.push([ hw,  sl*hw]);",
"        I.push([-hw, -sl*hw]);",
"        if(jw==0)  d0 = nrm([1, sl]);",
"        if(jw==nw) dn = nrm([1, sl]);",
"      }",
"      return res(P,I,O,false,P[nw],dn,P[0],[-d0[0],-d0[1]]);",
"    }",
"  }",
"",
"  /* --- 7: Stufe (rechtwinklige Treppe) ------------------------ */",
"  if(T==7){",
"    var ns = Math.max(1, Math.min(24, Math.round(ev('Segmente'))));",
"    var Hs = K/100*L;",
"    if(Math.abs(Hs) < 1){ T = 1; }",
"    else{",
"      var hx = L/(ns+1);",
"      P=[[0,0]];",
"      for(var is=1;is<=ns;is++){",
"        P.push([is*hx, -Hs*(is-1)/ns]);",
"        P.push([is*hx, -Hs*is/ns]);",
"      }",
"      P.push([L, -Hs]);",
"      return res(P,zt(P.length),zt(P.length),false,[L,-Hs],[1,0],[0,0],[-1,0]);",
"    }",
"  }",
"",
"  /* --- 8: U-Form (Ruecklauf) ---------------------------------- */",
"  if(T==8){",
"    var Hu = K/100*L;",
"    if(Math.abs(Hu) < 1){ T = 1; }",
"    else{",
"      P=[[0,0],[L,0],[L,-Hu],[0,-Hu]];",
"      return res(P,zt(4),zt(4),false,[0,-Hu],[-1,0],[0,0],[-1,0]);",
"    }",
"  }",
"",
"  /* --- 9: Kreispfeil ------------------------------------------ */",
"  if(T==9){",
"    var R9 = Math.max(2, L/2);",
"    var A9 = (90 + Math.min(100, Math.abs(K))/100*265)*Math.PI/180;",
"    var b9 = bg(R9, 0, R9, Math.PI, sgn(K)*A9);",
"    return res(b9.p, b9.i, b9.o, false, b9.eP, b9.eD, b9.sP, b9.sD);",
"  }",
"",
"  /* --- 10: Blockpfeil (geschlossener Koerper) ------------------ */",
"  if(T==10){",
"    var wb = Math.max(0.1, ev('Konturstaerke'));",
"    var hb = wb/2;",
"    var Lb = wb*Math.max(0.2, ev('Spitzen-Laenge'));",
"    var Wb = wb*Math.max(0.2, ev('Spitzen-Breite'))/2;",
"    var db = ev('Doppelspitze') ? 1 : 0;",
"    if(Lb*(1+db) > L*0.9) Lb = L*0.9/(1+db);",
"    if(Wb < hb*1.2) Wb = hb*1.2;",
"    var x0 = db ? Lb : 0;",
"    P = db ? [[0,0],[Lb,-Wb],[Lb,-hb]] : [[0,-hb]];",
"    P.push([L-Lb,-hb]); P.push([L-Lb,-Wb]); P.push([L,0]);",
"    P.push([L-Lb, Wb]); P.push([L-Lb, hb]);",
"    if(db){ P.push([Lb,hb]); P.push([Lb,Wb]); } else { P.push([x0,hb]); }",
"    return res(P,zt(P.length),zt(P.length),true,[L,0],[1,0],[0,0],[-1,0]);",
"  }",
"",
"  /* --- 11: Blockpfeil Bogen ----------------------------------- */",
"  if(T==11){",
"    var wc = Math.max(0.1, ev('Konturstaerke'));",
"    var hc = wc/2;",
"    var Lc = wc*Math.max(0.2, ev('Spitzen-Laenge'));",
"    var Wc = wc*Math.max(0.2, ev('Spitzen-Breite'))/2;",
"    var Ac = Math.abs(K)/100*180;",
"    if(Ac < 1) Ac = 1; if(Ac > 350) Ac = 350;",
"    Ac = Ac*Math.PI/180;",
"    var sc = sgn(K);",
"    var Rc = (L/2)/Math.sin(Ac/2);",
"    var dc = (L/2)/Math.tan(Ac/2);",
"    if(hc > Rc*0.8) hc = Rc*0.8;",
"    if(Wc < hc*1.2) Wc = hc*1.2;",
"    if(Wc > Rc*0.95) Wc = Rc*0.95;",
"    var cxc = L/2, cyc = sc*dc;",
"    var a0c = Math.atan2(-sc*dc, -L/2);",
"    var dbc = ev('Doppelspitze') ? 1 : 0;",
"    var dw  = Lc/Rc;",
"    if(dw*(1+dbc) > Ac*0.9) dw = Ac*0.9/(1+dbc);",
"    var asc = a0c + sc*dw*dbc;",
"    var aec = a0c + sc*(Ac - dw);",
"    var oB = bg(cxc, cyc, Rc+hc, asc, aec-asc);",
"    var iB = rev(bg(cxc, cyc, Rc-hc, asc, aec-asc));",
"    var no = oB.p.length-1, ni = iB.p.length-1;",
"    oB.i[0]=[0,0]; oB.o[no]=[0,0]; iB.i[0]=[0,0]; iB.o[ni]=[0,0];",
"    P=[]; I=[]; O=[];",
"    for(var ko=0;ko<=no;ko++){ P.push(oB.p[ko]); I.push(oB.i[ko]); O.push(oB.o[ko]); }",
"    P.push(pol(cxc,cyc,Rc+Wc,aec)); I.push([0,0]); O.push([0,0]);",
"    P.push(pol(cxc,cyc,Rc,a0c+sc*Ac)); I.push([0,0]); O.push([0,0]);",
"    P.push(pol(cxc,cyc,Rc-Wc,aec)); I.push([0,0]); O.push([0,0]);",
"    for(var ki=0;ki<=ni;ki++){ P.push(iB.p[ki]); I.push(iB.i[ki]); O.push(iB.o[ki]); }",
"    if(dbc){",
"      P.push(pol(cxc,cyc,Rc-Wc,asc)); I.push([0,0]); O.push([0,0]);",
"      P.push(pol(cxc,cyc,Rc,a0c));    I.push([0,0]); O.push([0,0]);",
"      P.push(pol(cxc,cyc,Rc+Wc,asc)); I.push([0,0]); O.push([0,0]);",
"    }",
"    return res(P,I,O,true,pol(cxc,cyc,Rc,a0c+sc*Ac),[1,0],pol(cxc,cyc,Rc,a0c),[-1,0]);",
"  }",
"",
"  /* --- 1: Gerade ---------------------------------------------- */",
"  P=[[0,0],[L,0]]; I=[[0,0],[0,0]]; O=[[0,0],[0,0]];",
"  return res(P,I,O,false,[L,0],[1,0],[0,0],[-1,0]);",
"}",
"",
"/* --- Pfad kuerzen ------------------------------------------------",
"   Der Pfad wird in Kubik-Segmente zerlegt, das Ende- bzw. Anfangs-",
"   segment per de Casteljau geteilt und wieder zusammengesetzt. Damit",
"   stimmt die Kurvenform exakt, es wird nichts verschoben. */",
"function sub(a,b){ return [a[0]-b[0], a[1]-b[1]]; }",
"function lrp(a,b,t){ return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t]; }",
"function dst(a,b){ var x=a[0]-b[0], y=a[1]-b[1]; return Math.sqrt(x*x+y*y); }",
"",
"function bzp(S,t){",
"  var a=lrp(S[0],S[1],t), b=lrp(S[1],S[2],t), c=lrp(S[2],S[3],t);",
"  var d=lrp(a,b,t), e=lrp(b,c,t), f=lrp(d,e,t);",
"  return { P:f, l:[S[0],a,d,f], r:[f,e,c,S[3]] };",
"}",
"",
"function slen(S){",
"  var L=0, pv=S[0];",
"  for(var k=1;k<=16;k++){ var q=bzp(S,k/16).P; L+=dst(q,pv); pv=q; }",
"  return L;",
"}",
"",
"/* Parameter t, an dem die Bogenlaenge D erreicht ist. */",
"function tAt(S,D){",
"  var acc=0, pv=S[0];",
"  for(var k=1;k<=48;k++){",
"    var q=bzp(S,k/48).P, l=dst(q,pv);",
"    if(acc+l>=D){ var f=(l>0.0001) ? (D-acc)/l : 0; return (k-1+f)/48; }",
"    acc+=l; pv=q;",
"  }",
"  return 1;",
"}",
"",
"function segs(g){",
"  var S=[];",
"  for(var i=0;i<g.p.length-1;i++){",
"    S.push([ g.p[i],",
"             [g.p[i][0]+g.o[i][0],     g.p[i][1]+g.o[i][1]],",
"             [g.p[i+1][0]+g.i[i+1][0], g.p[i+1][1]+g.i[i+1][1]],",
"             g.p[i+1] ]);",
"  }",
"  return S;",
"}",
"",
"function cutE(S,D){",
"  while(S.length>0){",
"    var s=S[S.length-1], L=slen(s);",
"    if(L<=D){ D-=L; S.pop(); }",
"    else { S[S.length-1]=bzp(s, tAt(s, L-D)).l; break; }",
"  }",
"  return S;",
"}",
"",
"function cutS(S,D){",
"  while(S.length>0){",
"    var s=S[0], L=slen(s);",
"    if(L<=D){ D-=L; S.shift(); }",
"    else { S[0]=bzp(s, tAt(s, D)).r; break; }",
"  }",
"  return S;",
"}",
"",
"function rb(S){",
"  var P=[], I=[], O=[], n=S.length;",
"  for(var j=0;j<=n;j++){",
"    P.push( (j<n) ? S[j][0] : S[n-1][3] );",
"    I.push( (j>0) ? sub(S[j-1][2], S[j-1][3]) : [0,0] );",
"    O.push( (j<n) ? sub(S[j][1], S[j][0])     : [0,0] );",
"  }",
"  return {p:P,i:I,o:O,c:false};",
"}",
"",
"/* Linienpfad inklusive Kuerzung an den Spitzen. */",
"function linie(){",
"  var g = geo();",
"  if(g.c) return g;                       /* Blockpfeil: Spitze ist im Pfad */",
"  var st = Math.round(ev('Spitzen-Stil'));",
"  if(st==2) return g;                     /* offene Spitze: Linie bis Scheitel */",
"  var w  = Math.max(0.1, ev('Konturstaerke'));",
"  var HL = w*Math.max(0.2, ev('Spitzen-Laenge'));",
"  var SB = Math.max(0.2, ev('Spitzen-Breite'));",
"  /* Ab HL/SB vom Scheitel ist die Spitze breiter als die Kontur; mit 15 %",
"     Zuschlag als Sicherheitsabstand. Nach hinten begrenzt die Kappe, bei",
"     der konkaven Spitze durch deren Einzug (0,65 x HL). */",
"  var dmax = (st==3) ? HL*0.55 : HL*0.9;",
"  var d = Math.min(dmax, Math.max(HL/SB*1.15, HL*0.5));",
"  var S = cutE(segs(g), d);",
"  if(ev('Doppelspitze')) S = cutS(S, d);",
"  if(S.length < 1) return g;",
"  return rb(S);",
"}",
"",
"function kopf(atEnd){",
"  var g  = geo();",
"  var w  = Math.max(0.1, ev('Konturstaerke'));",
"  var HL = w*Math.max(0.2, ev('Spitzen-Laenge'));",
"  var HW = w*Math.max(0.2, ev('Spitzen-Breite'))/2;",
"  var st = Math.round(ev('Spitzen-Stil'));",
"  var Q  = atEnd ? g.eP : g.sP;",
"  var u  = nrm(atEnd ? g.eD : g.sD);",
"  var nv = [-u[1], u[0]];",
"  var B  = [Q[0]-u[0]*HL, Q[1]-u[1]*HL];",
"  var A1 = [B[0]+nv[0]*HW, B[1]+nv[1]*HW];",
"  var C1 = [B[0]-nv[0]*HW, B[1]-nv[1]*HW];",
"  var pts, cl;",
"  if(st==2){ pts=[A1,Q,C1]; cl=false; }",
"  else if(st==3){ pts=[Q,A1,[B[0]+u[0]*HL*0.35, B[1]+u[1]*HL*0.35],C1]; cl=true; }",
"  else { pts=[Q,A1,C1]; cl=true; }",
"  return createPath(pts, zt(pts.length), zt(pts.length), cl);",
"}",
""
].join("\n");

var EXPR_LINIE      = LIB + "var g = linie();\ncreatePath(g.p, g.i, g.o, g.c);";
var EXPR_KOPF_ENDE  = LIB + "kopf(true);";
var EXPR_KOPF_START = LIB + "kopf(false);";
var EXPR_BREITE     = "Math.max(0, effect('Konturstaerke')(1).value)";
var EXPR_FARBE      = "effect('Farbe')(1).value";
var HEAD_PRE        = "var t = Math.round(effect('Pfeil-Typ')(1).value);\n"
                    + "var st = Math.round(effect('Spitzen-Stil')(1).value);\n"
                    + "var on = effect('Doppelspitze')(1).value;\n";
var EXPR_FILL_E     = HEAD_PRE + "(t<10 && st!=2) ? 100 : 0";
var EXPR_STRK_E     = HEAD_PRE + "(t<10 && st==2) ? 100 : 0";
var EXPR_FILL_S     = HEAD_PRE + "(t<10 && on && st!=2) ? 100 : 0";
var EXPR_STRK_S     = HEAD_PRE + "(t<10 && on && st==2) ? 100 : 0";
var EXPR_LIN_STRK   = "(Math.round(effect('Pfeil-Typ')(1).value) >= 10) ? 0 : 100";
var EXPR_LIN_FILL   = "(Math.round(effect('Pfeil-Typ')(1).value) >= 10) ? 100 : 0";
var EXPR_RUND       = "Math.max(0, effect('Rundung')(1).value)";

/* ================================================================
 * 3) Effekt-Regler anlegen
 * ================================================================ */

function addSlider(fx, name, val) {
    var e = fx.addProperty("ADBE Slider Control");
    e.name = name;
    setAny(propAny(e, ["ADBE Slider Control-0001", 1]), val);
    return e;
}

function addCheckbox(fx, name, val) {
    var e = fx.addProperty("ADBE Checkbox Control");
    e.name = name;
    setAny(propAny(e, ["ADBE Checkbox Control-0001", 1]), val ? 1 : 0);
    return e;
}

function addColor(fx, name, val) {
    var e = fx.addProperty("ADBE Color Control");
    e.name = name;
    setAny(propAny(e, ["ADBE Color Control-0001", 1]), val);
    return e;
}

/* Echtes Auswahlmenue auf der Ebene (Dropdown-Menue-Steuerung ab AE 17.0).
 *
 * setPropertyParameters() macht die Effekt-Referenz ungueltig und setzt den
 * Effektnamen auf den Vorgabewert zurueck. Jeder Zugriff ueber die alte
 * Referenz laeuft danach in "Object is invalid" - genau daran ist die alte
 * Fassung gescheitert und hat zusaetzlich zum verwaisten Menue noch einen
 * Schieberegler angelegt.
 *
 * Deshalb: Eintraege zuerst setzen, Effekt anschliessend ueber seinen Index
 * frisch aus der Effektliste holen, erst dann umbenennen und den Wert
 * setzen. Der Index wird vor dem Anlegen gemerkt, damit im Fehlerfall auch
 * ohne gueltige Referenz sauber aufgeraeumt werden kann. */
function addMenu(fx, name, items, def) {
    var idx = fx.numProperties + 1;
    try {
        var e = fx.addProperty("ADBE Dropdown Control");
        propAny(e, ["ADBE Dropdown Control-0001", 1]).setPropertyParameters(items);
        e = fx.property(idx);
        e.name = name;
        propAny(e, ["ADBE Dropdown Control-0001", 1]).setValue(def);
        return e;
    } catch (err) {
        try { fx.property(idx).remove(); } catch (e2) {}
        return addSlider(fx, name, def);
    }
}

/* ================================================================
 * 4) Shape-Bausteine
 *
 * Reihenfolge in den Gruppen (Index-Fallback, falls matchName in der
 * deutschen Version zickt):
 *   Kontur:   1 Modus | 2 Composite | 3 Farbe | 4 Deckkraft |
 *             5 Breite | 6 Linienende | 7 Ecken
 *   Fuellung: 1 Modus | 2 Composite | 3 Fuellregel | 4 Farbe | 5 Deckkraft
 * ================================================================ */

function addGroup(contents, name) {
    var g = contents.addProperty("ADBE Vector Group");
    g.name = name;
    return propAny(g, ["ADBE Vectors Group", "Inhalt", "Contents", 2]);
}

function addPath(grp, expr) {
    var sp = grp.addProperty("ADBE Vector Shape - Group");
    var p  = propAny(sp, ["ADBE Vector Shape", "Pfad", "Path"]);
    if (!p) p = propByType(sp, PropertyValueType.SHAPE);
    exprAny(p, expr);
    return p;
}

function addStroke(grp, opacityExpr) {
    var st  = grp.addProperty("ADBE Vector Graphic - Stroke");
    var col = propAny(st, ["ADBE Vector Stroke Color", 3]);
    if (!col) col = propByType(st, PropertyValueType.COLOR);
    exprAny(col, EXPR_FARBE);
    exprAny(propAny(st, ["ADBE Vector Stroke Width", 5]), EXPR_BREITE);
    if (opacityExpr) exprAny(propAny(st, ["ADBE Vector Stroke Opacity", 4]), opacityExpr);
    setAny(propAny(st, ["ADBE Vector Stroke Line Cap", 6]), 2);   /* rund */
    setAny(propAny(st, ["ADBE Vector Stroke Line Join", 7]), 2);  /* rund */
    return st;
}

/* Natives "Runde Ecken" - wirkt auf die Pfade oberhalb in der Gruppe,
   wird deshalb direkt hinter den Pfad gehaengt. */
function addRound(grp, expr) {
    var rc = null;
    try { rc = grp.addProperty("ADBE Vector Filter - RC"); } catch (e) { return null; }
    var r = propAny(rc, ["ADBE Vector RoundCorner Radius", 1]);
    exprAny(r, expr);
    return rc;
}

function addFill(grp, opacityExpr) {
    var fl  = grp.addProperty("ADBE Vector Graphic - Fill");
    var col = propAny(fl, ["ADBE Vector Fill Color", 4]);
    if (!col) col = propByType(fl, PropertyValueType.COLOR);
    exprAny(col, EXPR_FARBE);
    if (opacityExpr) exprAny(propAny(fl, ["ADBE Vector Fill Opacity", 5]), opacityExpr);
    return fl;
}

/* ================================================================
 * 5) Pfeil bauen
 * ================================================================ */

var TYP_NAMEN  = ["Gerade", "Bogen", "S-Kurve", "Winkel", "Zickzack",
                  "Welle", "Stufe", "U-Form", "Kreispfeil",
                  "Blockpfeil", "Blockpfeil Bogen"];
var TYP_KRUEMM = [0, 45, 45, 55, 45, 45, 60, 45, 85, 0, 45];
var TYP_SEG    = [4,  4,  4,  4,  5,  3,  1,  4,  4, 4,  4];
var TYP_RUND   = [0,  0,  0, 30,  0,  0, 30, 30,  0, 0,  0];
/* Spitzenmasse sind Faktoren x Konturstaerke - Blockpfeile haben einen
   viel dickeren Koerper und brauchen deshalb kleinere Faktoren. */
var TYP_SPL    = [4,  4,  4,  4,  4,  4,  4,  4,  4, 1.6, 1.6];
var TYP_SPB    = [3,  3,  3,  3,  3,  3,  3,  3,  3, 2.2, 2.2];
var STIL_NAMEN = ["Dreieck", "Offen (V)", "Konkav"];

/* Blockpfeile brauchen eine deutlich dickere Grundlinie. */
function istBlock(t) { return t >= 10; }

function bauePfeil(opt) {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        alert("Bitte zuerst eine Komposition oeffnen.");
        return null;
    }

    app.beginUndoGroup(SCRIPT_NAME + ": " + TYP_NAMEN[opt.typ - 1]);

    var lay = comp.layers.addShape();
    lay.name = "Pfeil " + TYP_NAMEN[opt.typ - 1];

    /* --- Regler --- */
    var fx = propAny(lay, ["ADBE Effect Parade", "Effekte", "Effects"]);
    addMenu(fx,   "Pfeil-Typ",      TYP_NAMEN, opt.typ);
    addSlider(fx, "Laenge",         opt.laenge);
    addSlider(fx, "Kruemmung",      TYP_KRUEMM[opt.typ - 1]);
    addSlider(fx, "Segmente",       TYP_SEG[opt.typ - 1]);
    addSlider(fx, "Rundung",        TYP_RUND[opt.typ - 1]);
    addSlider(fx, "Konturstaerke",  opt.breite);
    addMenu(fx,   "Spitzen-Stil",   STIL_NAMEN, opt.stil);
    addSlider(fx, "Spitzen-Laenge", TYP_SPL[opt.typ - 1]);
    addSlider(fx, "Spitzen-Breite", TYP_SPB[opt.typ - 1]);
    addCheckbox(fx, "Doppelspitze", opt.doppel);
    addColor(fx,  "Farbe",          [1, 1, 1, 1]);

    /* --- Geometrie (Spitzen liegen ueber der Linie) --- */
    var contents = propAny(lay, ["ADBE Root Vectors Group", "Inhalt", "Contents", 2]);

    var gEnde = addGroup(contents, "Spitze-Ende");
    addPath(gEnde, EXPR_KOPF_ENDE);
    addFill(gEnde, EXPR_FILL_E);
    addStroke(gEnde, EXPR_STRK_E);

    var gStart = addGroup(contents, "Spitze-Start");
    addPath(gStart, EXPR_KOPF_START);
    addFill(gStart, EXPR_FILL_S);
    addStroke(gStart, EXPR_STRK_S);

    var gLinie = addGroup(contents, "Linie");
    addPath(gLinie, EXPR_LINIE);
    addRound(gLinie, EXPR_RUND);
    addFill(gLinie, EXPR_LIN_FILL);
    var stL = addStroke(gLinie, EXPR_LIN_STRK);
    /* Stumpfe Kappe: eine runde Kappe wuerde um die halbe Konturstaerke
       ueber das Pfadende hinausragen und die Spitze vorne abstumpfen. */
    setAny(propAny(stL, ["ADBE Vector Stroke Line Cap", 6]), 1);

    /* --- Position mittig, Pfeil startet links --- */
    var tr  = propAny(lay, ["ADBE Transform Group", "Transformieren", "Transform"]);
    var pos = propAny(tr, ["ADBE Position", 2]);
    setAny(pos, [comp.width / 2 - opt.laenge / 2, comp.height / 2]);

    app.endUndoGroup();
    return lay;
}

/* ================================================================
 * 6) Oberflaeche
 * ================================================================ */

function buildUI(obj) {
    var w = (obj instanceof Panel)
        ? obj
        : new Window("palette", SCRIPT_NAME, undefined, { resizeable: true });

    w.orientation = "column";
    w.alignChildren = ["fill", "top"];
    w.spacing = 8;
    w.margins = 10;

    var gr = w.add("group");
    gr.orientation = "column";
    gr.alignChildren = ["left", "top"];
    gr.spacing = 4;

    function zeile(label) {
        var g = gr.add("group");
        g.alignChildren = ["left", "center"];
        var t = g.add("statictext", undefined, label);
        t.preferredSize.width = 74;
        return g;
    }

    var z0 = zeile("Pfeil-Typ");
    var dTyp = z0.add("dropdownlist", undefined, TYP_NAMEN);
    dTyp.selection = 0;
    dTyp.preferredSize.width = 132;

    var z1 = zeile("L\u00e4nge");
    var eLaenge = z1.add("edittext", undefined, "400");
    eLaenge.characters = 5;
    z1.add("statictext", undefined, "px");

    var z2 = zeile("Kontur");
    var eBreite = z2.add("edittext", undefined, "8");
    eBreite.characters = 5;
    z2.add("statictext", undefined, "px");

    /* Blockpfeile mit sinnvoller Koerperdicke vorbelegen. */
    dTyp.onChange = function () {
        var t = (dTyp.selection ? dTyp.selection.index : 0) + 1;
        eBreite.text = istBlock(t) ? "60" : "8";
    };

    var z3 = zeile("Spitzen-Stil");
    var dStil = z3.add("dropdownlist", undefined, STIL_NAMEN);
    dStil.selection = 0;
    dStil.preferredSize.width = 132;

    var z4 = zeile("");
    var cDoppel = z4.add("checkbox", undefined, "beidseitig");

    var btn = w.add("button", undefined, "Pfeil erstellen");
    btn.onClick = function () {
        var L = parseFloat(eLaenge.text);
        var B = parseFloat(eBreite.text);
        bauePfeil({
            typ:    (dTyp.selection  ? dTyp.selection.index  : 0) + 1,
            stil:   (dStil.selection ? dStil.selection.index : 0) + 1,
            laenge: (isNaN(L) || L < 2)  ? 400 : L,
            breite: (isNaN(B) || B <= 0) ? 8   : B,
            doppel: cDoppel.value
        });
    };

    var hint = w.add("statictext", undefined, "> Parameter auf Ebene einstellen");
    hint.alignment = ["left", "top"];

    w.layout.layout(true);
    w.layout.resize();
    w.onResizing = w.onResize = function () { this.layout.resize(); };
    return w;
}

var ui = buildUI(thisObj);
if (ui instanceof Window) { ui.center(); ui.show(); }

})(this);
