import { describe, it, expect } from "vitest";
import { tierOf, monthlyFromSpend7d } from "./tier";

// helper: converte mensal desejado em spend7d de entrada
const s7 = (mensal: number) => (mensal * 7) / 30;

describe("monthlyFromSpend7d", () => {
  it("projeta 7d para 30d", () => {
    expect(monthlyFromSpend7d(700)).toBeCloseTo(3000, 5);
  });
});

describe("tierOf — cortes", () => {
  it("mensal 0 → none", () => expect(tierOf(0)).toBe("none"));
  it("mensal 500 → C", () => expect(tierOf(s7(500))).toBe("C"));
  it("mensal 999 → C (logo abaixo do corte B)", () => expect(tierOf(s7(999))).toBe("C"));
  it("mensal 1001 → B (logo acima do corte inferior)", () => expect(tierOf(s7(1001))).toBe("B"));
  it("mensal 3999 → B (logo abaixo do corte A)", () => expect(tierOf(s7(3999))).toBe("B"));
  it("mensal 4001 → A (logo acima do corte A)", () => expect(tierOf(s7(4001))).toBe("A"));
  it("mensal 22000 (FAMEX) → A", () => expect(tierOf(s7(22000))).toBe("A"));
  it("spend7d 700 → mensal 3000 → B (valor inteiro, sem ruído de float)", () => expect(tierOf(700)).toBe("B"));
});
