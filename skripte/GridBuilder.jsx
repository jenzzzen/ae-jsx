/**********************************************************************
 * GridBuilder.jsx  v3.4  -  parametrische Gestaltungsraster fuer AE
 * ---------------------------------------------------------------
 * Zwei Ebenenarten, jede traegt NUR die Regler, die sie braucht:
 *
 *   Raster       Typ wird im Panel gewaehlt ("Anlegen" / "Aendern").
 *                Aendern baut die ausgewaehlte Ebene in place um und
 *                uebernimmt gleichnamige Werte (Rand, Farbe, ...).
 *   Hilfsraster  Grundlinie | Karo | Punkte. Wird an ein Raster
 *                geparentet und liest dessen Satzspiegel (Index 1-4).
 *
 * Raster-Typen:
 *   1-4   Spalten, Zeilen, Modul, Quadratmodul
 *   5-8   Drittel, Goldener Schnitt, Goldene Spirale,
 *         Dynamische Symmetrie
 *   9-10  Isometrisch, Radial
 *   11-12 Progressiv (geometrisch, "Faktor"),
 *         Arithmetisch (fester "Zuwachs": 1, 2, 3, ...)
 *   13    Kanon (Van de Graaf): Diagonalen + abgeleiteter Satzspiegel
 *         (Textblock 2/3 x 2/3, Bundsteg 1/9)
 *   14    Hexagon: Wabenraster, wahlweise spitz oder flach
 *   15    Perspektive: Fluchtpunkt, Strahlen, Tiefenlinien (Faktor)
 *   16    Phyllotaxis: Punkte im goldenen Winkel (137,5 Grad)
 *   17    Konzentrisch: ineinander skalierte Rahmen
 * Alle Typen arbeiten im Satzspiegel (Komp minus Rand), Masse in px.
 * Rand 0 -> Raster reicht bis zum Kompositionsrand.
 *
 * Performance: Repeater statt Pfad-Pools, pro Expression nur der Code
 * des eigenen Typs, und posterizeTime: solange der Regler
 * "Animierbar" aus ist, rechnet jede Expression nur bei Aenderungen
 * statt pro Frame. Mit "Animierbar" wirken Keyframes auf allen
 * Reglern - dafuer wird pro Frame neu gerechnet.
 *
 * Regler-Indizes 1-4 (Rand l/r/o/u) sind auf jeder Raster-Ebene
 * gleich - das Hilfsraster liest sie ueber parent. Effekte daher
 * nur UNTEN anfuegen, nicht umsortieren.
 *
 * Datei bewusst komplett ASCII, Umlaute ueber \u-Escapes.
 **********************************************************************/

