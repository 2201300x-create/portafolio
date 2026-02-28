/**
 * Lector Múltiple de Recibos CFE
 * David Cortes Cortes — 2026
 * Carga, analiza y compara 2 a 20 recibos simultáneamente.
 * Reutiliza leerPDF() y leerImagen() de lector.js (ya en scope global).
 */

// ════════════════════════════════════════════════════════════════
// ESTADO DEL MÓDULO
// ════════════════════════════════════════════════════════════════
const MultiCFE = {
    cola:          [],    // { archivo, esPDF, nombre, estado }  — uno por recibo
    resultados:    [],    // datos extraídos por recibo
    graficaKwh:    null,  // Chart barras kWh
    graficaCosto:  null,  // Chart barras costo
    graficaRadar:  null,  // Chart radar comparativo
    tabActiva:     'kwh'
};

const COLORES_RECIBO = [
    '#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6',
    '#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4',
    '#84cc16','#a855f7','#e11d48','#0ea5e9','#22c55e',
    '#d97706','#7c3aed','#db2777','#0284c7','#16a34a'
];

// ════════════════════════════════════════════════════════════════
// ABRIR / CERRAR
// ════════════════════════════════════════════════════════════════
function abrirModalMultiple() {
    document.getElementById('multiModal').style.display = 'flex';
}

function cerrarModalMultiple() {
    document.getElementById('multiModal').style.display = 'none';
}

// ════════════════════════════════════════════════════════════════
// ZONA DE SUBIDA MULTIPLE
// ════════════════════════════════════════════════════════════════
function multiDragOver(e) {
    e.preventDefault();
    document.getElementById('multiZona').classList.add('over');
}

function multiDragLeave(e) {
    document.getElementById('multiZona').classList.remove('over');
}

function multiDrop(e) {
    e.preventDefault();
    document.getElementById('multiZona').classList.remove('over');
    agregarArchivosMulti(Array.from(e.dataTransfer.files));
}

function multiSeleccion(e) {
    agregarArchivosMulti(Array.from(e.target.files));
    e.target.value = '';
}

function agregarArchivosMulti(archivos) {
    const errores = [];

    archivos.forEach(archivo => {
        if (MultiCFE.cola.length >= 20)
            return errores.push('Máximo 20 recibos permitidos');
        if (archivo.size === 0)
            return errores.push(archivo.name + ': archivo vacío');
        if (archivo.size > 50 * 1024 * 1024)
            return errores.push(archivo.name + ': supera 50 MB');
        if (!esPDF(archivo) && !esImagen(archivo))
            return errores.push(archivo.name + ': formato no compatible');

        // Evitar duplicados por nombre
        if (MultiCFE.cola.find(r => r.nombre === archivo.name))
            return errores.push(archivo.name + ': ya está en la lista');

        MultiCFE.cola.push({
            archivo,
            esPDF:  esPDF(archivo),
            nombre: archivo.name,
            estado: 'pendiente'   // pendiente | procesando | listo | error
        });
    });

    if (errores.length)
        mostrarErrorMulti(errores.join(' · '));

    renderizarCola();
}

function quitarDeCola(indice) {
    MultiCFE.cola.splice(indice, 1);
    renderizarCola();
}

