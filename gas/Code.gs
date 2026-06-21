/**
 * 丸高秋山 受注予想・実績管理アプリ — Google Apps Script バックエンド
 *
 * - Web App として公開（doGet / doPost）
 * - データは本スプレッドシートの 2 シート（予想マスター / 実績）に保存
 * - レスポンスは ContentService の JSON（{ok:true,data} / {ok:false,error}）
 *   ※ 既存 KimFoods アプリと同方式: doPost は text/plain で受け、CORS プリフライトを回避
 *
 * 初回セットアップ:
 *   1) スプレッドシートを 1 つ用意し、このスクリプトをコンテナバインドで紐付ける
 *   2) GAS エディタで setup() を 1 回実行（2 シート作成 + seed 投入）
 *   3) デプロイ > 新しいデプロイ > 種類: ウェブアプリ
 *        - 次のユーザーとして実行: 自分
 *        - アクセスできるユーザー: 全員
 *   4) 発行された /exec URL を index.html の API_URL に貼り付け
 */

// ===== 定数 =====
var SHEET_MASTER  = '予想マスター';
var SHEET_ACTUALS = '実績';
var PRODUCTS = ['乳酸菌', '中辛'];
var DAYS     = ['日曜', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜'];

// 実績シートの列構成: 年月 | 商品 | 日〜土(7) | 週合計 | 更新日時
var ACTUALS_HEADER = ['年月', '商品'].concat(DAYS).concat(['週合計', '更新日時']);
// マスターシートの列構成: 商品 | 日〜土(7)
var MASTER_HEADER  = ['商品'].concat(DAYS);

// ===== seed（seed-data.json をベタ書き。GAS は外部ファイルを読めないため） =====
var SEED_FORECAST_MASTER = {
  '乳酸菌': { '日曜': 319, '月曜': 1045, '火曜': 530, '水曜': 554, '木曜': 762, '金曜': 593, '土曜': 367 },
  '中辛':   { '日曜': 88,  '月曜': 231,  '火曜': 134, '水曜': 132, '木曜': 136, '金曜': 129, '土曜': 117 }
};

var SEED_ACTUALS = [
  { yyyymm: '2024-06', product: '乳酸菌', '日曜': 300, '月曜': 780,  '火曜': 360, '水曜': 200, '木曜': 400,  '金曜': 450,  '土曜': 160 },
  { yyyymm: '2024-07', product: '中辛',   '日曜': 30,  '月曜': 108,  '火曜': 60,  '水曜': 50,  '木曜': 40,   '金曜': 148,  '土曜': 70  },
  { yyyymm: '2024-07', product: '乳酸菌', '日曜': 300, '月曜': 700,  '火曜': 500, '水曜': 320, '木曜': 700,  '金曜': 520,  '土曜': 220 },
  { yyyymm: '2024-08', product: '中辛',   '日曜': 82,  '月曜': 276,  '火曜': 178, '水曜': 206, '木曜': 138,  '金曜': 240,  '土曜': 184 },
  { yyyymm: '2024-08', product: '乳酸菌', '日曜': 320, '月曜': 760,  '火曜': 450, '水曜': 430, '木曜': 1100, '金曜': 164,  '土曜': 210 },
  { yyyymm: '2024-09', product: '中辛',   '日曜': 92,  '月曜': 340,  '火曜': 184, '水曜': 206, '木曜': 196,  '金曜': 152,  '土曜': 118 },
  { yyyymm: '2024-09', product: '乳酸菌', '日曜': 330, '月曜': 1000, '火曜': 450, '水曜': 700, '木曜': 850,  '金曜': 520,  '土曜': 400 },
  { yyyymm: '2024-10', product: '中辛',   '日曜': 93,  '月曜': 324,  '火曜': 180, '水曜': 158, '木曜': 142,  '金曜': 160,  '土曜': 134 },
  { yyyymm: '2024-10', product: '乳酸菌', '日曜': 330, '月曜': 1000, '火曜': 600, '水曜': 600, '木曜': 720,  '金曜': 650,  '土曜': 300 },
  { yyyymm: '2024-11', product: '中辛',   '日曜': 116, '月曜': 396,  '火曜': 136, '水曜': 140, '木曜': 214,  '金曜': 110,  '土曜': 138 },
  { yyyymm: '2024-11', product: '乳酸菌', '日曜': 400, '月曜': 1000, '火曜': 700, '水曜': 720, '木曜': 800,  '金曜': 550,  '土曜': 360 },
  { yyyymm: '2024-12', product: '中辛',   '日曜': 94,  '月曜': 258,  '火曜': 134, '水曜': 126, '木曜': 144,  '金曜': 96,   '土曜': 94  },
  { yyyymm: '2024-12', product: '乳酸菌', '日曜': 420, '月曜': 1200, '火曜': 520, '水曜': 550, '木曜': 720,  '金曜': 600,  '土曜': 300 },
  { yyyymm: '2025-01', product: '中辛',   '日曜': 86,  '月曜': 254,  '火曜': 122, '水曜': 124, '木曜': 156,  '金曜': 144,  '土曜': 84  },
  { yyyymm: '2025-01', product: '乳酸菌', '日曜': 300, '月曜': 1200, '火曜': 500, '水曜': 550, '木曜': 720,  '金曜': 660,  '土曜': 330 },
  { yyyymm: '2025-02', product: '中辛',   '日曜': 192, '月曜': 240,  '火曜': 144, '水曜': 132, '木曜': 156,  '金曜': 120,  '土曜': 156 },
  { yyyymm: '2025-02', product: '乳酸菌', '日曜': 312, '月曜': 1008, '火曜': 600, '水曜': 540, '木曜': 804,  '金曜': 660,  '土曜': 432 },
  { yyyymm: '2025-03', product: '中辛',   '日曜': 96,  '月曜': 180,  '火曜': 180, '水曜': 144, '木曜': 36,   '金曜': 192,  '土曜': 144 },
  { yyyymm: '2025-03', product: '乳酸菌', '日曜': 336, '月曜': 936,  '火曜': 672, '水曜': 480, '木曜': 924,  '金曜': 684,  '土曜': 420 },
  { yyyymm: '2025-04', product: '中辛',   '日曜': 120, '月曜': 240,  '火曜': 144, '水曜': 132, '木曜': 120,  '金曜': 120,  '土曜': 132 },
  { yyyymm: '2025-04', product: '乳酸菌', '日曜': 480, '月曜': 960,  '火曜': 672, '水曜': 600, '木曜': 756,  '金曜': 564,  '土曜': 432 },
  { yyyymm: '2025-05', product: '中辛',   '日曜': 108, '月曜': 240,  '火曜': 156, '水曜': 108, '木曜': 144,  '金曜': 144,  '土曜': 108 },
  { yyyymm: '2025-05', product: '乳酸菌', '日曜': 312, '月曜': 970,  '火曜': 660, '水曜': 612, '木曜': 756,  '金曜': 720,  '土曜': 384 },
  { yyyymm: '2025-06', product: '中辛',   '日曜': 48,  '月曜': 192,  '火曜': 120, '水曜': 108, '木曜': 132,  '金曜': 108,  '土曜': 144 },
  { yyyymm: '2025-06', product: '乳酸菌', '日曜': 240, '月曜': 1062, '火曜': 600, '水曜': 600, '木曜': 840,  '金曜': 672,  '土曜': 432 },
  { yyyymm: '2025-07', product: '中辛',   '日曜': 60,  '月曜': 204,  '火曜': 132, '水曜': 156, '木曜': 120,  '金曜': 132,  '土曜': 120 },
  { yyyymm: '2025-07', product: '乳酸菌', '日曜': 336, '月曜': 1020, '火曜': 600, '水曜': 624, '木曜': 850,  '金曜': 660,  '土曜': 336 },
  { yyyymm: '2025-08', product: '中辛',   '日曜': 60,  '月曜': 204,  '火曜': 144, '水曜': 120, '木曜': 144,  '金曜': 168,  '土曜': 120 },
  { yyyymm: '2025-08', product: '乳酸菌', '日曜': 276, '月曜': 996,  '火曜': 612, '水曜': 600, '木曜': 828,  '金曜': 600,  '土曜': 480 },
  { yyyymm: '2025-09', product: '中辛',   '日曜': 84,  '月曜': 216,  '火曜': 132, '水曜': 144, '木曜': 120,  '金曜': 108,  '土曜': 120 },
  { yyyymm: '2025-09', product: '乳酸菌', '日曜': 312, '月曜': 924,  '火曜': 576, '水曜': 600, '木曜': 744,  '金曜': 612,  '土曜': 432 },
  { yyyymm: '2025-10', product: '中辛',   '日曜': 96,  '月曜': 216,  '火曜': 132, '水曜': 144, '木曜': 144,  '金曜': 84,   '土曜': 144 },
  { yyyymm: '2025-10', product: '乳酸菌', '日曜': 228, '月曜': 984,  '火曜': 564, '水曜': 588, '木曜': 720,  '金曜': 372,  '土曜': 420 },
  { yyyymm: '2025-11', product: '中辛',   '日曜': 48,  '月曜': 216,  '火曜': 144, '水曜': 120, '木曜': 120,  '金曜': 120,  '土曜': 72  },
  { yyyymm: '2025-11', product: '乳酸菌', '日曜': 300, '月曜': 1152, '火曜': 408, '水曜': 528, '木曜': 804,  '金曜': 636,  '土曜': 372 },
  { yyyymm: '2025-12', product: '中辛',   '日曜': 96,  '月曜': 156,  '火曜': 84,  '水曜': 120, '木曜': 144,  '金曜': 72,   '土曜': 81  },
  { yyyymm: '2025-12', product: '乳酸菌', '日曜': 376, '月曜': 1104, '火曜': 300, '水曜': 600, '木曜': 780,  '金曜': 420,  '土曜': 396 },
  { yyyymm: '2026-01', product: '中辛',   '日曜': 96,  '月曜': 216,  '火曜': 60,  '水曜': 180, '木曜': 132,  '金曜': 96,   '土曜': 72  },
  { yyyymm: '2026-01', product: '乳酸菌', '日曜': 348, '月曜': 1356, '火曜': 420, '水曜': 744, '木曜': 276,  '金曜': 1056, '土曜': 312 },
  { yyyymm: '2026-02', product: '中辛',   '日曜': 84,  '月曜': 216,  '火曜': 144, '水曜': 144, '木曜': 108,  '金曜': 96,   '土曜': 120 },
  { yyyymm: '2026-02', product: '乳酸菌', '日曜': 348, '月曜': 1356, '火曜': 588, '水曜': 528, '木曜': 960,  '金曜': 516,  '土曜': 504 },
  { yyyymm: '2026-03', product: '中辛',   '日曜': 72,  '月曜': 204,  '火曜': 120, '水曜': 96,  '木曜': 156,  '金曜': 120,  '土曜': 132 },
  { yyyymm: '2026-03', product: '乳酸菌', '日曜': 240, '月曜': 1294, '火曜': 492, '水曜': 468, '木曜': 900,  '金曜': 720,  '土曜': 420 },
  { yyyymm: '2026-04', product: '中辛',   '日曜': 72,  '月曜': 216,  '火曜': 132, '水曜': 84,  '木曜': 192,  '金曜': 120,  '土曜': 108 },
  { yyyymm: '2026-04', product: '乳酸菌', '日曜': 288, '月曜': 1176, '火曜': 480, '水曜': 528, '木曜': 684,  '金曜': 840,  '土曜': 348 },
  { yyyymm: '2026-05', product: '中辛',   '日曜': 108, '月曜': 192,  '火曜': 120, '水曜': 84,  '木曜': 120,  '金曜': 108,  '土曜': 98  },
  { yyyymm: '2026-05', product: '乳酸菌', '日曜': 228, '月曜': 1140, '火曜': 384, '水曜': 588, '木曜': 648,  '金曜': 384,  '土曜': 408 }
];

// =========================================================================
// エントリポイント
// =========================================================================

/**
 * GET: マスター取得 / 実績取得
 *   ?action=master
 *   ?action=actuals&yyyymm=YYYY-MM
 */
function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    var action = p.action || '';

    if (action === 'master') {
      return jsonOut({ ok: true, data: readMaster() });
    }
    if (action === 'actuals') {
      return jsonOut({ ok: true, data: readActuals(p.yyyymm || '') });
    }
    return jsonOut({ ok: false, error: 'unknown action: ' + action });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/**
 * POST: 実績保存 / マスター保存 / 予想再計算
 * body は text/plain の JSON 文字列。{ action, ... }
 *   saveActuals    : { action, yyyymm, product, values:{曜日:数値} }
 *   saveMaster     : { action, master:{商品:{曜日:数値}} }
 *   recalcForecast : { action }
 */
function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    var action = body.action || '';

    if (action === 'saveActuals') {
      return jsonOut({ ok: true, data: saveActuals(body) });
    }
    if (action === 'saveMaster') {
      return jsonOut({ ok: true, data: saveMaster(body) });
    }
    if (action === 'recalcForecast') {
      return jsonOut({ ok: true, data: recalcForecast() });
    }
    return jsonOut({ ok: false, error: 'unknown action: ' + action });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

// =========================================================================
// 初期セットアップ（GAS エディタから 1 回手動実行）
// =========================================================================

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('アクティブなスプレッドシートがありません。スプレッドシートにバインドして実行してください。');
  }

  // ---- 予想マスター ----
  var m = ss.getSheetByName(SHEET_MASTER);
  if (m) ss.deleteSheet(m);
  m = ss.insertSheet(SHEET_MASTER);
  m.getRange(1, 1, 1, MASTER_HEADER.length).setValues([MASTER_HEADER]).setFontWeight('bold');
  var mrows = PRODUCTS.map(function (p) {
    return [p].concat(DAYS.map(function (d) { return num(SEED_FORECAST_MASTER[p][d]); }));
  });
  m.getRange(2, 1, mrows.length, MASTER_HEADER.length).setValues(mrows);
  m.setFrozenRows(1);

  // ---- 実績 ----
  var a = ss.getSheetByName(SHEET_ACTUALS);
  if (a) ss.deleteSheet(a);
  a = ss.insertSheet(SHEET_ACTUALS);
  a.getRange(1, 1, 1, ACTUALS_HEADER.length).setValues([ACTUALS_HEADER]).setFontWeight('bold');
  // 年月列はテキスト固定（"2024-06" が日付に化けるのを防ぐ）
  a.getRange('A:A').setNumberFormat('@');
  var now = new Date();
  var arows = SEED_ACTUALS.map(function (r) {
    var vals = DAYS.map(function (d) { return num(r[d]); });
    var total = vals.reduce(function (s, v) { return s + v; }, 0);
    return [r.yyyymm, r.product].concat(vals).concat([total, now]);
  });
  if (arows.length) {
    a.getRange(2, 1, arows.length, ACTUALS_HEADER.length).setValues(arows);
  }
  a.setFrozenRows(1);

  return 'setup 完了: 予想マスター ' + mrows.length + ' 行 / 実績 ' + arows.length + ' 行を投入しました。';
}

