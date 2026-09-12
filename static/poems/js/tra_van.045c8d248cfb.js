/* Trang Tra vần: đọc input, gọi Van.lookup, render kết quả.
 * Dữ liệu: window.VAN_WORDS (van-words.js). Logic: window.Van (van.js).
 * Bố cục: "Từ đơn" (vần chính, vần thông…) rồi "Từ ghép" (vần chính, vần thông…);
 * trong mỗi khối vần, gom theo dòng phụ âm đầu; dòng > ROW_LIMIT chip (9 từ đơn / 5 từ ghép) thì gập, bấm "…" mở.
 */
(function () {
    'use strict';

    var input = document.getElementById('vanInput');
    var hint = document.getElementById('vanHint');
    var results = document.getElementById('vanResults');
    var placeholder = document.getElementById('vanDefault');
    var toneButtons = document.querySelectorAll('.van-tone');
    var toast = document.getElementById('vanToast');
    if (!input || !results || !window.Van) return;

    var DEFAULT_HINT = 'Ví dụ: đâu, ngày, xuân, thương...';
    var TONE_TITLE = { bang: 'thanh bằng', trac: 'thanh trắc' };
    var tone = 'all';
    var timer = null;
    var index = null;
    var toastTimer = null;

    function getIndex() {
        if (!index) index = Van.buildIndex(window.VAN_WORDS || []);
        return index;
    }

    function esc(text) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(text));
        return div.innerHTML;
    }

    // Quá số này thì gập dòng, bấm "…" để mở. Từ ghép dài hơn nên ngưỡng thấp hơn.
    var ROW_LIMIT = { singles: 9, multis: 5 };

    /* Chip trong một dòng; từ chip thứ limit+1 ẩn đi kèm nút "…" */
    function chips(entries, limit) {
        var html = '';
        for (var i = 0; i < entries.length; i++) {
            var hidden = entries.length > limit && i >= limit;
            html += '<button type="button" class="van-chip' + (hidden ? ' van-chip--hidden' : '') +
                '" data-word="' + esc(entries[i].word) + '">' + esc(entries[i].word) + '</button>';
        }
        if (entries.length > limit) {
            html += '<button type="button" class="van-chip van-chip--more" title="Hiện tất cả">… +' +
                (entries.length - limit) + '</button>';
        }
        return html;
    }

    function onsetLabel(onset) {
        if (!onset) return '<span class="van-row__label van-row__label--none" title="Không có phụ âm đầu">–</span>';
        return '<span class="van-row__label">' + esc(onset.charAt(0).toUpperCase() + onset.slice(1)) + '</span>';
    }

    /* Các dòng "phụ âm | chip chip chip" */
    function rows(groupRows, limit) {
        var html = '';
        for (var i = 0; i < groupRows.length; i++) {
            html += '<div class="van-row">' + onsetLabel(groupRows[i].onset) +
                '<div class="van-chips">' + chips(groupRows[i].entries, limit) + '</div></div>';
        }
        return html;
    }

    function countRows(groupRows) {
        var n = 0;
        for (var i = 0; i < groupRows.length; i++) n += groupRows[i].entries.length;
        return n;
    }

    /* Một khối vần (chính / thông) bên trong "Từ đơn" hoặc "Từ ghép". */
    function section(kind, key, groupRows, unit, limit) {
        var n = countRows(groupRows);
        if (!n) return '';
        return '<div class="van-section van-section--' + kind + '">' +
            '<h3 class="van-section__title"><span class="van-section__kind">' +
            (kind === 'exact' ? 'Vần chính' : 'Vần thông') + '</span>' +
            '<span class="van-section__key">-' + esc(key) + '</span>' +
            '<span class="van-section__count">' + n + ' ' + unit + '</span></h3>' +
            rows(groupRows, limit) + '</div>';
    }

    /* Khối lớn "Từ đơn" / "Từ ghép": gom vần chính + các vần thông. which = 'singles' | 'multis' */
    function block(title, r, which, unit) {
        var limit = ROW_LIMIT[which];
        var html = section('exact', r.exact.key, r.exact.groups[which], unit, limit);
        for (var i = 0; i < r.loose.length; i++) html += section('loose', r.loose[i].key, r.loose[i].groups[which], unit, limit);
        if (!html) return '';
        return '<section class="van-block van-block--' + which + '"><h2 class="van-block__title">' + title + '</h2>' + html + '</section>';
    }

    function render(query) {
        if (!query.trim()) {
            results.innerHTML = '';
            placeholder.style.display = 'block';
            hint.textContent = DEFAULT_HINT;
            return;
        }

        var r = Van.lookup(getIndex(), query, { tone: tone });
        placeholder.style.display = 'none';

        if (!r.query) {
            results.innerHTML = '<p class="no-results">Không nhận ra vần tiếng Việt trong "' + esc(query.trim()) + '"</p>';
            hint.textContent = 'Thử một tiếng khác...';
            return;
        }

        var q = r.query;
        var info = 'Tiếng “' + q.syllable + '”: vần -' + q.key +
            ', thanh ' + Van.toneLabel(q.tone) + ' (' + (q.toneClass === 'bang' ? 'bằng' : 'trắc') + ')';
        if (q.nSyl > 1) info = 'Đang tra theo tiếng cuối. ' + info;
        hint.textContent = info;

        var html = block('Từ đơn', r, 'singles', 'tiếng') +
                   block('Từ ghép', r, 'multis', 'từ ghép');
        if (!html) {
            html = '<p class="no-results">Không tìm thấy tiếng nào cùng vần -' + esc(q.key) +
                (tone !== 'all' ? ' ở ' + TONE_TITLE[tone] : '') + '</p>';
        }
        results.innerHTML = html;
    }

    function showToast(msg) {
        if (!toast) return;
        toast.textContent = msg;
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 1400);
    }

    /* Bấm "…" → mở hết dòng; bấm chip → chép vào clipboard. */
    results.addEventListener('click', function (e) {
        var chip = e.target.closest('.van-chip');
        if (!chip) return;
        if (chip.classList.contains('van-chip--more')) {
            var hiddenChips = chip.parentNode.querySelectorAll('.van-chip--hidden');
            for (var i = 0; i < hiddenChips.length; i++) hiddenChips[i].classList.remove('van-chip--hidden');
            chip.parentNode.removeChild(chip);
            return;
        }
        var word = chip.dataset.word;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(word).then(function () { showToast('Đã chép “' + word + '”'); });
        } else {
            showToast(word);
        }
    });

    input.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(function () { render(input.value); }, 200);
    });
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); render(input.value); }
    });

    Array.prototype.forEach.call(toneButtons, function (btn) {
        btn.addEventListener('click', function () {
            tone = btn.dataset.tone;
            Array.prototype.forEach.call(toneButtons, function (b) { b.classList.toggle('active', b === btn); });
            render(input.value);
        });
    });

    // Link ví dụ trong phần hướng dẫn: điền vào ô và tra ngay, không tải lại trang
    var guide = document.getElementById('huong-dan');
    if (guide) {
        guide.addEventListener('click', function (e) {
            var a = e.target.closest('.van-examples a');
            if (!a) return;
            var q = new URL(a.href, location.href).searchParams.get('q');
            if (!q) return;
            e.preventDefault();
            input.value = q;
            render(q);
            history.replaceState(null, '', '?q=' + encodeURIComponent(q));
            input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
    }

    // Cho phép mở sẵn ?q=đâu
    var params = new URLSearchParams(window.location.search);
    var q0 = params.get('q');
    if (q0) { input.value = q0; render(q0); }
    input.focus();
}());
