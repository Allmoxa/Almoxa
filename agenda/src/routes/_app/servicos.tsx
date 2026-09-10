import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Scissors } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AgendaShell } from "@/components/AgendaShell";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BoxSpinner } from "@/components/ui/box-spinner";
import { Switch } from "@/components/ui/switch";
import { useProvider } from "@/hooks/use-provider";
import { supabase } from "@/integrations/supabase/client";
import type { Service } from "@/integrations/supabase/types";
import { formatarDuracao, formatarPreco } from "@/lib/validation";

export const Route = createFileRoute("/_app/servicos")({
  head: () => ({ meta: [{ title: "Serviços — Almoxá Agenda" }] }),
  component: PaginaDeServicos,
});

/**
 * O preço aparece em reais na tela e é guardado em centavos no banco. A
 * conversão mora só aqui e no envio; o resto do app lida com centavos.
 */
const formSchema = z.object({
  name: z.string().trim().min(2, { message: "Dê um nome ao serviço" }).max(120),
  description: z.string().trim().max(600).optional(),
  duration_minutes: z.coerce
    .number()
    .int({ message: "Use minutos inteiros" })
    .min(5, { message: "No mínimo 5 minutos" })
    .max(1440, { message: "No máximo 24 horas" }),
  preco: z
    .string()
    .trim()
    .refine((v) => v === "" || !Number.isNaN(Number(v.replace(",", "."))), {
      message: "Use um número, como 49,90",
    })
    .refine((v) => v === "" || Number(v.replace(",", ".")) >= 0, {
      message: "O preço não pode ser negativo",
    }),
  active: z.boolean(),
});

type FormValues = z.input<typeof formSchema>;

function PaginaDeServicos() {
  const provider = useProvider();
  const queryClient = useQueryClient();
  const [emEdicao, setEmEdicao] = useState<Service | null>(null);
  const [criando, setCriando] = useState(false);

  const servicos = useQuery({
    queryKey: ["servicos", provider.data?.id],
    queryFn: async (): Promise<Service[]> => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!provider.data,
  });

  const alternarAtivo = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("services").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["servicos"] }),
    onError: () => toast.error("Não foi possível alterar o serviço."),
  });

  const lista = servicos.data ?? [];

  return (
    <AgendaShell
      title="Serviços"
      description="O que você oferece, quanto tempo leva e quanto custa. O cliente escolhe entre estes."
      action={
        <button
          type="button"
          onClick={() => setCriando(true)}
          className="flex min-h-10 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="size-4" />
          Novo serviço
        </button>
      }
    >
      {servicos.isPending ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <BoxSpinner size={36} />
          <p className="text-sm text-muted-foreground">Carregando…</p>
        </div>
      ) : lista.length === 0 ? (
        <div className="paper-panel p-10 text-center">
          <Scissors className="mx-auto size-7 text-muted-foreground" />
          <p className="mt-4 text-base">Nenhum serviço cadastrado</p>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Sem pelo menos um serviço, seu link público não tem o que oferecer.
          </p>
          <button
            type="button"
            onClick={() => setCriando(true)}
            className="mt-6 inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="size-4" />
            Criar o primeiro
          </button>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {lista.map((servico) => (
            <li
              key={servico.id}
              className={`paper-panel p-4 ${servico.active ? "" : "opacity-60"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-medium">{servico.name}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {formatarDuracao(servico.duration_minutes)} ·{" "}
                    {formatarPreco(servico.price_cents)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEmEdicao(servico)}
                  aria-label={`Editar ${servico.name}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Pencil className="size-4" />
                </button>
              </div>

              {servico.description ? (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {servico.description}
                </p>
              ) : null}

              <label className="rule-top mt-4 flex items-center justify-between gap-3 pt-3">
                <span className="text-sm text-muted-foreground">
                  {servico.active ? "Visível no seu link" : "Escondido do público"}
                </span>
                <Switch
                  checked={servico.active}
                  onCheckedChange={(active) => alternarAtivo.mutate({ id: servico.id, active })}
                  aria-label={`${servico.active ? "Esconder" : "Mostrar"} ${servico.name}`}
                />
              </label>
            </li>
          ))}
        </ul>
      )}

      <DialogoDeServico
        aberto={criando || !!emEdicao}
        servico={emEdicao}
        providerId={provider.data?.id ?? null}
        onFechar={() => {
          setCriando(false);
          setEmEdicao(null);
        }}
      />
    </AgendaShell>
  );
}