// =========================================================================
// 読み取り
// =========================================================================

function readMaster() {
  var sh = getSheet(SHEET_MASTER);
  var values = sh.getDataRange().getValues();
  var out = {};
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var product = row[0];
    if (product === '' || product === null) continue;
    var obj = {};
    for (var di = 0; di < DAYS.length; di++) {
      obj[DAYS[di]] = num(row[1 + di]);
    }
    out[product] = obj;
  }
  return out;
}

function readActuals(yyyymm) {
  var sh = getSheet(SHEET_ACTUALS);
  var values = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (row[0] === '' || row[0] === null) continue;
    var ym = formatYm(row[0]);
    if (yyyymm && ym !== yyyymm) continue;

    var rec = { yyyymm: ym, product: row[1] };
    for (var di = 0; di < DAYS.length; di++) {
      rec[DAYS[di]] = numOrNull(row[2 + di]);
    }
    rec['週合計'] = num(row[2 + DAYS.length]);
    var ts = row[3 + DAYS.length];
    rec['更新日時'] = ts ? formatTs(ts) : '';
    out.push(rec);
  }
  return out;
}

// =========================================================================
// 書き込み
// =========================================================================

/**
 * 年月 × 商品 で upsert。週合計と更新日時を自動付与。
 */
function saveActuals(body) {
  var yyyymm = body.yyyymm;
  var product = body.product;
  var values = body.values || {};
  if (!yyyymm || !product) throw new Error('yyyymm と product は必須です');
  if (PRODUCTS.indexOf(product) < 0) throw new Error('不明な商品: ' + product);

  var sh = getSheet(SHEET_ACTUALS);
  var data = sh.getDataRange().getValues();

  var dayVals = DAYS.map(function (d) { return numOrNull(values[d]); });
  var total = dayVals.reduce(function (s, v) { return s + (v === null ? 0 : v); }, 0);
  var now = new Date();
  var cells = dayVals.map(function (v) { return v === null ? '' : v; });
  var rowVals = [yyyymm, product].concat(cells).concat([total, now]);

  var foundRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (formatYm(data[i][0]) === yyyymm && data[i][1] === product) {
      foundRow = i + 1; // 1-based
      break;
    }
  }
  if (foundRow > 0) {
    sh.getRange(foundRow, 1, 1, rowVals.length).setValues([rowVals]);
  } else {
    sh.appendRow(rowVals);
  }

  return { yyyymm: yyyymm, product: product, '週合計': total, '更新日時': formatTs(now) };
}

