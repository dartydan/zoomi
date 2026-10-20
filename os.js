const root = document.documentElement;
const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('#site-nav');

function setMenu(open) {
    root.classList.toggle('menu-open', open);
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
}

menuButton.addEventListener('click', () => {
    setMenu(!root.classList.contains('menu-open'));
});

nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => setMenu(false));
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setMenu(false);
});

document.querySelector('#year').textContent = new Date().getFullYear();
