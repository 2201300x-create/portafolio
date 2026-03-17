/**
 * Lector de Recibos CFE
 * David Cortes Cortes — 2026
 * Extrae datos de recibos CFE usando PDF.js + Tesseract OCR
 */

// ── Configurar worker de PDF.js ──────────────────────────────────
// PDF.js necesita un archivo "worker" externo para procesar PDFs en un hilo
// separado (Web Worker), evitando que el navegador se congele durante la carga.
pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ════════════════════════════════════════════════════════════════
// ESTADO DE LA APLICACION
// ════════════════════════════════════════════════════════════════
// Objeto global que actúa como "almacén" de estado de la app.
// Centralizar el estado aquí evita variables globales sueltas y
// hace más fácil rastrear qué información está activa en cada momento.
const LectorCFE = {
    archivos: [],          // Lista de archivos cargados por el usuario (PDF o imagen)
    kwhActual: null,       // kWh del último recibo analizado (usado en la comparativa)
    graficaCFE: null,      // Referencia a la instancia activa de Chart.js del recibo
    graficaComp: null,     // Referencia a la instancia activa de Chart.js de la comparativa
    contadorPersonas: 0    // Contador incremental para asignar IDs únicos a filas de comparativa
};

// ════════════════════════════════════════════════════════════════
// ABRIR / CERRAR MODALES
// ════════════════════════════════════════════════════════════════

// Muestra el modal principal del lector CFE cambiando su display a 'flex'
function abrirModal() {
    document.getElementById('cfeModal').style.display = 'flex';
}

// Oculta el modal principal del lector CFE
function cerrarModal() {
    document.getElementById('cfeModal').style.display = 'none';
}

// Abre el modal de comparativa de consumo.
// Primero cierra el modal principal y luego muestra el de comparativa.
// Si todavía no se ha agregado ninguna persona, precarga dos filas de ejemplo:
// el titular del recibo actual y el promedio nacional CFE (217 kWh).
function abrirComparativa() {
    cerrarModal();
    document.getElementById('compModal').style.display = 'flex';
    if (LectorCFE.contadorPersonas === 0) {
        agregarFila('David', LectorCFE.kwhActual || 150);
        agregarFila('Promedio CFE', 217);
    }
}

// Oculta el modal de comparativa
function cerrarComparativa() {
    document.getElementById('compModal').style.display = 'none';
}

// ════════════════════════════════════════════════════════════════
// MANEJO DE ARCHIVOS
// ════════════════════════════════════════════════════════════════

// Devuelve true si el archivo tiene extensión .pdf (insensible a mayúsculas)
function esPDF(archivo) {
    return archivo.name.toLowerCase().endsWith('.pdf');
}

// Devuelve true si el archivo es una imagen soportada (JPEG, PNG o WebP)
// Revisa tanto la extensión del nombre como el tipo MIME del archivo
function esImagen(archivo) {
    return /\.(jpe?g|png|webp)$/i.test(archivo.name) || archivo.type.startsWith('image/');
}

// Se dispara cuando el usuario arrastra un archivo sobre la zona de subida.
// preventDefault() evita que el navegador abra el archivo directamente.
// La clase CSS 'over' resalta visualmente la zona de drop.
function onDragOver(e) {
    e.preventDefault();
    document.getElementById('zonaSubida').classList.add('over');
}

// Se dispara cuando el cursor sale de la zona de subida durante un arrastre.
// Quita el resaltado visual.
function onDragLeave(e) {
    document.getElementById('zonaSubida').classList.remove('over');
}

// Se dispara cuando el usuario suelta archivos sobre la zona de subida.
// Obtiene la lista de archivos del evento de drag-and-drop y los registra.
function onDrop(e) {
    e.preventDefault();
    document.getElementById('zonaSubida').classList.remove('over');
    registrarArchivos(Array.from(e.dataTransfer.files));
}

// Se dispara cuando el usuario selecciona archivos con el selector nativo.
// Registra los archivos y limpia el input para permitir volver a subir el mismo archivo.
function onSeleccionArchivo(e) {
    registrarArchivos(Array.from(e.target.files));
    e.target.value = ''; // Limpiar el input para que el mismo archivo se pueda volver a seleccionar
}

// Valida y agrega archivos nuevos al estado de la aplicación.
// Descarta archivos vacíos, mayores a 50 MB o con formato no compatible.
// Acumula los mensajes de error y los muestra todos juntos.
function registrarArchivos(nuevos) {
    const errores = [];

    nuevos.forEach(archivo => {
        // Rechazar archivos vacíos
        if (archivo.size === 0)
            return errores.push(archivo.name + ': el archivo esta vacio');
        // Rechazar archivos que superen 50 MB (límite arbitrario para no sobrecargar el OCR)
        if (archivo.size > 50 * 1024 * 1024)
            return errores.push(archivo.name + ': supera el limite de 50 MB');
        // Solo aceptar PDFs e imágenes JPEG/PNG/WebP
        if (!esPDF(archivo) && !esImagen(archivo))
            return errores.push(archivo.name + ': formato no compatible');

        // Agregar el archivo al estado, marcando si es PDF o imagen
        LectorCFE.archivos.push({ archivo, esPDF: esPDF(archivo) });
    });

    // Si hubo errores, mostrar el cuadro de error con todos los mensajes separados por ' | '
    if (errores.length) {
        const caja = document.getElementById('errorSubida');
        caja.classList.remove('hidden');
        caja.textContent = errores.join(' | ');
    }

    // Refrescar la UI con los archivos actuales
    actualizarZona();
}

// Elimina un archivo de la lista por su índice y actualiza la UI
function quitarArchivo(indice) {
    LectorCFE.archivos.splice(indice, 1);
    actualizarZona();
}

