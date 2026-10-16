# -*- coding: utf-8 -*-
"""
ETL del tablero de resultados académicos.

    python3 etl_resultados.py <03_DATOS_LDA.xlsx> <DATOS_ASIG.xlsx> <salida>

Insumos:
    LDA   una fila por matrícula: estudiante, asignatura, grupo y desenlace
    ASIG  agregado por asignatura con cupos, inscritos, índice crítico y
          porcentaje de solicitud de cupo

UNIDAD DE ANÁLISIS
    Cada registro del núcleo es una matrícula: un estudiante en una asignatura y
    un grupo durante el período. Los porcentajes de aprobación, reprobación y
    cancelación se calculan sobre ese total, y el promedio simple sobre las
    calificaciones numéricas registradas, que excluyen a las canceladas.

PROTECCIÓN DE DATOS
    El archivo de origen contiene documento y nombre de los estudiantes. Ninguna
    de esas columnas se exporta: la salida son conteos por combinación de grupo,
    plan y desenlace. El nombre del docente sí se conserva, porque el análisis
    por grupo lo requiere y es información pública de la programación académica.
"""

import io
import json
import os
import re
import sys
import unicodedata

import pandas as pd

LDA = sys.argv[1] if len(sys.argv) > 1 else '03_DATOS_LDA.xlsx'
ASIG = sys.argv[2] if len(sys.argv) > 2 else 'DATOS_ASIG.xlsx'
SALIDA = sys.argv[3] if len(sys.argv) > 3 else 'datos'

MINIMO_GRUPO = 5          # umbral del filtro «más de cinco estudiantes»

MINUSCULAS = {'de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'a', 'para',
              'con', 'por', 'al', 'o', 'u'}
SIGLAS = {'UAB', 'TIC', 'I', 'II', 'III', 'IV', 'V', 'VI', 'PEAMA', 'PAES'}


def titular(texto):
    t = re.sub(r'\s+', ' ', str(texto).strip())
    if not t or t.lower() in ('nan', 'none'):
        return 'Sin información'
    palabras = []
    for i, w in enumerate(t.split(' ')):
        if w.strip('.,()').upper() in SIGLAS:
            palabras.append(w.upper())
        elif i > 0 and w.lower() in MINUSCULAS:
            palabras.append(w.lower())
        else:
            palabras.append(w[:1].upper() + w[1:].lower())
    return ' '.join(palabras)


def normalizar(texto):
    t = unicodedata.normalize('NFD', str(texto).upper())
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', t).strip()


def nativo(o):
    """Convierte los tipos de numpy a los equivalentes de Python, que son los
    únicos que el serializador acepta."""
    if hasattr(o, 'item'):
        return o.item()
    raise TypeError('Tipo no serializable: %s' % type(o).__name__)


def escribir(nombre, variable, objeto, comentario):
    ruta = os.path.join(SALIDA, nombre)
    with io.open(ruta, 'w', encoding='utf-8') as fh:
        fh.write('/* %s\n   Generado por etl_resultados.py. No editar a mano.\n'
                 '   Contiene únicamente conteos agregados: ningún dato personal '
                 'de estudiantes. */\n' % comentario)
        fh.write('window.RAC = window.RAC || {};\n')
        fh.write('window.RAC.%s = %s;\n'
                 % (variable, json.dumps(objeto, ensure_ascii=False,
                                         separators=(',', ':'), default=nativo)))
    return os.path.getsize(ruta)


DIMENSIONES = ['grupo', 'planId', 'estado']


