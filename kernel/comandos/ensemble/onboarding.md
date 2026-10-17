---
description: Primeira conversa do Ensemble neste projeto. Lê os CLAUDE.md, preenche o contexto dos agentes e docs/ensemble/projeto.md, e levanta as perguntas em aberto para o desenvolvedor.
---

Você é o tech-lead a fazer o onboarding da equipe de agentes neste
projeto. O instalador do Ensemble já colocou os arquivos; o que falta é o
**conhecimento do projeto**, que só está nos documentos e no código. Faça
isto, nesta ordem, e com o desenvolvedor presente.

## 1. Ler
- `.ensemble/ensemble.json` (o que o instalador descobriu: frentes,
  diretórios, git, branches, comandos; pode estar incompleto ou errado).
- Todos os `CLAUDE.md`, `AGENTS.md` e `README.md` do projeto (raiz e
  frentes). Depois, os documentos que eles apontam como importantes
  (padrões, arquitetura, requisitos, planos).
- A estrutura de cada frente: manifestos (`package.json`, `pyproject`,
  `go.mod`...), scripts, `Makefile`, compose, pastas de teste.
- `docs/ensemble/projeto.md` como está (modelo com marcadores).

Delegue a leitura pesada a subagentes de leitura (Explore) por frente, e
peça retorno curto: fatos, não opiniões.

## 2. Preencher `docs/ensemble/projeto.md`
Substitua cada marcador `<!-- preencher: ... -->` por fatos com fonte
(arquivo e seção). O que não tiver fonte vira pergunta (passo 4), não
suposição. Seções: visão e domínio, frentes (diretório, git, branch de
trabalho, branch de integração, branches/arquivos protegidos), stack e
versões, comandos (subir, gate por frente, testes, e2e), portas e
ambientes, fonte da verdade (ordem), padrões (onde estão), código que não
se refatora, proibições específicas, personas/contas de teste, escopo fora
(deploy, cloud).

## 3. Preencher o bloco de contexto de cada agente
Em cada `.claude/agents/<agente>.md`, substitua o conteúdo entre
`<!-- ensemble:contexto:inicio -->` e `<!-- ensemble:contexto:fim -->`
por um bloco curto (10 a 25 linhas) com o que **aquele papel** precisa
saber deste projeto: o resto está em `projeto.md`. Não altere nada fora
dos marcadores. Delegue a escrita a um agente com Edit (o product-owner
serve), uma passada por arquivo.

Conferir `ensemble.json`: se uma frente, branch ou comando estiver errado,
corrija (o devops pode editar) e diga ao desenvolvedor o que mudou.

## 4. Perguntas em aberto
Tudo o que não tem fonte ou tem fontes em conflito vai para
`docs/ensemble/perguntas-abertas.md` como `P-<n>`, com: a pergunta, por que
importa (que agente trava sem ela), as opções que você vê e a sua
recomendação. Exemplos do que costuma faltar: branch de integração e
regra de push; o que é produção e não pode ser tocado; personas de teste;
se há código gerado por ferramenta que não se refatora; limites de
paralelismo na máquina; ordem das fontes da verdade quando docs e código
divergem.

Faça as perguntas ao desenvolvedor **agora**, em lotes pequenos (use
AskUserQuestion quando as opções forem claras). Cada resposta vira uma
seção `§n` em `docs/ensemble/decisoes.md` (índice no topo) e a `P-n` fica
marcada como respondida. O que ficar sem resposta continua aberto e os
agentes param nela quando a encontrarem.

## 5. Fechar
Devolva ao desenvolvedor, em poucas linhas: o que foi preenchido, o que
ficou em aberto (`P-n`), e o próximo passo natural (normalmente: pedir ao
product-owner a primeira change). Sugira abrir o painel:
`ensemble painel` na pasta do projeto.
