-- PRITIO - Mi día: marca una tarea para el día de hoy
-- Migration 20260914: my_day_date guarda la fecha local (YYYY-MM-DD) en la que
-- se agregó la tarea a "Mi día". La vista de Mi día muestra solo las que
-- coinciden con hoy, así el día se limpia solo cada 24 horas sin necesidad de
-- un job de limpieza.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS my_day_date DATE;

CREATE INDEX IF NOT EXISTS idx_tasks_my_day_date ON tasks(my_day_date);