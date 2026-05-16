var poemSearchInput = document.getElementById('searchInput');
var poemSearchResults = document.getElementById('searchResults');
var poemSearchDefault = document.getElementById('defaultContent');
var poemSearchHint = document.getElementById('searchHint');
var poemSearchTimer = null;

function poemNormalize(str) {
    return str.toLowerCase()
        .replace(/[\u00e1\u00e0\u1ea3\u00e3\u1ea1\u0103\u1eaf\u1eb1\u1eb3\u1eb5\u1eb7\u00e2\u1ea5\u1ea7\u1ea9\u1eab\u1ead]/g, 'a')
        .replace(/[\u00e9\u00e8\u1ebb\u1ebd\u00ea\u1ebf\u1ec1\u1ec3\u1ec5\u1ec7]/g, 'e')
        .replace(/[\u00ed\u00ec\u1ec9\u0129\u1ecb]/g, 'i')
        .replace(/[\u00f3\u00f2\u1ecf\u00f5\u1ecd\u00f4\u1ed1\u1ed3\u1ed5\u1ed7\u1ed9\u01a1\u1edb\u1edd\u1edf\u1ee1\u1ee3]/g, 'o')
        .replace(/[\u00fa\u00f9\u1ee7\u0169\u1ee5\u01b0\u1ee9\u1eeb\u1eed\u1eef\u1ef1]/g, 'u')
        .replace(/[\u00fd\u1ef3\u1ef7\u1ef9\u1ef5]/g, 'y')
        .replace(/\u0111/g, 'd');
}

function poemEscapeHtml(text) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}

function poemBuildCard(poem) {
    var category = (poem.categories && poem.categories.length > 0) ? poemEscapeHtml(poem.categories[0]) : 'th\u01a1';
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
    html += '<a href="/tho/' + encodeURIComponent(poem.slug) + '/" class="card-title">' + poemEscapeHtml(poem.title) + '</a>';
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
        poemSearchHint.textContent = 'V\u00ed d\u1ee5: t\u00ecnh y\u00eau, s\u00e1ng, ng\u00e0y...';
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
        poemSearchResults.innerHTML = '<p class="no-results">Kh\u00f4ng t\u00ecm th\u1ea5y b\u00e0i th\u01a1 n\u00e0o ph\u00f9 h\u1ee3p v\u1edbi "' + poemEscapeHtml(query) + '"</p>';
        poemSearchHint.textContent = 'Th\u1eed t\u1eeb kh\u00f3a kh\u00e1c...';
        return;
    }

    poemSearchHint.textContent = 'T\u00ecm th\u1ea5y ' + results.length + ' b\u00e0i th\u01a1';
    var html = '';
    for (var i = 0; i < results.length; i++) {
        html += poemBuildCard(results[i]);
    }
    poemSearchResults.innerHTML = html;

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
