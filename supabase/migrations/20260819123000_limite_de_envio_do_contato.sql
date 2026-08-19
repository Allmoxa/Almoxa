-- Freio no formulario "Fale conosco".
--
-- sendContactMessage e a unica funcao de servidor sem autenticacao nenhuma, e
-- cada chamada dispara um e-mail pelo Resend. O honeypot barra bot ingenuo, mas
-- quem abre o HTML ve o campo escondido e simplesmente nao o preenche. Sem
-- freio, um laco de shell esgota a cota do Resend (100/dia no plano gratis),
-- derruba o canal de contato e enche a caixa de entrada do dono -- tudo isso
-- sem login e sem custo nenhum para quem ataca.
--
-- O contador mora no banco, e nao em memoria do processo, porque em serverless
-- cada instancia tem a propria memoria: um teto local nao segura quem distribui
-- as chamadas entre instancias.

CREATE TABLE IF NOT EXISTS public.contact_throttle (
  ip TEXT PRIMARY KEY,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  hits INTEGER NOT NULL DEFAULT 0
);

-- Sem GRANT e sem policy: so o service_role, que nao passa por RLS, encosta
-- aqui. O visitante nao precisa ler nem escrever nada disso.
ALTER TABLE public.contact_throttle ENABLE ROW LEVEL SECURITY;

-- Uma chamada consome uma unidade e ja diz se passou do teto. O ON CONFLICT
-- pega lock na linha do IP, entao duas requisicoes simultaneas do mesmo IP
-- contam duas vezes -- decidir fora do banco deixaria a janela entre ler e
-- gravar aberta, que e exatamente o que um flood explora.
CREATE OR REPLACE FUNCTION public.consume_contact_quota(_ip TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  janela CONSTANT INTERVAL := '1 hour';
  teto CONSTANT INTEGER := 5;
  atual INTEGER;
BEGIN
  INSERT INTO public.contact_throttle AS t (ip, window_start, hits)
  VALUES (_ip, now(), 1)
  ON CONFLICT (ip) DO UPDATE
    SET hits = CASE WHEN t.window_start < now() - janela THEN 1 ELSE t.hits + 1 END,
        window_start = CASE WHEN t.window_start < now() - janela THEN now() ELSE t.window_start END
  RETURNING t.hits INTO atual;

  RETURN atual <= teto;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_contact_quota(TEXT) FROM PUBLIC, anon, authenticated;

-- A tabela cresce com IPs distintos. Nao ha cron aqui: para limpar as janelas
-- vencidas, DELETE FROM contact_throttle WHERE window_start < now() - INTERVAL '1 day'.
CREATE INDEX IF NOT EXISTS contact_throttle_window_idx ON public.contact_throttle (window_start);
