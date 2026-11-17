import { z } from 'zod';

/** Monedas en que se puede registrar el costo de compra (ISO 4217). La moneda por defecto es configurable. */
export const CURRENCIES = ['CLP', 'USD', 'EUR', 'BRL', 'ARS', 'PEN', 'COP', 'MXN'] as const;
export type Currency = (typeof CURRENCIES)[number];
export const currencySchema = z.enum(CURRENCIES);

export const CURRENCY_LABELS: Record<Currency, string> = {
  CLP: 'CLP — Peso chileno',
  USD: 'USD — Dólar estadounidense',
  EUR: 'EUR — Euro',
  BRL: 'BRL — Real brasileño',
  ARS: 'ARS — Peso argentino',
  PEN: 'PEN — Sol peruano',
  COP: 'COP — Peso colombiano',
  MXN: 'MXN — Peso mexicano',
};

export const CURRENCY_OPTIONS = CURRENCIES.map((value) => ({
  value,
  label: CURRENCY_LABELS[value],
}));
