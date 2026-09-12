/* Khung dùng chung cho các trò ở /choi-tu/: chuẩn hoá tiếng/từ, độ phổ biến
 * của tiếng, chọn ngẫu nhiên tránh lặp, bảng điểm + kỷ lục (localStorage),
 * toast. Không chứa luật của trò nào. Chi tiết: docs/choi-tu.md.
 * Dùng chung cho trình duyệt (window.ChoiTu) và Node (module.exports).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./van.js'));
    else root.ChoiTu = factory(root.Van);
}(typeof self !== 'undefined' ? self : this, function (Van) {
    'use strict';

    /* ── Chuẩn hoá ── */

    /* Tách từ thành các tiếng: khoảng trắng hoặc gạch nối, bỏ rỗng, chữ thường. */
    function splitWord(word) {
        return String(word).trim().toLowerCase().normalize('NFC').split(/[\s\-]+/).filter(Boolean);
    }

    /* Khoá so sánh một tiếng: base + thanh, để 'hòa' và 'hoà' là một, nhưng 'sinh' ≠ 'sính'. */
    function sylKey(syllable) {
        var t = Van.splitTone(syllable);
        return t.base + '|' + t.tone;
    }

    function wordKey(word) {
        return splitWord(word).map(sylKey).join(' ');
    }

    /* ── Độ phổ biến của tiếng: số từ ghép có chứa tiếng đó (docs/choi-tu.md mục 2.2) ── */
    function buildFreq(words) {
        var freq = {};
        for (var i = 0; i < words.length; i++) {
            var parts = splitWord(words[i]);
            if (parts.length < 2) continue;
            for (var j = 0; j < parts.length; j++) freq[parts[j]] = (freq[parts[j]] || 0) + 1;
        }
        return freq;
    }

    /* ── Ngẫu nhiên, tránh lặp lại các mục vừa ra ── */
    function pickRandom(list, recent, limit) {
        if (!list.length) return null;
        recent = recent || [];
        limit = limit || 20;
        var pick = null;
        for (var tries = 0; tries < 30; tries++) {
            pick = list[Math.floor(Math.random() * list.length)];
            if (recent.indexOf(pick) === -1) break;
        }
        recent.push(pick);
        if (recent.length > limit) recent.shift();
        return pick;
    }

    /* ── Bảng điểm: điểm hiện tại + kỷ lục lưu localStorage (bọc try/catch) ── */
    function createScore(opts) {
        var key = 'choi-tu:' + opts.slug + ':best';
        var score = 0;
        var best = 0;
        try { best = parseInt(localStorage.getItem(key), 10) || 0; } catch (e) { best = 0; }

        function saveBest() {
            try { localStorage.setItem(key, String(best)); } catch (e) { /* riêng tư / bị chặn — bỏ qua */ }
        }
        function render() {
            if (opts.scoreEl) opts.scoreEl.textContent = score;
            if (opts.bestEl) opts.bestEl.textContent = best;
        }
        render();
        return {
            get: function () { return score; },
            add: function (n) {
                score += n;
                if (score > best) { best = score; saveBest(); }
                render();
                return score;
            },
            reset: function () { score = 0; render(); }
        };
    }

    /* ── Tiện ích DOM ── */
    function esc(text) {
        return String(text).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    var toastTimer = null;
    function toast(el, message) {
        if (!el) return;
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.classList.remove('show'); }, 1600);
    }

    /* Thêm class trong chốc lát (viền xanh/đỏ khi đúng/sai) */
    function flash(el, cls, ms) {
        if (!el) return;
        el.classList.remove('is-right', 'is-wrong');
        void el.offsetWidth; // ép trình duyệt tính lại để animation chạy lại
        el.classList.add(cls);
        setTimeout(function () { el.classList.remove(cls); }, ms || 700);
    }

    /* Nhật ký: thêm một dòng lên đầu, giữ tối đa max dòng */
    function logLine(el, html, max) {
        if (!el) return;
        var li = document.createElement('li');
        li.innerHTML = html;
        el.insertBefore(li, el.firstChild);
        while (el.children.length > (max || 10)) el.removeChild(el.lastChild);
    }

    return {
        splitWord: splitWord,
        sylKey: sylKey,
        wordKey: wordKey,
        buildFreq: buildFreq,
        pickRandom: pickRandom,
        createScore: createScore,
        esc: esc,
        toast: toast,
        flash: flash,
        logLine: logLine
    };
}));