function renderizarCola() {
    const contenedor = document.getElementById('multiCola');
    const hayArchivos = MultiCFE.cola.length > 0;

    document.getElementById('multiZonaVacia').classList.toggle('hidden', hayArchivos);
    document.getElementById('multiZonaLlena').classList.toggle('hidden', !hayArchivos);
    document.getElementById('multiBtnProcesar').disabled = MultiCFE.cola.length < 2;
    document.getElementById('multiContador').textContent =
        MultiCFE.cola.length + ' recibo' + (MultiCFE.cola.length !== 1 ? 's' : '');

    contenedor.innerHTML = MultiCFE.cola.map((item, i) => {
        const color  = COLORES_RECIBO[i % COLORES_RECIBO.length];
        const icono  = item.esPDF ? '📄' : '🖼️';
        const estado = {
            pendiente:   '<span class="estado-chip chip-pendiente">Pendiente</span>',
            procesando:  '<span class="estado-chip chip-procesando">⏳ Leyendo...</span>',
            listo:       '<span class="estado-chip chip-listo">✓ Listo</span>',
            error:       '<span class="estado-chip chip-error">✗ Error</span>'
        }[item.estado] || '';

        return '<div class="recibo-fila" style="border-left: 4px solid ' + color + '">' +
            '<div class="recibo-num" style="background:' + color + '">' + (i + 1) + '</div>' +
            '<div class="flex-1 min-w-0">' +
            '<p class="text-xs font-bold text-slate-700 truncate">' + icono + ' ' + item.nombre + '</p>' +
            '</div>' +
            estado +
            (item.estado === 'pendiente'
                ? '<button onclick="quitarDeCola(' + i + ')" ' +
                  'style="background:none;border:none;cursor:pointer;padding:4px;" ' +
                  'class="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0">' +
                  '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                  '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>' +
                  '</button>'
                : '') +
            '</div>';
    }).join('');
}

function mostrarErrorMulti(msg) {
    const el = document.getElementById('multiError');
    el.classList.remove('hidden');
    el.textContent = msg;
    setTimeout(() => el.classList.add('hidden'), 4000);
}

// ════════════════════════════════════════════════════════════════
// PROCESO DE ANÁLISIS MÚLTIPLE
// ════════════════════════════════════════════════════════════════
async function procesarMultiple() {
    if (MultiCFE.cola.length < 2) return;

    MultiCFE.resultados = [];
    mostrarPasoMulti('procesando');

    const total = MultiCFE.cola.length;

    for (let i = 0; i < total; i++) {
        const item = MultiCFE.cola[i];
        item.estado = 'procesando';
        renderizarCola();

        actualizarProgresoMulti(
            Math.round((i / total) * 90),
            'Analizando ' + (i + 1) + ' de ' + total + ': ' + item.nombre
        );

        try {
            let texto = '';
            if (item.esPDF) {
                texto = await leerPDFMulti(item.archivo, i, total);
            } else {
                texto = await leerImagenMulti(item.archivo, i, total);
            }

            const datos = extraerDatosRecibo(texto, item.nombre);
            datos.color  = COLORES_RECIBO[i % COLORES_RECIBO.length];
            datos.numero = i + 1;
            MultiCFE.resultados.push(datos);
            item.estado = 'listo';

        } catch (err) {
            item.estado = 'error';
            MultiCFE.resultados.push({
                nombre:    item.nombre,
                color:     COLORES_RECIBO[i % COLORES_RECIBO.length],
                numero:    i + 1,
                titular:   'Error al leer',
                servicio:  '-',
                kwh:       0,
                total:     0,
                energia:   0,
                iva:       0,
                periodo:   '-',
                limite:    '-',
                media:     0,
                tarifa:    '-',
                error:     err.message
            });
        }

        renderizarCola();
    }

    actualizarProgresoMulti(100, 'Comparativa lista');
    mostrarResultadosMulti();
}

// ── Palabras clave que confirman que el texto de CFE es legible ─
const PALABRAS_CFE = ['ENERGIA', 'Energia', 'IVA', 'PAGAR', 'Pagar', 'SERVICIO', 'Servicio', 'kWh', 'KWH'];

function textoTieneDatosCFE(texto) {
    // Si el texto contiene al menos 3 palabras clave del recibo, es suficiente
    const encontradas = PALABRAS_CFE.filter(p => texto.includes(p));
    return encontradas.length >= 3;
}

async function ocrPagina(pagina, escala, idx, total, numPag) {
    const vp     = pagina.getViewport({ scale: escala });
    const lienzo = document.createElement('canvas');
    lienzo.width  = vp.width;
    lienzo.height = vp.height;
    await pagina.render({ canvasContext: lienzo.getContext('2d'), viewport: vp }).promise;
    const ocr = await Tesseract.recognize(lienzo.toDataURL(), 'spa', {
        logger: m => {
            if (m.status === 'recognizing text')
                actualizarProgresoMulti(null,
                    'Recibo ' + (idx+1) + '/' + total + ' OCR pág ' + numPag + ': ' + Math.round(m.progress*100) + '%');
        }
    });
    return ocr.data.text;
}

