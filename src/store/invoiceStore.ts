import { useEffect, useMemo, useReducer } from "react";
import type { DashboardFilters, Invoice, InvoiceDraft, InvoiceEntry } from "../types";
import { buildMerchantSignature, type CategoryRules } from "../lib/categoryLearning";
import { toMonthLabel } from "../lib/format";

const STORAGE_KEY = "faturas-analise-storage-v1";

type InvoiceState = {
  invoices: Invoice[];
  filters: DashboardFilters;
  categoryRules: CategoryRules;
};

type InvoiceAction =
  | { type: "importInvoice"; payload: InvoiceDraft }
  | { type: "updateEntry"; payload: { invoiceId: string; entryId: string; changes: Partial<InvoiceEntry> } }
  | { type: "deleteInvoice"; payload: { invoiceId: string } }
  | { type: "setFilters"; payload: Partial<DashboardFilters> }
  | { type: "setCategoryRule"; payload: { signature: string; category: string } }
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
      const nextCategory = action.payload.changes.category;
      const nextRules = { ...state.categoryRules };

      if (nextCategory && nextDescription) {
        const signature = buildMerchantSignature(nextDescription);
        if (signature) {
          nextRules[signature] = nextCategory;
        }
      }

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
          [signature]: category,
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
          amountConfidence: entry.amountConfidence ?? "high",
          installment: entry.installment ?? null,
        })),
      })),
      filters: {
        ...initialState.filters,
        ...parsed.filters,
        categories: Array.isArray(parsed.filters?.categories) ? parsed.filters.categories : [],
      },
      categoryRules: parsed.categoryRules ?? {},
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
    state.invoices.flatMap((invoice) => invoice.entries.map((entry) => entry.person)).filter(Boolean),
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
        (state.filters.person === "all" || entry.person === state.filters.person) &&
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

function uniqueValues(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
