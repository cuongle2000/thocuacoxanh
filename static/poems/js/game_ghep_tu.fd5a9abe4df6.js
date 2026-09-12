/* Trò "Ghép từ" (/choi-tu/ghep-tu/): máy bày 8 tiếng rời, trong 60 giây người
 * chơi ghép càng nhiều từ hai tiếng có trong từ điển càng tốt. Mỗi từ đúng +1,
 * hết giờ xem những từ còn sót. Luật chi tiết: docs/choi-tu.md mục 11.
 * Core thuần hàm, export cho Node (game_ghep_tu.test.js); UI chỉ chạy khi có document.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./van.js'), require('./choi_tu.js'));
    } else {
        root.GameGhepTu = factory(root.Van, root.ChoiTu);
        if (typeof document !== 'undefined') root.GameGhepTu.mount();
    }
}(typeof self !== 'undefined' ? self : this, function (Van, ChoiTu) {
    'use strict';

    var TILES = 8;          // số tiếng bày ra
    var ROUND_SECONDS = 60;
    var MIN_FREQ = 5;       // tiếng bày ra phải xuất hiện trong ≥ 5 từ ghép
    var MIN_WORDS = 8;      // bộ tiếng phải ghép được ≥ 8 từ
    var MAX_WORDS = 30;     // và ≤ 30 (quá nhiều thì loãng)

    /* ── Core ── */

    /* Chỉ mục từ 2 tiếng: dict[wordKey] = từ hiển thị; byFirst/byLast: sylKey → [entry]. */
    function build(words) {
        var freq = ChoiTu.buildFreq(words);
        var dict = {}, byFirst = {}, byLast = {}, syl = {};
        for (var i = 0; i < words.length; i++) {
            var w = words[i];
            if (w.indexOf('-') !== -1) continue;
            var parts = ChoiTu.splitWord(w);
            if (parts.length !== 2) continue;
            var a = ChoiTu.sylKey(parts[0]), b = ChoiTu.sylKey(parts[1]);
            var key = a + ' ' + b;
            if (dict[key]) continue;
            var e = { word: parts.join(' '), key: key, first: a, last: b };
            dict[key] = e;
            (byFirst[a] || (byFirst[a] = [])).push(e);
            (byLast[b] || (byLast[b] = [])).push(e);
            if (!syl[a]) syl[a] = parts[0];
            if (!syl[b]) syl[b] = parts[1];
        }
        return { dict: dict, byFirst: byFirst, byLast: byLast, syl: syl, freq: freq };
    }

    /* Mọi từ ghép được từ một bộ sylKey (hai ô khác nhau, thứ tự có ý nghĩa) */
    function wordsFrom(state, keys) {
        var out = [];
        for (var i = 0; i < keys.length; i++) {
            for (var j = 0; j < keys.length; j++) {
                if (i === j) continue;
                var e = state.dict[keys[i] + ' ' + keys[j]];
                if (e) out.push(e);
            }
        }
        return out;
    }

    /* Sinh bộ TILES tiếng: bắt đầu từ một từ ngẫu nhiên, mỗi bước thêm tiếng "hàng xóm"
     * ghép được nhiều nhất với bộ hiện có (ưu tiên tiếng quen thuộc). Thử vài lần cho tới khi
     * số từ ghép được nằm trong [MIN_WORDS, MAX_WORDS]. */
    function makeTiles(state) {
        var entries = Object.keys(state.dict).map(function (k) { return state.dict[k]; });
        var best = null;
        for (var attempt = 0; attempt < 40; attempt++) {
            var seed = entries[Math.floor(Math.random() * entries.length)];
            if (seed.first === seed.last) continue; // 'người người', 'ngày ngày'
            if ((state.freq[state.syl[seed.first]] || 0) < MIN_FREQ || (state.freq[state.syl[seed.last]] || 0) < MIN_FREQ) continue;
            var keys = [seed.first, seed.last];
            while (keys.length < TILES) {
                var gain = {};
                for (var i = 0; i < keys.length; i++) {
                    var k = keys[i], lists = [state.byFirst[k] || [], state.byLast[k] || []];
                    for (var l = 0; l < 2; l++) {
                        for (var j = 0; j < lists[l].length; j++) {
                            var e = lists[l][j];
                            var other = l === 0 ? e.last : e.first;
                            if (keys.indexOf(other) !== -1) continue;
                            if ((state.freq[state.syl[other]] || 0) < MIN_FREQ) continue;
                            gain[other] = (gain[other] || 0) + 1;
                        }
                    }
                }
                var cands = Object.keys(gain);
                if (!cands.length) break;
                // lấy ngẫu nhiên trong top 5 để mỗi ván khác nhau, không phải luôn tối ưu
                cands.sort(function (x, y) { return gain[y] - gain[x]; });
                keys.push(cands[Math.floor(Math.random() * Math.min(5, cands.length))]);
            }
            if (keys.length < TILES) continue;
            var found = wordsFrom(state, keys);
            if (found.length >= MIN_WORDS && found.length <= MAX_WORDS) return { keys: keys, words: found };
            if (!best || Math.abs(found.length - MIN_WORDS) < Math.abs(best.words.length - MIN_WORDS)) best = { keys: keys, words: found };
        }
        return best;
    }

    /* Chấm một lượt ghép: { ok, entry, reason: empty|count|tile|unknown|used } */
    function check(state, tiles, answer, used) {
        var parts = ChoiTu.splitWord(answer || '');
        if (!parts.length) return { ok: false, reason: 'empty' };
        if (parts.length !== 2) return { ok: false, reason: 'count' };
        var a = ChoiTu.sylKey(parts[0]), b = ChoiTu.sylKey(parts[1]);
        if (tiles.indexOf(a) === -1 || tiles.indexOf(b) === -1 || a === b) return { ok: false, reason: 'tile' };
        var e = state.dict[a + ' ' + b];
        if (!e) return { ok: false, reason: 'unknown' };
        if (used[e.key]) return { ok: false, reason: 'used', entry: e };
        return { ok: true, entry: e };
    }

    /* ── UI ── */

    var REASON_TEXT = {
        empty: 'Chọn hai ô hoặc gõ một từ hai tiếng.',
        count: 'Từ phải có đúng hai tiếng.',
        tile: 'Phải dùng hai ô khác nhau trong tám ô bên trên.',
        unknown: 'Từ điển không có từ này.',
        used: 'Từ này bạn ghép rồi.'
    };

    function mount() {
        var input = document.getElementById('gameInput');
        var form = document.getElementById('gameForm');
        var tilesEl = document.getElementById('gameTiles');
        var foundEl = document.getElementById('gameFound');
        var timerEl = document.getElementById('gameTimer');
        var startBtn = document.getElementById('gameStart');
        var feedback = document.getElementById('gameFeedback');
        var restart = document.getElementById('gameRestart');
        var toastEl = document.getElementById('gameToast');
        var panel = document.getElementById('gamePanel');
        var words = (typeof window !== 'undefined' && window.VAN_WORDS) || null;
        if (!input || !form || !tilesEl || !words) return;

        var state = build(words);
        var score = ChoiTu.createScore({
            slug: 'ghep-tu',
            scoreEl: document.getElementById('gameScore'),
            bestEl: document.getElementById('gameBest')
        });
        var round = null, used = {}, selected = [], timer = null, timeLeft = 0, playing = false;
        var roundFresh = false; // bộ ô đang bày chưa chơi (bày sẵn lúc mở trang) → Bắt đầu dùng luôn bộ đó

        function setFeedback(html, kind) {
            feedback.innerHTML = html;
            feedback.className = 'game-feedback' + (kind ? ' game-feedback--' + kind : '');
        }

        function renderTiles() {
            var html = '';
            for (var i = 0; i < round.keys.length; i++) {
                var k = round.keys[i];
                html += '<button type="button" class="game-tile' + (selected.indexOf(k) !== -1 ? ' is-selected' : '') +
                    '" data-key="' + ChoiTu.esc(k) + '">' + ChoiTu.esc(state.syl[k]) + '</button>';
            }
            tilesEl.innerHTML = html;
        }

        function renderTimer() {
            timerEl.textContent = timeLeft;
            timerEl.classList.toggle('is-low', timeLeft <= 10);
        }

        function addFound(e) {
            var chip = document.createElement('span');
            chip.className = 'game-chip game-chip--you';
            chip.textContent = e.word;
            foundEl.appendChild(chip);
        }

        function stopTimer() { clearInterval(timer); timer = null; }

        function endRound() {
            playing = false;
            stopTimer();
            input.disabled = true;
            selected = [];
            renderTiles();
            var missed = round.words.filter(function (e) { return !used[e.key]; }).map(function (e) { return e.word; });
            var n = score.get();
            var msg = '⏱ Hết giờ! Bạn ghép được <strong>' + n + '/' + round.words.length + '</strong> từ.';
            if (missed.length) msg += '<br>Còn sót: <em>' + missed.map(ChoiTu.esc).join(', ') + '</em>';
            else msg += ' <strong>Trọn bộ — quá giỏi!</strong>';
            msg += '<br><small>Bấm Bắt đầu để chơi ván mới.</small>';
            setFeedback(msg, n ? 'right' : '');
            startBtn.hidden = false;
            startBtn.textContent = 'Ván mới';
        }

        function startRound() {
            if (!roundFresh) round = makeTiles(state);
            roundFresh = false;
            used = {};
            selected = [];
            score.reset();
            foundEl.innerHTML = '';
            renderTiles();
            timeLeft = ROUND_SECONDS;
            renderTimer();
            playing = true;
            input.disabled = false;
            input.value = '';
            input.focus();
            startBtn.hidden = true;
            setFeedback('Bộ này ghép được <strong>' + round.words.length + '</strong> từ. Bấm hai ô theo thứ tự, hoặc gõ rồi Enter.', '');
            stopTimer();
            timer = setInterval(function () {
                timeLeft--;
                renderTimer();
                if (timeLeft <= 0) endRound();
            }, 1000);
        }

        function submitAnswer(text) {
            if (!playing) return;
            var r = check(state, round.keys, text, used);
            var shown = ChoiTu.esc(ChoiTu.splitWord(text).join(' '));
            if (r.ok) {
                used[r.entry.key] = true;
                score.add(1);
                addFound(r.entry);
                ChoiTu.flash(panel, 'is-right');
                setFeedback('✓ <strong>' + shown + '</strong> +1 · còn ' + (round.words.length - score.get()) + ' từ', 'right');
                if (score.get() >= round.words.length) endRound();
            } else {
                ChoiTu.flash(panel, 'is-wrong');
                setFeedback('✗ ' + (shown ? '<strong>' + shown + '</strong> — ' : '') + REASON_TEXT[r.reason], 'wrong');
            }
            input.value = '';
            selected = [];
            renderTiles();
        }

        tilesEl.addEventListener('click', function (e) {
            var btn = e.target.closest('.game-tile');
            if (!btn || !playing) return;
            var k = btn.getAttribute('data-key');
            var idx = selected.indexOf(k);
            if (idx !== -1) { selected.splice(idx, 1); renderTiles(); return; } // bấm lại để bỏ chọn
            selected.push(k);
            if (selected.length === 2) {
                submitAnswer(state.syl[selected[0]] + ' ' + state.syl[selected[1]]);
            } else {
                renderTiles();
                input.value = state.syl[k] + ' ';
            }
        });

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            if (!playing) { startRound(); return; }
            submitAnswer(input.value);
        });

        startBtn.addEventListener('click', startRound);
        if (restart) restart.addEventListener('click', function () {
            startRound();
            ChoiTu.toast(toastEl, 'Ván mới');
        });

        // Chưa bấm Bắt đầu: bày sẵn bộ ô để người chơi thấy trò trông ra sao
        round = makeTiles(state);
        roundFresh = true;
        renderTiles();
        timeLeft = ROUND_SECONDS;
        renderTimer();
        input.disabled = true;
        setFeedback('Bấm <strong>Bắt đầu</strong>: bạn có ' + ROUND_SECONDS + ' giây để ghép các ô thành từ hai tiếng (<em>học</em> + <em>sinh</em> = <em>học sinh</em>).', '');
    }

    return {
        build: build,
        wordsFrom: wordsFrom,
        makeTiles: makeTiles,
        check: check,
        mount: mount,
        TILES: TILES,
        ROUND_SECONDS: ROUND_SECONDS,
        MIN_WORDS: MIN_WORDS,
        MAX_WORDS: MAX_WORDS
    };
}));
