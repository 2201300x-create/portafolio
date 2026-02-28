/**
 * Lector de Recibos CFE
 * David Cortes Cortes — 2026
 * Extrae datos de recibos CFE usando PDF.js + Tesseract OCR
 */

// ── Configurar worker de PDF.js ──────────────────────────────────
pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ════════════════════════════════════════════════════════════════
// ESTADO DE LA APLICACION
// ════════════════════════════════════════════════════════════════
const LectorCFE = {
    archivos: [],          // archivos cargados
    kwhActual: null,       // kWh del ultimo recibo analizado
    graficaCFE: null,      // instancia Chart.js recibo
    graficaComp: null,     // instancia Chart.js comparativa
    contadorPersonas: 0    // contador para IDs de filas
};

// ════════════════════════════════════════════════════════════════
// ABRIR / CERRAR MODALES
// ════════════════════════════════════════════════════════════════
function abrirModal() {
    document.getElementById('cfeModal').style.display = 'flex';
}

function cerrarModal() {
    document.getElementById('cfeModal').style.display = 'none';
}

function abrirComparativa() {
    cerrarModal();
    document.getElementById('compModal').style.display = 'flex';
    if (LectorCFE.contadorPersonas === 0) {
        agregarFila('David', LectorCFE.kwhActual || 150);
        agregarFila('Promedio CFE', 217);
    }
}

function cerrarComparativa() {
    document.getElementById('compModal').style.display = 'none';
}

// ════════════════════════════════════════════════════════════════
// MANEJO DE ARCHIVOS
// ════════════════════════════════════════════════════════════════
function esPDF(archivo) {
    return archivo.name.toLowerCase().endsWith('.pdf');
}

function esImagen(archivo) {
    return /\.(jpe?g|png|webp)$/i.test(archivo.name) || archivo.type.startsWith('image/');
}

function onDragOver(e) {
    e.preventDefault();
    document.getElementById('zonaSubida').classList.add('over');
}

function onDragLeave(e) {
    document.getElementById('zonaSubida').classList.remove('over');
}

function onDrop(e) {
    e.preventDefault();
    document.getElementById('zonaSubida').classList.remove('over');
    registrarArchivos(Array.from(e.dataTransfer.files));
}

function onSeleccionArchivo(e) {
    registrarArchivos(Array.from(e.target.files));
    e.target.value = '';
}

function registrarArchivos(nuevos) {
    const errores = [];

    nuevos.forEach(archivo => {
        if (archivo.size === 0)
            return errores.push(archivo.name + ': el archivo esta vacio');
        if (archivo.size > 50 * 1024 * 1024)
            return errores.push(archivo.name + ': supera el limite de 50 MB');
        if (!esPDF(archivo) && !esImagen(archivo))
            return errores.push(archivo.name + ': formato no compatible');

        LectorCFE.archivos.push({ archivo, esPDF: esPDF(archivo) });
    });

    if (errores.length) {
        const caja = document.getElementById('errorSubida');
        caja.classList.remove('hidden');
        caja.textContent = errores.join(' | ');
    }

    actualizarZona();
}

function quitarArchivo(indice) {
    LectorCFE.archivos.splice(indice, 1);
    actualizarZona();
}

function actualizarZona() {
    const chips = document.getElementById('listaArchivos');
    chips.innerHTML = LectorCFE.archivos.map((item, i) =>
        '<span class="file-chip">' +
        (item.esPDF ? '📄' : '🖼️') + ' ' + item.archivo.name +
        ' <button onclick="quitarArchivo(' + i + ')" ' +
        'style="margin-left:4px;font-weight:900;color:#818cf8;cursor:pointer;background:none;border:none;">×</button>' +
        '</span>'
    ).join('');

    const hayArchivos = LectorCFE.archivos.length > 0;
    document.getElementById('zonaVacia').classList.toggle('hidden', hayArchivos);
    document.getElementById('zonaConArchivos').classList.toggle('hidden', !hayArchivos);
    document.getElementById('btnProcesar').disabled = !hayArchivos;
    document.getElementById('errorSubida').classList.add('hidden');
}