// ── Lee PDF intentando primero PDF.js; usa OCR solo si el texto
//    resultante no contiene datos reconocibles del recibo CFE.
async function leerPDFMulti(archivo, idx, total) {
    return new Promise((resolver, rechazar) => {
        const lector = new FileReader();
        lector.onerror = () => rechazar(new Error('No se pudo leer el PDF'));
        lector.onload = async function () {
            try {
                const bytes    = new Uint8Array(this.result);
                const cabecera = String.fromCharCode(...bytes.slice(0, 5));
                if (!cabecera.startsWith('%PDF'))
                    throw new Error('No es un PDF válido');

                actualizarProgresoMulti(null, 'Recibo ' + (idx+1) + '/' + total + ' — extrayendo texto...');
                const doc    = await pdfjsLib.getDocument(bytes).promise;
                let   texto  = '';

                // ── Paso 1: extraer texto con PDF.js (rápido, sin OCR) ──
                for (let p = 1; p <= doc.numPages; p++) {
                    const pagina    = await doc.getPage(p);
                    const contenido = await pagina.getTextContent();
                    let   pg        = '';
                    contenido.items.forEach(it => { pg += it.str + ' '; });
                    texto += '\n--- PAGINA ' + p + ' ---\n' + pg;
                }

                // ── Paso 2: ¿el texto tiene datos CFE? Si sí, listo. ──
                if (textoTieneDatosCFE(texto)) {
                    resolver(texto);
                    return;
                }

                // ── Paso 3: fallback — aplicar OCR solo a págs 1 y 2 ──
                actualizarProgresoMulti(null, 'Recibo ' + (idx+1) + '/' + total + ' — aplicando OCR...');
                let textoConOCR = '';

                for (let p = 1; p <= Math.min(doc.numPages, 2); p++) {
                    const pagina = await doc.getPage(p);
                    // Extraer texto base
                    const contenido = await pagina.getTextContent();
                    let   pg        = '';
                    contenido.items.forEach(it => { pg += it.str + ' '; });

                    // Aplicar OCR encima
                    try {
                        const escala = p === 2 ? 3.0 : 2.0;
                        const ocrTxt = await ocrPagina(pagina, escala, idx, total, p);
                        pg += '\n' + ocrTxt;
                    } catch (_) {}

                    textoConOCR += '\n--- PAGINA ' + p + ' ---\n' + pg;
                }

                // Adjuntar resto de páginas sin OCR
                for (let p = 3; p <= doc.numPages; p++) {
                    const pagina    = await doc.getPage(p);
                    const contenido = await pagina.getTextContent();
                    let   pg        = '';
                    contenido.items.forEach(it => { pg += it.str + ' '; });
                    textoConOCR += '\n--- PAGINA ' + p + ' ---\n' + pg;
                }

                resolver(textoConOCR);

            } catch (e) { rechazar(new Error(e.message)); }
        };
        lector.readAsArrayBuffer(archivo);
    });
}

async function leerImagenMulti(archivo, idx, total) {
    const res = await Tesseract.recognize(archivo, 'spa', {
        logger: m => {
            if (m.status === 'recognizing text')
                actualizarProgresoMulti(null,
                    'Recibo ' + (idx+1) + '/' + total + ' OCR: ' + Math.round(m.progress*100) + '%');
        }
    });
    if (!res.data.text || res.data.text.trim().length < 5)
        throw new Error('No se detectó texto en la imagen');
    return res.data.text;
}

