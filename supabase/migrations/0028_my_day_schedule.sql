-- Add Mi Día schedule columns to workspaces table
ALTER TABLE workspaces 
ADD COLUMN my_day_start_time TIME WITHOUT TIME ZONE DEFAULT '06:00',
ADD COLUMN my_day_reset_time TIME WITHOUT TIME ZONE DEFAULT '00:00',
ADD COLUMN my_day_timezone TEXT DEFAULT 'America/Mexico_City';

-- Add comment for documentation
COMMENT ON COLUMN workspaces.my_day_start_time IS 'Start of day for Mi día suggestions (local time)';
COMMENT ON COLUMN workspaces.my_day_reset_time IS 'Time when Mi día tasks are cleared (local time)';
COMMENT ON COLUMN workspaces.my_day_timezone IS 'Timezone for Mi día schedule calculations';