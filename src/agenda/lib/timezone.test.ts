import { describe, expect, it } from "vitest";
import {
  addDaysToIsoDate,
  instantToIsoDate,
  instantToTimeOfDay,
  isValidTimeZone,
  isoDateTimeToInstant,
  minutesOfDay,
  parseTimeOfDay,
  wallTimeToInstant,
  weekdayOfCalendarDate,
  zoneOffsetMs,
} from "@/agenda/lib/timezone";

const SP = "America/Sao_Paulo";

describe("zoneOffsetMs", () => {
  it("devolve -3h em São Paulo", () => {
    expect(zoneOffsetMs(new Date("2026-09-15T12:00:00Z"), SP)).toBe(-3 * 60 * 60 * 1000);
  });

  it("devolve 0 em UTC", () => {
    expect(zoneOffsetMs(new Date("2026-09-15T12:00:00Z"), "UTC")).toBe(0);
  });

  it("acompanha o horário de verão de Nova York", () => {
    const hora = 60 * 60 * 1000;
    // Julho é EDT (-4h), janeiro é EST (-5h).
    expect(zoneOffsetMs(new Date("2026-07-15T12:00:00Z"), "America/New_York")).toBe(-4 * hora);
    expect(zoneOffsetMs(new Date("2026-01-15T12:00:00Z"), "America/New_York")).toBe(-5 * hora);
  });

  it("não é confundido por milissegundos no instante", () => {
    expect(zoneOffsetMs(new Date("2026-09-15T12:00:00.750Z"), SP)).toBe(-3 * 60 * 60 * 1000);
  });
});

describe("wallTimeToInstant", () => {
  it("converte 09:00 de São Paulo pra 12:00 UTC", () => {
    const instante = wallTimeToInstant(2026, 9, 15, 9, 0, SP);
    expect(instante.toISOString()).toBe("2026-09-15T12:00:00.000Z");
  });

  it("atravessa a meia-noite pro dia seguinte em UTC", () => {
    // 22:00 em São Paulo é 01:00 do dia 16 em UTC.
    const instante = wallTimeToInstant(2026, 9, 15, 22, 0, SP);
    expect(instante.toISOString()).toBe("2026-09-16T01:00:00.000Z");
  });

  it("volta pro mesmo relógio de parede na ida e na volta", () => {
    const instante = wallTimeToInstant(2026, 3, 10, 14, 30, "Europe/Lisbon");
    expect(instantToTimeOfDay(instante, "Europe/Lisbon")).toBe("14:30");
    expect(instantToIsoDate(instante, "Europe/Lisbon")).toBe("2026-03-10");
  });

  it("acerta a hora dos dois lados de uma virada de horário de verão", () => {
    // Nova York entra no EDT no segundo domingo de março (08/03/2026, 02:00).
    const antes = wallTimeToInstant(2026, 3, 7, 10, 0, "America/New_York");
    const depois = wallTimeToInstant(2026, 3, 9, 10, 0, "America/New_York");
    expect(antes.toISOString()).toBe("2026-03-07T15:00:00.000Z"); // EST, -5h
    expect(depois.toISOString()).toBe("2026-03-09T14:00:00.000Z"); // EDT, -4h
  });
});

describe("isoDateTimeToInstant", () => {
  it("aceita o horário com segundos que o Postgres devolve", () => {
    const comSegundos = isoDateTimeToInstant("2026-09-15", "09:30:00", SP);
    const semSegundos = isoDateTimeToInstant("2026-09-15", "09:30", SP);
    expect(comSegundos.toISOString()).toBe(semSegundos.toISOString());
  });
});

describe("parseTimeOfDay", () => {
  it("recusa hora fora do relógio", () => {
    expect(() => parseTimeOfDay("24:00")).toThrow();
    expect(() => parseTimeOfDay("10:75")).toThrow();
    expect(() => parseTimeOfDay("manhã")).toThrow();
  });

  it("aceita hora sem zero à esquerda", () => {
    expect(parseTimeOfDay("9:05")).toEqual({ hour: 9, minute: 5 });
  });
});

describe("minutesOfDay", () => {
  it("conta a partir da meia-noite", () => {
    expect(minutesOfDay("00:00")).toBe(0);
    expect(minutesOfDay("09:30")).toBe(570);
    expect(minutesOfDay("23:59")).toBe(1439);
  });
});

describe("weekdayOfCalendarDate", () => {
  it("usa 0 pra domingo, igual ao availability_rules.weekday", () => {
    expect(weekdayOfCalendarDate(2026, 9, 13)).toBe(0); // domingo
    expect(weekdayOfCalendarDate(2026, 9, 15)).toBe(2); // terça
  });
});

describe("addDaysToIsoDate", () => {
  it("vira o mês", () => {
    expect(addDaysToIsoDate("2026-09-30", 1)).toBe("2026-10-01");
  });

  it("vira o ano", () => {
    expect(addDaysToIsoDate("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("acerta 29 de fevereiro em ano bissexto", () => {
    expect(addDaysToIsoDate("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysToIsoDate("2027-02-28", 1)).toBe("2027-03-01");
  });

  it("anda pra trás", () => {
    expect(addDaysToIsoDate("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("isValidTimeZone", () => {
  it("separa fuso real de texto qualquer", () => {
    expect(isValidTimeZone(SP)).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Marte/Olympus")).toBe(false);
  });
});
