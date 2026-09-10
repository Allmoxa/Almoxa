import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Campo, entrada } from "@/agenda/components/campo";
import { BoxSpinner } from "@/components/ui/box-spinner";
import {
  formularioDoClienteSchema,
  type FormularioDoCliente,
} from "@/agenda/lib/validation";

/**
 * Última etapa: quem é você.
 *
 * Só o essencial. Cada campo a mais aqui é uma chance de o cliente desistir
 * a um clique do fim — telefone é opcional porque o prestador consegue falar
 * por e-mail, e observação porque a maioria não tem nada a dizer.
 *
 * Os `autoComplete` não são enfeite: no celular é a diferença entre tocar uma
 * vez no preenchimento automático e digitar o e-mail inteiro no teclado.
 */
export function BookingForm({
  enviando,
  onEnviar,
}: {
  enviando: boolean;
  onEnviar: (dados: FormularioDoCliente) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormularioDoCliente>({ resolver: zodResolver(formularioDoClienteSchema) });

  return (
    <form onSubmit={handleSubmit(onEnviar)} className="space-y-4" noValidate>
      <Campo id="nome" rotulo="Nome" erro={errors.nome?.message}>
        <input
          id="nome"
          type="text"
          autoComplete="name"
          enterKeyHint="next"
          aria-invalid={!!errors.nome}
          {...register("nome")}
          className={entrada}
        />
      </Campo>

      <Campo
        id="email"
        rotulo="E-mail"
        dica="É pra onde vai a confirmação e o lembrete."
        erro={errors.email?.message}
      >
        <input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="next"
          aria-invalid={!!errors.email}
          {...register("email")}
          className={entrada}
        />
      </Campo>

      <Campo id="telefone" rotulo="Telefone" dica="Opcional." erro={errors.telefone?.message}>
        <input
          id="telefone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          enterKeyHint="next"
          aria-invalid={!!errors.telefone}
          {...register("telefone")}
          className={entrada}
        />
      </Campo>

      <Campo
        id="observacao"
        rotulo="Observação"
        dica="Opcional. Algo que o prestador precise saber antes."
        erro={errors.observacao?.message}
      >
        <textarea
          id="observacao"
          rows={3}
          enterKeyHint="done"
          aria-invalid={!!errors.observacao}
          {...register("observacao")}
          className={`${entrada} resize-y`}
        />
      </Campo>

      {/* Honeypot. Fora da tela e fora da ordem de tabulação: quem preenche é
          bot. O servidor devolve sucesso sem gravar nada.

          O `register` não é detalhe: sem ele o react-hook-form não recolhe o
          campo (só entrega o que foi registrado) e o zod descartaria a chave
          por não estar no schema. O honeypot chegava sempre vazio ao servidor,
          e o ramo que trata bot era código morto. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Não preencha este campo</label>
        {/* Os data-* são o opt-out documentado do 1Password e do LastPass.
            "website" é nome que gerenciador de senha gosta de preencher
            sozinho — e, agora que o campo chega ao servidor, um preenchimento
            desses descartaria o agendamento de alguém de verdade sem gravar
            nada e sem ninguém ficar sabendo. */}
        <input
          id="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          {...register("website")}
        />
      </div>

      <button
        type="submit"
        disabled={enviando}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
      >
        {enviando ? <BoxSpinner size={16} /> : null}
        {enviando ? "Confirmando…" : "Confirmar agendamento"}
      </button>
    </form>
  );
}
