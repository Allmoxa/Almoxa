import { describe, expect, it } from "vitest";
import {
  computeProducibleUnits,
  formatBalance,
  fromBaseQuantity,
  normalizeName,
  toBaseQuantity,
  unitDimension,
} from "./inventory";

describe("toBaseQuantity / fromBaseQuantity", () => {
  it("kg vira grama (base) multiplicando por 1000", () => {
    expect(toBaseQuantity(1.5, "kg")).toBe(1500);
  });

  it("l vira mililitro (base) multiplicando por 1000", () => {
    expect(toBaseQuantity(2, "l")).toBe(2000);
  });

  it("g e ml e unidade não convertem -- já são a base", () => {
    expect(toBaseQuantity(500, "g")).toBe(500);
    expect(toBaseQuantity(500, "ml")).toBe(500);
    expect(toBaseQuantity(5, "unidade")).toBe(5);
  });

  it("é reversível: base -> unidade amigável -> base de volta", () => {
    expect(fromBaseQuantity(toBaseQuantity(2.5, "kg"), "kg")).toBeCloseTo(2.5);
    expect(fromBaseQuantity(toBaseQuantity(3, "l"), "l")).toBeCloseTo(3);
  });
});

describe("unitDimension", () => {
  it("classifica cada unidade na dimensão certa", () => {
    expect(unitDimension("g")).toBe("massa");
    expect(unitDimension("kg")).toBe("massa");
    expect(unitDimension("ml")).toBe("volume");
    expect(unitDimension("l")).toBe("volume");
    expect(unitDimension("unidade")).toBe("contagem");
  });
});

describe("formatBalance", () => {
  it("formata na unidade amigável a partir do valor em base", () => {
    expect(formatBalance(1500, "kg")).toBe("1,5 kg");
    expect(formatBalance(500, "g")).toBe("500 g");
    expect(formatBalance(3, "unidade")).toBe("3 un.");
  });
});

describe("normalizeName", () => {
  it("trata acento, caixa e espaço redundante como o mesmo nome", () => {
    const a = normalizeName("Leite em Pó");
    const b = normalizeName("leite em po");
    const c = normalizeName("Leite   em   pó");
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it("nomes de fato diferentes continuam diferentes", () => {
    expect(normalizeName("Farinha")).not.toBe(normalizeName("Fermento"));
  });
});

describe("computeProducibleUnits -- espelha o gatilho de produção", () => {
  it("receita vazia nunca produz", () => {
    expect(computeProducibleUnits([])).toBe(0);
  });

  it("exemplo do enunciado: 1 bolo exato", () => {
    // 100g farinha, 20g açúcar, 30g leite em pó, 200ml leite, 5g fermento
    const rows = [
      { balanceBase: 100, neededBase: 100 },
      { balanceBase: 20, neededBase: 20 },
      { balanceBase: 30, neededBase: 30 },
      { balanceBase: 200, neededBase: 200 },
      { balanceBase: 5, neededBase: 5 },
    ];
    expect(computeProducibleUnits(rows)).toBe(1);
  });

  it("estoque para 10 bolos produz exatamente 10", () => {
    const rows = [
      { balanceBase: 1000, neededBase: 100 },
      { balanceBase: 200, neededBase: 20 },
      { balanceBase: 300, neededBase: 30 },
      { balanceBase: 2000, neededBase: 200 },
      { balanceBase: 50, neededBase: 5 },
    ];
    expect(computeProducibleUnits(rows)).toBe(10);
  });

  it("ingrediente limitante corta a produção pra unidades inteiras", () => {
    // farinha p/ 5, açúcar p/ 4, leite p/ 3, fermento p/ 8 -> produz 3
    const rows = [
      { balanceBase: 500, neededBase: 100 }, // farinha: 5
      { balanceBase: 80, neededBase: 20 }, // açúcar: 4
      { balanceBase: 600, neededBase: 200 }, // leite: 3
      { balanceBase: 40, neededBase: 5 }, // fermento: 8
    ];
    expect(computeProducibleUnits(rows)).toBe(3);
  });

  it("produção progressiva: metade dos ingredientes não produz nada ainda", () => {
    // 50g farinha de 100g exigidos, 20g açúcar completo -> 0 bolos, nada é consumido
    const rows = [
      { balanceBase: 50, neededBase: 100 },
      { balanceBase: 20, neededBase: 20 },
    ];
    expect(computeProducibleUnits(rows)).toBe(0);
  });

  it("produção progressiva: completar o que faltava libera 1 unidade", () => {
    const rows = [
      { balanceBase: 100, neededBase: 100 },
      { balanceBase: 20, neededBase: 20 },
    ];
    expect(computeProducibleUnits(rows)).toBe(1);
  });

  it("nunca produz número negativo mesmo com saldo negativo hipotético", () => {
    const rows = [{ balanceBase: -10, neededBase: 100 }];
    expect(computeProducibleUnits(rows)).toBe(0);
  });
});