// ════════════════════════════════════════════════════════════════
// PROCESO PRINCIPAL DE ANALISIS
// ════════════════════════════════════════════════════════════════
async function iniciarAnalisis() {
    if (!LectorCFE.archivos.length) return;

    mostrarPaso('cargando');
    actualizarProgreso(0, 'Preparando analisis...');

    let textoTotal = '';

    try {
        for (let i = 0; i < LectorCFE.archivos.length; i++) {
            const { archivo, esPDF: esPdf } = LectorCFE.archivos[i];
            const progBase = Math.round((i / LectorCFE.archivos.length) * 65);

            actualizarProgreso(progBase,
                'Procesando ' + (i + 1) + ' de ' + LectorCFE.archivos.length + ': ' + archivo.name
            );

            if (esPdf) {
                const resultado = await leerPDF(archivo);
                textoTotal += resultado + '\n';
            } else {
                const resultado = await leerImagen(archivo);
                textoTotal += resultado + '\n';
            }
        }

        if (textoTotal.trim().length < 15)
            throw new Error('No fue posible extraer texto del archivo. Verifica que sea legible.');

        actualizarProgreso(88, 'Identificando datos del recibo...');
        document.getElementById('textoCrudo').textContent = textoTotal;

        extraerYMostrar(textoTotal);

        actualizarProgreso(100, 'Analisis completado');
        mostrarPaso('resultado');

    } catch (error) {
        document.getElementById('mensajeError').textContent = error.message;
        mostrarPaso('error');
    }
}

// ════════════════════════════════════════════════════════════════
// LEER PDF CON PDF.js + OCR
// ════════════════════════════════════════════════════════════════
function leerPDF(archivo) {
    return new Promise((resolver, rechazar) => {
        const lector = new FileReader();

        lector.onerror = () => rechazar(new Error('No se pudo abrir el archivo PDF'));

        lector.onload = async function () {
            try {
                const bytes = new Uint8Array(this.result);
                const cabecera = String.fromCharCode(...bytes.slice(0, 5));

                if (!cabecera.startsWith('%PDF'))
                    throw new Error('El archivo no tiene formato PDF valido');

                const documento = await pdfjsLib.getDocument(bytes).promise;
                let textoFinal = '';

                for (let numPag = 1; numPag <= documento.numPages; numPag++) {
                    const pagina   = await documento.getPage(numPag);
                    const contenido = await pagina.getTextContent();
                    let textoPagina = '';

                    contenido.items.forEach(elemento => {
                        textoPagina += elemento.str + ' ';
                    });

                    // Aplicar OCR en las primeras 2 paginas o si el texto es ilegible
                    const necesitaOCR = numPag <= 2 || textoEsBasura(textoPagina);

                    if (necesitaOCR) {
                        actualizarProgreso(null, 'OCR pagina ' + numPag + '...');
                        try {
                            const escala   = numPag === 2 ? 3.0 : 2.0;
                            const viewport = pagina.getViewport({ scale: escala });
                            const lienzo   = document.createElement('canvas');
                            lienzo.width   = viewport.width;
                            lienzo.height  = viewport.height;

                            await pagina.render({
                                canvasContext: lienzo.getContext('2d'),
                                viewport
                            }).promise;

                            const ocr = await Tesseract.recognize(lienzo.toDataURL(), 'spa', {
                                logger: prog => {
                                    if (prog.status === 'recognizing text') {
                                        const pct = Math.round(prog.progress * 100);
                                        actualizarProgreso(null, 'OCR pag ' + numPag + ': ' + pct + '%');
                                    }
                                }
                            });

                            textoPagina += '\n' + ocr.data.text;
                        } catch (_) { /* continuar sin OCR si falla */ }
                    }

                    textoFinal += '\n--- PAGINA ' + numPag + ' ---\n' + textoPagina;
                }

                resolver(textoFinal);

            } catch (err) {
                rechazar(new Error('Error al procesar el PDF: ' + err.message));
            }
        };

        lector.readAsArrayBuffer(archivo);
    });
}

// ════════════════════════════════════════════════════════════════
// LEER IMAGEN CON TESSERACT
// ════════════════════════════════════════════════════════════════
async function leerImagen(archivo) {
    const resultado = await Tesseract.recognize(archivo, 'spa', {
        logger: prog => {
            if (prog.status === 'recognizing text') {
                const pct = Math.round(prog.progress * 100);
                actualizarProgreso(null, 'Leyendo imagen: ' + pct + '%');
            }
        }
    });

    if (!resultado.data.text || resultado.data.text.trim().length < 5)
        throw new Error('No se detecto texto en la imagen. Usa una imagen con mayor resolucion.');

    return resultado.data.text;
}

