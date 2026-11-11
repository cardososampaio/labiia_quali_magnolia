# AGENTS.md: instruções para agentes de código

O labiia_quali é um programa de análise qualitativa de dados para Windows, em português do Brasil. Ele deriva do [Magnolia](https://github.com/caledavis/Magnolia), de Cale Davis, e incorpora as análises léxicas do labiia_lex. Desde a versão 0.2.0 roda sobre a base do Magnolia 2.1:

- **Tauri e Rust:** janelas, leitura e gravação de projetos e livros de códigos;
- **React e TypeScript:** a interface;
- **Ajudante Node embutido:** executa o motor das análises léxicas, que chama o R.

## Quem pede as mudanças

O responsável pelo produto não programa.

- Responda em português do Brasil simples, começando pelo resultado que a pessoa vai ver no programa.
- Diga o que foi verificado e o que não foi.
- Antes de mudanças grandes ou com mais de uma interpretação possível, confirme o entendimento.

## Comandos

```bash
npm ci                      # dependências
npm run prepare:helper      # baixa o Node do ajudante (versão fixa, SHA-256 conferido) e empacota o ajudante
npm run dev                 # abre o programa em modo de desenvolvimento
npm run typecheck           # tipos da interface e do ajudante
npx vitest run              # testes da interface e do motor léxico
cargo test --workspace      # testes do Rust (projetos, livro de códigos, resultados léxicos)
npm run build               # instalador em <pasta de compilação>/release/bundle/nsis/labiia_quali_<versão>_x64-setup.exe (o executável é labiia_quali.exe)
```

`test/helper/parity.local.test.ts` só roda com `PARITY_DIR` definido. Ele compara as 12 análises com outra versão; veja o cabeçalho do arquivo.

**Pasta de compilação.** Nesta máquina, o Rust compila em `C:\Users\cardo\AppData\Local\labiia-quali-build\target`. A configuração está em `.cargo/config.toml`, que não vai para o git. O motivo: a proteção contra ransomware do antivírus impede que o script de compilação do Tauri sobrescreva arquivos dentro da Área de Trabalho.

## Onde fica cada coisa

| Parte | Pasta |
|---|---|
| O que é só do labiia_quali no Rust (pasta de dados, ajudante, análises léxicas, livro de códigos de documentos, confirmação ao fechar, termos) | `src-tauri/src/labiia/` |
| Resultados léxicos dentro do `.qdpx` (`labiia-lexical/<análise>/<arquivo>`) | `crates/magnolia-core/src/qdpx/labiia_lexical.rs` |
| Leitura de livro de códigos em Word, ODT, RTF e Markdown | `crates/magnolia-core/src/qdpx/codebook_outline/` |
| Ajudante Node: protocolo, métodos, pastas | `src/helper/` |
| Motor das análises léxicas (sem mudança de lógica em relação à 0.1) | `src/helper/lexical/` |
| Ponte da interface com as análises (`window.api.lexical`) | `src/renderer/labiia/lexical-bridge.ts` |
| Faixa, botão com menu, tema Windows, termos, configurações | `src/renderer/labiia/` |
| Telas das análises léxicas | `src/renderer/components/Lexical/` |
| Pré-visualização do livro de códigos | `src/renderer/components/Codebook/CodebookOutlineDialog.tsx`, `src/renderer/utils/codebook-outline.ts` |
| Iniciar, barra de status, codificação rápida, seleção manual | `components/Toolbar/StartMenu.tsx`, `components/StatusBar.tsx`, `components/QuickCoding/`, `components/ItemPicker/` |
| Traduções | `src/renderer/locales/en.json` e `pt-BR.json` (chaves `labiia.*` são nossas); sobreposição de termos em `src/renderer/locales/labiia/` |
| Dicionários, léxicos e scripts R | `resources/lexical/` |
| Instalador: etapa do R | `src-tauri/windows/hooks.nsh`, `build/installer/` |
| Manual do usuário (HTML publicado no GitHub Pages) | `manuais/` |
| Testes | `test/renderer/`, `test/helper/`, `crates/magnolia-core/tests/` |

## Regras do projeto

### Arquivos do Magnolia
- O que é nosso fica em arquivos próprios (`labiia/`, `helper/`, `Lexical/`, `ItemPicker/` e outros).
- Nos arquivos do Magnolia entram só chamadas curtas, marcadas com um comentário `labiia_quali:`. Assim, as próximas versões do Magnolia entram com pouco conflito.

### Textos da tela
- Todo texto visível passa por `t('chave.pontuada')`. As chaves novas ficam sob `labiia.*` em `en.json` e `pt-BR.json`; a do Rust fica sob `native.labiia.*`.
- Depois de mudar `en.json`, rode `npm run i18n:sync`. Os testes `i18n-hardcoded` e `i18n-catalogues` falham com texto fora de `t()` ou com chave faltando.
- Texto calculado ao carregar um módulo sai em inglês, porque o idioma só fica pronto depois. Nesses casos, use um *getter*, como em `lexical-catalog.ts` e `credits.ts`.

### Nomes que mudaram
- O que o Magnolia chama de *Tags* aparece como **Características**, e *Categories* aparece como **Atributos**. No código, os nomes internos continuam `tag` e `category`.
- Essa troca não edita os catálogos do Magnolia. Ela fica em `src/renderer/locales/labiia/*.json`, aplicada por cima na interface (`labiia/terms.ts`) e nos menus (`src-tauri/src/labiia/terms.rs`).
- O teste `labiia-terms.test.ts` avisa quando uma versão nova do Magnolia muda uma frase sobreposta.
- "Magnolia" vira "labiia_quali" quando é o nome do programa e continua "Magnolia" nos créditos.

### Análises léxicas
- **Motor:** não mude a lógica de `src/helper/lexical/`. A regra de aceite é ter os mesmos resultados da 0.1.1 e do labiia_lex.
- **Unidade de análise:** as análises leem "unidades de texto" (`components/Lexical/lexical-units.ts`).
  - Em **Documentos**, cada documento é uma unidade. As notas dos cadernos são fontes de texto e entram como documentos.
  - Em **Códigos**, cada código escolhido é uma unidade, com todos os seus trechos. Os subcódigos somam no código-pai.
- **Mudança no preparo do corpus:** quando o mesmo texto passar a dar um resultado diferente, aumente `PREPARATION_VERSION`.
- **Pacotes R:** a lista fica em `LEXICAL_R_PACKAGES` (`src/renderer/models/lexical-api.ts`). O build gera `build/installer/r_packages.txt` a partir dela (`scripts/write-r-packages.mjs`). Ao mudar a lista, atualize também `components/Licence/credits.ts`.
- **Cache dos corpora:** fica em `<dados>\lexical-cache-v2`, separado do cache da 0.1, porque é gravado pelo V8 do Node que o criou.

### Licença e créditos
- Licença do programa: EUPL-1.2.
- Os recursos léxicos têm licenças próprias (`resources/lexical/README.md` e `credits.ts`).
- Não remova créditos do Magnolia.

### Comentários e testes
- Comentários e nomes de teste dizem a regra que o programa segue e por quê.
- Não registre ali nomes de pessoas, datas de decisão nem etapas do fluxo de trabalho.

## Cuidados ao testar

- **Dados isolados:** rode sempre com `LABIIA_DATA_DIR` apontando para uma pasta temporária.
  - Sem isso, o programa usa `%APPDATA%\labiia_quali`, a mesma pasta da 0.1.1 instalada.
  - O Magnolia regrava o arquivo de preferências inteiro.
- **Inspecionar a janela:** com `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333`, a janela pode ser inspecionada e comandada pela porta 9333.
- **Programa da pessoa:** não feche o labiia_quali nem o Magnolia que a pessoa está usando.
  - Ao terminar, encerre só os processos cujo executável está em `labiia-quali-build`.
- **Projetos de teste:** use sempre cópias, nunca os projetos originais da pessoa.
- **Testar o pacote sem instalar:** extraia o instalador com o 7-Zip numa pasta temporária, de preferência com acento e espaço no nome, e rode `labiia_quali.exe` de lá, com `LABIIA_DATA_DIR`. A pasta extraída tem a mesma disposição da instalada: executável, `labiia-node.exe`, `helper/`, `lexical/` e `installer/`.
- **R:** não rode a instalação real do R só para testar.
  - Para testar os pacotes, aponte `LOCALAPPDATA` para uma pasta vazia e rode `installer\r-setup.ps1 -Action packages`.
  - Para testar o instalador sem R, use `/SIMULARSEMR`.
- **Antivírus:** Avast e Kaspersky podem bloquear a leitura de arquivos da Área de Trabalho ou de Documentos. O Rust devolve `os error 5`, e a interface explica o caso (`utils/import-errors.ts`).

## Trazer uma versão nova do Magnolia

1. Num ramo próprio, faça `git fetch upstream` e `git merge <tag do Magnolia>`.
2. Os pontos de contato com o Magnolia estão nos arquivos abaixo; procure `labiia_quali:` em cada um.
   - Rust: `src-tauri/src/lib.rs`, `windows.rs`, `storage.rs`, `updater.rs`, `menu.rs`, `commands.rs` (ação `author`), `i18n.rs`, `crates/magnolia-core/src/qdpx/{reader,writer,mod}.rs`.
   - Interface: `src/renderer/platform/tauri-api.ts`, `models/types.ts`, `App.tsx`, `components/Toolbar/Ribbon.tsx`, `i18n/index.ts`.
   - Configuração: `tauri.conf.json`.
3. Rode `npm run i18n:sync`, os testes e a paridade léxica.

## Instalador

- `npm run build` gera o assistente NSIS em português. Os ganchos de `src-tauri/windows/hooks.nsh` cuidam do R depois da cópia dos arquivos:
  - procuram um R 4.5 ou mais novo;
  - se não acharem, oferecem baixar o R 4.6.1 do CRAN, conferindo o SHA-256 (`build/installer/r_runtime.json`);
  - instalam os pacotes numa pasta própria do labiia_quali.
- Parâmetros: `/S`, `/R=install-r|packages|skip` e `/SIMULARSEMR`.
- Os scripts PowerShell do instalador precisam de UTF-8 com BOM, e o `.gitattributes` os guarda byte a byte.

## Git, GitHub e publicação

- **Ramo de trabalho e remotos:** o ramo é `labiia-quali-2`. `upstream` é o Magnolia e `fork` é o clone local da versão 0.1.1. Os dois estão sem envio.
- **Commits e envios:** só quando a pessoa pedir.
- **Manual:** é publicado no GitHub Pages a cada envio que mexa em `manuais/` (`.github/workflows/manual.yml`).
- **Lançamentos:** ficam em Releases (`vX.Y.Z`), com o instalador e notas em português. Cada nova versão exige mudar `version` em `package.json` e em `src-tauri/Cargo.toml`.
- **Atualização automática:** está desligada (`UPDATES_ENABLED` em `src-tauri/src/labiia/mod.rs` e `src/renderer/labiia/config.ts`) até haver manifestos assinados do próprio labiia_quali.
