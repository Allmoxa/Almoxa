# Almoxá — Estoque por foto ou nota de compra

Sistema minimalista de gestão de **entrada e saída de produtos**. Cadastre itens apenas **tirando uma foto** ou **importando o documento da compra** — a IA lê e extrai as informações automaticamente para você conferir.

## ✨ Funcionalidades

- 📸 **Cadastro por foto** — tire a foto do produto ou do documento e a IA identifica nome, SKU, quantidade e preços.
- 🧾 **Importação de documentos** — envie a nota de compra (PDF/imagem) e os itens são extraídos automaticamente.
- 📦 **Estoque completo** — nome, SKU, quantidade, preço de compra, preço de saída e lucro por produto.
- 🔁 **Movimentações** — histórico completo de entradas e saídas, com o estoque ajustado automaticamente.
- 📊 **Visão de lucro** — lucro potencial calculado por produto e no geral.
- 🔐 **Autenticação** — login por e-mail/senha ou Google, com dados isolados por usuário.

## 🚀 Começando

```sh
npm install
npm run dev
```

## 🛠️ Stack

- **Frontend/Fullstack**: TanStack Start (React 19) + Vite + Tailwind CSS v4
- **Backend**: Supabase (banco de dados, storage e autenticação)
- **Leitura por IA**: Google Gemini (API direta)
- **Deploy**: Vercel
- **Estética**: papel claro, tipografia Instrument Serif + DM Sans, minimalismo

## 🔧 Variáveis de ambiente

Copie `.env` e preencha com as credenciais do seu próprio projeto Supabase e sua chave do Gemini:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=

