pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const LectorP = {
    archivos: [],
    chart: null
};

// ── Abrir / Cerrar ──────────────────────────────────────────────
function abrirLector() {
    document.getElementById('modalLector').style.display = 'flex';
}

function cerrarLector() {
    document.getElementById('modalLector').style.display = 'none';
}

// ── Zona de subida ──────────────────────────────────────────────
function lectorDragOver(e) {
    e.preventDefault();
    document.getElementById('lector-zona').style.borderColor = 'var(--primary-color)';
}

function lectorDragLeave() {
    document.getElementById('lector-zona').style.borderColor = '#c7d2fe';
}

function lectorDrop(e) {
    e.preventDefault();
    lectorDragLeave();
    lectorRegistrar(Array.from(e.dataTransfer.files));
}

function lectorSeleccion(e) {
    lectorRegistrar(Array.from(e.target.files));
    e.target.value = '';
}

function lectorRegistrar(nuevos) {
    const err = [];
    nuevos.forEach(f => {
        if (f.size === 0) return err.push(f.name + ': vacío');
        if (f.size > 50 * 1024 * 1024) return err.push(f.name + ': supera 50MB');
        const ok = /\.(pdf|jpe?g|png|webp)$/i.test(f.name) || f.type.startsWith('image/');
        if (!ok) return err.push(f.name + ': formato no compatible');
        LectorP.archivos.push({ archivo: f, esPDF: f.name.toLowerCase().endsWith('.pdf') });
    });

    const errEl = document.getElementById('lector-error');
    if (err.length) {
        errEl.textContent = err.join(' | ');
        errEl.style.display = 'block';
    } else {
        errEl.style.display = 'none';
    }
    lectorActualizarZona();
}

function lectorActualizarZona() {
    const hay = LectorP.archivos.length > 0;
    const chips = document.getElementById('lector-chips');
    chips.innerHTML = LectorP.archivos.map((item, i) =>
        '<span style="background:#e0e7ff;color:#4338ca;padding:4px 10px;border-radius:999px;font-size:.75rem;font-weight:700;">' +
        (item.esPDF ? '📄' : '🖼️') + ' ' + item.archivo.name +
        ' <button onclick="lectorQuitar(' + i + ')" style="background:none;border:none;cursor:pointer;color:#818cf8;font-weight:900;margin-left:4px;">×</button></span>'
    ).join('');

    document.getElementById('lector-zona-vacia').style.display = hay ? 'none' : 'block';
    document.getElementById('lector-zona-archivos').style.display = hay ? 'block' : 'none';

    const btn = document.getElementById('lector-btn-analizar');
    btn.disabled = !hay;
    btn.style.opacity = hay ? '1' : '0.5';
}

function lectorQuitar(i) {
    LectorP.archivos.splice(i, 1);
    lectorActualizarZona();
}

// ── Análisis ────────────────────────────────────────────────────
async function lectorIniciarAnalisis() {
    if (!LectorP.archivos.length) return;
    lectorMostrar('cargando');
    lectorProgreso(0, 'Preparando...');

    let texto = '';
    try {
        for (let i = 0; i < LectorP.archivos.length; i++) {
            const { archivo, esPDF } = LectorP.archivos[i];
            lectorProgreso(Math.round((i / LectorP.archivos.length) * 65),
                'Procesando ' + (i + 1) + ' de ' + LectorP.archivos.length + ': ' + archivo.name);
            texto += (esPDF ? await lectorLeerPDF(archivo) : await lectorLeerImagen(archivo)) + '\n';
        }

        if (texto.trim().length < 15)
            throw new Error('No se pudo extraer texto. Verifica que el archivo sea legible.');

        lectorProgreso(88, 'Identificando datos...');
        document.getElementById('lr-crudo').textContent = texto;
        lectorExtraer(texto);
        lectorProgreso(100, 'Listo');
        lectorMostrar('resultado');

    } catch (e) {
        document.getElementById('lector-error-msg').textContent = e.message;
        lectorMostrar('error');
    }
}

