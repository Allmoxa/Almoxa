-- Criar conta pelo painel do Supabase (Authentication > Users > Add user) tambem
-- passa por este gatilho. Como ele roda dentro da transacao do INSERT em
-- auth.users, qualquer erro aqui derruba a criacao do usuario com
-- "Database error creating new user".
--
-- O papel padrao nao vale esse risco: sem linha em user_roles o app ja trata a
-- pessoa como 'user' (so a linha 'admin' concede privilegio). Entao logamos o
-- problema e deixamos o cadastro seguir.
CREATE OR REPLACE FUNCTION public.assign_default_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user')
    ON CONFLICT (user_id, role) DO NOTHING;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'assign_default_role falhou para o usuario %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_default_role() FROM PUBLIC, anon, authenticated;
