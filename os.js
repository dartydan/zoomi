const root = document.documentElement;
const menuButton = document.querySelector('.menu-toggle');
const mobileMenu = document.querySelector('.mobile-menu');
const cursorGlow = document.querySelector('.cursor-glow');
const progressBar = document.querySelector('.scroll-progress span');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function setMenu(open) {
    root.classList.toggle('menu-open', open);
    menuButton.setAttribute('aria-expanded', String(open));
    mobileMenu.setAttribute('aria-hidden', String(!open));
    menuButton.querySelector('.menu-label').textContent = open ? 'Close' : 'Menu';
}

menuButton.addEventListener('click', () => {
    setMenu(!root.classList.contains('menu-open'));
});

mobileMenu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => setMenu(false));
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setMenu(false);
});

const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
    });
}, {
    rootMargin: '0px 0px -8% 0px',
    threshold: 0.12,
});

document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));

function updateScroll() {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const progress = scrollable > 0 ? window.scrollY / scrollable : 0;
    progressBar.style.transform = `scaleX(${progress})`;
}

window.addEventListener('scroll', updateScroll, { passive: true });
updateScroll();

if (!reduceMotion && window.matchMedia('(pointer: fine)').matches) {
    let glowX = window.innerWidth / 2;
    let glowY = window.innerHeight / 2;
    let targetX = glowX;
    let targetY = glowY;

    window.addEventListener('pointermove', (event) => {
        targetX = event.clientX;
        targetY = event.clientY;

        const xRatio = (event.clientX / window.innerWidth) - 0.5;
        const yRatio = (event.clientY / window.innerHeight) - 0.5;

        document.querySelectorAll('[data-parallax]').forEach((element) => {
            const amount = Number(element.dataset.parallax || 0);
            element.style.transform = `translate3d(${xRatio * amount}px, ${yRatio * amount}px, 0)`;
        });
    }, { passive: true });

    const animateGlow = () => {
        glowX += (targetX - glowX) * 0.09;
        glowY += (targetY - glowY) * 0.09;
        cursorGlow.style.transform = `translate3d(${glowX}px, ${glowY}px, 0)`;
        requestAnimationFrame(animateGlow);
    };

    animateGlow();
}

document.querySelector('#year').textContent = new Date().getFullYear();