// ════════════════════════════════════════════════════════════════
// UTILIDADES DE TEXTO
// ════════════════════════════════════════════════════════════════
function textoEsBasura(texto) {
    if (!texto || texto.trim().length < 15) return true;
    const simbolosExtranos = (texto.match(/[^\w\s\xE1\xE9\xED\xF3\xFA\xF1\$\,\.\:]/g) || []).length;
    return (simbolosExtranos / texto.length) > 0.3;
}

// Busca un monto monetario dado un conjunto de etiquetas clave
function buscarMonto(texto, etiquetas) {
    for (const etiqueta of etiquetas) {
        const clave = etiqueta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const patrones = [
            new RegExp(clave + '[\\s:]*\\$?\\s*([\\d,]+)[\\s]+([\\d]{2})(?![\\d])', 'i'),
            new RegExp(clave + '[\\s:]*\\$?\\s*([\\d,]+)\\.([\\d]{2})', 'i'),
            new RegExp(clave + '[^\\d]*([\\d,]+)[\\s\\.]+([\\d]{2})(?![\\d])', 'i')
        ];

        for (const patron of patrones) {
            const coincidencia = texto.match(patron);
            if (coincidencia) {
                const valor = parseFloat(
                    coincidencia[1].replace(/,/g, '') + '.' + (coincidencia[2] || '00')
                );
                if (!isNaN(valor) && valor >= 0 && valor < 100000) return valor;
            }
        }
    }
    return 0;
}

// Corrige errores comunes del OCR en valores numericos
function corregirOCR(cadena) {
    const tabla = {
        O: '0', o: '0', I: '1', l: '1', i: '1',
        Z: '2', z: '2', E: '8', e: '8', A: '4',
        a: '4', S: '3', s: '5', G: '6', T: '7',
        B: '8', g: '9', L: '8', j: '6', J: '1',
        m: '1', M: '1'
    };
    return cadena.split('').map(c => tabla[c] || c).join('');
}