function lectorLeerPDF(archivo) {
    return new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onerror = () => rej(new Error('No se pudo abrir el PDF'));
        reader.onload = async function () {
            try {
                const bytes = new Uint8Array(this.result);
                if (!String.fromCharCode(...bytes.slice(0, 5)).startsWith('%PDF'))
                    throw new Error('Archivo PDF inválido');

                const doc = await pdfjsLib.getDocument(bytes).promise;
                let out = '';
                for (let n = 1; n <= doc.numPages; n++) {
                    const page = await doc.getPage(n);
                    const content = await page.getTextContent();
                    let t = content.items.map(i => i.str).join(' ');

                    if (n <= 2 || !t || t.trim().length < 15) {
                        lectorProgreso(null, 'OCR página ' + n + '...');
                        try {
                            const vp = page.getViewport({ scale: n === 2 ? 3.0 : 2.0 });
                            const canvas = document.createElement('canvas');
                            canvas.width = vp.width; canvas.height = vp.height;
                            await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
                            const ocr = await Tesseract.recognize(canvas.toDataURL(), 'spa', {
                                logger: p => {
                                    if (p.status === 'recognizing text')
                                        lectorProgreso(null, 'OCR pág ' + n + ': ' + Math.round(p.progress * 100) + '%');
                                }
                            });
                            t += '\n' + ocr.data.text;
                        } catch (_) {}
                    }
                    out += '\n--- PAGINA ' + n + ' ---\n' + t;
                }
                res(out);
            } catch (e) { rej(new Error('Error PDF: ' + e.message)); }
        };
        reader.readAsArrayBuffer(archivo);
    });
}

async function lectorLeerImagen(archivo) {
    const url = URL.createObjectURL(archivo);
    lectorProgreso(null, 'OCR imagen...');
    const result = await Tesseract.recognize(url, 'spa', {
        logger: p => {
            if (p.status === 'recognizing text')
                lectorProgreso(null, 'OCR: ' + Math.round(p.progress * 100) + '%');
        }
    });
    URL.revokeObjectURL(url);
    return result.data.text;
}

