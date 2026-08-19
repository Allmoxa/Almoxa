-- Quem vendeu nem sempre é quem apertou o botão: o dono pode lançar uma
-- venda no balcão em nome de um comissionado específico. created_by continua
-- sendo "quem logou" (carimbado pelo banco, intocável pela tela); sold_by é
-- "quem recebe o crédito da venda" -- pode ser escolhido na tela, mas só
-- entre o próprio dono e a equipe dele, validado aqui dentro.

-- ---------------------------------------------------------------------------
-- 1. Coluna nova
-- ---------------------------------------------------------------------------
ALTER TABLE public.movements
  ADD COLUMN IF NOT EXISTS sold_by UUID REFERENCES auth.users ON DELETE SET NULL;

UPDATE public.movements SET sold_by = created_by WHERE sold_by IS NULL;

CREATE INDEX IF NOT EXISTS movements_sold_by_idx ON public.movements (sold_by);

-- ---------------------------------------------------------------------------
-- 2. Gatilho: valida sold_by e passa a basear a comissão nele
-- ---------------------------------------------------------------------------
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

  -- Sem valor vindo da tela: crédito vai pra quem logou, como sempre foi.
  -- Com valor: só aceita se for o próprio dono da loja ou um comissionado
  -- dela -- qualquer outra coisa (bug ou tentativa de burlar) cai de volta
  -- pra created_by, sem erro pro usuário.
  IF NEW.sold_by IS NULL THEN
    NEW.sold_by := NEW.created_by;
  ELSIF NEW.sold_by <> NEW.user_id AND NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = NEW.sold_by
      AND role = 'comissionado'
      AND store_owner_id = NEW.user_id
  ) THEN
    NEW.sold_by := NEW.created_by;
  END IF;

  IF NEW.reverses_id IS NULL AND NEW.kind = 'out' THEN
    SELECT r.commission_rate INTO taxa
    FROM public.user_roles r
    WHERE r.user_id = NEW.sold_by
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
-- 3. Comissão e histórico passam a olhar sold_by primeiro
-- ---------------------------------------------------------------------------
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
    WHERE COALESCE(m.sold_by, m.created_by) = r.user_id
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