// ════════════════════════════════════════════════════════════════
// EXTRACCIÓN DE DATOS POR RECIBO (función reutilizable)
// ════════════════════════════════════════════════════════════════
function extraerDatosRecibo(texto, nombreArchivo) {

    const hallarMonto = (etiquetas) => {
        for (const et of etiquetas) {
            const clave = et.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pats = [
                new RegExp(clave + '[\\s:]*\\$?\\s*([\\d,]+)[\\s]+([\\d]{2})(?![\\d])', 'i'),
                new RegExp(clave + '[\\s:]*\\$?\\s*([\\d,]+)\\.([\\d]{2})', 'i'),
                new RegExp(clave + '[^\\d]*([\\d,]+)[\\s\\.]+([\\d]{2})(?![\\d])', 'i')
            ];
            for (const p of pats) {
                const m = texto.match(p);
                if (m) {
                    const v = parseFloat(m[1].replace(/,/g, '') + '.' + (m[2] || '00'));
                    if (!isNaN(v) && v >= 0 && v < 100000) return v;
                }
            }
        }
        return 0;
    };

    const p2    = texto.indexOf('--- PAGINA 2 ---');
    const texP1 = p2 > 0 ? texto.substring(0, p2) : texto.substring(0, 3000);

    // Total a pagar
    let montoTotal = 0;
    for (const pat of [
        /TOTAL\s+A\s*PAGAR[\s:]*\$?\s*(\d+)\s+(\d{2})/i,
        /\$\s*(\d+)\.(\d{2})/,
        /\$\s*(\d{2,4})(?!\d)/
    ]) {
        const m = texP1.match(pat);
        if (m) { montoTotal = parseFloat((m[1]||'0').replace(/,/g,'') + '.' + (m[2]||'00')); if (montoTotal>0) break; }
    }

    let energia = hallarMonto(['Energia','ENERGIA','Suministro']);
    let iva     = hallarMonto(['IVA 16%','IVA 16','IVA']);
    const dap   = hallarMonto(['DAP','Alumbrado']);
    const adeudo= hallarMonto(['Adeudo Anterior','Saldo Anterior']);
    const pago  = hallarMonto(['Su Pago','SU PAGO','Pago Anterior']);

    if (!(energia > 0 && iva > 0) && montoTotal > 0) {
        const base = Math.max(montoTotal - adeudo + Math.abs(pago) - dap, montoTotal);
        energia = base / 1.16;
        iva     = base - energia;
    }

    // Servicio y titular
    const mSvc = texto.match(/(?:NO\.?\s*DE?\s*SERVICIO|No\.?\s*Servicio)[\s:]*(\d[\s]?\d{11})/i) || texto.match(/(\d{12})/);
    const servicio = mSvc ? mSvc[1].replace(/\s/g,'') : 'No detectado';

    let titular = nombreArchivo.replace(/\.[^.]+$/, ''); // fallback: nombre del archivo
    for (const p of [
        /TOTAL\s+A\s*PAGAR[^\n]*\n([A-Z\xC1\xC9\xCD\xD3\xDA\xD1\s]{10,50})/i,
        /([A-Z\xC1\xC9\xCD\xD3\xDA\xD1]{4,}\s+[A-Z\xC1\xC9\xCD\xD3\xDA\xD1]{4,}\s+[A-Z\xC1\xC9\xCD\xD3\xDA\xD1]{4,})/
    ]) {
        const m = texto.match(p);
        if (m) { const n=m[1].trim(); if (n.length>5 && !n.includes('CFE') && !/^\d+$/.test(n)){titular=n;break;} }
    }

    // Periodo
    let periodo = 'No detectado';
    for (const p of [
        /PERIODO\s+FACTURADO[\s:]*(\d{2})\s+([A-Z]{3})\s+(\d{2})\s*[-]\s*(\d{2})\s+([A-Z]{3})\s*(\d{2})/i,
        /(\d{2})\s+([A-Z]{3})\s+(\d{2})\s*[-]\s*(\d{2})\s+([A-Z]{3})\s*(\d{2})/i,
        /del\s+(\d{2})\s+([A-Z]{3})\s+(\d{2})\s+al\s+(\d{2})\s+([A-Z]{3})\s*(\d{2})/i
    ]) {
        const m = texP1.match(p);
        if (m) { periodo='del '+m[1]+' '+m[2]+' '+m[3]+' al '+m[4]+' '+m[5]+' '+m[6]; break; }
    }

    // kWh consumo
    let kwh = 0;
    for (const p of [
        /Total\s+periodo[\s:]+([a-zA-Z]?\d+)/i,
        /CONSUMO[\s:]+([a-zA-Z]?\d+)\s*kWh/i,
        /(\d+)\s+kWh/i
    ]) {
        const m = (texP1 + texto).match(p);
        if (m) { const v=parseInt(m[1].replace(/[a-zA-Z]/g,'')); if(v>0&&v<10000){kwh=v;break;} }
    }

    // Límite de pago
    let limite = 'No detectado';
    const mLim = texto.match(/L[I\xCD]MITE\s+DE\s+PAGO[\s:]*(\d{2})\s+([A-Z]{3})\s+(\d{2})/i)
              || texto.match(/LIMITE\s+DE\s+PAGO[\s:]*(\d{2})\s+([A-Z]{3})\s+(\d{2})/i);
    if (mLim) {
        const mm={ENE:'01',FEB:'02',MAR:'03',ABR:'04',MAY:'05',JUN:'06',
                  JUL:'07',AGO:'08',SEP:'09',OCT:'10',NOV:'11',DIC:'12'};
        limite = mLim[1]+'/'+(mm[mLim[2].toUpperCase()]||'01')+'/20'+mLim[3];
    }

    // Media diaria
    let dias = 60;
    const mF = periodo.match(/del\s+(\d{2})\s+([A-Z]{3})\s+(\d{2})\s+al\s+(\d{2})\s+([A-Z]{3})\s+(\d{2})/i);
    if (mF) {
        const mm={ENE:0,FEB:1,MAR:2,ABR:3,MAY:4,JUN:5,JUL:6,AGO:7,SEP:8,OCT:9,NOV:10,DIC:11};
        const d1=new Date(2000+parseInt(mF[3]),mm[mF[2].toUpperCase()],parseInt(mF[1]));
        const d2=new Date(2000+parseInt(mF[6]),mm[mF[5].toUpperCase()],parseInt(mF[4]));
        const df=Math.ceil(Math.abs(d2-d1)/86400000);
        if (df>0&&df<100) dias=df;
    }
    const media = kwh > 0 ? parseFloat((kwh/dias).toFixed(2)) : 0;

    let tarifa = 'Desconocida';
    if (kwh > 500)      tarifa = 'Alto Consumo (DAC)';
    else if (kwh > 250) tarifa = 'Domestica Alta';
    else if (kwh > 0)   tarifa = 'Domestica Basica';

    return {
        nombre:   titular,
        archivo:  nombreArchivo,
        servicio, kwh, periodo, limite, media, tarifa,
        total:    montoTotal > 0 ? montoTotal : parseFloat((energia+iva).toFixed(2)),
        energia:  parseFloat(energia.toFixed(2)),
        iva:      parseFloat(iva.toFixed(2)),
        dap:      parseFloat(dap.toFixed(2)),
        adeudo:   parseFloat(adeudo.toFixed(2)),
        pago:     parseFloat(pago.toFixed(2))
    };
}

