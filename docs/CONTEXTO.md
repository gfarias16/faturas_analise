# Contexto do projeto

## Nome e objetivo

Faturas em Análise é um MVP executado no navegador para importar faturas PDF, extrair lançamentos, permitir classificação por pessoa/categoria e apresentar dashboards e reconciliações.

## Problema atendido

Organizar despesas de faturas e explicar diferenças entre lançamentos extraídos, total de compras e total oficial da fatura.

## Stack e componentes

- React 19, TypeScript e Vite.
- `pdfjs-dist` para leitura de PDFs.
- Recharts para gráficos.
- `src/lib/pdfParser.ts`: extração heurística.
- `src/lib/dashboard.ts`: cálculos e reconciliação.
- `src/store/invoiceStore.ts`: estado e `localStorage`.
- `src/components/`: interface.

Não há backend, banco remoto ou integração externa de persistência.
