// src/__tests__/k4-detectar-fechas-corridas.test.ts
//
// K4: criterios del script de simulación detectar-fechas-corridas.js con fechas nulas o inválidas.
// Antes new Date(null) daba 1970-01-01T00:00Z: un evento o una tarea sin fecha se contaba como SEGURO/PROBABLE,
// y una tarea con fechaLimite null hacía caer el script en mas5(null).getTime().
//
// El script exporta sus criterios como funciones puras y solo se ejecuta al llamarlo con node: no se conecta
// a ninguna base al importarlo.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const script = require('../scripts/detectar-fechas-corridas');

const {
  esFechaValida,
  mas5,
  esSeguroTodoElDia,
  esEventoProbable,
  esTareaProbable,
  contarAtrasadasInjustas,
} = script;

const d = (texto: string) => new Date(texto);
const INVALIDAS = [null, undefined, '2026-07-01T00:00:00Z', 0, new Date('no-es-fecha'), {}];

describe('esFechaValida y mas5 (null guard)', () => {
  it('solo un Date válido es fecha', () => {
    expect(esFechaValida(d('2026-07-01T00:00:00Z'))).toBe(true);
    INVALIDAS.forEach((v) => expect(esFechaValida(v)).toBe(false));
  });

  it('mas5 suma 5 horas y devuelve null (sin lanzar) si la fecha no es válida', () => {
    expect(mas5(d('2026-07-01T00:00:00Z')).toISOString()).toBe('2026-07-01T05:00:00.000Z');
    INVALIDAS.forEach((v) => expect(mas5(v)).toBeNull());
  });
});

describe('criterios con fechas nulas: se omiten en lugar de contarse como 00:00Z de 1970', () => {
  it('evento de todo el día', () => {
    expect(esSeguroTodoElDia({ fechaInicio: d('2026-07-01T00:00:00Z') })).toBe(true);
    expect(esSeguroTodoElDia({ fechaInicio: d('2026-07-01T05:00:00Z') })).toBe(false);
    INVALIDAS.forEach((v) => expect(esSeguroTodoElDia({ fechaInicio: v })).toBe(false));
    expect(esSeguroTodoElDia({})).toBe(false);
  });

  it('evento con hora', () => {
    expect(esEventoProbable({ fechaInicio: d('2026-07-01T08:00:00Z') })).toBe(true); // 3:00 a. m. en Colombia
    expect(esEventoProbable({ fechaInicio: d('2026-07-01T13:00:00Z') })).toBe(false); // 8:00 a. m. en Colombia
    INVALIDAS.forEach((v) => expect(esEventoProbable({ fechaInicio: v })).toBe(false));
  });

  it('tarea', () => {
    expect(esTareaProbable({ fechaLimite: d('2026-07-01T23:59:00Z') })).toBe(true);
    expect(esTareaProbable({ fechaLimite: d('2026-07-01T00:00:00Z') })).toBe(true);
    expect(esTareaProbable({ fechaLimite: d('2026-07-02T04:59:00Z') })).toBe(false); // convención de la web
    INVALIDAS.forEach((v) => expect(esTareaProbable({ fechaLimite: v })).toBe(false));
  });
});

describe('contarAtrasadasInjustas', () => {
  const tarea = (fechaLimite: unknown, entregas: unknown) => ({ fechaLimite, entregas });

  it('cuenta las ATRASADA que con +5 h habrían llegado a tiempo', () => {
    const tareas = [
      tarea(d('2026-07-01T23:59:00Z'), [
        { estado: 'ATRASADA', fechaEntrega: d('2026-07-02T02:00:00Z') }, // antes de las 04:59Z → injusta
        { estado: 'ATRASADA', fechaEntrega: d('2026-07-02T06:00:00Z') }, // después → atrasada de verdad
        { estado: 'ENTREGADA', fechaEntrega: d('2026-07-01T20:00:00Z') },
      ]),
    ];
    expect(contarAtrasadasInjustas(tareas)).toBe(1);
  });

  it('no lanza con fechaLimite null (antes: mas5(null).getTime() hacía caer el script)', () => {
    expect(() => contarAtrasadasInjustas([tarea(null, [{ estado: 'ATRASADA', fechaEntrega: d('2026-07-02T02:00:00Z') }])])).not.toThrow();
    expect(contarAtrasadasInjustas([tarea(null, [{ estado: 'ATRASADA', fechaEntrega: d('2026-07-02T02:00:00Z') }])])).toBe(0);
  });

  it('omite entregas sin fecha, entregas nulas y tareas sin arreglo de entregas', () => {
    const tareas = [
      tarea(d('2026-07-01T23:59:00Z'), [null, { estado: 'ATRASADA' }, { estado: 'ATRASADA', fechaEntrega: null }]),
      tarea(d('2026-07-01T23:59:00Z'), undefined),
    ];
    expect(contarAtrasadasInjustas(tareas)).toBe(0);
  });
});
