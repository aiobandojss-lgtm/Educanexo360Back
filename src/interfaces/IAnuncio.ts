import { Document, Types } from 'mongoose';

export interface IArchivoAnuncio {
  fileId: Types.ObjectId;
  nombre: string;
  tipo: string;
  tamaño: number;
  // Fase 5.2: referencia en la capa de almacenamiento (opcional en lo antiguo)
  almacen?: 'gridfs' | 's3' | 'local';
  clave?: string;
  sha256?: string;
}

export interface IImagenPortada {
  fileId: Types.ObjectId;
  url: string;
}

export interface ILectura {
  usuarioId: Types.ObjectId;
  fechaLectura: Date;
}

export interface IAnuncio extends Document {
  titulo: string;
  contenido: string;
  creador: Types.ObjectId;
  escuelaId: Types.ObjectId;
  fechaPublicacion: Date;
  estaPublicado: boolean;
  paraEstudiantes: boolean;
  paraDocentes: boolean;
  paraPadres: boolean;
  destacado: boolean;
  archivosAdjuntos: IArchivoAnuncio[];
  imagenPortada?: IImagenPortada;
  lecturas: ILectura[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IAnuncioInput {
  titulo: string;
  contenido: string;
  paraEstudiantes?: boolean;
  paraDocentes?: boolean;
  paraPadres?: boolean;
  destacado?: boolean;
  estaPublicado?: boolean;
}
