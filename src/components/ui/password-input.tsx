import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type ComponentPropsWithoutRef } from "react";

type PasswordInputProps = Omit<ComponentPropsWithoutRef<"input">, "type">;

/** Campo de senha com botão pra alternar entre oculta e visível. */
export function PasswordInput({ className = "", id, ...props }: PasswordInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
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
}