# Almoxá Agenda (mesmo app, rotas /agenda e /a/<slug>)
RESEND_API_KEY=
AGENDA_EMAIL_FROM=
AGENDA_PUBLIC_URL=   # opcional, ver abaixo
CRON_SECRET=
```

`AGENDA_PUBLIC_URL` é a raiz de todo link que a Agenda emite — o do e-mail de
confirmação, o do lembrete e o que a tela "Seu link" manda copiar. Preencha só
para usar um domínio próprio: vazia, o app cai sozinho no domínio de produção
do projeto na Vercel, que continua valendo quando o código roda num deploy de
branch — o endereço daquela build morre com ela, e um link desses na mão de um
cliente para de abrir sem aviso. Valor que não seja endereço de verdade é
recusado, registrado no log e sinalizado na tela do prestador; o cabeçalho
`Host` não entra nessa conta, porque quem escolhe o `Host` é quem chama, e um
forjado mandaria o cliente para outro lugar a partir de um e-mail legítimo.

## 📁 Estrutura

- `src/routes/` — rotas: estoque, receber (foto/documento), movimentações, auth e landing
- `src/lib/intake.functions.ts` — extração de dados por IA a partir de fotos/documentos
- `src/components/AppShell.tsx` — navegação das áreas autenticadas
- `src/agenda/` — **a Almoxá Agenda**: componentes, lógica e testes dela (ver abaixo)

## 📅 Almoxá Agenda

Agendamento por link: o cliente escolhe serviço e horário **sem criar conta**, e
o prestador vê tudo numa agenda e recebe os compromissos no calendário do
celular.

É **o mesmo app**, não um projeto vizinho — um deploy, um domínio, um projeto na
Vercel. Foi o que o plano gratuito permitiu, e acabou sendo melhor: o login é um
só de verdade, sem salto entre sites.

O código dela mora em `src/agenda/` (componentes, lógica, testes). Só as rotas
ficam fora, em `src/routes/`, porque o roteamento é por arquivo e elas têm de
estar lá.

| Rota                      | Quem usa                                       |
| ------------------------- | ---------------------------------------------- |
| `/agenda`                 | horários marcados                              |
| `/agenda/servicos`        | o que você oferece                             |
| `/agenda/disponibilidade` | expediente, folgas e a régua de agendamento    |
| `/agenda/link`            | identidade pública, link e calendário          |
| `/a/$slug`                | **agendamento público — sem login**            |
| `/agendamento/$token`     | comprovante do cliente: ver, salvar, desmarcar |
| `/api/calendario/$token`  | feed `.ics`                                    |
| `/api/cron/lembretes`     | disparo dos lembretes                          |

As quatro primeiras entram pela aba **Agenda** na barra de cima, e se dividem
por sub-abas dentro da página: oito abas na barra principal não caberiam.

`/a/$slug` responde 404 enquanto a conta não tiver cadastrado nenhum serviço.
Todo mundo que cria conta no Almoxá ganha um prestador com slug derivado do
e-mail, use a Agenda ou não — e uma página que respondesse 200 com o nome da
pessoa em `/a/<prefixo-do-e-mail>` seria um verificador de "fulano tem conta
aqui?" para quem soubesse o e-mail alheio. Serviço cadastrado e depois desligado
é outro caso: aí a página existe e diz que a agenda está fechada.

**Duas decisões que sustentam o resto:**

_Ninguém marca em cima de ninguém._ A constraint `appointments_sem_sobreposicao`
(`EXCLUDE USING gist`) recusa qualquer sobreposição na agenda de um prestador.
Dois clientes clicando "confirmar" no mesmo segundo passam os dois pela checagem
em `SELECT` — só o banco resolve esse empate. O segundo `INSERT` volta `23P01` e
a aplicação traduz para "esse horário acabou de ser preenchido".

_O cliente não fala com o Postgres._ Ele não tem sessão, então não há RLS para
avaliar: todo o tráfego público passa pelas server functions, que usam a service
role e montam a resposta campo a campo. `anon` não recebe `GRANT` nenhum. Um
`select("*")` em `src/agenda/lib/booking.functions.ts` vazaria o
`calendar_token` do prestador ou o telefone de outro cliente sem nada acusar.

### Lembretes

Saem do cron da Vercel, **uma vez por dia** (`0 11 * * *`, 8h de Brasília):
o plano Hobby recusa qualquer coisa mais frequente. `CRON_SECRET` autoriza a
rota, comparado em tempo constante; sem o segredo ela responde 503 em vez de
abrir — melhor não enviar do que deixar endpoint público disparando e-mail.

O segredo viaja como valor de header (`Authorization: Bearer …`), e header HTTP
só aceita ASCII visível. Um acento ali derruba o deploy com "contains characters
that are not valid in HTTP headers" — armadilha fácil de pisar escrevendo em
português. Gerar em hexadecimal resolve por construção:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

A cadência diária muda a regra de disparo, e o código sabe: comparar só "está
dentro da antecedência?" perderia lembrete calado, porque um horário de hoje à
tarde com antecedência de 2h seria julgado "longe" às 8h e na passada seguinte
já teria acontecido. `src/agenda/lib/lembretes.ts` soma o intervalo do cron à
antecedência — avisa mais cedo em vez de não avisar — e os testes simulam as
passadas provando que ninguém fica sem aviso.

Para a granularidade fina sem pagar, tire o cron do `vercel.json` e chame a rota
pelo `pg_cron` do Supabase, baixando `INTERVALO_DO_CRON_MINUTOS` junto.

### Migration

`supabase/migrations/` guarda o schema da Agenda (`providers`, `services`,
`availability_rules`, `availability_blocks`, `appointments`, `booking_quota`).
Como os dois lados usam o mesmo projeto Supabase, compartilham `auth.users` e as
tabelas não colidem.

O trigger `on_auth_user_created_agenda` só cadastra prestador para conta criada
**depois** da migration, então o projeto que já tinha usuários precisa do
retroativo — e sem ele a Agenda sobe inacessível justamente para quem já usava o
Almoxá: sem linha em `providers`, as quatro telas não têm o que mostrar e não há
por onde criar o cadastro.

`20260910100000_agenda_cadastro_retroativo.sql` faz isso ao ser aplicada. Ela
tira a lógica do slug de dentro do trigger (`public.slug_de_prestador`) e a
reaproveita nos dois caminhos, um usuário por vez: o slug de cada conta depende
dos que já foram gravados, e duas contas `contato@` de provedores diferentes
disputam o mesmo endereço — quem chega depois vira `contato-1`. É idempotente,
então rodar de novo não duplica nem sobrescreve cadastro já ajustado.

## 🔑 Autenticação

O acesso exige login (e-mail/senha ou conta Google). Cada usuário vê apenas os próprios produtos e movimentações.
