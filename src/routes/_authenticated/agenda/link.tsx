import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Apple, Check, Copy, ExternalLink, RefreshCw, Smartphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AgendaTabs } from "@/agenda/components/agenda-tabs";
import { AppShell } from "@/components/AppShell";
import { BoxSpinner } from "@/components/ui/box-spinner";
import { Switch } from "@/components/ui/switch";
import { useProvider } from "@/agenda/hooks/use-provider";
import { supabase } from "@/integrations/supabase/client";
import { girarTokenDoCalendario, lerUrlPublica } from "@/agenda/lib/provider.functions";
import { slugSchema } from "@/agenda/lib/validation";

export const Route = createFileRoute("/_authenticated/agenda/link")({
  head: () => ({ meta: [{ title: "Seu link — Almoxá" }] }),
  component: PaginaDoLink,
});

function PaginaDoLink() {
  const provider = useProvider();
  const queryClient = useQueryClient();

  const base = useQuery({
    queryKey: ["url-publica"],
    queryFn: () => lerUrlPublica(),
    staleTime: Infinity,
  });

  if (provider.isPending || base.isPending) {
    return (
      <AppShell title="Seu link">
        <AgendaTabs />
        <div className="flex flex-col items-center gap-3 py-16">
          <BoxSpinner size={36} />
          <p className="text-sm text-muted-foreground">Carregando…</p>
        </div>
      </AppShell>
    );
  }

  if (!provider.data) {
    return (
      <AppShell title="Seu link">
        <AgendaTabs />
        <p className="paper-panel p-6 text-center text-sm text-muted-foreground">
          Cadastro do prestador não encontrado.
        </p>
      </AppShell>
    );
  }

  const raiz = base.data?.base ?? "";
  const linkPublico = `${raiz}/a/${provider.data.slug}`;
  const feed = `${raiz}/api/calendario/${provider.data.calendar_token}.ics`;

  return (
    <AppShell
      title="Seu link"
      description="O endereço que você manda para o cliente, e a sincronização com o calendário do seu celular."
    >
      <AgendaTabs />
      <div className="space-y-10">
        <LinkPublico
          providerId={provider.data.id}
          link={linkPublico}
          slug={provider.data.slug}
          aceitando={provider.data.accepting}
          onMudou={() => void queryClient.invalidateQueries({ queryKey: ["provider"] })}
        />
        <Sincronizacao feed={feed} />
      </div>
    </AppShell>
  );
}