// ════════════════════════════════════════════════════════════════
// MOSTRAR RESULTADOS
// ════════════════════════════════════════════════════════════════
function mostrarResultadosMulti() {
    const res = MultiCFE.resultados;
    if (!res.length) return;

    // ── Estadísticas globales ─────────────────────────────────
    const validos   = res.filter(r => r.kwh > 0);
    const kwhVals   = validos.map(r => r.kwh);
    const costoVals = validos.map(r => r.total);
    const maxKwh    = Math.max(...kwhVals);
    const minKwh    = Math.min(...kwhVals);
    const promKwh   = kwhVals.reduce((a,b)=>a+b,0) / kwhVals.length;
    const promCosto = costoVals.reduce((a,b)=>a+b,0) / costoVals.length;
    const ganador   = res.find(r => r.kwh === minKwh);
    const peor      = res.find(r => r.kwh === maxKwh);

    // Tarjetas resumen — solo IDs que existen en el HTML
    const _mset = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    _mset('mres-total-recibos', res.length);
    _mset('mres-prom-kwh',      promKwh.toFixed(1) + ' kWh');
    _mset('mres-min-nombre',    ganador ? ganador.nombre : '-');
    _mset('mres-min-kwh',       minKwh + ' kWh');
    _mset('mres-max-nombre',    peor ? peor.nombre : '-');
    _mset('mres-max-kwh',       maxKwh + ' kWh');

    // ── Tabla de recibos ──────────────────────────────────────
    const tabla = document.getElementById('mres-tabla');
    tabla.innerHTML = res.map(r =>
        '<tr class="tabla-fila">' +
        '<td class="tabla-td">' +
            '<span class="recibo-num-sm" style="background:' + r.color + '">' + r.numero + '</span>' +
        '</td>' +
        '<td class="tabla-td">' +
            '<p class="font-bold text-slate-800 text-xs">' + r.nombre + '</p>' +
            '<p class="text-[10px] text-slate-400">' + r.archivo + '</p>' +
        '</td>' +
        '<td class="tabla-td text-center">' +
            '<span class="font-black text-indigo-600 text-sm">' + (r.kwh||'—') + '</span>' +
            '<span class="text-[10px] text-slate-400 ml-1">kWh</span>' +
        '</td>' +
        '<td class="tabla-td text-center">' +
            '<span class="font-black text-green-600 text-sm">$' + (r.total>0?r.total.toFixed(2):'—') + '</span>' +
        '</td>' +
        '<td class="tabla-td text-center">' +
            '<span class="text-xs text-slate-600">' + (r.media>0?r.media+' kWh/día':'—') + '</span>' +
        '</td>' +
        '<td class="tabla-td text-center">' +
            '<span class="tarifa-badge" style="' + badgeTarifa(r.tarifa) + '">' + r.tarifa + '</span>' +
        '</td>' +
        (r.error
            ? '<td class="tabla-td"><span class="text-[10px] text-red-500">' + r.error + '</span></td>'
            : '<td class="tabla-td text-center text-[10px] text-slate-400">' + r.periodo + '</td>'
        ) +
        '</tr>'
    ).join('');

    // ── Gráficas ──────────────────────────────────────────────
    construirGraficas(res);

    mostrarPasoMulti('resultado');
    // Esperar un tick para que el DOM sea visible antes de cambiar tab
    setTimeout(() => {
        const primerTab = document.querySelector('.mtab-btn');
        cambiarTabMulti('kwh', primerTab);
    }, 0);
}

