-- O onisciente adentra uma loja e passa a operar como se fosse dela.
--
-- A alternativa seria emitir token em nome do outro usuario -- impersonation de
-- verdade. Nao vale o risco: token emitido nao se distingue de login legitimo
-- no log, e um bug ali vira acesso indevido permanente. Aqui a identidade nunca
-- muda: auth.uid() continua sendo o onisciente, e o que muda e de qual loja ele
-- tem poder de dono. Toda acao segue registrada no nome dele em created_by.
--
-- O contexto mora em tabela, e nao no cliente, porque quem precisa dele sao as
-- policies de RLS. Com isso nenhuma tela precisa mudar consulta: estoque,
-- comprar, receber, dashboard e movimentacoes passam a enxergar a loja adentrada
-- sozinhos, porque a RLS que os limita passou a olhar o contexto.

CREATE TABLE IF NOT EXISTS public.onisciente_context (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  store_owner_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.onisciente_context TO authenticated;
ALTER TABLE public.onisciente_context ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cada um le o proprio contexto" ON public.onisciente_context;
CREATE POLICY "Cada um le o proprio contexto" ON public.onisciente_context
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Escrita so pelas funcoes abaixo: sem policy de INSERT/UPDATE, um cliente
-- adulterado nao consegue se colocar dentro de uma loja por conta propria.

-- ---------------------------------------------------------------------------
-- De qual loja sai a mercadoria
-- ---------------------------------------------------------------------------
-- Comissionado vem primeiro: ele nunca adentra nada, a loja dele e fixa.
CREATE OR REPLACE FUNCTION public.current_store_owner()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT store_owner_id FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'comissionado' LIMIT 1),
    (SELECT store_owner_id FROM public.onisciente_context WHERE user_id = auth.uid()),
    auth.uid()
  );
$$;

-- Em qual loja a pessoa tem poder de dono. NULL para o comissionado: ele vende,
-- mas nao mexe em cadastro, nem enxerga custo. Comparar com NULL da NULL, e a
-- policy nega -- e por isso que ele continua sem alcancar products.
CREATE OR REPLACE FUNCTION public.operating_store()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.has_role(auth.uid(), 'comissionado') THEN NULL
    ELSE public.current_store_owner()
  END;
$$;

-- ---------------------------------------------------------------------------
-- Adentrar e sair
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enter_store(_store_owner_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_onisciente() THEN
    RAISE EXCEPTION 'So o onisciente pode adentrar uma loja.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _store_owner_id AND role IN ('admin', 'onisciente')
  ) THEN
    RAISE EXCEPTION 'Esta conta nao e dona de estoque.';
  END IF;

  INSERT INTO public.onisciente_context (user_id, store_owner_id)
  VALUES (auth.uid(), _store_owner_id)
  ON CONFLICT (user_id) DO UPDATE
    SET store_owner_id = EXCLUDED.store_owner_id, updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.enter_store(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.leave_store()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.onisciente_context WHERE user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.leave_store() TO authenticated;

-- Onde a pessoa esta agora, com o e-mail para a tarja da tela.
--
-- Devolve current_store_owner(), e nao operating_store(), porque quem consome
-- isto sao os INSERTs: o comissionado tambem precisa saber em qual estoque a
-- venda dele cai, e para ele operating_store() e NULL de proposito.
--
-- 'entered' olha a tabela de contexto em vez de comparar com auth.uid(): para o
-- comissionado a loja nunca e a propria, e ele nao adentrou nada -- a tarja de
-- "voce esta dentro de outra conta" nao e assunto dele.
CREATE OR REPLACE FUNCTION public.current_context()
RETURNS TABLE (store_owner_id UUID, store_email TEXT, entered BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    s.id,
    u.email::text,
    EXISTS (SELECT 1 FROM public.onisciente_context c WHERE c.user_id = auth.uid())
  FROM (SELECT public.current_store_owner() AS id) s
  LEFT JOIN auth.users u ON u.id = s.id;
$$;

GRANT EXECUTE ON FUNCTION public.current_context() TO authenticated;

-- ---------------------------------------------------------------------------
-- As policies passam a olhar o contexto
-- ---------------------------------------------------------------------------
-- Trocadas, e nao somadas: policies permissivas se unem por OR, entao deixar a
-- antiga viva misturaria o estoque proprio do onisciente com o da loja em que
-- ele entrou -- as duas listas na mesma tela, sem como separar.
DROP POLICY IF EXISTS "Users manage own products" ON public.products;
CREATE POLICY "Dono opera o estoque da loja" ON public.products FOR ALL TO authenticated
  USING (user_id = public.operating_store())
  WITH CHECK (user_id = public.operating_store());

DROP POLICY IF EXISTS "Users manage own movements" ON public.movements;
CREATE POLICY "Dono opera os lancamentos da loja" ON public.movements FOR ALL TO authenticated
  USING (user_id = public.operating_store())
  WITH CHECK (user_id = public.operating_store());

-- ---------------------------------------------------------------------------
-- Equipe e comissao seguem a loja adentrada
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Dono le a propria equipe" ON public.user_roles;
CREATE POLICY "Dono le a equipe da loja" ON public.user_roles FOR SELECT TO authenticated
  USING (store_owner_id = public.operating_store());

CREATE OR REPLACE FUNCTION public.set_commission_rate(_member_id UUID, _rate NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _rate IS NULL OR _rate < 0 OR _rate > 100 THEN
    RAISE EXCEPTION 'A comissao precisa ficar entre 0 e 100 por cento.';
  END IF;

  UPDATE public.user_roles
    SET commission_rate = _rate
    WHERE user_id = _member_id
      AND role = 'comissionado'
      AND store_owner_id = public.operating_store();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este comissionado nao e da loja em que voce esta.';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_commission_rate(UUID, NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.store_team(_since TIMESTAMPTZ DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  email TEXT,
  commission_rate NUMERIC,
  sold_total NUMERIC,
  commission_total NUMERIC,
  sales_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    u.id,
    u.email::text,
    r.commission_rate,
    COALESCE(v.sold, 0),
    COALESCE(v.comissao, 0),
    COALESCE(v.qtd, 0)
  FROM public.user_roles r
  JOIN auth.users u ON u.id = r.user_id
  LEFT JOIN LATERAL (
    SELECT
      SUM(m.quantity * m.unit_price) AS sold,
      SUM(m.quantity * m.unit_price * m.commission_rate / 100) AS comissao,
      COUNT(*) AS qtd
    FROM public.movements m
    WHERE m.created_by = r.user_id
      AND m.user_id = r.store_owner_id
      AND m.kind = 'out'
      AND m.source NOT IN ('adjustment', 'reversal')
      AND m.reversed_at IS NULL
      AND (_since IS NULL OR m.created_at >= _since)
  ) v ON TRUE
  WHERE r.role = 'comissionado'
    AND r.store_owner_id = public.operating_store()
  ORDER BY u.email;
$$;

GRANT EXECUTE ON FUNCTION public.store_team(TIMESTAMPTZ) TO authenticated;

CREATE OR REPLACE FUNCTION public.store_members()
RETURNS TABLE (id UUID, email TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.id, u.email::text
  FROM auth.users u
  WHERE u.id = auth.uid()
     OR u.id = public.operating_store()
     OR u.id IN (
       SELECT r.user_id FROM public.user_roles r
       WHERE r.store_owner_id = public.operating_store()
     );
$$;

GRANT EXECUTE ON FUNCTION public.store_members() TO authenticated;
