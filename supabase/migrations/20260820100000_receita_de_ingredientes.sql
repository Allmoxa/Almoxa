-- Receita (BOM) pra contas "comida": comprar farinha e ovo vira bolo sozinho.
--
-- products.is_ingredient marca o que é matéria-prima crua -- nunca aparece na
-- grade normal do Estoque nem pode ser vendido direto. recipe_ingredients diz
-- quanto de cada ingrediente entra em 1 unidade de um produto final (uma
-- linha por ingrediente; a receita de um produto é o conjunto de linhas com
-- aquele product_id, sem tabela "recipes" própria).
--
-- A conversão mora num gatilho, não na tela: assim funciona igual pra
-- lançamento manual e pra leitura de notinha por foto, que já convergem num
-- INSERT em movements com kind='in' de qualquer jeito.

-- ---------------------------------------------------------------------------
-- 1. products.is_ingredient
-- ---------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_ingredient BOOLEAN NOT NULL DEFAULT false;

-- Ingrediente nunca aparece pro comissionado vender direto -- ele só vê o
-- estoque através desta função (SECURITY DEFINER, passa por cima da RLS que
-- não dá linha nenhuma de products a ele).
CREATE OR REPLACE FUNCTION public.store_products()
RETURNS TABLE (id UUID, name TEXT, sku TEXT, quantity NUMERIC, sale_price NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.sku, p.quantity, p.sale_price
  FROM public.products p
  WHERE p.user_id = public.current_store_owner()
    AND NOT p.is_ingredient
  ORDER BY p.name;
$$;

REVOKE INSERT ON public.products FROM authenticated;
GRANT INSERT (user_id, name, sku, purchase_price, sale_price, notes, is_ingredient)
  ON public.products TO authenticated;

REVOKE UPDATE ON public.products FROM authenticated;
GRANT UPDATE (name, sku, purchase_price, sale_price, notes, is_ingredient)
  ON public.products TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Receita: um ingrediente + quantidade por unidade do produto final
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES public.products ON DELETE CASCADE,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, ingredient_id),
  CHECK (product_id <> ingredient_id)
);

ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;

-- Só o dono mexe em receita -- comissionado não tem acesso, igual já não tem
-- purchase_price.
DROP POLICY IF EXISTS "Dono gerencia a propria receita" ON public.recipe_ingredients;
CREATE POLICY "Dono gerencia a propria receita" ON public.recipe_ingredients
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipe_ingredients TO authenticated;

CREATE INDEX IF NOT EXISTS recipe_ingredients_product_idx
  ON public.recipe_ingredients (product_id);
CREATE INDEX IF NOT EXISTS recipe_ingredients_ingredient_idx
  ON public.recipe_ingredients (ingredient_id);

-- ---------------------------------------------------------------------------
-- 3. Novo source pro rastro da conversão automática
-- ---------------------------------------------------------------------------
ALTER TABLE public.movements DROP CONSTRAINT IF EXISTS movements_source_check;
ALTER TABLE public.movements ADD CONSTRAINT movements_source_check
  CHECK (source IN ('manual', 'photo', 'document', 'adjustment', 'reversal', 'receita'));

-- ---------------------------------------------------------------------------
-- 4. Gatilho de conversão
-- ---------------------------------------------------------------------------
-- Nome escolhido de propósito: em ordem alfabética fica depois de
-- "movements_apply_stock" (que também é AFTER INSERT), então este gatilho já
-- enxerga o products.quantity atualizado do ingrediente recém-chegado.
CREATE OR REPLACE FUNCTION public.convert_recipe_ingredients()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  finished RECORD;
  possible NUMERIC;
BEGIN
  -- Só entrada de ingrediente dispara conversão -- a própria saída de
  -- ingrediente que este gatilho gera mais abaixo (kind='out') não deve
  -- reprocessar, e nem a entrada do produto final (que não é ingrediente).
  IF NEW.kind <> 'in' THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products WHERE id = NEW.product_id AND is_ingredient
  ) THEN
    RETURN NEW;
  END IF;

  FOR finished IN
    SELECT DISTINCT ri.product_id
    FROM public.recipe_ingredients ri
    WHERE ri.ingredient_id = NEW.product_id
  LOOP
    -- FOR UPDATE trava as linhas de ingrediente desta receita antes de medir,
    -- reduzindo a janela de corrida entre compras simultâneas de
    -- ingredientes diferentes da mesma receita. Precisa ficar numa subquery
    -- própria: o Postgres não aceita FOR UPDATE na mesma consulta que agrega
    -- (MIN) — o travamento acontece ali dentro, a conta agrega por cima.
    SELECT FLOOR(MIN(locked.saldo / locked.precisa))
      INTO possible
      FROM (
        SELECT p.quantity AS saldo, ri.quantity AS precisa
        FROM public.recipe_ingredients ri
        JOIN public.products p ON p.id = ri.ingredient_id
        WHERE ri.product_id = finished.product_id
        FOR UPDATE OF p
      ) AS locked;

    IF possible IS NOT NULL AND possible >= 1 THEN
      INSERT INTO public.movements (user_id, product_id, kind, quantity, unit_price, source, note)
      SELECT NEW.user_id, ri.ingredient_id, 'out', ri.quantity * possible, 0, 'receita',
             'Consumido pela receita'
      FROM public.recipe_ingredients ri
      WHERE ri.product_id = finished.product_id;

      INSERT INTO public.movements (user_id, product_id, kind, quantity, unit_price, source, note)
      VALUES (NEW.user_id, finished.product_id, 'in', possible, 0, 'receita',
              'Gerado pela receita');
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.convert_recipe_ingredients() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS movements_convert_recipe ON public.movements;
CREATE TRIGGER movements_convert_recipe
  AFTER INSERT ON public.movements
  FOR EACH ROW EXECUTE FUNCTION public.convert_recipe_ingredients();

-- ---------------------------------------------------------------------------
-- 5. Consumo de receita nunca conta como venda de comissionado
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
      AND m.source NOT IN ('adjustment', 'reversal', 'receita')
      AND m.reversed_at IS NULL
      AND (_since IS NULL OR m.created_at >= _since)
  ) v ON TRUE
  WHERE r.role = 'comissionado'
    AND r.store_owner_id = auth.uid()
  ORDER BY u.email;
$$;

GRANT EXECUTE ON FUNCTION public.store_team(TIMESTAMPTZ) TO authenticated;
