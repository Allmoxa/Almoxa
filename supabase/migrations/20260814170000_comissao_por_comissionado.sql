-- Percentual de comissao por comissionado, definido pelo dono da loja.
--
-- A taxa e guardada em dois lugares de proposito. Em user_roles fica a vigente,
-- que o dono edita. Em movements fica a que valia no instante da venda, copiada
-- por gatilho -- mesma logica do unit_cost: mudar a comissao de alguem hoje nao
-- pode reescrever o que ele ja tem a receber do mes passado.

-- ---------------------------------------------------------------------------
-- 1. Taxa vigente
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS commission_rate NUMERIC NOT NULL DEFAULT 0;

-- Percentual, nao fracao: 5 e cinco por cento. Quem nao e comissionado fica em
-- zero, senao o numero ficaria pendurado numa linha onde nao significa nada.
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_commission_rate_check;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_commission_rate_check
  CHECK (
    commission_rate >= 0
    AND commission_rate <= 100
    AND (role = 'comissionado' OR commission_rate = 0)
  );

-- ---------------------------------------------------------------------------
-- 2. Taxa congelada na venda
-- ---------------------------------------------------------------------------
ALTER TABLE public.movements
  ADD COLUMN IF NOT EXISTS commission_rate NUMERIC NOT NULL DEFAULT 0;

-- Junto do carimbo de autoria, porque a taxa depende de quem vendeu. Estorno
-- fica em zero: ele nao gera comissao, e a venda que ele desfaz sai da conta
-- pelo reversed_at, entao somar os dois seria contar duas vezes.
CREATE OR REPLACE FUNCTION public.stamp_movement_author()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  taxa NUMERIC;
BEGIN
  NEW.created_by := COALESCE(auth.uid(), NEW.created_by, NEW.user_id);

  IF NEW.reverses_id IS NULL AND NEW.kind = 'out' THEN
    SELECT r.commission_rate INTO taxa
    FROM public.user_roles r
    WHERE r.user_id = NEW.created_by
      AND r.role = 'comissionado'
      AND r.store_owner_id = NEW.user_id;
    NEW.commission_rate := COALESCE(taxa, 0);
  ELSE
    NEW.commission_rate := 0;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_movement_author() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. O dono define a taxa
-- ---------------------------------------------------------------------------
-- Por funcao, e nao por policy de UPDATE: a RLS e por linha, e liberar UPDATE na
-- linha inteira deixaria o dono trocar tambem o papel e a loja do comissionado.
-- Aqui so a taxa se move, e so na equipe de quem chamou.
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
      AND store_owner_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este comissionado nao e da sua loja.';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_commission_rate(UUID, NUMERIC) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. A equipe e o que cada um tem a receber
-- ---------------------------------------------------------------------------
-- _since deixa a tela fechar o mes sem trazer a vida inteira do vendedor.
-- Ajuste, estorno e venda estornada ficam de fora, igual ao calculo de lucro.
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
    AND r.store_owner_id = auth.uid()
  ORDER BY u.email;
$$;

GRANT EXECUTE ON FUNCTION public.store_team(TIMESTAMPTZ) TO authenticated;

CREATE INDEX IF NOT EXISTS movements_author_sales_idx
  ON public.movements (created_by, created_at DESC) WHERE kind = 'out' AND reversed_at IS NULL;
