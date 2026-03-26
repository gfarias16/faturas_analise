import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import {
  AlertCircle,
  CalendarDays,
  CreditCard,
  Filter,
  MoonStar,
  PieChart,
  SunMedium,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { parseInvoicePdf } from "./lib/pdfParser";
import { fromInputDate, toCurrency, toInputDate, toMonthLabel } from "./lib/format";
import { useInvoiceStore } from "./store/invoiceStore";
import type { ChartDatum, InvoiceEntry, KPIItem } from "./types";

const THEME_STORAGE_KEY = "faturas-analise-theme";
const CHART_COLORS = ["#2f6bff", "#58a6ff", "#123a7a", "#75d0ff", "#5d7cff", "#8cb8ff"];

export default function App() {
  const {
    state,
    selectors,
    categoryRules,
    importInvoice,
    updateEntry,
    deleteInvoice,
    setFilters,
    setCategoryRule,
    deleteCategoryRule,
  } =
    useInvoiceStore();
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState("");
  const [ruleSearch, setRuleSearch] = useState("");
  const [theme, setTheme] = useState<"gradient" | "light">(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" ? "light" : "gradient";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const selectedMonthLabel =
    state.filters.month === "all" ? "Todos os meses" : toMonthLabel(state.filters.month);
  const selectedDueDates = uniqueTextValues(
    selectors.filteredInvoices.map((invoice) => invoice.dueDate).filter(Boolean),
  );
  const selectedCategories = state.filters.categories;
  const learnedRules = useMemo(
    () => Object.entries(categoryRules).sort((a, b) => a[0].localeCompare(b[0], "pt-BR")),
    [categoryRules],
  );
  const filteredLearnedRules = useMemo(() => {
    const query = ruleSearch.trim().toLocaleLowerCase("pt-BR");

    if (!query) {
      return learnedRules;
    }

    return learnedRules.filter(([signature, category]) => {
      const haystack = `${signature} ${category}`.toLocaleLowerCase("pt-BR");
      return haystack.includes(query);
    });
  }, [learnedRules, ruleSearch]);
  const uncategorizedEntries = selectors.filteredEntries
    .filter((entry) => entry.category === "Outros / revisar")
    .slice(0, 8);

  const reviewCount = selectors.filteredEntries.filter((entry) => entry.amountConfidence === "medium").length;
  const installmentCount = selectors.filteredEntries.filter((entry) => entry.installment).length;

  const kpis = useMemo<KPIItem[]>(() => {
    const officialTotal = selectors.filteredInvoices.reduce(
      (sum, invoice) => sum + (invoice.totalAmount || sumEntries(invoice.entries)),
      0,
    );
    const purchasesDebitsTotal = selectors.filteredInvoices.reduce(
      (sum, invoice) => sum + (invoice.summary.purchasesDebits || sumEntries(invoice.entries)),
      0,
    );
    const paymentsCreditsTotal = selectors.filteredInvoices.reduce(
      (sum, invoice) => sum + (invoice.summary.paymentsCredits || 0),
      0,
    );
    const entriesTotal = selectors.filteredEntries.reduce((sum, entry) => sum + entry.amount, 0);
    const average = selectors.filteredEntries.length ? entriesTotal / selectors.filteredEntries.length : 0;
    const topCategory = aggregateEntries(selectors.filteredEntries, "category")[0];
    const topPerson = aggregateEntries(selectors.filteredEntries, "person")[0];

    return [
      {
        label: "Total a pagar",
        value: toCurrency(officialTotal),
        detail: `${selectors.filteredInvoices.length} faturas oficiais`,
      },
      {
        label: "Total em compras",
        value: toCurrency(purchasesDebitsTotal),
        detail: "soma das compras e debitos da fatura",
      },
      {
        label: "Ja pago / abatido",
        value: toCurrency(paymentsCreditsTotal),
        detail: "pagamentos e creditos descontados",
      },
      {
        label: "Media por compra",
        value: toCurrency(average),
        detail: `${selectors.filteredEntries.length} compras identificadas`,
      },
    ];
  }, [selectors.filteredEntries, selectors.filteredInvoices]);

  const categoryData = useMemo<ChartDatum[]>(
    () => aggregateEntries(selectors.filteredEntries, "category").slice(0, 6),
    [selectors.filteredEntries],
  );

  const personData = useMemo<ChartDatum[]>(
    () => aggregateEntries(selectors.filteredEntries.filter((entry) => entry.person), "person").slice(0, 6),
    [selectors.filteredEntries],
  );

  const monthlyData = useMemo<ChartDatum[]>(() => {
    const totals = new Map<string, number>();

    for (const invoice of state.invoices) {
      totals.set(
        invoice.referenceMonth,
        (totals.get(invoice.referenceMonth) ?? 0) + (invoice.totalAmount || 0),
      );
    }

    return [...totals.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, value]) => ({
        label: toMonthLabel(label),
        value,
      }));
  }, [state.invoices]);

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setIsImporting(true);
    setError("");

    try {
      const draft = await parseInvoicePdf(file, categoryRules);
      importInvoice(draft);
    } catch (importError) {
      console.error(importError);
      setError(
        "Nao foi possivel ler esta fatura. A leitura foi reforcada, mas ainda pode exigir ajuste fino conforme o layout real do PDF.",
      );
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero-copy">
          <div className="hero-topbar">
            <span className="eyebrow">Analise de faturas em PDF</span>
            <button
              type="button"
              className="theme-toggle"
              onClick={() => setTheme((current) => (current === "gradient" ? "light" : "gradient"))}
            >
              {theme === "gradient" ? <SunMedium size={16} /> : <MoonStar size={16} />}
              <span>{theme === "gradient" ? "Tema claro" : "Tema azul"}</span>
            </button>
          </div>

          <h1>Análise de faturas PDF.</h1>
          <p>
            Faça suas análises de forma rápida e eficiente.
          </p>
        </div>

        <label className="upload-card">
          <input type="file" accept="application/pdf" onChange={handleImport} disabled={isImporting} />
          <Upload size={22} />
          <strong>{isImporting ? "Lendo fatura..." : "Importar PDF da fatura"}</strong>
          <span>Selecione um PDF para extrair e carregar os gastos na interface.</span>
        </label>
      </header>

      <main className="content-grid">
        <section className="panel filters-panel">
          <div className="panel-heading">
            <Filter size={18} />
            <h2>Filtros</h2>
          </div>

          <div className="filter-grid">
            <label>
              <span>Mes</span>
              <select value={state.filters.month} onChange={(e) => setFilters({ month: e.target.value })}>
                <option value="all">Todos</option>
                {selectors.months.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Cartao</span>
              <select value={state.filters.card} onChange={(e) => setFilters({ card: e.target.value })}>
                <option value="all">Todos</option>
                {selectors.cards.map((card) => (
                  <option key={card} value={card}>
                    {card}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Pessoa</span>
              <select value={state.filters.person} onChange={(e) => setFilters({ person: e.target.value })}>
                <option value="all">Todas</option>
                {selectors.people.map((person) => (
                  <option key={person} value={person}>
                    {person}
                  </option>
                ))}
              </select>
            </label>

          </div>

          <div className="helper-block">
            <div>
              <strong>{selectedMonthLabel}</strong>
              <span>{selectors.filteredInvoices.length} faturas no recorte atual</span>
              {selectedDueDates.length > 0 ? (
                <span className="due-date">
                  <CalendarDays size={14} />
                  Vencimento: {selectedDueDates.join(", ")}
                </span>
              ) : null}
            </div>
            <div className="helper-metrics">
              <span>{installmentCount} parcelados</span>
              <span>{reviewCount} para revisar</span>
            </div>
          </div>
        </section>

        {error ? (
          <section className="panel error-panel">
            <AlertCircle size={18} />
            <p>{error}</p>
          </section>
        ) : null}

        <section className="kpi-grid">
          {kpis.map((item) => (
            <article className="panel kpi-card" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.detail}</small>
            </article>
          ))}
        </section>

        <section className="charts-grid">
          <article className="panel chart-card">
            <div className="panel-heading">
              <PieChart size={18} />
              <h2>Gastos por categoria</h2>
            </div>
            <div className="category-selector">
              <label className="category-check all-check">
                <input
                  type="checkbox"
                  checked={selectedCategories.length === 0}
                  onChange={() => setFilters({ categories: [] })}
                />
                <span>Todas as categorias</span>
              </label>
              <div className="category-check-grid">
                {selectors.categories.map((category) => {
                  const checked = selectedCategories.includes(category);
                  return (
                    <label className="category-check" key={category}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? selectedCategories.filter((item) => item !== category)
                            : [...selectedCategories, category];
                          setFilters({ categories: next });
                        }}
                      />
                      <span>{category}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <ChartContainer empty={categoryData.length === 0}>
              <ResponsiveContainer width="100%" height={300}>
                <RechartsPieChart>
                  <Pie data={categoryData} dataKey="value" nameKey="label" innerRadius={64} outerRadius={104}>
                    {categoryData.map((entry, index) => (
                      <Cell key={entry.label} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => toCurrency(Number(value))} />
                </RechartsPieChart>
              </ResponsiveContainer>
            </ChartContainer>
          </article>

          <article className="panel chart-card">
            <div className="panel-heading">
              <UserRound size={18} />
              <h2>Gastos por pessoa</h2>
            </div>
            <ChartContainer empty={personData.length === 0}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={personData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" />
                  <YAxis tickFormatter={(value) => `R$${value}`} />
                  <Tooltip formatter={(value) => toCurrency(Number(value))} />
                  <Bar dataKey="value" fill="#2f6bff" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </article>

          <article className="panel chart-card full-width">
            <div className="panel-heading">
              <CreditCard size={18} />
              <h2>Evolucao mensal</h2>
            </div>
            <ChartContainer empty={monthlyData.length === 0}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" />
                  <YAxis tickFormatter={(value) => `R$${value}`} />
                  <Tooltip formatter={(value) => toCurrency(Number(value))} />
                  <Bar dataKey="value" fill="#58a6ff" radius={[10, 10, 0, 0]} barSize={88} maxBarSize={88} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </article>
        </section>

        <section className="panel insights-panel">
          <div className="panel-heading">
            <AlertCircle size={18} />
            <h2>Categorias para revisar</h2>
          </div>

          {uncategorizedEntries.length === 0 ? (
            <EmptyState text="Nenhum item pendente de classificacao detalhada para os filtros atuais." />
          ) : (
            <div className="review-list">
              {uncategorizedEntries.map((entry) => (
                <article className="review-card" key={entry.id}>
                  <strong>{entry.description}</strong>
                  <span>{entry.date}</span>
                  <small>{toCurrency(entry.amount)}</small>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel learned-rules-panel">
          <div className="panel-heading space-between">
            <div className="panel-heading">
              <PieChart size={18} />
              <h2>Regras aprendidas</h2>
            </div>
            <span>{learnedRules.length} salvas</span>
          </div>

          <div className="rules-toolbar">
            <input
              type="text"
              placeholder="Buscar por estabelecimento ou categoria"
              value={ruleSearch}
              onChange={(e) => setRuleSearch(e.target.value)}
            />
            {ruleSearch ? <span>{filteredLearnedRules.length} encontradas</span> : null}
          </div>

          {learnedRules.length === 0 ? (
            <EmptyState text="As regras aparecem aqui quando voce corrige categorias de estabelecimentos recorrentes." />
          ) : filteredLearnedRules.length === 0 ? (
            <EmptyState text="Nenhuma regra encontrada para esse termo de busca." />
          ) : (
            <div className="rules-list">
              {filteredLearnedRules.map(([signature, category]) => (
                <article className="rule-card" key={signature}>
                  <div className="rule-copy">
                    <strong>{signature}</strong>
                    <small>Padrao aprendido para novos imports</small>
                  </div>
                  <div className="rule-actions">
                    <select value={category} onChange={(e) => setCategoryRule(signature, e.target.value)}>
                      {uniqueTextValues([category, ...selectors.categories]).map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => deleteCategoryRule(signature)}
                      aria-label={`Excluir regra ${signature}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel invoices-panel">
          <div className="panel-heading space-between">
            <div className="panel-heading">
              <CreditCard size={18} />
              <h2>Faturas importadas</h2>
            </div>
            <span>{state.invoices.length} carregadas</span>
          </div>

          <div className="invoice-list">
            {state.invoices.length === 0 ? (
              <EmptyState text="Importe a primeira fatura em PDF para montar sua base historica." />
            ) : (
              state.invoices.map((invoice) => {
                const mediumCount = invoice.entries.filter((entry) => entry.amountConfidence === "medium").length;

                return (
                  <article className="invoice-card" key={invoice.id}>
                    <div>
                      <strong>{invoice.cardName}</strong>
                      <span>{toMonthLabel(invoice.referenceMonth)}</span>
                      <small>{invoice.fileName}</small>
                    </div>
                    <div>
                      <strong>{toCurrency(invoice.totalAmount || sumEntries(invoice.entries))}</strong>
                      <span>{invoice.entries.length} lancamentos</span>
                      {mediumCount > 0 ? <small>{mediumCount} valores para revisar</small> : null}
                    </div>
                    <button type="button" className="icon-button" onClick={() => deleteInvoice(invoice.id)}>
                      <Trash2 size={16} />
                    </button>
                  </article>
                );
              })
            )}
          </div>
        </section>

        <section className="panel table-panel">
          <div className="panel-heading">
            <UserRound size={18} />
            <h2>Lancamentos editaveis</h2>
          </div>

          {selectors.filteredEntries.length === 0 ? (
            <EmptyState text="Nenhum lancamento encontrado para os filtros atuais." />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descricao</th>
                    <th>Categoria</th>
                    <th>Pessoa</th>
                    <th>Valor</th>
                    <th>Observacoes</th>
                  </tr>
                </thead>
                <tbody>
                  {selectors.filteredInvoices.map((invoice) =>
                    invoice.entries
                      .filter(
                        (entry) =>
                          (state.filters.person === "all" || entry.person === state.filters.person) &&
                          (state.filters.card === "all" || invoice.cardName === state.filters.card) &&
                          (state.filters.month === "all" || invoice.referenceMonth === state.filters.month) &&
                          (state.filters.categories.length === 0 ||
                            state.filters.categories.includes(entry.category)),
                      )
                      .map((entry) => (
                        <tr key={entry.id}>
                          <td>
                            <input
                              type="date"
                              value={toInputDate(entry.date)}
                              onChange={(e) =>
                                updateEntry(invoice.id, entry.id, { date: fromInputDate(e.target.value) })
                              }
                            />
                          </td>
                          <td>
                            <div className="description-cell">
                              <input
                                type="text"
                                value={entry.description}
                                onChange={(e) =>
                                  updateEntry(invoice.id, entry.id, { description: e.target.value })
                                }
                              />
                              <div className="entry-tags">
                                {entry.installment ? (
                                  <span className="entry-tag">
                                    Parcela {entry.installment.current}/{entry.installment.total}
                                  </span>
                                ) : null}
                                {entry.amountConfidence === "medium" ? (
                                  <span className="entry-tag warning-tag">Revisar valor</span>
                                ) : (
                                  <span className="entry-tag success-tag">Valor confiavel</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td>
                            <input
                              type="text"
                              value={entry.category}
                              onChange={(e) => updateEntry(invoice.id, entry.id, { category: e.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              placeholder="Nome"
                              value={entry.person}
                              onChange={(e) => updateEntry(invoice.id, entry.id, { person: e.target.value })}
                            />
                          </td>
                          <td className="amount-cell">{toCurrency(entry.amount)}</td>
                          <td>
                            <input
                              type="text"
                              value={entry.notes}
                              onChange={(e) => updateEntry(invoice.id, entry.id, { notes: e.target.value })}
                            />
                          </td>
                        </tr>
                      )),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function aggregateEntries(entries: InvoiceEntry[], key: "category" | "person"): ChartDatum[] {
  const totals = new Map<string, number>();

  for (const entry of entries) {
    const label = entry[key] || "Nao atribuido";
    totals.set(label, (totals.get(label) ?? 0) + entry.amount);
  }

  return [...totals.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function sumEntries(entries: Array<{ amount: number }>): number {
  return entries.reduce((sum, entry) => sum + entry.amount, 0);
}

function ChartContainer({ empty, children }: { empty: boolean; children: ReactNode }) {
  if (empty) {
    return <EmptyState text="Os graficos aparecem assim que houver dados importados e classificados." />;
  }

  return <div className="chart-wrapper">{children}</div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function uniqueTextValues(values: string[]): string[] {
  return [...new Set(values)];
}