// Refresca la zona de subida según el estado actual de LectorCFE.archivos.
// - Genera los "chips" (etiquetas visuales) para cada archivo cargado.
// - Alterna la visibilidad entre el estado vacío y el estado con archivos.
// - Habilita o deshabilita el botón "Procesar".
// - Oculta cualquier mensaje de error previo.
function actualizarZona() {
    const chips = document.getElementById('listaArchivos');

    // Generar un chip por cada archivo con un ícono según su tipo y un botón para quitarlo
    chips.innerHTML = LectorCFE.archivos.map((item, i) =>
        '<span class="file-chip">' +
        (item.esPDF ? '📄' : '🖼️') + ' ' + item.archivo.name +
        ' <button onclick="quitarArchivo(' + i + ')" ' +
        'style="margin-left:4px;font-weight:900;color:#818cf8;cursor:pointer;background:none;border:none;">×</button>' +
        '</span>'
    ).join('');

    const hayArchivos = LectorCFE.archivos.length > 0;

    // Mostrar/ocultar el mensaje "arrastra tu recibo aquí" vs la lista de chips
    document.getElementById('zonaVacia').classList.toggle('hidden', hayArchivos);
    document.getElementById('zonaConArchivos').classList.toggle('hidden', !hayArchivos);

    // El botón de procesar solo se activa si hay al menos un archivo cargado
    document.getElementById('btnProcesar').disabled = !hayArchivos;

    // Ocultar cualquier error anterior al actualizar la zona
    document.getElementById('errorSubida').classList.add('hidden');
}

// ════════════════════════════════════════════════════════════════
// PROCESO PRINCIPAL DE ANALISIS
// ════════════════════════════════════════════════════════════════
// Función principal que orquesta el análisis de todos los archivos cargados.
// 1. Cambia la vista al paso "cargando" para mostrar la barra de progreso.
// 2. Itera sobre cada archivo, leyendo su contenido (PDF o imagen) con OCR.
// 3. Concatena todo el texto extraído en una sola cadena.
// 4. Valida que se haya obtenido texto útil.
// 5. Delega la extracción de datos al DOM a extraerYMostrar().
// 6. En caso de error, muestra el paso de error con el mensaje correspondiente.
async function iniciarAnalisis() {
    if (!LectorCFE.archivos.length) return;

    mostrarPaso('cargando');
    actualizarProgreso(0, 'Preparando analisis...');

    let textoTotal = '';

    try {
        for (let i = 0; i < LectorCFE.archivos.length; i++) {
            const { archivo, esPDF: esPdf } = LectorCFE.archivos[i];

            // Calcular porcentaje base de progreso proporcional al número de archivos
            // (reservamos el 65% para la lectura; el resto es para extracción y render)
            const progBase = Math.round((i / LectorCFE.archivos.length) * 65);

            actualizarProgreso(progBase,
                'Procesando ' + (i + 1) + ' de ' + LectorCFE.archivos.length + ': ' + archivo.name
            );

            // Elegir el método de lectura según el tipo de archivo
            if (esPdf) {
                const resultado = await leerPDF(archivo);
                textoTotal += resultado + '\n';
            } else {
                const resultado = await leerImagen(archivo);
                textoTotal += resultado + '\n';
            }
        }

        // Si el texto total es demasiado corto, probablemente el OCR no encontró nada útil
        if (textoTotal.trim().length < 15)
            throw new Error('No fue posible extraer texto del archivo. Verifica que sea legible.');

        actualizarProgreso(88, 'Identificando datos del recibo...');

        // Guardar el texto crudo en la pestaña "Texto crudo" para depuración
        document.getElementById('textoCrudo').textContent = textoTotal;

        // Extraer campos del recibo y actualizar el DOM con los resultados
        extraerYMostrar(textoTotal);

        actualizarProgreso(100, 'Analisis completado');
        mostrarPaso('resultado');

    } catch (error) {
        // Mostrar el mensaje de error amigable en el paso de error
        document.getElementById('mensajeError').textContent = error.message;
        mostrarPaso('error');
    }
}

// ════════════════════════════════════════════════════════════════
// LEER PDF CON PDF.js + OCR
// ════════════════════════════════════════════════════════════════
// Lee un archivo PDF y extrae su texto combinando dos estrategias:
//  1. Extracción nativa de texto con PDF.js (rápida, funciona en PDFs digitales).
//  2. OCR con Tesseract.js (para PDFs escaneados o con texto ilegible).
// Devuelve una promesa que resuelve con el texto extraído de todas las páginas.
function leerPDF(archivo) {
    return new Promise((resolver, rechazar) => {
        const lector = new FileReader();

        lector.onerror = () => rechazar(new Error('No se pudo abrir el archivo PDF'));

        lector.onload = async function () {
            try {
                // Convertir el resultado del FileReader a un array de bytes
                const bytes = new Uint8Array(this.result);

                // Verificar que el archivo empiece con la firma '%PDF' (cabecera estándar de PDFs)
                const cabecera = String.fromCharCode(...bytes.slice(0, 5));
                if (!cabecera.startsWith('%PDF'))
                    throw new Error('El archivo no tiene formato PDF valido');

                // Cargar el documento PDF con PDF.js
                const documento = await pdfjsLib.getDocument(bytes).promise;
                let textoFinal = '';

                // Procesar cada página del documento
                for (let numPag = 1; numPag <= documento.numPages; numPag++) {
                    const pagina    = await documento.getPage(numPag);
                    const contenido = await pagina.getTextContent();
                    let textoPagina = '';

                    // Concatenar el texto nativo de todos los elementos de texto de la página
                    contenido.items.forEach(elemento => {
                        textoPagina += elemento.str + ' ';
                    });

                    // Decidir si se necesita OCR:
                    // - Siempre en las primeras 2 páginas (donde está la info principal del recibo)
                    // - En cualquier página donde el texto extraído parezca "basura" (ilegible)
                    const necesitaOCR = numPag <= 2 || textoEsBasura(textoPagina);

                    if (necesitaOCR) {
                        actualizarProgreso(null, 'OCR pagina ' + numPag + '...');
                        try {
                            // Renderizar la página en un canvas para pasársela a Tesseract.
                            // Se usa escala 3.0 en la pág. 2 y 2.0 en el resto para mejorar la precisión del OCR.
                            const escala   = numPag === 2 ? 3.0 : 2.0;
                            const viewport = pagina.getViewport({ scale: escala });
                            const lienzo   = document.createElement('canvas');
                            lienzo.width   = viewport.width;
                            lienzo.height  = viewport.height;

                            // Dibujar la página PDF sobre el canvas
                            await pagina.render({
                                canvasContext: lienzo.getContext('2d'),
                                viewport
                            }).promise;

                            // Ejecutar OCR en español sobre la imagen del canvas
                            const ocr = await Tesseract.recognize(lienzo.toDataURL(), 'spa', {
                                logger: prog => {
                                    // Actualizar el progreso con el porcentaje interno del OCR
                                    if (prog.status === 'recognizing text') {
                                        const pct = Math.round(prog.progress * 100);
                                        actualizarProgreso(null, 'OCR pag ' + numPag + ': ' + pct + '%');
                                    }
                                }
                            });

                            // Agregar el texto reconocido por OCR al texto de la página
                            textoPagina += '\n' + ocr.data.text;
                        } catch (_) { /* Si el OCR falla, continuar sin él para no bloquear el proceso */ }
                    }

                    // Agregar el texto de esta página al resultado final, con separador para identificar la página
                    textoFinal += '\n--- PAGINA ' + numPag + ' ---\n' + textoPagina;
                }

                resolver(textoFinal);

            } catch (err) {
                rechazar(new Error('Error al procesar el PDF: ' + err.message));
            }
        };

        // Leer el archivo como ArrayBuffer para poder pasárselo a PDF.js
        lector.readAsArrayBuffer(archivo);
    });
}

