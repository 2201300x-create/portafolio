pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const MultiP = {
    cola: [],
    resultados: [],
    chartKwh: null,
    chartCosto: null,
    chartRadar: null
};

const COLORES_MP = [
    '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6',
    '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4',
    '#84cc16', '#a855f7', '#e11d48', '#0ea5e9', '#22c55e',
    '#d97706', '#7c3aed', '#db2777', '#0284c7', '#16a34a'
];

// ── Abrir / Cerrar ──────────────────────────────────────────────
function abrirMulti() {
    document.getElementById('modalMulti').style.display = 'flex';
}

function cerrarMulti() {
    document.getElementById('modalMulti').style.display = 'none';
}

// ── Zona de subida ──────────────────────────────────────────────
function multiPDragOver(e) {
    e.preventDefault();
    document.getElementById('multi-zona').style.borderColor = '#16a34a';
}

function multiPDragLeave() {
    document.getElementById('multi-zona').style.borderColor = '#bbf7d0';
}

function multiPDrop(e) {
    e.preventDefault();
    multiPDragLeave();
    multiPRegistrar(Array.from(e.dataTransfer.files));
}

function multiPSeleccion(e) {
    multiPRegistrar(Array.from(e.target.files));
    e.target.value = '';
}

function multiPRegistrar(archivos) {
    const errores = [];
    archivos.forEach(f => {
        if (MultiP.cola.length >= 20) return errores.push('Máximo 20 recibos');
        if (f.size === 0) return errores.push(f.name + ': vacío');
        if (f.size > 50 * 1024 * 1024) return errores.push(f.name + ': supera 50MB');
        const ok = /\.(pdf|jpe?g|png|webp)$/i.test(f.name) || f.type.startsWith('image/');
        if (!ok) return errores.push(f.name + ': formato no compatible');
        if (MultiP.cola.find(r => r.nombre === f.name)) return errores.push(f.name + ': ya está en la lista');
        MultiP.cola.push({ archivo: f, esPDF: f.name.toLowerCase().endsWith('.pdf'), nombre: f.name, estado: 'pendiente' });
    });

    const errEl = document.getElementById('multi-error');
    if (errores.length) { errEl.textContent = errores.join(' · '); errEl.style.display = 'block'; setTimeout(() => errEl.style.display = 'none', 4000); }
    multiPRenderCola();
}

function multiPQuitarDeCola(i) {
    MultiP.cola.splice(i, 1);
    multiPRenderCola();
}

function multiPRenderCola() {
    const hay = MultiP.cola.length > 0;
    document.getElementById('multi-zona-vacia').style.display = hay ? 'none' : 'block';
    document.getElementById('multi-zona-llena').style.display = hay ? 'block' : 'none';
    document.getElementById('multi-contador').textContent = MultiP.cola.length;

    const btn = document.getElementById('multi-btn-procesar');
    btn.disabled = MultiP.cola.length < 2;
    btn.style.opacity = MultiP.cola.length >= 2 ? '1' : '0.5';

    document.getElementById('multi-cola').innerHTML = MultiP.cola.map((item, i) => {
        const color = COLORES_MP[i % COLORES_MP.length];
        const chips = { pendiente: 'chip-pendiente', procesando: 'chip-procesando', listo: 'chip-listo', error: 'chip-error-multi' };
        const labels = { pendiente: 'Pendiente', procesando: '⏳ Leyendo...', listo: '✓ Listo', error: '✗ Error' };
        return '<div class="multi-fila" style="border-left-color:' + color + '">' +
            '<div class="multi-num" style="background:' + color + '">' + (i + 1) + '</div>' +
            '<span style="flex:1; font-weight:600; color:#334155; font-size:.78rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' +
            (item.esPDF ? '📄' : '🖼️') + ' ' + item.nombre + '</span>' +
            '<span class="multi-chip ' + chips[item.estado] + '">' + labels[item.estado] + '</span>' +
            (item.estado === 'pendiente' ? '<button onclick="multiPQuitarDeCola(' + i + ')" style="background:none;border:none;cursor:pointer;color:#94a3b8;padding:4px;font-size:1rem;">×</button>' : '') +
            '</div>';
    }).join('');
}

