var poemSearchInput = document.getElementById('searchInput');
var poemSearchResults = document.getElementById('searchResults');
var poemSearchDefault = document.getElementById('defaultContent');
var poemSearchHint = document.getElementById('searchHint');
var poemSearchTimer = null;

function poemNormalize(str) {
    return str.toLowerCase()
        .replace(/[áàảãạăắằẳẵặâấầẩẫậ]/g, 'a')
        .replace(/[éèẻẽêếềểễệ]/g, 'e')
        .replace(/[íìỉĩị]/g, 'i')
        .replace(/[óòỏõọôốồổỗộơớờởỡợ]/g, 'o')
        .replace(/[úùủũụưứừửữự]/g, 'u')
        .replace(/[ýỳỷỹỵ]/g, 'y')
        .replace(/đ/g, 'd');
}

function poemEscapeHtml(text) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}

function poemBuildCard(poem) {
    var category = (poem.categories && poem.categories.length > 0) ? poemEscapeHtml(poem.categories[0]) : 'thơ';
    var excerpt = '';
    if (poem.intro_description) {
        excerpt = poem.intro_description.substring(0, 120);
        if (poem.intro_description.length > 120) excerpt += '...';
    } else if (poem.content) {
        excerpt = poem.content.substring(0, 120);
        if (poem.content.length > 120) excerpt += '...';
    }

    var html = '<article class="poem-card">';
    html += '<div class="card-deco"></div>';
    html += '<div class="card-category">' + category + '</div>';
    html += '<a href="/tho/' + poemEscapeHtml(poem.slug) + '/" class="card-title">' + poemEscapeHtml(poem.title) + '</a>';
    html += '<p class="card-excerpt">' + poemEscapeHtml(excerpt) + '</p>';
    html += '<div class="card-date">' + poemEscapeHtml(poem.date) + '</div>';
    html += '</article>';
    return html;
}

function poemPerformSearch(query) {
    if (!poemSearchInput || !poemSearchResults) return;

    if (!query.trim()) {
        poemSearchResults.innerHTML = '';
        poemSearchDefault.style.display = 'block';
        poemSearchHint.textContent = 'Ví dụ: tình yêu, sáng, ngày...';
        return;
    }

    var normalizedQuery = poemNormalize(query);
    var results = window.POEMS_DATA.filter(function(poem) {
        var titleNorm = poemNormalize(poem.title);
        var contentNorm = poemNormalize(poem.content);
        var catsNorm = poem.categories.map(function(c) { return poemNormalize(c); }).join(' ');
        return titleNorm.indexOf(normalizedQuery) !== -1 ||
               contentNorm.indexOf(normalizedQuery) !== -1 ||
               catsNorm.indexOf(normalizedQuery) !== -1;
    });

    poemSearchDefault.style.display = 'none';

    if (results.length === 0) {
        poemSearchResults.innerHTML = '<p class="no-results">Không tìm thấy bài thơ nào phù hợp với "' + poemEscapeHtml(query) + '"</p>';
        poemSearchHint.textContent = 'Thử từ khóa khác...';
        return;
    }

    poemSearchHint.textContent = 'Tìm thấy ' + results.length + ' bài thơ';
    var html = '';
    for (var i = 0; i < results.length; i++) {
        html += poemBuildCard(results[i]);
    }
    poemSearchResults.innerHTML = html;

    // Trigger fade-in for cards
    var cards = poemSearchResults.querySelectorAll('.poem-card');
    cards.forEach(function(card, idx) {
        card.style.transitionDelay = (idx * 0.08) + 's';
        requestAnimationFrame(function() {
            card.classList.add('visible');
        });
    });
}

if (poemSearchInput) {
    poemSearchInput.addEventListener('input', function() {
        clearTimeout(poemSearchTimer);
        poemSearchTimer = setTimeout(function() {
            poemPerformSearch(poemSearchInput.value);
        }, 200);
    });

    var params = new URLSearchParams(window.location.search);
    var q = params.get('q');
    if (q) {
        poemSearchInput.value = q;
        poemPerformSearch(q);
    }
}
