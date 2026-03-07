-- Fix attendance.status CHECK constraint to accept Portuguese values
-- The first migration created CHECK (status IN ('present', 'justified_absence', 'unjustified_absence'))
-- The second migration updated existing data to Portuguese values but did NOT update the constraint
-- This migration fixes the constraint so new inserts/updates work correctly

ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_status_check;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_status_check
  CHECK (status IN ('presente', 'falta_justificada', 'falta_nao_justificada'));

-- Fix index on class_name (old index was on students.class which was renamed to class_name)
DROP INDEX IF EXISTS idx_students_class;
CREATE INDEX IF NOT EXISTS idx_students_class_name ON public.students(class_name);
