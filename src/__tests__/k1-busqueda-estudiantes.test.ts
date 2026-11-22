// src/__tests__/k1-busqueda-estudiantes.test.ts
//
// K1: búsqueda de estudiantes (registro público con código de invitación y búsqueda autenticada).
// El mínimo de 3 letras por prefijo se saltaba con acentos combinados (NFD): "a" + U+0301 + U+0301 mide 3 con
// length, pero regexBusqueda quita los acentos y buscaba solo "^a" (enumeración del colegio). Ahora se cuentan
// las letras después de normalizar y los textos de más de 100 caracteres se ignoran sin error.
//
// El modelo Usuario se simula: no se necesita MongoDB.

jest.mock('../models/usuario.model', () => ({
  __esModule: true,
  default: { find: jest.fn() },
}));
jest.mock('../models/curso.model', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));

import Usuario from '../models/usuario.model';
import estudianteService, {
  contarLetras,
  MAX_CARACTERES_BUSQUEDA,
} from '../services/estudiante.service';

const ESCUELA = '507f1f77bcf86cd799439012';
const ACENTO = '́'; // acento agudo combinante

const mockUsuario = Usuario as unknown as { find: jest.Mock };

// Cadena .select().limit().lean() de Mongoose; devuelve [] (solo interesa la consulta)
const consultaVacia = () => ({
  select: () => ({ limit: () => ({ lean: () => Promise.resolve([]) }) }),
});

const buscar = (criterios: Record<string, unknown>) =>
  estudianteService.buscarEstudiantesExistentes({ escuelaId: ESCUELA, ...criterios } as any);

// Consulta que recibió Usuario.find (undefined si no se consultó la base)
const consultaEnviada = (): any => mockUsuario.find.mock.calls[0]?.[0];

beforeEach(() => {
  mockUsuario.find.mockReset();
  mockUsuario.find.mockImplementation(consultaVacia);
});

describe('contarLetras', () => {
  it('no cuenta los acentos combinados (NFD) como letras', () => {
    expect(`a${ACENTO}${ACENTO}`.length).toBe(3);
    expect(contarLetras(`a${ACENTO}${ACENTO}`)).toBe(1);
  });

  it('cuenta igual una letra acentuada precompuesta (NFC) y su forma descompuesta (NFD)', () => {
    expect(contarLetras('Mía')).toBe(3);
    expect(contarLetras(`Mi${ACENTO}a`)).toBe(3);
    expect(contarLetras('Ñañ')).toBe(3);
  });

  it('no cuenta espacios, signos, dígitos ni caracteres invisibles', () => {
    expect(contarLetras('a b')).toBe(2);
    expect(contarLetras("O'.")).toBe(1);
    expect(contarLetras('a​​b')).toBe(2); // espacio de ancho cero
    expect(contarLetras('12a')).toBe(1);
  });
});

describe('buscarEstudiantesExistentes: mínimo de 3 letras por prefijo', () => {
  it('ignora un nombre de 1 letra rellenado con acentos combinados (no consulta la base)', async () => {
    const resultado = await buscar({ nombre: `a${ACENTO}${ACENTO}` });
    expect(resultado).toEqual([]);
    expect(mockUsuario.find).not.toHaveBeenCalled();
  });

  it('ignora apellidos de 2 letras rellenados con signos o espacios internos', async () => {
    await buscar({ apellidos: 'a b' });
    await buscar({ apellidos: 'g​​o' });
    expect(mockUsuario.find).not.toHaveBeenCalled();
  });

  it('acepta 3 letras reales aunque vengan descompuestas (NFD)', async () => {
    await buscar({ nombre: `Jose${ACENTO}` });
    expect(mockUsuario.find).toHaveBeenCalledTimes(1);
    const regex: RegExp = consultaEnviada().$or[0].nombre;
    expect(regex.test('José Luis')).toBe(true);
    expect(regex.test('Jose')).toBe(true);
    expect(regex.test('Josué')).toBe(false);
  });

  it('acepta nombre y apellidos con 3 letras o más y los combina en un solo criterio', async () => {
    await buscar({ nombre: 'Ana', apellidos: 'Góm' });
    const criterio = consultaEnviada().$or[0];
    expect(criterio.nombre.test('Ana')).toBe(true);
    expect(criterio.apellidos.test('Gomez')).toBe(true);
  });
});

describe('buscarEstudiantesExistentes: tope de 100 caracteres', () => {
  const largo = 'a'.repeat(MAX_CARACTERES_BUSQUEDA + 1);

  it('ignora sin error nombre, apellidos, email y código de más de 100 caracteres', async () => {
    const resultado = await buscar({
      nombre: largo,
      apellidos: largo,
      email: `${largo}@correo.com`,
      codigo_estudiante: largo,
    });
    expect(resultado).toEqual([]);
    expect(mockUsuario.find).not.toHaveBeenCalled();
  });

  it('acepta exactamente 100 caracteres', async () => {
    await buscar({ nombre: 'a'.repeat(MAX_CARACTERES_BUSQUEDA) });
    expect(mockUsuario.find).toHaveBeenCalledTimes(1);
  });

  it('el tope se mide después de quitar los espacios de los extremos', async () => {
    await buscar({ nombre: `  ${'a'.repeat(MAX_CARACTERES_BUSQUEDA)}  ` });
    expect(mockUsuario.find).toHaveBeenCalledTimes(1);
  });

  it('un criterio válido sigue funcionando aunque otro sea demasiado largo', async () => {
    await buscar({ nombre: largo, codigo_estudiante: 'EST-001' });
    expect(consultaEnviada().$or).toEqual([{ 'info_academica.codigo_estudiante': 'EST-001' }]);
  });
});
