// Selecciona todos los elementos animables
const elementos = document.querySelectorAll(
    'section h1, section h2,' +
    '.perfil-hero,' +
    '.perfil-card,' +
    '.perfil-list li,' +
    '.perfil-tags span,' +
    '.semestre,' +
    '.habilidad'
);

// Ocultar todos al inicio
elementos.forEach(el => {
    el.style.visibility = 'hidden';
    el.style.opacity = '0';
});

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            observer.unobserve(entry.target);
            waitAndFadeIn(entry.target);
        }
    });
}, { threshold: 0.1 });

let queue = [];
let isAnimating = false;

function waitAndFadeIn(element) {
    queue.push(element);
    if (!isAnimating) processQueue();
}

function processQueue() {
    if (queue.length === 0) {
        isAnimating = false;
        // Animar barras de habilidades una vez visibles
        animarBarras();
        // Ocultar loader
        const loader = document.getElementById('loader');
        if (loader) {
            loader.style.transition = 'opacity 0.5s ease';
            loader.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 500);
        }
        return;
    }

    isAnimating = true;
    const element = queue.shift();

    if (element.matches('h1, h2')) {
        element.style.visibility = 'visible';
        element.style.opacity = '1';
        typeWriter(element, processQueue);
    } else {
        slideIn(element, processQueue);
    }
}

// ── Typewriter ────────────────────────────────────────────────
function typeWriter(element, callback) {
    const text = element.textContent;
    element.textContent = '';
    element.style.visibility = 'visible';
    element.style.opacity = '1';
    let i = 0;
    const interval = setInterval(() => {
        element.textContent += text[i];
        i++;
        if (i >= text.length) {
            clearInterval(interval);
            callback();
        }
    }, 6);
}

// ── Slide-in fade ─────────────────────────────────────────────
function slideIn(element, callback) {
    element.style.visibility = 'visible';
    element.style.transform = 'translateY(18px)';
    element.style.transition = 'opacity 0.35s ease, transform 0.35s ease';

    void element.offsetHeight;

    element.style.opacity = '1';
    element.style.transform = 'translateY(0)';

    element.addEventListener('transitionend', function handler() {
        element.removeEventListener('transitionend', handler);
        callback();
    });
}

// ── Animar barras de habilidades ──────────────────────────────
function animarBarras() {
    document.querySelectorAll('.barra-fill').forEach((barra, i) => {
        const nivel = barra.getAttribute('data-nivel') || 0;
        setTimeout(() => {
            barra.style.width = nivel + '%';
        }, i * 80);   // cada barra con un pequeño delay escalonado
    });
}

// Arrancar observer
elementos.forEach(el => observer.observe(el));