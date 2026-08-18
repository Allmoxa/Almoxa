-- Tres papeis: onisciente, admin, comissionado.
--
-- Ate aqui cada conta era uma ilha: products.user_id e movements.user_id
-- guardavam o dono, e a RLS comparava com auth.uid(). O comissionado quebra
-- isso -- ele vende o estoque de outra pessoa. Entao movements.user_id passa a
-- significar so "de quem e o estoque", e quem lancou vira uma coluna propria.
--
-- O comissionado nao pode ver preco de compra nem lucro. Isso nao da para
-- resolver escondendo coluna na tela: RLS e por linha, nao por coluna, e GRANT
-- por coluna nao distingue duas pessoas que sao ambas 'authenticated'. A saida e
-- ele nao ter linha nenhuma de products pela RLS, e enxergar o estoque so por
-- store_products(), que devolve apenas as quatro colunas liberadas.

-- ---------------------------------------------------------------------------
-- 1. Enum de papeis
-- ---------------------------------------------------------------------------
-- ALTER TYPE ... ADD VALUE nao pode ser usado na mesma transacao em que e
-- criado, e o editor de SQL do Supabase manda o script inteiro numa transacao
-- so. Por isso o enum e recriado do zero, e nao remendado.
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users read own roles" ON public.user_roles;
DROP FUNCTION IF EXISTS public.is_admin();
DROP FUNCTION IF EXISTS public.has_role(UUID, public.app_role);

ALTER TYPE public.app_role RENAME TO app_role_legado;
CREATE TYPE public.app_role AS ENUM ('onisciente', 'admin', 'comissionado');

-- O admin de antes via o estoque de todo mundo: e o onisciente de agora. O user
-- de antes era o dono do proprio estoque: e o admin de agora.
ALTER TABLE public.user_roles ALTER COLUMN role DROP DEFAULT;
ALTER TABLE public.user_roles
  ALTER COLUMN role TYPE public.app_role
  USING (
    CASE role::text
      WHEN 'admin' THEN 'onisciente'
      WHEN 'user' THEN 'admin'
      ELSE 'admin'
    END
  )::public.app_role;
ALTER TABLE public.user_roles ALTER COLUMN role SET DEFAULT 'admin'::public.app_role;

DROP TYPE public.app_role_legado;

-- ---------------------------------------------------------------------------
-- 2. Vinculo do comissionado com a loja
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS store_owner_id UUID REFERENCES auth.users ON DELETE CASCADE;

-- Comissionado sem loja nao vende nada, e admin com loja nao quer dizer nada.
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_store_owner_check;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_store_owner_check
  CHECK ((role = 'comissionado') = (store_owner_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS user_roles_store_idx
  ON public.user_roles (store_owner_id) WHERE store_owner_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Funcoes de papel
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER para as policies de user_roles poderem consultar a propria
-- tabela sem recursao de RLS. Sem REVOKE: as policies avaliam estas funcoes
-- como o usuario chamador, entao 'authenticated' precisa poder executa-las.
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_onisciente()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'onisciente');
$$;

-- De qual estoque esta pessoa trata: o dela, ou o do dono da loja se for
-- comissionado. E o que faz a venda do comissionado cair no estoque certo.
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
    auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. Policies de user_roles
-- ---------------------------------------------------------------------------
CREATE POLICY "Cada um le o proprio papel" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- O dono precisa ler a equipe para saber de quem e cada venda.
CREATE POLICY "Dono le a propria equipe" ON public.user_roles FOR SELECT TO authenticated
  USING (store_owner_id = auth.uid());

CREATE POLICY "Onisciente gerencia papeis" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_onisciente()) WITH CHECK (public.is_onisciente());

-- Conta nova nasce dona do proprio estoque; onisciente e comissionado sao
-- concedidos a mao. O bloco de excecao esta aqui desde que criar usuario pelo
-- painel do Supabase passou a morrer com "Database error creating new user"
-- quando este gatilho falhava dentro da transacao do INSERT em auth.users.
CREATE OR REPLACE FUNCTION public.assign_default_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'assign_default_role falhou para o usuario %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_default_role() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Quem lancou o movimento
-- ---------------------------------------------------------------------------
-- user_id continua sendo o dono do estoque -- e o que mantem o saldo e o lucro
-- na conta certa. created_by e a pessoa que apertou o botao.
ALTER TABLE public.movements
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users ON DELETE SET NULL;

UPDATE public.movements SET created_by = user_id WHERE created_by IS NULL;

CREATE INDEX IF NOT EXISTS movements_created_by_idx ON public.movements (created_by);

-- Carimbado no banco, nao enviado pela tela: assim ninguem lanca venda no nome
-- de outro. Roda depois de movements_apply_reversal na ordem alfabetica, entao
-- o estorno fica no nome de quem estornou, nao de quem vendeu.
CREATE OR REPLACE FUNCTION public.stamp_movement_author()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.created_by := COALESCE(auth.uid(), NEW.created_by, NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS movements_stamp_author ON public.movements;
CREATE TRIGGER movements_stamp_author
  BEFORE INSERT ON public.movements
  FOR EACH ROW EXECUTE FUNCTION public.stamp_movement_author();

REVOKE ALL ON FUNCTION public.stamp_movement_author() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. O que o comissionado pode fazer
-- ---------------------------------------------------------------------------
-- Nenhuma policy nova em products: o comissionado continua sem enxergar linha
-- alguma da tabela, e por isso nao alcanca purchase_price de jeito nenhum.
--
-- Em movements ele so insere. Policies permissivas se somam, entao esta convive
-- com a do dono sem precisar mexer naquela.
DROP POLICY IF EXISTS "Comissionado lanca venda na loja" ON public.movements;
CREATE POLICY "Comissionado lanca venda na loja" ON public.movements FOR INSERT TO authenticated
  WITH CHECK (
    kind = 'out'
    AND source IN ('manual', 'document')
    AND created_by = auth.uid()
    AND user_id = public.current_store_owner()
    AND public.has_role(auth.uid(), 'comissionado')
  );

-- A unica porta do comissionado para o estoque. SECURITY DEFINER passa por
-- cima da RLS de propositio, e o SELECT lista so as colunas liberadas -- custo e
-- lucro nao saem do servidor. Serve tambem ao dono, que cai no proprio estoque.
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
  ORDER BY p.name;
$$;

GRANT EXECUTE ON FUNCTION public.store_products() TO authenticated;

-- Para a tela de movimentacoes escrever "vendido por fulano": o dono ve a si e
-- a equipe, o comissionado ve so a si mesmo.
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
     OR u.id IN (
       SELECT r.user_id FROM public.user_roles r WHERE r.store_owner_id = auth.uid()
     );
$$;

GRANT EXECUTE ON FUNCTION public.store_members() TO authenticated;
