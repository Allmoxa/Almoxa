import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useId, useState, type ComponentPropsWithoutRef } from "react";

type PasswordInputProps = Omit<ComponentPropsWithoutRef<"input">, "type">;

/**
 * Campo de senha com botão pra alternar entre oculta e visível.
 *
 * Encaminha a ref pro <input> de verdade -- sem isso, react-hook-form não
 * consegue focar este campo automaticamente quando ele falha na validação
 * (o foco-no-primeiro-erro do RHF depende da ref chegar no elemento real).
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className = "", id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const [visible, setVisible] = useState(false);

    return (
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          type={visible ? "text" : "password"}
          className={`${className} pr-10`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    );
  },
);

PasswordInput.displayName = "PasswordInput";
