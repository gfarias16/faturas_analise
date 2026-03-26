import { normalizeText } from "./format";

export type CategoryRules = Record<string, string>;

export function buildMerchantSignature(description: string): string {
  return normalizeText(description)
    .replace(/\b\d{1,2}\/\d{1,2}\b/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function pickLearnedCategory(description: string, rules: CategoryRules): string | null {
  const signature = buildMerchantSignature(description);
  return signature ? rules[signature] ?? null : null;
}
