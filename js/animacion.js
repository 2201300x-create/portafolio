const elementos = document.querySelectorAll('section h1, section h2, section p, section strong');

elementos.forEach(el => {
    el.style.visibility = 'hidden';
});

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            observer.unobserve(entry.target);
            waitAndType(entry.target);
        }
    });
}, { threshold: 0.3 });

let queue = [];
let isTyping = false;

function waitAndType(element) {
    queue.push(element);
    if (!isTyping) processQueue();
}

function processQueue() {
    if (queue.length === 0) {
        isTyping = false;
        return;
    }
    isTyping = true;
    const element = queue.shift();
    typeWriter(element, processQueue);
}

function typeWriter(element, callback) {
    const text = element.textContent;
    element.textContent = '';
    element.style.visibility = 'visible';
    let i = 0;
    const interval = setInterval(() => {
        element.textContent += text[i];
        i++;
        if (i >= text.length) {
            clearInterval(interval);
            // Mostrar imagen si el elemento está dentro de .herramienta
            const herramienta = element.closest('.herramienta');
            if (herramienta) {
                const img = herramienta.querySelector('img');
                if (img) img.classList.add('visible');
            }
            callback();
        }
    }, 6);
}

elementos.forEach(el => observer.observe(el));

function processQueue() {
    if (queue.length === 0) {
        isTyping = false;
        // Ocultar loader cuando todo termina
        const loader = document.getElementById('loader');
        if (loader) {
            loader.style.transition = 'opacity 0.5s ease';
            loader.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 500);
        }
        return;
    }
    isTyping = true;
    const element = queue.shift();
    typeWriter(element, processQueue);
}