function badgeTarifa(tarifa) {
    if (tarifa.includes('DAC'))    return 'background:#fee2e2;color:#991b1b;';
    if (tarifa.includes('Alta'))   return 'background:#fef9c3;color:#854d0e;';
    if (tarifa.includes('Basica')) return 'background:#dcfce7;color:#166534;';
    return 'background:#f1f5f9;color:#475569;';
}

// ════════════════════════════════════════════════════════════════
// GRÁFICAS
// ════════════════════════════════════════════════════════════════
function construirGraficas(res) {
    const nombres  = res.map(r => r.nombre.split(' ')[0]); // primer nombre
    const colores  = res.map(r => r.color);
    const kwhData  = res.map(r => r.kwh);
    const costData = res.map(r => r.total);
    const maxKwh   = Math.max(...kwhData);

    // ── Barras kWh ────────────────────────────────────────────
    const ctxKwh = document.getElementById('mGrafKwh');
    if (MultiCFE.graficaKwh) MultiCFE.graficaKwh.destroy();
    MultiCFE.graficaKwh = new Chart(ctxKwh, {
        type: 'bar',
        data: {
            labels: nombres,
            datasets: [{
                label: 'Consumo (kWh)',
                data:  kwhData,
                backgroundColor: kwhData.map((v,i) =>
                    v === maxKwh ? '#ef4444' : colores[i]
                ),
                borderRadius: 10,
                borderSkipped: false
            }]
        },
        options: opcionesGrafica('kWh', 'Consumo por recibo')
    });

    // ── Barras Costo ──────────────────────────────────────────
    const ctxCosto = document.getElementById('mGrafCosto');
    if (MultiCFE.graficaCosto) MultiCFE.graficaCosto.destroy();
    const maxCosto = Math.max(...costData);
    MultiCFE.graficaCosto = new Chart(ctxCosto, {
        type: 'bar',
        data: {
            labels: nombres,
            datasets: [{
                label: 'Total a Pagar ($)',
                data:  costData,
                backgroundColor: costData.map((v,i) =>
                    v === maxCosto ? '#ef4444' : colores[i]
                ),
                borderRadius: 10,
                borderSkipped: false
            }]
        },
        options: opcionesGrafica('$', 'Costo por recibo')
    });

    // ── Radar comparativo (solo si ≤8 recibos) ───────────────
    const ctxRadar = document.getElementById('mGrafRadar');
    if (MultiCFE.graficaRadar) MultiCFE.graficaRadar.destroy();

    if (res.length <= 8) {
        // Normalizar 0-100 para radar: kwh, costo, media diaria
        const normKwh   = normalizar(kwhData);
        const normCosto = normalizar(costData);
        const normMedia = normalizar(res.map(r => r.media));

        MultiCFE.graficaRadar = new Chart(ctxRadar, {
            type: 'radar',
            data: {
                labels: ['Consumo kWh', 'Costo Total', 'Media Diaria'],
                datasets: res.map((r, i) => ({
                    label: r.nombre.split(' ')[0],
                    data:  [normKwh[i], normCosto[i], normMedia[i]],
                    backgroundColor: colores[i] + '33',
                    borderColor:     colores[i],
                    borderWidth: 2,
                    pointBackgroundColor: colores[i]
                }))
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'bottom',
                        labels: { font: { size: 10, weight: 'bold' }, usePointStyle: true }
                    },
                    tooltip: {
                        backgroundColor: '#1e293b',
                        callbacks: {
                            label: c => c.dataset.label + ': ' + c.raw.toFixed(0) + '/100'
                        }
                    }
                },
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 100,
                        ticks: { stepSize: 25, font: { size: 9 } },
                        grid: { color: '#e2e8f0' },
                        pointLabels: { font: { size: 10, weight: 'bold' } }
                    }
                }
            }
        });
        document.getElementById('mRadarContainer').classList.remove('hidden');
    } else {
        document.getElementById('mRadarContainer').classList.add('hidden');
    }
}

