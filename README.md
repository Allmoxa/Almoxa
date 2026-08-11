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
```

## 📁 Estrutura

- `src/routes/` — rotas: estoque, receber (foto/documento), movimentações, auth e landing
- `src/lib/intake.functions.ts` — extração de dados por IA a partir de fotos/documentos
- `src/components/AppShell.tsx` — navegação das áreas autenticadas

## 🔑 Autenticação

O acesso exige login (e-mail/senha ou conta Google). Cada usuário vê apenas os próprios produtos e movimentações.
