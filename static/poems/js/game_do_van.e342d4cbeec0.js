/* Trò "Đố vần" (/choi-tu/do-van/): máy cho phần vần và bốn từ ghép bị khuyết
 * một tiếng (u ___, ___ riêng, bi ___, ___ muộn → "sầu"), người chơi đoán tiếng.
 * Đoán ngay +3, lần hai +2, lần ba +1; sai ba lần điểm về 0. Mỗi lần sai mở thêm
 * gợi ý (thanh, rồi phụ âm đầu). Luật chi tiết: docs/choi-tu.md mục 12.
 * Core thuần hàm, export cho Node (game_do_van.test.js); UI chỉ chạy khi có document.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./van.js'), require('./choi_tu.js'));
    } else {
        root.GameDoVan = factory(root.Van, root.ChoiTu);
        if (typeof document !== 'undefined') root.GameDoVan.mount();
    }
}(typeof self !== 'undefined' ? self : this, function (Van, ChoiTu) {
    'use strict';

    var CLUES = 4;          // số từ ghép bị khuyết hiện ra
    var MIN_FREQ = 10;      // tiếng đố phải xuất hiện trong ≥ 10 từ ghép (đủ quen, đủ manh mối)
    var TRIES = 3;          // số lần đoán; điểm = TRIES - số lần sai trước đó
    var MAX_TRIES_POINTS = [3, 2, 1];

    /* ── Core ── */

    /* Chỉ mục: với mỗi tiếng (sylKey) → các từ 2 tiếng chứa nó; dict[wordKey] để chấm đáp án khác. */
    function build(words) {
        var freq = ChoiTu.buildFreq(words);
        var dict = {}, contains = {}, syl = {};
        for (var i = 0; i < words.length; i++) {
            var w = words[i];
            if (w.indexOf('-') !== -1) continue;
            var parts = ChoiTu.splitWord(w);
            if (parts.length !== 2) continue;
            var a = ChoiTu.sylKey(parts[0]), b = ChoiTu.sylKey(parts[1]);
            var key = a + ' ' + b;
            if (dict[key]) continue;
            var e = { word: parts.join(' '), key: key, first: a, last: b, parts: parts };
            dict[key] = e;
            (contains[a] || (contains[a] = [])).push(e);
            if (b !== a) (contains[b] || (contains[b] = [])).push(e);
            if (!syl[a]) syl[a] = parts[0];
            if (!syl[b]) syl[b] = parts[1];
        }
        // kho tiếng đố: quen thuộc, tách được vần, có ≥ CLUES từ ghép chứa nó
        var pool = [];
        for (var k in contains) {
            var s = syl[k];
            if ((freq[s] || 0) < MIN_FREQ || contains[k].length < CLUES) continue;
            if (!Van.analyzeWord(s)) continue;
            pool.push(k);
        }
        return { dict: dict, contains: contains, syl: syl, freq: freq, pool: pool };
    }

    /* Một câu đố: tiếng t và CLUES từ ghép chứa t (trộn vị trí đầu/cuối, ưu tiên từ quen). */
    function makePuzzle(state, recent) {
        var k = ChoiTu.pickRandom(state.pool, recent);
        var s = state.syl[k];
        var list = state.contains[k].slice();
        // điểm "quen": tiếng còn lại càng phổ biến càng dễ nhận ra từ
        list.sort(function (x, y) {
            var ox = x.first === k ? x.parts[1] : x.parts[0], oy = y.first === k ? y.parts[1] : y.parts[0];
            return (state.freq[oy] || 0) - (state.freq[ox] || 0);
        });
        // lấy trong top 12 quen nhất, xáo để mỗi lần khác nhau
        var top = list.slice(0, 12);
        for (var i = top.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = top[i]; top[i] = top[j]; top[j] = t; }
        var clues = top.slice(0, CLUES).map(function (e) {
            return { entry: e, position: e.first === k ? 'first' : 'last', other: e.first === k ? e.parts[1] : e.parts[0] };
        });
        var a = Van.analyzeWord(s);
        return { key: k, answer: s, clues: clues, rime: a.key, tone: a.tone, toneClass: a.toneClass, onset: a.onset };
    }

    /* Chấm: đúng nếu là chính tiếng đó, hoặc một tiếng khác mà ghép với MỌI manh mối đều ra từ có trong từ điển. */
    function check(state, puzzle, answer) {
        var parts = ChoiTu.splitWord(answer || '');
        if (!parts.length) return { ok: false, reason: 'empty' };
        if (parts.length !== 1) return { ok: false, reason: 'count' };
        var k = ChoiTu.sylKey(parts[0]);
        if (k === puzzle.key) return { ok: true, kind: 'exact' };
        for (var i = 0; i < puzzle.clues.length; i++) {
            var c = puzzle.clues[i];
            var key = c.position === 'first' ? k + ' ' + c.entry.last : c.entry.first + ' ' + k;
            if (!state.dict[key]) return { ok: false, reason: 'wrong', failedClue: c };
        }
        return { ok: true, kind: 'alt' };
    }

    /* ── UI ── */

    function mount() {
        var input = document.getElementById('gameInput');
        var form = document.getElementById('gameForm');
        var cluesEl = document.getElementById('gameClues');
        var hintEl = document.getElementById('gameHint');
        var triesEl = document.getElementById('gameTries');
        var feedback = document.getElementById('gameFeedback');
        var restart = document.getElementById('gameRestart');
        var skip = document.getElementById('gameSkip');
        var submitBtn = document.getElementById('gameSubmit');
        var toastEl = document.getElementById('gameToast');
        var panel = document.getElementById('gamePanel');
        var words = (typeof window !== 'undefined' && window.VAN_WORDS) || null;
        if (!input || !form || !cluesEl || !words) return;

        var state = build(words);
        var score = ChoiTu.createScore({
            slug: 'do-van',
            scoreEl: document.getElementById('gameScore'),
            bestEl: document.getElementById('gameBest')
        });
        var recent = [], puzzle = null, wrong = 0, revealed = false;

        function setFeedback(html, kind) {
            feedback.innerHTML = html;
            feedback.className = 'game-feedback' + (kind ? ' game-feedback--' + kind : '');
        }

        function renderClues(fill) {
            var html = '';
            for (var i = 0; i < puzzle.clues.length; i++) {
                var c = puzzle.clues[i];
                var blank = '<span class="game-blank' + (fill ? ' game-blank--filled' : '') + '">' + (fill ? ChoiTu.esc(fill) : '&nbsp;') + '</span>';
                html += '<li>' + (c.position === 'first' ? blank + ' ' + ChoiTu.esc(c.other) : ChoiTu.esc(c.other) + ' ' + blank) + '</li>';
            }
            cluesEl.innerHTML = html;
        }

        function renderHint() {
            var parts = ['vần <strong>-' + ChoiTu.esc(puzzle.rime) + '</strong>'];
            if (wrong >= 1) parts.push('thanh <strong>' + Van.toneLabel(puzzle.tone) + '</strong> (' + (puzzle.toneClass === 'bang' ? 'bằng' : 'trắc') + ')');
            if (wrong >= 2) parts.push(puzzle.onset ? 'bắt đầu bằng <strong>' + ChoiTu.esc(puzzle.onset) + '-</strong>' : '<strong>không có phụ âm đầu</strong>');
            hintEl.innerHTML = parts.join(' · ');
        }

        function renderTries() {
            var html = '';
            for (var i = 0; i < TRIES; i++) html += '<span class="game-try' + (i < wrong ? ' is-used' : '') + '"></span>';
            triesEl.innerHTML = html;
        }

        function nextPuzzle() {
            puzzle = makePuzzle(state, recent);
            wrong = 0;
            revealed = false;
            renderClues();
            renderHint();
            renderTries();
            input.value = '';
            input.disabled = false;
            if (submitBtn) submitBtn.textContent = 'Đoán';
            input.focus();
        }

        function reveal(kind, html) {
            revealed = true;
            renderClues(puzzle.answer);
            if (submitBtn) submitBtn.textContent = 'Câu tiếp';
            setFeedback(html, kind);
            input.focus();
        }

        function newGame() {
            score.reset();
            setFeedback('Bốn từ ghép bên trên cùng khuyết một tiếng. Đoán tiếng đó — đoán ngay được +3.', '');
            nextPuzzle();
        }

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            if (revealed) { nextPuzzle(); return; }
            var answer = input.value;
            var r = check(state, puzzle, answer);
            var shown = ChoiTu.esc(ChoiTu.splitWord(answer).join(' '));
            if (r.ok) {
                var pts = MAX_TRIES_POINTS[wrong];
                score.add(pts);
                ChoiTu.flash(panel, 'is-right');
                var msg = '✓ <strong>' + shown + '</strong> +' + pts + ' điểm.';
                if (r.kind === 'alt') msg += ' Tiếng máy nghĩ tới là <strong>' + ChoiTu.esc(puzzle.answer) + '</strong>, nhưng đáp án của bạn cũng ghép được cả bốn từ.';
                reveal('right', msg + ' Enter để sang câu khác.');
                return;
            }
            if (r.reason === 'empty' || r.reason === 'count') {
                setFeedback(r.reason === 'empty' ? 'Gõ một tiếng rồi bấm Đoán nhé.' : 'Chỉ cần một tiếng thôi.', 'wrong');
                input.select();
                return;
            }
            wrong++;
            ChoiTu.flash(panel, 'is-wrong');
            renderTries();
            if (wrong >= TRIES) {
                var had = score.get();
                score.reset();
                reveal('wrong', '✗ <strong>' + shown + '</strong> — hết lượt. Đáp án: <strong>' + ChoiTu.esc(puzzle.answer) + '</strong>.' +
                    (had ? ' Điểm về 0.' : '') + ' Enter để sang câu khác.');
                return;
            }
            renderHint();
            var fc = r.failedClue;
            var tried = fc.position === 'first' ? shown + ' ' + ChoiTu.esc(fc.other) : ChoiTu.esc(fc.other) + ' ' + shown;
            setFeedback('✗ <strong>' + shown + '</strong> — «' + tried + '» không có trong từ điển. Còn ' + (TRIES - wrong) +
                ' lần, đã mở thêm gợi ý.', 'wrong');
            input.select();
        });

        if (skip) skip.addEventListener('click', function () {
            if (!puzzle) return;
            if (revealed) { nextPuzzle(); return; }
            score.reset();
            reveal('wrong', 'Đáp án: <strong>' + ChoiTu.esc(puzzle.answer) + '</strong>. Điểm về 0. Enter để sang câu khác.');
        });

        if (restart) restart.addEventListener('click', function () {
            newGame();
            ChoiTu.toast(toastEl, 'Ván mới — điểm về 0');
        });

        newGame();
    }

    return {
        build: build,
        makePuzzle: makePuzzle,
        check: check,
        mount: mount,
        CLUES: CLUES,
        TRIES: TRIES,
        MIN_FREQ: MIN_FREQ
    };
}));