function opcionesGrafica(unidad, titulo) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            title: { display: true, text: titulo,
                font: { size: 12, weight: 'bold' }, color: '#334155', padding: { bottom: 10 } },
            tooltip: {
                backgroundColor: '#1e293b',
                padding: 10,
                callbacks: {
                    label: c => unidad === '$'
                        ? '$' + c.raw.toFixed(2)
                        : c.raw + ' ' + unidad
                }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                grid: { color: '#f1f5f9' },
                ticks: { font: { size: 10 },
                    callback: v => unidad === '$' ? '$' + v : v + ' ' + unidad }
            },
            x: {
                grid: { display: false },
                ticks: { font: { size: 10, weight: 'bold' }, maxRotation: 30 }
            }
        }
    };
}

function normalizar(arr) {
    const max = Math.max(...arr);
    if (max === 0) return arr.map(() => 0);
    return arr.map(v => parseFloat(((v / max) * 100).toFixed(1)));
}

// ════════════════════════════════════════════════════════════════
// DEMO
// ════════════════════════════════════════════════════════════════
function cargarDemoMultiple() {
    MultiCFE.resultados = [
        { numero:1, color:'#6366f1', nombre:'VALDEZ MORA JULIA',    archivo:'recibo_01.pdf', servicio:'202100300330', kwh:150, total:272.00, energia:233.87, iva:37.42, dap:0,     adeudo:270.71, pago:270,   media:2.42, tarifa:'Domestica Basica', periodo:'del 07 NOV 25 al 08 ENE 26', limite:'23/01/2026' },
        { numero:2, color:'#10b981', nombre:'GARCIA LOPEZ MARIO',   archivo:'recibo_02.pdf', servicio:'202100300331', kwh:325, total:580.00, energia:500.00, iva:80.00, dap:0,     adeudo:0,      pago:0,     media:5.25, tarifa:'Domestica Alta',  periodo:'del 07 NOV 25 al 08 ENE 26', limite:'23/01/2026' },
        { numero:3, color:'#f59e0b', nombre:'MARTINEZ RUIZ ANA',    archivo:'recibo_03.pdf', servicio:'202100300332', kwh:89,  total:142.00, energia:122.41, iva:19.59, dap:0,     adeudo:0,      pago:0,     media:1.44, tarifa:'Domestica Basica', periodo:'del 07 NOV 25 al 08 ENE 26', limite:'23/01/2026' },
        { numero:4, color:'#ef4444', nombre:'TORRES REYES PEDRO',   archivo:'recibo_04.pdf', servicio:'202100300333', kwh:612, total:1250.00,energia:1077.59,iva:172.41,dap:0,     adeudo:0,      pago:0,     media:9.87, tarifa:'Alto Consumo (DAC)',periodo:'del 07 NOV 25 al 08 ENE 26', limite:'23/01/2026' },
        { numero:5, color:'#3b82f6', nombre:'SANCHEZ DIAZ LUISA',   archivo:'recibo_05.pdf', servicio:'202100300334', kwh:210, total:380.00, energia:327.59, iva:52.41, dap:0,     adeudo:180.00, pago:180,   media:3.39, tarifa:'Domestica Basica', periodo:'del 07 NOV 25 al 08 ENE 26', limite:'23/01/2026' },
    ];

    mostrarResultadosMulti();
}

