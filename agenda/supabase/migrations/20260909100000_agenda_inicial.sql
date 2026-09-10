-- Almoxá Agenda — schema inicial.
--
-- Duas populações usam este banco por caminhos bem diferentes:
--
--   o prestador entra logado, e a RLS abaixo só devolve as linhas dele;
--   o cliente não entra — abre um link público, escolhe e vai embora.
--
-- Como o cliente não tem sessão, ele não fala com o Postgres: fala com as
-- server functions, que usam a service role. Por isso `anon` não recebe GRANT
-- nenhum aqui. A tabela appointments guarda nome, e-mail e telefone de
-- terceiros; uma política "anon lê o que é público" nessa tabela vazaria a
-- agenda inteira pra quem tivesse a chave publishable, que vive no bundle.

-- tstzrange + operador && no EXCLUDE lá embaixo precisa de GiST em tipo
-- escalar (provider_id), e isso é o btree_gist que dá.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------------
-- 1. Prestador
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users ON DELETE CASCADE,

  -- Pedaço do link público: /a/<slug>. Minúsculas, dígitos e hífen.
  slug TEXT NOT NULL UNIQUE
    CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  display_name TEXT NOT NULL CHECK (length(btrim(display_name)) > 0),
  headline TEXT,
  contact_email TEXT,
  phone TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',

  -- Token da assinatura .ics do celular. Separado do id porque a URL do feed
  -- circula em texto puro no aparelho do prestador: se vazar, dá pra girar
  -- este campo sem mexer em mais nada.
  calendar_token UUID NOT NULL DEFAULT gen_random_uuid(),

  -- Régua de agendamento. slot_interval_minutes é o passo da grade (de quanto
  -- em quanto tempo um horário pode começar); a duração de cada serviço vem
  -- da tabela services e pode ser maior que o passo.
  slot_interval_minutes SMALLINT NOT NULL DEFAULT 30
    CHECK (slot_interval_minutes BETWEEN 5 AND 240),
  min_notice_minutes INT NOT NULL DEFAULT 120 CHECK (min_notice_minutes >= 0),
  max_days_ahead SMALLINT NOT NULL DEFAULT 60 CHECK (max_days_ahead BETWEEN 1 AND 365),
  buffer_minutes SMALLINT NOT NULL DEFAULT 0 CHECK (buffer_minutes BETWEEN 0 AND 240),
  reminder_hours SMALLINT NOT NULL DEFAULT 24 CHECK (reminder_hours BETWEEN 0 AND 168),

  -- Chave geral: false tira a página do ar sem apagar nada.
  accepting BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS providers_calendar_token_idx
  ON public.providers (calendar_token);

ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Prestador le o proprio cadastro" ON public.providers;
CREATE POLICY "Prestador le o proprio cadastro" ON public.providers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Prestador edita o proprio cadastro" ON public.providers;
CREATE POLICY "Prestador edita o proprio cadastro" ON public.providers
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT ON public.providers TO authenticated;
-- calendar_token e user_id ficam de fora: girar o token é operação do
-- servidor, e user_id nunca muda depois do cadastro.
GRANT UPDATE (
  slug, display_name, headline, contact_email, phone, timezone,
  slot_interval_minutes, min_notice_minutes, max_days_ahead,
  buffer_minutes, reminder_hours, accepting
) ON public.providers TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Serviços oferecidos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  description TEXT,
  duration_minutes SMALLINT NOT NULL CHECK (duration_minutes BETWEEN 5 AND 1440),
  -- Em centavos, pra não carregar arredondamento de float no preço.
  -- NULL = "sob consulta", que é diferente de zero (gratuito).
  price_cents INT CHECK (price_cents >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS services_provider_idx ON public.services (provider_id);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Prestador gerencia os proprios servicos" ON public.services;
CREATE POLICY "Prestador gerencia os proprios servicos" ON public.services
  FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Expediente semanal
-- ---------------------------------------------------------------------------
-- Horário local do prestador (TIME, sem fuso). Converter pra instante é
-- trabalho da aplicação, que conhece providers.timezone — guardar TIMESTAMPTZ
-- aqui seria mentira: "toda terça às 9h" não é um instante, é uma regra.
CREATE TABLE IF NOT EXISTS public.availability_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0 = domingo
  starts_at TIME NOT NULL,
  ends_at TIME NOT NULL,
  CHECK (ends_at > starts_at),
  -- Duas faixas iguais no mesmo dia só duplicariam horário na grade.
  UNIQUE (provider_id, weekday, starts_at, ends_at)
);

CREATE INDEX IF NOT EXISTS availability_rules_provider_idx
  ON public.availability_rules (provider_id, weekday);

ALTER TABLE public.availability_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Prestador gerencia o proprio expediente" ON public.availability_rules;
CREATE POLICY "Prestador gerencia o proprio expediente" ON public.availability_rules
  FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability_rules TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Bloqueios (folga, feriado, compromisso pessoal)
-- ---------------------------------------------------------------------------
-- Aqui é TIMESTAMPTZ mesmo: bloqueio é um intervalo concreto no calendário,
-- não uma regra que se repete.
CREATE TABLE IF NOT EXISTS public.availability_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS availability_blocks_provider_idx
  ON public.availability_blocks (provider_id, starts_at);

