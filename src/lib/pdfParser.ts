import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { InvoiceDraft, InvoiceEntry } from "../types";
import { pickLearnedCategory, type CategoryRules } from "./categoryLearning";
import { normalizeText, slugify } from "./format";

GlobalWorkerOptions.workerSrc = pdfWorker;

type TextToken = {
  text: string;
  page: number;
  x: number;
  y: number;
};

type AmountMatch = {
  raw: string;
  index: number;
  value: number;
};

const CATEGORY_MAP: Array<{ match: string[]; category: string }> = [
  { match: ["mercado", "supermercado", "atacadao", "carrefour", "assai"], category: "Mercado" },
  { match: ["ifood", "restaurante", "lanch", "padaria", "cafeteria"], category: "Alimentacao" },
  { match: ["uber", "99", "posto", "shell", "ipiranga", "combust"], category: "Transporte" },
  { match: ["netflix", "spotify", "prime video", "youtube", "disney"], category: "Assinaturas" },
  { match: ["farmacia", "drogaria", "droga", "venancio"], category: "Farmacia e saude" },
  { match: ["magalu", "mercado livre", "amazon", "shopee", "americanas"], category: "Compras online" },
  { match: ["energia", "agua", "condominio", "internet", "telefone"], category: "Casa" },
  { match: ["apple", "google", "hotmart", "livelo"], category: "Servicos digitais" },
  { match: ["jetsmart", "gol", "latam", "azul"], category: "Viagens" },
  { match: ["nalin", "riachuelo", "casasbahia", "bell art"], category: "Vestuario" },
  { match: ["barber", "beleza", "floricultura", "jardim bellus", "bellus"], category: "Cuidados pessoais" },
  { match: ["pet x", "pet ", "petshop"], category: "Pet" },
  { match: ["curso", "curs", "yescom"], category: "Educacao e eventos" },
  { match: ["jae"], category: "Mobilidade urbana" },
  { match: ["pix", "99pay", "mp ", "mercadopago"], category: "Carteiras e transferencias" },
  { match: ["bombonieri", "doces", "salgados", "galeto"], category: "Lanches e doces" },
  { match: ["pao de queijo", "lanchonete"], category: "Cafes e lanches" },
  { match: ["anuidade"], category: "Tarifas do cartao" },
  { match: ["totalpass"], category: "Saude e academia" },
];

const ENTRY_PREFIX = /^(\d{2})\/(\d{2})(?:\/(\d{2,4}))?\s+/;
const MONEY_PATTERN = /-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}/g;
const INSTALLMENT_PATTERN = /(?:parc(?:ela)?\s*)?(\d{1,2})\s*\/\s*(\d{1,2})/i;
const IGNORED_LINE_TOKENS = [
  "total",
  "pagamento",
  "saldo",
  "limite",
  "vencimento",
  "fechamento",
  "encargos",
  "juros",
  "anuidade",
  "rotativo",
  "parcelamento de fatura",
  "saque",
  "credito",
  "debito automatico",
];
const ENTRY_END_TOKENS = [
  "total para ",
  "total da fatura em real",
];
const HARD_SKIP_TOKENS = [
  "pag boleto",
  "credito",
  "pagamento recebido",
  "saldo anterior",
  "compras/debitos",
  "reversao de compra",
];

export async function parseInvoicePdf(file: File, categoryRules: CategoryRules = {}): Promise<InvoiceDraft> {
  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: buffer }).promise;
  const tokens: TextToken[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();

    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) {
        continue;
      }

      tokens.push({
        text: item.str.trim(),
        page: pageNumber,
        x: Array.isArray(item.transform) ? item.transform[4] : 0,
        y: Array.isArray(item.transform) ? item.transform[5] : 0,
      });
    }
  }

  const pageLines = buildPageLines(tokens);
  const text = pageLines.flatMap((page) => page.lines).join("\n");
  const draft = parseInvoiceText(text, file.name, categoryRules);
  const invoiceId = slugify(`${draft.fileName}-${draft.referenceMonth}-${draft.cardName}`) || crypto.randomUUID();
  const entries = extractEntriesFromPages(pageLines, invoiceId, draft.referenceMonth, categoryRules);
  const summary = extractInvoiceSummary(pageLines, text);
  const totalAmount = extractOfficialTotalAmount(pageLines, text) || draft.totalAmount;

  return {
    ...draft,
    totalAmount,
    summary,
    entries,
    sourceText: text,
  };
}

