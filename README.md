# Faturas em Analise

MVP em React + TypeScript para importar faturas em PDF, extrair lancamentos, editar categorias e pessoas responsaveis, e visualizar dashboards por mes, cartao e pessoa.

## O que ja faz

- Importa um PDF direto no navegador.
- Le o texto do documento com `pdf.js`.
- Tenta reconhecer dados basicos da fatura:
  - cartao
  - mes de referencia
  - vencimento
  - fechamento
  - total da fatura
  - lancamentos com data, descricao e valor
  - indicacao de parcelamento
  - confianca da leitura do valor
- Permite editar categoria, pessoa e observacoes por lancamento.
- Gera dashboards por categoria, pessoa e evolucao mensal.
- Permite alternar entre tema azul em gradiente e tema claro.
- Persiste os dados no `localStorage`.

## Stack

- React
- TypeScript
- Vite
- `pdfjs-dist`
- `recharts`

## Como rodar

Este ambiente nao tinha `node`/`npm` disponiveis no terminal, entao a estrutura foi criada manualmente.
Para executar em uma maquina com Node.js instalado:

```bash
npm install
npm run dev
```

## Observacao importante sobre o parser

O parser inicial esta em `src/lib/pdfParser.ts`.
Ele funciona por extracao de texto e reconhecimento por padroes. Nesta iteracao, a leitura foi reforcada com:

- ordenacao dos tokens por pagina e coordenada
- leitura do ultimo valor monetario mais provavel da linha
- deteccao de parcelamento no formato `01/12`
- marcacao de confianca para valores que exigem revisao

Para producao, o caminho correto e adaptar os regex e regras de extracao com base no layout real do seu PDF.
O arquivo de exemplo `BradescoCartoes24-03-2026-11-54-02.pdf` foi mantido no projeto para servir de referencia durante esse ajuste.

## Proximos passos recomendados

1. Ajustar o parser com 2 ou 3 faturas reais do mesmo cartao.
2. Adicionar cadastro formal de pessoas e categorias.
3. Criar backend para persistencia compartilhada e historico multiusuario.
4. Exportar dashboards e relatorios consolidados.