ALTER TABLE public.availability_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Prestador gerencia os proprios bloqueios" ON public.availability_blocks;
CREATE POLICY "Prestador gerencia os proprios bloqueios" ON public.availability_blocks
  FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability_blocks TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Agendamentos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers ON DELETE CASCADE,
  -- ON DELETE RESTRICT: apagar um serviço que já tem gente marcada apagaria
  -- o compromisso junto. A tela desativa (active = false) em vez de apagar.
  service_id UUID NOT NULL REFERENCES public.services ON DELETE RESTRICT,

  client_name TEXT NOT NULL CHECK (length(btrim(client_name)) > 0),
  client_email TEXT NOT NULL CHECK (client_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  client_phone TEXT,
  notes TEXT,

  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmado'
    CHECK (status IN ('confirmado', 'cancelado', 'concluido')),

  -- Link que o cliente recebe por e-mail pra ver ou desmarcar. É o que
  -- substitui a senha dele: quem tem o token mexe naquele agendamento e em
  -- mais nenhum.
  manage_token UUID NOT NULL DEFAULT gen_random_uuid(),

  confirmation_sent_at TIMESTAMPTZ,
  reminder_sent_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by TEXT CHECK (cancelled_by IN ('cliente', 'prestador')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (ends_at > starts_at),

  -- O coração da coisa. Dois clientes clicando "confirmar" no mesmo segundo
  -- passam os dois pela checagem de horário livre feita em SELECT — só o
  -- banco consegue decidir isso sem corrida. O segundo INSERT bate aqui e
  -- volta como 23P01, que a aplicação traduz pra "esse horário acabou de ser
  -- preenchido". Cancelado sai do índice: o horário volta a valer.
  CONSTRAINT appointments_sem_sobreposicao EXCLUDE USING gist (
    provider_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status <> 'cancelado')
);

CREATE UNIQUE INDEX IF NOT EXISTS appointments_manage_token_idx
  ON public.appointments (manage_token);
CREATE INDEX IF NOT EXISTS appointments_provider_starts_idx
  ON public.appointments (provider_id, starts_at);
-- Índice do cron: varre só quem ainda não recebeu lembrete.
CREATE INDEX IF NOT EXISTS appointments_reminder_pendente_idx
  ON public.appointments (starts_at)
  WHERE status = 'confirmado' AND reminder_sent_at IS NULL;

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Prestador le a propria agenda" ON public.appointments;
CREATE POLICY "Prestador le a propria agenda" ON public.appointments
  FOR SELECT TO authenticated
  USING (provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Prestador atualiza a propria agenda" ON public.appointments;
CREATE POLICY "Prestador atualiza a propria agenda" ON public.appointments
  FOR UPDATE TO authenticated
  USING (provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid()));

-- Marcar horário é sempre pelo servidor (o cliente não tem sessão), então
-- authenticated não recebe INSERT: um prestador logado que quisesse encaixar
-- alguém na mão passaria por cima da checagem de expediente e de antecedência.
GRANT SELECT ON public.appointments TO authenticated;
GRANT UPDATE (status, notes, cancelled_at, cancelled_by, updated_at)
  ON public.appointments TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_appointment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_touch ON public.appointments;
CREATE TRIGGER appointments_touch
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.touch_appointment();

-- ---------------------------------------------------------------------------
-- 6. Cadastro automático do prestador no primeiro login
-- ---------------------------------------------------------------------------
-- Slug provisório derivado do e-mail. Colisão é resolvida com sufixo curto
-- em vez de estourar o cadastro; o prestador troca depois na tela de link.
CREATE OR REPLACE FUNCTION public.handle_new_provider()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base TEXT;
  candidato TEXT;
  tentativa INT := 0;
BEGIN
  base := regexp_replace(lower(split_part(NEW.email, '@', 1)), '[^a-z0-9]+', '-', 'g');
  base := btrim(base, '-');
  IF length(base) < 3 THEN
    base := 'agenda-' || base;
  END IF;
  -- O btrim tem que vir DEPOIS do corte: o left() pode parar em cima de um
  -- hífen ("joao.paulo.ricardo.f..." virando "...ricardo-"), e o CHECK do slug
  -- recusa hífen no fim. Sem isto, esse e-mail derruba o cadastro inteiro.
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

  INSERT INTO public.providers (user_id, slug, display_name, contact_email)
  VALUES (NEW.id, candidato, split_part(NEW.email, '@', 1), NEW.email)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_provider() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created_agenda ON auth.users;
CREATE TRIGGER on_auth_user_created_agenda
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_provider();

-- ---------------------------------------------------------------------------
-- 7. Freio do agendamento público
-- ---------------------------------------------------------------------------
-- A página pública é aberta e cada confirmação dispara e-mail pelo Resend.
-- Sem teto, um laço de shell enche a agenda de lixo e queima a cota de envio.
CREATE TABLE IF NOT EXISTS public.booking_quota (
  ip TEXT NOT NULL,
  janela TIMESTAMPTZ NOT NULL,
  usos SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (ip, janela)
);

ALTER TABLE public.booking_quota ENABLE ROW LEVEL SECURITY;
-- Sem política: só a service role enxerga. Ninguém lê isso do navegador.

CREATE OR REPLACE FUNCTION public.consume_booking_quota(_ip TEXT, _teto SMALLINT DEFAULT 8)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bucket TIMESTAMPTZ := date_trunc('hour', now());
  atual SMALLINT;
BEGIN
  INSERT INTO public.booking_quota (ip, janela, usos)
  VALUES (_ip, bucket, 1)
  ON CONFLICT (ip, janela) DO UPDATE SET usos = public.booking_quota.usos + 1
  RETURNING usos INTO atual;

  DELETE FROM public.booking_quota WHERE janela < bucket - INTERVAL '6 hours';

  RETURN atual <= _teto;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_booking_quota(TEXT, SMALLINT) FROM PUBLIC, anon, authenticated;
