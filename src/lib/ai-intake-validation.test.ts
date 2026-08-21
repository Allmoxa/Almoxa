import { describe, expect, it } from "vitest";
import { ALLOWED_MIME_TYPES, fileSchema, MAX_DATA_URL_LENGTH } from "./ai-intake-validation";

const base = { name: "nota.jpg", mimeType: "image/jpeg" as const };

describe("fileSchema", () => {
  it("aceita um arquivo dentro dos limites", () => {
    const result = fileSchema.safeParse({ ...base, dataUrl: "data:image/jpeg;base64,AAAA" });
    expect(result.success).toBe(true);
  });

  it("rejeita mimeType fora da allowlist", () => {
    const result = fileSchema.safeParse({
      ...base,
      mimeType: "application/x-msdownload",
      dataUrl: "data:image/jpeg;base64,AAAA",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita dataUrl que não começa com data:", () => {
    // Este é o caso que fecha SSRF: sem o refine, uma URL http faria a API
    // de leitura buscar o endereço escolhido por quem chamou.
    const result = fileSchema.safeParse({
      ...base,
      dataUrl: "http://169.254.169.254/latest/meta-data/",
    });
    expect(result.success).toBe(false);
  });

  it(`rejeita dataUrl acima de ${MAX_DATA_URL_LENGTH} caracteres`, () => {
    const huge = "data:image/jpeg;base64," + "A".repeat(MAX_DATA_URL_LENGTH);
    const result = fileSchema.safeParse({ ...base, dataUrl: huge });
    expect(result.success).toBe(false);
  });

  it("expõe todos os tipos aceitos", () => {
    expect(ALLOWED_MIME_TYPES).toContain("image/jpeg");
    expect(ALLOWED_MIME_TYPES).toContain("application/pdf");
  });
});