// ── Extracción de datos ─────────────────────────────────────────
function lectorExtraer(texto) {
    const ini2 = texto.indexOf('--- PAGINA 2 ---');
    const pag1 = ini2 > 0 ? texto.substring(0, ini2) : texto.substring(0, 3000);

    // Total
    let total = 0;
    for (const p of [/TOTAL\s+A\s*PAGAR[\s:]*\$?\s*(\d+)\s+(\d{2})/i, /\$\s*(\d+)\.(\d{2})/, /\$\s*(\d{2,4})(?!\d)/]) {
        const m = pag1.match(p);
        if (m) { total = parseFloat((m[1]||'0').replace(/,/g,'') + '.' + (m[2]||'00')); if (total > 0) break; }
    }

    // Montos desglose
    const buscar = (txt, tags) => {
        for (const tag of tags) {
            const key = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            for (const p of [
                new RegExp(key + '[\\s:]*\\$?\\s*([\\d,]+)[\\s]+([\\d]{2})(?![\\d])', 'i'),
                new RegExp(key + '[\\s:]*\\$?\\s*([\\d,]+)\\.([\\d]{2})', 'i'),
                new RegExp(key + '[^\\d]*([\\d,]+)[\\s\\.]+([\\d]{2})(?![\\d])', 'i')
            ]) {
                const m = txt.match(p);
                if (m) {
                    const v = parseFloat(m[1].replace(/,/g,'') + '.' + (m[2]||'00'));
                    if (!isNaN(v) && v >= 0 && v < 100000) return v;
                }
            }
        }
        return 0;
    };

    let energia = buscar(texto, ['Energia', 'ENERGIA', 'Suministro']);
    let iva     = buscar(texto, ['IVA 16%', 'IVA 16', 'IVA']);
    if (!(energia > 0 && iva > 0) && total > 0) {
        energia = total / 1.16; iva = total - energia;
    }

    // Servicio
    const ms = texto.match(/(?:NO\.?\s*DE?\s*SERVICIO|No\.?\s*Servicio)[\s:]*(\d[\s]?\d{11})/i) || texto.match(/(\d{12})/);
    const servicio = ms ? ms[1].replace(/\s/g,'') : 'No detectado';

    // Titular
    let titular = 'No detectado';
    const excluidas = ['COMISION','FEDERAL','ELECTRICIDAD','CFE','SUMINISTRO','SERVICIO','PERIODO','FACTURADO','CONSUMO','TARIFA','ENERGIA','TOTAL','PAGAR','MEDIDOR','LECTURA','BIMESTRE'];
    for (const p of [
        /(?:NOMBRE|SR\.?|SRA\.?|TITULAR)[\s:]*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{7,50})/i,
        /([A-ZÁÉÍÓÚÑ]{2,}(?:\s+[A-ZÁÉÍÓÚÑ]{2,}){2,4})/
    ]) {
        const m = texto.match(p);
        if (m) {
            const c = m[1].trim().toUpperCase();
            if (c.length >= 8 && c.length <= 60 && !/\d{4,}/.test(c) &&
                !excluidas.some(e => c.includes(e)) && c.split(/\s+/).length >= 2) {
                titular = m[1].trim(); break;
            }
        }
    }

    // Tarifa
    const mt = texto.match(/(?:TARIFA|Tarifa)\s*:?\s*([A-Z0-9\-]{1,10})/i);
    const tarifa = mt ? mt[1].trim() : 'No detectado';

    // Limite de pago
    const ml = texto.match(/(?:L[IÍ]MITE\s+DE\s+PAGO|FECHA\s+L[IÍ]MITE|VENCE|VENCIMIENTO)[\s:]*([0-9]{1,2}[\s\-\/][A-Za-z]+[\s\-\/][0-9]{2,4}|[0-9]{1,2}[\-\/][0-9]{1,2}[\-\/][0-9]{2,4})/i);
    const limite = ml ? ml[1].trim() : 'No detectado';

    // Periodo
    const mp = texto.match(/(?:PERIODO|BIMESTRE|Periodo)[\s:]*([A-Za-z0-9\s\-\/]{4,25})/i);
    const periodo = mp ? mp[1].trim() : 'No detectado';

    // Media diaria
    const mkwh = texto.match(/(\d{2,4})\s*(?:kWh|KWH|kwh)/);
    const kwh = mkwh ? parseInt(mkwh[1]) : 0;
    const mdias = texto.match(/(\d{2})\s*(?:dias|DIAS|d[ií]as)/i);
    const dias = mdias ? parseInt(mdias[1]) : 60;
    const media = kwh && dias ? (kwh / dias).toFixed(1) + ' kWh/día' : 'No detectado';

    // Historial
    const historial = [];
    const rh = /(\d{4})\s*(?:kWh|KWH)?\s*([A-Za-z]{3,}[\s\-]?\d{2,4})?/g;
    let mh;
    while ((mh = rh.exec(texto)) !== null) {
        const v = parseInt(mh[1]);
        if (v > 50 && v < 9999) historial.push(v);
        if (historial.length >= 6) break;
    }

    // Actualizar DOM
    document.getElementById('lr-titular').textContent  = titular;
    document.getElementById('lr-servicio').textContent = servicio;
    document.getElementById('lr-limite').textContent   = limite;
    document.getElementById('lr-kwh').textContent      = kwh || '-';
    document.getElementById('lr-periodo').textContent  = periodo;
    document.getElementById('lr-total').textContent    = total > 0 ? '$' + total.toFixed(2) : 'No detectado';
    document.getElementById('lr-energia').textContent  = energia > 0 ? '$' + energia.toFixed(2) : '-';
    document.getElementById('lr-iva').textContent      = iva > 0 ? '$' + iva.toFixed(2) : '-';
    document.getElementById('lr-tarifa').textContent   = tarifa;
    document.getElementById('lr-media').textContent    = media;

    // Historial DOM
    const hEl = document.getElementById('lr-historial');
    hEl.innerHTML = historial.length
        ? historial.map((v, i) => '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f1f5f9;font-size:.8rem;"><span style="color:#94a3b8;">Periodo ' + (i+1) + '</span><span style="font-weight:700;color:#1e293b;">' + v + ' kWh</span></div>').join('')
        : '<p style="font-size:.75rem;color:#94a3b8;font-style:italic;">No se encontró historial.</p>';

    // Gráfica
    if (LectorP.chart) LectorP.chart.destroy();
    if (historial.length > 1) {
        LectorP.chart = new Chart(document.getElementById('lr-chart'), {
            type: 'bar',
            data: {
                labels: historial.map((_, i) => 'P' + (i + 1)),
                datasets: [{
                    label: 'kWh',
                    data: historial,
                    backgroundColor: '#4ade80',
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }
}

// ── Tabs ────────────────────────────────────────────────────────
function lectorTab(tab, btn) {
    ['resumen','historial','grafica','crudo'].forEach(t =>
        document.getElementById('ltab-' + t).style.display = t === tab ? 'block' : 'none'
    );
    document.querySelectorAll('.ltab-btn').forEach(b => b.classList.remove('ltab-activo'));
    btn.classList.add('ltab-activo');
}

// ── Helpers ─────────────────────────────────────────────────────
function lectorMostrar(paso) {
    ['subida','cargando','resultado','error-paso'].forEach(p =>
        document.getElementById('lector-' + p).style.display = p === paso ? 'block' : 'none'
    );
}

function lectorProgreso(pct, msg) {
    if (msg) document.getElementById('lector-msg').textContent = msg;
    if (pct !== null) {
        document.getElementById('lector-barra').style.width = pct + '%';
        document.getElementById('lector-pct').textContent = pct + '%';
    }
}

function lectorReiniciar() {
    LectorP.archivos = [];
    lectorActualizarZona();
    lectorMostrar('subida');
    if (LectorP.chart) { LectorP.chart.destroy(); LectorP.chart = null; }
}

function lectorReporte() {
    const titular  = document.getElementById('lr-titular').textContent;
    const kwh      = document.getElementById('lr-kwh').textContent;
    const total    = document.getElementById('lr-total').textContent;
    const periodo  = document.getElementById('lr-periodo').textContent;
    const tarifa   = document.getElementById('lr-tarifa').textContent;
    const media    = document.getElementById('lr-media').textContent;

    const win = window.open('', '_blank');
    win.document.write('<html><head><title>Reporte CFE</title></head><body style="font-family:Arial;padding:40px;max-width:600px;margin:auto;">');
    win.document.write('<h2 style="color:#4CAF50;">Reporte de Recibo CFE</h2>');
    win.document.write('<p><b>Titular:</b> ' + titular + '</p>');
    win.document.write('<p><b>Periodo:</b> ' + periodo + '</p>');
    win.document.write('<p><b>Consumo:</b> ' + kwh + ' kWh</p>');
    win.document.write('<p><b>Tarifa:</b> ' + tarifa + '</p>');
    win.document.write('<p><b>Media diaria:</b> ' + media + '</p>');
    win.document.write('<p><b>Total a pagar:</b> ' + total + '</p>');
    win.document.write('<p style="color:#94a3b8;font-size:.8rem;margin-top:40px;">Generado por Portafolio de David Cortes — ' + new Date().toLocaleDateString() + '</p>');
    win.document.write('</body></html>');
    win.document.close();
    win.print();
}