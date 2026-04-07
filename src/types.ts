export type EntrySplit = {
  id: string;
  person: string;
  amount: number;
  percentage: number;
};

export type InvoiceEntry = {
  id: string;
  invoiceId: string;
  date: string;
  purchaseTime: string;
  description: string;
  amount: number;
  amountConfidence: "high" | "medium";
  category: string;
  person: string;
  notes: string;
  rawLine: string;
  installment: {
    current: number;
    total: number;
  } | null;
  splitType: "none" | "percentage" | "fixed";
  splits: EntrySplit[];
  suspectedDuplicate: boolean;
  duplicateKey: string | null;
};

export type Invoice = {
  id: string;
  fileName: string;
  cardName: string;
  referenceMonth: string;
  importedAt: string;
  dueDate: string;
  closingDate: string;
  totalAmount: number;
  summary: {
    previousBalance: number;
    paymentsCredits: number;
    purchasesDebits: number;
  };
  entries: InvoiceEntry[];
  sourceText: string;
};

export type InvoiceDraft = Omit<Invoice, "id" | "importedAt">;

export type DashboardFilters = {
  month: string;
  card: string;
  person: string;
  categories: string[];
};

export type KPIItem = {
  label: string;
  value: string;
  detail: string;
};

export type ChartDatum = {
  label: string;
  value: number;
};
