/* Trò "Tìm vần" (/choi-tu/tim-van/): máy ra một tiếng, người chơi gõ một từ
 * cùng vần. Đúng +1, sai về 0. Luật chi tiết: docs/choi-tu.md mục 3.
 * Phần core (build / pickTarget / check / suggest) thuần hàm, export cho Node
 * (game_tim_van.test.js); phần UI chỉ chạy khi có document.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./van.js'), require('./choi_tu.js'));
    } else {
        root.GameTimVan = factory(root.Van, root.ChoiTu);
        if (typeof document !== 'undefined') root.GameTimVan.mount();
    }
}(typeof self !== 'undefined' ? self : this, function (Van, ChoiTu) {
    'use strict';

    /* Ngưỡng chọn tiếng cho máy (docs/choi-tu.md mục 3.2) */
    var MIN_FREQ = 8;        // tiếng máy ra phải xuất hiện trong ≥ 8 từ ghép — tránh tiếng hiếm (còn ~3.300 tiếng)
    var HINT_MIN_FREQ = 3;   // gợi ý / đếm đáp án: tiếng xuất hiện trong ≥ 3 từ ghép
    var MIN_CANDIDATES = 10; // lớp vần phải có ≥ 10 từ đơn quen thuộc để ván chơi có đủ đáp án
    var ACCEPT_LOOSE = true; // nhận cả vần thông (cùng lớp), không chỉ vần chính (cùng key)
    var SUGGEST_COUNT = 3;

    /* ── Core ── */

    function build(words) {
        var index = Van.buildIndex(words);
        var freq = ChoiTu.buildFreq(words);
        var dict = {};
        var singlesByClass = {};
        var i;
        for (i = 0; i < words.length; i++) dict[ChoiTu.wordKey(words[i])] = true;
        // số từ đơn quen thuộc (freq ≥ HINT_MIN_FREQ) trong mỗi lớp vần — cùng tiêu chí với suggest()
        for (var cls in index.byClass) {
            var n = 0, list = index.byClass[cls];
            for (i = 0; i < list.length; i++) if (list[i].nSyl === 1 && (freq[list[i].word] || 0) >= HINT_MIN_FREQ) n++;
            singlesByClass[cls] = n;
        }
        var pool = [];
        for (i = 0; i < words.length; i++) {
            var w = words[i];
            if (/[\s\-]/.test(w)) continue;
            var a = Van.analyzeWord(w);
            if (!a) continue;
            if ((freq[w] || 0) < MIN_FREQ) continue;
            if (singlesByClass[a.cls] < MIN_CANDIDATES) continue;
            pool.push(a);
        }
        return { index: index, dict: dict, pool: pool, freq: freq };
    }

    function pickTarget(state, recent) {
        return ChoiTu.pickRandom(state.pool, recent);
    }

    /* Kiểm tra đáp án. Trả về { ok, kind: 'exact'|'loose', reason, entry }.
     * reason: empty | unknown | invalid | same | rhyme | used */
    function check(state, target, answer, used) {
        var text = String(answer || '').trim();
        if (!text) return { ok: false, reason: 'empty' };
        var a = Van.analyzeWord(text);
        if (!a) return { ok: false, reason: 'invalid', entry: null };
        var key = ChoiTu.wordKey(text);
        if (!state.dict[key]) return { ok: false, reason: 'unknown', entry: a };
        if (a.base === target.base && a.tone === target.tone) return { ok: false, reason: 'same', entry: a };
        var exact = a.key === target.key;
        if (!exact && !(ACCEPT_LOOSE && a.cls === target.cls)) return { ok: false, reason: 'rhyme', entry: a };
        if (used && used[key]) return { ok: false, reason: 'used', entry: a };
        return { ok: true, kind: exact ? 'exact' : 'loose', entry: a, key: key };
    }

    /* Gợi ý n từ đơn hợp lệ, quen thuộc nhất (freq cao) trước: vần chính trước, thiếu thì lấy vần thông. Bỏ từ đã dùng. */
    function suggest(state, target, n, used) {
        n = n || SUGGEST_COUNT;
        var r = Van.lookup(state.index, target.word || target.syllable);
        var out = [];
        function byFreq(a, b) { return (state.freq[b.word] || 0) - (state.freq[a.word] || 0); }
        function take(entries) {
            var cands = entries.filter(function (e) {
                return e.nSyl === 1 && (state.freq[e.word] || 0) >= HINT_MIN_FREQ && !(used && used[ChoiTu.wordKey(e.word)]);
            }).sort(byFreq);
            for (var i = 0; i < cands.length && out.length < n; i++) out.push(cands[i].word);
        }
        if (r.exact) take(r.exact.entries);
        if (ACCEPT_LOOSE) for (var i = 0; i < r.loose.length && out.length < n; i++) take(r.loose[i].entries);
        return out;
    }

    /* ── UI ── */

    var REASON_TEXT = {
        empty: 'Gõ một từ rồi bấm Kiểm tra nhé.',
        invalid: 'Không nhận ra vần tiếng Việt trong từ này.',
        unknown: 'Từ điển chưa có từ này.',
        same: 'Đó là chính tiếng máy đưa ra rồi.',
        rhyme: 'Không cùng vần.',
        used: 'Từ này bạn đã dùng trong ván này rồi.'
    };

    function mount() {
        var input = document.getElementById('gameInput');
        var form = document.getElementById('gameForm');
        var targetEl = document.getElementById('gameTarget');
        var targetWord = document.getElementById('gameTargetWord');
        var targetInfo = document.getElementById('gameTargetInfo');
        var feedback = document.getElementById('gameFeedback');
        var logEl = document.getElementById('gameLog');
        var restart = document.getElementById('gameRestart');
        var toastEl = document.getElementById('gameToast');
        var panel = document.getElementById('gamePanel');
        if (!input || !form || !targetEl || !root_words()) return;

        var state = build(root_words());
        var score = ChoiTu.createScore({
            slug: 'tim-van',
            scoreEl: document.getElementById('gameScore'),
            bestEl: document.getElementById('gameBest')
        });
        var recent = [];
        var used = {};
        var target = null;

        function setFeedback(html, kind) {
            feedback.innerHTML = html;
            feedback.className = 'game-feedback' + (kind ? ' game-feedback--' + kind : '');
        }

        function nextTarget() {
            target = pickTarget(state, recent);
            targetWord.textContent = target.word;
            targetInfo.textContent = 'vần -' + target.key + ' · thanh ' + Van.toneLabel(target.tone) +
                ' (' + (target.toneClass === 'bang' ? 'bằng' : 'trắc') + ')';
            input.value = '';
            input.focus();
        }

        function newGame() {
            score.reset();
            used = {};
            if (logEl) logEl.innerHTML = '';
            setFeedback('Gõ một từ cùng vần với tiếng bên trên — ví dụ nếu máy ra <em>đâu</em>, bạn có thể gõ <em>cầu</em> hoặc <em>sau</em>.', '');
            nextTarget();
        }

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var answer = input.value;
            var r = check(state, target, answer, used);
            var shown = ChoiTu.esc(answer.trim());
            if (r.ok) {
                used[r.key] = true;
                score.add(1);
                ChoiTu.flash(panel, 'is-right');
                var kindText = r.kind === 'exact' ? 'vần chính' : 'vần thông';
                setFeedback('✓ <strong>' + shown + '</strong> — ' + kindText + ', +1 điểm', 'right');
                ChoiTu.logLine(logEl, '<span class="game-log__machine">' + ChoiTu.esc(target.word) + '</span> → <span class="game-log__you">' + shown + '</span> <span class="game-log__ok">✓</span>');
                nextTarget();
            } else {
                var hadScore = score.get();
                score.reset();
                ChoiTu.flash(panel, 'is-wrong');
                var msg = '✗ ' + (shown ? '<strong>' + shown + '</strong> — ' : '') + REASON_TEXT[r.reason];
                if (r.reason === 'rhyme' && r.entry) msg += ' (vần -' + ChoiTu.esc(r.entry.key) + ')';
                if (r.reason !== 'empty') {
                    var hints = suggest(state, target, SUGGEST_COUNT, used);
                    if (hints.length) msg += '<br>Gợi ý: <em>' + hints.map(ChoiTu.esc).join(', ') + '</em>';
                    if (hadScore) msg += '<br><small>Điểm về 0 — thử lại với tiếng này nhé.</small>';
                    ChoiTu.logLine(logEl, '<span class="game-log__machine">' + ChoiTu.esc(target.word) + '</span> → <span class="game-log__you">' + shown + '</span> <span class="game-log__bad">✗</span>');
                }
                setFeedback(msg, 'wrong');
                input.select();
            }
        });

        if (restart) restart.addEventListener('click', function () {
            newGame();
            ChoiTu.toast(toastEl, 'Ván mới — điểm về 0');
        });

        newGame();
    }

    function root_words() {
        return (typeof window !== 'undefined' && window.VAN_WORDS) || null;
    }

    return {
        build: build,
        pickTarget: pickTarget,
        check: check,
        suggest: suggest,
        mount: mount,
        MIN_FREQ: MIN_FREQ,
        HINT_MIN_FREQ: HINT_MIN_FREQ,
        MIN_CANDIDATES: MIN_CANDIDATES,
        ACCEPT_LOOSE: ACCEPT_LOOSE
    };
}));
