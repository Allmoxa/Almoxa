import { supabase } from "@/integrations/supabase/client";
import { slugSku } from "./inventory";

/**
 * SKU para produto que chegou sem código próprio.
 *
 * slugSku() monta um rótulo a partir do nome, e nomes que só divergem no fim
 * — "Camiseta básica preta - tam. P" e a mesma peça em tam. M — caíam no mesmo
 * slug depois do corte. Como products tem UNIQUE (user_id, sku), o segundo item
 * da nota não virava produto novo: o recebimento achava o primeiro pelo slug,
 * sobrescrevia o preço dele e lançava a entrada no produto errado.
 *
 * Aqui o slug é só o ponto de partida: BASE, BASE-2, BASE-3... até sobrar um
 * livre na loja. Quem tem código de verdade não passa por aqui — o código da
 * nota é a identidade do produto e vai gravado como veio.
 *
 * Dois cadastros simultâneos do mesmo nome na mesma loja podem escolher o mesmo
 * sufixo; quem chega depois esbarra no UNIQUE (user_id, sku) e falha, em vez de
 * gravar duplicado. Não vale segurar um lock aqui pela chance de acontecer.
 */
export async function freeSku(name: string, storeId: string): Promise<string> {
  const base = slugSku(name);

  // Um SELECT só: os candidatos são todos prefixados pelo slug, então a lista
  // de ocupados sai inteira daqui em vez de um round-trip por tentativa.
  const { data, error } = await supabase
    .from("products")
    .select("sku")
    .eq("user_id", storeId)
    .like("sku", `${base}%`);
  if (error) throw error;

  const taken = new Set((data ?? []).map((row) => row.sku));
  let candidate = base;
  for (let n = 2; taken.has(candidate); n += 1) {
    candidate = `${base}-${n}`;
  }
  return candidate;
}
