import { Mail, Phone, StickyNote } from "lucide-react";
import { AddToCalendar } from "@/components/add-to-calendar";
import { uidDoAgendamento } from "@/lib/booking.functions";
import { hora } from "@/lib/formato";
import { formatarDuracao } from "@/lib/validation";
import type { AppointmentStatus } from "@/integrations/supabase/types";

export type AgendamentoNaLista = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  client_name: string;
  client_email: string;
  client_phone: string | null;
  notes: string | null;
  servico: string;
  duracaoMinutos: number;
};

const ROTULO_DO_STATUS: Record<AppointmentStatus, string> = {
  confirmado: "Confirmado",
  cancelado: "Cancelado",
  concluido: "Concluído",
};

/**
 * Um agendamento na lista do prestador.
 *
 * O e-mail e o telefone são links `mailto:`/`tel:` de propósito: no celular,
 * ligar pro cliente que está atrasado tem que ser um toque, não copiar e
 * colar o número em outro aplicativo.
 */
export function AppointmentCard({
  agendamento,
  timeZone,
  onCancelar,
  onConcluir,
  ocupado,
}: {
  agendamento: AgendamentoNaLista;
  timeZone: string;
  onCancelar: (id: string) => void;
  onConcluir: (id: string) => void;
  ocupado: boolean;
}) {
  const cancelado = agendamento.status === "cancelado";
  const jaPassou = new Date(agendamento.starts_at) < new Date();

  return (
    <article className={`paper-panel p-4 ${cancelado ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-lg leading-none">
            {hora(agendamento.starts_at, timeZone)}
            <span className="ml-1.5 text-sm text-muted-foreground">
              – {hora(agendamento.ends_at, timeZone)}
            </span>
          </p>
          <p className="mt-1.5 truncate text-base font-medium">{agendamento.client_name}</p>
          <p className="text-sm text-muted-foreground">
            {agendamento.servico} · {formatarDuracao(agendamento.duracaoMinutos)}
          </p>
        </div>

        <span className="status-pill shrink-0" data-tone={agendamento.status}>
          {ROTULO_DO_STATUS[agendamento.status]}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
        <a
          href={`mailto:${agendamento.client_email}`}
          className="flex items-center gap-1.5 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <Mail className="size-3.5 shrink-0" />
          <span className="truncate">{agendamento.client_email}</span>
        </a>
        {agendamento.client_phone ? (
          <a
            href={`tel:${agendamento.client_phone.replace(/[^\d+]/g, "")}`}
            className="flex items-center gap-1.5 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <Phone className="size-3.5 shrink-0" />
            {agendamento.client_phone}
          </a>
        ) : null}
      </div>

      {agendamento.notes ? (
        <p className="mt-3 flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-sm leading-relaxed">
          <StickyNote className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          {agendamento.notes}
        </p>
      ) : null}

      {!cancelado ? (
        <div className="rule-top mt-4 space-y-3 pt-4">
          <AddToCalendar
            uid={uidDoAgendamento(agendamento.id)}
            titulo={`${agendamento.servico} — ${agendamento.client_name}`}
            descricao={`Cliente: ${agendamento.client_name}\nContato: ${agendamento.client_email}`}
            inicio={new Date(agendamento.starts_at)}
            fim={new Date(agendamento.ends_at)}
          />

          <div className="flex flex-wrap gap-2">
            {/* Concluir só depois da hora: marcar como feito um atendimento
                que ainda nem começou é quase sempre clique errado. */}
            {jaPassou && agendamento.status === "confirmado" ? (
              <button
                type="button"
                onClick={() => onConcluir(agendamento.id)}
                disabled={ocupado}
                className="min-h-9 flex-1 rounded-md border border-border-strong bg-card px-3 py-2 text-sm transition-colors hover:bg-secondary disabled:opacity-50"
              >
                Marcar como concluído
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => onCancelar(agendamento.id)}
              disabled={ocupado}
              className="min-h-9 flex-1 rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
            >
              Cancelar e avisar
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