// ── Análisis ────────────────────────────────────────────────────
async function multiPProcesar() {
    if (MultiP.cola.length < 2) return;
    MultiP.resultados = [];
    multiPMostrar('procesando');

    const total = MultiP.cola.length;
    for (let i = 0; i < total; i++) {
        const item = MultiP.cola[i];
        item.estado = 'procesando';
        multiPRenderCola();
        multiPProgreso(Math.round((i / total) * 90), 'Analizando ' + (i + 1) + ' de ' + total + ': ' + item.nombre);

        try {
            const texto = item.esPDF ? await multiPLeerPDF(item.archivo, i, total) : await multiPLeerImagen(item.archivo, i, total);
            const datos = multiPExtraer(texto, item.nombre);
            datos.color = COLORES_MP[i % COLORES_MP.length];
            datos.numero = i + 1;
            MultiP.resultados.push(datos);
            item.estado = 'listo';
        } catch (err) {
            item.estado = 'error';
            MultiP.resultados.push({ numero: i + 1, color: COLORES_MP[i % COLORES_MP.length], nombre: item.nombre, titular: 'Error al leer', kwh: 0, total: 0, energia: 0, iva: 0, tarifa: '-', error: err.message });
        }
        multiPRenderCola();
    }

    multiPProgreso(100, 'Comparativa lista');
    multiPMostrarResultados();
}

async function multiPLeerPDF(archivo, idx, total) {
    return new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onerror = () => rej(new Error('No se pudo abrir el PDF'));
        reader.onload = async function () {
            try {
                const bytes = new Uint8Array(this.result);
                if (!String.fromCharCode(...bytes.slice(0, 5)).startsWith('%PDF')) throw new Error('PDF inválido');
                const doc = await pdfjsLib.getDocument(bytes).promise;
                let texto = '';

                for (let p = 1; p <= doc.numPages; p++) {
                    const pagina = await doc.getPage(p);
                    const content = await pagina.getTextContent();
                    let t = content.items.map(i => i.str).join(' ');
                    texto += '\n--- PAGINA ' + p + ' ---\n' + t;
                }

                const palabrasCFE = ['ENERGIA', 'IVA', 'PAGAR', 'SERVICIO', 'kWh'];
                const tieneCFE = palabrasCFE.filter(p => texto.includes(p)).length >= 3;

                if (!tieneCFE) {
                    multiPProgreso(null, 'Recibo ' + (idx + 1) + '/' + total + ' — aplicando OCR...');
                    let textoOCR = '';
                    for (let p = 1; p <= Math.min(doc.numPages, 2); p++) {
                        const pagina = await doc.getPage(p);
                        const vp = pagina.getViewport({ scale: p === 2 ? 3.0 : 2.0 });
                        const canvas = document.createElement('canvas');
                        canvas.width = vp.width; canvas.height = vp.height;
                        await pagina.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
                        const ocr = await Tesseract.recognize(canvas.toDataURL(), 'spa', {
                            logger: m => { if (m.status === 'recognizing text') multiPProgreso(null, 'OCR recibo ' + (idx + 1) + ' pág ' + p + ': ' + Math.round(m.progress * 100) + '%'); }
                        });
                        const content = await pagina.getTextContent();
                        textoOCR += '\n--- PAGINA ' + p + ' ---\n' + content.items.map(i => i.str).join(' ') + '\n' + ocr.data.text;
                    }
                    res(textoOCR);
                } else {
                    res(texto);
                }
            } catch (e) { rej(new Error('Error PDF: ' + e.message)); }
        };
        reader.readAsArrayBuffer(archivo);
    });
}

async function multiPLeerImagen(archivo, idx, total) {
    const result = await Tesseract.recognize(archivo, 'spa', {
        logger: m => { if (m.status === 'recognizing text') multiPProgreso(null, 'OCR recibo ' + (idx + 1) + '/' + total + ': ' + Math.round(m.progress * 100) + '%'); }
    });
    if (!result.data.text || result.data.text.trim().length < 5) throw new Error('No se detectó texto en la imagen');
    return result.data.text;
}

