-- Freio por usuario nas leituras por IA (extractProducts/extractSale).
--
-- As duas funcoes de servidor exigem login (requireSupabaseAuth), mas nao
-- tinham limite nenhum -- uma conta comprometida, ou um comissionado mal-
-- intencionado, conseguia martelar chamadas contra a API do Gemini sem
-- freio algum, gastando a cota/custo da chave da loja. Mesmo padrao do
-- freio do formulario de contato: contador no banco, nao em memoria do
-- processo, porque em serverless cada instancia tem a propria memoria.

CREATE TABLE IF NOT EXISTS public.ai_read_throttle (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  hits INTEGER NOT NULL DEFAULT 0
);

-- Sem GRANT e sem policy: so a funcao abaixo (SECURITY DEFINER) encosta
-- aqui -- mesma razao do contact_throttle.
ALTER TABLE public.ai_read_throttle ENABLE ROW LEVEL SECURITY;

-- 20 leituras por hora por pessoa. Uma compra ou venda tipica usa 1-4
-- leituras (o limite de arquivos por chamada); 20/h cobre um dia de
-- movimento puxado sem abrir margem pra um script rodar sem parar.
--
-- Sem parametro de usuario: usa auth.uid() por dentro, nao um UUID que o
-- cliente manda. Se aceitasse UUID de fora, bastaria chamar passando um
-- UUID aleatorio a cada vez pra nunca gastar a propria cota -- o freio
-- precisa amarrar em quem o JWT prova que é, nao em quem a chamada afirma.
CREATE OR REPLACE FUNCTION public.consume_ai_read_quota()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  janela CONSTANT INTERVAL := '1 hour';
  teto CONSTANT INTEGER := 20;
  atual INTEGER;
  chamador UUID := auth.uid();
BEGIN
  IF chamador IS NULL THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.ai_read_throttle AS t (user_id, window_start, hits)
  VALUES (chamador, now(), 1)
  ON CONFLICT (user_id) DO UPDATE
    SET hits = CASE WHEN t.window_start < now() - janela THEN 1 ELSE t.hits + 1 END,
        window_start = CASE WHEN t.window_start < now() - janela THEN now() ELSE t.window_start END
  RETURNING t.hits INTO atual;

  RETURN atual <= teto;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_read_quota() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_read_quota() TO authenticated;

CREATE INDEX IF NOT EXISTS ai_read_throttle_window_idx ON public.ai_read_throttle (window_start);