(function GridBuilder(thisObj) {

var SCRIPT_NAME = "GridBuilder";
var VERSION = "3.4";
var TAG = "GRIDGEN";

var TYPES = ["Spalten", "Zeilen", "Modul", "Quadratmodul", "Drittel",
             "Goldener Schnitt", "Goldene Spirale", "Dynamische Symmetrie",
             "Isometrisch", "Radial", "Progressiv", "Arithmetisch",
             "Kanon (Van de Graaf)", "Hexagon", "Perspektive",
             "Phyllotaxis", "Konzentrisch", "Diagonal", "Kreisraster",
             "Mondrian"];
var HR_TYPES = ["Grundlinie", "Karo", "Punkte", "Kreuze"];
var N_RINGS = 24, N_COLS = 24, N_RAYS = 36, N_DEPTH = 18, N_PHY = 144, N_MOND = 32;

/* Slot-Vorrat: nur so viele Pfade anlegen, wie der aktuelle Wert
   braucht, plus Reserve. Wer deutlich mehr einstellt, baut die Ebene
   einmal mit "\u00c4ndern" neu. */
function pool(v, max, min) {
    v = Math.ceil((Number(v) || 0) * 1.25) + 2;
    return Math.min(max, Math.max(min, v));
}
/* Typen, die ihre Linien aus full() in feste Slots zeichnen */
var SLOTS = { 5: 5, 6: 5, 7: 12, 8: 11, 13: 4 };

/* ================================================================
 * 1) Regler-Katalog
 * ================================================================ */

var CTRL = {
    RL: ["slider", "Rand links"],       RR: ["slider", "Rand rechts"],
    RO: ["slider", "Rand oben"],        RU: ["slider", "Rand unten"],
    SP: ["slider", "Spalten"],          ZE: ["slider", "Zeilen"],
    GX: ["slider", "Steg Spalten"],     GY: ["slider", "Steg Zeilen"],
    ST: ["slider", "Steg"],
    FL: ["check",  "Fl\u00e4chen"],
    SH: ["check",  "Spiegeln horizontal"], SV: ["check", "Spiegeln vertikal"],
    ZG: ["slider", "Zellgr\u00f6\u00dfe"], WI: ["angle", "Winkel"],
    RI: ["slider", "Ringe"],            SS: ["slider", "Strahlen"],
    DR: ["angle",  "Drehung"],          TL: ["slider", "Tiefenlinien"],
    FP: ["point",  "Fluchtpunkt"],      FT: ["check",  "Flach gedreht"],
    SE: ["slider", "Seed"],
    AN: ["slider", "Anzahl"],           FA: ["slider", "Faktor"],
    ZW: ["slider", "Zuwachs"],
    AZ: ["check",  "Als Zeilen"],       SY: ["check",  "Symmetrisch"],
    UM: ["check",  "Umkehren"],
    HA: ["slider", "Abstand"],          HV: ["slider", "Versatz"],
    HS: ["check",  "Im Satzspiegel"],   PG: ["slider", "Punktgr\u00f6\u00dfe"],
    AM: ["check",  "Animierbar"],
    RC: ["color",  "Farbe"],            LW: ["slider", "Linienst\u00e4rke"],
    FO: ["slider", "Fl\u00e4chen-Deckkraft"],
    OP: ["slider", "Deckkraft"]
};

/* Namen aus v1 (Umbau alter Ebenen) */
var ALIAS = {
    "Spalten (Strahlen)": "SP", "Zeilen (Ringe)": "ZE", "Rasterfarbe": "RC",
    "Faktor (Progressiv)": "FA", "Zellgr\u00f6\u00dfe (Isometrisch)": "ZG"
};
/* Wert uebernehmen, wenn der neue Regler anders heisst */
var FALLBACK = { ST: "GX", GX: "ST", AN: "SP", SS: "SP", RI: "ZE" };

var COMMON = ["RL", "RR", "RO", "RU"];   /* Index 1-4, fest */
var TYPE_KEYS = {
    1: ["SP", "GX", "FL"],
    2: ["ZE", "GY", "FL"],
    3: ["SP", "ZE", "GX", "GY", "FL"],
    4: ["SP", "ST", "FL"],
    5: [], 6: [],
    7: ["SH", "SV"],
    8: [],
    9: ["ZG", "WI"],
    10: ["RI", "SS", "DR"],
    11: ["AN", "FA", "ST", "AZ", "SY", "UM", "FL"],
    12: ["AN", "ZW", "ST", "AZ", "SY", "UM", "FL"],
    13: ["SH"],
    14: ["ZG", "FT"],
    15: ["SS", "TL", "FA", "FP"],
    16: ["AN", "PG"],
    17: ["AN", "FA"],
    18: ["ZG", "WI"],
    19: ["ZG"],
    20: ["AN", "SE", "FL"]
};

/* typabhaengige Startwerte, ueberschreiben defaults() */
var TYPE_DEF = {
    15: { SS: 16, TL: 8, FA: 1.3 },
    18: { WI: 45 },
    20: { AN: 8, SE: 1 },
    16: { AN: 89, PG: 4 },
    17: { AN: 6, FA: 1.25 }
};

function hasKey(list, k) { for (var i = 0; i < list.length; i++) if (list[i] === k) return true; return false; }

function rasterKeys(T) {
    var k = COMMON.concat(TYPE_KEYS[T]).concat(["RC", "LW"]);
    if (hasKey(TYPE_KEYS[T], "FL")) k.push("FO");
    k.push("OP");
    k.push("AM");
    return k;
}
function helpKeys(art, hasParent) {
    var k = ["HA", "HV"];
    if (hasParent) k.push("HS");
    k.push("RC");
    k.push(art >= 3 ? "PG" : "LW");
    if (art === 4) k.push("LW");
    k.push("OP");
    k.push("AM");
    return k;
}
function defaults(comp, role, T) {
    var W = comp.width, H = comp.height, s = Math.min(W, H), port = H > W;
    var gut = Math.max(8, Math.round(W * 0.0125));
    var d = {
        RL: Math.round(W * 0.05), RR: Math.round(W * 0.05),
        RO: Math.round(H * 0.05), RU: Math.round(H * 0.05),
        SP: port ? 4 : 12, ZE: port ? 8 : 6,
        GX: gut, GY: gut, ST: gut,
        FL: 1, SH: 0, SV: 0,
        ZG: Math.round(s / 18), WI: 30,
        RI: 6, SS: 12, DR: 0,
        AN: 6, FA: 1.25, ZW: 1, AZ: 0, SY: 0, UM: 0,
        HA: Math.max(4, Math.round(H / 90)), HV: 0, HS: 1, PG: 3,
        LW: Math.max(1, Math.round(s / 1080)), FO: 15, OP: 100, AM: 0
    };
    d.FT = 0; d.TL = 8; d.SE = 1; d.FP = [Math.round(W / 2), Math.round(H * 0.45)];
    d.RC = (role === "H") ? [0.55, 0.64, 0.72, 1] : [0, 0.75, 1, 1];
    /* Zellgroesse haengt vom Typ ab: Linienscharen fein, Waben und
       Kreise deutlich groeber, sonst wird das Bild zugepflastert */
    if (T === 14) d.ZG = Math.round(s / 10);
    if (T === 19) d.ZG = Math.round(s / 6);
    if (T && TYPE_DEF[T]) {
        var o = TYPE_DEF[T];
        for (var k in o) if (o.hasOwnProperty(k) && o[k] !== 0) d[k] = o[k];
    }
    return d;
}

/* ================================================================
 * 2) Expression-Bausteine  (ES3, laufen auch per eval im Skript)
 *    Platzhalter K?? -> Effekt-Index; fehlt der Regler -> 0 ->
 *    ev() liefert den Standardwert.
 * ================================================================ */

var F_EV = "function ev(k,d){if(k<1)return d;try{return effect(k)(1).value;}catch(e){return d;}}";

var F_CORE = [
F_EV,
"var W=thisComp.width,H=thisComp.height,OFF=-100000,ZZ=[[0,0],[0,0]];",
"function ln(a,b,c,d){return {p:[[a,b],[c,d]],i:[[0,0],[0,0]],o:[[0,0],[0,0]],c:false};}",
"function rc(x,y,w,h){return {p:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],i:[[0,0],[0,0],[0,0],[0,0]],o:[[0,0],[0,0],[0,0],[0,0]],c:true};}",
"function cnt(v,a,b){v=Math.round(v);return v<a?a:(v>b?b:v);}",
"function mk(it){if(!it)return createPath([[OFF,OFF],[OFF,OFF]],ZZ,ZZ,false);return createPath(it.p,it.i,it.o,it.c);}",
"function area(){var l=Math.max(0,ev(KRL,0)),r=Math.max(0,ev(KRR,0)),t=Math.max(0,ev(KRO,0)),u=Math.max(0,ev(KRU,0));",
"  return {x:l,y:t,w:Math.max(1,W-l-r),h:Math.max(1,H-t-u)};}",
"function frame(S){return rc(S.x,S.y,S.w,S.h);}"
].join("\n");

/* Typ 1-4: Spalten / Zeilen / Modul / Quadratmodul (Repeater) */
var F_REG = [
"function rg(){var S=area();",
"  var nc=(TT==2)?1:cnt(ev(KSP,12),1,48),nr=(TT==1)?1:cnt(ev(KZE,6),1,48);",
"  var gx=(TT==2)?0:Math.max(0,(TT==4)?ev(KST,0):ev(KGX,0));",
"  var gy=(TT==1)?0:((TT==4)?gx:Math.max(0,ev(KGY,0)));",
"  var cw=Math.max(0,(S.w-gx*(nc-1))/nc),rh;",
"  if(TT==4){rh=cw;nr=Math.min(200,Math.max(1,Math.floor((S.h+gy)/(cw+gy)+1e-6)));}",
"  else rh=Math.max(0,(S.h-gy*(nr-1))/nr);",
"  var y2=(TT==4)?S.y+nr*rh+(nr-1)*gy:S.y+S.h;",
"  return {S:S,nc:nc,nr:nr,cw:cw,rh:rh,gx:gx,gy:gy,x1:S.x,x2:S.x+S.w,y1:S.y,y2:y2};}"
].join("\n");

/* Typ 5/6: Drittel / Goldener Schnitt */
var F_THIRD = [
"function full(){var S=area(),a=(TT==5)?1/3:0.3819660113,L=[],i;",
"  var y1=S.y,y2=S.y+S.h,x1=S.x,x2=S.x+S.w;",
"  var X=[S.x+S.w*a,S.x+S.w*(1-a)],Y=[S.y+S.h*a,S.y+S.h*(1-a)];",
"  for(i=0;i<2;i++){L.push(ln(X[i],y1,X[i],y2));L.push(ln(x1,Y[i],x2,Y[i]));}",
"  L.push(frame(S));return L;}"
].join("\n");

/* Typ 7: Goldene Spirale */
var F_SPI = [
"function full(){var S=area(),P=1.6180339887,x=S.x,y=S.y,w=S.w,h=S.h,k=0.5523,st=(w<h)?1:0,ii=[[0,0]],oo=[],M=[];",
"  var pts=[st?[x,y]:[x,y+h]];",
"  for(var n=st;n<st+10;n++){var d=n%4,p0=pts[pts.length-1],c,p1,pw,ph;",
"    if(d==0){pw=w/P;M.push(ln(x+pw,y,x+pw,y+h));c=[x+pw,y+h];p1=[x+pw,y];x+=pw;w-=pw;}",
"    else if(d==1){ph=h/P;M.push(ln(x,y+ph,x+w,y+ph));c=[x,y+ph];p1=[x+w,y+ph];y+=ph;h-=ph;}",
"    else if(d==2){pw=w/P;M.push(ln(x+w-pw,y,x+w-pw,y+h));c=[x+w-pw,y];p1=[x+w-pw,y+h];w-=pw;}",
"    else{ph=h/P;M.push(ln(x,y+h-ph,x+w,y+h-ph));c=[x+w,y+h-ph];p1=[x,y+h-ph];h-=ph;}",
"    oo.push([k*(p1[0]-c[0]),k*(p1[1]-c[1])]);ii.push([k*(p0[0]-c[0]),k*(p0[1]-c[1])]);pts.push(p1);}",
"  oo.push([0,0]);M.push({p:pts,i:ii,o:oo,c:false});",
"  var fh=ev(KSH,0)>0.5,fv=ev(KSV,0)>0.5,sx=2*S.x+S.w,sy=2*S.y+S.h;",
"  for(var m=0;m<M.length;m++){var it=M[m];for(var j=0;j<it.p.length;j++){",
"    if(fh){it.p[j]=[sx-it.p[j][0],it.p[j][1]];it.i[j]=[-it.i[j][0],it.i[j][1]];it.o[j]=[-it.o[j][0],it.o[j][1]];}",
"    if(fv){it.p[j]=[it.p[j][0],sy-it.p[j][1]];it.i[j]=[it.i[j][0],-it.i[j][1]];it.o[j]=[it.o[j][0],-it.o[j][1]];}}}",
"  M.push(frame(S));return M;}"
].join("\n");

/* Typ 8: Dynamische Symmetrie */
var F_DYN = [
"function clip(px,py,ux,uy,x0,y0,x1,y1){var t0=-1e9,t1=1e9,d=[[ux,px,x0,x1],[uy,py,y0,y1]];",
"  for(var i=0;i<2;i++){var u=d[i][0],p=d[i][1];if(Math.abs(u)<1e-9){if(p<d[i][2]||p>d[i][3])return null;}",
"  else{var a=(d[i][2]-p)/u,b=(d[i][3]-p)/u;if(a>b){var q=a;a=b;b=q;}if(a>t0)t0=a;if(b<t1)t1=b;}}",
"  if(t1<=t0+1e-6)return null;return ln(px+ux*t0,py+uy*t0,px+ux*t1,py+uy*t1);}",
"function full(){var S=area(),x=S.x,y=S.y,w=S.w,h=S.h,X=x+w,Y=y+h,L=[ln(x,y,X,Y),ln(X,y,x,Y)];",
"  var r=[[X,y,-h,w],[x,Y,h,-w],[x,y,h,w],[X,Y,-h,-w]];",
"  for(var i=0;i<4;i++){var q=clip(r[i][0],r[i][1],r[i][2],r[i][3],x,y,X,Y);if(q)L.push(q);}",
"  var t1=w*w/(w*w+h*h),t2=1-t1;",
"  L.push(ln(x+w*t1,y,x+w*t1,Y));L.push(ln(x+w*t2,y,x+w*t2,Y));",
"  L.push(ln(x,y+h*t1,X,y+h*t1));L.push(ln(x,y+h*t2,X,y+h*t2));L.push(frame(S));return L;}"
].join("\n");

/* Typ 9: Isometrisch (3 Scharen per Repeater, Maske = Bereich) */
var F_ISO = [
"function io(){var S=area(),R=S,s=Math.max(2,ev(KZG,60)),a=Math.min(85,Math.max(5,ev(KWI,30)));",
"  var sv=s/(2*Math.sin(a*Math.PI/180));",
"  return {S:S,R:R,s:s,sv:sv,a:a,cx:R.x+R.w/2,cy:R.y+R.h/2,D:Math.sqrt(R.w*R.w+R.h*R.h)/2+Math.max(s,sv)};}"
].join("\n");

/* Typ 10: Radial */
var F_RAD = [
"function ci(cx,cy,r){var k=0.5523*r;return {p:[[cx,cy-r],[cx+r,cy],[cx,cy+r],[cx-r,cy]],i:[[-k,0],[0,-k],[k,0],[0,k]],o:[[k,0],[0,k],[-k,0],[0,-k]],c:true};}",
"function rd(){var S=area(),cx=S.x+S.w/2,cy=S.y+S.h/2,r=Math.min(S.w,S.h)/2;",
"  return {S:S,cx:cx,cy:cy,r:r,n:cnt(ev(KRI,6),0," + N_RINGS + ")};}"
].join("\n");

/* Typ 11/12: Progressiv (w = f^k) / Arithmetisch (w = 1 + k*z) */
var F_PRG = [
"function pr(){var S=area(),ax=ev(KAZ,0)>0.5,n=cnt(ev(KAN,6),1," + N_COLS + "),g=Math.max(0,ev(KST,0));",
"  var sym=ev(KSY,0)>0.5,rev=ev(KUM,0)>0.5,f=Math.max(0.05,ev(KFA,1.25)),z=Math.max(0,ev(KZW,1)),w=[],km=sym?Math.floor((n-1)/2):n-1,s=0,j;",
"  for(j=0;j<n;j++){var k=sym?Math.floor(Math.abs(j-(n-1)/2)):j;if(rev)k=km-k;var v=(TT==11)?Math.pow(f,k):Math.max(0.01,1+k*z);w.push(v);s+=v;}",
"  var fr=Math.max(0,(ax?S.h:S.w)-g*(n-1)),x=ax?S.y:S.x,R=[];",
"  for(j=0;j<n;j++){var d=fr*w[j]/s;R.push(ax?rc(S.x,x,S.w,d):rc(x,S.y,d,S.h));x+=d+g;}return R;}"
].join("\n");

/* Hilfsraster: Satzspiegel kommt ueber parent (Indizes 1-5) */
var F_HLP = [
"function pv(k,d){try{return thisLayer.parent.effect(k)(1).value;}catch(e){return d;}}",
"function hr(){var s=Math.max(2,ev(KHA,12)),S={x:0,y:0,w:W,h:H};",
"  if(ev(KHS,0)>0.5&&thisLayer.hasParent){",
"    var l=Math.max(0,pv(1,0)),r=Math.max(0,pv(2,0)),t=Math.max(0,pv(3,0)),u=Math.max(0,pv(4,0));",
"    S={x:l,y:t,w:Math.max(1,W-l-r),h:Math.max(1,H-t-u)};}",
"  var v=ev(KHV,0),o=((v%s)+s)%s,x0=S.x+o,y0=S.y+o;",
"  return {s:s,S:S,x0:x0,y0:y0,nx:Math.max(0,Math.floor((S.x+S.w-x0)/s+1e-4)+1),ny:Math.max(0,Math.floor((S.y+S.h-y0)/s+1e-4)+1)};}"
].join("\n");

/* Typ 13: Van-de-Graaf-Kanon - Diagonalen + abgeleiteter Satzspiegel */
var F_KAN = [
"function full(){var S=area(),fh=ev(KSH,0)>0.5,x=S.x,y=S.y,w=S.w,h=S.h;",
"  var tx=fh?(x+2*w/9):(x+w/9);",
"  return [frame(S),ln(x,y,x+w,y+h),ln(x+w,y,x,y+h),rc(tx,y+h/9,2*w/3,2*h/3)];}"
].join("\n");

/* Typ 14: Hexagon-Wabe (zwei versetzte Scharen per Repeater) */
var F_HEX = [
"function hx(){var S=area(),ft=ev(KFT,0)>0.5,m=Math.min(S.w,S.h);",
"  var c=Math.max(m/60,Math.max(8,ev(KZG,60))),R=c/Math.sqrt(3);",
"  var sx=ft?3*R:c,sy=ft?c:3*R,ox=ft?1.5*R:c/2,oy=ft?c/2:1.5*R;",
"  return {S:S,R:R,ft:ft,sx:sx,sy:sy,ox:ox,oy:oy,",
"    nx:Math.min(80,Math.ceil(S.w/sx)+2),ny:Math.min(80,Math.ceil(S.h/sy)+2)};}",
"function hex(cx,cy,R,ft){var p=[],z=[],i;",
"  for(i=0;i<6;i++){var a=((ft?0:30)+60*i)*Math.PI/180;p.push([cx+R*Math.cos(a),cy+R*Math.sin(a)]);z.push([0,0]);}",
"  return {p:p,i:z,o:z,c:true};}"
].join("\n");

/* Typ 15: Ein-Punkt-Perspektive */
var F_PSP = [
"function ps(){var S=area(),fp=ev(KFP,[W/2,H*0.45]);",
"  return {S:S,fx:fp[0],fy:fp[1],n:cnt(ev(KSS,16),2," + N_RAYS + "),m:cnt(ev(KTL,8),0," + N_DEPTH + "),f:Math.max(1.02,ev(KFA,1.3))};}",
"function full(){var q=ps(),S=q.S,L=[frame(S),ln(S.x,q.fy,S.x+S.w,q.fy)],i;",
"  for(i=0;i<=q.n;i++)L.push(ln(q.fx,q.fy,S.x+S.w*i/q.n,S.y+S.h));",
"  return L;}",
/* Grundlinie fuer die Tiefenstaffelung: breit genug, dass auch die
   vom Repeater verkleinerten Kopien noch ueber den Satzspiegel reichen */
"function base(){var q=ps(),S=q.S,b=S.y+S.h,x=S.w*Math.pow(q.f,q.m);",
"  return ln(q.fx-x,b,q.fx+x,b);}"
].join("\n");

/* Typ 16: Phyllotaxis - Punkte im goldenen Winkel */
var F_PHY = [
"function ph(){var S=area(),n=cnt(ev(KAN,89),1," + N_PHY + "),R=Math.min(S.w,S.h)/2;",
"  return {S:S,n:n,c:R/Math.sqrt(Math.max(1,n-1)),cx:S.x+S.w/2,cy:S.y+S.h/2};}",
"function pt(k){var q=ph();if(k>=q.n)return null;",
"  var a=k*137.507764*Math.PI/180,r=q.c*Math.sqrt(k),x=q.cx+r*Math.cos(a),y=q.cy+r*Math.sin(a);",
"  return ln(x,y,x+0.01,y);}"
].join("\n");

/* Typ 17: Konzentrische Rahmen (Repeater mit Skalierung) */
var F_CON = [
"function cn(){var S=area();return {S:S,n:cnt(ev(KAN,6),1,48),f:Math.max(1.02,ev(KFA,1.25)),cx:S.x+S.w/2,cy:S.y+S.h/2};}"
].join("\n");

/* Typ 18: Diagonalraster - eine Linienschar, frei im Winkel */
var F_DIA = [
"function dg(){var S=area(),s=Math.max(2,ev(KZG,60)),a=ev(KWI,45);",
"  return {S:S,s:s,a:a,cx:S.x+S.w/2,cy:S.y+S.h/2,D:Math.sqrt(S.w*S.w+S.h*S.h)/2+s};}"
].join("\n");

/* Typ 19: Kreisraster / Blume des Lebens - Kreise auf Dreiecksgitter */
var F_CIR = [
"function cg(){var S=area(),m=Math.min(S.w,S.h);",
"  var r=Math.max(m/40,Math.max(6,ev(KZG,180))/2),sx=r,sy=r*Math.sqrt(3);",
"  return {S:S,r:r,sx:sx,sy:sy,ox:r/2,oy:sy/2,",
"    nx:Math.min(60,Math.ceil(S.w/sx)+2),ny:Math.min(60,Math.ceil(S.h/sy)+2)};}"
].join("\n");

/* Typ 20: Mondrian - wiederholt wird das groesste Feld geteilt,
   reproduzierbar ueber "Seed" */
var F_MON = [
"function rnd(i){var x=Math.sin((i+1)*12.9898+ev(KSE,1)*78.233)*43758.5453;return x-Math.floor(x);}",
"function md(){var S=area(),n=cnt(ev(KAN,8),1," + (N_MOND - 1) + "),R=[{x:S.x,y:S.y,w:S.w,h:S.h}],i,j;",
"  for(i=0;i<n;i++){var bi=0,ba=-1;",
"    for(j=0;j<R.length;j++){var ar=R[j].w*R[j].h;if(ar>ba){ba=ar;bi=j;}}",
"    var r=R[bi],t=0.3+0.4*rnd(i+100),ver=(r.w>=r.h)?(rnd(i)<0.85):(rnd(i)<0.15);",
"    if(ver){var cw=r.w*t;R.splice(bi,1,{x:r.x,y:r.y,w:cw,h:r.h},{x:r.x+cw,y:r.y,w:r.w-cw,h:r.h});}",
"    else{var ch=r.h*t;R.splice(bi,1,{x:r.x,y:r.y,w:r.w,h:ch},{x:r.x,y:r.y+ch,w:r.w,h:r.h-ch});}}",
"  var L=[];for(i=0;i<R.length;i++)L.push(rc(R[i].x,R[i].y,R[i].w,R[i].h));return L;}",
"function full(){return md();}"
].join("\n");

function libFor(T) {
    var f;
    if (T <= 4) f = F_REG;
    else if (T <= 6) f = F_THIRD;
    else if (T === 7) f = F_SPI;
    else if (T === 8) f = F_DYN;
    else if (T === 9) f = F_ISO;
    else if (T === 10) f = F_RAD;
    else if (T <= 12) f = F_PRG;
    else if (T === 13) f = F_KAN;
    else if (T === 14) f = F_HEX;
    else if (T === 15) f = F_PSP;
    else if (T === 16) f = F_PHY;
    else if (T === 17) f = F_CON;
    else if (T === 18) f = F_DIA;
    else if (T === 19) f = F_CIR;
    else f = F_MON;
    return F_CORE + "\nvar TT=" + T + ";\n" + f;
}

/* ================================================================
 * 3) Helfer
 * ================================================================ */

function propAny(grp, keys) {
    if (!grp) return null;
    for (var i = 0; i < keys.length; i++) {
        try { var p = grp.property(keys[i]); if (p) return p; } catch (e) {}
    }
    return null;
}

function propByType(grp, type) {
    if (!grp) return null;
    for (var i = 1; i <= grp.numProperties; i++) {
        try { var p = grp.property(i); if (p.propertyValueType === type) return p; } catch (e) {}
    }
    return null;
}

function setAny(p, v, log, label) {
    try { p.setValue(v); return true; }
    catch (e) { if (log) log.push("SET " + label + ": " + e.toString()); return false; }
}

function exprAny(p, ex, log, label) {
    try {
        if (p && p.canSetExpression) { p.expression = ex; return true; }
        if (log) log.push("EXPR " + label + ": Eigenschaft nicht gefunden");
    } catch (e) { if (log) log.push("EXPR " + label + ": " + e.toString()); }
    return false;
}

function inject(src, K) {
    return src.replace(/\bK([A-Z]{2})\b/g, function (m, c) {
        return (K[c] === undefined) ? "0" : String(K[c]);
    });
}

/* ================================================================
 * 4) Regler anlegen / lesen
 * ================================================================ */

var FX_MN = {
    slider: ["ADBE Slider Control",   "ADBE Slider Control-0001"],
    check:  ["ADBE Checkbox Control", "ADBE Checkbox Control-0001"],
    color:  ["ADBE Color Control",    "ADBE Color Control-0001"],
    angle:  ["ADBE Angle Control",    "ADBE Angle Control-0001"],
    point:  ["ADBE Point Control",    "ADBE Point Control-0001"]
};

function keyOfName(n) {
    if (ALIAS[n]) return ALIAS[n];
    for (var k in CTRL) if (CTRL.hasOwnProperty(k) && CTRL[k][1] === n) return k;
    return null;
}

/* Werte der AE-API in eigene Zahlen kopieren - direkt weitergereicht
   sind sie nach dem Entfernen des Effekts ungueltig (setValue bricht ab). */
function plain(v) {
    if (v === undefined || v === null) return undefined;
    if (v instanceof Array) {
        var a = [];
        for (var i = 0; i < v.length; i++) { var n = Number(v[i]); if (isNaN(n)) return undefined; a.push(n); }
        return a;
    }
    var x = Number(v);
    return isNaN(x) ? undefined : x;
}

function usable(type, v) {
    if (v === undefined) return false;
    if (type === "color") return (v instanceof Array) && v.length >= 3;
    if (type === "point") return (v instanceof Array) && v.length >= 2;
    return !(v instanceof Array);
}

/* Liest alle bekannten Regler einer Ebene: {key: value} und {key: index} */
function readCtrls(lay) {
    var vals = {}, idx = {}, fx = lay.property("ADBE Effect Parade");
    for (var i = 1; i <= fx.numProperties; i++) {
        var e = fx.property(i), k = keyOfName(e.name);
        if (!k) continue;
        idx[k] = i;
        try {
            var v = plain(e.property(1).value);
            if (v !== undefined) vals[k] = v;
        } catch (x) {}
    }
    return { vals: vals, idx: idx };
}

/* AE merkt sich ausgewaehlte Eigenschaften ueber ihren Index. Wird eine
   davon entfernt, zeigt die Auswahl ins Leere und das naechste
   addProperty bricht mit "invalid index in indexed group" ab. Deshalb
   vor jedem Umbau die ganze Ebene abwaehlen. */
function deselectAll(lay) {
    function walk(g, depth) {
        if (!g || depth > 8) return;
        for (var i = 1; i <= g.numProperties; i++) {
            var p = null;
            try { p = g.property(i); } catch (e) { continue; }
            try { if (p.selected) p.selected = false; } catch (e) {}
            try { if (p.numProperties) walk(p, depth + 1); } catch (e) {}
        }
    }
    try { lay.selected = false; } catch (e) {}
    var mns = ["ADBE Effect Parade", "ADBE Root Vectors Group", "ADBE Mask Parade"];
    for (var m = 0; m < mns.length; m++) {
        try { walk(lay.property(mns[m]), 0); } catch (e) {}
    }
}

/* addProperty kann direkt nach Umbauten zicken - zweiter Versuch nach
   erneutem Abwaehlen, danach wird der Regler protokolliert uebersprungen. */
function addFxSafe(lay, mn, log, label) {
    for (var a = 0; a < 3; a++) {
        try { return lay.property("ADBE Effect Parade").addProperty(mn); }
        catch (e) {
            if (a === 2) { log.push("Regler '" + label + "' nicht angelegt: " + e.toString()); return null; }
            deselectAll(lay);
        }
    }
    return null;
}

function addCtrls(lay, keys, old, def, log, dropOld) {
    var K = {}, base = dropOld ? lay.property("ADBE Effect Parade").numProperties : 0;
    for (var i = 0; i < keys.length; i++) {
        var k = keys[i], type = CTRL[k][0], mn = FX_MN[type];
        /* Reihenfolge: alter Wert, Wert des gleichbedeutenden Reglers, Standard */
        var cand = [old ? old[k] : undefined, (old && FALLBACK[k]) ? old[FALLBACK[k]] : undefined, def[k]], v;
        for (var c = 0; c < cand.length; c++) {
            var t = plain(cand[c]);
            if (usable(type, t)) { v = t; break; }
        }
        if (v === undefined) { log.push("Kein g\u00fcltiger Wert f\u00fcr " + CTRL[k][1] + " - Regler bleibt auf 0."); v = 0; }
        if (type === "check") v = v ? 1 : 0;
        else if (type === "color") v = [v[0], v[1], v[2], 1];
        else if (type === "point") v = [v[0], v[1]];

        var fx = addFxSafe(lay, mn[0], log, CTRL[k][1]);
        if (!fx) continue;
        var index = fx.propertyIndex;
        var e = lay.property("ADBE Effect Parade").property(index);
        try { e.name = CTRL[k][1]; } catch (x) { log.push("Name " + k + ": " + x.toString()); }
        e = lay.property("ADBE Effect Parade").property(index);
        setAny(propAny(e, [mn[1], 1]), v, log, CTRL[k][1]);
        K[k] = index;
    }
    for (var d = base; d >= 1; d--) {
        try { lay.property("ADBE Effect Parade").property(d).remove(); }
        catch (x) { log.push("Alter Regler " + d + ": " + x.toString()); }
    }
    if (base) for (var kk in K) if (K.hasOwnProperty(kk)) K[kk] -= base;
    return K;
}

/* ================================================================
 * 5) Shape-Bausteine
 * ================================================================ */

function groupOf(lay, names) {
    var g = lay.property("ADBE Root Vectors Group");
    for (var i = 0; i < names.length; i++) {
        if (i > 0) g = propAny(g, ["ADBE Vectors Group", 2]);
        g = g.property(names[i]);
    }
    return g;
}
function contentsOf(lay, names) {
    if (!names.length) return lay.property("ADBE Root Vectors Group");
    return propAny(groupOf(lay, names), ["ADBE Vectors Group", 2]);
}

/* Gruppe anlegen; bei AE-Zicken zweiter Versuch nach Abwaehlen */
function addGroup(lay, parentNames, name, log) {
    for (var a = 0; a < 3; a++) {
        try {
            var g = contentsOf(lay, parentNames).addProperty("ADBE Vector Group");
            g.name = name;
            return;
        } catch (e) {
            if (a === 2) { if (log) log.push("Gruppe '" + name + "': " + e.toString()); return; }
            deselectAll(lay);
        }
    }
}

function groupTransform(lay, names, posEx, rotEx, log) {
    var t = propAny(groupOf(lay, names), ["ADBE Vector Transform Group"]);
    if (posEx) exprAny(propAny(t, ["ADBE Vector Position"]), posEx, log, names.join("/") + " Position");
    t = propAny(groupOf(lay, names), ["ADBE Vector Transform Group"]);
    if (rotEx) exprAny(propAny(t, ["ADBE Vector Rotation"]), rotEx, log, names.join("/") + " Drehung");
}

function addPathSlot(cont, name, ex, log) {
    var sp;
    try { sp = cont.addProperty("ADBE Vector Shape - Group"); }
    catch (e) { log.push("Pfad '" + name + "': " + e.toString()); return; }
    try { sp.name = name; } catch (e) {}
    var p = propAny(sp, ["ADBE Vector Shape", 2]);
    if (!p || p.propertyValueType !== PropertyValueType.SHAPE) p = propByType(sp, PropertyValueType.SHAPE);
    exprAny(p, ex, log, name);
}

function addStroke(cont, colEx, widEx, cap, dashed, log, label) {
    var st = cont.addProperty("ADBE Vector Graphic - Stroke");
    exprAny(propAny(st, ["ADBE Vector Stroke Color", 3]), colEx, log, label + " Farbe");
    exprAny(propAny(st, ["ADBE Vector Stroke Width", 5]), widEx, log, label + " Breite");
    if (cap) setAny(propAny(st, ["ADBE Vector Stroke Line Cap", 6]), cap, null, "");
    if (dashed) {
        try {
            var d = propAny(st, ["ADBE Vector Stroke Dashes"]);
            d.addProperty("ADBE Vector Stroke Dash 1");
            d = propAny(cont.property(cont.numProperties), ["ADBE Vector Stroke Dashes"]);
            d.addProperty("ADBE Vector Stroke Gap 1");
            d = propAny(cont.property(cont.numProperties), ["ADBE Vector Stroke Dashes"]);
            setAny(d.property("ADBE Vector Stroke Dash 1"), 10, null, "");
            setAny(d.property("ADBE Vector Stroke Gap 1"), 8, null, "");
        } catch (e) {}
    }
}

function addFill(cont, colEx, opEx, log, label) {
    var fl = cont.addProperty("ADBE Vector Graphic - Fill");
    exprAny(propAny(fl, ["ADBE Vector Fill Color", 4]), colEx, log, label + " Farbe");
    exprAny(propAny(fl, ["ADBE Vector Fill Opacity", 5]), opEx, log, label + " Deckkraft");
}

/* opt: {copies, offset, pos, rot, anchor, scale} - Expressions, pos Pflicht */
function addRepeater(cont, opt, log, label) {
    var rp = cont.addProperty("ADBE Vector Filter - Repeater");
    exprAny(propAny(rp, ["ADBE Vector Repeater Copies", 1]), opt.copies, log, label + " Kopien");
    rp = cont.property(cont.numProperties);
    if (opt.offset) exprAny(propAny(rp, ["ADBE Vector Repeater Offset", 2]), opt.offset, log, label + " Versatz");
    rp = cont.property(cont.numProperties);
    var tr = propAny(rp, ["ADBE Vector Repeater Transform", 4]);
    exprAny(propAny(tr, ["ADBE Vector Repeater Position", 2]), opt.pos, log, label + " Position");
    if (opt.rot) {
        rp = cont.property(cont.numProperties);
        tr = propAny(rp, ["ADBE Vector Repeater Transform", 4]);
        exprAny(propAny(tr, ["ADBE Vector Repeater Rotation", 4]), opt.rot, log, label + " Drehung");
    }
    if (opt.anchor) {
        rp = cont.property(cont.numProperties);
        tr = propAny(rp, ["ADBE Vector Repeater Transform", 4]);
        exprAny(propAny(tr, ["ADBE Vector Repeater Anchor", 1]), opt.anchor, log, label + " Anker");
    }
    if (opt.scale) {
        rp = cont.property(cont.numProperties);
        tr = propAny(rp, ["ADBE Vector Repeater Transform", 4]);
        exprAny(propAny(tr, ["ADBE Vector Repeater Scale", 3]), opt.scale, log, label + " Skalierung");
    }
}

/* ================================================================
 * 6) Ebenen bauen
 * ================================================================ */

/* Ohne "Animierbar" wird jede Expression eingefroren (nur Neuberechnung
   bei Aenderungen), mit "Animierbar" pro Frame ausgewertet - erst dann
   wirken Keyframes auf den Reglern. */
var PT = "posterizeTime((function(){try{return effect(KAM)(1).value>0.5;}catch(e){return false;}})()?1/thisComp.frameDuration:0);\n";

/* Formen und Masken loeschen - die Effekte bleiben vorerst stehen.
   AE verschluckt sich, wenn im selben Durchlauf erst alle Effekte
   entfernt und dann neue angelegt werden ("invalid index in indexed
   group"). addCtrls haengt die neuen deshalb hinten an und raeumt
   die alten erst danach weg. */
function clearLayer(lay) {
    deselectAll(lay);
    var mns = ["ADBE Root Vectors Group", "ADBE Mask Parade"];
    for (var i = 0; i < mns.length; i++) {
        var g = lay.property(mns[i]), guard = 0;
        while (g && g.numProperties > 0 && guard++ < 2000) {
            g.property(g.numProperties).remove();
            g = lay.property(mns[i]);
        }
    }
    try { lay.property("ADBE Transform Group").property("ADBE Opacity").expression = ""; } catch (e) {}
}

function newLayer(comp, name, label) {
    var lay = comp.layers.addShape();
    lay.name = name;
    try { lay.guideLayer = true; } catch (e) {}   /* wird nie gerendert */
    try { lay.label = label; } catch (e) {}
    var tg = lay.property("ADBE Transform Group");
    setAny(tg.property("ADBE Anchor Point"), [0, 0], null, "");
    setAny(tg.property("ADBE Position"), [0, 0], null, "");
    return lay;
}

function setOpacity(lay, K, log) {
    exprAny(lay.property("ADBE Transform Group").property("ADBE Opacity"),
        inject(PT + F_EV + "\nMath.max(0,Math.min(100,ev(KOP,100)));", K), log, "Deckkraft");
}

/* ---- Raster ---------------------------------------------------- */
/* aktueller Wert eines Reglers (fuer die Slot-Dimensionierung) */
function cv(lay, K, k, d) {
    try { return lay.property("ADBE Effect Parade").property(K[k]).property(1).value; }
    catch (e) { return d; }
}

/* Maske auf den Satzspiegel - schneidet Scharen zu, die ueber den
   Rand hinaus gezeichnet werden (Isometrisch, Hexagon, Diagonal, ...) */
function addAreaMask(lay, X, Y, log) {
    var m;
    try { m = lay.property("ADBE Mask Parade").addProperty("ADBE Mask Atom"); }
    catch (e) { log.push("Maske: " + e.toString()); return; }
    try { m.name = "Bereich"; } catch (e) {}
    var idx = lay.property("ADBE Mask Parade").numProperties;
    exprAny(propAny(lay.property("ADBE Mask Parade").property(idx), ["ADBE Mask Shape"]),
        X("var R=area(),Z=[[0,0],[0,0],[0,0],[0,0]];createPath([[R.x,R.y],[R.x+R.w,R.y],[R.x+R.w,R.y+R.h],[R.x,R.y+R.h]],Z,Z,true);"),
        log, "Maske");
    exprAny(propAny(lay.property("ADBE Mask Parade").property(idx), ["ADBE Mask Offset"]),
        Y("Math.max(1,ev(KLW,1));"), log, "Maske Ausweitung");
}

function buildRaster(lay, T, old, def, log) {
    lay.comment = TAG + "|R|" + T;
    lay.name = "Raster \u2013 " + TYPES[T - 1];
    var K = addCtrls(lay, rasterKeys(T), old, def, log, !!old);
    if (old) clearLayer(lay);          /* Formen erst jetzt, s. addCtrls */
    var LIB = libFor(T);
    function X(body) { return inject(PT + LIB + "\n" + body, K); }
    function Y(body) { return inject(PT + F_EV + "\n" + body, K); }
    var COL = Y("ev(KRC,[0,0.75,1,1]);"), WID = Y("Math.max(0,ev(KLW,1));");
    var c, j;

    if (T <= 4) {
        addGroup(lay, [], "Senkrecht", log);
        c = contentsOf(lay, ["Senkrecht"]);
        addPathSlot(c, "Kante links",  X("var g=rg();createPath([[g.S.x,g.y1],[g.S.x,g.y2]],ZZ,ZZ,false);"), log);
        addPathSlot(c, "Kante rechts", X("var g=rg();createPath([[g.S.x+g.cw,g.y1],[g.S.x+g.cw,g.y2]],ZZ,ZZ,false);"), log);
        addRepeater(contentsOf(lay, ["Senkrecht"]),
            { copies: X("rg().nc;"), pos: X("var g=rg();[g.cw+g.gx,0];") }, log, "Senkrecht");
        addStroke(contentsOf(lay, ["Senkrecht"]), COL, WID, 0, false, log, "Senkrecht");

        addGroup(lay, [], "Waagerecht", log);
        c = contentsOf(lay, ["Waagerecht"]);
        addPathSlot(c, "Kante oben",  X("var g=rg();createPath([[g.x1,g.S.y],[g.x2,g.S.y]],ZZ,ZZ,false);"), log);
        addPathSlot(c, "Kante unten", X("var g=rg();createPath([[g.x1,g.S.y+g.rh],[g.x2,g.S.y+g.rh]],ZZ,ZZ,false);"), log);
        addRepeater(contentsOf(lay, ["Waagerecht"]),
            { copies: X("rg().nr;"), pos: X("var g=rg();[0,g.rh+g.gy];") }, log, "Waagerecht");
        addStroke(contentsOf(lay, ["Waagerecht"]), COL, WID, 0, false, log, "Waagerecht");

        addGroup(lay, [], "Fl\u00e4chen", log);
        c = contentsOf(lay, ["Fl\u00e4chen"]);
        var rs = c.addProperty("ADBE Vector Shape - Rect");
        exprAny(propAny(rs, ["ADBE Vector Rect Size", 2]), X("var g=rg();ev(KFL,0)>0.5?[g.cw,g.rh]:[0,0];"), log, "Fl\u00e4che Gr\u00f6\u00dfe");
        rs = contentsOf(lay, ["Fl\u00e4chen"]).property(1);
        exprAny(propAny(rs, ["ADBE Vector Rect Position", 3]), X("var g=rg();[g.S.x+g.cw/2,g.S.y+g.rh/2];"), log, "Fl\u00e4che Position");
        addRepeater(contentsOf(lay, ["Fl\u00e4chen"]),
            { copies: X("ev(KFL,0)>0.5?rg().nc:0;"), pos: X("var g=rg();[g.cw+g.gx,0];") }, log, "Fl\u00e4chen X");
        addRepeater(contentsOf(lay, ["Fl\u00e4chen"]),
            { copies: X("ev(KFL,0)>0.5?rg().nr:0;"), pos: X("var g=rg();[0,g.rh+g.gy];") }, log, "Fl\u00e4chen Y");
        addFill(contentsOf(lay, ["Fl\u00e4chen"]), COL, Y("Math.max(0,Math.min(100,ev(KFO,15)));"), log, "Fl\u00e4chen");
    }
    else if (SLOTS[T] || T === 15 || T === 20) {
        var n = SLOTS[T];
        if (T === 15) n = 3 + pool(cv(lay, K, "SS", 16), N_RAYS, 6);        /* Rahmen, Horizont, Strahlen */
        if (T === 20) n = 1 + pool(cv(lay, K, "AN", 8), N_MOND, 4);
        addGroup(lay, [], "Linien", log);
        c = contentsOf(lay, ["Linien"]);
        for (j = 0; j < n; j++) addPathSlot(c, "L" + (j + 1), X("mk(full()[" + j + "]);"), log);
        addStroke(contentsOf(lay, ["Linien"]), COL, WID, 0, false, log, "Linien");
        if (T === 20)
            addFill(contentsOf(lay, ["Linien"]), COL,
                Y("ev(KFL,0)>0.5?Math.max(0,Math.min(100,ev(KFO,15))):0;"), log, "Felder");
        if (T === 15) {
            /* Tiefenlinien: eine Grundlinie, der Repeater staucht sie
               geometrisch auf den Fluchtpunkt zu (statt 18 Pfaden) */
            addGroup(lay, [], "Tiefe", log);
            addPathSlot(contentsOf(lay, ["Tiefe"]), "Grundlinie", X("mk(base());"), log);
            addRepeater(contentsOf(lay, ["Tiefe"]), {
                copies: X("ps().m;"),
                offset: "1;",
                pos:    "[0,0];",
                anchor: X("var q=ps();[q.fx,q.fy];"),
                scale:  X("var f=ps().f;[100/f,100/f];")
            }, log, "Tiefe");
            addStroke(contentsOf(lay, ["Tiefe"]), COL, WID, 0, false, log, "Tiefe");
            addAreaMask(lay, X, Y, log);
        }
    }
    else if (T === 9) {
        addGroup(lay, [], "Rahmen", log);
        addPathSlot(contentsOf(lay, ["Rahmen"]), "Rahmen", X("mk(frame(area()));"), log);
        addStroke(contentsOf(lay, ["Rahmen"]), COL, WID, 0, false, log, "Rahmen");
        var ROT = [X("90-io().a;"), X("io().a-90;"), null];
        for (var f = 0; f < 3; f++) {
            var gn = "Schar " + (f + 1), sp = (f < 2) ? "q.s" : "q.sv";
            addGroup(lay, [], gn, log);
            addPathSlot(contentsOf(lay, [gn]), "Linie", X("var q=io();createPath([[0,-q.D],[0,q.D]],ZZ,ZZ,false);"), log);
            addRepeater(contentsOf(lay, [gn]), {
                copies: X("var q=io();2*Math.ceil(q.D/" + sp + ")+1;"),
                offset: X("var q=io();-Math.ceil(q.D/" + sp + ");"),
                pos:    X("var q=io();[" + sp + ",0];")
            }, log, gn);
            addStroke(contentsOf(lay, [gn]), COL, WID, 0, false, log, gn);
            groupTransform(lay, [gn], X("var q=io();[q.cx,q.cy];"), ROT[f], log);
        }
        addAreaMask(lay, X, Y, log);
    }
    else if (T === 10) {
        addGroup(lay, [], "Rahmen", log);
        addPathSlot(contentsOf(lay, ["Rahmen"]), "Rahmen", X("mk(frame(area()));"), log);
        addStroke(contentsOf(lay, ["Rahmen"]), COL, WID, 0, false, log, "Rahmen");

        addGroup(lay, [], "Ringe", log);
        c = contentsOf(lay, ["Ringe"]);
        var nr = pool(cv(lay, K, "RI", 6), N_RINGS, 4);
        for (j = 1; j <= nr; j++)
            addPathSlot(c, "Ring " + j, X("var q=rd();mk(" + j + "<=q.n?ci(q.cx,q.cy,q.r*" + j + "/q.n):null);"), log);
        addStroke(contentsOf(lay, ["Ringe"]), COL, WID, 0, false, log, "Ringe");

        addGroup(lay, [], "Strahlen", log);
        addPathSlot(contentsOf(lay, ["Strahlen"]), "Strahl", X("createPath([[0,0],[0,-rd().r]],ZZ,ZZ,false);"), log);
        addRepeater(contentsOf(lay, ["Strahlen"]), {
            copies: X("cnt(ev(KSS,12),0,360);"),
            pos:    "[0,0];",
            rot:    X("360/cnt(ev(KSS,12),1,360);")
        }, log, "Strahlen");
        addStroke(contentsOf(lay, ["Strahlen"]), COL, WID, 0, false, log, "Strahlen");
        groupTransform(lay, ["Strahlen"], X("var q=rd();[q.cx,q.cy];"), Y("ev(KDR,0);"), log);
    }
    else if (T === 14) {
        addGroup(lay, [], "Rahmen", log);
        addPathSlot(contentsOf(lay, ["Rahmen"]), "Rahmen", X("mk(frame(area()));"), log);
        addStroke(contentsOf(lay, ["Rahmen"]), COL, WID, 0, false, log, "Rahmen");
        for (var hgi = 0; hgi < 2; hgi++) {
            var hn = "Waben " + (hgi + 1), off = (hgi === 0) ? "0,0" : "q.ox,q.oy";
            addGroup(lay, [], hn, log);
            addPathSlot(contentsOf(lay, [hn]), "Wabe",
                X("var q=hx(),o=[" + off + "];mk(hex(q.S.x+o[0]-q.sx,q.S.y+o[1]-q.sy,q.R,q.ft));"), log);
            addRepeater(contentsOf(lay, [hn]), { copies: X("hx().nx;"), pos: X("[hx().sx,0];") }, log, hn + " X");
            addRepeater(contentsOf(lay, [hn]), { copies: X("hx().ny;"), pos: X("[0,hx().sy];") }, log, hn + " Y");
            addStroke(contentsOf(lay, [hn]), COL, WID, 0, false, log, hn);
        }
        addAreaMask(lay, X, Y, log);
    }
    else if (T === 16) {
        addGroup(lay, [], "Rahmen", log);
        addPathSlot(contentsOf(lay, ["Rahmen"]), "Rahmen", X("mk(frame(area()));"), log);
        addStroke(contentsOf(lay, ["Rahmen"]), COL, WID, 0, false, log, "Rahmen");

        addGroup(lay, [], "Punkte", log);
        c = contentsOf(lay, ["Punkte"]);
        var np = pool(cv(lay, K, "AN", 89), N_PHY, 12);
        for (j = 0; j < np; j++) addPathSlot(c, "P" + (j + 1), X("mk(pt(" + j + "));"), log);
        addStroke(contentsOf(lay, ["Punkte"]), COL, Y("Math.max(1,ev(KPG,4));"), 2, false, log, "Punkte");
    }
    else if (T === 17) {
        addGroup(lay, [], "Rahmen", log);
        c = contentsOf(lay, ["Rahmen"]);
        var rk = c.addProperty("ADBE Vector Shape - Rect");
        exprAny(propAny(rk, ["ADBE Vector Rect Size", 2]), X("var q=cn();[q.S.w,q.S.h];"), log, "Rahmen Gr\u00f6\u00dfe");
        rk = contentsOf(lay, ["Rahmen"]).property(1);
        exprAny(propAny(rk, ["ADBE Vector Rect Position", 3]), X("var q=cn();[q.cx,q.cy];"), log, "Rahmen Position");
        addRepeater(contentsOf(lay, ["Rahmen"]), {
            copies: X("cn().n;"),
            pos:    "[0,0];",
            anchor: X("var q=cn();[q.cx,q.cy];"),
            scale:  X("var f=cn().f;[100/f,100/f];")
        }, log, "Rahmen");
        addStroke(contentsOf(lay, ["Rahmen"]), COL, WID, 0, false, log, "Rahmen");
    }
    else if (T === 18) {
        addGroup(lay, [], "Rahmen", log);
        addPathSlot(contentsOf(lay, ["Rahmen"]), "Rahmen", X("mk(frame(area()));"), log);
        addStroke(contentsOf(lay, ["Rahmen"]), COL, WID, 0, false, log, "Rahmen");

        addGroup(lay, [], "Schar", log);
        addPathSlot(contentsOf(lay, ["Schar"]), "Linie", X("var q=dg();createPath([[0,-q.D],[0,q.D]],ZZ,ZZ,false);"), log);
        addRepeater(contentsOf(lay, ["Schar"]), {
            copies: X("var q=dg();2*Math.ceil(q.D/q.s)+1;"),
            offset: X("var q=dg();-Math.ceil(q.D/q.s);"),
            pos:    X("[dg().s,0];")
        }, log, "Schar");
        addStroke(contentsOf(lay, ["Schar"]), COL, WID, 0, false, log, "Schar");
        groupTransform(lay, ["Schar"], X("var q=dg();[q.cx,q.cy];"), X("90-dg().a;"), log);
        addAreaMask(lay, X, Y, log);
    }
    else if (T === 19) {
        addGroup(lay, [], "Rahmen", log);
        addPathSlot(contentsOf(lay, ["Rahmen"]), "Rahmen", X("mk(frame(area()));"), log);
        addStroke(contentsOf(lay, ["Rahmen"]), COL, WID, 0, false, log, "Rahmen");
        for (var cgi = 0; cgi < 2; cgi++) {
            var cn2 = "Kreise " + (cgi + 1), cof = (cgi === 0) ? "0,0" : "q.ox,q.oy";
            addGroup(lay, [], cn2, log);
            c = contentsOf(lay, [cn2]);
            var el = c.addProperty("ADBE Vector Shape - Ellipse");
            exprAny(propAny(el, ["ADBE Vector Ellipse Size", 2]), X("var r=cg().r;[2*r,2*r];"), log, cn2 + " Gr\u00f6\u00dfe");
            el = contentsOf(lay, [cn2]).property(1);
            exprAny(propAny(el, ["ADBE Vector Ellipse Position", 3]),
                X("var q=cg(),o=[" + cof + "];[q.S.x+o[0]-q.sx,q.S.y+o[1]-q.sy];"), log, cn2 + " Position");
            addRepeater(contentsOf(lay, [cn2]), { copies: X("cg().nx;"), pos: X("[cg().sx,0];") }, log, cn2 + " X");
            addRepeater(contentsOf(lay, [cn2]), { copies: X("cg().ny;"), pos: X("[0,cg().sy];") }, log, cn2 + " Y");
            addStroke(contentsOf(lay, [cn2]), COL, WID, 0, false, log, cn2);
        }
        addAreaMask(lay, X, Y, log);
    }
    else {
        /* Spaltenrechtecke tragen Kontur und Flaeche zugleich */
        addGroup(lay, [], "Spalten", log);
        c = contentsOf(lay, ["Spalten"]);
        var ns = pool(cv(lay, K, "AN", 6), N_COLS, 4);
        for (j = 0; j < ns; j++) addPathSlot(c, "S" + (j + 1), X("mk(pr()[" + j + "]);"), log);
        addStroke(contentsOf(lay, ["Spalten"]), COL, WID, 0, false, log, "Spalten");
        addFill(contentsOf(lay, ["Spalten"]), COL,
            Y("ev(KFL,0)>0.5?Math.max(0,Math.min(100,ev(KFO,15))):0;"), log, "Spalten");
    }
    setOpacity(lay, K, log);
}

/* ---- Hilfsraster ----------------------------------------------- */
function buildHelp(lay, art, hasParent, old, def, log) {
    lay.comment = TAG + "|H|" + art;
    lay.name = "Hilfsraster \u2013 " + HR_TYPES[art - 1];
    var K = addCtrls(lay, helpKeys(art, hasParent), old, def, log, !!old);
    if (old) clearLayer(lay);
    var LIB = F_CORE + "\n" + F_HLP;
    function X(body) { return inject(PT + LIB + "\n" + body, K); }
    function Y(body) { return inject(PT + F_EV + "\n" + body, K); }
    var COL = Y("ev(KRC,[0.55,0.64,0.72,1]);"), WID = Y("Math.max(0,ev(KLW,1));");

    if (art === 1 || art === 2) {
        addGroup(lay, [], "Waagerecht", log);
        addPathSlot(contentsOf(lay, ["Waagerecht"]), "Linie",
            X("var g=hr();createPath([[g.S.x,g.y0],[g.S.x+g.S.w,g.y0]],ZZ,ZZ,false);"), log);
        addRepeater(contentsOf(lay, ["Waagerecht"]), { copies: X("hr().ny;"), pos: X("[0,hr().s];") }, log, "Waagerecht");
        addStroke(contentsOf(lay, ["Waagerecht"]), COL, WID, 0, false, log, "Waagerecht");
    }
    if (art === 2) {
        addGroup(lay, [], "Senkrecht", log);
        addPathSlot(contentsOf(lay, ["Senkrecht"]), "Linie",
            X("var g=hr();createPath([[g.x0,g.S.y],[g.x0,g.S.y+g.S.h]],ZZ,ZZ,false);"), log);
        addRepeater(contentsOf(lay, ["Senkrecht"]), { copies: X("hr().nx;"), pos: X("[hr().s,0];") }, log, "Senkrecht");
        addStroke(contentsOf(lay, ["Senkrecht"]), COL, WID, 0, false, log, "Senkrecht");
    }
    if (art === 4) {
        addGroup(lay, [], "Kreuze", log);
        var c = contentsOf(lay, ["Kreuze"]);
        addPathSlot(c, "waagerecht",
            X("var g=hr(),s=Math.max(2,ev(KPG,4));createPath([[g.x0-s,g.y0],[g.x0+s,g.y0]],ZZ,ZZ,false);"), log);
        addPathSlot(c, "senkrecht",
            X("var g=hr(),s=Math.max(2,ev(KPG,4));createPath([[g.x0,g.y0-s],[g.x0,g.y0+s]],ZZ,ZZ,false);"), log);
        addRepeater(contentsOf(lay, ["Kreuze"]), { copies: X("hr().nx;"), pos: X("[hr().s,0];") }, log, "Kreuze X");
        addRepeater(contentsOf(lay, ["Kreuze"]), { copies: X("hr().ny;"), pos: X("[0,hr().s];") }, log, "Kreuze Y");
        addStroke(contentsOf(lay, ["Kreuze"]), COL, Y("Math.max(0.5,ev(KLW,1));"), 0, false, log, "Kreuze");
    }
    if (art === 3) {
        addGroup(lay, [], "Punkte", log);
        addPathSlot(contentsOf(lay, ["Punkte"]), "Punkt",
            X("var g=hr();createPath([[g.x0,g.y0],[g.x0+0.01,g.y0]],ZZ,ZZ,false);"), log);
        addRepeater(contentsOf(lay, ["Punkte"]), { copies: X("hr().nx;"), pos: X("[hr().s,0];") }, log, "Punkte X");
        addRepeater(contentsOf(lay, ["Punkte"]), { copies: X("hr().ny;"), pos: X("[0,hr().s];") }, log, "Punkte Y");
        addStroke(contentsOf(lay, ["Punkte"]), COL, Y("Math.max(1,ev(KPG,3));"), 2, false, log, "Punkte");
    }
    setOpacity(lay, K, log);
}

/* ================================================================
 * 7) Rolle erkennen, Selbstdiagnose
 * ================================================================ */

/* -> {role:"R"|"H", a:Typ bzw. Art} oder null */
function roleOf(lay) {
    var c = "";
    try { c = lay.comment || ""; } catch (e) { return null; }
    if (c === TAG) {                       /* v1-Ebene */
        var t = 1;
        try {
            var fx = lay.property("ADBE Effect Parade");
            for (var i = 1; i <= fx.numProperties; i++)
                if (fx.property(i).name === "Raster-Typ") t = Math.round(fx.property(i).property(1).value);
        } catch (e) {}
        return { role: "R", a: t, legacy: true };
    }
    var p = c.split("|");
    if (p[0] !== TAG || p.length < 3) return null;
    return { role: p[1], a: parseInt(p[2], 10) };
}

/* mode "first": Auswahl, sonst oberste Ebene dieser Art.
   mode "unique": Auswahl, sonst nur wenn es genau eine gibt. */
function findRole(comp, role, mode) {
    var sel = comp.selectedLayers, i, r;
    for (i = 0; i < sel.length; i++) { r = roleOf(sel[i]); if (r && r.role === role) return sel[i]; }
    var hit = null, n = 0;
    for (i = 1; i <= comp.numLayers; i++) {
        r = roleOf(comp.layer(i));
        if (r && r.role === role) { n++; if (!hit) hit = comp.layer(i); }
    }
    if (mode === "unique" && n !== 1) return null;
    return hit;
}

function diagnose(lay, log) {
    var n = 0;
    function walk(g) {
        for (var i = 1; i <= g.numProperties && n < 8; i++) {
            var p = g.property(i);
            if (p.propertyType === PropertyType.PROPERTY) {
                try {
                    if (p.canSetExpression && p.expression !== "") {
                        var v = p.value;
                        if (p.expressionError && ("" + p.expressionError).length > 0) { log.push(p.name + " -> " + p.expressionError); n++; }
                    }
                } catch (e) {}
            } else walk(p);
        }
    }
    try { walk(lay); } catch (e) { log.push("Diagnose: " + e.toString()); }
}

function activeComp() {
    var comp = app.project.activeItem;
    if (!(comp && comp instanceof CompItem)) { alert("Bitte zuerst eine Komposition \u00f6ffnen."); return null; }
    return comp;
}

function status(txt) { try { if (UI && UI.stat) UI.stat.text = txt; } catch (e) {} }

function report(log) {
    if (log.length > 0)
        alert(SCRIPT_NAME + " " + VERSION + " - Diagnose:\n\n" + log.join("\n") +
              "\n\n(Bitte diese Meldung 1:1 zur\u00fcckmelden.)");
}

/* Gemeinsamer Rahmen fuer Anlegen/Aendern */
function run(label, fn) {
    var comp = activeComp(); if (!comp) return;
    var log = [];
    app.beginUndoGroup(SCRIPT_NAME + ": " + label);
    try { fn(comp, log); }
    catch (e) { log.push("ABBRUCH: " + e.toString() + (e.line ? (" (Zeile " + e.line + ")") : "")); }
    app.endUndoGroup();
    report(log);
}

function finish(comp, lay, log) {
    diagnose(lay, log);
    status(lay.name + "  \u00b7  " + comp.width + "\u00d7" + comp.height);
    for (var s = 1; s <= comp.numLayers; s++) comp.layer(s).selected = false;
    lay.selected = true;
}

/* ================================================================
 * 8) Aktionen
 * ================================================================ */

function actRaster(T, change) {
    run(TYPES[T - 1], function (comp, log) {
        var lay, old = null;
        if (change) {
            lay = findRole(comp, "R", "unique");
            if (!lay) { alert("Bitte die Raster-Ebene ausw\u00e4hlen, die ge\u00e4ndert werden soll."); return; }
            old = readCtrls(lay).vals;
            deselectAll(lay);
        } else lay = newLayer(comp, "Raster", 8);
        buildRaster(lay, T, old, defaults(comp, "R", T), log);
        finish(comp, lay, log);
    });
}

function actHelp(art, change) {
    run("Hilfsraster", function (comp, log) {
        var lay, old = null, par;
        if (change) {
            lay = findRole(comp, "H", "unique");
            if (!lay) { alert("Bitte die Hilfsraster-Ebene ausw\u00e4hlen, die ge\u00e4ndert werden soll."); return; }
            old = readCtrls(lay).vals;
            deselectAll(lay);
            par = lay.parent;
            if (!par) {                      /* nachtraeglich ans Raster koppeln */
                par = findRole(comp, "R", "first");
                if (par) {
                    try { lay.parent = par; } catch (e) { log.push("Parent: " + e.toString()); }
                    setAny(lay.property("ADBE Transform Group").property("ADBE Position"), [0, 0], log, "Position");
                }
            }
        } else {
            par = findRole(comp, "R", "first");
            lay = newLayer(comp, "Hilfsraster", 14);
            if (par) {
                try { lay.parent = par; } catch (e) { log.push("Parent: " + e.toString()); }
                var tg = lay.property("ADBE Transform Group");
                setAny(tg.property("ADBE Position"), [0, 0], log, "Position");
                try { lay.moveAfter(par); } catch (e) {}
            }
        }
        buildHelp(lay, art, !!par, old, defaults(comp, "H"), log);
        finish(comp, lay, log);
    });
}

/* ================================================================
 * 9) Oberflaeche
 * ================================================================ */

function prefGet(k, d) {
    try { if (app.settings.haveSetting(SCRIPT_NAME, k)) return parseInt(app.settings.getSetting(SCRIPT_NAME, k), 10) || d; }
    catch (e) {}
    return d;
}
function prefSet(k, v) { try { app.settings.saveSetting(SCRIPT_NAME, k, String(v)); } catch (e) {} }

function buildUI(obj) {
    var w = (obj instanceof Panel) ? obj
        : new Window("palette", SCRIPT_NAME + " " + VERSION, undefined, { resizeable: true });
    w.orientation = "column";
    w.alignChildren = ["fill", "top"];
    w.spacing = 8;
    w.margins = 10;

    function dim(txt) {
        try { txt.graphics.foregroundColor = txt.graphics.newPen(txt.graphics.PenType.SOLID_COLOR, [0.55, 0.55, 0.58, 1], 1); }
        catch (e) {}
        return txt;
    }
    function tab(parent, name) {
        var t = parent.add("tab", undefined, name);
        t.orientation = "column"; t.alignChildren = ["fill", "top"];
        t.spacing = 8; t.margins = [12, 14, 12, 12];
        return t;
    }
    function picker(parent, label, items, tip) {
        var g = parent.add("group");
        g.alignChildren = ["left", "center"]; g.spacing = 8;
        var t = g.add("statictext", undefined, label);
        t.preferredSize.width = 52;
        var d = g.add("dropdownlist", undefined, items);
        d.alignment = ["fill", "center"];
        /* ohne feste Hoehe zieht ScriptUI das Feld auf Listenhoehe auf */
        d.preferredSize.height = 22;
        d.maximumSize.height = 24;
        d.selection = 0;
        d.helpTip = tip;
        return d;
    }
    function bar(parent, a, b, tipA, tipB) {
        var g = parent.add("group");
        g.alignChildren = ["fill", "center"]; g.spacing = 6;
        var x = g.add("button", undefined, a), y = g.add("button", undefined, b);
        x.helpTip = tipA; y.helpTip = tipB;
        return [x, y];
    }
    function sel(d) { return (d.selection ? d.selection.index : 0) + 1; }

    var tp = w.add("tabbedpanel");
    tp.alignChildren = ["fill", "top"];
    tp.alignment = ["fill", "top"];

    /* --- Raster --- */
    var tR = tab(tp, "Raster");
    var dTyp = picker(tR, "Typ", TYPES, "Rastersystem; alle Werte danach in den Effekteinstellungen");
    dim(tR.add("statictext", undefined, "Satzspiegel = Komposition minus Rand."));
    var bR = bar(tR, "Anlegen", "\u00c4ndern",
        "Neue Raster-Ebene anlegen",
        "Ausgew\u00e4hlte Raster-Ebene auf diesen Typ umbauen (Werte bleiben)");

    /* --- Hilfsraster --- */
    var tH = tab(tp, "Hilfsraster");
    var dArt = picker(tH, "Art", HR_TYPES, "Zweites, feineres Raster \u00fcber dem Hauptraster");
    dim(tH.add("statictext", undefined, "Wird mit dem Raster verkn\u00fcpft und folgt dessen Rand."));
    var bH = bar(tH, "Anlegen", "\u00c4ndern",
        "Neue Hilfsraster-Ebene anlegen",
        "Ausgew\u00e4hlte Hilfsraster-Ebene umbauen (Werte bleiben)");

    /* --- Fusszeile --- */
    var foot = w.add("group");
    foot.alignChildren = ["left", "center"]; foot.spacing = 8; foot.margins = [2, 0, 2, 0];
    var stat = dim(foot.add("statictext", undefined, "bereit", { truncate: "end" }));
    stat.alignment = ["fill", "center"];
    dim(foot.add("statictext", undefined, "v" + VERSION));

    dTyp.selection = prefGet("typ", 1) - 1;
    dArt.selection = prefGet("art", 1) - 1;
    tp.selection   = prefGet("tab", 0);

    bR[0].onClick = function () { prefSet("typ", sel(dTyp)); actRaster(sel(dTyp), false); };
    bR[1].onClick = function () { prefSet("typ", sel(dTyp)); actRaster(sel(dTyp), true); };
    bH[0].onClick = function () { prefSet("art", sel(dArt)); actHelp(sel(dArt), false); };
    bH[1].onClick = function () { prefSet("art", sel(dArt)); actHelp(sel(dArt), true); };
    tp.onChange = function () { prefSet("tab", tp.selection ? tp.selection.index : 0); };

    UI = { win: w, stat: stat };

    w.layout.layout(true);
    w.layout.resize();
    w.onResizing = w.onResize = function () { this.layout.resize(); };
    return w;
}

var ui = buildUI(thisObj);
if (ui instanceof Window) { ui.center(); ui.show(); }

})(this);