// ════════════════════════════════════════════════════════════════
// EXTRACCION Y RENDER DE DATOS
// ════════════════════════════════════════════════════════════════
function extraerYMostrar(texto) {

    // Delimitar texto de pagina 1
    const inicioPag2 = texto.indexOf('--- PAGINA 2 ---');
    const textoPag1  = inicioPag2 > 0 ? texto.substring(0, inicioPag2) : texto.substring(0, 3000);

    // ── Total a pagar ─────────────────────────────────────────
    let montoTotal = 0;
    const patronesTotal = [
        /TOTAL\s+A\s*PAGAR[\s:]*\$?\s*(\d+)\s+(\d{2})/i,
        /\$\s*(\d+)\.(\d{2})/,
        /\$\s*(\d{2,4})(?!\d)/
    ];
    for (const p of patronesTotal) {
        const m = textoPag1.match(p);
        if (m) {
            montoTotal = parseFloat((m[1] || '0').replace(/,/g, '') + '.' + (m[2] || '00'));
            if (montoTotal > 0) break;
        }
    }

    // ── Desglose de cargos ────────────────────────────────────
    let montoEnergia = buscarMonto(texto, ['Energia', 'ENERGIA', 'Suministro']);
    let montoIVA     = buscarMonto(texto, ['IVA 16%', 'IVA 16', 'IVA']);
    const montoDap   = buscarMonto(texto, ['DAP', 'Alumbrado']);
    const montoAdeudo= buscarMonto(texto, ['Adeudo Anterior', 'Saldo Anterior']);
    const montoPago  = buscarMonto(texto, ['Su Pago', 'SU PAGO', 'Pago Anterior']);

    // Calcular si no se encontro desglose directo
    if (!(montoEnergia > 0 && montoIVA > 0) && montoTotal > 0) {
        const cargo = Math.max(montoTotal - montoAdeudo + Math.abs(montoPago) - montoDap, montoTotal);
        montoEnergia = cargo / 1.16;
        montoIVA     = cargo - montoEnergia;
    }

    const facturaPeriodo = (montoEnergia + montoIVA).toFixed(2);
    const totalMostrar   = montoTotal > 0 ? montoTotal.toFixed(2) : facturaPeriodo;

    // ── Numero de servicio ────────────────────────────────────
    const matchServicio = texto.match(/(?:NO\.?\s*DE?\s*SERVICIO|No\.?\s*Servicio)[\s:]*(\d[\s]?\d{11})/i)
                       || texto.match(/(\d{12})/);
    const numServicio = matchServicio ? matchServicio[1].replace(/\s/g, '') : 'No detectado';

    // ── Nombre del titular ────────────────────────────────────
    let nombreTitular = 'No detectado';
    const patronesNombre = [
        /TOTAL\s+A\s*PAGAR[^\n]*\n([A-Z\xC1\xC9\xCD\xD3\xDA\xD1\s]{10,50})/i,
        /([A-Z\xC1\xC9\xCD\xD3\xDA\xD1]{4,}\s+[A-Z\xC1\xC9\xCD\xD3\xDA\xD1]{4,}\s+[A-Z\xC1\xC9\xCD\xD3\xDA\xD1]{4,})/
    ];
    for (const p of patronesNombre) {
        const m = texto.match(p);
        if (m) {
            const candidato = m[1].trim();
            if (candidato.length > 5 && !candidato.includes('CFE') && !/^\d+$/.test(candidato)) {
                nombreTitular = candidato;
                break;
            }
        }
    }

    // ── Periodo de facturacion ────────────────────────────────
    let periodoTexto = 'No detectado';
    const patronesPeriodo = [
        /PERIODO\s+FACTURADO[\s:]*(\d{2})\s+([A-Z]{3})\s+(\d{2})\s*[-]\s*(\d{2})\s+([A-Z]{3})\s*(\d{2})/i,
        /(\d{2})\s+([A-Z]{3})\s+(\d{2})\s*[-]\s*(\d{2})\s+([A-Z]{3})\s*(\d{2})/i,
        /del\s+(\d{2})\s+([A-Z]{3})\s+(\d{2})\s+al\s+(\d{2})\s+([A-Z]{3})\s*(\d{2})/i
    ];
    for (const p of patronesPeriodo) {
        const m = textoPag1.match(p);
        if (m) {
            periodoTexto = 'del ' + m[1] + ' ' + m[2] + ' ' + m[3]
                         + ' al ' + m[4] + ' ' + m[5] + ' ' + m[6];
            break;
        }
    }

    // ── Consumo en kWh ────────────────────────────────────────
    let consumoKwh = '0';
    const patronesKwh = [
        /Total\s+periodo[\s:]+([a-zA-Z]?\d+)/i,
        /CONSUMO[\s:]+([a-zA-Z]?\d+)\s*kWh/i,
        /(\d+)\s+kWh/i
    ];
    for (const p of patronesKwh) {
        const m = (textoPag1 + texto).match(p);
        if (m) {
            const v = parseInt(m[1].replace(/[a-zA-Z]/g, ''));
            if (v > 0 && v < 10000) { consumoKwh = String(v); break; }
        }
    }
    // fallback buscando en historial
    if (consumoKwh === '0') {
        const mHist = texto.match(
            /del\s+\d{2}\s+[A-Z]{3}\s+\d{2}\s+al\s+\d{2}\s+[A-Z]{3}\s*\d{2}\s+([a-zA-Z]?\d+)\s+\$/i
        );
        if (mHist) {
            const v = parseInt(mHist[1].replace(/[a-zA-Z]/g, ''));
            if (v > 0) consumoKwh = String(v);
        }
    }

    // ── Fecha limite de pago ──────────────────────────────────
    let fechaLimite = 'No detectado';
    const mLimite = texto.match(/L[I\xCD]MITE\s+DE\s+PAGO[\s:]*(\d{2})\s+([A-Z]{3})\s+(\d{2})/i)
                 || texto.match(/LIMITE\s+DE\s+PAGO[\s:]*(\d{2})\s+([A-Z]{3})\s+(\d{2})/i);
    if (mLimite) {
        const meses = {
            ENE:'01',FEB:'02',MAR:'03',ABR:'04',MAY:'05',JUN:'06',
            JUL:'07',AGO:'08',SEP:'09',OCT:'10',NOV:'11',DIC:'12'
        };
        fechaLimite = mLimite[1] + '/' + (meses[mLimite[2].toUpperCase()] || '01') + '/20' + mLimite[3];
    }

    // ── Calculo de media diaria ───────────────────────────────
    let diasEnPeriodo = 60; // bimestral por defecto
    const mFechas = periodoTexto.match(
        /del\s+(\d{2})\s+([A-Z]{3})\s+(\d{2})\s+al\s+(\d{2})\s+([A-Z]{3})\s+(\d{2})/i
    );
    if (mFechas) {
        const meses = {
            ENE:0,FEB:1,MAR:2,ABR:3,MAY:4,JUN:5,
            JUL:6,AGO:7,SEP:8,OCT:9,NOV:10,DIC:11
        };
        const fechaInicio = new Date(2000 + parseInt(mFechas[3]), meses[mFechas[2].toUpperCase()], parseInt(mFechas[1]));
        const fechaFin    = new Date(2000 + parseInt(mFechas[6]), meses[mFechas[5].toUpperCase()], parseInt(mFechas[4]));
        const diferencia  = Math.ceil(Math.abs(fechaFin - fechaInicio) / 86400000);
        if (diferencia > 0 && diferencia < 100) diasEnPeriodo = diferencia;
    }
    const kwhNumero = parseInt(consumoKwh) || 0;
    const mediaDia  = kwhNumero > 0 ? (kwhNumero / diasEnPeriodo).toFixed(2) : '0.00';

    let nivelTarifa = 'Domestica';
    if (kwhNumero > 500)      nivelTarifa = 'Alto Consumo (DAC)';
    else if (kwhNumero > 250) nivelTarifa = 'Domestica Alta';
    else if (kwhNumero > 0)   nivelTarifa = 'Domestica Basica';

    // ── Historial bimestral ───────────────────────────────────
    const regexHistorial = /del\s+(\d{2})\s+([A-Z0-9]{3})\s*(\d{2})\s+al\s+(\d{2})\s+([A-Z0-9]{3})\s*(\d{2})\s+([a-zA-Z]+\d*|\d+)\s+[s$](\d+)\.(\d{2})/gi;
    const registros = [], etiquetasGraf = [], datosGraf = [];
    const yaAgregados = new Set();
    let coincidencia;

    while ((coincidencia = regexHistorial.exec(texto)) !== null) {
        const clave = coincidencia[1] + coincidencia[2] + coincidencia[3];
        if (yaAgregados.has(clave)) continue;

        const rawConsumo = coincidencia[7];
        const corregido  = corregirOCR(rawConsumo);
        let numero = parseInt(corregido.replace(/\D/g, ''));

        // Heuristica para corregir valores anomalos del OCR
        if (numero > 0 && numero < 20) {
            if (numero < 10) numero = parseInt('8' + numero);
            else if (numero === 14) numero = 114;
            else numero = parseInt('8' + String(numero).slice(1));
        }

        if (numero > 0 && numero < 1000) {
            yaAgregados.add(clave);
            const etiqueta = coincidencia[1] + ' ' + coincidencia[2] + "'" + coincidencia[3]
                           + ' - ' + coincidencia[4] + ' ' + coincidencia[5] + "'" + coincidencia[6];
            registros.push({ etiqueta, kwh: numero, monto: coincidencia[8] + '.' + coincidencia[9] });
            etiquetasGraf.push(coincidencia[2] + "'" + coincidencia[3]);
            datosGraf.push(numero);
        }
    }

    // ── Volcar datos al DOM ───────────────────────────────────
    _set('r-titular',       nombreTitular);
    _set('r-servicio',      numServicio);
    _set('r-limite',        fechaLimite);
    _set('r-kwh',           consumoKwh);
    _set('r-periodo',       periodoTexto);
    _set('r-total',         '$' + totalMostrar);
    _set('r-energia',       montoEnergia.toFixed(2));
    _set('r-iva',           montoIVA.toFixed(2));
    _set('r-facperiodo',    facturaPeriodo);
    _set('r-dap',           montoDap.toFixed(2));
    _set('r-adeudo',        montoAdeudo.toFixed(2));
    _set('r-pago',          '-' + Math.abs(montoPago).toFixed(2));
    _set('r-media',         mediaDia + ' kWh/dia');
    _set('r-clasificacion', nivelTarifa);

    // Historial
    if (registros.length) {
        document.getElementById('r-historial').innerHTML = registros.map(r =>
            '<div class="hist-row">' +
            '<span class="text-slate-600">' + r.etiqueta + '</span>' +
            '<span class="font-bold text-indigo-600">' + r.kwh + ' kWh</span>' +
            '<span class="font-black text-slate-800">$' + r.monto + '</span>' +
            '</div>'
        ).join('');
    }

    // Grafica de historial
    if (etiquetasGraf.length) {
        const ctx = document.getElementById('cfeChart');
        if (LectorCFE.graficaCFE) LectorCFE.graficaCFE.destroy();
        LectorCFE.graficaCFE = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: etiquetasGraf,
                datasets: [{
                    label: 'Energia (kWh)',
                    data: datosGraf,
                    backgroundColor: '#6366f1',
                    borderRadius: 8,
                    barThickness: 28
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: { usePointStyle: true, font: { size: 11, weight: 'bold' } }
                    },
                    tooltip: {
                        backgroundColor: '#1e293b',
                        padding: 10,
                        callbacks: { label: c => c.raw + ' kWh' }
                    }
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 }, callback: v => v + ' kWh' } },
                    x: { grid: { display: false }, ticks: { font: { size: 10, weight: 'bold' } } }
                }
            }
        });
    }

    LectorCFE.kwhActual = kwhNumero || null;
}