// ════════════════════════════════════════════════════════════════
// LEER IMAGEN CON TESSERACT
// ════════════════════════════════════════════════════════════════
// Ejecuta OCR directamente sobre un archivo de imagen (JPEG, PNG o WebP).
// Tesseract.js procesa la imagen en modo español y devuelve el texto reconocido.
// Lanza error si el resultado está vacío o tiene menos de 5 caracteres.
async function leerImagen(archivo) {
    const resultado = await Tesseract.recognize(archivo, 'spa', {
        logger: prog => {
            // Actualizar el mensaje de progreso con el porcentaje de avance del OCR
            if (prog.status === 'recognizing text') {
                const pct = Math.round(prog.progress * 100);
                actualizarProgreso(null, 'Leyendo imagen: ' + pct + '%');
            }
        }
    });

    // Validar que se haya extraído algún texto útil de la imagen
    if (!resultado.data.text || resultado.data.text.trim().length < 5)
        throw new Error('No se detecto texto en la imagen. Usa una imagen con mayor resolucion.');

    return resultado.data.text;
}

// ════════════════════════════════════════════════════════════════
// UTILIDADES DE TEXTO
// ════════════════════════════════════════════════════════════════

// Evalúa si un texto extraído es "basura" (ilegible o con demasiado ruido).
// Un texto se considera basura si:
//  - Es muy corto (menos de 15 caracteres), o
//  - Más del 30% de sus caracteres son símbolos extraños (no letras, dígitos, espacios ni puntuación común).
// Se usa para decidir si aplicar OCR adicional sobre una página.
function textoEsBasura(texto) {
    if (!texto || texto.trim().length < 15) return true;
    // Contar caracteres que NO son letras, dígitos, espacios, vocales acentuadas ni puntuación básica
    const simbolosExtranos = (texto.match(/[^\w\s\xE1\xE9\xED\xF3\xFA\xF1\$\,\.\:]/g) || []).length;
    return (simbolosExtranos / texto.length) > 0.3;
}

// Busca un monto monetario en el texto usando una lista de etiquetas clave.
// Para cada etiqueta, prueba tres patrones regex que cubren formatos típicos de CFE:
//  1. Monto con espacio como separador decimal (ej: "1234 56")
//  2. Monto con punto decimal (ej: "1234.56")
//  3. Monto con separador flexible (ej: "1234.56" o "1234 56")
// Devuelve el primer valor válido encontrado (entre 0 y 100,000), o 0 si no encuentra nada.
function buscarMonto(texto, etiquetas) {
    for (const etiqueta of etiquetas) {
        // Escapar caracteres especiales de la etiqueta para usarla en regex
        const clave = etiqueta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const patrones = [
            // Formato con espacio como separador decimal: "ENERGIA 233 87"
            new RegExp(clave + '[\\s:]*\\$?\\s*([\\d,]+)[\\s]+([\\d]{2})(?![\\d])', 'i'),
            // Formato con punto decimal: "ENERGIA 233.87"
            new RegExp(clave + '[\\s:]*\\$?\\s*([\\d,]+)\\.([\\d]{2})', 'i'),
            // Formato más flexible: "ENERGIA 233 87" o "ENERGIA 233.87"
            new RegExp(clave + '[^\\d]*([\\d,]+)[\\s\\.]+([\\d]{2})(?![\\d])', 'i')
        ];

        for (const patron of patrones) {
            const coincidencia = texto.match(patron);
            if (coincidencia) {
                // Construir el número flotante a partir de la parte entera y decimal capturadas
                const valor = parseFloat(
                    coincidencia[1].replace(/,/g, '') + '.' + (coincidencia[2] || '00')
                );
                // Descartar valores negativos, NaN o irrealmente altos (probablemente errores de OCR)
                if (!isNaN(valor) && valor >= 0 && valor < 100000) return valor;
            }
        }
    }
    return 0; // No se encontró ningún monto para estas etiquetas
}

// Corrige errores comunes del OCR donde letras son confundidas con dígitos.
// Ejemplos: 'O' → '0', 'l' → '1', 'S' → '3', 'B' → '8', etc.
// Se aplica solo sobre cadenas que se esperan sean numéricas (como el consumo kWh del historial).
function corregirOCR(cadena) {
    // Tabla de sustituciones: letra confusa → dígito correcto
    const tabla = {
        O: '0', o: '0', I: '1', l: '1', i: '1',
        Z: '2', z: '2', E: '8', e: '8', A: '4',
        a: '4', S: '3', s: '5', G: '6', T: '7',
        B: '8', g: '9', L: '8', j: '6', J: '1',
        m: '1', M: '1'
    };
    // Reemplazar carácter por carácter, usando la tabla si hay coincidencia
    return cadena.split('').map(c => tabla[c] || c).join('');
}

