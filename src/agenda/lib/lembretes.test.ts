import { describe, expect, it } from "vitest";
import { deveEnviarAgora, tetoDaConsultaMs, textoDeAntecedencia } from "./lembretes";

const h = (horas: number) => horas * 60 * 60 * 1000;
const DIARIO = 1440;
const CADA_15_MIN = 15;

describe("deveEnviarAgora", () => {
  it("não envia quando o prestador desligou o lembrete", () => {
    expect(deveEnviarAgora(h(1), 0, DIARIO)).toBe(false);
    expect(deveEnviarAgora(h(1), -1, DIARIO)).toBe(false);
  });

  it("não envia para horário que já começou ou passou", () => {
    expect(deveEnviarAgora(0, 24, DIARIO)).toBe(false);
    expect(deveEnviarAgora(-h(2), 24, DIARIO)).toBe(false);
  });

  describe("cron de 15 em 15 minutos", () => {
    it("envia dentro da antecedência escolhida", () => {
      expect(deveEnviarAgora(h(23), 24, CADA_15_MIN)).toBe(true);
      expect(deveEnviarAgora(h(1), 2, CADA_15_MIN)).toBe(true);
    });

    it("espera quando ainda falta mais que a antecedência", () => {
      expect(deveEnviarAgora(h(30), 24, CADA_15_MIN)).toBe(false);
      expect(deveEnviarAgora(h(5), 2, CADA_15_MIN)).toBe(false);
    });

    it("antecipa no máximo o intervalo do cron", () => {
      // 24h + 10min: a próxima passada (15 min) ainda pega em tempo... mas a
      // diferença é menor que o intervalo, então sai agora pra não arriscar.
      expect(deveEnviarAgora(h(24) + 10 * 60 * 1000, 24, CADA_15_MIN)).toBe(true);
      // 24h + 20min: passa do intervalo, pode esperar a próxima.
      expect(deveEnviarAgora(h(24) + 20 * 60 * 1000, 24, CADA_15_MIN)).toBe(false);
    });
  });

  describe("cron diário (plano Hobby da Vercel)", () => {
    it("é o caso que a regra antiga perdia: antecedência curta, horário hoje", () => {
      // Horário hoje às 14h visto na passada das 8h, antecedência de 2h.
      // `faltam <= janela` diria não; a próxima passada seria amanhã, quando o
      // horário já passou. Tem de sair agora.
      expect(deveEnviarAgora(h(6), 2, DIARIO)).toBe(true);
    });

    it("cobre o dia seguinte inteiro", () => {
      for (const faltam of [h(1), h(6), h(12), h(18), h(24)]) {
        expect(deveEnviarAgora(faltam, 24, DIARIO)).toBe(true);
      }
    });

    it("adianta até um dia além da antecedência, e para ali", () => {
      expect(deveEnviarAgora(h(47), 24, DIARIO)).toBe(true);
      expect(deveEnviarAgora(h(49), 24, DIARIO)).toBe(false);
    });

    it("todo agendamento é avisado em alguma passada, antes de começar", () => {
      // A propriedade que sustenta a regra: simula as passadas diárias e exige
      // que alguma delas envie enquanto o horário ainda está no futuro.
      //
      // É esta a garantia que a comparação antiga (`faltam <= janela`) não
      // dava: com antecedência menor que um dia, ela pulava em toda passada até
      // o agendamento passar, e ninguém recebia nada.
      for (const antecedencia of [1, 2, 6, 12, 24, 48, 168]) {
        for (let faltamHoras = 1; faltamHoras <= 240; faltamHoras++) {
          let avisado = false;
          // Passadas do cron: agora, +24h, +48h... até o horário chegar.
          for (let passada = 0; passada * 24 < faltamHoras; passada++) {
            const restante = h(faltamHoras) - h(passada * 24);
            if (deveEnviarAgora(restante, antecedencia, DIARIO)) {
              avisado = true;
              break;
            }
          }
          expect(
            avisado,
            `antecedência ${antecedencia}h, faltam ${faltamHoras}h: nenhuma passada enviou`,
          ).toBe(true);
        }
      }
    });

    it("a comparação antiga perdia os casos que esta prova cobre", () => {
      // Mesma simulação com a regra sem a soma do intervalo, pra registrar o
      // que exatamente estava quebrado. Antecedência de 2h nunca era alcançada
      // por um cron diário.
      const regraAntiga = (faltamMs: number, antecedenciaHoras: number) =>
        faltamMs > 0 && antecedenciaHoras > 0 && faltamMs <= antecedenciaHoras * 60 * 60 * 1000;

      const perdidos: number[] = [];
      for (let faltamHoras = 1; faltamHoras <= 72; faltamHoras++) {
        let avisado = false;
        for (let passada = 0; passada * 24 < faltamHoras; passada++) {
          if (regraAntiga(h(faltamHoras) - h(passada * 24), 2)) {
            avisado = true;
            break;
          }
        }
        if (!avisado) perdidos.push(faltamHoras);
      }
      // Só os horários nas 2h seguintes escapavam; todo o resto se perdia.
      expect(perdidos.length).toBeGreaterThan(60);
      expect(perdidos).toContain(6);
      // E a regra nova não perde nenhum deles.
      for (const faltamHoras of perdidos) {
        let avisado = false;
        for (let passada = 0; passada * 24 < faltamHoras; passada++) {
          if (deveEnviarAgora(h(faltamHoras) - h(passada * 24), 2, DIARIO)) {
            avisado = true;
            break;
          }
        }
        expect(avisado, `faltam ${faltamHoras}h ainda perdido`).toBe(true);
      }
    });
  });
});

