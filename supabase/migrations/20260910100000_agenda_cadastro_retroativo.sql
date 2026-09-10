-- Cadastro de prestador para quem já tinha conta antes da Agenda.
--
-- A migration anterior criou o gatilho `on_auth_user_created_agenda`, que só
-- dispara em INSERT novo em auth.users. Toda conta que já existia ficou sem
-- linha em `providers` — e, sem ela, as quatro telas da Agenda não têm o que
-- mostrar: a lista fica presa no "carregando", as outras dizem "cadastro não
-- encontrado", e não há por onde criar. Ou seja: a Agenda subiu inacessível
-- justamente pra quem já usava o Almoxá.
--
-- Aqui a lógica do slug sai de dentro do gatilho e vira função reutilizável,
-- para que o retroativo e o gatilho não possam divergir com o tempo.

-- ---------------------------------------------------------------------------
-- 1. Slug livre a partir do e-mail
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.slug_de_prestador(_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base TEXT;
  candidato TEXT;
  tentativa INT := 0;
BEGIN
  -- coalesce porque auth.users.email é opcional (conta criada por telefone, ou
  -- por provedor que não devolve e-mail). Sem isto, `base` viraria NULL, o
  -- INSERT bateria no NOT NULL do slug e o cadastro da conta inteira falharia
  -- dentro do gatilho.
  base := regexp_replace(lower(split_part(coalesce(_email, ''), '@', 1)), '[^a-z0-9]+', '-', 'g');
  base := btrim(base, '-');
  IF length(base) < 3 THEN
    base := 'agenda-' || base;
  END IF;
  -- O btrim vem DEPOIS do corte: o left() pode parar em cima de um hífen
  -- ("joao.paulo.ricardo.f..." virando "...ricardo-"), e o CHECK do slug
  -- recusa hífen no fim. É também o que salva o caso do e-mail sem letra
  -- nenhuma, onde a linha acima produz o próprio "agenda-".
  base := btrim(left(base, 32), '-');
  IF length(base) < 3 THEN
    base := 'agenda-' || base;
  END IF;
  candidato := base;

  WHILE EXISTS (SELECT 1 FROM public.providers WHERE slug = candidato) LOOP
    tentativa := tentativa + 1;
    candidato := left(base, 30) || '-' || tentativa::text;
    IF tentativa > 50 THEN
      candidato := left(base, 24) || '-' || replace(gen_random_uuid()::text, '-', '');
      candidato := left(candidato, 40);
      EXIT;
    END IF;
  END LOOP;

  RETURN candidato;
END;
$$;

REVOKE ALL ON FUNCTION public.slug_de_prestador(TEXT) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Gatilho passa a usar a função
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_provider()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidato TEXT;
BEGIN
  candidato := public.slug_de_prestador(NEW.email);

  -- display_name cai no slug quando não há e-mail: o CHECK exige texto não
  -- vazio, e um cadastro que falha aqui derruba a criação da conta.
  INSERT INTO public.providers (user_id, slug, display_name, contact_email)
  VALUES (
    NEW.id,
    candidato,
    coalesce(nullif(btrim(split_part(coalesce(NEW.email, ''), '@', 1)), ''), candidato),
    NEW.email
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_provider() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Retroativo
-- ---------------------------------------------------------------------------
-- Um por vez, e não um INSERT ... SELECT: o slug de cada conta depende dos que
-- já foram gravados, inclusive os desta mesma passada. Duas contas
-- "contato@..." em provedores diferentes disputam o mesmo slug, e é o laço que
-- transforma a segunda em "contato-1".
--
-- Idempotente pelo NOT EXISTS: rodar de novo não duplica nem sobrescreve
-- cadastro que o prestador já ajustou.
DO $$
DECLARE
  conta RECORD;
  candidato TEXT;
BEGIN
  FOR conta IN
    SELECT u.id, u.email
    FROM auth.users u
    WHERE NOT EXISTS (SELECT 1 FROM public.providers p WHERE p.user_id = u.id)
    ORDER BY u.created_at
  LOOP
    candidato := public.slug_de_prestador(conta.email);

    INSERT INTO public.providers (user_id, slug, display_name, contact_email)
    VALUES (
      conta.id,
      candidato,
      coalesce(nullif(btrim(split_part(coalesce(conta.email, ''), '@', 1)), ''), candidato),
      conta.email
    )
    ON CONFLICT (user_id) DO NOTHING;
  END LOOP;
END;
$$;
