/* ====================================================================== */
/*  Resultados académicos                                                 */
/*  Universidad Nacional de Colombia · Sede Medellín                      */
/*                                                                        */
/*  Tres secciones: resultados agregados por asignatura, desagregados por */
/*  grupo e índice crítico. Este archivo se transpila en el navegador con */
/*  Babel standalone y consulta los datos del objeto global window.RAC.   */
/* ====================================================================== */

const { useState, useMemo, useRef, useEffect, useCallback } = React;

const D = window.RAC;
const DEF = D.definiciones;
const N = D.nucleo;
const META = D.meta;

const DIM = N.dimensiones;                  // grupo, planId, estado
const CAT = N.categorias;
const K = {};
DIM.forEach((d, i) => { K[d] = i; });
const COL = {};
N.metricas.forEach((m, i) => { COL[m] = DIM.length + i; });

/* Catálogos alineados con los índices del núcleo. */
const GRUPO = CAT.grupo.map(id => {
  const g = META.gruposCat.find(x => x.id === id);
  return g || { id: id, cod: id, asignatura: id, numero: '', rotulo: id,
    docente: '', uab: '', facultadUab: '', tipologia: '', minimo: 'No',
    ocasional: 'No', matriculas: 0 };
});
const PLAN = CAT.planId.map(cod => {
  const p = META.planesCat.find(x => x.cod === cod);
  return p || { cod: cod, nombre: cod, facultadEst: '', nivel: '' };
});
const ASIG = {};
META.asignaturasCat.forEach(a => { ASIG[a.cod] = a; });

/* Filtros derivados del catálogo de grupos y del de planes. */
const DER_GRUPO = {
  uab: { lista: META.uabs, valor: i => GRUPO[i].uab },
  facultadUab: { lista: META.facultadesUab, valor: i => GRUPO[i].facultadUab },
  nombreAsignatura: { lista: META.asignaturasLista, valor: i => GRUPO[i].asignatura },
  tipologia: { lista: META.tipologias, valor: i => GRUPO[i].tipologia },
  docente: { lista: META.docentesLista, valor: i => GRUPO[i].docente },
  numero: { lista: null, valor: i => GRUPO[i].numero },
  minimo: { lista: ['Sí', 'No'], valor: i => GRUPO[i].minimo },
  ocasional: { lista: ['Sí', 'No'], valor: i => GRUPO[i].ocasional }
};
DER_GRUPO.numero.lista = Array.from(new Set(GRUPO.map(g => g.numero)))
  .sort((a, b) => String(a).localeCompare(String(b), 'es', { numeric: true }));

const DER_PLAN = {
  facultadEst: { lista: META.facultadesEst, valor: i => PLAN[i].facultadEst },
  programa: { lista: META.programas, valor: i => PLAN[i].nombre }
};

/* ------------------------------------------------------------ formatos */
const fEnt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const vacio = v => v === null || v === undefined || (typeof v === 'number' && isNaN(v));
const num = v => (vacio(v) ? '—' : fEnt.format(Math.round(v)));
const pct = (v, n = 2) => (vacio(v) ? '—' : v.toFixed(n).replace('.', ',') + ' %');
const dec = (v, n = 2) => (vacio(v) ? '—' : v.toFixed(n).replace('.', ','));

const cortoDim = d => (DEF.dimensiones[d] || {}).corto || d;
const colorCat = i => DEF.paleta[i % DEF.paleta.length];
const colorDe = (dim, cat, i) => {
  const propios = (DEF.colores || {})[dim];
  return (propios && propios[cat]) || colorCat(i);
};

const clave = t =>
  't-' + String(t).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const totalDe = a => a.reduce((x, y) => x + y, 0);

/* ==================================================================== */
/*  Secciones                                                            */
/* ==================================================================== */

const SECCIONES = [
  { id: 'asignatura', rotulo: 'Resultados por asignatura' },
  { id: 'grupo', rotulo: 'Resultados por grupo' },
  { id: 'critico', rotulo: 'Índice crítico' }
];

/* ==================================================================== */
/*  Motor de consulta                                                    */
/* ==================================================================== */

