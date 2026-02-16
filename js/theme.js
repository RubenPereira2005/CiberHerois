document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();

    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;

    function updateIcon(isDark) {
        if (!themeToggle) return;
        const icon = themeToggle.querySelector('i, svg');
        if (icon) {
            icon.setAttribute('data-lucide', isDark ? 'moon' : 'sun');
            lucide.createIcons(); 
        }
    }

    if (localStorage.getItem('theme') === 'dark') {
        body.classList.add('dark-mode');
        setTimeout(() => updateIcon(true), 10);
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const isDark = body.classList.toggle('dark-mode');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            updateIcon(isDark);
        });
    }
});