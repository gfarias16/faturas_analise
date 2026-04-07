import { useEffect, useMemo, useReducer } from "react";
import type { DashboardFilters, Invoice, InvoiceDraft, InvoiceEntry } from "../types";
import { mergeLearnedValues, type MerchantLearningRules } from "../lib/categoryLearning";
import { toMonthLabel } from "../lib/format";

const STORAGE_KEY = "faturas-analise-storage-v1";

type InvoiceState = {
  invoices: Invoice[];
  filters: DashboardFilters;
  categoryRules: MerchantLearningRules;
};

type InvoiceAction =
  | { type: "importInvoice"; payload: InvoiceDraft }
  | { type: "updateEntry"; payload: { invoiceId: string; entryId: string; changes: Partial<InvoiceEntry> } }
  | { type: "deleteInvoice"; payload: { invoiceId: string } }
  | { type: "setFilters"; payload: Partial<DashboardFilters> }
  | { type: "setCategoryRule"; payload: { signature: string; category: string } }
  | { type: "setPersonRule"; payload: { signature: string; person: string } }
  | { type: "deleteCategoryRule"; payload: { signature: string } };

const initialState: InvoiceState = {
  invoices: [],
  filters: {
    month: "all",
    card: "all",
    person: "all",
    categories: [],
  },
  categoryRules: {},
};

function reducer(state: InvoiceState, action: InvoiceAction): InvoiceState {
  switch (action.type) {
    case "importInvoice": {
      const invoiceId = crypto.randomUUID();
      const invoice: Invoice = {
        ...action.payload,
        id: invoiceId,
        importedAt: new Date().toISOString(),
        entries: action.payload.entries.map((entry) => ({
          ...entry,
          invoiceId,
        })),
      };

      return {
        ...state,
        invoices: [invoice, ...state.invoices],
        filters: {
          ...state.filters,
          month: invoice.referenceMonth,
          card: invoice.cardName,
          categories: [],
        },
      };
    }
    case "updateEntry": {
      const currentInvoice = state.invoices.find((invoice) => invoice.id === action.payload.invoiceId);
      const currentEntry = currentInvoice?.entries.find((entry) => entry.id === action.payload.entryId);
      const nextDescription = action.payload.changes.description ?? currentEntry?.description ?? "";
      const nextCategory = action.payload.changes.category ?? currentEntry?.category;
      const nextPerson = action.payload.changes.person ?? currentEntry?.person;
      const nextRules =
        nextDescription && currentInvoice
          ? mergeLearnedValues({
              rules: state.categoryRules,
              description: nextDescription,
              cardName: currentInvoice.cardName,
              updates: {
                category: nextCategory?.trim() || undefined,
                person: nextPerson?.trim() || undefined,
              },
            })
          : state.categoryRules;

      return {
        ...state,
        categoryRules: nextRules,
        invoices: state.invoices.map((invoice) =>
          invoice.id !== action.payload.invoiceId
            ? invoice
            : {
                ...invoice,
                entries: invoice.entries.map((entry) =>
                  entry.id === action.payload.entryId ? { ...entry, ...action.payload.changes } : entry,
                ),
              },
        ),
      };
    }
    case "deleteInvoice": {
      return {
        ...state,
        invoices: state.invoices.filter((invoice) => invoice.id !== action.payload.invoiceId),
      };
    }
    case "setFilters": {
      return {
        ...state,
        filters: {
          ...state.filters,
          ...action.payload,
        },
      };
    }
    case "setCategoryRule": {
      const signature = action.payload.signature.trim();
      const category = action.payload.category.trim();

      if (!signature || !category) {
        return state;
      }

      return {
        ...state,
        categoryRules: {
          ...state.categoryRules,
          [signature]: {
            ...(state.categoryRules[signature] ?? {}),
            category,
          },
        },
      };
    }
    case "setPersonRule": {
      const signature = action.payload.signature.trim();
      if (!signature) {
        return state;
      }

      return {
        ...state,
        categoryRules: {
          ...state.categoryRules,
          [signature]: {
            ...(state.categoryRules[signature] ?? {}),
            person: action.payload.person.trim(),
          },
        },
      };
    }
    case "deleteCategoryRule": {
      const nextRules = { ...state.categoryRules };
      delete nextRules[action.payload.signature];

      return {
        ...state,
        categoryRules: nextRules,
      };
    }
    default:
      return state;
  }
}

