import { describe, expect, it } from "vitest";
import {
  computeLockoutUntil,
  emailSchema,
  loginPasswordSchema,
  LOCKOUT_BASE_MS,
  LOCKOUT_THRESHOLD,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  newPasswordSchema,
} from "./auth-validation";

describe("emailSchema", () => {
  it("aceita e-mail válido e corta espaço nas pontas", () => {
    expect(emailSchema.parse("  a@b.com  ")).toBe("a@b.com");
  });

  it("rejeita e-mail inválido", () => {
    expect(emailSchema.safeParse("não-é-email").success).toBe(false);
  });

  it("normaliza maiúsculas para minúsculas", () => {
    expect(emailSchema.parse("Nome@Exemplo.COM")).toBe("nome@exemplo.com");
  });
});

describe("newPasswordSchema (cadastro/redefinição)", () => {
  it(`rejeita senha com ${MIN_PASSWORD_LENGTH - 1} caracteres`, () => {
    const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);
    expect(newPasswordSchema.safeParse(short).success).toBe(false);
  });

  it(`aceita senha no mínimo exato de ${MIN_PASSWORD_LENGTH} caracteres`, () => {
    const exact = "a".repeat(MIN_PASSWORD_LENGTH);
    expect(newPasswordSchema.safeParse(exact).success).toBe(true);
  });

  it(`aceita senha longa até ${MAX_PASSWORD_LENGTH} caracteres`, () => {
    const long = "a".repeat(MAX_PASSWORD_LENGTH);
    expect(newPasswordSchema.safeParse(long).success).toBe(true);
  });

  it(`rejeita senha acima de ${MAX_PASSWORD_LENGTH} caracteres`, () => {
    const tooLong = "a".repeat(MAX_PASSWORD_LENGTH + 1);
    expect(newPasswordSchema.safeParse(tooLong).success).toBe(false);
  });

  it("aceita espaço e caractere unicode sem alterar o valor", () => {
    const withUnicode = "correto cavalo bateria ê ñ 漢字!";
    const result = newPasswordSchema.safeParse(withUnicode);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(withUnicode);
  });
});

describe("loginPasswordSchema", () => {
  it("rejeita senha vazia", () => {
    expect(loginPasswordSchema.safeParse("").success).toBe(false);
  });

  it("aceita senha curta (conta antiga pode ter nascido sob política mais frouxa)", () => {
    expect(loginPasswordSchema.safeParse("123456").success).toBe(true);
  });

  it(`rejeita acima de ${MAX_PASSWORD_LENGTH} caracteres`, () => {
    expect(loginPasswordSchema.safeParse("a".repeat(MAX_PASSWORD_LENGTH + 1)).success).toBe(false);
  });
});

describe("computeLockoutUntil", () => {
  const now = 1_000_000;

  it("não trava antes do limiar de tentativas", () => {
    for (let attempts = 0; attempts < LOCKOUT_THRESHOLD; attempts += 1) {
      expect(computeLockoutUntil(attempts, now)).toBeNull();
    }
  });

  it("trava por LOCKOUT_BASE_MS na primeira falha do limiar", () => {
    expect(computeLockoutUntil(LOCKOUT_THRESHOLD, now)).toBe(now + LOCKOUT_BASE_MS);
  });

  it("dobra o tempo de espera a cada nova falha além do limiar", () => {
    expect(computeLockoutUntil(LOCKOUT_THRESHOLD + 1, now)).toBe(now + LOCKOUT_BASE_MS * 2);
    expect(computeLockoutUntil(LOCKOUT_THRESHOLD + 2, now)).toBe(now + LOCKOUT_BASE_MS * 4);
    expect(computeLockoutUntil(LOCKOUT_THRESHOLD + 3, now)).toBe(now + LOCKOUT_BASE_MS * 8);
  });
});
