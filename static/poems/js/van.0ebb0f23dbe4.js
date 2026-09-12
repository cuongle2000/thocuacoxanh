/* Phân tích vần tiếng Việt — thuần hàm, không đụng DOM.
 * Quy tắc chi tiết: docs/tra-van.md (mục 3). Dùng chung cho trình duyệt
 * (window.Van) và Node (module.exports, xem van.test.js).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.Van = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /* ── Thanh điệu ── */
    var TONE_MARKS = { '\u0300': 'huyen', '\u0301': 'sac', '\u0303': 'nga', '\u0309': 'hoi', '\u0323': 'nang' };
    var TONE_RE = /[\u0300\u0301\u0303\u0309\u0323]/g;
    var TONE_ORDER = { ngang: 0, huyen: 1, sac: 2, hoi: 3, nga: 4, nang: 5 };
    var TONE_LABEL = { ngang: 'ngang', huyen: 'huyền', sac: 'sắc', hoi: 'hỏi', nga: 'ngã', nang: 'nặng' };

    /* ── Phụ âm đầu: xếp dài trước để khớp dài nhất ── */
    var ONSETS = ['ngh', 'ng', 'nh', 'ch', 'tr', 'th', 'ph', 'kh', 'gh',
        'b', 'c', 'd', 'đ', 'g', 'h', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'x'];
    // Thứ tự bảng chữ cái tiếng Việt cho phụ âm đầu (dùng khi sắp xếp)
    var ONSET_ORDER = ['', 'b', 'c', 'ch', 'd', 'đ', 'g', 'gh', 'gi', 'h', 'k', 'kh', 'l', 'm',
        'n', 'ng', 'ngh', 'nh', 'p', 'ph', 'qu', 'r', 's', 't', 'th', 'tr', 'v', 'x'];

    var VOWEL_RE = /[aăâeêioôơuưy]/;
    // Khoá vần hợp lệ: (nguyên âm đôi | oo dài (xoong) | nguyên âm) + âm cuối tuỳ chọn
    var KEY_RE = /^(oo|iê|uô|ươ|[aăâeêioôơuư])(ch|ng|nh|[iyoumnptc])?$/;

    /* ── Bảng vần thông: mỗi vần chỉ thuộc đúng 1 lớp (docs/tra-van.md 3.4) ── */
    var RIME_CLASSES = [
        ['au', 'âu'],
        ['ay', 'ây'],
        ['ai', 'oi', 'ôi', 'ơi'],
        ['ui', 'ưi'],
        ['êu', 'iêu', 'iu', 'ưu'],
        ['ê', 'iê'],
        ['ô', 'uô'],
        ['ơ', 'ươ'],
        ['a', 'ơ'],
        ['an', 'ang'], ['ăn', 'ăng'], ['ân', 'âng'],
        ['on', 'ong'], ['ôn', 'ông'], ['ơn', 'ơng'],
        ['en', 'eng'], ['ên', 'ênh'], ['in', 'inh'],
        ['un', 'ung'], ['ưn', 'ưng'], ['iên', 'iêng'], ['uôn', 'uông'], ['ươn', 'ương'],
        ['at', 'ac'], ['ăt', 'ăc'], ['ât', 'âc'], ['ot', 'oc'], ['ôt', 'ôc'],
        ['et', 'ec'], ['êt', 'êch'], ['it', 'ich'], ['ut', 'uc'], ['ưt', 'ưc'],
        ['iêt', 'iêc'], ['uôt', 'uôc'], ['ươt', 'ươc'],
        ['ăm', 'âm'], ['ăp', 'âp']
    ];
    // 'a' và 'ơ' cùng xuất hiện ở hai dòng (['ơ','ươ'] và ['a','ơ']) → gộp thành một lớp.
    var CLASS_OF = {};
    (function buildClasses() {
        var groups = [];
        RIME_CLASSES.forEach(function (row) {
            var hit = null;
            row.forEach(function (k) {
                groups.forEach(function (g) { if (!hit && g.indexOf(k) !== -1) hit = g; });
            });
            if (!hit) { hit = []; groups.push(hit); }
            row.forEach(function (k) { if (hit.indexOf(k) === -1) hit.push(k); });
        });
        groups.forEach(function (g) {
            var id = g.join('/');
            g.forEach(function (k) { CLASS_OF[k] = id; });
        });
    }());

    /* ── Bước 1: bóc thanh điệu ── */
    function splitTone(syllable) {
        var tone = 'ngang';
        var base = String(syllable).toLowerCase().normalize('NFD')
            .replace(TONE_RE, function (m) { tone = TONE_MARKS[m]; return ''; })
            .normalize('NFC');
        return { base: base, tone: tone, toneClass: (tone === 'ngang' || tone === 'huyen') ? 'bang' : 'trac' };
    }

    /* ── Bước 2: tách phụ âm đầu ── */
    function splitOnset(base) {
        if (base.indexOf('gi') === 0) {
            var rest = base.slice(2);
            // "giữ", "gia", "giếng": gi + nguyên âm. "gì", "gìn": g + i...
            if (rest && VOWEL_RE.test(rest.charAt(0))) return { onset: 'gi', rime: rest };
            return { onset: 'g', rime: base.slice(1) };
        }
        if (base.indexOf('qu') === 0) return { onset: 'qu', rime: base.slice(2) };
        for (var i = 0; i < ONSETS.length; i++) {
            if (base.indexOf(ONSETS[i]) === 0) return { onset: ONSETS[i], rime: base.slice(ONSETS[i].length) };
        }
        return { onset: '', rime: base };
    }

    /* ── Bước 3: chuẩn hoá vần → khoá vần chính (null nếu không phải vần tiếng Việt) ── */
    function rimeKey(rime) {
        var r = rime;
        if (!r) return null;
        r = r.replace(/^o(?=[aăe])/, '');          // oa, oă, oe → a, ă, e
        r = r.replace(/^u(?=[êyâơ])/, '');     // uê, uy, uâ, uyê, uya, uơ → ê, y, â, yê, ya, ơ
        r = r.replace(/^y/, 'i');                        // y nguyên âm chính → i (ly, yêu, uyên)
        r = r.replace(/^ia$/, 'iê').replace(/^ua$/, 'uô').replace(/^ưa$/, 'ươ');
        return KEY_RE.test(r) ? r : null;
    }

    function rimeClass(key) {
        return CLASS_OF[key] || key;
    }

    /* Phân tích một tiếng đơn (đã lowercase hoặc chưa). null nếu không nhận ra vần. */
    function analyzeSyllable(syl) {
        var t = splitTone(syl);
        var o = splitOnset(t.base);
        var key = rimeKey(o.rime);
        if (!key) return null;
        return {
            syllable: String(syl).toLowerCase().normalize('NFC'),
            base: t.base, tone: t.tone, toneClass: t.toneClass,
            onset: o.onset, rime: o.rime, key: key, cls: rimeClass(key)
        };
    }

    /* Phân tích một mục từ điển / chuỗi người dùng gõ: lấy tiếng cuối. */
    function analyzeWord(word) {
        var w = String(word).trim().toLowerCase().normalize('NFC');
        if (!w) return null;
        var parts = w.split(/[\s\-]+/).filter(Boolean);
        var a = analyzeSyllable(parts[parts.length - 1]);
        if (!a) return null;
        a.word = w;
        a.nSyl = parts.length;
        // Phụ âm đầu của tiếng đầu tiên — dùng để gom nhóm từ ghép trên UI
        a.firstOnset = parts.length === 1 ? a.onset : splitOnset(splitTone(parts[0]).base).onset;
        return a;
    }

    /* ── Chỉ mục: lớp vần → danh sách entry ── */
    function buildIndex(words) {
        var byClass = {};
        var count = 0;
        for (var i = 0; i < words.length; i++) {
            var a = analyzeWord(words[i]);
            if (!a) continue;
            (byClass[a.cls] || (byClass[a.cls] = [])).push(a);
            count++;
        }
        return { byClass: byClass, count: count, total: words.length };
    }

    function onsetRank(o) { var i = ONSET_ORDER.indexOf(o); return i === -1 ? ONSET_ORDER.length : i; }
    function compareEntries(x, y) {
        if (x.nSyl !== y.nSyl) return x.nSyl - y.nSyl;
        var d = onsetRank(x.onset) - onsetRank(y.onset);
        if (d) return d;
        d = TONE_ORDER[x.tone] - TONE_ORDER[y.tone];
        if (d) return d;
        return x.word.localeCompare(y.word, 'vi');
    }

    /* Chia một danh sách entry (đã sort) thành từ đơn / từ ghép, mỗi bên gom theo
     * phụ âm đầu (từ đơn: của chính tiếng đó; từ ghép: của tiếng đầu tiên).
     * Dòng theo thứ tự ONSET_ORDER, dòng không phụ âm đầu ('') xếp cuối.
     */
    function groupByOnset(entries) {
        var singles = {}, multis = {};
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            var bucket = e.nSyl === 1 ? singles : multis;
            (bucket[e.firstOnset] || (bucket[e.firstOnset] = [])).push(e);
        }
        function rows(bucket) {
            return Object.keys(bucket).sort(function (a, b) {
                if (a === '') return 1;
                if (b === '') return -1;
                return onsetRank(a) - onsetRank(b);
            }).map(function (o) { return { onset: o, entries: bucket[o] }; });
        }
        return { singles: rows(singles), multis: rows(multis) };
    }

    /* Tra vần. opts.tone: 'all' | 'bang' | 'trac'.
     * Trả về { query, exact: {key, entries, groups}, loose: [{key, entries, groups}] }
     * hoặc { query: null }. `groups` = groupByOnset(entries).
     */
    function lookup(index, text, opts) {
        opts = opts || {};
        var tone = opts.tone || 'all';
        var q = analyzeWord(text);
        if (!q) return { query: null, exact: null, loose: [] };

        var pool = index.byClass[q.cls] || [];
        var exact = [];
        var looseByKey = {};
        for (var i = 0; i < pool.length; i++) {
            var e = pool[i];
            if (tone !== 'all' && e.toneClass !== tone) continue;
            // chính từ vừa gõ (so theo base+thanh để 'hòa' cũng loại 'hoà')
            if (e.nSyl === 1 && e.base === q.base && e.tone === q.tone) continue;
            if (e.key === q.key) exact.push(e);
            else (looseByKey[e.key] || (looseByKey[e.key] = [])).push(e);
        }
        exact.sort(compareEntries);
        var loose = Object.keys(looseByKey).sort().map(function (k) {
            var list = looseByKey[k].sort(compareEntries);
            return { key: k, entries: list, groups: groupByOnset(list) };
        });
        return { query: q, exact: { key: q.key, entries: exact, groups: groupByOnset(exact) }, loose: loose };
    }

    return {
        splitTone: splitTone,
        splitOnset: splitOnset,
        rimeKey: rimeKey,
        rimeClass: rimeClass,
        analyzeSyllable: analyzeSyllable,
        analyzeWord: analyzeWord,
        buildIndex: buildIndex,
        groupByOnset: groupByOnset,
        lookup: lookup,
        toneLabel: function (t) { return TONE_LABEL[t] || t; },
        RIME_CLASSES: RIME_CLASSES
    };
}));
