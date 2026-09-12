/* Trò "Nối từ" (/choi-tu/noi-tu/): máy và người luân phiên nối từ hai tiếng,
 * tiếng đầu của từ sau phải trùng tiếng cuối của từ trước (trùng cả dấu).
 * Luật chi tiết: docs/choi-tu.md mục 4. Core thuần hàm, export cho Node
 * (game_noi_tu.test.js); UI chỉ chạy khi có document.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./van.js'), require('./choi_tu.js'));
    } else {
        root.GameNoiTu = factory(root.Van, root.ChoiTu);
        if (typeof document !== 'undefined') root.GameNoiTu.mount();
    }
}(typeof self !== 'undefined' ? self : this, function (Van, ChoiTu) {
    'use strict';

    /* Ngưỡng chọn từ mở ván (docs/choi-tu.md mục 4.2) */
    var MIN_FREQ = 5;       // cả hai tiếng của từ mở ván phải xuất hiện trong ≥ 5 từ ghép
    var MIN_OPENINGS = 3;   // tiếng cuối phải mở đầu ≥ 3 từ để người chơi có lựa chọn
    var SUGGEST_COUNT = 3;
    var WIN_BONUS = 2;      // máy chịu thua → thưởng

    /* ── Core ── */

    function makeEntry(word) {
        var parts = ChoiTu.splitWord(word);
        return {
            word: parts.join(' '),
            key: ChoiTu.sylKey(parts[0]) + ' ' + ChoiTu.sylKey(parts[1]),
            first: ChoiTu.sylKey(parts[0]),
            last: ChoiTu.sylKey(parts[1]),
            lastSyl: parts[1]
        };
    }

    function build(words) {
        var freq = ChoiTu.buildFreq(words);
        var byFirst = {};
        var dict = {};
        var entries = [];
        var i;
        for (i = 0; i < words.length; i++) {
            var w = words[i];
            if (w.indexOf('-') !== -1) continue;          // từ mượn viết gạch nối: bỏ
            var parts = ChoiTu.splitWord(w);
            if (parts.length !== 2) continue;
            var e = makeEntry(w);
            if (dict[e.key]) continue;                    // trùng (khác vị trí dấu)
            dict[e.key] = e;
            entries.push(e);
            (byFirst[e.first] || (byFirst[e.first] = [])).push(e);
        }
        var openPool = [];
        for (i = 0; i < entries.length; i++) {
            var x = entries[i];
            var p = x.word.split(' ');
            if ((freq[p[0]] || 0) < MIN_FREQ || (freq[p[1]] || 0) < MIN_FREQ) continue;
            if (!byFirst[x.last] || byFirst[x.last].length < MIN_OPENINGS) continue;
            openPool.push(x);
        }
        return { byFirst: byFirst, dict: dict, freq: freq, openPool: openPool, total: entries.length };
    }

    function openWord(state, recent) {
        return ChoiTu.pickRandom(state.openPool, recent);
    }

    /* Các từ chưa dùng bắt đầu bằng tiếng sylKey */
    function options(state, sylKey, used) {
        var list = state.byFirst[sylKey] || [];
        var out = [];
        for (var i = 0; i < list.length; i++) if (!used[list[i].key]) out.push(list[i]);
        return out;
    }

    function canContinue(state, sylKey, used) {
        return options(state, sylKey, used).length > 0;
    }

    /* Kiểm tra từ người chơi. prev = entry của máy. reason: empty | count | start | unknown | used */
    function validateMove(state, prev, answer, used) {
        var parts = ChoiTu.splitWord(answer || '');
        if (!parts.length) return { ok: false, reason: 'empty' };
        if (parts.length !== 2) return { ok: false, reason: 'count' };
        var e = makeEntry(parts.join(' '));
        if (e.first !== prev.last) return { ok: false, reason: 'start', entry: e };
        var known = state.dict[e.key];
        if (!known) return { ok: false, reason: 'unknown', entry: e };
        if (used[known.key]) return { ok: false, reason: 'used', entry: known };
        return { ok: true, entry: known };
    }

    /* Máy chọn từ nối tiếp sau tiếng sylKey. Ưu tiên từ mà người chơi vẫn còn đường nối
     * (máy chơi "hiền"); hết mới lấy bất kỳ; null nếu không còn từ nào. */
    function machineMove(state, sylKey, used) {
        var cands = options(state, sylKey, used);
        if (!cands.length) return null;
        var open = [];
        for (var i = 0; i < cands.length; i++) {
            var next = options(state, cands[i].last, used);
            // trừ chính từ đang xét nếu nó tự nối được với mình (vd "người người")
            var n = next.length - (next.indexOf(cands[i]) !== -1 ? 1 : 0);
            if (n >= 1) open.push(cands[i]);
        }
        var pool = open.length ? open : cands;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    function suggest(state, sylKey, used, n) {
        var cands = options(state, sylKey, used);
        // ưu tiên từ có tiếng thứ hai phổ biến để gợi ý là từ quen
        cands.sort(function (a, b) {
            return (state.freq[b.word.split(' ')[1]] || 0) - (state.freq[a.word.split(' ')[1]] || 0);
        });
        return cands.slice(0, n || SUGGEST_COUNT).map(function (e) { return e.word; });
    }

    /* ── UI ── */

    var REASON_TEXT = {
        empty: 'Gõ một từ hai tiếng rồi bấm Nối nhé.',
        count: 'Từ phải có đúng hai tiếng.',
        start: 'Từ phải bắt đầu bằng tiếng «{syl}».',
        unknown: 'Từ điển chưa có từ này.',
        used: 'Từ này đã xuất hiện trong ván rồi.'
    };

    function mount() {
        var input = document.getElementById('gameInput');
        var form = document.getElementById('gameForm');
        var chainEl = document.getElementById('gameChain');
        var needEl = document.getElementById('gameNeed');
        var feedback = document.getElementById('gameFeedback');
        var restart = document.getElementById('gameRestart');
        var giveUp = document.getElementById('gameGiveUp');
        var toastEl = document.getElementById('gameToast');
        var panel = document.getElementById('gamePanel');
        var words = (typeof window !== 'undefined' && window.VAN_WORDS) || null;
        if (!input || !form || !chainEl || !words) return;

        var state = build(words);
        var score = ChoiTu.createScore({
            slug: 'noi-tu',
            scoreEl: document.getElementById('gameScore'),
            bestEl: document.getElementById('gameBest')
        });
        var recent = [];
        var used = {};
        var last = null;     // entry cuối cùng trong chuỗi (của máy khi tới lượt người)
        var busy = false;    // đang chờ ván mới, khoá ô nhập

        function setFeedback(html, kind) {
            feedback.innerHTML = html;
            feedback.className = 'game-feedback' + (kind ? ' game-feedback--' + kind : '');
        }

        function addChip(entry, who) {
            var chip = document.createElement('span');
            chip.className = 'game-chip game-chip--' + who;
            chip.textContent = entry.word;
            chainEl.appendChild(chip);
            chainEl.scrollLeft = chainEl.scrollWidth; // luôn thấy từ mới nhất, không kéo trang
        }

        function setTurn(entry) {
            last = entry;
            needEl.textContent = entry.lastSyl;
            input.value = entry.lastSyl + ' ';
            input.focus();
            try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) { /* ok */ }
        }

        function newRound(keepScore) {
            if (!keepScore) score.reset();
            used = {};
            chainEl.innerHTML = '';
            chainEl.classList.remove('is-over');
            busy = false;
            input.disabled = false;
            var open = openWord(state, recent);
            used[open.key] = true;
            addChip(open, 'machine');
            setTurn(open);
        }

        /* Kết thúc ván: mờ chuỗi 1,5 s rồi mở ván mới */
        function endRound(keepScore) {
            busy = true;
            input.disabled = true;
            chainEl.classList.add('is-over');
            setTimeout(function () { newRound(keepScore); }, 1500);
        }

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            if (busy) return;
            var answer = input.value;
            var r = validateMove(state, last, answer, used);
            var shown = ChoiTu.esc(ChoiTu.splitWord(answer).join(' '));
            if (!r.ok) {
                var hadScore = score.get();
                score.reset();
                ChoiTu.flash(panel, 'is-wrong');
                var msg = '✗ ' + (shown ? '<strong>' + shown + '</strong> — ' : '') +
                    REASON_TEXT[r.reason].replace('{syl}', ChoiTu.esc(last.lastSyl));
                if (r.reason !== 'empty') {
                    var hints = suggest(state, last.last, used);
                    if (hints.length) msg += '<br>Gợi ý: <em>' + hints.map(ChoiTu.esc).join(', ') + '</em>';
                    if (hadScore) msg += '<br><small>Điểm về 0 — vẫn lượt của bạn, thử lại nhé.</small>';
                }
                setFeedback(msg, 'wrong');
                input.select();
                return;
            }

            used[r.entry.key] = true;
            addChip(r.entry, 'you');
            score.add(1);
            ChoiTu.flash(panel, 'is-right');

            var reply = machineMove(state, r.entry.last, used);
            if (!reply) {
                score.add(WIN_BONUS);
                setFeedback('✓ <strong>' + shown + '</strong> — máy không nối được từ nào bắt đầu bằng «' +
                    ChoiTu.esc(r.entry.lastSyl) + '». <strong>Máy chịu thua!</strong> +' + (1 + WIN_BONUS) + ' điểm, ván mới bắt đầu.', 'right');
                endRound(true);
                return;
            }
            used[reply.key] = true;
            addChip(reply, 'machine');
            setFeedback('✓ <strong>' + shown + '</strong> +1 · máy nối: <strong>' + ChoiTu.esc(reply.word) + '</strong>', 'right');
            setTurn(reply);

            // máy đã rơi vào ngõ cụt cho người chơi (hiếm): báo để bấm Chịu thua = thắng ván
            if (!canContinue(state, reply.last, used)) {
                setFeedback('Máy nối <strong>' + ChoiTu.esc(reply.word) + '</strong> — nhưng từ điển không còn từ nào bắt đầu bằng «' +
                    ChoiTu.esc(reply.lastSyl) + '». Bấm <em>Chịu thua</em> để tính thắng ván và mở ván mới.', 'right');
            }
        });

        if (giveUp) giveUp.addEventListener('click', function () {
            if (busy || !last) return;
            var hints = suggest(state, last.last, used, 1);
            if (!hints.length) {
                // người chơi không thể nối → thắng ván
                score.add(WIN_BONUS);
                setFeedback('Không còn từ nào để nối — <strong>bạn thắng ván này!</strong> +' + WIN_BONUS + ' điểm.', 'right');
                endRound(true);
                return;
            }
            score.reset();
            setFeedback('Bạn chịu thua. Một cách nối: <strong>' + ChoiTu.esc(hints[0]) + '</strong>. Điểm về 0, ván mới bắt đầu.', 'wrong');
            endRound(false);
        });

        if (restart) restart.addEventListener('click', function () {
            newRound(false);
            setFeedback('Ván mới. Gõ một từ hai tiếng bắt đầu bằng tiếng máy vừa kết thúc.', '');
            ChoiTu.toast(toastEl, 'Ván mới — điểm về 0');
        });

        newRound(false);
        setFeedback('Máy đã ra từ đầu tiên. Gõ một từ hai tiếng bắt đầu bằng tiếng «' + ChoiTu.esc(last.lastSyl) + '» rồi bấm Nối.', '');
    }

    return {
        build: build,
        makeEntry: makeEntry,
        openWord: openWord,
        options: options,
        canContinue: canContinue,
        validateMove: validateMove,
        machineMove: machineMove,
        suggest: suggest,
        mount: mount,
        MIN_FREQ: MIN_FREQ,
        MIN_OPENINGS: MIN_OPENINGS,
        WIN_BONUS: WIN_BONUS
    };
}));
