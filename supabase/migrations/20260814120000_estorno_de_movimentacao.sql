-- Estorno de lançamento.
--
-- Ate aqui a unica forma de desfazer uma venda lancada errado era apagar o
-- produto inteiro -- o CASCADE levava junto todo o historico dele. Estornar e
-- outra coisa: o lancamento errado continua no livro e ganha um lancamento de
-- sinal contrario ao lado, do jeito que se faz em caixa. Quem abrir as
-- movimentacoes amanha ve que houve a venda e ve que ela foi desfeita.
--
-- Por isso nao ha DELETE aqui. O estorno e um INSERT, e passa pelas mesmas
-- travas de qualquer outro movimento -- inclusive a de estoque negativo, que e
-- justamente o que impede estornar uma entrada cuja mercadoria ja foi vendida.
ALTER TABLE public.movements DROP CONSTRAINT IF EXISTS movements_source_check;
ALTER TABLE public.movements ADD CONSTRAINT movements_source_check
  CHECK (source IN ('manual', 'photo', 'document', 'adjustment', 'reversal'));

-- reverses_id vive na linha do estorno e aponta para o lancamento desfeito;
-- reversed_at vive na linha do original. A segunda e redundante em teoria, mas
-- evita um self-join em toda consulta de lucro, que precisa justamente pular as
-- vendas ja estornadas.
ALTER TABLE public.movements
  ADD COLUMN IF NOT EXISTS reverses_id UUID REFERENCES public.movements(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMP WITH TIME ZONE;

-- Um lancamento so pode ser estornado uma vez. O indice e a garantia real; a
-- checagem no gatilho existe para a mensagem sair em portugues de balcao.
CREATE UNIQUE INDEX IF NOT EXISTS movements_reverses_unique
  ON public.movements (reverses_id) WHERE reverses_id IS NOT NULL;

-- O custo do estorno e o custo do lancamento original, copiado pelo gatilho
-- abaixo. Sem esta saida antecipada, o preenchimento automatico veria unit_cost
-- zerado (caso de ajuste sem preco) e o trocaria pelo preco de compra de hoje,
-- fazendo o estorno nao bater com o que ele desfaz.
CREATE OR REPLACE FUNCTION public.fill_movement_unit_cost()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.reverses_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

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

-- Produto, tipo, quantidade e valores do estorno saem todos do lancamento
-- original -- a tela nao decide nada disso. Assim um cliente adulterado nao
-- consegue devolver ao estoque uma quantidade diferente da que saiu.
CREATE OR REPLACE FUNCTION public.apply_movement_reversal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  origem public.movements%ROWTYPE;
BEGIN
  IF NEW.reverses_id IS NULL THEN
    IF NEW.source = 'reversal' THEN
      RAISE EXCEPTION 'Estorno sem lancamento de origem.';
    END IF;
    RETURN NEW;
  END IF;

  -- FOR UPDATE serializa dois estornos simultaneos do mesmo lancamento: o
  -- segundo espera o primeiro e so entao le reversed_at ja preenchido.
  SELECT * INTO origem FROM public.movements WHERE id = NEW.reverses_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lancamento nao encontrado.';
  END IF;

  -- SECURITY DEFINER nao passa por RLS: sem esta linha, o id de um lancamento de
  -- outra conta seria aceito aqui. A mensagem e a mesma do caso acima de
  -- proposito -- nao ha por que revelar que o lancamento existe.
  IF origem.user_id <> NEW.user_id THEN
    RAISE EXCEPTION 'Lancamento nao encontrado.';
  END IF;

  IF origem.source = 'reversal' THEN
    RAISE EXCEPTION 'Um estorno nao pode ser estornado.';
  END IF;

  IF origem.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Este lancamento ja foi estornado.';
  END IF;

  NEW.source := 'reversal';
  NEW.product_id := origem.product_id;
  NEW.kind := CASE WHEN origem.kind = 'in' THEN 'out' ELSE 'in' END;
  NEW.quantity := origem.quantity;
  NEW.unit_price := origem.unit_price;
  NEW.unit_cost := origem.unit_cost;

  UPDATE public.movements SET reversed_at = now() WHERE id = origem.id;

  RETURN NEW;
END;
$$;

-- Gatilhos BEFORE disparam em ordem alfabetica de nome: 'movements_apply_reversal'
-- vem antes de 'movements_fill_unit_cost', entao o custo copiado do original ja
-- esta em NEW quando o preenchimento automatico roda (e sai pela saida
-- antecipada acima).
DROP TRIGGER IF EXISTS movements_apply_reversal ON public.movements;
CREATE TRIGGER movements_apply_reversal
  BEFORE INSERT ON public.movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_movement_reversal();

REVOKE ALL ON FUNCTION public.apply_movement_reversal() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fill_movement_unit_cost() FROM PUBLIC, anon, authenticated;

-- As telas de lucro filtram por "saida que nao foi estornada"; sem isto a
-- varredura le a tabela inteira a cada carregamento do estoque.
CREATE INDEX IF NOT EXISTS movements_user_kind_reversed_idx
  ON public.movements (user_id, kind, created_at DESC) WHERE reversed_at IS NULL;
