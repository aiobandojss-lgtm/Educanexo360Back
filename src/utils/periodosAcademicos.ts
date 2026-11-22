import mongoose from 'mongoose';

export interface PeriodoEntrante {
  _id?: unknown;
  numero: number;
  nombre: string;
  fecha_inicio: string | Date;
  fecha_fin: string | Date;
}

export interface PeriodoExistente {
  _id: mongoose.Types.ObjectId | string;
  numero: number;
}

/**
 * K3: al reemplazar los periodos de una escuela se conserva el _id de los que ya existen. Antes el arreglo se
 * reemplazaba completo y, si el cliente no mandaba el _id, Mongoose generaba uno nuevo: los periodoId guardados en
 * asistencias y alertas quedaban apuntando a un periodo inexistente (y la alerta de inasistencia no salía).
 *
 * Emparejamiento, en dos pasadas para que un número repetido no le quite el _id a quien lo pidió explícitamente:
 *  1. por _id, si el cliente lo manda y es de un periodo existente;
 *  2. por número de periodo, entre los existentes que no se emparejaron en la pasada 1.
 * Un _id que no corresponde a ningún periodo existente se descarta (el periodo nuevo recibe uno generado).
 * Solo se copian los campos del esquema (numero, nombre, fecha_inicio, fecha_fin).
 */
export const conservarIdsPeriodos = (
  existentes: PeriodoExistente[],
  entrantes: PeriodoEntrante[],
): Array<Omit<PeriodoEntrante, '_id'> & { _id?: mongoose.Types.ObjectId }> => {
  const porId = new Map(existentes.map((p) => [String(p._id), p]));
  const usados = new Set<string>();
  const asignados: Array<string | undefined> = new Array(entrantes.length).fill(undefined);

  // Pasada 1: por _id
  entrantes.forEach((p, i) => {
    const id = p._id !== undefined && p._id !== null ? String(p._id) : '';
    if (id && porId.has(id) && !usados.has(id)) {
      asignados[i] = id;
      usados.add(id);
    }
  });

  // Pasada 2: por número, entre los existentes libres
  entrantes.forEach((p, i) => {
    if (asignados[i]) return;
    const existente = existentes.find((e) => Number(e.numero) === Number(p.numero) && !usados.has(String(e._id)));
    if (existente) {
      asignados[i] = String(existente._id);
      usados.add(String(existente._id));
    }
  });

  return entrantes.map((p, i) => ({
    ...(asignados[i] ? { _id: new mongoose.Types.ObjectId(asignados[i]) } : {}),
    numero: p.numero,
    nombre: p.nombre,
    fecha_inicio: p.fecha_inicio,
    fecha_fin: p.fecha_fin,
  }));
};
