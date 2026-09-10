/**
 * Campo de formulário da Agenda: rótulo, controle, e embaixo o erro ou a dica.
 *
 * Já existia igual no formulário do cliente e no diálogo de serviço; as telas
 * de identidade e de régua seriam a terceira e a quarta cópia. Uma cópia é
 * descuido, quatro é a garantia de que a mensagem de erro vai parar de ser
 * anunciada em uma delas sem ninguém notar.
 */

import type React from "react";

export const entrada =
  "mt-1.5 w-full rounded-md border border-input bg-card px-3 py-2.5 text-sm outline-none transition-colors focus:border-ring aria-[invalid=true]:border-destructive";

export function Campo({
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
        // role="alert" faz o leitor de tela anunciar o erro na hora em que ele
        // aparece, sem precisar navegar de volta até o campo.
        <p role="alert" className="mt-1.5 text-xs text-destructive">
          {erro}
        </p>
      ) : dica ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{dica}</p>
      ) : null}
    </div>
  );
}