function loadState(): InvoiceState {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return initialState;
  }

  try {
    const parsed = JSON.parse(stored) as InvoiceState;

    return {
      ...initialState,
        ...parsed,
      invoices: (parsed.invoices ?? []).map((invoice) => ({
        ...invoice,
        summary: {
          ...invoice.summary,
          previousBalance: invoice.summary?.previousBalance ?? 0,
          paymentsCredits: invoice.summary?.paymentsCredits ?? 0,
          purchasesDebits: invoice.summary?.purchasesDebits ?? 0,
        },
        entries: invoice.entries.map((entry) => ({
          ...entry,
          purchaseTime: entry.purchaseTime ?? "",
          amountConfidence: entry.amountConfidence ?? "high",
          installment: entry.installment ?? null,
          splitType: entry.splitType ?? "none",
          splits: (entry.splits ?? []).map((split) => ({
            id: split.id ?? crypto.randomUUID(),
            person: split.person ?? "",
            amount: split.amount ?? 0,
            percentage: split.percentage ?? 0,
          })),
          suspectedDuplicate: entry.suspectedDuplicate ?? false,
          duplicateKey: entry.duplicateKey ?? null,
        })),
      })),
      filters: {
        ...initialState.filters,
        ...parsed.filters,
        categories: Array.isArray(parsed.filters?.categories) ? parsed.filters.categories : [],
      },
      categoryRules: migrateLearningRules(parsed.categoryRules),
    };
  } catch {
    return initialState;
  }
}

export function useInvoiceStore() {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const selectors = useMemo(() => buildSelectors(state), [state]);

  return {
    state,
    selectors,
    categoryRules: state.categoryRules,
    importInvoice: (payload: InvoiceDraft) => dispatch({ type: "importInvoice", payload }),
    updateEntry: (invoiceId: string, entryId: string, changes: Partial<InvoiceEntry>) =>
      dispatch({ type: "updateEntry", payload: { invoiceId, entryId, changes } }),
    deleteInvoice: (invoiceId: string) => dispatch({ type: "deleteInvoice", payload: { invoiceId } }),
    setFilters: (payload: Partial<DashboardFilters>) => dispatch({ type: "setFilters", payload }),
    setCategoryRule: (signature: string, category: string) =>
      dispatch({ type: "setCategoryRule", payload: { signature, category } }),
    setPersonRule: (signature: string, person: string) =>
      dispatch({ type: "setPersonRule", payload: { signature, person } }),
    deleteCategoryRule: (signature: string) =>
      dispatch({ type: "deleteCategoryRule", payload: { signature } }),
  };
}

function buildSelectors(state: InvoiceState) {
  const months = uniqueValues(state.invoices.map((invoice) => invoice.referenceMonth)).map((month) => ({
    value: month,
    label: toMonthLabel(month),
  }));
  const cards = uniqueValues(state.invoices.map((invoice) => invoice.cardName));
  const people = uniqueValues(
    state.invoices
      .flatMap((invoice) =>
        invoice.entries.flatMap((entry) => [
          entry.person,
          ...entry.splits.map((split) => split.person),
        ]),
      )
      .filter(Boolean),
  );
  const categories = uniqueValues(state.invoices.flatMap((invoice) => invoice.entries.map((entry) => entry.category)));

  const filteredInvoices = state.invoices.filter((invoice) => {
    if (state.filters.month !== "all" && invoice.referenceMonth !== state.filters.month) {
      return false;
    }

    if (state.filters.card !== "all" && invoice.cardName !== state.filters.card) {
      return false;
    }

    return true;
  });

  const filteredEntries = filteredInvoices.flatMap((invoice) =>
    invoice.entries.filter(
      (entry) =>
        (state.filters.person === "all" ||
          entry.person === state.filters.person ||
          entry.splits.some((split) => split.person === state.filters.person)) &&
        (state.filters.categories.length === 0 || state.filters.categories.includes(entry.category)),
    ),
  );

  return {
    months,
    cards,
    people,
    categories,
    filteredInvoices,
    filteredEntries,
  };
}

function migrateLearningRules(value: unknown): MerchantLearningRules {
  if (!value || typeof value !== "object") {
    return {};
  }

  const nextRules: MerchantLearningRules = {};

  for (const [signature, rawRule] of Object.entries(value as Record<string, unknown>)) {
    if (typeof rawRule === "string") {
      nextRules[signature] = { category: rawRule };
      continue;
    }

    if (!rawRule || typeof rawRule !== "object") {
      continue;
    }

    const rule = rawRule as {
      category?: unknown;
      person?: unknown;
      byCard?: Record<string, { category?: unknown; person?: unknown }>;
    };

    nextRules[signature] = {
      category: typeof rule.category === "string" ? rule.category : undefined,
      person: typeof rule.person === "string" ? rule.person : undefined,
      byCard: Object.fromEntries(
        Object.entries(rule.byCard ?? {}).map(([card, cardRule]) => [
          card,
          {
            category: typeof cardRule?.category === "string" ? cardRule.category : undefined,
            person: typeof cardRule?.person === "string" ? cardRule.person : undefined,
          },
        ]),
      ),
    };
  }

  return nextRules;
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
