# Regras de negócio

## Importação e lançamentos

- O PDF é processado localmente no navegador.
- O parser tenta obter cartão, referência, vencimento, fechamento, total e lançamentos.
- Parcelas no formato `NN/NN` são reconhecidas quando presentes.
- Valores com leitura incerta devem manter indicação de confiança/revisão.

## Classificação

- Cada lançamento pode receber pessoa, categoria e observação.
- Alterações persistem localmente no navegador.

## Reconciliação

- A diferença para compras e a diferença para o total oficial representam comparações distintas.
- Divergência nas compras sugere lançamento/débito ausente; compras conciliadas com total oficial divergente direcionam revisão de saldo anterior, créditos, pagamentos, tarifas ou ajustes.

Regras específicas por emissor de PDF: **A confirmar** e devem ser validadas com amostras reais.
