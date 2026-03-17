// Sidebar deslizable en móvil
const hamburgerBtn = document.getElementById('hamburgerBtn');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebarOverlay');

function openSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('visible');
    hamburgerBtn.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('visible');
    hamburgerBtn.classList.remove('open');
    document.body.style.overflow = '';
}

hamburgerBtn.addEventListener('click', () => {
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
});

overlay.addEventListener('click', closeSidebar);

// Cerrar al hacer clic en un link del menú
sidebar.querySelectorAll('.menu a').forEach(link => {
    link.addEventListener('click', closeSidebar);
});