// Shorthand para asignar textContent
function _set(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
}

// ════════════════════════════════════════════════════════════════
// DATOS DE DEMO
// ════════════════════════════════════════════════════════════════
function cargarDemo() {
    _set('r-titular',       'VALDEZ MORA JULIA');
    _set('r-servicio',      '202100300330');
    _set('r-limite',        '23/01/2026');
    _set('r-kwh',           '150');
    _set('r-periodo',       'del 07 NOV 25 al 08 ENE 26');
    _set('r-total',         '$272.00');
    _set('r-energia',       '233.87');
    _set('r-iva',           '37.42');
    _set('r-facperiodo',    '271.29');
    _set('r-dap',           '0.00');
    _set('r-adeudo',        '270.71');
    _set('r-pago',          '-270.00');
    _set('r-media',         '2.42 kWh/dia');
    _set('r-clasificacion', 'Domestica Basica');

    const demo = [
        { etiqueta:"07 NOV'24 - 08 ENE'25", kwh:277, monto:'420.00' },
        { etiqueta:"06 SEP'24 - 07 NOV'24", kwh:274, monto:'412.00' },
        { etiqueta:"09 JUL'24 - 06 SEP'24", kwh:235, monto:'352.00' },
        { etiqueta:"08 MAY'24 - 09 JUL'24", kwh:228, monto:'340.00' },
        { etiqueta:"07 MAR'24 - 08 MAY'24", kwh:226, monto:'335.00' },
        { etiqueta:"08 ENE'24 - 07 MAR'24", kwh:140, monto:'212.00' }
    ];

    document.getElementById('r-historial').innerHTML = demo.map(r =>
        '<div class="hist-row">' +
        '<span class="text-slate-600">' + r.etiqueta + '</span>' +
        '<span class="font-bold text-indigo-600">' + r.kwh + ' kWh</span>' +
        '<span class="font-black text-slate-800">$' + r.monto + '</span>' +
        '</div>'
    ).join('');

    document.getElementById('textoCrudo').textContent =
        'Le invitamos a que se registre en nuestro portal.\n' +
        'TAMBIEN PUEDES PAGAR TU RECIBO EN mas de 100,000 establecimientos autorizados.';

    const ctx = document.getElementById('cfeChart');
    if (LectorCFE.graficaCFE) LectorCFE.graficaCFE.destroy();
    LectorCFE.graficaCFE = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: demo.map(r => r.etiqueta.split('-')[0].trim()),
            datasets: [{
                label: 'Energia (kWh)',
                data: demo.map(r => r.kwh),
                backgroundColor: '#6366f1',
                borderRadius: 8,
                barThickness: 28
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'bottom' },
                tooltip: { backgroundColor: '#1e293b', callbacks: { label: c => c.raw + ' kWh' } }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
                x: { grid: { display: false } }
            }
        }
    });

    LectorCFE.kwhActual = 150;
    mostrarPaso('resultado');
}

