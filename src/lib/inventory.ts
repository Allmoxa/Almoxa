export const currency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);

export const qty = (value: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(value || 0);

export const dateTime = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(
    new Date(value),
  );

export const slugSku = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 20) || "ITEM";

export type Product = {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  purchase_price: number;
  sale_price: number;
  notes: string | null;
  created_at: string;
};

export type Movement = {
  id: string;
  product_id: string;
  kind: "in" | "out";
  quantity: number;
  unit_price: number;
  source: "manual" | "photo" | "document";
  note: string | null;
  created_at: string;
  products?: { name: string; sku: string } | null;
};
