-- 0036: Tabla de plantillas de documentos + seed de plantillas del sistema.
--
-- Plantillas del sistema: workspace_id = NULL, is_system = true.
-- Plantillas del usuario: workspace_id = workspace específico.

-- ─── Tabla ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS doc_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  description TEXT,
  icon        TEXT,
  category    TEXT NOT NULL DEFAULT 'general',
  content     TEXT NOT NULL DEFAULT '',
  is_system   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE doc_templates ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_doc_templates_workspace ON doc_templates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_doc_templates_category  ON doc_templates(category);

-- updated_at automático
CREATE OR REPLACE FUNCTION doc_templates_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS doc_templates_updated_at ON doc_templates;
CREATE TRIGGER doc_templates_updated_at
  BEFORE UPDATE ON doc_templates
  FOR EACH ROW EXECUTE FUNCTION doc_templates_set_updated_at();

-- ─── RLS ────────────────────────────────────────────────────

-- Ver: plantillas del sistema + las del workspace del usuario.
CREATE POLICY "doc_templates_select"
  ON doc_templates FOR SELECT
  USING (
    is_system = true
    OR workspace_id IS NULL
    OR workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- Crear: solo en workspaces propios.
CREATE POLICY "doc_templates_insert"
  ON doc_templates FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- Actualizar: solo las propias (no las del sistema).
CREATE POLICY "doc_templates_update"
  ON doc_templates FOR UPDATE
  USING (
    is_system = false
    AND created_by = auth.uid()
  );

-- Eliminar: solo las propias (no las del sistema).
CREATE POLICY "doc_templates_delete"
  ON doc_templates FOR DELETE
  USING (
    is_system = false
    AND created_by = auth.uid()
  );

-- ─── Seed: plantillas del sistema ───────────────────────────
-- workspace_id = NULL → son globales para todas las workspaces.

INSERT INTO doc_templates (name, description, icon, category, content, is_system)
VALUES

-- 1. Nota rápida
(
  'Nota rápida',
  'Nota vacía para escribir libremente.',
  '📝',
  'personal',
  '<h2></h2><p></p>',
  true
),

-- 2. Minuta de reunión
(
  'Minuta de reunión',
  'Registro estructurado de una reunión con asistentes, acuerdos y tareas.',
  '📋',
  'reuniones',
  '<h1>Minuta de reunión</h1><p><strong>Fecha:</strong>  </p><p><strong>Participantes:</strong>  </p><hr /><h2>Objetivo</h2><p></p><hr /><h2>Temas tratados</h2><p></p><hr /><h2>Acuerdos</h2><ul><li><p></p></li></ul><hr /><h2>Tareas a seguir</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox" /><span></span></label><div><p></p></div></li></ul><hr /><h2>Próximos pasos</h2><p><strong>Próxima reunión:</strong>  </p><p><strong>Responsable de seguimiento:</strong>  </p>',
  true
),

-- 3. Orden del día
(
  'Orden del día',
  'Agenda de reunión con temas y tiempo estimado.',
  '📅',
  'reuniones',
  '<h1>Orden del día</h1><p><strong>Reunión:</strong>  </p><p><strong>Fecha:</strong>  </p><p><strong>Duración estimada:</strong>  </p><hr /><ol><li><p><strong>Tema 1</strong> — <em>(10 min)</em></p></li><li><p><strong>Tema 2</strong> — <em>(15 min)</em></p></li><li><p><strong>Tema 3</strong> — <em>(10 min)</em></p></li></ol><hr /><h2>Notas</h2><p></p>',
  true
),

-- 4. Notas de llamada
(
  'Notas de llamada',
  'Campos predefinidos para una llamada o videollamada.',
  '📞',
  'reuniones',
  '<h1>Llamada</h1><p><strong>Fecha:</strong>  </p><p><strong>Participantes:</strong>  </p><p><strong>Duración:</strong>  </p><hr /><h2>Temas</h2><p></p><hr /><h2>Decisiones</h2><ul><li><p></p></li></ul><hr /><h2>Acciones</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox" /><span></span></label><div><p></p></div></li></ul>',
  true
),

-- 5. Brief de proyecto
(
  'Brief de proyecto',
  'Documento de inicio con objetivos, alcance, equipo y cronograma.',
  '📑',
  'proyectos',
  '<h1>Brief de proyecto</h1><p><strong>Nombre del proyecto:</strong>  </p><p><strong>Fecha de inicio:</strong>  </p><p><strong>Fecha estimada de entrega:</strong>  </p><hr /><h2>Objetivo</h2><p>¿Qué queremos lograr?</p><hr /><h2>Alcance</h2><h3>Lo que incluye</h3><ul><li><p></p></li></ul><h3>Lo que NO incluye</h3><ul><li><p></p></li></ul><hr /><h2>Equipo</h2><ul><li><p><strong>Responsable:</strong>  </p></li><li><p><strong>Diseño:</strong>  </p></li><li><p><strong>Desarrollo:</strong>  </p></li></ul><hr /><h2>Cronograma</h2><table><thead><tr><th>Fase</th><th>Fecha</th><th>Estado</th></tr></thead><tbody><tr><td>Planificación</td><td></td><td>Por iniciar</td></tr><tr><td>Ejecución</td><td></td><td>Por iniciar</td></tr><tr><td>Entrega</td><td></td><td>Por iniciar</td></tr></tbody></table><hr /><h2>Riesgos</h2><ul><li><p></p></li></ul>',
  true
),

-- 6. Retrospectiva
(
  'Retrospectiva',
  'Formato clásico: qué salió bien, qué mejorar, acciones.',
  '🔄',
  'proyectos',
  '<h1>Retrospectiva</h1><p><strong>Fecha:</strong>  </p><p><strong>Periodo:</strong>  </p><hr /><h2>✅ Qué salió bien</h2><ul><li><p></p></li></ul><hr /><h2>⚠️ Qué mejorar</h2><ul><li><p></p></li></ul><hr /><h2>🎯 Acciones concretas</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox" /><span></span></label><div><p></p></div></li></ul><hr /><h2>💡 Ideas</h2><p></p>',
  true
),

-- 7. Especificación técnica
(
  'Especificación técnica',
  'Documento técnico con contexto, requisitos, diseño y métricas.',
  '⚙️',
  'proyectos',
  '<h1>Especificación técnica</h1><p><strong>Autor:</strong>  </p><p><strong>Estado:</strong> Borrador</p><p><strong>Última actualización:</strong>  </p><hr /><h2>Contexto</h2><p>¿Por qué es necesario este cambio?</p><hr /><h2>Requisitos</h2><h3>Funcionales</h3><ul><li><p></p></li></ul><h3>No funcionales</h3><ul><li><p></p></li></ul><hr /><h2>Diseño</h2><p>Descripción de la solución propuesta.</p><hr /><h2>Alternativas consideradas</h2><ol><li><p></p></li></ol><hr /><h2>Métricas de éxito</h2><ul><li><p></p></li></ul><hr /><h2>Riesgos</h2><ul><li><p></p></li></ul>',
  true
),

-- 8. Diario de trabajo
(
  'Diario de trabajo',
  'Registro diario de logros, bloqueos y planes.',
  '📒',
  'personal',
  '<h1>Diario de trabajo</h1><p><strong>Fecha:</strong>  </p><hr /><h2>Logros</h2><ul><li><p></p></li></ul><hr /><h2>Bloqueos</h2><ul><li><p></p></li></ul><hr /><h2>Planes para mañana</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox" /><span></span></label><div><p></p></div></li></ul><hr /><h2>Notas</h2><p></p>',
  true
),

-- 9. Investigación
(
  'Investigación',
  'Plantilla para documentar investigación: pregunta, hallazgos, fuentes.',
  '🔍',
  'personal',
  '<h1>Investigación</h1><p><strong>Tema:</strong>  </p><p><strong>Fecha de inicio:</strong>  </p><hr /><h2>Pregunta de investigación</h2><p>¿Qué queremos descubrir?</p><hr /><h2>Hallazgos</h2><ol><li><p></p></li></ol><hr /><h2>Fuentes</h2><ul><li><p></p></li></ul><hr /><h2>Conclusiones</h2><p></p><hr /><h2>Próximos pasos</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox" /><span></span></label><div><p></p></div></li></ul>',
  true
),

-- 10. Lista de verificación
(
  'Lista de verificación',
  'Checklist general con secciones predefinidas.',
  '✅',
  'general',
  '<h1>Lista de verificación</h1><p><strong>Contexto:</strong>  </p><hr /><h2>Preparación</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox" /><span></span></label><div><p></p></div></li></ul><hr /><h2>Ejecución</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox" /><span></span></label><div><p></p></div></li></ul><hr /><h2>Seguimiento</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox" /><span></span></label><div><p></p></div></li></ul>',
  true
);

-- Nota: las plantillas del sistema tienen workspace_id = NULL (DEFAULT).
