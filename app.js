/*
 * Shangri-La Frontier Reader Engine
 * Core interactivity, custom markdown parser, settings sync
 */

document.addEventListener('DOMContentLoaded', () => {
    // State variables
    let currentChapterIndex = 0;
    
    // DOM Elements
    const readerContainer = document.getElementById('reader-container');
    const chapterSelect = document.getElementById('chapter-select');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const prevBottomBtn = document.getElementById('prev-bottom-btn');
    const nextBottomBtn = document.getElementById('next-bottom-btn');
    const progressBar = document.getElementById('progress-bar');
    const scrollTopBtn = document.getElementById('scroll-top-btn');
    
    // Settings elements
    const settingsPanel = document.getElementById('settings-panel');
    const settingsToggle = document.getElementById('settings-toggle');
    const themeOpts = document.querySelectorAll('.theme-opt');
    const fontOpts = document.querySelectorAll('.font-opt');
    const sizeOpts = document.querySelectorAll('.size-opt');
    const spacingOpts = document.querySelectorAll('.spacing-opt');

    // Initialize reader
    function init() {
        if (typeof CHAPTERS_DATA === 'undefined' || !Array.isArray(CHAPTERS_DATA) || CHAPTERS_DATA.length === 0) {
            readerContainer.innerHTML = `
                <div style="text-align: center; padding: 3rem;">
                    <h2>No Chapters Found</h2>
                    <p>Make sure you have compiled the chapters data into <code>shangrila-frontier-chapters/chapters_data.js</code> using the builder script.</p>
                </div>`;
            return;
        }

        // Populate Chapter Select Dropdown
        chapterSelect.innerHTML = CHAPTERS_DATA.map((chap, idx) => `
            <option value="${idx}">Chapter ${chap.number}: ${chap.title}</option>
        `).join('');

        // Set layout settings from localStorage
        loadSettings();

        // Listen for URL hash changes (for direct bookmark linking!)
        window.addEventListener('hashchange', handleHashChange);
        
        // Load initial chapter based on Hash or default to index 0
        handleHashChange();

        // Bind events
        chapterSelect.addEventListener('change', (e) => {
            navigateToChapter(parseInt(e.target.value));
        });

        // Click nav hooks
        prevBtn.addEventListener('click', navigateToPrev);
        nextBtn.addEventListener('click', navigateToNext);
        prevBottomBtn.addEventListener('click', navigateToPrev);
        nextBottomBtn.addEventListener('click', navigateToNext);
        
        // Scroll listeners
        window.addEventListener('scroll', handleScroll);
        scrollTopBtn.addEventListener('click', scrollToTop);
        
        // Settings panel open/close
        settingsToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            settingsPanel.classList.toggle('open');
        });
        
        document.addEventListener('click', (e) => {
            if (!settingsPanel.contains(e.target) && e.target !== settingsToggle) {
                settingsPanel.classList.remove('open');
            }
        });

        // Layout preference listeners
        bindSettingOptions(themeOpts, 'theme', (val) => {
            document.body.setAttribute('data-theme', val);
        });
        bindSettingOptions(fontOpts, 'font', (val) => {
            readerContainer.className = val === 'serif' ? 'body-font-serif' : 'body-font-sans';
        });
        bindSettingOptions(sizeOpts, 'size', (val) => {
            readerContainer.dataset.size = val;
            updateSizeClass(val);
        });
        bindSettingOptions(spacingOpts, 'spacing', (val) => {
            readerContainer.dataset.spacing = val;
            updateSpacingClass(val);
        });
    }

    // --- NAVIGATION FUNCTIONS ---
    function navigateToChapter(index) {
        if (index < 0 || index >= CHAPTERS_DATA.length) return;
        currentChapterIndex = index;
        
        // Update hash, which triggers render
        window.location.hash = `chapter-${CHAPTERS_DATA[index].number}`;
    }

    function navigateToPrev() {
        if (currentChapterIndex > 0) {
            navigateToChapter(currentChapterIndex - 1);
        }
    }

    function navigateToNext() {
        if (currentChapterIndex < CHAPTERS_DATA.length - 1) {
            navigateToChapter(currentChapterIndex + 1);
        }
    }

    function handleHashChange() {
        const hash = window.location.hash;
        let index = 0; // Default
        
        if (hash) {
            const match = hash.match(/#chapter-(\d+)/);
            if (match) {
                const chapNum = match[1];
                const foundIdx = CHAPTERS_DATA.findIndex(c => c.number === chapNum);
                if (foundIdx !== -1) {
                    index = foundIdx;
                }
            }
        } else {
            // Load last-read chapter from localStorage if no hash is provided
            const lastChapNum = localStorage.getItem('slf-last-chapter');
            if (lastChapNum) {
                const foundIdx = CHAPTERS_DATA.findIndex(c => c.number === lastChapNum);
                if (foundIdx !== -1) {
                    index = foundIdx;
                    window.location.hash = `chapter-${lastChapNum}`;
                    return;
                }
            }
        }
        
        currentChapterIndex = index;
        chapterSelect.value = index;
        renderChapter(index);
    }

    // --- RENDER CURRENT CHAPTER ---
    function renderChapter(index) {
        const chapter = CHAPTERS_DATA[index];
        if (!chapter) return;

        // Save reading progress to localStorage
        localStorage.setItem('slf-last-chapter', chapter.number);

        // Visual scroll progress reset
        progressBar.style.width = '0%';
        
        // Fade out/in transition effect
        readerContainer.style.opacity = '0';
        
        setTimeout(() => {
            // Render basic Markdown using marked library (loaded via CDN in index.html)
            let renderedHTML = "";
            if (typeof marked !== 'undefined') {
                renderedHTML = marked.parse(chapter.content);
            } else {
                // Fallback parser in case offline
                renderedHTML = simpleMarkdownFallback(chapter.content);
            }

            // Post-process blockquotes to compile custom alert cards
            renderedHTML = postProcessAlertCards(renderedHTML);
            renderedHTML = highlightCharacterSpeakers(renderedHTML);

            readerContainer.innerHTML = renderedHTML;
            readerContainer.style.opacity = '1';
            
            // Scroll gracefully to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
            
            // Sync bottom buttons visibility
            prevBtn.disabled = prevBottomBtn.disabled = (index === 0);
            nextBtn.disabled = nextBottomBtn.disabled = (index === CHAPTERS_DATA.length - 1);
        }, 150);
    }

    // Custom Alert Card Translation Engine
    function postProcessAlertCards(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        const blockquotes = doc.querySelectorAll('blockquote');
        blockquotes.forEach(bq => {
            const innerText = bq.textContent.trim();
            
            // Check for syntax like [!IMPORTANT], [!TIP], etc.
            const match = innerText.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
            if (match) {
                const type = match[1].toLowerCase();
                
                // Extract inner html contents and remove indicator
                let rawInner = bq.innerHTML.trim();
                rawInner = rawInner.replace(/\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i, '').trim();
                rawInner = rawInner.replace(/^(<br>|\s|<p>)+/, '').trim();
                
                // Icon choosing
                let icon = 'ℹ️';
                if (type === 'tip') icon = '✦';
                if (type === 'important') icon = '★';
                if (type === 'warning') icon = '⚠️';
                if (type === 'caution') icon = '🔥';
                
                const calloutDiv = doc.createElement('div');
                calloutDiv.className = `callout ${type}`;
                calloutDiv.innerHTML = `
                    <div class="callout-header">
                        <span class="callout-icon">${icon}</span>
                        ${type === 'important' ? '' : `<span class="callout-title">${type}</span>`}
                    </div>
                    <div class="callout-content">${rawInner}</div>
                `;
                
                bq.parentNode.replaceChild(calloutDiv, bq);
            }
        });
        
        return doc.body.innerHTML;
    }

    // Dynamic Character Speaker Dialogue Highlighting
    function highlightCharacterSpeakers(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        const strongs = doc.querySelectorAll('strong');
        strongs.forEach(strong => {
            const text = strong.textContent.trim();
            const name = text.replace(/:$/, '').trim().toLowerCase();
            
            const knownSpeakers = {
                'sunraku': 'sunraku',
                'emul': 'emul',
                'pencilgton': 'pencilgton',
                'pencilgon': 'pencilgton',
                'vysache': 'vysache',
                'oikatzo': 'oikatzo',
                'saiga-0': 'saiga-0',
                'saiga-100': 'saiga-100',
                'break': 'break',
                'tango': 'tango',
                'reika': 'reika',
                'katzo': 'oikatzo',
                'king': 'vysache',
                'arthur': 'pencilgton',
                'kyogoku': 'kyogoku',
                'kyo-timate': 'kyogoku',
                'bilac': 'bilac',
                'aramis': 'aramis',
                'professor': 'professor',
                'animalia': 'animalia',
                'rust': 'rust',
                'rusty': 'rust',
                'moldo': 'moldo',
                'mould': 'moldo',
                'tsukuyo': 'tsukuyo',
                'setsuna': 'setsuna',
                'weathermon': 'weathermon'
            };
            
            if (knownSpeakers[name]) {
                const speakerKey = knownSpeakers[name];
                strong.className = `speaker-tag speaker-${speakerKey}`;
                // Strip the trailing colon inside the strong tag for elegance, since the wrapper styling handles separation!
                strong.textContent = text.replace(/:$/, '');
            }
        });
        
        return doc.body.innerHTML;
    }

    // Lightweight Offline RegEx Markdown Parser Fallback
    function simpleMarkdownFallback(markdown) {
        let html = markdown
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") // sanitize
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^\*\*\*$/gim, '<hr>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/^\s*\n\*/gm, '<ul>\n*')
            .replace(/^>\s+(.*$)/gim, '<blockquote>$1</blockquote>')
            .replace(/\n/g, '<br>');
            
        return html;
    }

    // --- SCROLL PROGRESS & FLOATING BUTTONS ---
    function handleScroll() {
        // Update top progress bar
        const winScroll = document.documentElement.scrollTop || document.body.scrollTop;
        const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const scrolled = height > 0 ? (winScroll / height) * 100 : 0;
        progressBar.style.width = scrolled + '%';
        
        // Show/hide floating scroll-to-top button
        if (winScroll > 400) {
            scrollTopBtn.classList.add('visible');
        } else {
            scrollTopBtn.classList.remove('visible');
        }
    }

    function scrollToTop() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }

    // --- LAYOUT & THEME MANAGEMENT ---
    function loadSettings() {
        const theme = localStorage.getItem('slf-theme') || 'dark';
        const font = localStorage.getItem('slf-font') || 'sans';
        const size = localStorage.getItem('slf-size') || 'md';
        const spacing = localStorage.getItem('slf-spacing') || 'md';

        // Apply visual themes
        document.body.setAttribute('data-theme', theme);
        readerContainer.className = font === 'serif' ? 'body-font-serif' : 'body-font-sans';
        updateSizeClass(size);
        updateSpacingClass(spacing);

        // Sync button active indicators
        syncButtonActiveState(themeOpts, theme);
        syncButtonActiveState(fontOpts, font);
        syncButtonActiveState(sizeOpts, size);
        syncButtonActiveState(spacingOpts, spacing);
    }

    function bindSettingOptions(elements, storageKey, callback) {
        elements.forEach(opt => {
            opt.addEventListener('click', () => {
                const val = opt.dataset.val;
                localStorage.setItem(`slf-${storageKey}`, val);
                syncButtonActiveState(elements, val);
                callback(val);
            });
        });
    }

    function syncButtonActiveState(elements, activeVal) {
        elements.forEach(el => {
            if (el.dataset.val === activeVal) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });
    }

    function updateSizeClass(val) {
        readerContainer.classList.remove('size-sm', 'size-md', 'size-lg');
        readerContainer.classList.add(`size-${val}`);
    }

    function updateSpacingClass(val) {
        readerContainer.classList.remove('spacing-sm', 'spacing-md', 'spacing-lg');
        readerContainer.classList.add(`spacing-${val}`);
    }

    // Trigger Initial Setup
    init();
});
