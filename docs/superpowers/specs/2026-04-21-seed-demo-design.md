# Spec: Script de Datos Demo — EducaNexo360

**Fecha:** 2026-04-21  
**Estado:** Aprobado  
**Archivo a crear:** `src/scripts/seed-demo.js`

---

## Objetivo

Generar un script Node.js re-ejecutable que limpie la base de datos de pruebas e inserte datos realistas y coherentes para preparar el video de venta del producto. El script trabaja directamente con Mongoose (CommonJS), no a través de la API REST.

---

## Colegios base (IDs fijos — NO se modifican)

| Colegio | `_id` |
|---------|-------|
| Centro Docente rep de colombia | `67cbd7457b538a736df6c31f` |
| Colegio San José | `67ccaf317bb6eedc21de542c` |

---

## Estructura de datos por colegio

### Cursos (5 por colegio)

| Nivel | Curso | Grupo | Jornada |
|-------|-------|-------|---------|
| PREESCOLAR | Jardín | A | MATUTINA |
| PREESCOLAR | Transición | A | MATUTINA |
| PRIMARIA | Primero | A | MATUTINA |
| PRIMARIA | Segundo | A | MATUTINA |
| PRIMARIA | Tercero | A | MATUTINA |

### Asignaturas (3 por curso = 15 por colegio)

- Matemáticas
- Español
- Ciencias Naturales

Cada asignatura tiene 4 períodos con porcentajes iguales (25% cada uno), fechas alineadas al año académico 2026.

### Usuarios de planta (6 por colegio)

| Rol | Cantidad | Detalle |
|-----|----------|---------|
| ADMIN | 1 | Gestión del sistema |
| RECTOR | 1 | Director institucional |
| COORDINADOR | 1 | Cubre toda la institución |
| DOCENTE | 3 | Uno por materia (Matemáticas, Español, Ciencias) |

**Asignación de director_grupo:**
- Docente Español → director de Jardín A y Transición A
- Docente Matemáticas → director de Primero A y Segundo A
- Docente Ciencias → director de Tercero A

**Asignación de asignaturas a docentes (`info_academica.asignaturas_asignadas`):**
- Cada docente tiene registradas todas sus asignaturas con sus respectivos `asignaturaId` y `cursoId`

### Estudiantes y acudientes (por colegio)

- **10 estudiantes** (2 por curso × 5 cursos)
- **7 acudientes** con la siguiente distribución:

| Acudiente | Hijos | Cursos de los hijos |
|-----------|-------|---------------------|
| Acudiente 1 | 2 | Jardín A + Primero A |
| Acudiente 2 | 2 | Transición A + Segundo A |
| Acudiente 3 | 2 | Primero A + Tercero A |
| Acudientes 4–7 | 1 c/u | Un curso cada uno |

Los 3 primeros acudientes permiten probar la funcionalidad de selección de hijo individual en Flutter.

---

## Anuncios (5 por colegio)

Tipos variados, dirigidos a diferentes audiencias:

1. Reunión general de padres de familia (todos)
2. Cierre del primer período académico (docentes)
3. Actividad deportiva interescolar (estudiantes)
4. Comunicado sobre actualización del calendario (todos)
5. Jornada pedagógica — sin clases (todos)

---

## Eventos de calendario (12+ por colegio)

Distribuidos en Mayo, Junio y Julio 2026 — mínimo 4 por mes:

**Mayo 2026:**
- Día del maestro (15 mayo)
- Entrega de boletines primer período (20 mayo)
- Reunión de padres de familia (22 mayo)
- Izada de bandera mensual (30 mayo)

**Junio 2026:**
- Cierre primer semestre (13 junio)
- Semana cultural institucional (16–20 junio)
- Jornada deportiva (25 junio)
- Inicio vacaciones de mitad de año (27 junio)

**Julio 2026:**
- Regreso a clases segundo semestre (14 julio)
- Reunión de docentes — planeación (15 julio)
- Feria de ciencias (24 julio)
- Elección de personero estudiantil (28 julio)

---

## Colecciones — operaciones del script

| Colección | Operación |
|-----------|-----------|
| `escuelas` | Sin tocar |
| `perfilrols` | Sin tocar |
| `usuarios` | `deleteMany({})` → insertar nuevo |
| `cursos` | `deleteMany({})` → insertar nuevo |
| `asignaturas` | `deleteMany({})` → insertar nuevo |
| `anuncios` | `deleteMany({})` → insertar 5 nuevos |
| `eventocalendarios` | `deleteMany({})` → insertar 12+ nuevos |
| `calificaciones` | `deleteMany({})` |
| `logros` | `deleteMany({})` |
| `mensajes` | `deleteMany({})` |
| `notificaciones` | `deleteMany({})` |
| `invitaciones` | `deleteMany({})` |
| `asistencias` | `deleteMany({})` |
| `tareas` | `deleteMany({})` |

---

## Contraseñas

Todos los usuarios tendrán la contraseña `Demo2026*` hasheada con bcrypt (salt rounds: 10), igual que el sistema real.

Algunos usuarios tendrán correos reales para validar envío de notificaciones en demos:

| Usuario | Email real |
|---------|-----------|
| ADMIN (Centro Docente) | `admin@educanexo360.creativebycode.com` |
| DOCENTE Matemáticas (Centro Docente) | `docente1@educanexo360.creativebycode.com` |
| DOCENTE Español (Centro Docente) | `docente2@educanexo360.creativebycode.com` |
| ACUDIENTE 1 (Centro Docente) | `acudiente1@educanexo360.creativebycode.com` |
| ACUDIENTE 2 (Centro Docente) | `acudiente2@educanexo360.creativebycode.com` |

El resto de usuarios usarán el patrón:
- Planta: `rector.cdrc@demo.com`, `coordinador.csj@demo.com`, etc.
- Estudiantes: `est01.cdrc@demo.com`, `est02.cdrc@demo.com`, etc.
- Acudientes restantes: `acudiente03.cdrc@demo.com`, etc.

---

## Ejecución

```bash
node src/scripts/seed-demo.js
```

El script:
1. Se conecta a MongoDB usando `MONGODB_URI` del `.env`
2. Muestra progreso por consola (`console.log`) para cada colección
3. Desconecta al finalizar
4. En caso de error, hace rollback mostrando el error y sale con código 1

---

## Nombres colombianos usados

Los nombres son ficticios pero realistas para Colombia:
- Docentes / planta: nombres completos adultos colombianos
- Estudiantes: nombres de niños/jóvenes colombianos
- Acudientes: nombres de padres colombianos