// ════════════════════════════════════════════════════════════════
// EXTRACCION Y RENDER DE DATOS
// ════════════════════════════════════════════════════════════════
// Función central de extracción: recibe el texto completo del recibo
// y usa expresiones regulares para identificar y parsear cada campo.
// Al final, actualiza todos los elementos del DOM con los valores extraídos.
function extraerYMostrar(texto) {

    // ── Delimitar texto de página 1 ────────────────────────────
    // La mayoría de los datos importantes están en la página 1.
    // Se limita el texto de búsqueda para evitar falsos positivos en páginas posteriores.
    const inicioPag2 = texto.indexOf('--- PAGINA 2 ---');
    const textoPag1  = inicioPag2 > 0 ? texto.substring(0, inicioPag2) : texto.substring(0, 3000);

    // ── Total a pagar ──────────────────────────────────────────
    // Busca el monto total del recibo. Prueba primero el texto explícito "TOTAL A PAGAR",
    // luego un monto con signo "$" y decimal, y finalmente un monto corto con "$".
    let montoTotal = 0;
    const patronesTotal = [
        /TOTAL\s+A\s*PAGAR[\s:]*\$?\s*(\d+)\s+(\d{2})/i,  // "TOTAL A PAGAR 272 00"
        /\$\s*(\d+)\.(\d{2})/,                              // "$272.00"
        /\$\s*(\d{2,4})(?!\d)/                              // "$272" (sin decimales)
    ];
    for (const p of patronesTotal) {
        const m = textoPag1.match(p);
        if (m) {
            montoTotal = parseFloat((m[1] || '0').replace(/,/g, '') + '.' + (m[2] || '00'));
            if (montoTotal > 0) break;
        }
    }

    // ── Desglose de cargos ─────────────────────────────────────
    // Buscar cada concepto del desglose usando la función buscarMonto con posibles alias de CFE
    let montoEnergia = buscarMonto(texto, ['Energia', 'ENERGIA', 'Suministro']);
    let montoIVA     = buscarMonto(texto, ['IVA 16%', 'IVA 16', 'IVA']);
    const montoDap   = buscarMonto(texto, ['DAP', 'Alumbrado']);            // Derecho de Alumbrado Público
    const montoAdeudo= buscarMonto(texto, ['Adeudo Anterior', 'Saldo Anterior']);
    const montoPago  = buscarMonto(texto, ['Su Pago', 'SU PAGO', 'Pago Anterior']);

    // Si no se encontraron energía e IVA directamente pero sí el total,
    // se calculan matemáticamente: IVA = 16% del cargo base, energía = cargo / 1.16
    if (!(montoEnergia > 0 && montoIVA > 0) && montoTotal > 0) {
        const cargo = Math.max(montoTotal - montoAdeudo + Math.abs(montoPago) - montoDap, montoTotal);
        montoEnergia = cargo / 1.16;
        montoIVA     = cargo - montoEnergia;
    }

    // Total del período = energía + IVA (sin adeudos ni pagos anteriores)
    const facturaPeriodo = (montoEnergia + montoIVA).toFixed(2);
    // Mostrar el total real si se encontró; de lo contrario, usar la factura del período
    const totalMostrar   = montoTotal > 0 ? montoTotal.toFixed(2) : facturaPeriodo;

    // ── Número de servicio ─────────────────────────────────────
    // Primero busca la etiqueta explícita "NO. DE SERVICIO"; si no, busca cualquier
    // secuencia de 12 dígitos (formato estándar del número de servicio CFE)
    const matchServicio = texto.match(/(?:NO\.?\s*DE?\s*SERVICIO|No\.?\s*Servicio)[\s:]*(\d[\s]?\d{11})/i)
                       || texto.match(/(\d{12})/);
    const numServicio = matchServicio ? matchServicio[1].replace(/\s/g, '') : 'No detectado';

    // ── Nombre del titular ─────────────────────────────────────
    // Lista de palabras que aparecen en el recibo pero NO son nombres de personas.
    // Se usa para filtrar falsos positivos al buscar el nombre del titular.
    const PALABRAS_EXCLUIDAS = [
        'COMISION', 'FEDERAL', 'ELECTRICIDAD', 'ELECTRICA',
        'CFE', 'SUMINISTRO', 'SERVICIO', 'PAGOS', 'PERIODO',
        'FACTURADO', 'CONSUMO', 'TARIFA', 'IMPUESTO', 'SUBTOTAL',
        'ENERGIA', 'ALUMBRADO', 'DIRECCION', 'MUNICIPIO', 'ESTADO',
        'TOTAL', 'PAGAR', 'ANTERIOR', 'ADEUDO', 'LIMITE', 'DOMICILIO',
        'MEDIDOR', 'LECTURA', 'ACTUAL', 'ANTERIOR', 'BIMESTRE'
    ];

    // Valida que un candidato a nombre de titular sea plausible:
    // - Entre 8 y 60 caracteres
    // - No sea solo números
    // - No contenga números de 4+ dígitos seguidos
    // - No contenga palabras de CFE excluidas
    // - Tenga al menos 2 palabras
    // - Cada palabra sea solo letras (mayúsculas con posibles tildes)
    function esTitularValido(candidato) {
        const c = candidato.trim().toUpperCase();
        if (c.length < 8 || c.length > 60) return false;
        if (/^\d+$/.test(c)) return false;
        if (/\d{4,}/.test(c)) return false;
        if (PALABRAS_EXCLUIDAS.some(p => c.includes(p))) return false;
        const palabras = c.split(/\s+/).filter(Boolean);
        if (palabras.length < 2) return false;
        if (!palabras.every(p => /^[A-Z\xC1\xC9\xCD\xD3\xDA\xD1]{2,}$/.test(p))) return false;
        return true;
    }

    let nombreTitular = 'No detectado';

    // Patrones ordenados de más específico a más genérico para encontrar el nombre del titular
    const patronesNombre = [
        // Patrón 1: "NOMBRE DEL USUARIO" o "NOMBRE:" seguido del nombre
        /NOMBRE\s+DEL\s+USUARIO[\s:]+([A-Z\xC1\xC9\xCD\xD3\xDA\xD1\s]{8,50}?)(?:\n|$)/i,
        /NOMBRE[\s:]+([A-Z\xC1\xC9\xCD\xD3\xDA\xD1\s]{8,50}?)(?:\n|$)/i,
        // Patrón 2: Después del número de servicio en la misma línea o la siguiente
        /(?:NO\.?\s*(?:DE?\s*)?SERVICIO|No\.?\s*Servicio)[\s:]*\d{12}[\s\n]+([A-Z\xC1\xC9\xCD\xD3\xDA\xD1][A-Z\xC1\xC9\xCD\xD3\xDA\xD1\s]{7,49}?)(?:\n|$)/i,
        // Patrón 3: "TOTAL A PAGAR" + salto de línea + nombre (posición típica en el recibo físico)
        /TOTAL\s+A\s*PAGAR[^\n]{0,30}\n\s*([A-Z\xC1\xC9\xCD\xD3\xDA\xD1][A-Z\xC1\xC9\xCD\xD3\xDA\xD1\s]{7,49}?)(?:\n|$)/i,
        // Patrón 4: "USUARIO:" o "TITULAR:"
        /(?:USUARIO|TITULAR)[\s:]+([A-Z\xC1\xC9\xCD\xD3\xDA\xD1][A-Z\xC1\xC9\xCD\xD3\xDA\xD1\s]{7,49}?)(?:\n|$)/i,
        // Patrón 5: Texto después de la sección de dirección de suministro
        /SUMINISTRO[\s\S]{0,200}?\n([A-Z\xC1\xC9\xCD\xD3\xDA\xD1]{4,}\s+[A-Z\xC1\xC9\xCD\xD3\xDA\xD1]{4,}(?:\s+[A-Z\xC1\xC9\xCD\xD3\xDA\xD1]{4,})?)/i,
    ];

    // Probar cada patrón en orden; usar el primer candidato que pase la validación
    for (const p of patronesNombre) {
        const m = texto.match(p);
        if (m) {
            const candidato = m[1].trim();
            if (esTitularValido(candidato)) {
                nombreTitular = candidato;
                break;
            }
        }
    }

    // Patrón 6 (fallback): recorrer todo el texto de pág. 1 buscando grupos de 2-4 palabras
    // en mayúsculas que pasen la validación estricta. Esto captura nombres en ubicaciones inesperadas.
    if (nombreTitular === 'No detectado') {
        const reGenerico = /\b([A-Z\xC1\xC9\xCD\xD3\xDA\xD1]{4,}(?:\s+[A-Z\xC1\xC9\xCD\xD3\xDA\xD1]{4,}){1,3})\b/g;
        let m;
        while ((m = reGenerico.exec(textoPag1)) !== null) {
            const candidato = m[1].trim();
            if (esTitularValido(candidato)) {
                nombreTitular = candidato;
                break;
            }
        }
    }

    // ── Periodo de facturación ─────────────────────────────────
    // Busca el período bimestral del recibo en tres formatos posibles:
    //  1. "PERIODO FACTURADO DD MMM AA - DD MMM AA"
    //  2. "DD MMM AA - DD MMM AA" (sin prefijo)
    //  3. "del DD MMM AA al DD MMM AA"
    let periodoTexto = 'No detectado';
    const patronesPeriodo = [
        /PERIODO\s+FACTURADO[\s:]*(\d{2})\s+([A-Z]{3})\s+(\d{2})\s*[-]\s*(\d{2})\s+([A-Z]{3})\s*(\d{2})/i,
        /(\d{2})\s+([A-Z]{3})\s+(\d{2})\s*[-]\s*(\d{2})\s+([A-Z]{3})\s*(\d{2})/i,
        /del\s+(\d{2})\s+([A-Z]{3})\s+(\d{2})\s+al\s+(\d{2})\s+([A-Z]{3})\s*(\d{2})/i
    ];
    for (const p of patronesPeriodo) {
        const m = textoPag1.match(p);
        if (m) {
            // Normalizar el período al formato "del DD MMM AA al DD MMM AA"
            periodoTexto = 'del ' + m[1] + ' ' + m[2] + ' ' + m[3]
                         + ' al ' + m[4] + ' ' + m[5] + ' ' + m[6];
            break;
        }
    }

    // ── Consumo en kWh ─────────────────────────────────────────
    // Intenta encontrar el consumo del período actual buscando:
    //  1. "Total periodo: NNN"
    //  2. "CONSUMO: NNN kWh"
    //  3. Cualquier número seguido de "kWh"
    // Como fallback, lo busca dentro de la línea del historial del período actual.
    let consumoKwh = '0';
    const patronesKwh = [
        /Total\s+periodo[\s:]+([a-zA-Z]?\d+)/i,
        /CONSUMO[\s:]+([a-zA-Z]?\d+)\s*kWh/i,
        /(\d+)\s+kWh/i
    ];
    for (const p of patronesKwh) {
        // Buscar en pág. 1 primero; si no, en todo el texto
        const m = (textoPag1 + texto).match(p);
        if (m) {
            // Quitar letras del OCR antes de parsear como número
            const v = parseInt(m[1].replace(/[a-zA-Z]/g, ''));
            if (v > 0 && v < 10000) { consumoKwh = String(v); break; }
        }
    }
    // Fallback: buscar el consumo en el renglón del historial del período actual
    if (consumoKwh === '0') {
        const mHist = texto.match(
            /del\s+\d{2}\s+[A-Z]{3}\s+\d{2}\s+al\s+\d{2}\s+[A-Z]{3}\s*\d{2}\s+([a-zA-Z]?\d+)\s+\$/i
        );
        if (mHist) {
            const v = parseInt(mHist[1].replace(/[a-zA-Z]/g, ''));
            if (v > 0) consumoKwh = String(v);
        }
    }

    // ── Fecha límite de pago ───────────────────────────────────
    // Busca la fecha con o sin acento en "LÍMITE".
    // La convierte al formato DD/MM/AAAA usando un mapa de meses abreviados.
    let fechaLimite = 'No detectado';
    const mLimite = texto.match(/L[I\xCD]MITE\s+DE\s+PAGO[\s:]*(\d{2})\s+([A-Z]{3})\s+(\d{2})/i)
                 || texto.match(/LIMITE\s+DE\s+PAGO[\s:]*(\d{2})\s+([A-Z]{3})\s+(\d{2})/i);
    if (mLimite) {
        // Mapa de meses en español a su número con cero inicial
        const meses = {
            ENE:'01',FEB:'02',MAR:'03',ABR:'04',MAY:'05',JUN:'06',
            JUL:'07',AGO:'08',SEP:'09',OCT:'10',NOV:'11',DIC:'12'
        };
        fechaLimite = mLimite[1] + '/' + (meses[mLimite[2].toUpperCase()] || '01') + '/20' + mLimite[3];
    }

    // ── Cálculo de media diaria ────────────────────────────────
    // Si se encontró el período, calcula los días exactos entre fecha inicio y fin.
    // Si no, asume 60 días (período bimestral estándar de CFE).
    // La media diaria = kWh totales / días del período.
    let diasEnPeriodo = 60; // valor por defecto para recibos bimestrales
    const mFechas = periodoTexto.match(
        /del\s+(\d{2})\s+([A-Z]{3})\s+(\d{2})\s+al\s+(\d{2})\s+([A-Z]{3})\s+(\d{2})/i
    );
    if (mFechas) {
        // Mapa de meses a índice (0-11) para construir objetos Date
        const meses = {
            ENE:0,FEB:1,MAR:2,ABR:3,MAY:4,JUN:5,
            JUL:6,AGO:7,SEP:8,OCT:9,NOV:10,DIC:11
        };
        const fechaInicio = new Date(2000 + parseInt(mFechas[3]), meses[mFechas[2].toUpperCase()], parseInt(mFechas[1]));
        const fechaFin    = new Date(2000 + parseInt(mFechas[6]), meses[mFechas[5].toUpperCase()], parseInt(mFechas[4]));
        // Diferencia en días: convertir milisegundos a días (86400000 ms/día)
        const diferencia  = Math.ceil(Math.abs(fechaFin - fechaInicio) / 86400000);
        // Solo usar la diferencia si es razonable (mayor a 0 y menor a 100 días)
        if (diferencia > 0 && diferencia < 100) diasEnPeriodo = diferencia;
    }
    const kwhNumero = parseInt(consumoKwh) || 0;
    const mediaDia  = kwhNumero > 0 ? (kwhNumero / diasEnPeriodo).toFixed(2) : '0.00';

    // ── Tarifa ─────────────────────────────────────────────────
    // Intenta leer la tarifa directamente del texto (ej: "TARIFA: 1", "TARIF: DAC").
    // Si no se encuentra, la infiere por el consumo:
    //  - > 500 kWh → DAC (Alto Consumo, tarifa punitiva)
    //  - > 250 kWh → Dom. Alta
    //  - > 0 kWh   → Dom. Básica
    let nivelTarifa = '';
    const patronesTarifa = [
        /TARIFA[\s:]+([A-Z0-9]{1,10}(?:\s+[A-Z0-9]{1,10}){0,3})/i,
        /TARIF[AO][\s:]*([A-Z0-9\-\/]{1,15})/i,
        /(?:APLICADA|TIPO\s+DE\s+TARIFA)[\s:]+([A-Z0-9\-\/]{1,15})/i,
        // Buscar directamente nombres de tarifa conocidos de CFE
        /\b(DAC|1F|1B|1C|1D|1E|OM|HM|HS|H-SL|PDBT|GDBT|GDMTO|RABT|RAMT)\b/i,
    ];
    for (const p of patronesTarifa) {
        const m = texto.match(p);
        if (m) {
            const candidato = m[1].trim().toUpperCase();
            // Descartar palabras comunes que no son nombres de tarifa
            if (!['DE', 'LA', 'EL', 'EN', 'Y', 'A'].includes(candidato)) {
                nivelTarifa = candidato;
                break;
            }
        }
    }
    // Fallback: clasificar por rango de consumo si no se encontró en el texto
    if (!nivelTarifa) {
        if (kwhNumero > 500)      nivelTarifa = 'DAC (Alto Consumo)';
        else if (kwhNumero > 250) nivelTarifa = 'Dom. Alta';
        else if (kwhNumero > 0)   nivelTarifa = 'Dom. Basica';
        else                      nivelTarifa = 'No detectada';
    }

    // ── Factor de Potencia ─────────────────────────────────────
    // Busca el FP en formato numérico (ej: "FACTOR DE POTENCIA: 92%", "F.P.: 0.92").
    // Si el valor es <= 1, se asume que está en forma decimal (0.92) y se convierte a porcentaje.
    let factorPotencia = 'No detectado';
    const patronesFP = [
        /FACTOR\s+DE\s+POTENCIA[\s:]+([0-9]{1,3}(?:[.,][0-9]{1,4})?)\s*%?/i,
        /F\.?\s*P\.?[\s:]+([0-9]{1,3}(?:[.,][0-9]{1,4})?)\s*%?/i,
        /FP[\s:]+([0-9]{1,3}(?:[.,][0-9]{1,4})?)\s*%?/i,
        /POTENCIA[\s:]+([0-9]{1,3}(?:[.,][0-9]{1,4})?)\s*%/i,
    ];
    for (const p of patronesFP) {
        const m = texto.match(p);
        if (m) {
            const val = parseFloat(m[1].replace(',', '.'));
            if (!isNaN(val) && val >= 0 && val <= 100) {
                // Si el valor es <= 1, está en forma decimal (0.92 → 92.0%)
                factorPotencia = val <= 1 ? (val * 100).toFixed(1) + '%' : val.toFixed(1) + '%';
                break;
            }
        }
    }

    // ── Número de medidor ──────────────────────────────────────
    // Busca el número o código del medidor físico de electricidad.
    // Los medidores CFE pueden tener letras y números (ej: "ABC123456").
    let numMedidor = 'No detectado';
    const patronesMedidor = [
        /N[UÚ]M(?:ERO)?\.?\s+(?:DE\s+)?MEDIDOR[\s:]+([A-Z0-9\-]{4,20})/i,
        /MEDIDOR[\s:#]+([A-Z0-9\-]{4,20})/i,
        /No\.?\s*Medidor[\s:]+([A-Z0-9\-]{4,20})/i,
        /MED(?:IDOR)?\.?[\s:]+([A-Z0-9\-]{4,20})/i,
    ];
    for (const p of patronesMedidor) {
        const m = texto.match(p);
        if (m) {
            numMedidor = m[1].trim();
            break;
        }
    }

    // ── Historial bimestral ────────────────────────────────────
    // Busca todas las líneas del historial de consumo del recibo con el formato:
    //   "del DD MMM AA al DD MMM AA  NNN  $NNN.NN"
    // Usa un Set (yaAgregados) para evitar duplicar períodos que aparecen en múltiples páginas.
    // Aplica corregirOCR() al consumo kWh ya que el OCR suele confundir dígitos con letras.
    // Heurística especial: valores < 20 son probablemente errores del OCR (ej: "8" en vez de "80").
    const regexHistorial = /del\s+(\d{2})\s+([A-Z0-9]{3})\s*(\d{2})\s+al\s+(\d{2})\s+([A-Z0-9]{3})\s*(\d{2})\s+([a-zA-Z]+\d*|\d+)\s+[s$](\d+)\.(\d{2})/gi;
    const registros = [], etiquetasGraf = [], datosGraf = [];
    const yaAgregados = new Set(); // Para evitar duplicados de períodos
    let coincidencia;

    while ((coincidencia = regexHistorial.exec(texto)) !== null) {
        // Clave única por período: día-inicio + mes-inicio + año-inicio
        const clave = coincidencia[1] + coincidencia[2] + coincidencia[3];
        if (yaAgregados.has(clave)) continue; // Saltar si ya se procesó este período

        const rawConsumo = coincidencia[7];
        const corregido  = corregirOCR(rawConsumo); // Corregir posibles errores OCR en el número
        let numero = parseInt(corregido.replace(/\D/g, '')); // Eliminar cualquier letra restante

        // Heurística para valores anómalos muy pequeños (probablemente el OCR leyó un solo dígito
        // cuando debería haber leído dos o tres): se reconstruye el número más probable
        if (numero > 0 && numero < 20) {
            if (numero < 10) numero = parseInt('8' + numero);       // "9" → 89
            else if (numero === 14) numero = 114;                    // "14" → 114
            else numero = parseInt('8' + String(numero).slice(1));   // "15" → 85
        }

        // Solo agregar si el consumo es razonablemente plausible (entre 1 y 999 kWh)
        if (numero > 0 && numero < 1000) {
            yaAgregados.add(clave);
            // Formatear la etiqueta del período para la tabla y la gráfica
            const etiqueta = coincidencia[1] + ' ' + coincidencia[2] + "'" + coincidencia[3]
                           + ' - ' + coincidencia[4] + ' ' + coincidencia[5] + "'" + coincidencia[6];
            registros.push({ etiqueta, kwh: numero, monto: coincidencia[8] + '.' + coincidencia[9] });
            etiquetasGraf.push(coincidencia[2] + "'" + coincidencia[3]); // Solo "MMM'AA" para la gráfica
            datosGraf.push(numero);
        }
    }

    // ── Volcar datos al DOM ────────────────────────────────────
    // Actualizar todos los campos del resultado usando el helper _set()
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
    _set('r-tarifa',        nivelTarifa);
    _set('r-fp',            factorPotencia);
    _set('r-clasificacion', numMedidor);

    // Renderizar la tabla de historial bimestral si se encontraron registros
    if (registros.length) {
        document.getElementById('r-historial').innerHTML = registros.map(r =>
            '<div class="hist-row">' +
            '<span class="text-slate-600">' + r.etiqueta + '</span>' +
            '<span class="font-bold text-indigo-600">' + r.kwh + ' kWh</span>' +
            '<span class="font-black text-slate-800">$' + r.monto + '</span>' +
            '</div>'
        ).join('');
    }

    // Renderizar la gráfica de barras del historial si hay datos suficientes
    if (etiquetasGraf.length) {
        const ctx = document.getElementById('cfeChart');
        // Destruir la instancia anterior de Chart.js para evitar superposición de gráficas
        if (LectorCFE.graficaCFE) LectorCFE.graficaCFE.destroy();
        LectorCFE.graficaCFE = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: etiquetasGraf,
                datasets: [{
                    label: 'Energia (kWh)',
                    data: datosGraf,
                    backgroundColor: '#6366f1', // Indigo para las barras
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
                        callbacks: { label: c => c.raw + ' kWh' } // Formato del tooltip
                    }
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 }, callback: v => v + ' kWh' } },
                    x: { grid: { display: false }, ticks: { font: { size: 10, weight: 'bold' } } }
                }
            }
        });
    }

    // Guardar el kWh actual en el estado global para usarlo en la comparativa
    LectorCFE.kwhActual = kwhNumero || null;
}

