import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const credentialsSchema = z.object({
  username: z.string().trim().max(200),
  password: z.string().max(200),
});

/**
 * Portão temporário na frente da home pública, enquanto a conta de verdade
 * (Supabase, em /auth) ainda não tem cadastro aberto. Compara no servidor
 * pra a senha não ir parar no bundle do navegador -- não é uma parede de
 * segurança de verdade (dá pra contornar no devtools), só afasta visita
 * casual antes do lançamento.
 */
export const checkSiteGate = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => credentialsSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const validUser = process.env["SITE_GATE_USER"];
    const validPassword = process.env["SITE_GATE_PASSWORD"];
    if (!validUser || !validPassword) return { ok: false };

    const ok = data.username === validUser && data.password === validPassword;
    return { ok };
  });