function crearConsulta(seleccion) {
  const cache = {};

  const admitidos = (catalogo, derivadas, omitir) => {
    const llave = 'c:' + (derivadas === DER_GRUPO ? 'g' : 'p') + ':' + (omitir || '');
    if (cache[llave]) return cache[llave];
    const dims = Object.keys(derivadas).filter(d => d !== omitir);
    const ok = {};
    catalogo.forEach((x, i) => {
      const pasa = dims.every(d => {
        const sel = seleccion[d];
        return !sel || !sel.length || sel.indexOf(derivadas[d].valor(i)) >= 0;
      });
      if (pasa) ok[i] = true;
    });
    cache[llave] = ok;
    return ok;
  };

  const estadosOk = omitir => {
    const sel = omitir === 'estado' ? null : seleccion.estado;
    if (!sel || !sel.length) return null;
    const ok = {};
    sel.forEach(c => {
      const i = CAT.estado.indexOf(c);
      if (i >= 0) ok[i] = true;
    });
    return ok;
  };

  const activas = omitir => {
    const llave = 'a:' + (omitir || '');
    if (cache[llave]) return cache[llave];
    const g = admitidos(GRUPO, DER_GRUPO, omitir);
    const p = admitidos(PLAN, DER_PLAN, omitir);
    const e = estadosOk(omitir);
    const out = [];
    for (let f = 0; f < N.filas.length; f++) {
      const fila = N.filas[f];
      if (!g[fila[0]] || !p[fila[1]]) continue;
      if (e && !e[fila[2]]) continue;
      out.push(f);
    }
    cache[llave] = out;
    return out;
  };

  /** Totales de matrícula, desenlaces y promedio simple. */
  const agregados = () => {
    let n = 0, suma = 0, conNota = 0;
    const estados = CAT.estado.map(() => 0);
    activas().forEach(f => {
      const fila = N.filas[f];
      n += fila[COL.n];
      suma += fila[COL.suma];
      conNota += fila[COL.conNota];
      estados[fila[2]] += fila[COL.n];
    });
    const i = c => CAT.estado.indexOf(c);
    return {
      n, estados,
      aprobacion: n ? 100 * estados[i('Aprobada')] / n : null,
      reprobacion: n ? 100 * estados[i('Reprobada')] / n : null,
      cancelacion: n ? 100 * estados[i('Cancelada')] / n : null,
      promedio: conNota ? suma / conNota : null
    };
  };

  /** Resumen por grupo o por asignatura, según la clave pedida. */
  const resumen = (nivel) => {
    const acc = {};
    activas().forEach(f => {
      const fila = N.filas[f];
      const g = GRUPO[fila[0]];
      const llave = nivel === 'grupo' ? g.id : g.cod;
      if (!acc[llave]) {
        acc[llave] = {
          llave: llave, n: 0, suma: 0, conNota: 0,
          estados: CAT.estado.map(() => 0),
          grupo: nivel === 'grupo' ? g : null,
          cod: g.cod, asignatura: g.asignatura, uab: g.uab,
          facultadUab: g.facultadUab, tipologia: g.tipologia,
          docente: nivel === 'grupo' ? g.docente : null,
          numero: nivel === 'grupo' ? g.numero : null,
          ocasional: nivel === 'grupo' ? g.ocasional : null
        };
      }
      const a = acc[llave];
      a.n += fila[COL.n];
      a.suma += fila[COL.suma];
      a.conNota += fila[COL.conNota];
      a.estados[fila[2]] += fila[COL.n];
    });
    const i = c => CAT.estado.indexOf(c);
    return Object.keys(acc).map(k => {
      const a = acc[k];
      const info = ASIG[a.cod] || {};
      return Object.assign(a, {
        rotulo: a.numero ? a.asignatura + ' · grupo ' + a.numero : a.asignatura,
        promedio: a.conNota ? a.suma / a.conNota : null,
        aprobacion: a.n ? 100 * a.estados[i('Aprobada')] / a.n : null,
        reprobacion: a.n ? 100 * a.estados[i('Reprobada')] / a.n : null,
        cancelacion: a.n ? 100 * a.estados[i('Cancelada')] / a.n : null,
        indiceCritico: info.indiceCritico,
        solicitudCupo: info.solicitudCupo,
        cupo: info.cupo,
        inscritos: info.inscritos
      });
    });
  };

  const opciones = dim => {
    const derivadas = DER_GRUPO[dim] ? DER_GRUPO : (DER_PLAN[dim] ? DER_PLAN : null);
    if (!derivadas) return CAT.estado;
    const catalogo = derivadas === DER_GRUPO ? GRUPO : PLAN;
    const der = derivadas[dim];
    const ok = admitidos(catalogo, derivadas, dim);
    const presentes = {};
    const clavePos = derivadas === DER_GRUPO ? 0 : 1;
    activas(dim).forEach(f => { presentes[N.filas[f][clavePos]] = true; });
    const vistos = {};
    catalogo.forEach((x, i) => {
      if (ok[i] && presentes[i]) vistos[der.valor(i)] = true;
    });
    return der.lista.filter(c => vistos[c]);
  };

  return { activas, agregados, resumen, opciones };
}

/* ==================================================================== */
/*  Piezas de interfaz                                                   */
/* ==================================================================== */

function Tarjeta({ titulo, accion, children }) {
  return (
    <section className="dsh-card">
      <div className="dsh-card-h">
        <h2>{titulo}</h2>
        {accion || null}
      </div>
      <div className="dsh-cuerpo">{children}</div>
    </section>
  );
}

