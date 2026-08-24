-- Amplia a receita (BOM) já existente: unidade de medida, protecao contra
-- referencia cruzada entre contas, ordem deterministica de producao e trava
-- de is_ingredient. Nao recria nada -- so estende o que ja existe desde
-- 20260820100000_receita_de_ingredientes.sql.

-- ---------------------------------------------------------------------------
-- 1. Unidade de medida
-- ---------------------------------------------------------------------------
-- 'unidade' e o padrao pra toda linha ja existente -- preserva o significado
-- atual de products.quantity (contagem simples) sem exigir conversao de
-- nenhum dado que ja existe. So ingrediente cadastrado dai pra frente escolhe
-- massa/volume de verdade.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'unidade';
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_unit_check;
ALTER TABLE public.products ADD CONSTRAINT products_unit_check
  CHECK (unit IN ('unidade', 'g', 'kg', 'ml', 'l'));

ALTER TABLE public.recipe_ingredients
  ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'unidade';
ALTER TABLE public.recipe_ingredients DROP CONSTRAINT IF EXISTS recipe_ingredients_unit_check;
ALTER TABLE public.recipe_ingredients ADD CONSTRAINT recipe_ingredients_unit_check
  CHECK (unit IN ('unidade', 'g', 'kg', 'ml', 'l'));

REVOKE UPDATE ON public.products FROM authenticated;
GRANT UPDATE (name, sku, purchase_price, sale_price, notes, is_ingredient, unit)
  ON public.products TO authenticated;
REVOKE INSERT ON public.products FROM authenticated;
GRANT INSERT (user_id, name, sku, purchase_price, sale_price, notes, is_ingredient, unit)
  ON public.products TO authenticated;