// ── Extracción de datos ─────────────────────────────────────────
function multiPExtraer(texto, nombreArchivo) {
    const buscar = (tags) => {
        for (const tag of tags) {
            const key = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            for (const p of [
                new RegExp(key + '[\\s:]*\\$?\\s*([\\d,]+)[\\s]+([\\d]{2})(?![\\d])', 'i'),
                new RegExp(key + '[\\s:]*\\$?\\s*([\\d,]+)\\.([\\d]{2})', 'i'),
                new RegExp(key + '[^\\d]*([\\d,]+)[\\s\\.]+([\\d]{2})(?![\\d])', 'i')
            ]) {
                const m = texto.match(p);
                if (m) { const v = parseFloat(m[1].replace(/,/g, '') + '.' + (m[2] || '00')); if (!isNaN(v) && v >= 0 && v < 100000) return v; }
            }
        }
        return 0;
    };

    const p2 = texto.indexOf('--- PAGINA 2 ---');
    const pag1 = p2 > 0 ? texto.substring(0, p2) : texto.substring(0, 3000);

    let total = 0;
    for (const p of [/TOTAL\s+A\s*PAGAR[\s:]*\$?\s*(\d+)\s+(\d{2})/i, /\$\s*(\d+)\.(\d{2})/, /\$\s*(\d{2,4})(?!\d)/]) {
        const m = pag1.match(p);
        if (m) { total = parseFloat((m[1] || '0').replace(/,/g, '') + '.' + (m[2] || '00')); if (total > 0) break; }
    }

    let energia = buscar(['Energia', 'ENERGIA', 'Suministro']);
    let iva = buscar(['IVA 16%', 'IVA 16', 'IVA']);
    if (!(energia > 0 && iva > 0) && total > 0) { energia = total / 1.16; iva = total - energia; }

    const ms = texto.match(/(?:NO\.?\s*DE?\s*SERVICIO|No\.?\s*Servicio)[\s:]*(\d[\s]?\d{11})/i) || texto.match(/(\d{12})/);
    const servicio = ms ? ms[1].replace(/\s/g, '') : 'No detectado';

    let titular = nombreArchivo.replace(/\.[^.]+$/, '');
    for (const p of [
        /TOTAL\s+A\s*PAGAR[^\n]*\n([A-Z\xC1\xC9\xCD\xD3\xDA\xD1\s]{10,50})/i,
        /([A-Z\xC1\xC9\xCD\xD3\xDA\xD1]{4,}\s+[A-Z\xC1\xC9\xCD\xD3\xDA\xD1]{4,}\s+[A-Z\xC1\xC9\xCD\xD3\xDA\xD1]{4,})/
    ]) {
        const m = texto.match(p);
        if (m) { const n = m[1].trim(); if (n.length > 5 && !n.includes('CFE') && !/^\d+$/.test(n)) { titular = n; break; } }
    }

    const mt = texto.match(/(?:TARIFA|Tarifa)\s*:?\s*([A-Z0-9\-]{1,10})/i);
    const tarifa = mt ? mt[1].trim() : 'No detectado';

    const mkwh = texto.match(/(\d{2,4})\s*(?:kWh|KWH|kwh)/);
    const kwh = mkwh ? parseInt(mkwh[1]) : 0;
    const mdias = texto.match(/(\d{2})\s*(?:dias|DIAS|d[ií]as)/i);
    const dias = mdias ? parseInt(mdias[1]) : 60;
    const media = kwh && dias ? (kwh / dias).toFixed(1) : 0;

    const mp = texto.match(/(?:PERIODO|BIMESTRE|Periodo)[\s:]*([A-Za-z0-9\s\-\/]{4,25})/i);
    const periodo = mp ? mp[1].trim() : 'No detectado';

    return { titular, servicio, kwh, total, energia, iva, tarifa, media, periodo };
}