/**
 * マスター全体を上書き保存。body.master = { 商品: { 曜日: 数値 } }
 */
function saveMaster(body) {
  var master = body.master;
  if (!master || typeof master !== 'object') throw new Error('master は必須です');

  var sh = getSheet(SHEET_MASTER);
  sh.clearContents();
  sh.getRange(1, 1, 1, MASTER_HEADER.length).setValues([MASTER_HEADER]).setFontWeight('bold');

  var products = Object.keys(master);
  var rows = products.map(function (p) {
    return [p].concat(DAYS.map(function (d) { return num(master[p][d]); }));
  });
  if (rows.length) {
    sh.getRange(2, 1, rows.length, MASTER_HEADER.length).setValues(rows);
  }
  sh.setFrozenRows(1);
  return readMaster();
}

/**
 * 実績全件から曜日別平均を再計算し、マスターを上書き。
 * 空欄（未入力）の曜日は平均計算の母数に含めない。
 */
function recalcForecast() {
  var actuals = readActuals('');
  var sums = {};
  var counts = {};
  PRODUCTS.forEach(function (p) {
    sums[p] = {}; counts[p] = {};
    DAYS.forEach(function (d) { sums[p][d] = 0; counts[p][d] = 0; });
  });

  actuals.forEach(function (r) {
    var p = r.product;
    if (!sums[p]) {
      sums[p] = {}; counts[p] = {};
      DAYS.forEach(function (d) { sums[p][d] = 0; counts[p][d] = 0; });
    }
    DAYS.forEach(function (d) {
      var v = r[d];
      if (v !== null && v !== '' && !isNaN(Number(v))) {
        sums[p][d] += Number(v);
        counts[p][d] += 1;
      }
    });
  });

  var master = {};
  Object.keys(sums).forEach(function (p) {
    master[p] = {};
    DAYS.forEach(function (d) {
      master[p][d] = counts[p][d] > 0 ? Math.round(sums[p][d] / counts[p][d]) : 0;
    });
  });

  return saveMaster({ master: master });
}

// =========================================================================
// ユーティリティ
// =========================================================================

function getSheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss ? ss.getSheetByName(name) : null;
  if (!sh) throw new Error('シート「' + name + '」が見つかりません。setup() を実行してください。');
  return sh;
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function num(v) {
  var n = Number(v);
  return isNaN(n) ? 0 : n;
}

function numOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  var n = Number(v);
  return isNaN(n) ? null : n;
}

function formatYm(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM');
  }
  return String(v);
}

function formatTs(d) {
  if (!(d instanceof Date)) d = new Date(d);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}