-- Dimensao de cada unidade -- massa e volume nunca se misturam entre si nem
-- com contagem. 'unidade' converte 1:1 (nao tem o que converter).
CREATE OR REPLACE FUNCTION public.unit_dimension(_unit TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _unit
    WHEN 'g' THEN 'massa'
    WHEN 'kg' THEN 'massa'
    WHEN 'ml' THEN 'volume'
    WHEN 'l' THEN 'volume'
    ELSE 'contagem'
  END;
$$;

REVOKE ALL ON FUNCTION public.unit_dimension(TEXT) FROM PUBLIC, anon, authenticated;

-- Unidade-base por dimensao: massa em grama, volume em mililitro, contagem
-- em unidade. products.quantity de um ingrediente sempre mora nessa base --
-- quem converte "1,5 kg" pra "1500" antes de gravar e o cliente, na hora de
-- montar o movimento (mesmo tipo de normalizacao de input que o app ja faz
-- em todo campo numerico); o gatilho de producao so precisa saber comparar
-- receita x saldo na mesma base, e e isso que esta funcao resolve.
CREATE OR REPLACE FUNCTION public.unit_to_base(_quantity NUMERIC, _unit TEXT)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _unit
    WHEN 'kg' THEN _quantity * 1000
    WHEN 'l' THEN _quantity * 1000
    ELSE _quantity
  END;
$$;

REVOKE ALL ON FUNCTION public.unit_to_base(NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Receita nunca atravessa conta, nunca aponta pro lado errado
-- ---------------------------------------------------------------------------
-- A policy de RLS confere so o user_id da PROPRIA linha de recipe_ingredients
-- -- nunca conferiu se product_id/ingredient_id de fato pertencem a esse
-- mesmo dono. Um insert forjado podia amarrar a receita de uma conta num
-- ingrediente de outra, e o gatilho de producao consumiria estoque alheio
-- pra creditar produto de quem nem e dono dele. Este gatilho fecha isso: as
-- duas pontas da receita precisam pertencer ao mesmo user_id da propria
-- linha, o alvo precisa ser produto final e o ingrediente precisa ser
-- ingrediente de verdade, e a unidade da receita precisa ser da mesma
-- dimensao que a unidade do ingrediente.
CREATE OR REPLACE FUNCTION public.validate_recipe_ingredient()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  produto RECORD;
  ingrediente RECORD;
BEGIN
  SELECT id, user_id, is_ingredient INTO produto
  FROM public.products WHERE id = NEW.product_id;
  IF produto IS NULL OR produto.user_id <> NEW.user_id THEN
    RAISE EXCEPTION 'Produto da receita não pertence a esta conta.';
  END IF;
  IF produto.is_ingredient THEN
    RAISE EXCEPTION 'Um ingrediente não pode ter receita própria -- ele é sempre matéria-prima.';
  END IF;

  SELECT id, user_id, is_ingredient, unit INTO ingrediente
  FROM public.products WHERE id = NEW.ingredient_id;
  IF ingrediente IS NULL OR ingrediente.user_id <> NEW.user_id THEN
    RAISE EXCEPTION 'Ingrediente não pertence a esta conta.';
  END IF;
  IF NOT ingrediente.is_ingredient THEN
    RAISE EXCEPTION 'Este item não está marcado como ingrediente.';
  END IF;

  IF public.unit_dimension(NEW.unit) <> public.unit_dimension(ingrediente.unit) THEN
    RAISE EXCEPTION 'Unidade incompatível: % é % e o ingrediente usa %.',
      NEW.unit, public.unit_dimension(NEW.unit), ingrediente.unit;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_recipe_ingredient() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS recipe_ingredients_validate ON public.recipe_ingredients;
CREATE TRIGGER recipe_ingredients_validate
  BEFORE INSERT OR UPDATE ON public.recipe_ingredients
  FOR EACH ROW EXECUTE FUNCTION public.validate_recipe_ingredient();

-- A policy em si passa a acompanhar a loja adentrada pelo onisciente (mesmo
-- padrao de products/movements desde 20260814190000) -- antes, um onisciente
-- dentro da loja de um cliente "comida" nao conseguia mexer na receita dela,
-- porque a policy comparava com o proprio auth.uid() dele, nao com a loja.
DROP POLICY IF EXISTS "Dono gerencia a propria receita" ON public.recipe_ingredients;
CREATE POLICY "Dono gerencia a propria receita" ON public.recipe_ingredients
  FOR ALL TO authenticated
  USING (user_id = public.operating_store())
  WITH CHECK (user_id = public.operating_store());

-- ---------------------------------------------------------------------------
-- 3. Trava de is_ingredient nos dois sentidos
-- ---------------------------------------------------------------------------
-- Sem isso, desmarcar um ingrediente em uso deixava a receita apontando pro
-- nada (o gatilho de producao simplesmente parava de reagir, sem avisar
-- ninguem), e marcar um produto final com receita propria como ingrediente
-- abria caminho pra receita em cadeia (A vira ingrediente de B, que e
-- ingrediente de C...) -- que este desenho nunca foi pensado pra suportar.
CREATE OR REPLACE FUNCTION public.guard_is_ingredient_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  usado_em TEXT;
BEGIN
  IF NEW.is_ingredient = OLD.is_ingredient THEN
    RETURN NEW;
  END IF;

  IF OLD.is_ingredient AND NOT NEW.is_ingredient THEN
    SELECT string_agg(DISTINCT p.name, ', ')
      INTO usado_em
      FROM public.recipe_ingredients ri
      JOIN public.products p ON p.id = ri.product_id
      WHERE ri.ingredient_id = OLD.id;
    IF usado_em IS NOT NULL THEN
      RAISE EXCEPTION 'Este ingrediente é usado na receita de: %. Remova-o dessas receitas antes de desmarcar.', usado_em;
    END IF;
  END IF;

  IF NOT OLD.is_ingredient AND NEW.is_ingredient THEN
    IF EXISTS (SELECT 1 FROM public.recipe_ingredients WHERE product_id = OLD.id) THEN
      RAISE EXCEPTION 'Este produto tem receita própria e não pode virar ingrediente.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_is_ingredient_flag() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS products_guard_is_ingredient ON public.products;
CREATE TRIGGER products_guard_is_ingredient
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.guard_is_ingredient_flag();

-- A trava acima cobre desmarcar is_ingredient, mas não cobre EXCLUIR o
-- produto ingrediente direto -- recipe_ingredients.ingredient_id tem ON
-- DELETE CASCADE desde a migration anterior, então apagar o ingrediente
-- apagava a receita junto, em silêncio, sem avisar em quais produtos ele
-- era usado.
CREATE OR REPLACE FUNCTION public.guard_ingredient_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  usado_em TEXT;
BEGIN
  IF NOT OLD.is_ingredient THEN
    RETURN OLD;
  END IF;

  SELECT string_agg(DISTINCT p.name, ', ')
    INTO usado_em
    FROM public.recipe_ingredients ri
    JOIN public.products p ON p.id = ri.product_id
    WHERE ri.ingredient_id = OLD.id;
  IF usado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Este ingrediente é usado na receita de: %. Remova-o dessas receitas antes de excluir.', usado_em;
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_ingredient_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS products_guard_ingredient_delete ON public.products;
CREATE TRIGGER products_guard_ingredient_delete
  BEFORE DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.guard_ingredient_delete();

-- ---------------------------------------------------------------------------
-- 3b. Salvar receita inteira numa transação só
-- ---------------------------------------------------------------------------
-- O cliente fazia DELETE de todas as linhas e depois INSERT das atuais como
-- duas chamadas separadas -- se o INSERT falhasse (ex: trigger
-- recipe_ingredients_validate barrando por unidade incompatível), a receita
-- ficava vazia no banco, sem aviso, com o INSERT parcial ou nenhum. Uma
-- função só junta as duas operações na mesma transação: se o INSERT falhar,
-- o DELETE desfaz junto, e a receita anterior continua de pé.
CREATE OR REPLACE FUNCTION public.save_recipe(_product_id UUID, _rows JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID := public.operating_store();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.products WHERE id = _product_id AND user_id = _user_id
  ) THEN
    RAISE EXCEPTION 'Produto não encontrado nesta conta.';
  END IF;

  DELETE FROM public.recipe_ingredients WHERE product_id = _product_id;

  INSERT INTO public.recipe_ingredients (user_id, product_id, ingredient_id, quantity, unit)
  SELECT
    _user_id,
    _product_id,
    (row->>'ingredient_id')::UUID,
    (row->>'quantity')::NUMERIC,
    row->>'unit'
  FROM jsonb_array_elements(_rows) AS row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_recipe(UUID, JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Gatilho de conversao: unidade-base + ordem deterministica + lote
-- ---------------------------------------------------------------------------
ALTER TABLE public.movements
  ADD COLUMN IF NOT EXISTS production_batch_id UUID;

-- Aponta pro movimento de ENTRADA DE INGREDIENTE que disparou esta produção
-- (as duas pernas geradas, consumo e produto pronto, levam o id do movimento
-- que o cliente de fato inseriu). production_batch_id já agrupa consumo+
-- produto de uma mesma rodada; isto aqui deixa o cliente achar exatamente
-- quais linhas de "receita" nasceram de UMA entrada específica, sem depender
-- de janela de tempo (relógio do navegador diverge do servidor, e duas abas
-- recebendo ao mesmo tempo poderiam se misturar num filtro por created_at).
ALTER TABLE public.movements
  ADD COLUMN IF NOT EXISTS triggered_by_movement_id UUID REFERENCES public.movements(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.convert_recipe_ingredients()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  finished RECORD;
  possible NUMERIC;
  lote UUID;
BEGIN
  IF NEW.kind <> 'in' THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products WHERE id = NEW.product_id AND is_ingredient
  ) THEN
    RETURN NEW;
  END IF;

  -- Ordem deterministica quando mais de uma receita disputa o mesmo
  -- ingrediente: nao existe prioridade configuravel ainda, entao a regra
  -- documentada e "quem tem a linha de receita mais antiga primeiro" --
  -- estavel e previsivel, sem inventar otimizacao de particao de estoque
  -- entre receitas que ninguem pediu.
  FOR finished IN
    SELECT ri.product_id, MIN(ri.created_at) AS receita_desde
    FROM public.recipe_ingredients ri
    WHERE ri.ingredient_id = NEW.product_id
    GROUP BY ri.product_id
    ORDER BY MIN(ri.created_at), ri.product_id
  LOOP
    SELECT FLOOR(MIN(locked.saldo / locked.precisa))
      INTO possible
      FROM (
        SELECT p.quantity AS saldo, public.unit_to_base(ri.quantity, ri.unit) AS precisa
        FROM public.recipe_ingredients ri
        JOIN public.products p ON p.id = ri.ingredient_id
        WHERE ri.product_id = finished.product_id
        FOR UPDATE OF p
      ) AS locked;

    IF possible IS NOT NULL AND possible >= 1 THEN
      lote := gen_random_uuid();

      INSERT INTO public.movements
        (user_id, product_id, kind, quantity, unit_price, source, note,
         production_batch_id, triggered_by_movement_id)
      SELECT NEW.user_id, ri.ingredient_id, 'out', public.unit_to_base(ri.quantity, ri.unit) * possible,
             0, 'receita', 'Consumido pela receita', lote, NEW.id
      FROM public.recipe_ingredients ri
      WHERE ri.product_id = finished.product_id;

      INSERT INTO public.movements
        (user_id, product_id, kind, quantity, unit_price, source, note,
         production_batch_id, triggered_by_movement_id)
      VALUES (NEW.user_id, finished.product_id, 'in', possible, 0, 'receita',
              'Gerado pela receita', lote, NEW.id);
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
-- 5. Trava de troca de dimensao da unidade
-- ---------------------------------------------------------------------------
-- products.unit podia ser trocado por UPDATE sem nenhuma trava. Trocar
-- dentro da MESMA dimensao (kg <-> g, ml <-> l) e sempre seguro -- so muda
-- como o saldo e exibido/digitado, o numero guardado em quantity continua
-- significando a mesma coisa. Trocar de DIMENSAO (massa -> volume, ou
-- qualquer uma -> contagem) com saldo diferente de zero, ou enquanto o
-- produto e ingrediente de alguma receita, reinterpretaria em silencio o que
-- ja esta guardado -- 500 (gramas) viraria 500 (mililitros) ou 500
-- (unidades) sem converter nada, e a comparacao saldo x receita do gatilho
-- de producao passaria a comparar bases incompativeis.
CREATE OR REPLACE FUNCTION public.guard_unit_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.unit_dimension(NEW.unit) = public.unit_dimension(OLD.unit) THEN
    RETURN NEW;
  END IF;

  IF OLD.quantity <> 0 THEN
    RAISE EXCEPTION 'Não é possível trocar a unidade de "%" com estoque diferente de zero (% no momento). Zere o saldo antes de mudar de % para %.',
      OLD.name, OLD.quantity, OLD.unit, NEW.unit;
  END IF;

  IF EXISTS (SELECT 1 FROM public.recipe_ingredients WHERE ingredient_id = OLD.id) THEN
    RAISE EXCEPTION 'Não é possível trocar a unidade de "%" pois ele é usado em alguma receita.', OLD.name;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_unit_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS products_guard_unit_change ON public.products;
CREATE TRIGGER products_guard_unit_change
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.guard_unit_change();
