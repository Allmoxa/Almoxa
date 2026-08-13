-- Ate aqui a unica barreira contra vender mais do que ha em estoque era a tela:
-- estoque.tsx, vender.tsx e sale-builder-dialog.tsx conferem a quantidade antes
-- de inserir o movimento. Duas abas ou dois celulares vendendo o mesmo produto
-- leem o mesmo saldo, os dois passam na conferencia e o estoque fica negativo.
--
-- A trava real vai no trigger: o UPDATE abaixo pega lock na linha do produto, de
-- modo que a segunda transacao espera a primeira e so entao le a quantidade ja
-- decrementada. Com RETURNING, decisao e escrita acontecem no mesmo comando --
-- nao ha janela entre conferir e gravar.
--
-- So o INSERT e guardado. O DELETE existe para desfazer movimento, e hoje ele so
-- roda pelo ON DELETE CASCADE de products: apagar um produto apaga os movimentos
-- dele um a um, e a reversao passa por saldos intermediarios negativos conforme a
-- ordem em que as linhas caem. Barrar negativo ali quebraria o botao Remover.
CREATE OR REPLACE FUNCTION public.apply_movement_to_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  saldo NUMERIC;
  produto TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.products
      SET quantity = quantity + CASE WHEN NEW.kind = 'in' THEN NEW.quantity ELSE -NEW.quantity END
      WHERE id = NEW.product_id
      RETURNING quantity, name INTO saldo, produto;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto nao encontrado no estoque.';
    END IF;

    -- Mensagem em linguagem de balcao: ela chega crua no toast da tela.
    IF saldo < 0 THEN
      RAISE EXCEPTION 'Estoque insuficiente de %: ha % un. e a saida seria de % un.',
        produto, (saldo + NEW.quantity)::float8, NEW.quantity::float8;
    END IF;

    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.products
      SET quantity = quantity - CASE WHEN OLD.kind = 'in' THEN OLD.quantity ELSE -OLD.quantity END
      WHERE id = OLD.product_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_movement_to_stock() FROM PUBLIC, anon, authenticated;
