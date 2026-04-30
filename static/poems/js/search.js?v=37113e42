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

function poemBuildSocialLinks(poem) {
    var parts = [];
    if (poem.facebook_link) {
        parts.push('<a href="' + poemEscapeHtml(poem.facebook_link) + '" target="_blank" rel="noopener noreferrer">Facebook</a>');
    }
    if (poem.tiktok_link) {
        parts.push('<a href="' + poemEscapeHtml(poem.tiktok_link) + '" target="_blank" rel="noopener noreferrer">TikTok</a>');
    }
    if (poem.youtube_link) {
        parts.push('<a href="' + poemEscapeHtml(poem.youtube_link) + '" target="_blank" rel="noopener noreferrer">YouTube</a>');
    }
    if (parts.length === 0) return '';
    return '<div class="poem-social-links">' + parts.join('<span class="social-separator">/</span>') + '</div>';
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
        var poem = results[i];
        html += '<div class="poem-full" data-poem-id="' + poemEscapeHtml(poem.slug) + '">';
        html += '<div class="poem-header">';
        html += '<h2 class="poem-title windsong-medium">' + poemEscapeHtml(poem.title) + '</h2>';
        html += '<div class="poem-meta">';
        html += '<a href="/tho/' + poemEscapeHtml(poem.slug) + '/" class="poem-author">';
        html += 'Ngày đăng: ' + poemEscapeHtml(poem.date);
        html += '</a>';
        html += poemBuildSocialLinks(poem);
        html += '</div>';
        html += '</div>';

        if (poem.intro_description) {
            html += '<p class="poem-intro">' + poemEscapeHtml(poem.intro_description) + '</p>';
        }

        html += '<p class="poem-content">' + poemEscapeHtml(poem.content) + '</p>';

        if (poem.outro_description) {
            html += '<p class="poem-intro">' + poemEscapeHtml(poem.outro_description) + '</p>';
        }

        html += '</div>';

        if (i < results.length - 1) {
            html += '<div class="poem-separate"><div class="poem-separator"></div></div>';
        }
    }
    poemSearchResults.innerHTML = html;
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