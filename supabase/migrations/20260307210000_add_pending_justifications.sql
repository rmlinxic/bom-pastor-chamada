-- Tabela de justificativas pendentes
-- Pai envia antes da chamada ser registrada;
-- quando o catequista salvar a chamada e marcar falta, a justificativa é aplicada automaticamente.

CREATE TABLE IF NOT EXISTS public.pending_justifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(student_id, date) -- um buffer por aluno por dia
);

ALTER TABLE public.pending_justifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view pending_justifications"
  ON public.pending_justifications FOR SELECT USING (true);
CREATE POLICY "Anyone can insert pending_justifications"
  ON public.pending_justifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update pending_justifications"
  ON public.pending_justifications FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete pending_justifications"
  ON public.pending_justifications FOR DELETE USING (true);
