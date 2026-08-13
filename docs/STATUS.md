# Status atual

## Estado geral

O projeto possui aplicação React/TypeScript, lockfile, parser de PDF, persistência local e dashboards. O estado do build atual não foi verificado nesta tarefa.

## Funcionalidades identificadas

- Importação de PDF no navegador.
- Extração de dados da fatura e lançamentos.
- Edição de categoria, pessoa e observações.
- Dashboards e reconciliação de totais.
- Temas e persistência em `localStorage`.

## Em desenvolvimento

A confirmar.

## Pendências identificadas

- Validar o parser com múltiplos PDFs reais do mesmo emissor.
- Testes automatizados, CI/CD e backend compartilhado não existem.
- Estratégia formal de versão/migração do `localStorage`: A confirmar.

## Problemas conhecidos

O parser depende do layout textual do emissor e pode exigir ajuste de regex/regras.

## Próximos passos

O README sugere ampliar amostras, formalizar pessoas/categorias, criar backend e exportações; prioridade e cronograma são **A confirmar**.
