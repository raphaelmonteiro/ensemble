# Relatórios de onda

Uma onda é um lote de changes aprovado de uma vez. No fim de cada onda, o product-owner escreve `<aaaa-mm-dd>-onda-<n>.md` com:

1. **Changes da onda:** tabela com change, bloco do plano, data de arquivamento, sha de integração por frente, resultado da revisão (rodadas) e do QA.
2. **O que ficou entregue:** em prosa curta, por capacidade.
3. **Rede de segurança:** resultado do e2e completo e dos roteiros na change de verificação; o que falhou e como foi corrigido.
4. **Decisões:** provisórias (`PV-n`) decididas e "a confirmar" que viraram `P-n`.
5. **Lições:** o que mudar no processo (vira item em `docs/ensemble/decisoes.md` se o desenvolvedor aprovar).

Comece pela frase `Em resumo: ...`, que o painel mostra.
