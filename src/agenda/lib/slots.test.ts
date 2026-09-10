import { describe, expect, it } from "vitest";
import {
  diasComExpediente,
  gerarHorariosDoDia,
  janelaDeAgendamento,
  type ConfiguracaoAgenda,
  type EntradaDeHorarios,
} from "@/agenda/lib/slots";

const SP = "America/Sao_Paulo";

const config: ConfiguracaoAgenda = {
  timeZone: SP,
  slotIntervalMinutes: 30,
  bufferMinutes: 0,
  minNoticeMinutes: 0,
  maxDaysAhead: 60,
};

// 2026-09-15 é uma terça (weekday 2).
function entrada(over: Partial<EntradaDeHorarios> = {}): EntradaDeHorarios {
  return {
    isoDate: "2026-09-15",
    duracaoMinutos: 30,
    config,
    regras: [{ weekday: 2, starts_at: "09:00", ends_at: "12:00" }],
    bloqueios: [],
    ocupados: [],
    agora: new Date("2026-09-01T12:00:00Z"),
    ...over,
  };
}

describe("gerarHorariosDoDia", () => {
  it("preenche a faixa de ponta a ponta no passo configurado", () => {
    const horarios = gerarHorariosDoDia(entrada());
    expect(horarios.map((h) => h.rotulo)).toEqual([
      "09:00",
      "09:30",
      "10:00",
      "10:30",
      "11:00",
      "11:30",
    ]);
    expect(horarios.every((h) => h.livre)).toBe(true);
  });

  it("devolve o instante em UTC correspondente à hora local", () => {
    const [primeiro] = gerarHorariosDoDia(entrada());
    expect(primeiro?.inicio).toBe("2026-09-15T12:00:00.000Z");
    expect(primeiro?.fim).toBe("2026-09-15T12:30:00.000Z");
  });

  it("não oferece começo que estoura o fim do expediente", () => {
    // 90 min dentro de 09:00-12:00: o último começo possível é 10:30.
    const horarios = gerarHorariosDoDia(entrada({ duracaoMinutos: 90 }));
    expect(horarios.map((h) => h.rotulo)).toEqual(["09:00", "09:30", "10:00", "10:30"]);
  });

  it("fica vazio no dia sem regra", () => {
    // 2026-09-16 é quarta; a regra é de terça.
    expect(gerarHorariosDoDia(entrada({ isoDate: "2026-09-16" }))).toEqual([]);
  });

  it("junta duas faixas do mesmo dia sem repetir a emenda", () => {
    const horarios = gerarHorariosDoDia(
      entrada({
        regras: [
          { weekday: 2, starts_at: "09:00", ends_at: "10:00" },
          { weekday: 2, starts_at: "10:00", ends_at: "11:00" },
        ],
      }),
    );
    expect(horarios.map((h) => h.rotulo)).toEqual(["09:00", "09:30", "10:00", "10:30"]);
  });

  it("marca como ocupado o horário que já tem gente", () => {
    const horarios = gerarHorariosDoDia(
      entrada({
        ocupados: [{ starts_at: "2026-09-15T13:00:00Z", ends_at: "2026-09-15T13:30:00Z" }],
      }),
    );
    const dezHoras = horarios.find((h) => h.rotulo === "10:00");
    expect(dezHoras?.livre).toBe(false);
    // O horário continua na lista — sumir daria a entender que não se atende às 10h.
    expect(horarios).toHaveLength(6);
    expect(horarios.filter((h) => h.livre)).toHaveLength(5);
  });

  it("encosta sem conflito: quem termina 10:00 não briga com quem começa 10:00", () => {
    const horarios = gerarHorariosDoDia(
      entrada({
        ocupados: [{ starts_at: "2026-09-15T12:30:00Z", ends_at: "2026-09-15T13:00:00Z" }],
      }),
    );
    expect(horarios.find((h) => h.rotulo === "10:00")?.livre).toBe(true);
    expect(horarios.find((h) => h.rotulo === "09:30")?.livre).toBe(false);
  });

  it("o buffer afasta os vizinhos do agendamento existente", () => {
    const horarios = gerarHorariosDoDia(
      entrada({
        config: { ...config, bufferMinutes: 15 },
        ocupados: [{ starts_at: "2026-09-15T13:00:00Z", ends_at: "2026-09-15T13:30:00Z" }],
      }),
    );
    // 10:00 é o ocupado; 09:30 e 10:30 encostariam sem o intervalo de 15 min.
    expect(horarios.find((h) => h.rotulo === "09:30")?.livre).toBe(false);
    expect(horarios.find((h) => h.rotulo === "10:00")?.livre).toBe(false);
    expect(horarios.find((h) => h.rotulo === "10:30")?.livre).toBe(false);
    expect(horarios.find((h) => h.rotulo === "11:00")?.livre).toBe(true);
    expect(horarios.find((h) => h.rotulo === "09:00")?.livre).toBe(true);
  });

  it("bloqueio fecha a faixa inteira que ele cobre", () => {
    const horarios = gerarHorariosDoDia(
      entrada({
        bloqueios: [{ starts_at: "2026-09-15T12:00:00Z", ends_at: "2026-09-15T14:00:00Z" }],
      }),
    );
    expect(horarios.filter((h) => h.livre).map((h) => h.rotulo)).toEqual(["11:00", "11:30"]);
  });

  it("antecedência mínima derruba o que está perto demais", () => {
    const horarios = gerarHorariosDoDia(
      entrada({
        // 09:40 local. Com 120 min de antecedência, só a partir de 11:40.
        agora: new Date("2026-09-15T12:40:00Z"),
        config: { ...config, minNoticeMinutes: 120 },
      }),
    );
    expect(horarios.filter((h) => h.livre)).toEqual([]);

    const comMenos = gerarHorariosDoDia(
      entrada({
        agora: new Date("2026-09-15T12:40:00Z"),
        config: { ...config, minNoticeMinutes: 30 },
      }),
    );
    // 09:40 + 30 min libera a partir de 10:10 — o 10:00 fica de fora por 10 minutos.
    expect(comMenos.filter((h) => h.livre).map((h) => h.rotulo)).toEqual([
      "10:30",
      "11:00",
      "11:30",
    ]);
  });

  it("não gera nada com duração ou passo inválido", () => {
    expect(gerarHorariosDoDia(entrada({ duracaoMinutos: 0 }))).toEqual([]);
    expect(gerarHorariosDoDia(entrada({ config: { ...config, slotIntervalMinutes: 0 } }))).toEqual(
      [],
    );
  });

  it("passo maior que o padrão rareia a grade", () => {
    const horarios = gerarHorariosDoDia(
      entrada({ config: { ...config, slotIntervalMinutes: 60 } }),
    );
    expect(horarios.map((h) => h.rotulo)).toEqual(["09:00", "10:00", "11:00"]);
  });
});

describe("janelaDeAgendamento", () => {
  it("começa no dia local do prestador, não no do servidor", () => {
    // 01:00 UTC do dia 16 ainda é dia 15 em São Paulo.
    const janela = janelaDeAgendamento(
      { timeZone: SP, maxDaysAhead: 30 },
      new Date("2026-09-16T01:00:00Z"),
    );
    expect(janela.primeiroDia).toBe("2026-09-15");
    expect(janela.ultimoDia).toBe("2026-10-15");
  });
});

describe("diasComExpediente", () => {
  it("lista só os dias da semana que têm regra", () => {
    const dias = diasComExpediente(
      [
        { weekday: 2, starts_at: "09:00", ends_at: "12:00" },
        { weekday: 4, starts_at: "14:00", ends_at: "18:00" },
      ],
      "2026-09-14",
      "2026-09-20",
    );
    // Terça 15 e quinta 17.
    expect(dias).toEqual(["2026-09-15", "2026-09-17"]);
  });

  it("fica vazio sem nenhuma regra", () => {
    expect(diasComExpediente([], "2026-09-14", "2026-09-20")).toEqual([]);
  });
});
