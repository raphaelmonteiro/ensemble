# Dívida técnica

Backlog dos achados de revisão da classe **backlog**. Não é tratado durante as changes: só quando o desenvolvedor decidir rodar uma change de dívida.

## Regra de entrada e saída

- **Entrada:** o `code-reviewer` classifica o achado como backlog no `review-report.md`. No arquivamento da change, o product-owner transfere os itens para a seção do módulo. Também entram os itens movidos ao backlog pelo tech-lead ao parar uma change no limite de rodadas.
- **Saída:** o item sai quando uma change de dívida o resolve e cita o `DT-<n>`. Quem remove é o product-owner no arquivamento dessa change.
- **Numeração:** `DT-<n>` sequencial, sem reaproveitar número.

## Formato do item

```
- **DT-<n>** · <aaaa-mm-dd> · change `<id>` · rodada <n>, `R<k>` · `arquivo:linha`
  Descrição do achado. Responsável sugerido: backend-dev | frontend-dev | devops.
```

## Itens

Nenhum item.