// ════════════════════════════════════════════════════════════════
// HELPERS DE UI
// ════════════════════════════════════════════════════════════════
function mostrarPaso(paso) {
    ['subida', 'cargando', 'resultado', 'error'].forEach(id =>
        document.getElementById('paso-' + id).classList.toggle('hidden', id !== paso)
    );
}

function actualizarProgreso(porcentaje, mensaje) {
    if (mensaje)
        document.getElementById('msgCarga').textContent = mensaje;
    if (porcentaje !== null) {
        document.getElementById('barraProgreso').style.width = porcentaje + '%';
        document.getElementById('textoPorcentaje').textContent = porcentaje + '%';
    }
}

function reiniciarModal() {
    LectorCFE.archivos = [];
    actualizarZona();
    mostrarPaso('subida');
    if (LectorCFE.graficaCFE) { LectorCFE.graficaCFE.destroy(); LectorCFE.graficaCFE = null; }
}

function cambiarTab(tab, boton) {
    ['resumen', 'historial', 'grafica', 'crudo'].forEach(t =>
        document.getElementById('tab-' + t).classList.toggle('hidden', t !== tab)
    );
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    boton.classList.add('active');
}

// ════════════════════════════════════════════════════════════════
// COMPARATIVA
// ════════════════════════════════════════════════════════════════
function agregarFila(nombre = '', kwh = '') {
    LectorCFE.contadorPersonas++;
    const id = LectorCFE.contadorPersonas;
    const contenedor = document.getElementById('people-container');
    const fila = document.createElement('div');
    fila.id = 'fila-' + id;
    fila.className = 'flex items-center gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-100';
    fila.innerHTML =
        '<div class="flex-1"><input type="text" placeholder="Nombre" value="' + nombre + '" ' +
        'class="w-full bg-transparent border-none focus:ring-0 text-sm font-bold text-slate-700 placeholder:text-slate-300" data-type="name"></div>' +
        '<div class="w-24 relative"><input type="number" placeholder="kWh" value="' + kwh + '" ' +
        'class="w-full bg-white border border-slate-200 rounded-lg py-1 px-2 text-sm font-black text-indigo-600 outline-none" data-type="kwh">' +
        '<span class="absolute right-2 top-1.5 text-[8px] font-bold text-slate-400">kWh</span></div>' +
        '<button onclick="document.getElementById(\'fila-' + id + '\').remove()" ' +
        'style="background:none;border:none;cursor:pointer;padding:8px;" class="text-slate-300 hover:text-red-500 transition-colors">' +
        '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg></button>';
    contenedor.appendChild(fila);
}

