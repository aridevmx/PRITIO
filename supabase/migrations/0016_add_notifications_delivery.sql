-- 0016: Notificaciones in-app.
--  - delivery: cómo se presenta en la app (toast efímero, campana persistente o ambos).
--  - Asegura que la tabla esté en la publicación realtime para que la campana y los toasts
--    se actualicen en vivo (la publicación supabase_realtime ya existe por defecto).

ALTER TABLE notifications
  ADD COLUMN delivery TEXT NOT NULL DEFAULT 'bell';

ALTER TABLE notifications
  ADD CONSTRAINT notifications_delivery_check
  CHECK (delivery IN ('toast', 'bell', 'both'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;
