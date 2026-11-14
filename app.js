/* 一分钟，等一滴水
 * 一片水彩叶子，叶尖上的水慢慢聚起来，第 60 秒断开、落下、入水。
 * 画面全部用 canvas 现场画：叶子和水洼用"多层半透明形状叠加"的水彩画法。
 */
(function () {
  "use strict";

  var GROW_MS = 60000;      // 水滴长大的一分钟
  var END_DELAY = 2.6;      // 入水后多久出现结尾那句（秒）

  var canvas = document.getElementById("scene");
  var ctx = canvas.getContext("2d");
  var panelStart = document.getElementById("panel-start");
  var panelEnd = document.getElementById("panel-end");
  var panelIntro = document.getElementById("panel-intro");
  var introTimer = 0;
  var btnStart = document.getElementById("btn-start");
  var btnAgain = document.getElementById("btn-again");
  var countEl = document.getElementById("count");
  var countSpans = countEl.querySelectorAll("span");
  var countShown = -1, countFlip = 0;

  var W = 0, H = 0, DPR = 1;
  var leafLayer = null, pondLayer = null, reedLayer = null;
  var geo = null;

  // ——— 随机数（固定种子，画面每次一样）———
  function mulberry(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var rnd = mulberry(7);
  function gauss() {
    var u = 1 - rnd(), v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

  // ——— 水彩：把一个形状反复"揉"一揉，叠几十层很淡的颜色 ———
  function deform(pts, depth) {
    var p = pts;
    for (var d = 0; d < depth; d++) {
      var out = [];
      for (var i = 0; i < p.length; i++) {
        var a = p[i], b = p[(i + 1) % p.length];
        out.push(a);
        var len = Math.hypot(b.x - a.x, b.y - a.y);
        var v = (a.v + b.v) / 2;
        var ang = rnd() * Math.PI * 2;
        var mag = gauss() * len * v * 0.45;
        out.push({ x: (a.x + b.x) / 2 + Math.cos(ang) * mag, y: (a.y + b.y) / 2 + Math.sin(ang) * mag, v: v * (0.85 + rnd() * 0.3) });
      }
      p = out;
    }
    return p;
  }
  function fillPoly(c, p) {
    c.beginPath();
    c.moveTo(p[0].x, p[0].y);
    for (var i = 1; i < p.length; i++) c.lineTo(p[i].x, p[i].y);
    c.closePath();
    c.fill();
  }
  function bbox(p) {
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    p.forEach(function (q) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  // 水彩：分几组叠很淡的颜色；每组叠完，用柔软的随机斑块擦掉一部分
  // 这样颜色会有深有浅、像颜料在纸上流过，而不是一块平涂
  function wash(c, base, layers, colors, alpha, edgeAlpha, opts) {
    opts = opts || {};
    var groups = opts.groups || 6;
    var b = deform(base, 2);
    var box = bbox(base);
    var tmp = makeLayer(), t = tmp.c;
    var per = Math.ceil(layers / groups);
    for (var g = 0; g < groups; g++) {
      t.setTransform(1, 0, 0, 1, 0, 0);
      t.clearRect(0, 0, tmp.cv.width, tmp.cv.height);
      t.setTransform(DPR, 0, 0, DPR, 0, 0);
      var col = colors[g % colors.length];
      var lv = opts.layerV || 1;
      var bl = lv === 1 ? b : b.map(function (q) { return { x: q.x, y: q.y, v: q.v * lv }; });
      for (var i = 0; i < per; i++) {
        var p = deform(bl, 3);
        t.fillStyle = "rgba(" + col + "," + alpha + ")";
        fillPoly(t, p);
        if (edgeAlpha) {
          t.strokeStyle = "rgba(" + col + "," + edgeAlpha + ")";
          t.lineWidth = 1;
          t.stroke();
        }
      }
      t.globalCompositeOperation = "destination-out";
      var blots = opts.blots || 14;
      for (var k = 0; k < blots; k++) {
        var x = box.x + rnd() * box.w, y = box.y + rnd() * box.h;
        var r = Math.max(box.w, box.h) * (0.06 + rnd() * 0.16);
        var gr = t.createRadialGradient(x, y, 0, x, y, r);
        var a = 0.35 + rnd() * 0.5;
        gr.addColorStop(0, "rgba(0,0,0," + a + ")");
        gr.addColorStop(1, "rgba(0,0,0,0)");
        t.fillStyle = gr;
        t.fillRect(x - r, y - r, r * 2, r * 2);
      }
      t.globalCompositeOperation = "source-over";
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(tmp.cv, 0, 0);
      c.restore();
    }
  }

  function makeLayer() {
    var cv = document.createElement("canvas");
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    var c = cv.getContext("2d");
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    return { cv: cv, c: c };
  }

  // ——— 版面 ———
  function layout() {
    var m = Math.min(W, H);
    var tip = { x: W / 2, y: Math.round(H * 0.27) };
    var L = clamp(m * 0.78, 260, 520);
    var dir = { x: -0.74, y: -0.67 };
    var base = { x: tip.x + dir.x * L, y: tip.y + dir.y * L };
    var ctrl = { x: tip.x - 0.10 * L, y: tip.y - 0.52 * L };
    var lakeTop = Math.round(H * 0.70);
    var pondY = Math.round(H * 0.80);
    var rx = clamp(W * 0.5, 180, 520);
    return {
      tip: tip, L: L, base: base, ctrl: ctrl,
      leafW: L * 0.25,
      rMax: clamp(m * 0.034, 11, 24),
      pond: { x: W / 2, y: pondY, rx: rx, ry: rx * 0.15, top: lakeTop }
    };
  }

  function quad(a, c, b, s) {
    var u = 1 - s;
    return { x: u * u * a.x + 2 * u * s * c.x + s * s * b.x, y: u * u * a.y + 2 * u * s * c.y + s * s * b.y };
  }
  function quadTan(a, c, b, s) {
    var x = 2 * (1 - s) * (c.x - a.x) + 2 * s * (b.x - c.x);
    var y = 2 * (1 - s) * (c.y - a.y) + 2 * s * (b.y - c.y);
    var l = Math.hypot(x, y);
    return { x: x / l, y: y / l };
  }

  // 叶子：沿着中间那条叶脉，左右按宽度展开；叶尖保持尖，水才挂得住
  function leafOutline(g, half) {
    var N = 44, left = [], right = [];
    for (var i = 0; i <= N; i++) {
      var s = i / N;
      var m = quad(g.base, g.ctrl, g.tip, s);
      var t = quadTan(g.base, g.ctrl, g.tip, s);
      var n = { x: -t.y, y: t.x };
      var w = g.leafW * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.8)), 0.85) * (1 - 0.25 * s);
      var v = 0.04 + 0.26 * (1 - smooth(0.62, 0.97, s)); // 越靠叶尖越不揉，保住尖
      if (i === N) v = 0.0;
      left.push({ x: m.x + n.x * w, y: m.y + n.y * w, v: v });
      right.push({ x: m.x - n.x * w * 0.92, y: m.y - n.y * w * 0.92, v: v });
    }
    if (half === "shade") {
      var mid2 = [];
      for (var j2 = N; j2 >= 0; j2--) {
        var m2 = quad(g.base, g.ctrl, g.tip, j2 / N);
        mid2.push({ x: m2.x, y: m2.y, v: 0.12 });
      }
      return left.concat(mid2);
    }
    if (half === "light") {
      var mid = [];
      for (var j = N; j >= 0; j--) {
        var mm = quad(g.base, g.ctrl, g.tip, j / N);
        mid.push({ x: mm.x, y: mm.y, v: 0.12 });
      }
      return right.concat(mid);
    }
    return left.concat(right.reverse());
  }

  function paintLeaf() {
    var L = makeLayer(), c = L.c, g = geo;
    rnd = mulberry(11);
    // 叶柄：从画面外伸进来
    var stemEnd = { x: g.base.x - 0.35 * g.L * 0.74, y: g.base.y - 0.35 * g.L * 0.67 };
    c.strokeStyle = "rgba(96,104,66,0.55)";
    c.lineCap = "round";
    for (var k = 0; k < 3; k++) {
      c.lineWidth = 3.2 - k;
      c.beginPath();
      c.moveTo(stemEnd.x + gauss(), stemEnd.y + gauss());
      c.quadraticCurveTo((stemEnd.x + g.base.x) / 2 + 6, (stemEnd.y + g.base.y) / 2 - 4, g.base.x + gauss() * 0.5, g.base.y + gauss() * 0.5);
      c.stroke();
    }
    var outline = leafOutline(g);
    wash(c, outline, 48, ["104,138,74", "132,152,82", "86,120,78", "150,160,90", "96,128,92", "120,146,76"], 0.020, 0.008, { groups: 6, blots: 16 });
    // 背光的半边多一层冷绿
    wash(c, leafOutline(g, "shade"), 18, ["70,104,84", "84,112,80"], 0.018, 0, { groups: 2, blots: 10 });
    // 受光的半边，提亮一点
    c.globalCompositeOperation = "screen";
    wash(c, leafOutline(g, "light"), 14, ["236,230,172"], 0.03, 0, { groups: 2, blots: 10 });
    c.globalCompositeOperation = "source-over";
    // 叶脉
    c.lineCap = "round";
    c.strokeStyle = "rgba(246,242,220,0.38)";
    c.lineWidth = 1.4;
    c.beginPath();
    for (var i = 0; i <= 40; i++) {
      var s = 0.02 + i / 40 * 0.95;
      var p = quad(g.base, g.ctrl, g.tip, s);
      if (i === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x + gauss() * 0.3, p.y + gauss() * 0.3);
    }
    c.stroke();
    c.strokeStyle = "rgba(246,242,220,0.17)";
    c.lineWidth = 0.9;
    for (var v = 1; v <= 7; v++) {
      var s0 = v / 8.2;
      var m0 = quad(g.base, g.ctrl, g.tip, s0);
      var t0 = quadTan(g.base, g.ctrl, g.tip, s0);
      var n0 = { x: -t0.y, y: t0.x };
      var w0 = g.leafW * Math.pow(Math.sin(Math.PI * Math.pow(s0, 0.8)), 0.85) * (1 - 0.25 * s0) * 0.78;
      [1, -0.92].forEach(function (side) {
        c.beginPath();
        c.moveTo(m0.x, m0.y);
        c.quadraticCurveTo(m0.x + n0.x * w0 * 0.5 * side + t0.x * w0 * 0.15, m0.y + n0.y * w0 * 0.5 * side + t0.y * w0 * 0.15,
          m0.x + n0.x * w0 * side + t0.x * w0 * 0.45, m0.y + n0.y * w0 * side + t0.y * w0 * 0.45);
        c.stroke();
      });
    }
    return L.cv;
  }

  function ellipsePoly(cx, cy, rx, ry, n, v) {
    var p = [];
    for (var i = 0; i < n; i++) {
      var a = i / n * Math.PI * 2;
      p.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, v: v });
    }
    return p;
  }

  function bandPoly(x0, x1, y0, y1, n, vTop, vBottom) {
    var p = [], i;
    for (i = 0; i <= n; i++) p.push({ x: x0 + (x1 - x0) * i / n, y: y0, v: vTop });
    for (i = n; i >= 0; i--) p.push({ x: x0 + (x1 - x0) * i / n, y: y1, v: vBottom });
    return p;
  }

  // 湖：画在小一号的画布上再放大，边缘晕开，像湿画法
  function paintPond() {
    var P = geo.pond, k = 0.42, top = P.top;
    var saveDPR = DPR;
    DPR = saveDPR * k;
    var S = makeLayer(), c = S.c;
    rnd = mulberry(23);
    // 更远的一层山，几乎化在雾里
    wash(c, bandPoly(-W * 0.1, W * 1.1, top - H * 0.07, top - H * 0.01, 14, 0.7, 0.05), 18, ["176,188,182"], 0.014, 0, { groups: 2, blots: 8 });
    // 远处的对岸：很淡的一道青灰
    wash(c, bandPoly(-W * 0.1, W * 1.1, top - H * 0.035, top + 2, 16, 0.5, 0.05), 24, ["150,166,160", "166,176,166"], 0.016, 0, { groups: 3, blots: 10 });
    // 湖面：从远到近慢慢变深（不分层，不拼接）
    var gLake = c.createLinearGradient(0, top, 0, H);
    gLake.addColorStop(0, "rgba(186,208,200,0.55)");
    gLake.addColorStop(0.35, "rgba(150,184,180,0.62)");
    gLake.addColorStop(1, "rgba(112,154,158,0.72)");
    c.fillStyle = gLake;
    fillPoly(c, deform(bandPoly(-W * 0.1, W * 1.1, top, H * 1.05, 18, 0.07, 0.05), 3));
    // 上面再叠一层斑驳的水彩，让湖面有深有浅
    wash(c, bandPoly(-W * 0.1, W * 1.1, top + 3, H * 1.05, 18, 0.04, 0.1), 30, ["120,160,160", "140,176,172", "108,148,152"], 0.010, 0, { groups: 5, blots: 14 });
    // 远处贴着对岸，一条更亮的水线
    var gEdge = c.createLinearGradient(0, top, 0, top + (H - top) * 0.18);
    gEdge.addColorStop(0, "rgba(246,244,232,0.45)");
    gEdge.addColorStop(1, "rgba(246,244,232,0)");
    c.fillStyle = gEdge;
    c.fillRect(-W * 0.1, top, W * 1.2, (H - top) * 0.18);
    // 远山倒映在湖里：上下翻转、淡一点、横着有一点水波的错动
    (function () {
      var hillsH = H * 0.075;
      var src = makeLayer(), sc = src.c;
      rnd = mulberry(41);
      wash(sc, bandPoly(-W * 0.1, W * 1.1, top - hillsH, top + 2, 16, 0.6, 0.05), 20, ["150,170,166", "160,178,170"], 0.016, 0, { groups: 2, blots: 8 });
      var sy0 = Math.round((top - hillsH) * DPR), sh = Math.round(hillsH * DPR);
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalAlpha = 0.45;
      for (var y = 0; y < sh; y += 2) {
        var off = Math.sin(y * 0.35) * 1.5 * (y / sh) * DPR;
        c.drawImage(src.cv, 0, sy0 + sh - y - 2, src.cv.width, 2, off, Math.round(top * DPR) + y + 2, src.cv.width, 2);
      }
      c.restore();
    })();
    c.globalCompositeOperation = "source-over";
    // 留白：只在最两端和湖的下方慢慢淡进纸里（远山保留）
    c.globalCompositeOperation = "destination-in";
    var gx = c.createLinearGradient(0, 0, W, 0);
    gx.addColorStop(0, "rgba(0,0,0,0.25)");
    gx.addColorStop(0.07, "rgba(0,0,0,1)");
    gx.addColorStop(0.93, "rgba(0,0,0,1)");
    gx.addColorStop(1, "rgba(0,0,0,0.25)");
    c.fillStyle = gx;
    c.fillRect(0, 0, W, H);
    var gy = c.createLinearGradient(0, 0, 0, H);
    var tt = top / H;
    gy.addColorStop(0, "rgba(0,0,0,1)");
    gy.addColorStop(Math.min(0.99, tt + (1 - tt) * 0.6), "rgba(0,0,0,1)");
    gy.addColorStop(1, "rgba(0,0,0,0.2)");
    c.fillStyle = gy;
    c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = "source-over";
    DPR = saveDPR;
    var L = makeLayer();
    L.c.setTransform(1, 0, 0, 1, 0, 0);
    L.c.imageSmoothingEnabled = true;
    L.c.imageSmoothingQuality = "high";
    L.c.drawImage(S.cv, 0, 0, L.cv.width, L.cv.height);
    return L.cv;
  }

  // 近处的芦苇：几根细细弯弯的笔触，带一点穗
  function paintReeds() {
    var L = makeLayer(), c = L.c, P = geo.pond;
    rnd = mulberry(57);
    function reed(x, h, bend, w, col) {
      var steps = 24, pts = [];
      for (var i = 0; i <= steps; i++) {
        var t = i / steps;
        pts.push({ x: x + bend * t * t * h, y: H + 4 - t * h });
      }
      c.strokeStyle = col;
      c.lineCap = "round";
      for (var k = 0; k < 2; k++) {
        c.lineWidth = w * (1 - k * 0.4);
        c.beginPath();
        pts.forEach(function (p, i) { if (i === 0) c.moveTo(p.x + gauss() * 0.3, p.y); else c.lineTo(p.x + gauss() * 0.25, p.y); });
        c.stroke();
      }
      return pts[pts.length - 1];
    }
    var base = H - P.top;
    var groups = [[W * 0.03, 1], [W * 0.95, -1]];
    groups.forEach(function (g, gi) {
      var n = gi === 0 ? 7 : 5;
      for (var i = 0; i < n; i++) {
        var x = g[0] + (rnd() - 0.3) * W * 0.07 * g[1];
        var h = base * (0.35 + rnd() * 0.55);
        var bend = (0.05 + rnd() * 0.12) * g[1] * (rnd() < 0.2 ? -1 : 1);
        var col = "rgba(" + (88 + Math.round(rnd() * 30)) + "," + (100 + Math.round(rnd() * 20)) + ",68," + (0.35 + rnd() * 0.25).toFixed(2) + ")";
        var top = reed(x, h, bend, 1.4 + rnd() * 1.2, col);
        if (rnd() < 0.5) {
          // 穗
          c.fillStyle = "rgba(150,128,90,0.35)";
          c.beginPath();
          c.ellipse(top.x, top.y + 6, 2.2, 9, bend * 0.6, 0, Math.PI * 2);
          c.fill();
        }
      }
    });
    return L.cv;
  }

  // ——— 状态 ———
  var state = "idle";       // idle / grow / fall / end
  var growMs = 0;
  var fallT = 0;            // 断开后过了多少秒
  var lastStamp = 0;
  var sway = 0;
  var endShown = false;
  var splash = null;
  var qaFreeze = false;

  // 风：平时轻轻晃；偶尔来一阵，晃得大一点，再慢慢停
  function swayAngle(time) {
    var t = time / 1000;
    var calm = 0.010 * Math.sin(t * 0.55) + 0.005 * Math.sin(t * 1.37 + 1.3) + 0.002 * Math.sin(t * 3.9 + 0.4);
    var gustPhase = (t % 11) / 11;                       // 大约每 11 秒一阵风
    var gust = 0.022 * Math.sin(Math.PI * smooth(0, 0.35, gustPhase)) * Math.exp(-6 * Math.max(0, gustPhase - 0.18)) * Math.sin(t * 2.1);
    return calm + gust;
  }
  function rotate(p, o, a) {
    var s = Math.sin(a), c = Math.cos(a), dx = p.x - o.x, dy = p.y - o.y;
    return { x: o.x + dx * c - dy * s, y: o.y + dx * s + dy * c };
  }

  // ——— 水滴 ———
  // 挂着的时候：上窄下圆。f = 0..1 是这一分钟走了多少
  function hangingShape(T, f) {
    var R = geo.rMax;
    var vol = 0.02 + 0.98 * f;                  // 体积差不多匀速增加
    var r = R * Math.pow(vol, 1 / 3);           // 半径按立方根长
    var neck = smooth(0.80, 1.0, f);            // 最后十几秒，脖子拉出来
    var neckL = r * (0.15 + 1.05 * neck * neck);
    var nw = r * (0.40 - 0.32 * neck);
    var cy = T.y + neckL + r * 0.80;
    return { r: r, nw: nw, neckL: neckL, c: { x: T.x, y: cy }, sx: 1, sy: 1 + 0.06 * f };
  }

  function dropPath(T, s) {
    var C = s.c, r = s.r;
    var p = new Path2D();
    var up = s.r * 0.22;                        // 水往上包住一点叶尖
    p.moveTo(T.x, T.y - up);
    p.quadraticCurveTo(T.x - s.nw * 0.6, T.y - up * 0.6, T.x - s.nw, T.y);
    p.bezierCurveTo(T.x - s.nw * 0.9, T.y + s.neckL * 0.7, C.x - r, C.y - r * 0.95, C.x - r, C.y);
    p.arc(C.x, C.y, r, Math.PI, 0, true);
    p.bezierCurveTo(C.x + r, C.y - r * 0.95, T.x + s.nw * 0.9, T.y + s.neckL * 0.7, T.x + s.nw, T.y);
    p.quadraticCurveTo(T.x + s.nw * 0.6, T.y - up * 0.6, T.x, T.y - up);
    p.closePath();
    return p;
  }

  function ballPath(C, r, sx, sy) {
    var p = new Path2D();
    p.ellipse(C.x, C.y, r * sx, r * sy, 0, 0, Math.PI * 2);
    return p;
  }

  // 画一滴透明的水：几乎没颜色，透出颠倒的叶绿，一个小高光，边上一圈细深色
  function paintWater(path, C, r, sx, sy) {
    ctx.save();
    ctx.clip(path);
    var top = C.y - r * sy * 1.8, bot = C.y + r * sy;
    ctx.fillStyle = "rgba(236,242,240,0.10)";
    ctx.fill(path);
    // 透镜：上面的叶子，在水滴下半部颠倒出现
    var gL = ctx.createLinearGradient(0, bot, 0, C.y - r * 0.2);
    gL.addColorStop(0, "rgba(92,126,74,0.50)");
    gL.addColorStop(0.45, "rgba(118,146,90,0.20)");
    gL.addColorStop(1, "rgba(120,148,92,0)");
    ctx.fillStyle = gL;
    ctx.fillRect(C.x - r * 2, top, r * 4, bot - top + 2);
    // 边缘：越靠边越暗（不是描一条线），靠光一侧上方再深一点，像水彩画里那道弯月影
    var rr = r * Math.max(sx, sy);
    var gE = ctx.createRadialGradient(C.x - r * 0.08 * sx, C.y + r * 0.10 * sy, rr * 0.55, C.x, C.y, rr * 1.02);
    gE.addColorStop(0, "rgba(70,92,98,0)");
    gE.addColorStop(0.75, "rgba(70,92,98,0.10)");
    gE.addColorStop(1, "rgba(62,84,92,0.34)");
    ctx.fillStyle = gE;
    ctx.fillRect(C.x - r * 2, C.y - r * 2, r * 4, r * 4);
    // 背光一侧下方，光被聚起来的一小块亮
    var gC = ctx.createRadialGradient(C.x - r * 0.32 * sx, C.y + r * 0.5 * sy, 0, C.x - r * 0.32 * sx, C.y + r * 0.5 * sy, r * 0.38);
    gC.addColorStop(0, "rgba(255,253,240,0.45)");
    gC.addColorStop(1, "rgba(255,253,240,0)");
    ctx.fillStyle = gC;
    ctx.fillRect(C.x - r * 2, C.y - r * 2, r * 4, r * 4);
    ctx.restore();
    // 轮廓：细，越靠边越暗
    ctx.strokeStyle = "rgba(78,98,104,0.16)";
    ctx.lineWidth = 0.6;
    ctx.stroke(path);
    // 高光：小、亮、边缘清楚
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.ellipse(C.x + r * 0.36 * sx, C.y - r * 0.38 * sy, Math.max(1.2, r * 0.17), Math.max(0.9, r * 0.11), -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.beginPath();
    ctx.arc(C.x + r * 0.12 * sx, C.y - r * 0.55 * sy, Math.max(0.6, r * 0.05), 0, Math.PI * 2);
    ctx.fill();
  }

  // ——— 入水 ———
  function makeSplash() {
    var R = geo.rMax, parts = [];
    var r2 = mulberry(Math.floor(Math.random() * 1e9));
    for (var i = 0; i < 6; i++) {
      var side = i % 2 ? 1 : -1;
      parts.push({
        vx: side * (40 + r2() * 70), vy: -(120 + r2() * 110),
        r: R * (0.08 + r2() * 0.08), landed: false, landT: 0, x: 0, y: 0
      });
    }
    var rings = [];
    for (var k = 0; k < 4; k++) rings.push({ delay: k * 0.22 + r2() * 0.06, seed: r2() * 100, a: 0.55 - k * 0.1 });
    return { parts: parts, rings: rings, jetDrop: { launched: false, y: 0, vy: 0, landed: false, landT: 0 } };
  }

  function ring(t, x0, y0, speed, life, a0, seed, w) {
    if (t <= 0 || t > life) return;
    var P = geo.pond;
    var R = speed * Math.pow(t, 0.75);
    var k = P.ry / P.rx;
    var alpha = a0 * Math.pow(1 - t / life, 1.6);
    function trace(scale) {
      ctx.beginPath();
      for (var i = 0; i <= 64; i++) {
        var ang = i / 64 * Math.PI * 2;
        var wob = 1 + 0.025 * Math.sin(ang * 3 + seed) + 0.018 * Math.sin(ang * 5 + seed * 1.7);
        var x = x0 + Math.cos(ang) * R * wob * scale;
        var y = y0 + Math.sin(ang) * R * wob * scale * k;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
    }
    // 涟漪不是描出来的线，是水面上一道柔软的暗、紧跟一道亮
    ctx.save();
    ctx.lineCap = "round";
    ctx.shadowBlur = 5;
    ctx.lineWidth = w * 2.6;
    trace(1);
    ctx.shadowColor = "rgba(70,104,110," + (alpha * 0.5).toFixed(3) + ")";
    ctx.strokeStyle = "rgba(70,104,110," + (alpha * 0.32).toFixed(3) + ")";
    ctx.stroke();
    ctx.lineWidth = w * 2.0;
    trace(0.955);
    ctx.shadowColor = "rgba(255,252,240," + (alpha * 0.6).toFixed(3) + ")";
    ctx.strokeStyle = "rgba(255,252,240," + (alpha * 0.55).toFixed(3) + ")";
    ctx.stroke();
    ctx.restore();
  }

  function drawSplash(t) {
    var P = geo.pond, R = geo.rMax, g = 900;
    // 涟漪，一圈一圈，不规则，越走越淡
    // 涟漪只在水面里散开，到岸边就没了
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, P.top + 2, W, H - P.top);
    ctx.clip();
    splash.rings.forEach(function (rg) {
      ring(t - rg.delay, P.x, P.y, P.rx * 0.30, 5.0, rg.a, rg.seed, 0.9);
    });
    // 弹起的小水柱
    if (t < 0.5) {
      var h = R * 2.6 * Math.sin(Math.PI * t / 0.5);
      var wBase = R * 0.30;
      var gJ = ctx.createLinearGradient(0, P.y, 0, P.y - h);
      gJ.addColorStop(0, "rgba(120,150,150,0.30)");
      gJ.addColorStop(0.6, "rgba(220,232,230,0.45)");
      gJ.addColorStop(1, "rgba(250,252,248,0.75)");
      ctx.fillStyle = gJ;
      ctx.beginPath();
      ctx.moveTo(P.x - wBase, P.y);
      ctx.bezierCurveTo(P.x - wBase * 0.2, P.y - h * 0.3, P.x - wBase * 0.35, P.y - h * 0.85, P.x, P.y - h);
      ctx.bezierCurveTo(P.x + wBase * 0.35, P.y - h * 0.85, P.x + wBase * 0.2, P.y - h * 0.3, P.x + wBase, P.y);
      ctx.closePath();
      ctx.fill();
    }
    // 柱顶脱出一颗小水珠，跳起来，再落回去
    var jd = splash.jetDrop;
    var tj = t - 0.22;
    if (tj > 0 && !jd.landed) {
      var v0 = Math.sqrt(2 * g * R * 3.2);
      var y = P.y - R * 2.4 - (v0 * tj - 0.5 * g * tj * tj);
      if (y >= P.y) { jd.landed = true; jd.landT = t; }
      else {
        var rr = R * 0.24;
        var C = { x: P.x, y: y };
        var wob = 1 + 0.12 * Math.sin(tj * 40) * Math.exp(-tj * 6);
        paintWater(ballPath(C, rr, wob, 1 / wob), C, rr, wob, 1 / wob);
      }
    }
    if (jd.landed) ring(t - jd.landT, P.x, P.y, P.rx * 0.30, 2.0, 0.35, 3.3, 0.9);
    ctx.restore();
    // 溅开的几粒小水珠
    splash.parts.forEach(function (p, i) {
      if (p.landed) { ring(t - p.landT, p.x, P.y, P.rx * 0.12, 1.2, 0.25, i, 0.8); return; }
      var x = P.x + p.vx * t, y = P.y - R * 0.3 + p.vy * t + 0.5 * g * t * t;
      if (t > 0.05 && y >= P.y) { p.landed = true; p.landT = t; p.x = x; return; }
      var C = { x: x, y: y };
      paintWater(ballPath(C, p.r, 1, 1), C, p.r, 1, 1);
    });
  }

  // ——— 每一帧 ———
  function draw(now) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    sway = qaFreeze ? 0.002 : swayAngle(now);
    var P = geo.pond;

    ctx.drawImage(pondLayer, 0, 0, W, H);
    ctx.drawImage(reedLayer, 0, 0, W, H);

    // 叶子轻轻晃，叶尖跟着动
    ctx.save();
    ctx.translate(geo.base.x, geo.base.y);
    ctx.rotate(sway);
    var flutter = 1 + 0.006 * Math.sin(now / 1000 * 5.3) * Math.min(1, Math.abs(sway) * 40);
    ctx.scale(1, flutter);
    ctx.translate(-geo.base.x, -geo.base.y);
    ctx.drawImage(leafLayer, 0, 0, W, H);
    ctx.restore();
    var T = rotate(geo.tip, geo.base, sway);
    T.y -= 0.5;

    updateCount();
    if (state === "idle" || state === "grow") {
      var f = state === "idle" ? 0.02 : clamp(growMs / GROW_MS, 0, 1);
      var s = hangingShape(T, f);
      // 水洼上的影子：越大越清楚
      shadowOnPond(s.c, s.r, 0.05 + 0.05 * f);
      paintWater(dropPath(T, s), s.c, s.r, 1, 1);
    } else {
      var s1 = hangingShape(T, 1);
      // 断开后叶尖上留下一颗小水珠，慢慢收回去
      var bead = geo.rMax * (0.30 - 0.06 * smooth(0, 1.5, fallT));
      var bs = { r: bead, nw: bead * 0.75, neckL: bead * 0.15, c: { x: T.x, y: T.y + bead * 0.95 } };
      var recoil = 1 + 0.12 * Math.sin(fallT * 38) * Math.exp(-fallT * 7);
      bs.c.y = T.y + bead * 0.95 * recoil;
      paintWater(dropPath(T, bs), bs.c, bs.r, 1, 1);

      // 落下：重力加速；刚断开时像果冻一样在扁和长之间晃，越晃越小
      var y0 = s1.c.y + s1.r * 0.1;
      var dist = P.y - y0;
      var g = 2 * dist / (0.72 * 0.72);
      var tf = Math.min(fallT, 0.72);
      var y = y0 + 0.5 * g * tf * tf;
      if (fallT < 0.72) {
        var osc = 0.16 * Math.cos(fallT * 34) * Math.exp(-fallT * 4.2);
        var speed = g * tf;
        var flat = Math.min(0.06, speed / 40000);   // 越落越快，底部被空气压扁一点
        var sx = 1 + osc + flat, sy = 1 / (1 + osc + flat);
        var r = s1.r * 0.97;
        var C = { x: T.x, y: y };
        shadowOnPond(C, r, 0.06 + 0.16 * Math.pow(tf / 0.72, 2));
        // 刚断开的那一瞬，底部被拉长、顶部收尖
        if (fallT < 0.05) {
          var k = 1 - fallT / 0.05;
          sy *= 1 + 0.25 * k; sx *= 1 - 0.12 * k;
        }
        paintWater(ballPath(C, r, sx, sy), C, r, sx, sy);
      } else {
        if (!splash) {
          splash = makeSplash();
          if (snd.ctx && snd.on) { var t0 = snd.ctx.currentTime + 0.01; drip(t0, 0.45, 760); drip(t0 + 0.3, 0.16, 1050); }
        }
        drawSplash(fallT - 0.72);
        if (!endShown && fallT - 0.72 > END_DELAY) { endShown = true; showPanel("end"); }
      }
    }
  }

  // 倒数：60 → 0。一秒换一次，旧的淡出，新的浮现
  function updateCount() {
    // 60、50 …… 10，每 10 秒换一次；水滴落下那一刻变成 0，结尾那句出来时再淡掉
    var on = (state === "grow" && growMs > 1200) || (state === "fall" && !endShown);
    // 开头那句陪着前 10 秒，50″ 出现时退去
    if (state === "grow" && growMs >= 10000) panelIntro.classList.remove("is-on");
    countEl.classList.toggle("is-on", on);
    if (!on) { countShown = -1; return; }
    // 0 和入水的"嘀嗒"同一刻出现
    var left = state === "grow" ? Math.ceil((GROW_MS - growMs) / 10000) * 10 : (splash ? 0 : 10);
    if (left === countShown) return;
    countShown = left;
    var cur = countSpans[countFlip], nxt = countSpans[1 - countFlip];
    cur.className = "is-gone";
    nxt.className = "";
    nxt.innerHTML = left + '<span class="unit">″</span>';
    nxt.style.transition = left === 0 ? "opacity 0.35s ease, transform 0.35s ease" : "";
    cur.style.transition = left === 0 ? "opacity 0.35s ease, transform 0.35s ease" : "";
    void nxt.offsetWidth;
    nxt.className = "is-now";
    countFlip = 1 - countFlip;
  }

  function shadowOnPond(C, r, a) {
    var P = geo.pond;
    var near = clamp(1 - (P.y - C.y) / (P.y - geo.tip.y), 0, 1);
    var rw = r * (2.2 - 1.0 * near), rh = rw * P.ry / P.rx * 1.4;
    var gS = ctx.createRadialGradient(P.x, P.y + 1, 0, P.x, P.y + 1, rw);
    gS.addColorStop(0, "rgba(60,80,86," + (a * 0.9).toFixed(3) + ")");
    gS.addColorStop(1, "rgba(60,80,86,0)");
    ctx.save();
    ctx.translate(P.x, P.y + 1);
    ctx.scale(1, rh / rw);
    ctx.translate(-P.x, -(P.y + 1));
    ctx.fillStyle = gS;
    ctx.beginPath();
    ctx.arc(P.x, P.y + 1, rw, 0, Math.PI * 2);
    ctx.fill();
    // 水滴像透镜，影子中间有一点光
    ctx.fillStyle = "rgba(255,250,232," + (a * 1.4 * near).toFixed(3) + ")";
    ctx.beginPath();
    ctx.arc(P.x, P.y + 1, rw * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function frame(now) {
    if (!qaFreeze) {
      var dt = lastStamp ? Math.min(now - lastStamp, 100) : 16;
      lastStamp = now;
      if (!document.hidden) {
        if (state === "grow") {
          growMs += dt;
          if (growMs >= GROW_MS) { state = "fall"; fallT = 0; }
        } else if (state === "fall") {
          fallT += dt / 1000;
        }
      }
    }
    draw(now);
    requestAnimationFrame(frame);
  }

  // ——— 界面 ———
  function showPanel(which) {
    panelStart.classList.toggle("is-on", which === "start");
    panelEnd.classList.toggle("is-on", which === "end");
  }

  function start() {
    state = "grow";
    growMs = 0;
    fallT = 0;
    splash = null;
    endShown = false;
    showPanel(null);
    // 开头那句，每次开始都再出现一会儿，然后慢慢淡掉
    clearTimeout(introTimer);
    panelIntro.classList.add("is-on");
    introTimer = 0;   // 开头那句在 50″ 出现时退去（见 updateCount）
  }

  // ——— 声音：只有琴声（五声音阶），入水那一下"嘀、嗒" ———
  var btnSound = document.getElementById("btn-sound");
  var snd = { ctx: null, master: null, on: true, timer: 0, next: 0, pad: [] };

  function soundStart() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!snd.ctx) {
      var a = snd.ctx = new AC();
      snd.master = a.createGain();
      snd.master.gain.value = 0;
      // 保护：几个音叠在一起时不爆音
      var comp = a.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 12;
      comp.ratio.value = 4;
      comp.attack.value = 0.005;
      comp.release.value = 0.25;
      snd.master.connect(comp);
      comp.connect(a.destination);
      var lp = a.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 900;
      lp.connect(snd.master);
      // 只用琴声，不用长音和噪声
      // 回声：让琴音有一点空间感
      var dl = a.createDelay(1.0), fb = a.createGain(), dlp = a.createBiquadFilter(), wet = a.createGain();
      dl.delayTime.value = 0.42;
      fb.gain.value = 0.32;
      dlp.type = "lowpass";
      dlp.frequency.value = 1800;
      wet.gain.value = 0.35;
      dl.connect(dlp); dlp.connect(fb); fb.connect(dl);
      dlp.connect(wet); wet.connect(snd.master);
      snd.music = a.createGain();
      snd.music.gain.value = 1;
      snd.music.connect(snd.master);
      snd.music.connect(dl);
      snd.next = a.currentTime + 2.5;
      snd.timer = setInterval(function () {
        var t = snd.ctx.currentTime;
        while (snd.next < t + 1.5) {
          playPhraseNote(snd.next);
          snd.next += 1.6 + Math.random() * 2.2;
        }
      }, 400);
    }
    snd.ctx.resume();
    fadeTo(snd.on ? 1 : 0, 3);
    btnSound.hidden = false;
  }

  function fadeTo(v, sec) {
    if (!snd.ctx) return;
    var t = snd.ctx.currentTime, g = snd.master.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(v, t + sec);
  }

  // 五声音阶（D 宫）：怎么排都和谐，不会有刺耳的音
  var SCALE = [293.66, 329.63, 369.99, 440.0, 493.88, 587.33, 659.25, 739.99];
  var lastIdx = 3;
  function playPhraseNote(t) {
    // 多半走相邻的音，偶尔跳一下，像有人随手轻轻弹
    var step = [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)];
    lastIdx = Math.max(0, Math.min(SCALE.length - 1, lastIdx + step));
    note(t, SCALE[lastIdx], 0.17 + Math.random() * 0.08);
    if (Math.random() < 0.18) note(t + 0.02, SCALE[Math.max(0, lastIdx - 3)] / 2, 0.12);
  }
  function note(t, f, amp) {
    var a = snd.ctx;
    [[1, 1], [2, 0.18], [3, 0.05]].forEach(function (h) {
      var o = a.createOscillator(), g = a.createGain();
      o.type = "sine";
      o.frequency.value = f * h[0];
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp * h[1], t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8 / h[0]);
      o.connect(g); g.connect(snd.music);
      o.start(t); o.stop(t + 3);
    });
  }

  // 一滴水落进水里的声音：音高往上扬，很短
  function drip(t, amp, f) {
    var a = snd.ctx, o = a.createOscillator(), g = a.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 1.7, t + 0.06);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g); g.connect(snd.master);
    o.start(t); o.stop(t + 0.2);
  }

  btnSound.addEventListener("click", function () {
    snd.on = !snd.on;
    btnSound.textContent = snd.on ? "声音：开" : "声音：关";
    fadeTo(snd.on ? 1 : 0, 1.2);
  });

  btnStart.addEventListener("click", soundStart);
  btnAgain.addEventListener("click", soundStart);
  btnStart.addEventListener("click", start);
  btnAgain.addEventListener("click", start);
  document.addEventListener("visibilitychange", function () { lastStamp = 0; });

  // ——— 尺寸 ———
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    geo = layout();
    leafLayer = paintLeaf();
    pondLayer = paintPond();
    reedLayer = paintReeds();
  }
  window.addEventListener("resize", resize);
  resize();

  // 检查用：地址后加 #t=秒数，可以把画面停在那一刻（例如 #t=45、#t=60.9）
  var m = /t=([\d.]+)/.exec(location.hash);
  if (m) {
    var sec = parseFloat(m[1]);
    qaFreeze = true;
    document.body.classList.add("qa");
    showPanel(null);
    if (sec <= 60) { state = "grow"; growMs = sec * 1000; }
    else {
      state = "fall"; fallT = sec - 60;
      if (fallT > 0.72) {
        splash = makeSplash();
        // 让小水珠的落地时刻也能算出来
        for (var i = 0; i <= Math.round((fallT - 0.72) * 120); i++) { drawSplash(i / 120); }
        endShown = true;
        if (fallT - 0.72 > END_DELAY) showPanel("end");
      }
    }
  } else {
    showPanel("start");
  }
  requestAnimationFrame(frame);
})();
