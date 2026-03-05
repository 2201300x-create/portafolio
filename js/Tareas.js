function mostrarTarea(num) {
    document.querySelectorAll('.tarea-contenido').forEach(t => t.classList.remove('visible'));
    document.querySelectorAll('.tarea-btn').forEach(b => b.classList.remove('activo'));

    document.getElementById('tarea-' + num).classList.add('visible');
    document.querySelectorAll('.tarea-btn')[num - 1].classList.add('activo');
}

document.querySelectorAll('.sidebar .menu a').forEach(link => {
    if (link.classList.contains('active')) {
        triggerAnimation(link);
    }
});

function triggerAnimation(link) {
    const span = link.querySelector('span');
    span.style.animation = 'none';
    span.offsetHeight; // fuerza reflow
    span.style.animation = '';
}