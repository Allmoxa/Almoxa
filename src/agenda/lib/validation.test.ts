import { describe, expect, it } from "vitest";
import { formatarTelefone, telefoneSchema } from "@/agenda/lib/validation";

describe("formatarTelefone", () => {
  it("põe o DDD entre parênteses assim que ele existe", () => {
    expect(formatarTelefone("1")).toBe("(1");
    expect(formatarTelefone("11")).toBe("(11");
    expect(formatarTelefone("119")).toBe("(11) 9");
  });

  it("quebra em 5-4 no celular e em 4-4 no fixo", () => {
    expect(formatarTelefone("1134567890")).toBe("(11) 3456-7890");
    expect(formatarTelefone("11987654321")).toBe("(11) 98765-4321");
  });

  // O nono dígito é o que separa fixo de celular, e ele chega por último.
  it("remonta a quebra quando o nono dígito chega", () => {
    expect(formatarTelefone("113456789")).toBe("(11) 3456-789");
    expect(formatarTelefone("1134567891")).toBe("(11) 3456-7891");
    expect(formatarTelefone("11345678912")).toBe("(11) 34567-8912");
  });

  it("descarta o que passar de 11 dígitos", () => {
    // Era isto que deixava passar a linha de vinte dígitos no formulário.
    expect(formatarTelefone("99999999999999999999999999")).toBe("(99) 99999-9999");
  });

  it("ignora letra e pontuação que o teclado deixar passar", () => {
    // Dez dígitos depois de jogar fora o espaço, o hífen e o "D": é fixo.
    expect(formatarTelefone("11 9876-5432D")).toBe("(11) 9876-5432");
    expect(formatarTelefone("+55 11 98765-4321")).toBe("(55) 11987-6543");
    expect(formatarTelefone("abc")).toBe("");
  });

  it("volta a vazio quando o campo é limpo", () => {
    expect(formatarTelefone("")).toBe("");
    expect(formatarTelefone("()-")).toBe("");
  });

  // Reformatar o que já está formatado não pode mexer no valor: é o que
  // acontece a cada tecla, e um formato instável faria o cursor pular.
  it("é idempotente", () => {
    const formatado = formatarTelefone("11987654321");
    expect(formatarTelefone(formatado)).toBe(formatado);
  });

  it("produz sempre algo que o schema aceita", () => {
    for (const bruto of ["1", "119", "1134567890", "11987654321", "9".repeat(30)]) {
      expect(telefoneSchema.safeParse(formatarTelefone(bruto)).success).toBe(true);
    }
  });
});
