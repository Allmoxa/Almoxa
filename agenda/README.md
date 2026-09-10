# Almoxá Agenda

Agendamento por link. O cliente escolhe serviço e horário **sem criar conta**; o
prestador vê tudo numa agenda e recebe os compromissos no calendário do celular.

Projeto irmão do [Almoxá](../Almoxa) — mesma stack, mesmo design system
("Papel claro"), banco e deploy separados. A integração entre os dois é por link
interno (ver [Integração com o Almoxá](#integração-com-o-almoxá)).

## Stack

TanStack Start (React 19 + SSR) · Vite 8 · Tailwind 4 · Supabase (Postgres +
Auth) · Resend (e-mail) · Vercel (deploy + cron).

## Rodando

```bash
npm install
cp .env.example .env   # preencha as chaves
npm run dev            # http://localhost:8081
```

A porta é 8081 de propósito: o Almoxá usa a 8080, e os dois sobem juntos durante
o desenvolvimento da integração.

| Comando         | O que faz                                     |
| --------------- | --------------------------------------------- |
| `npm run dev`   | servidor de desenvolvimento                   |
| `npm run build` | build de produção (preset Vercel)             |
| `npm test`      | testes de fuso, grade de horários e iCalendar |
| `npm run lint`  | ESLint + Prettier                             |

## Banco

A migration inicial está em `supabase/migrations/20260909100000_agenda_inicial.sql`,
já aplicada no projeto em uso. Num projeto novo, rode antes de usar o app:

```bash
npx supabase db push
```

Ou cole o arquivo no SQL Editor do painel do Supabase.

O trigger `on_auth_user_created_agenda` só cadastra prestador para conta criada
**depois** da migration. Se o projeto já tinha usuários, faça o backfill:

```sql
INSERT INTO public.providers (user_id, slug, display_name, contact_email)
SELECT u.id,
       btrim(left(regexp_replace(lower(split_part(u.email, '@', 1)), '[^a-z0-9]+', '-', 'g'), 32), '-'),
       split_part(u.email, '@', 1),
       u.email
FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;
```

`src/integrations/supabase/types.ts` é escrito à mão e confere com o banco
coluna a coluna. Mexeu na migration, mexa nele — ou regere:

```bash
npx supabase gen types typescript --project-id <id> > src/integrations/supabase/types.ts
```

### Modelo

| Tabela                | Papel                                                                              |
| --------------------- | ---------------------------------------------------------------------------------- |
| `providers`           | o prestador: slug do link público, fuso, régua de agendamento, token do calendário |
| `services`            | o que ele oferece — duração e preço (em centavos)                                  |
| `availability_rules`  | expediente semanal, em hora local (`TIME`, sem fuso)                               |
| `availability_blocks` | folgas e feriados, em instante concreto (`TIMESTAMPTZ`)                            |
| `appointments`        | os horários marcados                                                               |
| `booking_quota`       | freio de abuso do formulário público                                               |

**Duas decisões que sustentam o resto:**

_Ninguém marca em cima de ninguém._ A constraint `appointments_sem_sobreposicao`
(`EXCLUDE USING gist`) recusa qualquer sobreposição na agenda de um prestador.
Dois clientes clicando "confirmar" no mesmo segundo passam os dois pela checagem
em `SELECT` — só o banco resolve esse empate. O segundo `INSERT` volta como
`23P01` e a aplicação traduz para "esse horário acabou de ser preenchido".
Cancelado sai do índice, então o horário volta a valer.

_O cliente não fala com o Postgres._ Ele não tem sessão, então não há RLS para
avaliar: todo o tráfego público passa pelas server functions, que usam a service
role e montam a resposta campo a campo. `anon` não recebe `GRANT` nenhum. Um
`select("*")` em `src/lib/booking.functions.ts` vazaria o `calendar_token` do
prestador ou o telefone de outro cliente sem nada acusar.

## Deploy

Vercel, com o preset já configurado no `vite.config.ts` e o cron no
`vercel.json`. O build é `npm run build`.

Cadastre em Settings > Environment Variables tudo que está no `.env.example`.
Três delas erram calado se ficarem de fora:

`AGENDA_PUBLIC_URL` precisa ser o domínio real. Ele monta os links de
confirmação e cancelamento e a URL da assinatura de calendário — esquecer
não quebra o deploy, só manda `http://localhost:8081` no e-mail do cliente,
e aí o link não abre pra ninguém.

`CRON_SECRET` autoriza `/api/cron/lembretes`. Sem ele a rota responde 503 em
vez de abrir, então **os lembretes simplesmente não saem** — de propósito: é
melhor não enviar do que deixar um endpoint público disparando e-mail. Gere um
valor longo e aleatório; o Vercel Cron manda o header sozinho:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`SUPABASE_SERVICE_ROLE_KEY` é o que sustenta o agendamento público — o cliente
não tem sessão, então é o servidor que grava por ele. Cadastre como variável de
servidor; ela nunca deve aparecer numa `VITE_*`, que vai pro bundle do
navegador.

Feito isso, o cron passa a rodar de 15 em 15 minutos e a agenda está de pé.

## Como o compromisso chega no celular

Duas saídas, para dois problemas diferentes:

**Assinatura (`/api/calendario/<token>.ics`)** — é o "salva sozinho". O prestador
assina uma vez via `webcal://` e o iOS e o Google Agenda passam a buscar por
conta própria; todo agendamento novo aparece sem ninguém exportar nada, e
cancelado some (o feed manda a linha como `CANCELLED`). O token vive numa coluna
própria justamente para poder ser girado sem mexer em mais nada — a tela
`/link` tem o botão.

**Arquivo avulso (`.ics`)** — anexo do e-mail de confirmação e botão "Salvar no
calendário" no comprovante. Universal, mas não sincroniza depois.

O gerador de iCalendar é escrito à mão (`src/lib/ics.ts`): o que a RFC 5545 exige
aqui cabe em três regras (CRLF, dobra em 75 **octetos**, escape de texto), e uma
biblioteca traria um motor de recorrência que a agenda não usa. A dobra conta
bytes, não caracteres — em português "ã" e "ç" custam dois cada.

## E-mail

Confirmação e cancelamento saem na hora, pela server function. O lembrete sai do
cron da Vercel (`/api/cron/lembretes`, de 15 em 15 minutos), protegido por
`CRON_SECRET` e comparado em tempo constante; sem o segredo configurado a rota
responde 503 em vez de abrir. `reminder_sent_at` é gravado por agendamento logo
após o envio, então uma falha no meio da lista não reenvia para quem já recebeu.

Falha de envio nunca derruba o agendamento: ele já está gravado quando o e-mail
sai. Perder o e-mail é ruim; perder o horário é pior.

## Fuso horário

O expediente é regra ("toda terça às 9h"), o agendamento é instante. A costura
entre os dois está em `src/lib/timezone.ts`, feita com `Intl` — sem dependência
externa e cobrindo viradas de horário de verão. O Brasil não tem mais DST desde
2019, mas `providers.timezone` é campo livre, e uma agenda que erra uma hora
duas vezes por ano erra do jeito mais caro possível.

Toda formatação na tela usa o fuso **do prestador**, nunca o do navegador:
"09:00" precisa significar nove da manhã na cadeira dele. Quando os dois fusos
diferem, a tela avisa.

## Rotas

| Rota                     | Quem usa                                                     |
| ------------------------ | ------------------------------------------------------------ |
| `/`                      | apresentação                                                 |
| `/a/$slug`               | **agendamento público** — sem login                          |
| `/agendamento/$token`    | comprovante do cliente: ver, salvar no calendário, desmarcar |
| `/auth`                  | entrada do prestador                                         |
| `/agenda`                | horários marcados                                            |
| `/servicos`              | o que ele oferece                                            |
| `/disponibilidade`       | expediente e folgas                                          |
| `/link`                  | link público e assinatura de calendário                      |
| `/api/calendario/$token` | feed `.ics`                                                  |
| `/api/cron/lembretes`    | disparo dos lembretes                                        |

## Mobile

Mobile-first de verdade, não desktop encolhido: alvos de toque de 44px, fonte de
16px nos campos (abaixo disso o iOS dá zoom ao focar), `env(safe-area-inset-*)`
nas barras fixas, faixa de dias com `scroll-snap`, e navegação inferior no
celular — onde o polegar alcança. A grade de horários usa `@container`, então a
contagem de colunas segue a largura da caixa, não a da janela.

## Integração com o Almoxá

Preparada, não fechada. `ALMOXA_APP_URL` / `VITE_ALMOXA_APP_URL` acendem o
atalho "Ir para o Almoxá" no menu; vazias, ele some.

Se os dois apontarem para o mesmo projeto Supabase, compartilham `auth.users` —
o mesmo login serve para os dois, e as tabelas não colidem. O caminho contrário
(projetos separados) exige decidir como ligar as contas.

## Testes

52 testes cobrindo o que quebra em silêncio: conversão de fuso nas duas
direções, virada de horário de verão, geração da grade (buffer, bloqueio,
antecedência mínima, faixas encostadas), e o formato do iCalendar (CRLF, dobra
em octetos com acento, escape na ordem certa).