def main():
    if not os.path.isdir(SALIDA):
        os.makedirs(SALIDA)

    lda = pd.read_excel(LDA)
    asig = pd.read_excel(ASIG)

    lda['cod_asig'] = lda['cod_asignatura'].astype(str).str.strip()
    lda['grupo'] = lda['cod_asig'] + '|' + lda['grupo_activ'].astype(str).str.strip()
    # 'plan' ya existe como nombre del plan: el identificador va aparte.
    lda['planId'] = lda['cod_plan'].astype(str).str.strip()
    lda['estado'] = lda['estado'].map(titular)
    lda['calif'] = pd.to_numeric(lda['calificacion_numerica'], errors='coerce')

    # ---- catálogo de grupos
    grupos = lda.groupby('grupo').agg(
        codAsignatura=('cod_asig', 'first'),
        asignatura=('asignatura', lambda s: titular(s.iloc[0])),
        numero=('grupo_activ', 'first'),
        docente=('nom_docen_princi', lambda s: titular(s.iloc[0])),
        categoria=('categoria', lambda s: titular(s.iloc[0])),
        ocasional=('ocasional', 'first'),
        uab=('uab', lambda s: titular(s.iloc[0])),
        tipologia=('tipologia_desc', lambda s: titular(s.iloc[0])),
        matriculas=('grupo', 'size'),
    ).reset_index()
    grupos['numero'] = grupos['numero'].astype(str)
    grupos['minimo'] = grupos['matriculas'].map(
        lambda n: 'Sí' if n > MINIMO_GRUPO else 'No')
    grupos['rotulo'] = grupos['asignatura'] + ' · grupo ' + grupos['numero']

    # ---- catálogo de planes, con la facultad del estudiante
    planes = lda.groupby('planId').agg(
        nombre=('plan', lambda s: titular(s.iloc[0])),
        facultadEst=('facultad', lambda s: titular(s.value_counts().index[0])),
        nivel=('tipo_nivel', lambda s: titular(s.iloc[0])),
    ).reset_index()

    # ---- catálogo de asignaturas, con la información de oferta y demanda
    asig['cod_asig'] = asig['cod_asignatura'].astype(str).str.strip()
    ofertada = asig.drop_duplicates('cod_asig').set_index('cod_asig')
    resumen_asig = grupos.groupby('codAsignatura').agg(
        nombre=('asignatura', 'first'), uab=('uab', 'first'),
        tipologia=('tipologia', 'first'), grupos=('grupo', 'size')).reset_index()

    def campo(cod, col, defecto=None):
        if cod in ofertada.index:
            v = ofertada.loc[cod, col]
            if pd.notna(v):
                return float(v) if isinstance(v, (int, float)) else v
        return defecto

    catalogo_asig = []
    for r in resumen_asig.itertuples(index=False):
        catalogo_asig.append({
            'cod': r.codAsignatura, 'nombre': r.nombre, 'uab': r.uab,
            'tipologia': r.tipologia, 'grupos': int(r.grupos),
            'facultadUab': titular(campo(r.codAsignatura, 'nom_facultad',
                                         'Sin información')),
            'cupo': campo(r.codAsignatura, 'ppal_cupo'),
            'inscritos': campo(r.codAsignatura, 'ppal_num_inscritos'),
            'indiceCritico': campo(r.codAsignatura, 'indice_critico'),
            'solicitudCupo': campo(r.codAsignatura, 'porc_sdc'),
            'cuposSolicitados': campo(r.codAsignatura, 'cupos_solicitados'),
        })
    facultad_uab = {a['cod']: a['facultadUab'] for a in catalogo_asig}
    grupos['facultadUab'] = grupos['codAsignatura'].map(facultad_uab)

    # ---- núcleo
    categorias = {
        'grupo': list(grupos['grupo']),
        'planId': list(planes['planId']),
        'estado': ['Aprobada', 'Cancelada', 'Reprobada'],
    }
    indices = {d: {c: i for i, c in enumerate(categorias[d])} for d in DIMENSIONES}

    agrupado = lda.groupby(DIMENSIONES, dropna=False).agg(
        n=('grupo', 'size'),
        suma=('calif', 'sum'),
        conNota=('calif', 'count'),
    ).reset_index()

    filas = []
    for r in agrupado.itertuples(index=False):
        if r.estado not in indices['estado'] or r.planId not in indices['planId']:
            continue
        filas.append([indices['grupo'][r.grupo], indices['planId'][r.planId],
                      indices['estado'][r.estado],
                      int(r.n), round(float(r.suma), 2), int(r.conNota)])

    nucleo = {
        'dimensiones': DIMENSIONES,
        'categorias': categorias,
        'metricas': ['n', 'suma', 'conNota'],
        'filas': filas,
    }

    meta = {
        'periodo': str(lda['periodo'].iloc[0]),
        'matriculas': int(len(lda)),
        'estudiantes': int(lda['documento'].nunique()),
        'asignaturas': int(lda['cod_asig'].nunique()),
        'gruposTotales': int(len(grupos)),
        'docentes': int(grupos['docente'].nunique()),
        'minimoGrupo': MINIMO_GRUPO,
        'gruposCat': [
            {'id': r.grupo, 'cod': r.codAsignatura, 'asignatura': r.asignatura,
             'numero': r.numero, 'rotulo': r.rotulo, 'docente': r.docente,
             'categoria': r.categoria, 'ocasional': str(r.ocasional),
             'uab': r.uab, 'facultadUab': r.facultadUab,
             'tipologia': r.tipologia, 'minimo': r.minimo,
             'matriculas': int(r.matriculas)}
            for r in grupos.itertuples(index=False)],
        'planesCat': [
            {'cod': r.planId, 'nombre': r.nombre, 'facultadEst': r.facultadEst,
             'nivel': r.nivel}
            for r in planes.itertuples(index=False)],
        'asignaturasCat': catalogo_asig,
        'facultadesUab': sorted({a['facultadUab'] for a in catalogo_asig}),
        'uabs': sorted(set(grupos['uab'])),
        'tipologias': sorted(set(grupos['tipologia'])),
        'docentesLista': sorted(set(grupos['docente'])),
        'facultadesEst': sorted(set(planes['facultadEst'])),
        'programas': sorted(set(planes['nombre'])),
        'asignaturasLista': sorted({a['nombre'] for a in catalogo_asig}),
    }

    t1 = escribir('rac_nucleo.js', 'nucleo', nucleo,
                  'Matrículas por grupo, plan del estudiante y desenlace')
    t2 = escribir('rac_meta.js', 'meta', meta,
                  'Catálogos de grupos, planes y asignaturas')

    aprob = (lda['estado'] == 'Aprobada').mean() * 100
    reprob = (lda['estado'] == 'Reprobada').mean() * 100
    canc = (lda['estado'] == 'Cancelada').mean() * 100

    print('%-20s %9.1f KB' % ('rac_nucleo.js', t1 / 1024.0))
    print('%-20s %9.1f KB' % ('rac_meta.js', t2 / 1024.0))
    print('%-20s %9s combinaciones' % ('núcleo', format(len(filas), ',')))
    print('%-20s %9s matrículas · %s estudiantes'
          % ('volumen', format(len(lda), ','), format(lda['documento'].nunique(), ',')))
    print('%-20s %9s asignaturas · %s grupos · %s docentes'
          % ('cobertura', format(meta['asignaturas'], ','),
             format(meta['gruposTotales'], ','), format(meta['docentes'], ',')))
    print('%-20s %8.2f %% aprobación · %.2f %% reprobación · %.2f %% cancelación'
          % ('resultado', aprob, reprob, canc))
    print('%-20s %9.2f promedio simple' % ('', lda['calif'].mean()))
    con_indice = sum(1 for a in catalogo_asig if a['indiceCritico'] is not None)
    print('%-20s %9s asignaturas con índice crítico' % ('oferta', con_indice))


if __name__ == '__main__':
    main()
