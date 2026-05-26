import { Types } from 'mongoose';

export type NivelAlertaAsistencia = 'ALERTA' | 'CRITICO' | 'INMINENTE';

export interface IAlertaAsistencia {
  estudianteId: Types.ObjectId;
  cursoId: Types.ObjectId;
  escuelaId: Types.ObjectId;
  nivel: NivelAlertaAsistencia;
  porcentajeAusencias: number;
  periodoId: string;
  fechaEnvio: Date;
  notificadosIds: Types.ObjectId[];
}
