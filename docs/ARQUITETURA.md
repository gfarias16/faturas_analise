# Arquitetura

## Componentes

- Frontend SPA: React e TypeScript.
- Parsing: PDF.js executado no navegador.
- Estado/persistência: store local e `localStorage`.
- Visualização: componentes React e Recharts.
- Backend, banco, workers, filas e containers: não identificados.

## Fluxo de dados

```text
PDF local -> pdfParser -> fatura/lançamentos -> store/localStorage
                                          -> dashboard/reconciliação -> UI
```

## Execução e porta

O projeto usa Vite. A porta não está fixada na configuração e deve ser confirmada na saída de `npm run dev`.
