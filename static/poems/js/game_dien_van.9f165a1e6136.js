/* Trò "Điền vần thơ" (/choi-tu/dien-van/): lấy một cặp lục bát trong thơ của
 * trang (window.POEMS_DATA), giấu tiếng gieo vần ở câu bát (tiếng thứ 6),
 * người chơi điền lại. Đúng nguyên bản +2, khác nguyên bản nhưng hợp vần và có
 * trong từ điển +1, sai về 0. Luật chi tiết: docs/choi-tu.md mục 10.
 * Core thuần hàm, export cho Node (game_dien_van.test.js); UI chỉ chạy khi có document.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./van.js'), require('./choi_tu.js'));
    } else {
        root.GameDienVan = factory(root.Van, root.ChoiTu);
        if (typeof document !== 'undefined') root.GameDienVan.mount();
    }
}(typeof self !== 'undefined' ? self : this, function (Van, ChoiTu) {
    'use strict';

    var EXACT_POINTS = 2;   // đúng tiếng tác giả dùng
    var RHYME_POINTS = 1;   // tiếng khác nhưng hợp vần và có trong từ điển
    var HIDE_INDEX = 5;     // tiếng thứ 6 của câu bát (vị trí gieo vần với tiếng thứ 6 câu lục)

    /* ── Core ── */

    /* Bỏ dấu câu ở đầu/cuối token để phân tích, giữ nguyên chuỗi để hiển thị */
    function bare(token) {
        return token.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
    }

    function splitLine(line) {
        return line.trim().split(/\s+/).filter(Boolean);
    }

    /* Từ danh sách bài thơ → danh sách câu đố {slug, title, luc, bat, answer, ...}.
     * Chỉ lấy cặp 6/8 liền nhau mà tiếng 6 câu lục hiệp vần (cùng lớp) với tiếng 6 câu bát. */
    function buildPuzzles(poems) {
        var out = [];
        for (var p = 0; p < poems.length; p++) {
            var poem = poems[p];
            var lines = String(poem.content || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
            for (var i = 0; i + 1 < lines.length; i++) {
                var luc = splitLine(lines[i]), bat = splitLine(lines[i + 1]);
                if (luc.length !== 6 || bat.length !== 8) continue;
                var a = Van.analyzeWord(bare(luc[5])), b = Van.analyzeWord(bare(bat[HIDE_INDEX]));
                if (!a || !b || a.cls !== b.cls) continue;
                out.push({
                    slug: poem.slug, title: poem.title,
                    luc: luc, bat: bat,
                    answer: bare(bat[HIDE_INDEX]).toLowerCase(),
                    answerKey: ChoiTu.sylKey(bare(bat[HIDE_INDEX])),
                    rhyme: a,                       // tiếng gieo vần ở câu lục — để hiện gợi ý vần/thanh
                    exact: a.key === b.key          // vần chính hay vần thông
                });
            }
        }
        return out;
    }

    /* Tập từ đơn trong từ điển (khoá sylKey) để chấm đáp án "hợp vần" */
    function buildSingles(words) {
        var set = {};
        for (var i = 0; i < words.length; i++) {
            if (/[\s\-]/.test(words[i])) continue;
            set[ChoiTu.sylKey(words[i])] = true;
        }
        return set;
    }

    /* Thứ tự chơi: xáo trộn, đi hết rồi mới lặp */
    function shuffle(list) {
        var a = list.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    /* Chấm: { ok, kind: 'exact'|'rhyme', points, reason: empty|count|unknown|rhyme } */
    function check(puzzle, singles, answer) {
        var parts = ChoiTu.splitWord(answer || '');
        if (!parts.length) return { ok: false, reason: 'empty' };
        if (parts.length !== 1) return { ok: false, reason: 'count' };
        var key = ChoiTu.sylKey(parts[0]);
        if (key === puzzle.answerKey) return { ok: true, kind: 'exact', points: EXACT_POINTS };
        var a = Van.analyzeWord(parts[0]);
        if (!a || a.cls !== puzzle.rhyme.cls) return { ok: false, reason: 'rhyme', entry: a };
        if (!singles[key]) return { ok: false, reason: 'unknown', entry: a };
        return { ok: true, kind: 'rhyme', points: RHYME_POINTS };
    }

    /* ── UI ── */

    var REASON_TEXT = {
        empty: 'Gõ một tiếng rồi bấm Điền nhé.',
        count: 'Chỉ cần một tiếng thôi.',
        rhyme: 'Không hiệp vần với tiếng «{r}» ở câu lục.',
        unknown: 'Hợp vần nhưng từ điển không có tiếng này.'
    };

    function mount() {
        var input = document.getElementById('gameInput');
        var form = document.getElementById('gameForm');
        var lucEl = document.getElementById('gameLuc');
        var batEl = document.getElementById('gameBat');
        var hintEl = document.getElementById('gameHint');
        var sourceEl = document.getElementById('gameSource');
        var feedback = document.getElementById('gameFeedback');
        var restart = document.getElementById('gameRestart');
        var skip = document.getElementById('gameSkip');
        var toastEl = document.getElementById('gameToast');
        var panel = document.getElementById('gamePanel');
        var submitBtn = document.getElementById('gameSubmit');
        var poems = (typeof window !== 'undefined' && window.POEMS_DATA) || null;
        var words = (typeof window !== 'undefined' && window.VAN_WORDS) || null;
        if (!input || !form || !lucEl || !poems || !words) return;

        var puzzles = buildPuzzles(poems);
        var singles = buildSingles(words);
        if (!puzzles.length) {
            feedback.textContent = 'Chưa có cặp lục bát nào để đố — hãy quay lại sau nhé.';
            input.disabled = true;
            return;
        }
        var score = ChoiTu.createScore({
            slug: 'dien-van',
            scoreEl: document.getElementById('gameScore'),
            bestEl: document.getElementById('gameBest')
        });
        var order = [], cursor = 0, current = null, revealed = false;

        function setFeedback(html, kind) {
            feedback.innerHTML = html;
            feedback.className = 'game-feedback' + (kind ? ' game-feedback--' + kind : '');
        }

        function renderLine(el, tokens, hideIdx, fill) {
            var html = '';
            for (var i = 0; i < tokens.length; i++) {
                if (i === hideIdx) {
                    html += '<span class="game-blank' + (fill ? ' game-blank--filled' : '') + '">' + (fill ? ChoiTu.esc(fill) : '&nbsp;') + '</span>';
                    // giữ dấu câu đi kèm tiếng bị giấu (vd "sầu,")
                    var tail = tokens[i].replace(/^[^\p{L}]*[\p{L}\p{M}]+/u, '');
                    if (tail) html += ChoiTu.esc(tail);
                } else {
                    html += ChoiTu.esc(tokens[i]);
                }
                if (i < tokens.length - 1) html += ' ';
            }
            el.innerHTML = html;
        }

        function sourceLink(p) {
            return '<a href="/tho/' + encodeURIComponent(p.slug) + '/">Đọc cả bài «' + ChoiTu.esc(p.title) + '» →</a>';
        }

        function nextPuzzle() {
            if (cursor >= order.length) { order = shuffle(puzzles); cursor = 0; }
            current = order[cursor++];
            revealed = false;
            renderLine(lucEl, current.luc, -1);
            renderLine(batEl, current.bat, HIDE_INDEX);
            hintEl.textContent = 'hiệp vần với «' + bare(current.luc[5]) + '» — vần -' + current.rhyme.key +
                (current.exact ? '' : ' (vần thông)');
            sourceEl.innerHTML = '';
            input.value = '';
            input.disabled = false;
            if (submitBtn) submitBtn.textContent = 'Điền';
            input.focus();
        }

        function reveal(kind, extraHtml) {
            revealed = true;
            if (submitBtn) submitBtn.textContent = 'Câu tiếp';
            input.focus();
            renderLine(batEl, current.bat, HIDE_INDEX, bare(current.bat[HIDE_INDEX]));
            sourceEl.innerHTML = sourceLink(current);
            setFeedback(extraHtml, kind);
        }

        function newGame() {
            score.reset();
            order = shuffle(puzzles);
            cursor = 0;
            setFeedback('Điền tiếng còn thiếu vào câu bát. Gợi ý vần nằm ngay dưới hai câu thơ.', '');
            nextPuzzle();
        }

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            if (revealed) { nextPuzzle(); return; }
            var answer = input.value;
            var r = check(current, singles, answer);
            var shown = ChoiTu.esc(ChoiTu.splitWord(answer).join(' '));
            if (r.ok) {
                score.add(r.points);
                ChoiTu.flash(panel, 'is-right');
                if (r.kind === 'exact') {
                    reveal('right', '✓ <strong>' + shown + '</strong> — đúng như tác giả viết, +' + r.points + ' điểm. Enter để sang câu khác.');
                } else {
                    reveal('right', '✓ <strong>' + shown + '</strong> — cũng hợp vần đấy, +' + r.points + ' điểm. Tác giả viết là <strong>' +
                        ChoiTu.esc(current.answer) + '</strong>. Enter để sang câu khác.');
                }
            } else {
                var hadScore = score.get();
                score.reset();
                ChoiTu.flash(panel, 'is-wrong');
                var msg = '✗ ' + (shown ? '<strong>' + shown + '</strong> — ' : '') +
                    REASON_TEXT[r.reason].replace('{r}', ChoiTu.esc(bare(current.luc[5])));
                if (r.reason === 'empty' || r.reason === 'count') { setFeedback(msg, 'wrong'); input.select(); return; }
                if (r.reason === 'rhyme' && r.entry) msg += ' (vần -' + ChoiTu.esc(r.entry.key) + ')';
                msg += '<br>Đáp án: <strong>' + ChoiTu.esc(current.answer) + '</strong>.' +
                    (hadScore ? ' Điểm về 0.' : '') + ' Enter để sang câu khác.';
                reveal('wrong', msg);
            }
        });

        if (skip) skip.addEventListener('click', function () {
            if (!current) return;
            if (revealed) { nextPuzzle(); return; }
            score.reset();
            reveal('wrong', 'Đáp án: <strong>' + ChoiTu.esc(current.answer) + '</strong>. Điểm về 0. Enter để sang câu khác.');
        });

        if (restart) restart.addEventListener('click', function () {
            newGame();
            ChoiTu.toast(toastEl, 'Ván mới — điểm về 0');
        });

        newGame();
    }

    return {
        bare: bare,
        buildPuzzles: buildPuzzles,
        buildSingles: buildSingles,
        shuffle: shuffle,
        check: check,
        mount: mount,
        EXACT_POINTS: EXACT_POINTS,
        RHYME_POINTS: RHYME_POINTS,
        HIDE_INDEX: HIDE_INDEX
    };
}));
