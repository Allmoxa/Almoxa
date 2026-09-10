import { describe, expect, it } from "vitest";
import { dobrar, escapar, montarEventoUnico, montarFeed, paraDataIcs } from "@/lib/ics";

const evento = {
  uid: "abc@almoxa-agenda",
  inicio: new Date("2026-09-15T12:00:00Z"),
  fim: new Date("2026-09-15T13:00:00Z"),
  titulo: "Corte de cabelo",
  atualizadoEm: new Date("2026-09-01T10:00:00Z"),
};

describe("paraDataIcs", () => {
  it("formata em UTC compacto", () => {
    expect(paraDataIcs(new Date("2026-09-15T12:30:45Z"))).toBe("20260915T123045Z");
  });

  it("preenche zero à esquerda no mês e no dia", () => {
    expect(paraDataIcs(new Date("2026-01-05T00:00:00Z"))).toBe("20260105T000000Z");
  });
});

describe("escapar", () => {
  it("escapa ponto e vírgula, vírgula e quebra de linha", () => {
    expect(escapar("a;b,c\nd")).toBe("a\\;b\\,c\\nd");
  });

  it("dobra a barra invertida antes de tudo", () => {
    // Se a ordem estivesse trocada, o "\;" gerado viraria "\\;" na passada da barra.
    expect(escapar("a\\b;c")).toBe("a\\\\b\\;c");
  });

  it("normaliza CRLF pra um \\n só", () => {
    expect(escapar("linha1\r\nlinha2")).toBe("linha1\\nlinha2");
  });
});

describe("dobrar", () => {
  it("deixa linha curta intacta", () => {
    expect(dobrar("SUMMARY:oi")).toBe("SUMMARY:oi");
  });

  it("quebra em 75 octetos com espaço na continuação", () => {
    const dobrada = dobrar("X:" + "a".repeat(200));
    const pedacos = dobrada.split("\r\n");
    expect(pedacos.length).toBeGreaterThan(1);
    expect(pedacos[0]).toHaveLength(75);
    for (const p of pedacos.slice(1)) {
      expect(p.startsWith(" ")).toBe(true);
      expect(Buffer.byteLength(p, "utf8")).toBeLessThanOrEqual(75);
    }
  });

  it("conta bytes, não caracteres, e não parte acento no meio", () => {
    // Cada "ã" custa 2 bytes em UTF-8: 60 caracteres já passam de 75 octetos.
    const dobrada = dobrar("X:" + "ã".repeat(60));
    for (const pedaco of dobrada.split("\r\n")) {
      expect(Buffer.byteLength(pedaco, "utf8")).toBeLessThanOrEqual(75);
    }
    // Remontar tem que devolver o texto original, sem caractere corrompido.
    expect(dobrada.split("\r\n ").join("")).toBe("X:" + "ã".repeat(60));
  });
});

describe("montarEventoUnico", () => {
  it("fecha o envelope e termina com CRLF", () => {
    const ics = montarEventoUnico(evento);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
  });

  it("usa só CRLF como quebra de linha", () => {
    const ics = montarEventoUnico(evento);
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("leva início, fim e título", () => {
    const ics = montarEventoUnico(evento);
    expect(ics).toContain("DTSTART:20260915T120000Z");
    expect(ics).toContain("DTEND:20260915T130000Z");
    expect(ics).toContain("SUMMARY:Corte de cabelo");
    expect(ics).toContain("UID:abc@almoxa-agenda");
  });

  it("cancelado vira METHOD:CANCEL e STATUS:CANCELLED", () => {
    const ics = montarEventoUnico({ ...evento, cancelado: true });
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
  });

  it("cancelado não leva alarme junto", () => {
    const ics = montarEventoUnico({ ...evento, cancelado: true, alarmeMinutosAntes: 60 });
    expect(ics).not.toContain("BEGIN:VALARM");
  });

  it("monta o alarme com o disparo relativo", () => {
    const ics = montarEventoUnico({ ...evento, alarmeMinutosAntes: 30 });
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("TRIGGER:-PT30M");
  });

  it("não escapa a URL", () => {
    const ics = montarEventoUnico({ ...evento, url: "https://x.com/a?b=1,2" });
    expect(ics).toContain("URL:https://x.com/a?b=1,2");
  });
});

describe("montarFeed", () => {
  it("anuncia o nome e o intervalo de atualização", () => {
    const ics = montarFeed("Agenda da Ana", [evento]);
    expect(ics).toContain("X-WR-CALNAME:Agenda da Ana");
    expect(ics).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT30M");
    expect(ics).toContain("X-PUBLISHED-TTL:PT30M");
    expect(ics).toContain("METHOD:PUBLISH");
  });

  it("aceita calendário vazio", () => {
    const ics = montarFeed("Agenda vazia", []);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });

  it("empilha um VEVENT por compromisso", () => {
    const ics = montarFeed("Agenda", [evento, { ...evento, uid: "def@almoxa-agenda" }]);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });

  it("escapa o nome do calendário", () => {
    const ics = montarFeed("Ana; Barbearia", [evento]);
    expect(ics).toContain("X-WR-CALNAME:Ana\\; Barbearia");
  });
});