function descargarCsv(nombreArchivo, encabezados, filas) {
  const celda = v => {
    if (vacio(v)) return '';
    if (typeof v === 'number') return String(v).replace('.', ',');
    const t = String(v);
    return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  const texto = [encabezados].concat(filas).map(f => f.map(celda).join(';')).join('\r\n');
  const blob = new Blob(['\ufeff' + texto], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const nombreArchivo = partes =>
  partes.filter(Boolean).map(clave).join('_').replace(/^t-/, '').replace(/_t-/g, '_');

const TIPO_LETRA = 'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

function descargarPng(ec, nombreSalida, titulo) {
  const pr = 3;
  const base = ec.getDataURL({ type: 'png', pixelRatio: pr, backgroundColor: '#fff' });
  const img = new Image();
  img.onload = function () {
    const cabecera = 74 * pr, pie = 34 * pr, margen = 20 * pr;
    const lienzo = document.createElement('canvas');
    lienzo.width = img.width;
    lienzo.height = img.height + cabecera + pie;
    const c = lienzo.getContext('2d');
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, lienzo.width, lienzo.height);
    c.textBaseline = 'middle';
    c.fillStyle = '#242627';
    c.font = '600 ' + 15 * pr + 'px ' + TIPO_LETRA;
    c.fillText(titulo, margen, 30 * pr);
    c.fillStyle = '#677d29';
    c.font = '600 ' + 10 * pr + 'px ' + TIPO_LETRA;
    c.fillText('Universidad Nacional de Colombia · Sede Medellín', margen, 54 * pr);
    c.strokeStyle = '#dcdcdc';
    c.lineWidth = 1 * pr;
    c.beginPath();
    c.moveTo(margen, cabecera - 6 * pr);
    c.lineTo(lienzo.width - margen, cabecera - 6 * pr);
    c.stroke();
    c.drawImage(img, 0, cabecera);
    c.fillStyle = '#a2a3a4';
    c.font = 10 * pr + 'px ' + TIPO_LETRA;
    c.fillText(DEF.nota, margen, img.height + cabecera + pie / 2);
    const a = document.createElement('a');
    a.href = lienzo.toDataURL('image/png');
    a.download = nombreSalida + '.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  img.src = base;
}

function Descargas({ csv, instancia, nombre, titulo, extra }) {
  return (
    <span className="dsh-acc">
      {extra || null}
      {csv ? (
        <button type="button" className="dsh-ico" title="Descargar los datos agregados en CSV"
          aria-label="Descargar los datos agregados en CSV"
          onClick={() => { const d = csv(); if (d) descargarCsv(nombre, d.encabezados, d.filas); }}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3v10.2l3.6-3.6L17 11l-5 5-5-5 1.4-1.4L12 13.2V3h0ZM5 18h14v2H5v-2Z" />
          </svg>
        </button>
      ) : null}
      {instancia ? (
        <button type="button" className="dsh-ico" title="Descargar el gráfico en PNG"
          aria-label="Descargar el gráfico en PNG"
          onClick={() => { const ec = instancia.current; if (ec) descargarPng(ec, nombre, titulo); }}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm1 12h14l-4.5-6-3.5 4.5-2.2-2.7L5 17Zm3.2-6.4a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z" />
          </svg>
        </button>
      ) : null}
    </span>
  );
}

const MARGEN_EJE = 74;
const ALTO_LINEA_LEYENDA = 24;
const HOLGURA_LEYENDA = 10;

let medidor = null;
function anchoTexto(texto, fuente) {
  if (!medidor) {
    const lienzo = document.createElement('canvas');
    medidor = lienzo.getContext ? lienzo.getContext('2d') : null;
  }
  if (!medidor) return String(texto).length * 7;
  medidor.font = fuente;
  return medidor.measureText(String(texto)).width;
}

function ajustarLeyenda(inst, opcion) {
  if (!inst || !opcion || !opcion.rotulosLeyenda || !opcion.rotulosLeyenda.length) return;
  if (typeof inst.getWidth !== 'function') return;
  const disponible = Math.max(200, inst.getWidth() * 0.90 - 32);
  const fuente = '11px ' + TIPO_LETRA;
  const anchos = opcion.rotulosLeyenda.map(n => (11 + 5 + anchoTexto(n, fuente)) * 1.12);
  let lineas = 1;
  let usado = 0;
  anchos.forEach(a => {
    const necesita = usado ? usado + 18 + a : a;
    if (necesita > disponible && usado > 0) { lineas += 1; usado = a; }
    else { usado = necesita; }
  });
  inst.setOption({
    grid: { bottom: MARGEN_EJE + lineas * ALTO_LINEA_LEYENDA + HOLGURA_LEYENDA }
  });
}

function Grafico({ opcion, alto, instancia, alSeleccionar, altoLienzo }) {
  const caja = useRef(null);
  const inst = useRef(null);
  const cb = useRef(alSeleccionar);
  cb.current = alSeleccionar;
  const opcionRef = useRef(opcion);
  opcionRef.current = opcion;

  useEffect(() => {
    if (!window.echarts || !caja.current) return undefined;
    inst.current = window.echarts.init(caja.current, null, { renderer: 'canvas' });
    if (instancia) instancia.current = inst.current;
    inst.current.on('click', p => { if (cb.current) cb.current(p.name, p); });
    const redimensionar = () => {
      if (!inst.current) return;
      inst.current.resize();
      ajustarLeyenda(inst.current, opcionRef.current);
    };
    let obs = null;
    if (window.ResizeObserver) {
      obs = new window.ResizeObserver(redimensionar);
      obs.observe(caja.current);
    }
    window.addEventListener('resize', redimensionar);
    return () => {
      window.removeEventListener('resize', redimensionar);
      if (obs) obs.disconnect();
      if (inst.current) inst.current.dispose();
      inst.current = null;
      if (instancia) instancia.current = null;
    };
  }, []);

  useEffect(() => {
    if (inst.current && opcion) {
      inst.current.setOption(opcion, true);
      ajustarLeyenda(inst.current, opcion);
    }
  }, [opcion]);

  useEffect(() => { if (inst.current) inst.current.resize(); }, [altoLienzo]);

  if (!window.echarts) {
    return <p className="dsh-vacio">Los gráficos no están disponibles en esta sesión.</p>;
  }
  const estilo = { cursor: alSeleccionar ? 'pointer' : 'default' };
  if (altoLienzo) estilo.height = altoLienzo + 'px';
  return (
    <div className="dsh-scroll" style={{ maxHeight: altoLienzo ? 420 : undefined }}>
      <div ref={caja} className={'dsh-grafico ' + (alto || '')} style={estilo} />
    </div>
  );
}

function TarjetaGrafico({ titulo, alto, opcion, csv, archivo, alSeleccionar,
  altoLienzo, extra }) {
  const instancia = useRef(null);
  return (
    <Tarjeta titulo={titulo}
      accion={<Descargas csv={csv} instancia={instancia} nombre={archivo}
        titulo={titulo} extra={extra} />}>
      {opcion
        ? <Grafico opcion={opcion} alto={alto} instancia={instancia}
            alSeleccionar={alSeleccionar} altoLienzo={altoLienzo} />
        : <p className="dsh-vacio">Sin datos para la selección vigente.</p>}
    </Tarjeta>
  );
}

function Segmento({ etiqueta, opciones, valor, onCambio }) {
  return (
    <div className="dsh-segmento compacto" role="group" aria-label={etiqueta}>
      {opciones.map(o => (
        <button key={o.valor} type="button" aria-pressed={valor === o.valor}
          onClick={() => onCambio(o.valor)}>{o.texto}</button>
      ))}
    </div>
  );
}

function Tabla({ columnas, filas, ordenInicial, alSeleccionar, altura }) {
  const [orden, setOrden] = useState(ordenInicial || { col: 0, asc: true });
  const ordenadas = useMemo(() => {
    const c = columnas[orden.col];
    const copia = filas.slice();
    copia.sort((a, b) => {
      const va = c.val(a), vb = c.val(b);
      if (vacio(va)) return 1;
      if (vacio(vb)) return -1;
      const r = typeof va === 'string' ? va.localeCompare(vb, 'es') : va - vb;
      return orden.asc ? r : -r;
    });
    return copia;
  }, [columnas, filas, orden]);

  const clic = i => setOrden(o =>
    (o.col === i ? { col: i, asc: !o.asc } : { col: i, asc: !columnas[i].num }));

  if (!filas.length) {
    return <p className="dsh-vacio">Sin registros para la selección vigente.</p>;
  }
  return (
    <div className="dsh-tabla-wrap" style={{ maxHeight: altura || 430 }}>
      <table className="dsh-tabla">
        <thead>
          <tr>
            {columnas.map((c, i) => (
              <th key={c.tit} className={(c.fija ? 'fija' : '') + (c.num ? ' num' : '')}
                onClick={() => clic(i)}>
                {c.tit}
                {orden.col === i ? <span className="ord"> {orden.asc ? '▲' : '▼'}</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((f, i) => (
            <tr key={i} style={alSeleccionar ? { cursor: 'pointer' } : null}
              onClick={() => alSeleccionar && alSeleccionar(f)}>
              {columnas.map(c => (
                <td key={c.tit} className={(c.fija ? 'fija' : '') + (c.num ? ' num' : '')}>
                  {c.txt(f)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Kpi({ icono, fondo, etiqueta, valor, pie }) {
  return (
    <div className="dsh-kpi">
      <span className="dsh-kpi-ic" style={{ background: fondo }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={icono} /></svg>
      </span>
      <span>
        <span className="dsh-kpi-lab">{etiqueta}</span>
        <span className="dsh-kpi-val">{valor}</span>
        {pie ? <span className="dsh-kpi-pie">{pie}</span> : null}
      </span>
    </div>
  );
}

const IC = {
  visto: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z',
  equis: 'M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4Z',
  circulo: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm-1-5h2v2h-2v-2Zm0-8h2v6h-2V7Z',
  tasa: 'M3.5 18.5 9 13l4 4 7.5-7.5-1.4-1.4L13 14.2l-4-4-6.9 6.9 1.4 1.4Z',
  doc: 'M6 2h9l5 5v15H6V2Zm8 1.5V8h4.5L14 3.5ZM8 12h8v1.6H8V12Zm0 3.4h8V17H8v-1.6Z',
  malla: 'M3 3h8v8H3V3Zm10 0h8v8h-8V3ZM3 13h8v8H3v-8Zm10 0h8v8h-8v-8Z',
  persona: 'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-5 0-9 2.5-9 5.5V22h18v-2.5c0-3-4-5.5-9-5.5Z'
};

/* ==================================================================== */
/*  Opciones de los gráficos                                             */
/* ==================================================================== */

const baseOpcion = () => ({
  textStyle: { fontFamily: TIPO_LETRA, fontSize: 11, color: '#4e5254' },
  animationDuration: 350,
  grid: { left: 66, right: 26, top: 42,
    bottom: MARGEN_EJE + ALTO_LINEA_LEYENDA + HOLGURA_LEYENDA },
  tooltip: {
    trigger: 'axis',
    backgroundColor: '#ffffff', borderColor: '#dcdcdc', borderWidth: 1,
    textStyle: { color: '#242627', fontSize: 11, fontFamily: TIPO_LETRA },
    axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(103,125,41,.06)' } }
  },
  legend: {
    top: null, bottom: 6, left: 'center', width: '94%',
    type: 'plain', orient: 'horizontal', icon: 'roundRect',
    itemWidth: 11, itemHeight: 11, itemGap: 18, padding: [2, 6],
    textStyle: { color: '#4e5254', fontSize: 11 }
  }
});

const ejeValor = (esPct, nombre, extra) => Object.assign({
  type: 'value',
  name: nombre, nameLocation: 'middle',
  nameTextStyle: { color: '#4e5254', fontSize: 11 },
  axisLine: { show: false }, axisTick: { show: false },
  splitLine: { lineStyle: { color: '#f0f0f0' } },
  axisLabel: {
    color: '#4e5254', fontSize: 10,
    formatter: v => (esPct ? v + ' %' : String(v).replace('.', ','))
  }
}, extra || {});

/** Dispersión de dos indicadores, con el tamaño según las matrículas. */
function opcionDispersion(puntos, rotX, rotY, esPctX, color) {
  const o = baseOpcion();
  o.legend = { show: false };
  o.grid = { left: 70, right: 30, top: 26, bottom: 62 };
  o.tooltip = {
    trigger: 'item',
    backgroundColor: '#ffffff', borderColor: '#dcdcdc', borderWidth: 1,
    textStyle: { color: '#242627', fontSize: 11, fontFamily: TIPO_LETRA },
    formatter: p => p.data.rotulo + '<br/>' + rotX + ': ' +
      (esPctX ? pct(p.data.value[0]) : dec(p.data.value[0])) +
      '<br/>' + rotY + ': ' + pct(p.data.value[1]) +
      '<br/>Matrículas: ' + num(p.data.n)
  };
  o.xAxis = ejeValor(esPctX, rotX, { nameGap: 32 });
  o.yAxis = ejeValor(true, rotY, { nameGap: 46 });
  o.series = [{
    type: 'scatter', data: puntos,
    symbolSize: p => Math.max(6, Math.min(30, Math.sqrt(p[2]) * 1.5)),
    itemStyle: { color: color || '#87a436', opacity: 0.6,
      borderColor: '#fff', borderWidth: 0.6 },
    emphasis: { itemStyle: { color: '#d49d00', opacity: 1 } }
  }];
  return o;
}

/** Barras horizontales apiladas con la composición del desenlace. */
function opcionComposicion(nombres, series) {
  const o = baseOpcion();
  const ancho = nombres.reduce((a, n) => Math.max(a, String(n).length), 0);
  o.grid = { left: Math.min(300, 20 + ancho * 5.4), right: 40, top: 14, bottom: 52 };
  o.xAxis = ejeValor(true, '', { max: 100, nameGap: 0 });
  const inv = nombres.slice().reverse();
  o.yAxis = {
    type: 'category', data: inv,
    axisLine: { lineStyle: { color: '#dcdcdc' } },
    axisTick: { show: false },
    axisLabel: { color: '#4e5254', fontSize: 10, interval: 0 }
  };
  o.tooltip.valueFormatter = v => pct(v);
  o.series = series.map(s => ({
    name: s.nombre, type: 'bar', stack: 'r',
    data: s.datos.slice().reverse(), barMaxWidth: 20,
    itemStyle: { color: s.color }
  }));
  o.rotulosLeyenda = series.map(s => s.nombre);
  return o;
}

/* ==================================================================== */
/*  Filtros                                                              */
/* ==================================================================== */

function Seleccion({ seleccion, quitar, limpiar }) {
  const fichas = [];
  Object.keys(seleccion).forEach(d => {
    (seleccion[d] || []).forEach(c => fichas.push({ dim: d, cat: c }));
  });
  if (!fichas.length) return null;
  return (
    <div className="dsh-seleccion">
      <b>Selección activa:</b>
      {fichas.map(f => (
        <button key={f.dim + '|' + f.cat} type="button" className="dsh-quitar"
          onClick={() => quitar(f.dim, f.cat)}>
          {cortoDim(f.dim)}: {f.cat}
          <span aria-hidden="true">×</span>
        </button>
      ))}
      <button type="button" className="dsh-limpiar-sel" onClick={limpiar}>Quitar todo</button>
    </div>
  );
}

function Filtros({ seleccion, fijar, limpiar, Q, seccion }) {
  const unico = dim => {
    const vigentes = Q.opciones(dim);
    const elegida = (seleccion[dim] || [])[0];
    const lista = elegida && vigentes.indexOf(elegida) < 0
      ? [elegida].concat(vigentes) : vigentes;
    return (
      <select className="dsh-select" value={elegida || ''}
        onChange={e => fijar(dim, e.target.value ? [e.target.value] : [])}>
        <option value="">Todas ({lista.length})</option>
        {lista.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    );
  };
  const campo = (etiqueta, control) => (
    <div className="dsh-campo">
      <span className="dsh-leyenda">{etiqueta}</span>
      {control}
    </div>
  );
  const porGrupo = seccion === 'grupo';
  return (
    <section className="dsh-filtros" aria-label="Filtros">
      <div className="dsh-grid-f f-4">
        {campo('UAB de la asignatura', unico('uab'))}
        {campo('Asignatura', unico('nombreAsignatura'))}
        {campo('Facultad de la UAB', unico('facultadUab'))}
        {campo('Modalidad de la asignatura', unico('tipologia'))}
        {campo('Facultad del estudiante', unico('facultadEst'))}
        {campo('Programa del estudiante', unico('programa'))}
        {porGrupo ? campo('Docente', unico('docente')) : null}
        {porGrupo ? campo('Grupo', unico('numero')) : null}
        {porGrupo ? campo('Más de cinco estudiantes', unico('minimo')) : null}
        {porGrupo ? campo('Docente ocasional', unico('ocasional')) : null}
      </div>
      <div className="dsh-acciones">
        <button className="dsh-btn" type="button" onClick={limpiar}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z" />
          </svg>
          Borrar los filtros
        </button>
      </div>
    </section>
  );
}

/* ==================================================================== */
/*  Aplicación                                                           */
/* ==================================================================== */

const TOPE_COMPOSICION = 25;

function App() {
  const [tab, setTab] = useState(0);
  const sec = SECCIONES[tab];
  const [seleccion, setSeleccion] = useState({});
  const [ejeX, setEjeX] = useState('promedio');
  const refsTab = useRef([]);
  const firma = JSON.stringify(seleccion);
  const Q = useMemo(() => crearConsulta(seleccion), [firma]);
  const agg = useMemo(() => Q.agregados(), [Q]);

  const fijar = useCallback((dim, valores) => {
    setSeleccion(s => {
      const n = Object.assign({}, s);
      if (!valores || !valores.length) delete n[dim];
      else n[dim] = valores;
      return n;
    });
  }, []);

  const alternar = useCallback((dim, categoria) => {
    setSeleccion(s => {
      const n = Object.assign({}, s);
      const actual = (n[dim] || []).slice();
      const i = actual.indexOf(categoria);
      if (i >= 0) actual.splice(i, 1); else actual.push(categoria);
      if (!actual.length) delete n[dim];
      else n[dim] = actual;
      return n;
    });
  }, []);

  const teclas = (e, i) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const n = (i + (e.key === 'ArrowRight' ? 1 : SECCIONES.length - 1)) % SECCIONES.length;
    setTab(n);
    if (refsTab.current[n]) refsTab.current[n].focus();
  };

  useEffect(() => {
    const raiz = document.getElementById('root');
    if (raiz) raiz.dataset.montado = '1';
  }, []);

  const nivel = sec.id === 'grupo' ? 'grupo' : 'asignatura';
  const filas = useMemo(() => Q.resumen(nivel), [Q, nivel]);

  /* ------------------------------------------------- dispersión superior */
  const dispersion = useMemo(() => {
    if (sec.id === 'critico') {
      const conIndice = filas.filter(f => !vacio(f.indiceCritico));
      const puntos = conIndice.map(f => ({
        value: [f.indiceCritico, f.reprobacion, f.n], rotulo: f.rotulo, n: f.n
      }));
      return {
        opcion: opcionDispersion(puntos, 'Índice crítico', 'Porcentaje de reprobación',
          false, '#87a436'),
        csv: () => ({
          encabezados: ['Asignatura', 'Índice crítico', 'Reprobación (%)', 'Matrículas'],
          filas: conIndice.map(f => [f.rotulo, f.indiceCritico, f.reprobacion, f.n])
        })
      };
    }
    const esPromedio = ejeX === 'promedio';
    const puntos = filas.map(f => ({
      value: [esPromedio ? f.promedio : f.cancelacion, f.reprobacion, f.n],
      rotulo: f.rotulo, n: f.n
    })).filter(p => !vacio(p.value[0]));
    return {
      opcion: opcionDispersion(puntos,
        esPromedio ? 'Promedio' : 'Porcentaje de cancelación',
        'Porcentaje de reprobación', !esPromedio, '#87a436'),
      csv: () => ({
        encabezados: [nivel === 'grupo' ? 'Grupo' : 'Asignatura',
          esPromedio ? 'Promedio' : 'Cancelación (%)', 'Reprobación (%)', 'Matrículas'],
        filas: filas.map(f => [f.rotulo, esPromedio ? f.promedio : f.cancelacion,
          f.reprobacion, f.n])
      })
    };
  }, [filas, ejeX, sec]);

  /* ------------------------------------------- dispersión de cupos */
  const cupos = useMemo(() => {
    const con = filas.filter(f => !vacio(f.cupo));
    const puntos = con.map(f => ({
      value: [f.cupo, f.reprobacion, f.n], rotulo: f.rotulo, n: f.n
    }));
    return {
      opcion: opcionDispersion(puntos, 'Cupos ofertados',
        'Porcentaje de reprobación', false, '#d40f00'),
      csv: () => ({
        encabezados: ['Asignatura', 'Cupos ofertados', 'Reprobación (%)', 'Matrículas'],
        filas: con.map(f => [f.rotulo, f.cupo, f.reprobacion, f.n])
      })
    };
  }, [filas]);

  /* ------------------------------------------------- composición */
  const composicion = useMemo(() => {
    const lista = filas.slice()
      .sort((a, b) => b.reprobacion - a.reprobacion)
      .slice(0, TOPE_COMPOSICION);
    const series = CAT.estado.map((e, k) => ({
      nombre: e, color: colorDe('estado', e, k),
      datos: lista.map(f => (f.n ? 100 * f.estados[k] / f.n : 0))
    }));
    return {
      opcion: opcionComposicion(lista.map(f => f.rotulo), series),
      altoLienzo: lista.length > 10 ? 70 + lista.length * 24 : null,
      csv: () => ({
        encabezados: [nivel === 'grupo' ? 'Grupo' : 'Asignatura'].concat(CAT.estado),
        filas: lista.map(f => [f.rotulo].concat(
          CAT.estado.map((e, k) => (f.n ? 100 * f.estados[k] / f.n : 0))))
      }),
      alSeleccionar: n => {
        const f = lista.find(x => x.rotulo === n);
        if (f) alternar('nombreAsignatura', f.asignatura);
      }
    };
  }, [filas, nivel]);

  /* ------------------------------------------------------------ tablas */
  const columnas = useMemo(() => {
    const base = [
      { tit: 'Período', val: () => META.periodo, txt: () => META.periodo },
      { tit: nivel === 'grupo' ? 'Grupo' : 'Asignatura', fija: true,
        val: f => f.rotulo, txt: f => f.rotulo }
    ];
    if (nivel === 'grupo') {
      base.push({ tit: 'Matrículas', num: 1, val: f => f.n, txt: f => num(f.n) });
      base.push({ tit: 'Docente', val: f => f.docente, txt: f => f.docente });
      base.push({ tit: 'Ocasional', val: f => f.ocasional, txt: f => f.ocasional });
    }
    if (sec.id === 'critico') {
      base.push({ tit: 'Matriculados', num: 1, val: f => f.n, txt: f => num(f.n) });
    }
    base.push({ tit: 'Promedio', num: 1, val: f => f.promedio, txt: f => dec(f.promedio) });
    base.push({ tit: 'Aprobación', num: 1, val: f => f.aprobacion, txt: f => pct(f.aprobacion) });
    base.push({ tit: 'Reprobación', num: 1, val: f => f.reprobacion, txt: f => pct(f.reprobacion) });
    base.push({ tit: 'Cancelación', num: 1, val: f => f.cancelacion, txt: f => pct(f.cancelacion) });
    if (sec.id === 'critico') {
      base.push({ tit: 'Índice crítico', num: 1, val: f => f.indiceCritico,
        txt: f => dec(f.indiceCritico) });
      base.push({ tit: 'Sol. de cupo', num: 1, val: f => f.solicitudCupo,
        txt: f => pct(f.solicitudCupo, 1) });
    }
    return base;
  }, [nivel, sec]);

  const tarjetas = [
    [IC.visto, 'var(--dsh-primary)', 'Porcentaje de aprobación', pct(agg.aprobacion),
      num(agg.estados[CAT.estado.indexOf('Aprobada')]) + ' matrículas'],
    [IC.equis, 'var(--dsh-reprobada)', 'Porcentaje de reprobación', pct(agg.reprobacion),
      num(agg.estados[CAT.estado.indexOf('Reprobada')]) + ' matrículas'],
    [IC.circulo, 'var(--dsh-cancelada)', 'Porcentaje de cancelación', pct(agg.cancelacion),
      num(agg.estados[CAT.estado.indexOf('Cancelada')]) + ' matrículas'],
    [IC.tasa, 'var(--dsh-aprobada)', 'Promedio simple', dec(agg.promedio),
      'Sobre las notas registradas'],
    [IC.doc, 'var(--dsh-azul)', 'Matrículas', num(agg.n),
      META.periodo + ' · ' + num(filas.length) +
      (nivel === 'grupo' ? ' grupos' : ' asignaturas')]
  ];

  const arch = [sec.id];

  return (
    <React.Fragment>
      <div className="dsh-tabs" role="tablist" aria-label="Secciones del tablero">
        {SECCIONES.map((p, i) => (
          <button key={p.id} ref={el => (refsTab.current[i] = el)}
            className="dsh-tab" role="tab" id={'tab-' + p.id}
            aria-controls={'panel-' + p.id} aria-selected={i === tab}
            onClick={() => setTab(i)} onKeyDown={e => teclas(e, i)}>
            {p.rotulo}
          </button>
        ))}
      </div>

      <Filtros seleccion={seleccion} fijar={fijar} limpiar={() => setSeleccion({})}
        Q={Q} seccion={sec.id} />

      <Seleccion seleccion={seleccion} quitar={alternar} limpiar={() => setSeleccion({})} />

      <section className="dsh-kpis" aria-label="Indicadores">
        {tarjetas.map((t, i) => (
          <Kpi key={i} icono={t[0]} fondo={t[1]} etiqueta={t[2]} valor={t[3]} pie={t[4]} />
        ))}
      </section>

      <div id={'panel-' + sec.id} role="tabpanel" aria-labelledby={'tab-' + sec.id}>
        {sec.id === 'critico' ? (
          <div className="dsh-mosaico dsh-mosaico-2">
            <TarjetaGrafico titulo="Relación entre el índice crítico y la reprobación"
              opcion={dispersion.opcion} csv={dispersion.csv}
              archivo={nombreArchivo(arch.concat(['indice']))} />
            <TarjetaGrafico titulo="Relación entre los cupos ofertados y la reprobación"
              opcion={cupos.opcion} csv={cupos.csv}
              archivo={nombreArchivo(arch.concat(['cupos']))} />
          </div>
        ) : (
          <React.Fragment>
            <div className="dsh-mosaico dsh-mosaico-1">
              <TarjetaGrafico
                titulo={ejeX === 'promedio'
                  ? 'Relación entre el promedio y el porcentaje de reprobación'
                  : 'Relación entre la cancelación y el porcentaje de reprobación'}
                alto="hero" opcion={dispersion.opcion} csv={dispersion.csv}
                archivo={nombreArchivo(arch.concat(['dispersion', ejeX]))}
                extra={
                  <Segmento etiqueta="Eje horizontal" valor={ejeX} onCambio={setEjeX}
                    opciones={[
                      { valor: 'promedio', texto: 'Promedio' },
                      { valor: 'cancelacion', texto: 'Cancelación' }
                    ]} />
                } />
            </div>

            <div className="dsh-mosaico dsh-mosaico-1">
              <TarjetaGrafico
                titulo={'Composición del resultado · ' +
                  (nivel === 'grupo' ? 'grupos' : 'asignaturas') +
                  ' con mayor reprobación'}
                opcion={composicion.opcion} csv={composicion.csv}
                alSeleccionar={composicion.alSeleccionar}
                altoLienzo={composicion.altoLienzo}
                archivo={nombreArchivo(arch.concat(['composicion']))} />
            </div>
          </React.Fragment>
        )}

        <div className="dsh-mosaico dsh-mosaico-1">
          <Tarjeta titulo={sec.id === 'critico'
            ? 'Detalle de la oferta y los resultados por asignatura'
            : 'Detalle por ' + (nivel === 'grupo' ? 'grupo' : 'asignatura')}
            accion={
              <Descargas
                csv={() => ({
                  encabezados: columnas.map(c => c.tit),
                  filas: filas.map(f => columnas.map(c => c.val(f)))
                })}
                nombre={nombreArchivo(arch.concat(['detalle']))} />
            }>
            <Tabla columnas={columnas} filas={filas}
              ordenInicial={{ col: columnas.findIndex(c => c.tit === 'Reprobación'), asc: false }}
              alSeleccionar={f => alternar('nombreAsignatura', f.asignatura)} />
          </Tarjeta>
        </div>
      </div>

      <p className="dsh-nota">{DEF.nota}</p>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