// ════════════════════════════════════════════════════════════════
// EXPORTAR CSV
// ════════════════════════════════════════════════════════════════
function exportarCSV() {
    if (!MultiCFE.resultados.length) return;

    const cabeceras = ['#','Titular','Archivo','Servicio','kWh','Total ($)','Energia','IVA','DAP','Adeudo','Pago','Media Diaria','Tarifa','Periodo','Limite Pago'];
    const filas = MultiCFE.resultados.map(r => [
        r.numero, r.nombre, r.archivo, r.servicio,
        r.kwh, r.total.toFixed(2), r.energia.toFixed(2),
        r.iva.toFixed(2), r.dap.toFixed(2), r.adeudo.toFixed(2),
        r.pago.toFixed(2), r.media, r.tarifa, r.periodo, r.limite
    ].map(v => '"' + String(v).replace(/"/g,'""') + '"').join(','));

    const csv  = [cabeceras.join(','), ...filas].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = 'comparativa_recibos_cfe.csv';
    link.click();
    URL.revokeObjectURL(url);
}

// ════════════════════════════════════════════════════════════════
// HELPERS UI
// ════════════════════════════════════════════════════════════════
function mostrarPasoMulti(paso) {
    ['subida', 'procesando', 'resultado'].forEach(id =>
        document.getElementById('mpaso-' + id).classList.toggle('hidden', id !== paso)
    );
}

function actualizarProgresoMulti(pct, msg) {
    if (msg) document.getElementById('mMsgCarga').textContent = msg;
    if (pct !== null) {
        document.getElementById('mBarraProgreso').style.width = pct + '%';
        document.getElementById('mTextoPct').textContent = pct + '%';
    }
}

function reiniciarMultiple() {
    MultiCFE.cola       = [];
    MultiCFE.resultados = [];
    if (MultiCFE.graficaKwh)   { MultiCFE.graficaKwh.destroy();   MultiCFE.graficaKwh   = null; }
    if (MultiCFE.graficaCosto) { MultiCFE.graficaCosto.destroy();  MultiCFE.graficaCosto = null; }
    if (MultiCFE.graficaRadar) { MultiCFE.graficaRadar.destroy();  MultiCFE.graficaRadar = null; }
    renderizarCola();
    mostrarPasoMulti('subida');
}

function cambiarTabMulti(tab, boton) {
    ['kwh','costo','radar'].forEach(t =>
        document.getElementById('mtab-' + t).classList.toggle('hidden', t !== tab)
    );
    document.querySelectorAll('.mtab-btn').forEach(b => b.classList.remove('active'));
    if (boton) boton.classList.add('active');
    MultiCFE.tabActiva = tab;
}