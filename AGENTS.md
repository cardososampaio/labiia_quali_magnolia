# AGENTS.md: instruções para agentes de código

O labiia_quali é um programa de análise qualitativa de dados para Windows, em português do Brasil. Ele deriva do [Magnolia](https://github.com/caledavis/Magnolia), de Cale Davis, e incorpora as análises léxicas do labiia_lex. É feito em Electron, React e TypeScript, e o R é usado em parte das análises léxicas.

## Quem pede as mudanças

O responsável pelo produto não programa.

- Responda em português do Brasil simples, começando pelo resultado que a pessoa vai ver no programa.
- Diga o que foi verificado e o que não foi.
- Antes de mudanças grandes ou com mais de uma interpretação possível, confirme o entendimento.

## Comandos

```bash
npm install            # dependências
npm run dev            # abre o programa em modo de desenvolvimento
npm test               # todos os testes (vitest)
npx tsc --noEmit -p tsconfig.web.json    # tipos da interface
npx tsc --noEmit -p tsconfig.node.json   # tipos do processo principal
npm run package:win    # instalador em dist/labiia_quali-win-x64.exe (e versão portátil)
```

`test/parity.local.test.ts` só roda com a variável `PARITY_DIR` definida. Fora disso, rode a suíte com `--exclude test/parity.local.test.ts`.

## Onde fica cada coisa

| Parte | Pasta |
|---|---|
| Processo principal (janelas, arquivos, IPC, confirmação ao fechar) | `src/main/` |
| Leitura e gravação de projetos `.qdpx` e livros de códigos | `src/main/qdpx/` (`codebook-docx.ts`, `-odt`, `-rtf`, `-md`, `codebook-document.ts`) |
| Motor das análises léxicas (preparo do corpus, análises, R) | `src/main/lexical/` |
| Interface (React) | `src/renderer/` |
| Faixa com abas, Iniciar, barra de status | `src/renderer/components/Toolbar/`, `src/renderer/App.tsx` |
| Telas das análises léxicas | `src/renderer/components/Lexical/` |
| Tema Windows (cores, famílias de botões) | `src/renderer/styles/windows-shell.css` |
| Traduções | `src/renderer/i18n/pt-BR.ts`, `en.ts` |
| Dicionários e léxicos das análises léxicas | `resources/lexical/` |
| Instalador do Windows e etapa do R | `build/installer.nsh`, `build/installer/` |
| Manual do usuário (HTML publicado no GitHub Pages) | `manuais/` |
| Testes | `test/main/`, `test/renderer/`, `test/qdpx/` |

## Regras do projeto

### Textos da tela
- No código, todo texto é escrito em inglês e passa por `t("...")`. A tradução em português vai em `src/renderer/i18n/pt-BR.ts`.
- Cada texto novo precisa da entrada em `pt-BR.ts`. Antes de criar uma chave, confira se ela já existe: chave repetida quebra a tradução.

### Nomes que mudaram
- O que o Magnolia chama de *Categories* aparece na tela como **Atributos**.
- O que o Magnolia chama de *Tags* aparece como **Características**.
- No código, os nomes internos continuam `category` e `tag`.
- Use só os nomes novos em textos, manual e mensagens.

### Análises léxicas
- **Unidade de análise:** as análises leem "unidades de texto" (`src/renderer/components/Lexical/lexical-units.ts`).
  - Em **Documentos**, cada documento é uma unidade.
  - Em **Códigos**, cada código escolhido é uma unidade, com todos os seus trechos em `parts`. Os subcódigos somam no código-pai.
  - Um trecho marcado com dois códigos escolhidos entra nos dois.
- **Corte em segmentos:** cada parte é cortada separadamente (`src/main/lexical/corpus/prepare.ts`).
- **Mudança no preparo do corpus:** quando o mesmo texto passar a dar um resultado diferente, aumente `PREPARATION_VERSION`.
- **Variáveis estreladas:**
  - o formato é `*<atributo>_<valor>`;
  - uma característica sem atributo vira `*caracteristica_<valor>`;
  - a pasta vira `*pasta_<nome>`;
  - no modo Códigos, a variável é `*codigo_<nome>`.
- **Pacotes R:** a lista fica em `LEXICAL_R_PACKAGES` (`src/renderer/models/lexical-api.ts`). O instalador gera `build/installer/r_packages.txt` a partir dela. Ao mudar uma, mantenha as duas em sincronia e atualize `src/renderer/components/Licence/credits.ts`.

### Licença e créditos
- Licença do programa: EUPL-1.2.
- Os recursos léxicos têm licenças próprias, listadas em `resources/lexical/README.md` e `credits.ts`. Exemplos: o labiia_lex é GPL-3.0 ou posterior; os scripts do IRaMuTeQ são GPL; o NRC só é livre para pesquisa e ensino.
- Não remova créditos do Magnolia.

### Comentários e testes
- Comentários e nomes de teste dizem a regra que o programa segue e por quê.
- Não registre ali nomes de pessoas, datas de decisão nem etapas do fluxo de trabalho.

## Cuidados ao testar

- **Programa da pessoa:** não feche o labiia_quali que a pessoa está usando.
  - Para testar a interface, abra uma cópia de desenvolvimento separada, com uma porta própria: `npx electron-vite dev --remoteDebuggingPort 9333 -- "<cópia de um projeto>.qdpx"`.
  - Ao terminar, encerre só os processos que têm `9333` na linha de comando.
- **Projetos de teste:** use sempre cópias, nunca os projetos originais da pessoa.
- **Projetos recentes:** os testes e a cópia de desenvolvimento acrescentam entradas em `%APPDATA%\labiia_quali\recent-projects.json`. Depois de testar, remova as entradas que apontam para pastas temporárias.
- **R:** não rode a instalação do R de verdade só para testar. O instalador do R grava chaves do R no registro do usuário.
  - Para testar só os pacotes, aponte `LOCALAPPDATA` para uma pasta vazia.
  - Depois rode `dist\win-unpacked\resources\installer\r-setup.ps1 -Action packages`.
- **Antivírus:** antivírus como o Avast podem bloquear a leitura de arquivos da Área de Trabalho ou de Documentos, e o erro aparece como `EPERM`. O programa já explica esse caso para a pessoa (`src/renderer/utils/import-errors.ts`).

## Instalador

- `npm run package:win` gera o assistente NSIS. Ele tem a página "R para os testes estatísticos":
  - procura um R 4.5 ou mais novo;
  - se não encontrar, baixa o R 4.6.1 do CRAN e confere o SHA-256 (`build/installer/r_runtime.json`);
  - instala os pacotes numa pasta própria do labiia_quali.
- Os scripts PowerShell do instalador precisam de UTF-8 com BOM, porque rodam no PowerShell 5.1.
- Se o build falhar por causa do `winCodeSign`, veja a seção do README sobre o instalador.

## Git, GitHub e publicação

- **Ramo de trabalho e repositório:** o ramo é `labiia-quali`. O remoto `origin` é github.com/cardososampaio/labiia_quali_magnolia, um fork do Magnolia, e `labiia-quali` é o ramo padrão dele.
- **Ramo `main` e novidades do Magnolia:** o `main` é a cópia intocada do Magnolia; `upstream` aponta para caledavis/Magnolia.
  - O Magnolia trocou sua base técnica por Rust e Tauri, então não se faz merge direto dele.
  - Novidades de lá são avaliadas uma a uma e trazidas à mão, quando servem.
- **Commits e envios:** só quando a pessoa pedir.
- **Manual:** é publicado no GitHub Pages a cada envio que mexa em `manuais/` (`.github/workflows/manual.yml`). O endereço é https://cardososampaio.github.io/labiia_quali_magnolia/, e o botão Ajuda → Manual abre esse endereço.
- **Lançamentos:** ficam em Releases (`vX.Y.Z`), com o instalador e notas em português. Cada nova versão exige mudar `version` em `package.json`.
