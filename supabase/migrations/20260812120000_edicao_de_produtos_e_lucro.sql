-- Ajuste manual de estoque não é venda: entra com source 'adjustment' e fica de
-- fora do cálculo de lucro, mas continua aparecendo no histórico.
ALTER TABLE public.movements DROP CONSTRAINT IF EXISTS movements_source_check;
ALTER TABLE public.movements ADD CONSTRAINT movements_source_check
  CHECK (source IN ('manual', 'photo', 'document', 'adjustment'));

-- Custo unitário congelado no momento do lançamento. Sem isso, editar o preço de
-- compra reescreveria o lucro de todas as vendas passadas.
ALTER TABLE public.movements ADD COLUMN IF NOT EXISTS unit_cost NUMERIC NOT NULL DEFAULT 0;

UPDATE public.movements m
  SET unit_cost = CASE WHEN m.kind = 'in' THEN m.unit_price ELSE p.purchase_price END
  FROM public.products p
  WHERE p.id = m.product_id AND m.unit_cost = 0;

-- Preenche o custo automaticamente, para que as telas de receber (foto/nota) e
-- qualquer inserção futura não precisem se lembrar disso.
CREATE OR REPLACE FUNCTION public.fill_movement_unit_cost()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.unit_cost, 0) = 0 THEN
    IF NEW.kind = 'in' THEN
      NEW.unit_cost := NEW.unit_price;
    ELSE
      SELECT p.purchase_price INTO NEW.unit_cost FROM public.products p WHERE p.id = NEW.product_id;
    END IF;
  END IF;
  NEW.unit_cost := COALESCE(NEW.unit_cost, 0);
  RETURN NEW;
END;
$$;

CREATE TRIGGER movements_fill_unit_cost
  BEFORE INSERT ON public.movements
  FOR EACH ROW EXECUTE FUNCTION public.fill_movement_unit_cost();

REVOKE ALL ON FUNCTION public.fill_movement_unit_cost() FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS movements_user_kind_created_idx
  ON public.movements (user_id, kind, created_at DESC);