function buildPageLines(tokens: TextToken[]): Array<{ page: number; lines: string[] }> {
  const grouped = new Map<string, TextToken[]>();

  for (const token of tokens) {
    const key = `${token.page}:${Math.round(token.y)}`;
    const current = grouped.get(key) ?? [];
    current.push(token);
    grouped.set(key, current);
  }

  const merged = [...grouped.entries()]
    .sort((a, b) => {
      const [pageA, yA] = a[0].split(":").map(Number);
      const [pageB, yB] = b[0].split(":").map(Number);
      return pageA === pageB ? yB - yA : pageA - pageB;
    })
    .map(([, items]) =>
      items
        .sort((a, b) => a.x - b.x)
        .map((item) => item.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);

  const byPage = new Map<number, string[]>();
  for (const [key, line] of [...grouped.entries()]
    .sort((a, b) => {
      const [pageA, yA] = a[0].split(":").map(Number);
      const [pageB, yB] = b[0].split(":").map(Number);
      return pageA === pageB ? yB - yA : pageA - pageB;
    })
    .map(([key, items]) => [
      key,
      items
        .sort((a, b) => a.x - b.x)
        .map((item) => item.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    ] as const)
    .filter(([, line]) => Boolean(line))) {
    const [page] = key.split(":").map(Number);
    const current = byPage.get(page) ?? [];
    current.push(line);
    byPage.set(page, current);
  }

  return [...byPage.entries()].map(([page, lines]) => ({ page, lines }));
}

export function parseInvoiceText(
  text: string,
  fileName = "fatura.pdf",
  categoryRules: CategoryRules = {},
): InvoiceDraft {
  const cleanedLines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const dueDate = pickDate(text, /(vencimento|vence em|pagamento ate)\D{0,20}(\d{2}\/\d{2}\/\d{4})/i);
  const closingDate = pickDate(text, /(fechamento|fecha em)\D{0,20}(\d{2}\/\d{2}\/\d{4})/i);
  const totalAmount = pickAmount(
    text,
    /(total(?: da fatura| a pagar)?|valor total|pagamento minimo)\D{0,20}(-?\d[\d.]*,\d{2})/i,
  );
  const referenceMonth = inferReferenceMonth({ fileName, dueDate, closingDate, text });
  const cardName = inferCardName(text, fileName);
  return {
    fileName,
    cardName,
    referenceMonth,
    dueDate,
    closingDate,
    totalAmount,
    summary: {
      previousBalance: 0,
      paymentsCredits: 0,
      purchasesDebits: 0,
    },
    entries: extractEntries(cleanedLines, crypto.randomUUID(), referenceMonth, categoryRules),
    sourceText: text,
  };
}

function inferCardName(text: string, fileName: string): string {
  const textBase = `${text}\n${fileName}`;

  if (/bradesco/i.test(textBase)) {
    return "Bradesco Cartoes";
  }

  if (/nubank/i.test(textBase)) {
    return "Nubank";
  }

  if (/itau|ita[uú]/i.test(textBase)) {
    return "Itau";
  }

  return "Cartao importado";
}

function pickDate(text: string, pattern: RegExp): string {
  const match = text.match(pattern);
  return match?.[2] ?? "";
}

function pickAmount(text: string, pattern: RegExp): number {
  const match = text.match(pattern);
  return match ? parseBrazilianCurrency(match[2]) : 0;
}

function extractOfficialTotalAmount(
  pages: Array<{ page: number; lines: string[] }>,
  text: string,
): number {
  const firstPageLines = pages.find((page) => page.page === 1)?.lines ?? [];

  const summaryAmount = findSummaryTotal(firstPageLines);
  if (summaryAmount) {
    return summaryAmount;
  }

  const headerAmount = findAmountNearLabel(firstPageLines, "total de fatura");
  if (headerAmount) {
    return headerAmount;
  }

  const paymentAmount = findAmountNearLabel(firstPageLines, "pagamento total");
  if (paymentAmount) {
    return paymentAmount;
  }

  const fallbackPatterns = [
    /total de fatura[\s\S]{0,40}r\$\s*(\d[\d.]*,\d{2})/i,
    /pagamento total[\s\S]{0,40}r\$\s*(\d[\d.]*,\d{2})/i,
    /resumo da fatura[\s\S]{0,120}\(=\)\s*total[\s\S]{0,30}r\$\s*(\d[\d.]*,\d{2})/i,
  ];

  for (const pattern of fallbackPatterns) {
    const match = text.match(pattern);
    if (match) {
      return parseBrazilianCurrency(match[1]);
    }
  }

  return 0;
}

function extractInvoiceSummary(
  pages: Array<{ page: number; lines: string[] }>,
  text: string,
): { previousBalance: number; paymentsCredits: number; purchasesDebits: number } {
  const firstPageLines = pages.find((page) => page.page === 1)?.lines ?? [];

  const previousBalance = findAmountNearLabel(firstPageLines, "saldo anterior");
  const paymentsCredits = findAmountNearLabel(firstPageLines, "creditos/pagamentos");
  const purchasesDebits = findAmountNearLabel(firstPageLines, "compras/debitos");

  if (previousBalance || paymentsCredits || purchasesDebits) {
    return {
      previousBalance,
      paymentsCredits,
      purchasesDebits,
    };
  }

  return {
    previousBalance: extractSummaryValueFromText(text, /saldo anterior[\s\S]{0,30}r\$\s*(\d[\d.]*,\d{2})/i),
    paymentsCredits: extractSummaryValueFromText(text, /creditos\/pagamentos[\s\S]{0,30}r\$\s*(\d[\d.]*,\d{2})/i),
    purchasesDebits: extractSummaryValueFromText(text, /compras\/debitos[\s\S]{0,30}r\$\s*(\d[\d.]*,\d{2})/i),
  };
}

function findAmountNearLabel(lines: string[], label: string): number {
  for (let index = 0; index < lines.length; index += 1) {
    const normalized = normalizeText(lines[index]);
    if (!normalized.includes(label)) {
      continue;
    }

    for (let offset = 0; offset <= 2; offset += 1) {
      const candidate = lines[index + offset];
      const amount = extractCurrencyValue(candidate);
      if (amount) {
        return amount;
      }
    }
  }

  return 0;
}

function extractSummaryValueFromText(text: string, pattern: RegExp): number {
  const match = text.match(pattern);
  return match ? parseBrazilianCurrency(match[1]) : 0;
}

function findSummaryTotal(lines: string[]): number {
  const summaryIndex = lines.findIndex((line) => normalizeText(line).includes("resumo da fatura"));
  if (summaryIndex === -1) {
    return 0;
  }

  for (let index = summaryIndex; index < Math.min(summaryIndex + 8, lines.length); index += 1) {
    const normalized = normalizeText(lines[index]);
    if (normalized.includes("(=)total") || normalized.includes("total.................................... r$")) {
      const amount = extractCurrencyValue(lines[index]) || extractCurrencyValue(lines[index + 1]);
      if (amount) {
        return amount;
      }
    }
  }

  return 0;
}

function extractCurrencyValue(line?: string): number {
  if (!line) {
    return 0;
  }

  const matches = [...line.matchAll(MONEY_PATTERN)].map((match) => parseBrazilianCurrency(match[0]));
  if (matches.length === 0) {
    return 0;
  }

  return matches[matches.length - 1];
}

function inferReferenceMonth({
  fileName,
  dueDate,
  closingDate,
  text,
}: {
  fileName: string;
  dueDate: string;
  closingDate: string;
  text: string;
}): string {
  const explicitMonth = text.match(/(\d{2})\/(\d{4})/);
  if (explicitMonth) {
    return `${explicitMonth[2]}-${explicitMonth[1]}`;
  }

  const chosenDate = dueDate || closingDate;
  if (chosenDate) {
    const [, month, year] = chosenDate.split("/");
    return `${year}-${month}`;
  }

  const fileMatch = fileName.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (fileMatch) {
    return `${fileMatch[3]}-${fileMatch[2]}`;
  }

  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function extractEntries(
  lines: string[],
  invoiceId: string,
  referenceMonth: string,
  categoryRules: CategoryRules,
): InvoiceEntry[] {
  const entries: InvoiceEntry[] = [];
  const year = Number(referenceMonth.slice(0, 4));
  const month = Number(referenceMonth.slice(5, 7));

  for (const line of lines) {
    const parsed = parseEntryLine(line, year, month);
    if (!parsed) {
      continue;
    }

    entries.push({
      id: crypto.randomUUID(),
      invoiceId,
      date: parsed.date,
      description: parsed.description,
      amount: parsed.amount,
      amountConfidence: parsed.amountConfidence,
      category: categorizeDescription(parsed.description, categoryRules),
      person: "",
      notes: "",
      rawLine: line,
      installment: parsed.installment,
    });
  }

  return reconcileReversals(dedupeEntries(entries));
}

function extractEntriesFromPages(
  pages: Array<{ page: number; lines: string[] }>,
  invoiceId: string,
  referenceMonth: string,
  categoryRules: CategoryRules,
): InvoiceEntry[] {
  const year = Number(referenceMonth.slice(0, 4));
  const month = Number(referenceMonth.slice(5, 7));
  const entries: InvoiceEntry[] = [];
  let insideLaunches = false;

  for (const page of pages) {
    let pageStarted = false;

    for (const line of page.lines) {
      const normalized = normalizeText(line);

      if (!insideLaunches && normalized.includes("lancamentos")) {
        insideLaunches = true;
        pageStarted = true;
        continue;
      }

      if (!insideLaunches) {
        continue;
      }

      if (ENTRY_END_TOKENS.some((token) => normalized.includes(token))) {
        insideLaunches = false;
        break;
      }

      if (pageStarted && /^(data|historico de lancamentos|cidade|us\$|cotacao|r\$)/i.test(normalized)) {
        continue;
      }

      const parsed = parseEntryLine(line, year, month);
      if (!parsed) {
        continue;
      }

      entries.push({
        id: crypto.randomUUID(),
        invoiceId,
        date: parsed.date,
        description: parsed.description,
        amount: parsed.amount,
        amountConfidence: parsed.amountConfidence,
        category: categorizeDescription(parsed.description, categoryRules),
        person: "",
        notes: "",
        rawLine: line,
        installment: parsed.installment,
      });
    }
  }

  return reconcileReversals(dedupeEntries(entries));
}

function parseEntryLine(line: string, statementYear: number, statementMonth: number) {
  const prefixMatch = line.match(ENTRY_PREFIX);
  if (!prefixMatch) {
    return null;
  }

  const [, day, lineMonth, lineYear] = prefixMatch;
  const descriptionAndValues = line.slice(prefixMatch[0].length).trim();
  const normalizedLine = normalizeText(descriptionAndValues);

  if (IGNORED_LINE_TOKENS.some((token) => normalizedLine.includes(token))) {
    return null;
  }

  if (HARD_SKIP_TOKENS.some((token) => normalizedLine.includes(token))) {
    return null;
  }

  const amounts: AmountMatch[] = [...descriptionAndValues.matchAll(MONEY_PATTERN)].map((match) => ({
    raw: match[0],
    index: match.index ?? 0,
    value: parseBrazilianCurrency(match[0]),
  }));

  if (amounts.length === 0) {
    return null;
  }

  if (/\s-\s*$/.test(descriptionAndValues) || /-\s*$/.test(descriptionAndValues)) {
    return null;
  }

  const installment = parseInstallment(descriptionAndValues);
  const amountInfo = chooseAmount(amounts, installment);
  if (!amountInfo || amountInfo.value <= 0) {
    return null;
  }

  const rawDescription = descriptionAndValues.slice(0, amountInfo.index).trim();
  const description = cleanupDescription(rawDescription || descriptionAndValues);
  if (description.length < 3) {
    return null;
  }

  const parsedMonth = Number(lineMonth);
  const parsedYear = lineYear
    ? normalizeYear(lineYear)
    : adjustYearByStatement(statementYear, statementMonth, parsedMonth);

  return {
    date: `${String(day).padStart(2, "0")}/${String(parsedMonth).padStart(2, "0")}/${parsedYear}`,
    description,
    amount: amountInfo.value,
    amountConfidence: amountInfo.confidence,
    installment,
  };
}

function chooseAmount(
  amounts: AmountMatch[],
  installment: { current: number; total: number } | null,
) {
  if (amounts.length === 1) {
    return {
      index: amounts[0].index,
      value: amounts[0].value,
      confidence: "high" as const,
    };
  }

  const rightmost = amounts[amounts.length - 1];
  const beforeRightmost = amounts[amounts.length - 2];

  if (installment && beforeRightmost.value > rightmost.value) {
    return {
      index: rightmost.index,
      value: rightmost.value,
      confidence: "high" as const,
    };
  }

  return {
    index: rightmost.index,
    value: rightmost.value,
    confidence: "medium" as const,
  };
}

function parseInstallment(text: string) {
  const match = text.match(INSTALLMENT_PATTERN);
  if (!match) {
    return null;
  }

  const current = Number(match[1]);
  const total = Number(match[2]);

  if (!current || !total || current > total) {
    return null;
  }

  return { current, total };
}

function cleanupDescription(description: string): string {
  return description
    .replace(/\s{2,}/g, " ")
    .replace(/[|]+/g, " ")
    .replace(/\s+-\s+/g, " ")
    .trim();
}

function parseBrazilianCurrency(value: string): number {
  return Number(value.replace(/\./g, "").replace(",", "."));
}

function normalizeYear(value: string): number {
  return value.length === 2 ? Number(`20${value}`) : Number(value);
}

function adjustYearByStatement(statementYear: number, statementMonth: number, entryMonth: number): number {
  if (entryMonth > statementMonth && statementMonth <= 2) {
    return statementYear - 1;
  }

  return statementYear;
}

function categorizeDescription(description: string, categoryRules: CategoryRules): string {
  const learnedCategory = pickLearnedCategory(description, categoryRules);
  if (learnedCategory) {
    return learnedCategory;
  }

  const normalized = normalizeText(description);

  for (const rule of CATEGORY_MAP) {
    if (rule.match.some((token) => normalized.includes(token))) {
      return rule.category;
    }
  }

  if (/^[a-z]+\s+[a-z]+/i.test(description)) {
    return "Comercio local";
  }

  return "Outros / revisar";
}

function dedupeEntries(entries: InvoiceEntry[]): InvoiceEntry[] {
  const seen = new Set<string>();
  const result: InvoiceEntry[] = [];

  for (const entry of entries) {
    const key = `${entry.date}-${entry.description}-${entry.amount}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(entry);
  }

  return result;
}

function reconcileReversals(entries: InvoiceEntry[]): InvoiceEntry[] {
  const removalIds = new Set<string>();
  const reversals = entries.filter((entry) => isReversalEntry(entry.description));

  for (const reversal of reversals) {
    removalIds.add(reversal.id);

    const original = entries.find(
      (entry) =>
        entry.id !== reversal.id &&
        !isReversalEntry(entry.description) &&
        Math.abs(entry.amount - reversal.amount) < 0.001,
    );

    if (original) {
      removalIds.add(original.id);
    }
  }

  return entries.filter((entry) => !removalIds.has(entry.id));
}

function isReversalEntry(description: string): boolean {
  const normalized = normalizeText(description);
  return normalized.includes("reversao de compra") || normalized.includes("estorno");
}
