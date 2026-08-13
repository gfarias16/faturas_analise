import { toMonthLabel } from "./format";
import type { ChartDatum, EntrySplit, Invoice, InvoiceEntry } from "../types";

export type ReconciliationItem = {
  invoiceId: string;
  title: string;
  officialTotal: number;
  importedTotal: number;
  purchasesDebits: number;
  previousBalance: number;
  paymentsCredits: number;
  differenceToOfficial: number;
  differenceToPurchases: number;
  hint: string;
};

export function aggregateCategoryEntries(entries: InvoiceEntry[]): ChartDatum[] {
  const totals = new Map<string, number>();

  for (const entry of entries) {
    const label = entry.category || "Nao atribuido";
    totals.set(label, (totals.get(label) ?? 0) + entry.amount);
  }

  return [...totals.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export function aggregatePersonEntries(entries: InvoiceEntry[]): ChartDatum[] {
  const totals = new Map<string, number>();

  for (const entry of entries) {
    for (const allocation of getEntryAllocations(entry)) {
      totals.set(allocation.label, (totals.get(allocation.label) ?? 0) + allocation.value);
    }
  }

  return [...totals.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export function getEntryAllocations(entry: InvoiceEntry): ChartDatum[] {
  if (entry.splits.length > 0) {
    return entry.splits
      .filter((split) => split.amount > 0)
      .map((split) => ({ label: split.person.trim() || "Nao atribuido", value: split.amount }));
  }

  return [{ label: entry.person.trim() || "Nao atribuido", value: entry.amount }];
}

export function sumEntries(entries: Array<{ amount: number }>): number {
  return entries.reduce((sum, entry) => sum + entry.amount, 0);
}

export function buildDiscrepancyItems(invoices: Invoice[]) {
  return buildReconciliationItems(invoices).filter(
    (item) => Math.abs(item.differenceToOfficial) >= 0.01 || Math.abs(item.differenceToPurchases) >= 0.01,
  );
}

export function buildReconciliationItems(invoices: Invoice[]): ReconciliationItem[] {
  return invoices.map((invoice) => {
    const importedTotal = sumEntries(invoice.entries);
    const officialTotal = invoice.totalAmount || importedTotal;
    const purchasesDebits = invoice.summary.purchasesDebits || importedTotal;
    const previousBalance = invoice.summary.previousBalance || 0;
    const paymentsCredits = invoice.summary.paymentsCredits || 0;
    const differenceToOfficial = roundCurrency(importedTotal - officialTotal);
    const differenceToPurchases = roundCurrency(importedTotal - purchasesDebits);

    return {
      invoiceId: invoice.id,
      title: `${invoice.cardName} - ${toMonthLabel(invoice.referenceMonth)}`,
      officialTotal,
      importedTotal,
      purchasesDebits,
      previousBalance,
      paymentsCredits,
      differenceToOfficial,
      differenceToPurchases,
      // Explica a causa mais provavel para a divergencia, separando falta de lancamento de itens financeiros.
      hint: inferReconciliationHint({
        differenceToOfficial,
        differenceToPurchases,
        previousBalance,
        paymentsCredits,
      }),
    };
  });
}

export function buildFutureInstallments(invoices: Invoice[]) {
  const totals = new Map<string, { amount: number; count: number }>();

  for (const invoice of invoices) {
    for (const entry of invoice.entries) {
      if (!entry.installment || entry.installment.current >= entry.installment.total) {
        continue;
      }

      const remaining = entry.installment.total - entry.installment.current;
      for (let offset = 1; offset <= remaining; offset += 1) {
        const monthKey = addMonths(invoice.referenceMonth, offset);
        const current = totals.get(monthKey) ?? { amount: 0, count: 0 };
        current.amount += entry.amount;
        current.count += 1;
        totals.set(monthKey, current);
      }
    }
  }

  return [...totals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, data]) => ({
      month,
      amount: data.amount,
      count: data.count,
    }));
}

export function matchesEntryFilters(
  entry: InvoiceEntry,
  invoice: Invoice,
  filters: { month: string; card: string; person: string; categories: string[] },
) {
  return (
    (filters.card === "all" || invoice.cardName === filters.card) &&
    (filters.month === "all" || invoice.referenceMonth === filters.month) &&
    (filters.categories.length === 0 || filters.categories.includes(entry.category)) &&
    (filters.person === "all" ||
      entry.person === filters.person ||
      entry.splits.some((split) => split.person === filters.person))
  );
}

export function createSplit(person: string, amount: number, percentage: number): EntrySplit {
  return {
    id: crypto.randomUUID(),
    person,
    amount,
    percentage,
  };
}

export function normalizeSplits(amount: number, splitType: InvoiceEntry["splitType"], splits: EntrySplit[]): EntrySplit[] {
  const sanitized = splits.map((split) => ({
    ...split,
    person: split.person ?? "",
    amount: roundCurrency(Math.max(0, split.amount || 0)),
    percentage: roundCurrency(Math.max(0, split.percentage || 0)),
  }));

  if (splitType === "percentage") {
    if (sanitized.length === 0) {
      return [];
    }

    let allocated = 0;
    const equalPercentage = roundCurrency(100 / sanitized.length);

    return sanitized.map((split, index) => {
      const percentage = index === sanitized.length - 1 ? roundCurrency(100 - equalPercentage * index) : equalPercentage;
      const nextAmount =
        index === sanitized.length - 1
          ? roundCurrency(amount - allocated)
          : roundCurrency((amount * percentage) / 100);
      allocated += nextAmount;
      return {
        ...split,
        percentage,
        amount: nextAmount,
      };
    });
  }

  if (splitType === "fixed") {
    return sanitized.map((split) => ({
      ...split,
      percentage: amount > 0 ? roundCurrency((split.amount / amount) * 100) : 0,
    }));
  }

  return [];
}

export function summarizeSplits(entry: InvoiceEntry): string {
  if (entry.splitType === "none" || entry.splits.length === 0) {
    return "Sem rateio configurado.";
  }

  const totalAmount = roundCurrency(entry.splits.reduce((sum, split) => sum + split.amount, 0));
  const amountDifference = roundCurrency(entry.amount - totalAmount);

  if (entry.splitType === "percentage") {
    return `Divisao igual entre ${entry.splits.length} pessoa(s). Valor por pessoa recalculado automaticamente.`;
  }

  return `Rateado: ${formatCurrencyCompact(totalAmount)}. Diferenca: ${formatCurrencyCompact(amountDifference)}.`;
}

function inferReconciliationHint({
  differenceToOfficial,
  differenceToPurchases,
  previousBalance,
  paymentsCredits,
}: {
  differenceToOfficial: number;
  differenceToPurchases: number;
  previousBalance: number;
  paymentsCredits: number;
}) {
  if (Math.abs(differenceToPurchases) >= 0.01) {
    if (differenceToPurchases < 0) {
      return "Provavel falta de lancamentos ou debitos nao importados na leitura do PDF.";
    }

    return "Os lancamentos importados ficaram acima do resumo de compras. Vale revisar duplicidades ou leitura indevida.";
  }

  if (Math.abs(differenceToOfficial) >= 0.01) {
    if (previousBalance > 0 || paymentsCredits > 0) {
      return "As compras importadas batem com o resumo de compras. A diferenca para o total oficial parece vir de saldo anterior, creditos, pagamentos ou outros ajustes financeiros.";
    }

    return "As compras importadas batem com o resumo de compras, mas o total oficial ainda difere. Verifique tarifas, encargos ou ajustes fora da tabela principal.";
  }

  return "Conciliacao ok: compras importadas e total oficial estao alinhados.";
}

function addMonths(monthKey: string, offset: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatCurrencyCompact(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}
