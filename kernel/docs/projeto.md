# {{NOME}} — fatos do projeto para a equipe de agentes

> Fonte dos **fatos** que os agentes usam (os `CLAUDE.md` do projeto continuam valendo e têm prioridade em caso de conflito). Preenchido pelo `/ensemble:onboarding` em {{DATA}} a partir dos documentos do projeto; cada fato cita a fonte. O que não tem fonte está em `perguntas-abertas.md`.

## Visão e domínio
<!-- preencher: o que o produto faz, para quem, e o vocabulário do domínio (fonte: CLAUDE.md da raiz) -->

## Frentes
| Frente | Agente | Diretório | Git | Branch de trabalho | Branch de integração | Protegido |
|---|---|---|---|---|---|---|
{{FRENTES}}

<!-- preencher: confirmar branches e o que é protegido (main de produção, histórico publicado, pastas de originais) -->

## Stack e versões
{{STACK}}
<!-- preencher: versões fixadas, o que não pode ser trocado -->

## Comandos
| Frente | Subir | Gate rápido (ordem) | Testes unitários | e2e / roteiros |
|---|---|---|---|---|
{{COMANDOS}}

Os comandos de gate são os de `.ensemble/ensemble.json`; `gate-record` roda-os e grava a linha no `tasks.md`.

## Portas e ambientes
<!-- preencher: portas de dev, de teste e de QA; como isolar ambientes para e2e, gate e QA; limites da máquina -->

## Fonte da verdade (ordem)
<!-- preencher: 1. decisões em docs/ensemble/decisoes.md; 2. documentos originais (quais); 3. código (de qual frente); 4. ... ; sem resposta → pergunta P-n -->

## Padrões
<!-- preencher: onde estão os documentos de padrões de cada frente (a régua do code-reviewer); limites de tamanho, camadas, nomes -->

## Código que não se refatora
<!-- preencher: código gerado por ferramenta ou legado preservado; a única edição permitida é a mínima da task -->

## Proibições específicas
<!-- preencher: comandos e ações proibidos além das gerais (ambiente, dados, git) -->

## Personas e contas de teste
<!-- preencher: usuários de seed, papéis, como autenticar em dev -->

## Fora de escopo agora
<!-- preencher: deploy, cloud, integrações externas, segurança avançada -->