function mostrarInputsComparativa() {
    document.getElementById('comp-input').classList.remove('hidden');
    document.getElementById('comp-results').classList.add('hidden');
}

function procesarComparativa() {
    const nombres = Array.from(document.querySelectorAll('[data-type="name"]')).map(i => i.value || 'Anonimo');
    const valores = Array.from(document.querySelectorAll('[data-type="kwh"]')).map(i => parseFloat(i.value) || 0);
    if (!nombres.length) return;

    const promedio  = valores.reduce((a, b) => a + b, 0) / valores.length;
    const maximo    = Math.max(...valores);
    const idxMaximo = valores.indexOf(maximo);

    document.getElementById('comp-max-name').textContent = nombres[idxMaximo];
    document.getElementById('comp-max-kwh').textContent  = maximo + ' kWh';
    document.getElementById('comp-avg').textContent      = promedio.toFixed(1) + ' kWh';

    document.getElementById('comp-input').classList.add('hidden');
    document.getElementById('comp-results').classList.remove('hidden');

    const ctx = document.getElementById('compChart');
    if (LectorCFE.graficaComp) LectorCFE.graficaComp.destroy();

    LectorCFE.graficaComp = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: nombres,
            datasets: [
                {
                    label: 'Consumo (kWh)',
                    data: valores,
                    backgroundColor: valores.map(v => v === maximo ? '#ef4444' : '#6366f1'),
                    borderRadius: 12,
                    barThickness: 30
                },
                {
                    label: 'Promedio',
                    data: Array(nombres.length).fill(promedio),
                    type: 'line',
                    borderColor: '#94a3b8',
                    borderDash: [5, 5],
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: { usePointStyle: true, font: { size: 10, weight: 'bold' } }
                },
                tooltip: {
                    backgroundColor: '#1e293b',
                    padding: 12,
                    callbacks: { label: c => 'Consumo: ' + c.raw + ' kWh' }
                }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 } } },
                x: { grid: { display: false }, ticks: { font: { size: 11, weight: 'bold' } } }
            }
        }
    });
}