// ── Mostrar resultados ──────────────────────────────────────────
function multiPMostrarResultados() {
    const r = MultiP.resultados;
    const kwhs = r.map(x => x.kwh);
    const totals = r.map(x => x.total);
    const nombres = r.map(x => x.titular.split(' ')[0]);
    const prom = kwhs.reduce((a, b) => a + b, 0) / kwhs.length;
    const minIdx = kwhs.indexOf(Math.min(...kwhs));
    const maxIdx = kwhs.indexOf(Math.max(...kwhs));

    document.getElementById('mres-total').textContent = r.length;
    document.getElementById('mres-prom').textContent = prom.toFixed(0) + ' kWh';
    document.getElementById('mres-min-nombre').textContent = r[minIdx].titular.split(' ')[0];
    document.getElementById('mres-min-kwh').textContent = kwhs[minIdx] + ' kWh';
    document.getElementById('mres-max-nombre').textContent = r[maxIdx].titular.split(' ')[0];
    document.getElementById('mres-max-kwh').textContent = kwhs[maxIdx] + ' kWh';

    // Gráfica kWh
    if (MultiP.chartKwh) MultiP.chartKwh.destroy();
    MultiP.chartKwh = new Chart(document.getElementById('multi-chart-kwh'), {
        type: 'bar',
        data: {
            labels: nombres,
            datasets: [{ label: 'kWh', data: kwhs, backgroundColor: r.map(x => x.color), borderRadius: 8, barThickness: 28 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.raw + ' kWh' } } },
            scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } }
        }
    });

    // Gráfica costo
    if (MultiP.chartCosto) MultiP.chartCosto.destroy();
    MultiP.chartCosto = new Chart(document.getElementById('multi-chart-costo'), {
        type: 'bar',
        data: {
            labels: nombres,
            datasets: [{ label: 'Total $', data: totals, backgroundColor: r.map(x => x.color), borderRadius: 8, barThickness: 28 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => '$' + c.raw.toFixed(2) } } },
            scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { callback: v => '$' + v } }, x: { grid: { display: false } } }
        }
    });

    // Tabla
    document.getElementById('multi-tabla-body').innerHTML = r.map(x =>
        '<tr style="border-bottom:1px solid #f1f5f9;">' +
        '<td style="padding:8px;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + x.color + ';margin-right:6px;"></span>' + x.numero + '</td>' +
        '<td style="padding:8px; font-weight:600; color:#1e293b;">' + x.titular + '</td>' +
        '<td style="padding:8px; text-align:center; font-weight:700; color:#6366f1;">' + x.kwh + '</td>' +
        '<td style="padding:8px; text-align:center; font-weight:700; color:#15803d;">$' + x.total.toFixed(2) + '</td>' +
        '<td style="padding:8px; text-align:center; color:#64748b;">' + x.tarifa + '</td>' +
        '</tr>'
    ).join('');


    // Gráfica radar
    if (MultiP.chartRadar) MultiP.chartRadar.destroy();
    if (r.length <= 8) {
        document.getElementById('multi-radar-aviso').style.display = 'none';
        document.getElementById('multi-chart-radar').style.display = 'block';
        const norm = (arr) => { const max = Math.max(...arr); return max === 0 ? arr.map(() => 0) : arr.map(v => parseFloat(((v / max) * 100).toFixed(1))); };
        MultiP.chartRadar = new Chart(document.getElementById('multi-chart-radar'), {
            type: 'radar',
            data: {
                labels: ['kWh', 'Total $', 'Media/día', 'Energía', 'IVA'],
                datasets: r.map(x => ({
                    label: x.titular.split(' ')[0],
                    data: norm([x.kwh, x.total, parseFloat(x.media) || 0, x.energia, x.iva]),
                    backgroundColor: x.color + '33',
                    borderColor: x.color,
                    borderWidth: 2,
                    pointBackgroundColor: x.color
                }))
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, usePointStyle: true } } },
                scales: { r: { beginAtZero: true, max: 100, ticks: { display: false }, grid: { color: '#f1f5f9' } } }
            }
        });
    } else {
        document.getElementById('multi-chart-radar').style.display = 'none';
        document.getElementById('multi-radar-aviso').style.display = 'block';
    }

    multiPMostrar('resultado');
}

// ── Tabs ────────────────────────────────────────────────────────
function multiPTab(tab, btn) {
    ['kwh','costo','tabla','radar'].forEach(t =>
        document.getElementById('mtab-p-' + t).style.display = t === tab ? 'block' : 'none'
    );
    document.querySelectorAll('.mtab-p-btn').forEach(b => b.classList.remove('mtab-p-activo'));
    btn.classList.add('mtab-p-activo');
}

// ── Exportar CSV ─────────────────────────────────────────────────
function multiPExportarCSV() {
    if (!MultiP.resultados.length) return;
    const cab = ['#', 'Titular', 'Servicio', 'kWh', 'Total', 'Energía', 'IVA', 'Tarifa', 'Media/día', 'Periodo'];
    const filas = MultiP.resultados.map(r => [
        r.numero, r.titular, r.servicio, r.kwh, r.total.toFixed(2),
        r.energia.toFixed(2), r.iva.toFixed(2), r.tarifa, r.media, r.periodo
    ].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(','));
    const csv = [cab.join(','), ...filas].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'comparativa_cfe.csv'; a.click();
    URL.revokeObjectURL(url);
}

// ── Helpers ─────────────────────────────────────────────────────
function multiPMostrar(paso) {
    ['subida', 'procesando', 'resultado'].forEach(p =>
        document.getElementById('multi-' + p).style.display = p === paso ? 'block' : 'none'
    );
}

function multiPProgreso(pct, msg) {
    if (msg) document.getElementById('multi-msg').textContent = msg;
    if (pct !== null) {
        document.getElementById('multi-barra').style.width = pct + '%';
        document.getElementById('multi-pct').textContent = pct + '%';
    }
}

function multiPReiniciar() {
    MultiP.cola = []; MultiP.resultados = [];
    if (MultiP.chartKwh) { MultiP.chartKwh.destroy(); MultiP.chartKwh = null; }
    if (MultiP.chartCosto) { MultiP.chartCosto.destroy(); MultiP.chartCosto = null; }
    if (MultiP.chartRadar) { MultiP.chartRadar.destroy(); MultiP.chartRadar = null; }
    multiPRenderCola();
    multiPMostrar('subida');
}