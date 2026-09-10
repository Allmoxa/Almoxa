import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { basePublica } from "@/agenda/lib/url.server";

/**
 * A precedência aqui decide o endereço que o cliente recebe por e-mail. Errar
 * não quebra nada visível no servidor: o link só não abre, na mão de quem
 * marcou o horário.
 */
describe("basePublica", () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env["AGENDA_PUBLIC_URL"];
    delete process.env["VERCEL_PROJECT_PRODUCTION_URL"];
    delete process.env["VERCEL_URL"];
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("usa o domínio configurado quando ele é um endereço de verdade", () => {
    process.env["AGENDA_PUBLIC_URL"] = "https://agenda.salaodoze.com.br/";
    expect(basePublica()).toMatchObject({
      base: "https://agenda.salaodoze.com.br",
      origem: "configurada",
    });
  });

  it("aceita domínio sem protocolo, que é como se digita", () => {
    process.env["AGENDA_PUBLIC_URL"] = "almoxa.vercel.app";
    expect(basePublica().base).toBe("https://almoxa.vercel.app");
  });

  it("cai no domínio de produção do projeto quando nada foi configurado", () => {
    process.env["VERCEL_PROJECT_PRODUCTION_URL"] = "almoxa.vercel.app";
    process.env["VERCEL_URL"] = "almoxa-git-agenda-allmoxas-projects.vercel.app";
    // O deploy de branch tem endereço próprio, mas não é o que se manda pro
    // cliente: o link precisa continuar valendo depois que a branch sumir.
    expect(basePublica()).toMatchObject({
      base: "https://almoxa.vercel.app",
      origem: "producao",
    });
  });

  it("recusa o valor de exemplo do modelo em vez de obedecer", () => {
    process.env["AGENDA_PUBLIC_URL"] = "https://<seu-dominio>";
    process.env["VERCEL_PROJECT_PRODUCTION_URL"] = "almoxa.vercel.app";

    const resultado = basePublica();
    expect(resultado.base).toBe("https://almoxa.vercel.app");
    expect(resultado.origem).toBe("producao");
    // A tela do prestador mostra isto pra explicar o que foi ignorado.
    expect(resultado.recusada).toBe("https://<seu-dominio>");
  });

  it("recusa qualquer coisa que não seja endereço", () => {
    process.env["VERCEL_PROJECT_PRODUCTION_URL"] = "almoxa.vercel.app";
    for (const lixo of ["SEU_DOMINIO_AQUI", "não é url", "ftp://almoxa.vercel.app", "/a/almoxa"]) {
      process.env["AGENDA_PUBLIC_URL"] = lixo;
      expect(basePublica().origem).toBe("producao");
    }
  });

  it("preserva o caminho de quem serve a agenda sob um prefixo", () => {
    process.env["AGENDA_PUBLIC_URL"] = "https://salaodoze.com.br/agenda/";
    expect(basePublica().base).toBe("https://salaodoze.com.br/agenda");
  });

  it("aceita localhost com porta, que é o endereço de desenvolvimento", () => {
    process.env["AGENDA_PUBLIC_URL"] = "http://localhost:8081";
    expect(basePublica()).toMatchObject({ base: "http://localhost:8081", origem: "configurada" });
  });

  it("termina em localhost quando não há nada", () => {
    expect(basePublica()).toMatchObject({ base: "http://localhost:8081", origem: "local" });
  });
});
