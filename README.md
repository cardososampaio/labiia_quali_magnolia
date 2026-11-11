# labiia_quali

Software livre de análise de dados qualitativos (QDA) para pesquisadores
brasileiros, construído sobre o [Magnolia](https://github.com/caledavis/Magnolia),
de Cale Davis. O README original do Magnolia, com a descrição completa dos
recursos herdados, está em [README.magnolia.md](README.magnolia.md).

## O que muda em relação ao Magnolia

- **Interface em português brasileiro**, com opção de inglês em
  Preferências → Geral → Idioma, e os termos Características e Atributos no
  lugar de Etiquetas e Categorias.
- **Contagem de palavras em português**: vem do Magnolia 2.1, que lê
  palavras acentuadas inteiras e traz uma lista de palavras vazias em
  português, editável na ferramenta Frequência de palavras. Números e datas
  seguem o formato da região do computador.
- **Codificação sem arrastar**: ao selecionar um trecho (texto, área de PDF ou
  imagem, linhas da transcrição de vídeo, respostas de questionário) aparece o
  balão "aplicar código". Ele abre a barra de codificação com a posição da
  seleção, busca de código, "Codificar em" (janela com todos os códigos),
  "Último", "Novo in vivo" e atalhos para os códigos usados recentemente.
  Arrastar códigos, arrastar a seleção até um código e os atalhos continuam
  funcionando.
- **Seleção manual em vez de arrastar**: o botão "Selecionar manualmente…"
  escolhe itens numa lista na Consulta, no seletor de documentos, em "Agrupar
  por", na Matriz de síntese, em Relatórios e no Mapa de relações.
- **Visual Windows**: faixa de opções com cores por família de ação, botão
  Iniciar, barra de status e tema Windows claro ou escuro.
- **Fechar pergunta antes**: fechar a janela do projeto pergunta se deve
  encerrar o programa; o projeto é salvo automaticamente.
- **Atualização automática desligada**: o atualizador herdado instalaria
  versões do Magnolia por cima do labiia_quali. Ele volta a ser ligado quando
  o labiia_quali tiver um canal de lançamentos próprio.

## Análises léxicas

O ícone **Análises léxicas** da barra reúne doze testes vindos do
[labiia_lex](https://github.com/cardososampaio/labiia_lex): Nuvem de palavras,
CHD (método Reinert), Análise de similitude, Emoções, Associações de
palavras-chave, Tópicos LDA, Mapa temático, YAKE, Sentimento, Word Tree,
Bigramas e Trigramas. Cada teste abre numa aba com o seletor de documentos, o
idioma do corpus (português, inglês ou espanhol) e os parâmetros do labiia_lex,
com os mesmos padrões. Os resultados (imagens, tabelas e resumo) podem ser
exportados em PNG, SVG e CSV e ficam guardados dentro do arquivo do projeto.

**Como funciona**

- **Preparação do corpus** (TypeScript, num processo de fundo): cada
  documento é um texto, cortado em segmentos de cerca de 40 palavras, e as
  palavras são lematizadas com os dicionários do IRaMuTeQ. Todos os testes
  usam os mesmos segmentos e as mesmas palavras do labiia_lex, para que o
  mesmo corpus dê os mesmos resultados: só contam para os 40 as palavras que
  o labiia_lex mantém (fora da lista Snowball; palavras com pontuação
  interna, como "1.1" ou "o.com", contam inteiras); os documentos são lidos
  em ordem alfabética de nome (a CHD, o LDA e o Mapa temático mudam conforme a
  ordem, e assim o resultado não depende da ordem de importação); e uma linha
  que começa com `****` ou `-*` é tratada como cabeçalho do formato do
  IRaMuTeQ: fica de fora e o corte recomeça depois dela. As stopwords
  apagadas pelo labiia_lex ficam no texto dos segmentos mostrados, para que
  continuem legíveis, mas os testes não as leem. O corpus preparado vai para um cache em disco:
  a segunda execução com os mesmos documentos começa direto.
- **Motores R**: Nuvem, Similitude, Emoções, LDA e CHD usam os mesmos scripts
  R do labiia_lex e do IRaMuTeQ. O R (4.0 ou mais recente) precisa estar
  instalado; os pacotes que faltam são instalados, com confirmação, numa pasta
  própria do labiia_quali (`%LOCALAPPDATA%\labiia_quali\R\library`).
- **Demais cálculos e gráficos** são feitos em TypeScript, reproduzindo os
  algoritmos e o desenho (matplotlib) do labiia_lex.

Conferido no corpus "Grupos focais - politica" do labiia_lex: Nuvem (imagem
idêntica pixel a pixel), Bigramas, Trigramas, Word Tree, Associações, CHD e
Mapa temático dão os mesmos números do labiia_lex.

**Diferenças em relação ao labiia_lex**, escolhidas para corrigir erros:

- Quebras de linha escritas como "\n" no texto não viram palavras falsas
  ("neu", "nolha").
- Os documentos aparecem com o nome, não como "Doc_0", "Doc_1".
- YAKE conta as ocorrências reais de cada expressão e lê cada segmento como
  uma frase (o labiia_lex lhe entrega o corpus como uma frase só, e as notas
  empatam).
- Similitude escolhe as palavras pela frequência do lema (o labiia_lex usava
  a frequência da forma escrita igual ao lema e perdia verbos frequentes,
  como "achar").
- Sentimento e Emoções também leem as palavras que o labiia_lex apaga antes
  dos testes ("mesmo", "são").
- Uma linha `****` dentro de um documento não o divide em dois documentos no
  LDA e no Mapa temático.
- O dendrograma com palavras da CHD usa a árvore que a CHD construiu.
- Os segmentos típicos da CHD são encontrados pelos lemas.
- A classificação dupla da CHD segue o método do IRaMuTeQ.
- Similitude, CHD e as AFCs usam semente fixa: o mesmo corpus dá sempre a
  mesma figura.

**Desempenho medido** com um corpus de cerca de 1 milhão de palavras:
preparação em 1,5 a 3 segundos, leitura do cache em menos de 0,1 segundo e a
maioria dos testes em menos de 2 segundos (YAKE em 5 a 12 segundos, conforme a
carga do computador; os testes em R dependem do R). Pico de memória de cerca
de 350 MB.

**Variáveis dos documentos**: cada característica de um documento vira uma
variável no formato do IRaMuTeQ (`*atributo_valor`, ou `*caracteristica_nome`
para características sem atributo), assim como a pasta (`*pasta_nome`). A CHD
mostra as variáveis mais associadas a cada classe (tabela "Variáveis por
classe" e AFC das variáveis). Uma característica num atributo do tipo **data**
dá a data do
documento (dd/mm/aaaa, mm/aaaa, aaaa ou aaaa-mm-dd); com datas, o Sentimento e
o LDA ganham a linha do tempo. Documentos sem data ficam fora das linhas do
tempo.

**Origem "Códigos"**: em vez dos documentos inteiros, os testes podem rodar
sobre os trechos codificados. Escolha os códigos (com ou sem subcódigos) e cada
trecho codificado dos documentos selecionados vira um texto, que herda as
variáveis e a data do seu documento e ganha a variável `*codigo_nome`. Um mesmo
trecho codificado com vários códigos entra uma vez só, com todas as variáveis
de código. Na CHD, os trechos continuam agrupados pelo documento de origem.
Trechos sem texto (áreas de imagem ou de PDF) ficam de fora, com aviso.

Os créditos dos dicionários, léxicos e scripts incluídos estão em
[resources/lexical/README.md](resources/lexical/README.md).

## Importar livro de códigos

Em Livro de códigos → **Importar livro de códigos** entram arquivos REFI-QDA
(`.qdc`) e livros de códigos escritos em Word (`.docx` e `.doc`), OpenDocument
(`.odt`), RTF (`.rtf`) e Markdown (`.md`). Categorias são os códigos pais;
códigos são os filhos, netos e assim por diante. Num documento, o programa
reconhece três jeitos de escrever, um por documento:

- **Títulos do Word**: Título 1 é categoria, Título 2 é código, Título 3 é
  subcódigo (em Markdown, `#`, `##`, `###`);
- **Negrito e número**: uma linha inteira em negrito que começa com número
  ("1. Nível de reflexão") é categoria; as linhas numeradas sem negrito
  ("0. nenhuma", "1. opinião") são os códigos dela;
- **Numeração**: "1." é categoria, "1.1" é código, "1.1.1" é subcódigo, ou o
  nível de uma lista numerada.

O texto logo abaixo de um item vira a descrição dele; o que vem antes da
primeira categoria é tratado como introdução e fica de fora, e um título único
no topo é o nome do livro. O jeito que melhor explica o documento é escolhido
sozinho, e nada entra no projeto antes da prévia: nela dá para trocar o jeito
de leitura, desmarcar linhas, subir ou descer um item de nível e manter ou
tirar os números dos nomes. O `.doc` é convertido antes pelo Word ou, sem ele,
pelo LibreOffice; sem nenhum dos dois, o programa pede para salvá-lo como
`.docx`. Tabelas dentro do documento não são lidas.

## Base técnica

Desde a versão 0.2.0 o labiia_quali roda sobre a base do Magnolia 2.1:
Tauri, com o núcleo escrito em Rust, e a interface em React. O motor das
análises léxicas continua em TypeScript, sem mudança de lógica, e roda num
programa auxiliar Node embutido no instalador, que chama o R. Os projetos
da versão 0.1 abrem na 0.2.0 com tudo, inclusive os resultados léxicos
salvos, e o contrário também vale.

## Como rodar em desenvolvimento

Requisitos: Windows 10 ou 11, Node.js 24 ou mais novo, Rust (rustup, MSVC) e,
para as cinco análises que usam R, o R 4.5 ou mais novo.

```bash
npm ci
npm run prepare:helper   # Node do ajudante (versão fixa, conferida) e empacotamento
npm run dev
```

Testes: `npm run typecheck`, `npx vitest run` e `cargo test --workspace`.
Detalhes para quem programa em [AGENTS.md](AGENTS.md).

## Gerar o instalador do Windows

```bash
npm run build
```

Gera `target/release/bundle/nsis/labiia_quali_<versão>_x64-setup.exe`, o
assistente em português. Depois de copiar os arquivos, ele procura o R e
pergunta se deve instalar o que falta: os pacotes, se encontrar um R 4.5 ou
mais novo, ou o R 4.6.1 do CRAN (conferido por SHA-256, só para o usuário,
sem senha de administrador) e os pacotes, se não encontrar. O programa
funciona sem o R; as análises que precisam dele avisam.

Para instalar sem telas: `labiia_quali_<versão>_x64-setup.exe /S /R=packages`
(ou `/R=install-r`, `/R=skip`).

## Traduções

A interface usa o sistema de tradução do Magnolia: cada texto tem uma chave
(`t('labiia.lexical.run')`) e as traduções ficam em
`src/renderer/locales/pt-BR.json` e `en.json`. Os termos do labiia_quali
(Características e Atributos no lugar de Etiquetas e Categorias, e o nome
do programa) ficam numa sobreposição própria, em `src/renderer/locales/labiia/`,
para que as versões novas do Magnolia entrem sem conflito.

## Licença

O Magnolia é distribuído sob a [EUPL-1.2](LICENSE). Por ser uma obra derivada,
o labiia_quali deve ser distribuído sob a EUPL-1.2 ou uma das licenças
compatíveis listadas no anexo da EUPL, com o código-fonte disponível e
mantendo os avisos de autoria e licença do Magnolia. A escolha final da
licença de lançamento ainda está em aberto. As análises léxicas vêm do
labiia_lex (GPL-3.0 ou posterior) e incluem obras com licenças próprias
(scripts e dicionários do IRaMuTeQ sob GPL, YAKE sob LGPL-3.0, OpLexicon),
listadas em [resources/lexical/README.md](resources/lexical/README.md). O
léxico de emoções NRC, usado pelo pacote R syuzhet no teste Emoções, é livre
para pesquisa e ensino; o uso comercial exige licença do National Research
Council Canada. O R e os pacotes do CRAN não vão dentro do programa e têm
cada um a sua licença (a lista está em Ajuda → Licença).