function LinkPublico({
  providerId,
  link,
  slug,
  aceitando,
  onMudou,
}: {
  providerId: string;
  link: string;
  slug: string;
  aceitando: boolean;
  onMudou: () => void;
}) {
  const [novoSlug, setNovoSlug] = useState(slug);
  const [editando, setEditando] = useState(false);

  const salvarSlug = useMutation({
    mutationFn: async () => {
      const validado = slugSchema.parse(novoSlug);
      // O .eq é redundante com a RLS, que já limita à própria linha, mas um
      // UPDATE sem filtro depende inteiramente dela estar certa — e o dia em
      // que uma política afrouxar, este alvo continua sendo um só.
      const { error } = await supabase
        .from("providers")
        .update({ slug: validado })
        .eq("id", providerId);
      // 23505 é a UNIQUE de providers.slug: o endereço já é de outra pessoa.
      if (error?.code === "23505") throw new Error("Esse endereço já está em uso.");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Endereço atualizado. O link antigo parou de funcionar.");
      setEditando(false);
      onMudou();
    },
    onError: (erro: Error) => toast.error(erro.message || "Não foi possível salvar."),
  });

  const alternarAceite = useMutation({
    mutationFn: async (accepting: boolean) => {
      const { error } = await supabase.from("providers").update({ accepting }).eq("id", providerId);
      if (error) throw error;
    },
    onSuccess: onMudou,
    onError: () => toast.error("Não foi possível alterar."),
  });

  return (
    <section>
      <h2 className="text-xl">Link de agendamento</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Quem abrir escolhe serviço e horário sem criar conta nenhuma.
      </p>

      <div className="paper-panel mt-5 p-4">
        <CampoCopiavel valor={link} rotulo="Endereço público" />

        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-10 items-center gap-2 rounded-md border border-border-strong bg-card px-3.5 py-2 text-sm transition-colors hover:bg-secondary"
          >
            <ExternalLink className="size-4" />
            Abrir
          </a>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`Agende comigo: ${link}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-10 items-center gap-2 rounded-md border border-border-strong bg-card px-3.5 py-2 text-sm transition-colors hover:bg-secondary"
          >
            Enviar no WhatsApp
          </a>
        </div>

        <div className="rule-top mt-4 pt-4">
          {editando ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <label htmlFor="slug" className="label-caps">
                  Endereço personalizado
                </label>
                <input
                  id="slug"
                  type="text"
                  value={novoSlug}
                  onChange={(e) => setNovoSlug(e.target.value.toLowerCase())}
                  autoCapitalize="none"
                  spellCheck={false}
                  className="mt-1.5 w-full rounded-md border border-input bg-card px-3 py-2.5 font-mono text-sm outline-none focus:border-ring"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Só minúsculas, números e hífen. Trocar quebra o link antigo.
                </p>
              </div>
              <button
                type="button"
                onClick={() => salvarSlug.mutate()}
                disabled={salvarSlug.isPending || novoSlug === slug}
                className="min-h-10 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Salvar
              </button>
              <button
                type="button"
                onClick={() => {
                  setNovoSlug(slug);
                  setEditando(false);
                }}
                className="min-h-10 px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
            >
              Personalizar o endereço
            </button>
          )}
        </div>

        <label className="rule-top mt-4 flex items-center justify-between gap-4 pt-4">
          <span className="text-sm">
            Aceitando agendamentos
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Desligado, o link mostra "agenda fechada" e nada é gravado.
            </span>
          </span>
          <Switch
            checked={aceitando}
            onCheckedChange={(v) => alternarAceite.mutate(v)}
            aria-label="Aceitando agendamentos"
          />
        </label>
      </div>
    </section>
  );
}

/**
 * Assinatura de calendário.
 *
 * É o que responde ao "salva sozinho no meu celular": o aparelho assina esta
 * URL uma vez e passa a buscar por conta própria. Cada agendamento novo
 * aparece lá sem ninguém exportar nada — e cancelamento some, porque o feed
 * manda a linha marcada como CANCELLED.
 *
 * O `webcal://` no lugar de `https://` é o que faz o iOS abrir direto no
 * Calendário em vez de baixar um arquivo solto no Safari.
 */
function Sincronizacao({ feed }: { feed: string }) {
  const queryClient = useQueryClient();
  const webcal = feed.replace(/^https?:\/\//, "webcal://");

  const girar = useMutation({
    mutationFn: () => girarTokenDoCalendario(),
    onSuccess: () => {
      toast.success("Link novo gerado. Assine de novo no seu celular.");
      void queryClient.invalidateQueries({ queryKey: ["provider"] });
    },
    onError: () => toast.error("Não foi possível gerar um link novo."),
  });

  return (
    <section>
      <h2 className="text-xl">Calendário do celular</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Assine uma vez. Todo agendamento novo cai no seu calendário sozinho.
      </p>

      <div className="paper-panel mt-5 p-4">
        <CampoCopiavel valor={webcal} rotulo="Link de assinatura" />

        <a
          href={webcal}
          className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Smartphone className="size-4" />
          Assinar neste aparelho
        </a>

        <div className="rule-top mt-5 grid gap-5 pt-5 sm:grid-cols-2">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium">
              <Apple className="size-4" />
              iPhone e iPad
            </p>
            <ol className="mt-2 space-y-1 text-sm leading-relaxed text-muted-foreground">
              <li>1. Toque em "Assinar neste aparelho".</li>
              <li>2. Confirme em "Assinar" quando o Calendário abrir.</li>
              <li>
                3. Se preferir na mão: Ajustes → Apps → Calendário → Contas → Adicionar → Outra →
                Calendário assinado, e cole o link.
              </li>
            </ol>
          </div>

          <div>
            <p className="flex items-center gap-2 text-sm font-medium">
              <Smartphone className="size-4" />
              Android
            </p>
            <ol className="mt-2 space-y-1 text-sm leading-relaxed text-muted-foreground">
              <li>
                1. No computador, abra calendar.google.com → "Outras agendas" → "Assinar por URL".
              </li>
              <li>2. Cole o link (troque webcal:// por https://) e confirme.</li>
              <li>3. O app Google Agenda do celular sincroniza junto.</li>
            </ol>
          </div>
        </div>

        <div className="rule-top mt-5 pt-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Quem tiver este link vê seus compromissos e os dados de contato dos clientes. Se ele
            vazar, gere outro — o antigo para de funcionar na hora.
          </p>
          <button
            type="button"
            onClick={() => girar.mutate()}
            disabled={girar.isPending}
            className="mt-3 flex min-h-10 items-center gap-2 rounded-md border border-border-strong bg-card px-3.5 py-2 text-sm transition-colors hover:bg-secondary disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${girar.isPending ? "animate-spin" : ""}`} />
            Gerar link novo
          </button>
        </div>
      </div>
    </section>
  );
}

function CampoCopiavel({ valor, rotulo }: { valor: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // navigator.clipboard exige contexto seguro (https ou localhost) e cai
      // em alguns navegadores de dentro de app. O link continua visível e
      // selecionável, então dá pra copiar na mão.
      toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  };

  return (
    <div>
      <p className="label-caps">{rotulo}</p>
      <div className="mt-1.5 flex items-stretch gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto rounded-md border border-border bg-muted px-3 py-2.5 font-mono text-xs whitespace-nowrap">
          {valor}
        </code>
        <button
          type="button"
          onClick={copiar}
          aria-label={`Copiar ${rotulo.toLowerCase()}`}
          className="flex w-11 shrink-0 items-center justify-center rounded-md border border-border-strong bg-card transition-colors hover:bg-secondary"
        >
          {copiado ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
        </button>
      </div>
    </div>
  );
}
