-- Fecha a porta que deixa o saldo divergir do historico.
--
-- products.quantity nao e um campo qualquer: e um saldo derivado, mantido pelo
-- gatilho movements_apply_stock a cada lancamento. A tela nunca escreve nele --
-- o botao de corrigir quantidade em estoque.tsx calcula a diferenca e lanca um
-- movimento de ajuste, que e o desenho certo.
--
-- O privilegio, porem, continuou aberto desde a primeira migracao: authenticated
-- recebeu UPDATE na tabela inteira, e a policy e FOR ALL. Quem falasse direto com
-- o PostgREST, sem passar pela tela, podia mandar
--
--   UPDATE products SET quantity = 999999 WHERE id = ...
--
-- e o saldo passava a nao ter relacao nenhuma com a soma dos movimentos. A trava
-- de estoque negativo vira enfeite, porque ela mora no gatilho de movements e
-- esse caminho nao encosta em movements.
--
-- Em movements o buraco e o mesmo, com um agravante: authenticated tem UPDATE e
-- DELETE, e apply_movement_to_stock() so trata INSERT e DELETE. Um UPDATE reescreve
-- quantidade, preco ou custo de um lancamento ja feito sem corrigir o saldo, e sem
-- deixar rastro. A aplicacao nunca usou nenhum dos dois: em movements ela so faz
-- INSERT e SELECT -- desfazer lancamento e o estorno, que e INSERT.
--
-- Nada disso quebra o que ja funciona:
--   - apply_movement_to_stock() e apply_movement_reversal() sao SECURITY DEFINER,
--     entao escrevem como dono da funcao, nao como authenticated;
--   - o ON DELETE CASCADE de products para movements roda pelos gatilhos internos
--     de integridade referencial, que nao consultam privilegio na tabela filha,
--     entao o botao Remover produto segue apagando o historico do produto;
--   - update_updated_at_column() mexe em NEW dentro de um BEFORE UPDATE, e a
--     checagem por coluna olha as colunas citadas no comando, nao o que o gatilho
--     altera depois.

-- ---------------------------------------------------------------------------
-- products: escrita coluna a coluna
-- ---------------------------------------------------------------------------
-- O INSERT tinha o mesmo problema por outro caminho: nada impedia cadastrar um
-- produto ja nascendo com quantity: 999999, sem lancamento nenhum por tras. As
-- duas telas que cadastram deixaram de citar a coluna, entao ela cai no DEFAULT
-- 0 e o saldo passa a subir so por movimento.
REVOKE INSERT ON public.products FROM authenticated;
GRANT INSERT (user_id, name, sku, purchase_price, sale_price, notes)
  ON public.products TO authenticated;

-- Fica de fora, alem de quantity: id e user_id (mudar dono na marra), created_at
-- e updated_at (carimbos, e o segundo tem gatilho proprio).
REVOKE UPDATE ON public.products FROM authenticated;
GRANT UPDATE (name, sku, purchase_price, sale_price, notes) ON public.products TO authenticated;

-- ---------------------------------------------------------------------------
-- movements: livro-razao so cresce
-- ---------------------------------------------------------------------------
REVOKE UPDATE, DELETE ON public.movements FROM authenticated;
