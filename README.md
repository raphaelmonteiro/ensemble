# Ensemble

Equipa de agentes para o Claude Code, instalável em qualquer projeto: o **método** (7 papéis, changes do OpenSpec, gate registado, rodadas de revisão, QA, ondas), um **instalador** que o põe no projeto e um **painel ao vivo** que mostra o que cada agente está a fazer, o que mudou e porquê, as decisões em aberto e a memória da equipa.

```
ensemble/
├── bin/ensemble.mjs      CLI: install · descobrir · painel · status
├── kernel/               o método, sem fatos de projeto
│   ├── agentes/          tech-lead, product-owner, devops, backend-dev, frontend-dev, code-reviewer, qa
│   ├── comandos/ensemble/onboarding.md   /ensemble:onboarding (1ª conversa)
│   ├── docs/             projeto.md, ambiente.md, divida-tecnica.md, decisoes.md, perguntas-abertas.md, ondas/
│   └── scripts/gate-record.mjs
├── lib/                  leitura do projeto (openspec, git, docs) e instalador
├── cliente/              o painel (HTML/JS, sem dependências)
└── servidor.mjs          servidor do painel (só leitura)
```

Sem dependências: Node ≥ 22. Para o `install` criar o `openspec/`, o CLI do OpenSpec tem de estar instalado (`npm i -g @fission-ai/openspec`).

## Instalar num projeto

```sh
git clone git@github.com:raphaelmonteiro/ensemble.git
cd ensemble && npm link        # cria o comando `ensemble`
ensemble install ~/Sites/meu-projeto
```

O que o `install` faz no projeto (e só isso):

| Escreve | O quê |
|---|---|
| `.claude/agents/*.md` | os 7 agentes, com um bloco `<!-- ensemble:contexto -->` por preencher |
| `.claude/commands/ensemble/onboarding.md` | o comando `/ensemble:onboarding` |
| `.claude/settings.json` | `"agent": "tech-lead"` (merge; o resto fica) |
| `docs/ensemble/` | `projeto.md` (fatos, com o mecânico já descoberto), `ambiente.md`, `divida-tecnica.md`, `decisoes.md`, `perguntas-abertas.md`, `ondas/README.md` |
| `.ensemble/ensemble.json` | frentes descobertas (dir, git, branch, gerenciador, comandos de gate e e2e) |
| `.ensemble/gate-record.mjs` | o `gate-record` portátil |
| `openspec/` + `.claude/commands/opsx` + `.claude/skills/openspec-*` | via `openspec init --tools claude` |

Não toca em `CLAUDE.md`, código, nem em nada que já exista (um segundo `install` atualiza o método dos agentes **preservando o bloco de contexto**; `--force` substitui tudo). Agentes que não são do Ensemble (sem o marcador) são mantidos.

### Depois do install: a primeira conversa

Na pasta do projeto, no Claude Code: `/ensemble:onboarding`. O tech-lead lê os `CLAUDE.md`, preenche `docs/ensemble/projeto.md` e o bloco de contexto de cada agente, e **faz-te as perguntas em aberto** (`P-n`). Cada resposta vira uma seção `§n` em `decisoes.md`. Só depois pede a primeira change.

## Painel

```sh
ensemble painel ~/Sites/meu-projeto        # http://127.0.0.1:4321
ensemble status ~/Sites/meu-projeto        # o mesmo, em texto
```

Para o Ensemble ser instalado também no plato, onde nasceu, basta `ensemble install` lá quando quiseres; até lá, o painel lê-o no layout original.

Lê `.ensemble/ensemble.json` para saber as frentes; sem ele, assume o layout do PLATO (3 repositórios, `docs/resumos/`). Só leitura: `readFileSync`, `fs.watch`, `git log/show/worktree list`; recusa qualquer método que não seja GET; escuta em `127.0.0.1`.

| Painel | Fonte |
|---|---|
| Mapa mental e equipa | `.claude/agents/*.md` |
| O que cada um está a fazer | `openspec/changes/*/tasks.md`, `review-report.md`, `qa-report.md`, mtimes, `git log` de cada frente (num monorepo, só os commits que tocam a pasta da frente) |
| O que está a mudar, e porquê | commits; o "porquê" vem da linha `Porquê:` no corpo do commit (declarado pelo agente) e das referências `R<k>`, task `n.m` e `PV-n` no assunto |
| Decisões | propostas aguardando aprovação, perguntas `P-n` abertas, rodadas com bloqueantes, `PV-n`, últimos `§n` |
| Memória | `ambiente.md` (fatos, achados), `divida-tecnica.md`, `ondas/`, padrões recorrentes dos achados de revisão |

## O método, em uma página

- **Entrada única:** o desenvolvedor fala só com o tech-lead; ele delega aos outros seis e para para perguntar quando há decisão de produto, proposta a aprovar, 2ª rodada de revisão com mudanças pedidas ou QA reprovado duas vezes.
- **Change do OpenSpec:** proposal (mapa de impacto, casos de borda) → specs com cenários → `tasks.md` com seções `0. Infra / 1. Backend / 2. Frontend / 3. QA` → aprovação explícita → implementação por seção, em paralelo quando o `design.md` já tem o contrato.
- **Gate registado:** cada dev fecha a seção com `node .ensemble/gate-record.mjs FRENTE=<frente> CHANGE=<id> SECTION=<n> [FILTER=<suíte>]`, que roda os comandos de `ensemble.json` e grava `<!-- commits -->` e `<!-- gate -->`. O revisor confia na linha, não repete.
- **Revisão:** só os commits registados, contra os padrões; achados `R<k>` em `review-report.md` com severidade bloqueante / corrigir antes do arquivamento / backlog; 2ª rodada com mudanças pedidas → o tech-lead decide antes da 3ª.
- **QA:** só com tela entregue; pela tela, com personas; bug → teste unitário que o reproduz.
- **Paralelo:** 2 backends + 2 frontends, worktrees próprios, sem peça de domínio comum.
- **Narrativa:** cada commit traz `Porquê: ...` no corpo; é o que o painel mostra.
- **Memória:** `ambiente.md` (fatos curados pelo devops), `divida-tecnica.md` (`DT-n`), `decisoes.md` (`§n`), `perguntas-abertas.md` (`P-n`), relatórios de onda.

## Próximos passos

- Painel com vários projetos (`ensemble painel --todos`): um `ensemble.json` por projeto já chega.
- Conversa com o tech-lead dentro do painel (terminal com `node-pty` + xterm.js, ou Agent SDK).
- "Pergunta à memória": busca sobre `docs/ensemble/` e `openspec/` por um agente de leitura.