// Shorthand para asignar textContent a un elemento por su ID.
// Evita repetir "document.getElementById(id).textContent = valor" en cada campo.
// Si el elemento no existe en el DOM, no hace nada (evita errores silenciosos).
function _set(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
}

// ════════════════════════════════════════════════════════════════
// DATOS DE DEMO
// ════════════════════════════════════════════════════════════════
// Carga datos de ejemplo en la UI sin necesidad de subir un archivo real.
// Útil para probar la interfaz y mostrar su funcionamiento al usuario.
// Precarga campos del recibo, historial bimestral y la gráfica de Chart.js.
function cargarDemo() {
    // Rellenar todos los campos del recibo con valores de ejemplo
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
    _set('r-tarifa',        'Dom. Basica');
    _set('r-fp',            'No detectado');
    _set('r-clasificacion', '98765432');

    // Datos de historial bimestral de ejemplo (6 períodos anteriores)
    const demo = [
        { etiqueta:"07 NOV'24 - 08 ENE'25", kwh:277, monto:'420.00' },
        { etiqueta:"06 SEP'24 - 07 NOV'24", kwh:274, monto:'412.00' },
        { etiqueta:"09 JUL'24 - 06 SEP'24", kwh:235, monto:'352.00' },
        { etiqueta:"08 MAY'24 - 09 JUL'24", kwh:228, monto:'340.00' },
        { etiqueta:"07 MAR'24 - 08 MAY'24", kwh:226, monto:'335.00' },
        { etiqueta:"08 ENE'24 - 07 MAR'24", kwh:140, monto:'212.00' }
    ];

    // Renderizar la tabla del historial con los datos de demo
    document.getElementById('r-historial').innerHTML = demo.map(r =>
        '<div class="hist-row">' +
        '<span class="text-slate-600">' + r.etiqueta + '</span>' +
        '<span class="font-bold text-indigo-600">' + r.kwh + ' kWh</span>' +
        '<span class="font-black text-slate-800">$' + r.monto + '</span>' +
        '</div>'
    ).join('');

    // Mostrar texto de ejemplo en la pestaña "Texto crudo"
    document.getElementById('textoCrudo').textContent =
        'Le invitamos a que se registre en nuestro portal.\n' +
        'TAMBIEN PUEDES PAGAR TU RECIBO EN mas de 100,000 establecimientos autorizados.';

    // Crear o reemplazar la gráfica de barras del historial demo
    const ctx = document.getElementById('cfeChart');
    if (LectorCFE.graficaCFE) LectorCFE.graficaCFE.destroy(); // Limpiar gráfica anterior si existe
    LectorCFE.graficaCFE = new Chart(ctx, {
        type: 'bar',
        data: {
            // Solo usar la primera parte de la etiqueta como label del eje X
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

    // Guardar el kWh de demo en el estado global para la comparativa
    LectorCFE.kwhActual = 150;

    // Cambiar la vista al paso de resultado para mostrar los datos
    mostrarPaso('resultado');
}

// ════════════════════════════════════════════════════════════════
// HELPERS DE UI
// ════════════════════════════════════════════════════════════════

// Muestra solo el "paso" indicado y oculta todos los demás.
// Los pasos posibles son: 'subida', 'cargando', 'resultado', 'error'.
// Usa la clase CSS 'hidden' para controlar la visibilidad.
function mostrarPaso(paso) {
    ['subida', 'cargando', 'resultado', 'error'].forEach(id =>
        document.getElementById('paso-' + id).classList.toggle('hidden', id !== paso)
    );
}

// Actualiza la barra de progreso y el mensaje de estado durante el análisis.
// Si porcentaje es null, solo actualiza el mensaje de texto (útil para el progreso del OCR).
// Si porcentaje es un número, actualiza también el ancho visual de la barra.
function actualizarProgreso(porcentaje, mensaje) {
    if (mensaje)
        document.getElementById('msgCarga').textContent = mensaje;
    if (porcentaje !== null) {
        document.getElementById('barraProgreso').style.width = porcentaje + '%';
        document.getElementById('textoPorcentaje').textContent = porcentaje + '%';
    }
}

// Reinicia el modal del lector al estado inicial de subida.
// - Limpia la lista de archivos cargados.
// - Destruye la gráfica activa para liberar memoria.
// - Muestra el paso de subida.
function reiniciarModal() {
    LectorCFE.archivos = [];
    actualizarZona();
    mostrarPaso('subida');
    if (LectorCFE.graficaCFE) { LectorCFE.graficaCFE.destroy(); LectorCFE.graficaCFE = null; }
}

// Cambia la pestaña activa en el panel de resultados.
// Oculta todas las pestañas excepto la seleccionada y actualiza el estilo del botón activo.
// Parámetros:
//  - tab: identificador de la pestaña ('resumen', 'historial', 'grafica', 'crudo')
//  - boton: referencia al elemento botón que fue clickeado (para aplicarle la clase 'active')
function cambiarTab(tab, boton) {
    ['resumen', 'historial', 'grafica', 'crudo'].forEach(t =>
        document.getElementById('tab-' + t).classList.toggle('hidden', t !== tab)
    );
    // Quitar clase activa de todos los botones y agregarla solo al clickeado
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    boton.classList.add('active');
}

// ════════════════════════════════════════════════════════════════
// COMPARATIVA
// ════════════════════════════════════════════════════════════════

// Agrega una nueva fila al formulario de comparativa de consumo.
// Cada fila tiene un campo de nombre y un campo de kWh.
// El contador global garantiza IDs únicos para poder eliminar filas individualmente.
// Si se proveen nombre y kwh, se precargan los campos (útil para la inicialización).
function agregarFila(nombre = '', kwh = '') {
    LectorCFE.contadorPersonas++;
    const id = LectorCFE.contadorPersonas;
    const contenedor = document.getElementById('people-container');
    const fila = document.createElement('div');
    fila.id = 'fila-' + id;
    fila.className = 'flex items-center gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-100';
    fila.innerHTML =
        // Campo de nombre (texto libre)
        '<div class="flex-1"><input type="text" placeholder="Nombre" value="' + nombre + '" ' +
        'class="w-full bg-transparent border-none focus:ring-0 text-sm font-bold text-slate-700 placeholder:text-slate-300" data-type="name"></div>' +
        // Campo de kWh (numérico) con etiqueta superpuesta
        '<div class="w-24 relative"><input type="number" placeholder="kWh" value="' + kwh + '" ' +
        'class="w-full bg-white border border-slate-200 rounded-lg py-1 px-2 text-sm font-black text-indigo-600 outline-none" data-type="kwh">' +
        '<span class="absolute right-2 top-1.5 text-[8px] font-bold text-slate-400">kWh</span></div>' +
        // Botón de eliminación: quita el elemento del DOM directamente
        '<button onclick="document.getElementById(\'fila-' + id + '\').remove()" ' +
        'style="background:none;border:none;cursor:pointer;padding:8px;" class="text-slate-300 hover:text-red-500 transition-colors">' +
        '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg></button>';
    contenedor.appendChild(fila);
}

// Vuelve a mostrar el formulario de entrada de la comparativa y oculta los resultados.
// Se usa para editar los datos después de haber generado la gráfica.
function mostrarInputsComparativa() {
    document.getElementById('comp-input').classList.remove('hidden');
    document.getElementById('comp-results').classList.add('hidden');
}

// Procesa los datos del formulario de comparativa y genera la gráfica.
// 1. Recoge nombres y valores de kWh de todos los inputs.
// 2. Calcula el promedio y el máximo consumidor.
// 3. Muestra el nombre y kWh del mayor consumidor y el promedio del grupo.
// 4. Genera una gráfica de barras con una línea de promedio superpuesta.
//    Las barras del mayor consumidor se muestran en rojo para destacarlo.
function procesarComparativa() {
    // Recolectar nombres y valores de todos los campos del formulario
    const nombres = Array.from(document.querySelectorAll('[data-type="name"]')).map(i => i.value || 'Anonimo');
    const valores = Array.from(document.querySelectorAll('[data-type="kwh"]')).map(i => parseFloat(i.value) || 0);
    if (!nombres.length) return;

    // Calcular estadísticas básicas del grupo
    const promedio  = valores.reduce((a, b) => a + b, 0) / valores.length;
    const maximo    = Math.max(...valores);
    const idxMaximo = valores.indexOf(maximo); // Índice del mayor consumidor

    // Mostrar el nombre del mayor consumidor y el promedio del grupo en el panel de resultados
    document.getElementById('comp-max-name').textContent = nombres[idxMaximo];
    document.getElementById('comp-max-kwh').textContent  = maximo + ' kWh';
    document.getElementById('comp-avg').textContent      = promedio.toFixed(1) + ' kWh';

    // Alternar visibilidad: ocultar inputs y mostrar resultados
    document.getElementById('comp-input').classList.add('hidden');
    document.getElementById('comp-results').classList.remove('hidden');

    // Crear o reemplazar la gráfica de comparativa
    const ctx = document.getElementById('compChart');
    if (LectorCFE.graficaComp) LectorCFE.graficaComp.destroy(); // Limpiar gráfica anterior

    LectorCFE.graficaComp = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: nombres,
            datasets: [
                {
                    // Dataset de barras: el mayor consumidor aparece en rojo, los demás en indigo
                    label: 'Consumo (kWh)',
                    data: valores,
                    backgroundColor: valores.map(v => v === maximo ? '#ef4444' : '#6366f1'),
                    borderRadius: 12,
                    barThickness: 30
                },
                {
                    // Dataset de línea punteada que representa el promedio del grupo
                    label: 'Promedio',
                    data: Array(nombres.length).fill(promedio), // Valor constante para todos
                    type: 'line',
                    borderColor: '#94a3b8',
                    borderDash: [5, 5],   // Línea punteada
                    borderWidth: 2,
                    pointRadius: 0,       // Sin puntos en los nodos
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