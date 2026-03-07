
-- Rename columns to match spec
ALTER TABLE public.students RENAME COLUMN "class" TO class_name;
ALTER TABLE public.students RENAME COLUMN guardian_name TO parent_name;
ALTER TABLE public.students RENAME COLUMN guardian_contact TO phone;

-- Drop justification_reason column (will store reason differently)
-- Actually keep it for the justification portal

-- Update existing status values to new enum names
UPDATE public.attendance SET status = 'presente' WHERE status = 'present';
UPDATE public.attendance SET status = 'falta_justificada' WHERE status = 'justified_absence';
UPDATE public.attendance SET status = 'falta_nao_justificada' WHERE status = 'unjustified_absence';
