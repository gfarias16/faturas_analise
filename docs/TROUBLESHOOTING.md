# Troubleshooting

## Lançamentos ou valores incorretos

O parser é dependente do layout. Compare tokens, ordem por página/coordenada, último valor monetário provável, sinal e parcelamento com o PDF original.

Não ajuste regex com base em apenas um documento; valide com duas ou três faturas do mesmo emissor e preserve casos anteriores.

## Total não conciliado

Verifique separadamente total de compras e total oficial. Saldo anterior, pagamentos, créditos, tarifas e ajustes podem explicar diferença no total oficial sem indicar compra ausente.

## Dados perdidos ou incompatíveis

A persistência usa `localStorage`. Limpeza do navegador ou mudança incompatível do schema local pode remover/inutilizar dados. Política de backup e migração: **A confirmar**.