function DialogoDeServico({
  aberto,
  servico,
  providerId,
  onFechar,
}: {
  aberto: boolean;
  servico: Service | null;
  providerId: string | null;
  onFechar: () => void;
}) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    // A chave do <Dialog> abaixo remonta o formulário a cada abertura, então
    // os defaults são reavaliados com o serviço certo — sem isso, abrir a
    // edição depois de criar traria o formulário anterior preenchido.
    defaultValues: {
      name: servico?.name ?? "",
      description: servico?.description ?? "",
      duration_minutes: servico?.duration_minutes ?? 60,
      preco:
        servico?.price_cents != null ? String(servico.price_cents / 100).replace(".", ",") : "",
      active: servico?.active ?? true,
    },
  });

  const salvar = useMutation({
    mutationFn: async (valores: FormValues) => {
      const dados = formSchema.parse(valores);
      const price_cents =
        dados.preco === "" ? null : Math.round(Number(dados.preco.replace(",", ".")) * 100);

      const payload = {
        name: dados.name,
        description: dados.description || null,
        duration_minutes: dados.duration_minutes,
        price_cents,
        active: dados.active,
      };

      if (servico) {
        const { error } = await supabase.from("services").update(payload).eq("id", servico.id);
        if (error) throw error;
      } else {
        if (!providerId) throw new Error("Cadastro do prestador não encontrado.");
        const { error } = await supabase
          .from("services")
          .insert({ ...payload, provider_id: providerId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(servico ? "Serviço atualizado." : "Serviço criado.");
      void queryClient.invalidateQueries({ queryKey: ["servicos"] });
      reset();
      onFechar();
    },
    onError: (erro: Error) => toast.error(erro.message || "Não foi possível salvar."),
  });

  const ativo = watch("active");

  return (
    <Dialog key={servico?.id ?? "novo"} open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{servico ? "Editar serviço" : "Novo serviço"}</DialogTitle>
          <DialogDescription>
            A duração define quanto tempo o horário ocupa na sua agenda.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit((v) => salvar.mutate(v))} className="space-y-4" noValidate>
          <Campo id="name" rotulo="Nome" erro={errors.name?.message}>
            <input id="name" type="text" {...register("name")} className={entrada} />
          </Campo>

          <Campo
            id="description"
            rotulo="Descrição"
            dica="Opcional. Aparece embaixo do nome no seu link."
            erro={errors.description?.message}
          >
            <textarea
              id="description"
              rows={2}
              {...register("description")}
              className={`${entrada} resize-y`}
            />
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo
              id="duration_minutes"
              rotulo="Duração (min)"
              erro={errors.duration_minutes?.message}
            >
              <input
                id="duration_minutes"
                type="number"
                inputMode="numeric"
                min={5}
                max={1440}
                step={5}
                {...register("duration_minutes")}
                className={entrada}
              />
            </Campo>

            <Campo
              id="preco"
              rotulo="Preço (R$)"
              dica="Vazio = sob consulta."
              erro={errors.preco?.message}
            >
              <input
                id="preco"
                type="text"
                inputMode="decimal"
                placeholder="49,90"
                {...register("preco")}
                className={entrada}
              />
            </Campo>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3.5 py-3">
            <span className="text-sm">Visível no seu link público</span>
            <Switch
              checked={ativo}
              onCheckedChange={(v) => setValue("active", v)}
              aria-label="Visível no seu link público"
            />
          </label>

          <DialogFooter>
            <button
              type="button"
              onClick={onFechar}
              className="min-h-10 rounded-md border border-input px-4 py-2 text-sm transition-colors hover:bg-secondary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvar.isPending}
              className="flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {salvar.isPending ? <BoxSpinner size={16} /> : null}
              {salvar.isPending ? "Salvando…" : "Salvar"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const entrada =
  "mt-1.5 w-full rounded-md border border-input bg-card px-3 py-2.5 text-sm outline-none transition-colors focus:border-ring";

function Campo({
  id,
  rotulo,
  dica,
  erro,
  children,
}: {
  id: string;
  rotulo: string;
  dica?: string;
  erro?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="label-caps">
        {rotulo}
      </label>
      {children}
      {erro ? (
        <p role="alert" className="mt-1.5 text-xs text-destructive">
          {erro}
        </p>
      ) : dica ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{dica}</p>
      ) : null}
    </div>
  );
}
