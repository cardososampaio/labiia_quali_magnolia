# labiia_quali

Software livre de análise de dados qualitativos (QDA) para pesquisadores
brasileiros, construído sobre o [Magnolia](https://github.com/caledavis/Magnolia),
de Cale Davis. O README original do Magnolia, com a descrição completa dos
recursos herdados, está em [README.magnolia.md](README.magnolia.md).

## O que muda em relação ao Magnolia

- **Interface em português brasileiro**, com opção de inglês em
  Preferências → Geral → Idioma. A troca vale na próxima vez que o programa
  for aberto, para não descartar trabalho não salvo.
- **Contagem de palavras em português**: palavras acentuadas são contadas
  inteiras ("não", "coração", "pré-escola") e stopwords comuns em português e
  em inglês ficam de fora por padrão (a lista continua editável na ferramenta
  Frequência de palavras). Porcentagens e estatísticas aparecem no formato
  brasileiro (1,5).
- **Codificação sem arrastar**: ao selecionar um trecho (texto, área de PDF ou
  imagem, linhas da transcrição de vídeo, respostas de questionário) aparece o
  balão "aplicar código". Ele abre a barra de codificação com a posição da
  seleção, busca de código, "Codificar em" (janela com todos os códigos),
  "Último", "Novo in vivo" e atalhos para os códigos usados recentemente.
  Arrastar códigos e os atalhos Ctrl+número continuam funcionando.
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

**Variáveis dos documentos**: cada etiqueta de um documento vira uma variável
no formato do IRaMuTeQ (`*categoria_valor`, ou `*etiqueta_nome` para etiquetas
sem categoria), assim como a pasta (`*pasta_nome`). A CHD mostra as variáveis
mais associadas a cada classe (tabela "Variáveis por classe" e AFC das
variáveis). Uma etiqueta numa categoria do tipo **data** dá a data do
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

## Como rodar em desenvolvimento

Requer [Node.js](https://nodejs.org/) 20 ou mais recente.

```bash
npm install
npm run dev
```

Outros comandos: `npm test` (testes automáticos), `npm run build` (compila) e
`npm run package:win` (gera o instalador do Windows em `dist/`).

## Traduções

Os textos da interface são escritos em inglês no código e traduzidos por
`t('Texto em inglês')`. As traduções em português ficam em
[src/renderer/i18n/pt-BR.ts](src/renderer/i18n/pt-BR.ts); um texto sem
tradução aparece em inglês em vez de ficar em branco.

## Licença

O Magnolia é distribuído sob a [EUPL-1.2](LICENSE). Por ser uma obra derivada,
o labiia_quali deve ser distribuído sob a EUPL-1.2 ou uma das licenças
compatíveis listadas no anexo da EUPL, com o código-fonte disponível e
mantendo os avisos de autoria e licença do Magnolia. A escolha final da
licença de lançamento ainda está em aberto. Os recursos das análises léxicas
incluem obras com licenças próprias (scripts e dicionários do IRaMuTeQ sob
GPL, YAKE sob LGPL-3.0, OpLexicon), listadas em
[resources/lexical/README.md](resources/lexical/README.md).