describe("tetoDaConsultaMs", () => {
  it("cobre a antecedência máxima do banco mais o intervalo do cron", () => {
    // Sem somar o intervalo, o prestador com reminder_hours no teto (168h)
    // teria o lembrete cortado pela consulta antes da regra rodar.
    const teto = tetoDaConsultaMs(DIARIO);
    expect(deveEnviarAgora(teto, 168, DIARIO)).toBe(true);
    expect(teto).toBe(h(168) + h(24));
  });

  it("acompanha o intervalo informado", () => {
    expect(tetoDaConsultaMs(CADA_15_MIN)).toBe(h(168) + 15 * 60 * 1000);
  });
});

describe("textoDeAntecedencia", () => {
  const SP = "America/Sao_Paulo";

  it("diz 'amanhã' só quando é mesmo o dia seguinte", () => {
    // Cron das 11h UTC = 08h em São Paulo, dia 10.
    const agora = new Date("2026-09-10T11:00:00Z");
    // 09:00 do dia 11 em São Paulo.
    expect(textoDeAntecedencia(new Date("2026-09-11T12:00:00Z"), agora, SP)).toBe("amanhã");
  });

  it("não chama de 'amanhã' o que está a dois dias", () => {
    // O caso que o cron diário cria: antecedência de 24h, envio a 47h.
    const agora = new Date("2026-09-10T11:00:00Z");
    expect(textoDeAntecedencia(new Date("2026-09-12T10:00:00Z"), agora, SP)).toBe("em 2 dias");
  });

  it("conta em horas dentro do mesmo dia", () => {
    const agora = new Date("2026-09-10T11:00:00Z");
    expect(textoDeAntecedencia(new Date("2026-09-10T14:00:00Z"), agora, SP)).toBe("em cerca de 3h");
  });

  it("encurta para 'daqui a pouco' quando falta uma hora ou menos", () => {
    const agora = new Date("2026-09-10T11:00:00Z");
    expect(textoDeAntecedencia(new Date("2026-09-10T11:40:00Z"), agora, SP)).toBe("daqui a pouco");
  });

  it("usa o dia do calendário do prestador, não múltiplos de 24h", () => {
    // 23h de segunda em São Paulo (02h de terça em UTC).
    const agora = new Date("2026-09-15T02:00:00Z");
    // 08h de terça em São Paulo: faltam 9 horas, mas é o dia seguinte.
    expect(textoDeAntecedencia(new Date("2026-09-15T11:00:00Z"), agora, SP)).toBe("amanhã");
  });
});
