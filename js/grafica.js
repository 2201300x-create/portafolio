// grafica.js — Ajuste con Líneas Rectas (paso a paso como el notebook)

function abrirGrafica() {
    if (document.getElementById('modal-ajuste')) return;
  
    const modal = document.createElement('div');
    modal.id = 'modal-ajuste';
    modal.style.cssText = `
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.75);
      display: flex; align-items: center; justify-content: center;
      z-index: 9999; padding: 1rem;
      font-family: 'Segoe UI', sans-serif;
    `;
  
    modal.innerHTML = `
      <div style="
        background: #fff;
        color: #cdd6f4;
        border-radius: 14px;
        width: 100%;
        max-width: 720px;
        max-height: 92vh;
        overflow-y: auto;
        padding: 2rem;
        position: relative;
        box-shadow: 0 25px 60px rgba(0,0,0,0.6);
      ">
        <!-- Cerrar -->
        <button onclick="cerrarModalAjuste()" style="
          position: absolute; top: 1rem; right: 1rem;
          background: #fff; border: none; color: #94a3b8;
          font-size: 1.0rem; width: 22px; height: 22px;
          border-radius: 50%; cursor: pointer; line-height: 1;
        ">✕</button>
  
        <!-- Título -->
        <h2 style="margin: 0 0 0.3rem; font-size: 1.4rem; color: #000;">
          📈 Ajuste con Líneas Rectas
        </h2>
        <p style="margin: 0 0 1.5rem; color: #6c7086; font-size: 0.85rem;">
          Mínimos cuadrados via pseudoinversa de Moore-Penrose
        </p>
  
        <!-- Inputs -->
        <div style="display:flex; gap:1rem; flex-wrap:wrap; margin-bottom:1rem;">
          <div style="flex:1; min-width:200px;">
            <label style="font-size:.85rem; color:#a6adc8;">Valores de X (separados por comas)</label>
            <input id="ajuste-x" type="text" placeholder="ej. 1,2,3,4,5,6,7"
              value="1,2,3,4,5,6,7"
              style="width:100%; box-sizing:border-box; padding:.55rem .75rem; margin-top:.35rem;
                     border-radius:8px; border: 1px solid #bbf7d0; background: #fff;
                     color:#000; font-size:.95rem; outline:none;">
          </div>
          <div style="flex:1; min-width:200px;">
            <label style="font-size:.85rem; color:#a6adc8;">Valores de Y (separados por comas)</label>
            <input id="ajuste-y" type="text" placeholder="ej. 2.95,4.28,9.32"
              value="2.9523,4.2850,9.3200,9.6186,13.9355,15.2155,17.5937"
              style="width:100%; box-sizing:border-box; padding:.55rem .75rem; margin-top:.35rem;
                     border-radius:8px; border: 1px solid #bbf7d0; background: #fff;
                     color:#000; font-size:.95rem; outline:none;">
          </div>
        </div>
  
        <button onclick="ejecutarAjuste()" style="
          background: var(--primary-color); color: #fff;
          padding: .6rem 1.6rem; border: none;
          border-radius: 8px; font-size: 1rem;
          font-weight: 700; cursor: pointer;
          transition: opacity .2s;
          margin-bottom: 1.5rem;
        " onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">
          ▶ Calcular paso a paso
        </button>
  
        <!-- Pasos (se llenan dinámicamente) -->
        <div id="ajuste-pasos"></div>
      </div>
    `;
  
    document.body.appendChild(modal);
  }
  
  function cerrarModalAjuste() {
    const m = document.getElementById('modal-ajuste');
    if (m) m.remove();
  }
  
  // ─── Utilidades de álgebra matricial ───────────────────────────────────────
  
  function matMul(A, B) {
    const rows = A.length, cols = B[0].length, inner = B.length;
    return Array.from({ length: rows }, (_, i) =>
      Array.from({ length: cols }, (_, j) =>
        A[i].reduce((s, _, k) => s + A[i][k] * B[k][j], 0)
      )
    );
  }
  
  function matTranspose(A) {
    return A[0].map((_, j) => A.map(row => row[j]));
  }
  
  // Inversa de matriz 2x2
  function inv2x2(M) {
    const det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
    return [
      [ M[1][1] / det, -M[0][1] / det],
      [-M[1][0] / det,  M[0][0] / det]
    ];
  }
  
  function fmt(n) {
    return Number(n).toFixed(4);
  }
  
  // ─── Render de tabla ───────────────────────────────────────────────────────
  
  function renderTabla(headers, rows, caption = '') {
    const thStyle = `padding:.45rem .8rem; background:rgb(43, 43, 43); color: #fff;
                     font-weight:600; font-size:.82rem; text-align:center; border:1px solid #45475a;`;
    const tdStyle = `padding:.4rem .8rem; text-align:center; font-size:.82rem;
                     border:1px solid #313244; color:#fff;`;
    const trEven  = `background:rgb(112, 112, 112);`;
    const trOdd   = `background:rgb(175, 175, 175);`;
  
    const ths = headers.map(h => `<th style="${thStyle}">${h}</th>`).join('');
    const trs = rows.map((row, ri) =>
      `<tr style="${ri % 2 === 0 ? trOdd : trEven}">
         ${row.map(c => `<td style="${tdStyle}">${c}</td>`).join('')}
       </tr>`
    ).join('');
  
    return `
      <div style="overflow-x:auto; margin:.6rem 0;">
        ${caption ? `<p style="font-size:.78rem; color:#6c7086; margin:.2rem 0;">${caption}</p>` : ''}
        <table style="border-collapse:collapse; width:100%; min-width:200px;">
          <thead><tr>${ths}</tr></thead>
          <tbody>${trs}</tbody>
        </table>
      </div>`;
  }
  
  // ─── Render de un "paso" estilo celda de notebook ──────────────────────────
  
  function paso(numero, titulo, contenidoHTML) {
    return `
      <div style="
        border: 1px solid #313244;
        border-radius: 10px;
        margin-bottom: 1.2rem;
        overflow: hidden;
      ">
        <div style="
          background: #fff;
          padding: .6rem 1rem;
          display: flex; align-items: center; gap: .6rem;
          border-bottom: 1px solid #313244;
        ">
          <span style="
            background: var(--primary-color);; color: #fff;
            font-size: .72rem; font-weight: 700;
            padding: .15rem .5rem; border-radius: 4px;
          ">In [${numero}]</span>
          <span style="font-size: .88rem; color: #1e1e2e;">${titulo}</span>
        </div>
        <div style="padding: .8rem 1rem; background: #fff;">
          ${contenidoHTML}
        </div>
      </div>`;
  }
  
  // ─── Gráfica en canvas ────────────────────────────────────────────────────
  
  function dibujarGrafica(canvasId, xVals, yVals, m, b, conLinea) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const pad = { top: 30, right: 20, bottom: 45, left: 50 };
    const pw = W - pad.left - pad.right;
    const ph = H - pad.top - pad.bottom;
  
    const yLine = xVals.map(x => m * x + b);
    const allY  = conLinea ? [...yVals, ...yLine] : yVals;
    const minX  = Math.min(...xVals), maxX = Math.max(...xVals);
    const minY  = Math.min(...allY),  maxY = Math.max(...allY);
    const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
  
    const cx = x => pad.left + ((x - minX) / rangeX) * pw;
    const cy = y => pad.top  + ph - ((y - minY) / rangeY) * ph;
  
    ctx.clearRect(0, 0, W, H);
  
    // Fondo
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
  
    // Grid
    ctx.strokeStyle = '#313244';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const gx = pad.left + (pw / 5) * i;
      const gy = pad.top  + (ph / 5) * i;
      ctx.beginPath(); ctx.moveTo(gx, pad.top); ctx.lineTo(gx, pad.top + ph); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad.left, gy); ctx.lineTo(pad.left + pw, gy); ctx.stroke();
    }
  
    // Ejes
    ctx.strokeStyle = '#585b70'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pad.left, pad.top); ctx.lineTo(pad.left, pad.top + ph); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad.left, pad.top + ph); ctx.lineTo(pad.left + pw, pad.top + ph); ctx.stroke();
  
    // Labels ejes
    ctx.fillStyle = '#6c7086'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
    for (let i = 0; i <= 4; i++) {
      const xv = minX + (rangeX / 4) * i;
      ctx.fillText(fmt(xv), cx(xv), pad.top + ph + 18);
    }
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const yv = minY + (rangeY / 4) * i;
      ctx.fillText(fmt(yv), pad.left - 6, cy(yv) + 4);
    }
  
    // Línea de regresión
    if (conLinea) {
      ctx.strokeStyle = '#f38ba8'; ctx.lineWidth = 2.5;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(cx(minX), cy(m * minX + b));
      ctx.lineTo(cx(maxX), cy(m * maxX + b));
      ctx.stroke();
    }
  
    // Puntos
    xVals.forEach((x, i) => {
      ctx.fillStyle = '#89b4fa';
      ctx.beginPath();
      ctx.arc(cx(x), cy(yVals[i]), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#cba6f7'; ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  
    // Leyenda
    ctx.textAlign = 'left'; ctx.font = '11px monospace';
    ctx.fillStyle = '#89b4fa';
    ctx.fillRect(pad.left + 10, pad.top + 8, 10, 10);
    ctx.fillStyle = '#a6adc8';
    ctx.fillText('Puntos de datos', pad.left + 26, pad.top + 17);
    if (conLinea) {
      ctx.fillStyle = '#f38ba8';
      ctx.fillRect(pad.left + 10, pad.top + 24, 20, 3);
      ctx.fillStyle = '#a6adc8';
      ctx.fillText(`y = ${fmt(m)}x + ${fmt(b)}`, pad.left + 36, pad.top + 29);
    }
  }
  
  // ─── Ejecutar todos los pasos ─────────────────────────────────────────────
  
  function ejecutarAjuste() {
    const container = document.getElementById('ajuste-pasos');
    container.innerHTML = '';
  
    // Leer inputs
    const xVals = document.getElementById('ajuste-x').value.split(',').map(Number).filter(n => !isNaN(n));
    const yVals = document.getElementById('ajuste-y').value.split(',').map(Number).filter(n => !isNaN(n));
    const n = xVals.length;
  
    if (n < 2 || n !== yVals.length) {
      container.innerHTML = `<p style="color:#f38ba8;">⚠️ Ingresa al menos 2 puntos y la misma cantidad de X e Y.</p>`;
      return;
    }
  
    let html = '';
  
    // ── Paso 1: Tabla de valores ingresados ──────────────────────────────────
    const tablaXY = renderTabla(
      ['i', 'x', 'y'],
      xVals.map((x, i) => [i, fmt(x), fmt(yVals[i])])
    );
    html += paso(1, 'Valores ingresados (x, y)',
      `<p style="font-size:.82rem; color:#000; margin:0 0 .5rem;">
         Se ingresan los vectores <strong>x</strong> e <strong>y</strong>.
       </p>
       ${tablaXY}`
    );
  
    // ── Paso 2: Gráfica de dispersión sin línea ──────────────────────────────
    html += paso(2, 'Gráfico de dispersión (sin línea de regresión)',
      `<canvas id="grafica-scatter" width="540" height="280"
         style="border-radius:8px; display:block; max-width:100%;"></canvas>`
    );
  
    // ── Paso 3: Matrices B y M ───────────────────────────────────────────────
    const B = yVals.map(y => [y]);                               // columna
    const M = xVals.map(x => [x, 1]);                            // [x, 1]
  
    const tablaB = renderTabla(['i', 'B (y)'],  B.map((row, i) => [i, fmt(row[0])]), 'Matriz B:');
    const tablaM = renderTabla(['i', 'col 0 (x)', 'col 1 (1)'],
      M.map((row, i) => [i, fmt(row[0]), fmt(row[1])]), 'Matriz M:');
  
    html += paso(3, 'Matrices B y M',
      `<p style="font-size:.82rem; color:#000; margin:0 0 .5rem;">
         Se construye <strong>B</strong> (vector columna de y) y 
         <strong>M</strong> (matriz con columna de x y columna de unos).
       </p>
       <div style="display:flex; gap:1.5rem; flex-wrap:wrap;">
         <div>${tablaB}</div>
         <div>${tablaM}</div>
       </div>`
    );
  
    // ── Paso 4: Transpuesta M^T ──────────────────────────────────────────────
    const MT = matTranspose(M);
  
    const tablaMT = renderTabla(
      xVals.map((_, i) => `col ${i}`),
      MT.map((row, i) => row.map(fmt)),
      'Matriz Mᵀ:'
    );
  
    html += paso(4, 'Transpuesta Mᵀ',
      `<p style="font-size:.82rem; color:#000; margin:0 0 .5rem;">
         Se calcula la transpuesta de M.
       </p>
       ${tablaMT}`
    );
  
    // ── Paso 5: (M^T M)^-1 ──────────────────────────────────────────────────
    const MTM     = matMul(MT, M);
    const MTM_inv = inv2x2(MTM);
  
    const tablaMTM    = renderTabla(['', 'col 0', 'col 1'],
      MTM.map((row, i) => [`fila ${i}`, fmt(row[0]), fmt(row[1])]), 'MᵀM:');
    const tablaMTMinv = renderTabla(['', 'col 0', 'col 1'],
      MTM_inv.map((row, i) => [`fila ${i}`, fmt(row[0]), fmt(row[1])]), '(MᵀM)⁻¹:');
  
    html += paso(5, '(MᵀM)⁻¹ — Inversa del producto normal',
      `<p style="font-size:.82rem; color:#000; margin:0 0 .5rem;">
         Se calcula <strong>MᵀM</strong> y su inversa <strong>(MᵀM)⁻¹</strong>.
       </p>
       <div style="display:flex; gap:1.5rem; flex-wrap:wrap;">
         <div>${tablaMTM}</div>
         <div>${tablaMTMinv}</div>
       </div>`
    );
  
    // ── Paso 6: M⁺ (pseudoinversa de Moore-Penrose) ──────────────────────────
    const Mplus = matMul(MTM_inv, MT);   // (MᵀM)⁻¹ · Mᵀ  →  2 × n
  
    const tablaMplus = renderTabla(
      ['fila', ...xVals.map((_, i) => `col ${i}`)],
      Mplus.map((row, i) => [`M⁺[${i}]`, ...row.map(fmt)]),
      'M⁺ = (MᵀM)⁻¹ Mᵀ:'
    );
  
    html += paso(6, 'Pseudoinversa de Moore-Penrose M⁺',
      `<p style="font-size:.82rem; color:#000; margin:0 0 .5rem;">
         <strong>M⁺ = (MᵀM)⁻¹ Mᵀ</strong> — también llamada matriz pseudoinversa.
       </p>
       ${tablaMplus}`
    );
  
    // ── Paso 7: X = M⁺ B ────────────────────────────────────────────────────
    const X = matMul(Mplus, B);   // [[m], [b]]
    const slope = X[0][0];
    const intercept = X[1][0];
  
    const tablaX = renderTabla(
      ['Parámetro', 'Valor'],
      [['m (pendiente)', fmt(slope)], ['b (intercepto)', fmt(intercept)]],
      'X = M⁺ · B:'
    );
  
    html += paso(7, 'Solución X = M⁺ · B',
      `<p style="font-size:.82rem; color:#000; margin:0 0 .5rem;">
         Multiplicando la pseudoinversa por B obtenemos los coeficientes de la recta.
       </p>
       ${tablaX}
       <div style="
         background: #313244; border-radius: 8px; padding: .8rem 1.2rem;
         margin-top: .8rem; font-size: 1.05rem; color: #a6e3a1; font-weight: 600;
       ">
         📐 Ecuación: y = ${fmt(slope)}x + ${fmt(intercept)}
       </div>`
    );
  
    // ── Paso 8: Gráfica con línea de regresión ───────────────────────────────
    html += paso(8, 'Gráfico con línea de regresión',
      `<canvas id="grafica-regresion" width="540" height="280"
         style="border-radius:8px; display:block; max-width:100%;"></canvas>`
    );
  
    container.innerHTML = html;
  
    // Dibujar gráficas después de que el DOM se actualice
    setTimeout(() => {
      dibujarGrafica('grafica-scatter',   xVals, yVals, slope, intercept, false);
      dibujarGrafica('grafica-regresion', xVals, yVals, slope, intercept, true);
    }, 30);
  }