# AGENTS.md — Faturas em Análise

## Escopo e objetivo

Este arquivo vale para todo o projeto `faturas_analise`. É um MVP executado no navegador para importar faturas em PDF, extrair lançamentos, atribuir pessoas/categorias e produzir dashboards e reconciliações.

## Stack e estrutura principal

- React 19, TypeScript e Vite 7.
- `pdfjs-dist` para extração de texto de PDFs.
- Recharts para visualizações.
- `localStorage` para persistência local; não há backend ou banco de dados identificado.
- `src/lib/pdfParser.ts`: parser heurístico dos PDFs.
- `src/lib/dashboard.ts`: cálculos e reconciliação dos dashboards.
- `src/store/invoiceStore.ts`: estado e persistência.
- `src/components/`: componentes de interface.
- `src/types/`: contratos TypeScript.
- `BradescoCartoes24-03-2026-11-54-02.pdf`: amostra de referência; trate PDFs financeiros como dados sensíveis.

## Execução, portas e serviços

```bash
npm install
npm run dev
```

O Vite normalmente usa a porta `5173`, mas a porta efetiva não está fixada nos arquivos: **A confirmar** na saída do comando. Não há Docker Compose, containers ou serviços de banco neste projeto.

## Testes e validação

Não foi identificada suíte automatizada. O comando verificável de qualidade é:

```bash
npm run build
```

Antes de considerar uma alteração concluída:

1. Execute o build TypeScript/Vite.
2. Importe PDFs representativos e confira total oficial, total de compras, diferenças e quantidade de lançamentos.
3. Teste edição de pessoa, categoria e observação, recarregando a página para validar `localStorage`.
4. Verifique estados vazio/erro, tema, tabelas e gráficos em desktop e mobile.
5. Não declare uma regra do parser correta com base em apenas um emissor ou layout.

## Regras importantes

- O parser é heurístico. Preserve tokens, coordenadas, datas, parcelas, sinais e valores monetários durante refatorações.
- Separe `differenceToPurchases` de `differenceToOfficial`; são reconciliações com significados diferentes.
- Mudanças estruturais em JSX devem ser seguidas imediatamente pelo build para capturar tags, tipos e imports quebrados.
- Não envie conteúdo financeiro para serviços externos nem inclua PDFs reais em logs, issues ou commits sem autorização.
- Preserve compatibilidade dos dados existentes em `localStorage`; mudanças no formato pedem migração/versionamento ou fallback explícito.
- Listas extensas devem continuar compactas e paginadas; detalhes avançados ficam recolhidos até ação do usuário.
- Para dependências, altere `package.json` e lockfile de forma coerente somente após avaliar compatibilidade e impacto do bundle.
- Comente regex e regras de negócio pelo motivo e pelos layouts atendidos, não apenas pela sintaxe.

## Convenções e áreas críticas

- TypeScript com componentes funcionais React e módulos ES.
- Regras puras devem permanecer em `src/lib/`; estado e persistência em `src/store/`.
- Mantenha tipos explícitos para resultados de parsing, reconciliação e itens editáveis.
- Trate falhas de leitura com feedback visível, sem inventar valores ausentes.
- Arquivos críticos: `src/lib/pdfParser.ts`, `src/lib/dashboard.ts`, `src/store/invoiceStore.ts`, `src/types/` e `package.json`.

Testes automatizados, CI/CD e uma política formal de migração do armazenamento local não foram encontrados: **A confirmar** antes de depender deles.

## Contexto do projeto

Antes de alterações relevantes, consulte quando existirem:

- `docs/CONTEXTO.md`
- `docs/STATUS.md`
- `docs/ARQUITETURA.md`
- `docs/REGRAS_NEGOCIO.md`
- `docs/DECISOES.md`
- `docs/TROUBLESHOOTING.md`

Após alterações relevantes, avalie se essa documentação precisa ser atualizada.
