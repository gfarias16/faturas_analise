import { normalizeText } from "./format";

export type MerchantLearningValue = {
  category?: string;
  person?: string;
};

export type MerchantLearningRule = MerchantLearningValue & {
  byCard?: Record<string, MerchantLearningValue>;
};

export type MerchantLearningRules = Record<string, MerchantLearningRule>;

export function buildMerchantSignature(description: string): string {
  return normalizeText(description)
    .replace(/\b\d{1,2}\/\d{1,2}\b/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function pickLearnedValues(
  description: string,
  cardName: string,
  rules: MerchantLearningRules,
): MerchantLearningValue | null {
  const signature = buildMerchantSignature(description);
  if (!signature) {
    return null;
  }

  const rule = rules[signature];
  if (!rule) {
    return null;
  }

  const cardRule = rule.byCard?.[normalizeCardName(cardName)];
  const category = cardRule?.category ?? rule.category;
  const person = cardRule?.person ?? rule.person;

  if (!category && !person) {
    return null;
  }

  return {
    category,
    person,
  };
}

export function mergeLearnedValues(params: {
  rules: MerchantLearningRules;
  description: string;
  cardName: string;
  updates: MerchantLearningValue;
}): MerchantLearningRules {
  const signature = buildMerchantSignature(params.description);
  if (!signature) {
    return params.rules;
  }

  const cardKey = normalizeCardName(params.cardName);
  const current = params.rules[signature] ?? {};
  const currentCard = current.byCard?.[cardKey] ?? {};
  const nextCard: MerchantLearningValue = {
    category: params.updates.category ?? currentCard.category,
    person: params.updates.person ?? currentCard.person,
  };

  return {
    ...params.rules,
    [signature]: {
      category: params.updates.category ?? current.category,
      person: params.updates.person ?? current.person,
      byCard: {
        ...(current.byCard ?? {}),
        [cardKey]: nextCard,
      },
    },
  };
}

export function normalizeCardName(cardName: string): string {
  return normalizeText(cardName || "geral");
}
