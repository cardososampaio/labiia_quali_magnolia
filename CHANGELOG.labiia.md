# Novidades do labiia_quali

As novidades do Magnolia, em que o labiia_quali se baseia, estão em
[CHANGELOG.md](CHANGELOG.md).

## Próxima versão (ainda sem instalador)

### Novidades
- **Histórico dos códigos.** O projeto guarda quando cada código foi criado,
  renomeado, mesclado, movido, excluído ou importado, e quando a definição
  dele mudou, com quem fez e quando. Cada mudança pode receber uma
  justificativa. Desfazer não apaga nada: entra uma linha "Desfeito". O
  histórico vai dentro do arquivo do projeto e pode ser exportado como
  planilha (CSV) ou como relatório (Markdown). Abre em Análises > Histórico
  dos códigos, no menu de visualização do painel Códigos ou pelo botão
  direito num código. Vem ligado em todos os projetos e pode ser pausado.
  "Histórico deste código" mostra tudo o que tocou o código (inclusive
  subcódigos movidos para ele e códigos mesclados nele), e o relatório se
  lê etapa por etapa, em tabelas.
- **Histórico de um código mais limpo e organograma no relatório.** No
  histórico de um código, as linhas vêm do ponto de vista dele ("Subcódigo
  incluído", "Recebeu mesclagem") e sem a lista de todos os códigos. O
  relatório em Markdown foi refeito como trilha de auditoria, legível como
  texto puro e convertido: ficha, funil, de onde veio cada código final,
  etapas numeradas (com justificativa, importações agrupadas e desfazer
  ligado à decisão), árvore dos códigos com trechos, códigos que saíram e
  apêndices. Datas no formato brasileiro.
- **Grifos e comentários do Zotero.** Na importação do Zotero, a opção
  "Importar grifos e comentários" traz os grifos dos PDFs como citações; o
  comentário de cada grifo vira um código aplicado ao trecho, dentro de
  "Comentários do Zotero". Notas soltas viram memos.
- **Contagem dos subcódigos, código a código.** Pelo botão direito, cada
  código escolhe se o seu número não soma os subcódigos, soma só o nível
  logo abaixo (o Pai conta o Filho, não o Neto) ou soma todos os níveis.
  Só a contagem muda; os códigos continuam separados.
- **Painel Características:** ganhou um botão de fechar, e a aba Exibir
  ganhou o botão Características para reabri-lo.
- **Tela inicial:** passa a dizer só "Baseado no Magnolia, de Cale Davis",
  com o link para a página do Magnolia no GitHub, sem o pedido de apoio.
- **Projetos recentes na tela inicial:** cada projeto aparece pelo nome, em
  destaque, com a pasta embaixo. Antes, no Windows, o caminho inteiro
  aparecia no lugar do nome.

### Correções
- **Textos com acentos salvos no padrão antigo do Windows** (.txt, .md,
  legendas .srt e .vtt, .html) entram com os acentos certos. Antes, um texto
  gravado pelo Bloco de Notas antigo ou exportado de sistemas mais velhos
  aparecia com "�" no lugar de cada letra acentuada.

## 0.3.0

O labiia_quali passa para a base do Magnolia 2.2.0. As análises léxicas não
mudam: o motor, os dicionários e os resultados são os mesmos da 0.2.2.

### Mudanças nos resultados das análises de códigos
O Magnolia corrigiu como alguns resultados são calculados. **Análises salvas
em versões anteriores podem mostrar números diferentes ao serem abertas.**
Vale conferir os números já usados em textos, principalmente com áudio,
vídeo, imagens, caixas em PDF, colunas agrupadas e respondentes de
questionário com características.
- **Frequências de códigos:** áudio e vídeo passam a ser medidos pelo tempo
  que a codificação cobre (antes, o áudio dava sempre 0%); caixas em imagens
  e páginas de PDF, pela área. Uma codificação não conta mais do que o
  documento tem, e colunas que reúnem vários documentos mostram a média.
- **Coocorrências de códigos e Consulta:** caixas só coocorrem quando se
  sobrepõem na mesma página; codificações de áudio e vídeo, quando se
  sobrepõem no tempo.
- **Códigos nos documentos e Resultados nos documentos:** o total conta cada
  documento uma vez, e a coluna de uma característica inclui só as respostas
  de questionário que ela marca.
- **Codificações protegidas:** as da linha do tempo de vídeo guardam o tempo
  exato ao salvar, e as de PDF, imagem e gravação não somem quando o arquivo
  falta no projeto.

### Novidades
- **Concordância entre codificadores** (Análises → Equipe): compara como duas
  ou mais pessoas codificaram os mesmos documentos, cada uma na sua cópia do
  projeto. Dá a % de concordância e o kappa de Cohen por par, o alfa de
  Krippendorff com três ou mais pessoas, a comparação por segmentos e a
  visão por codificador. Clicar num resultado mostra os trechos lado a lado.
  Os resultados podem ir para uma janela própria, para um segundo monitor.
- **Importar do Zotero** (Início): lista as coleções da biblioteca do Zotero
  (7 ou mais novo) aberto no computador e importa os arquivos numa pasta
  Zotero. Autores, ano, publicação e outras informações viram
  características do documento; resumo e notas viram memos.
- **Frases com a palavra**, na Consulta: a caixa de texto ganha "Encontrar
  frases que contenham", e cada resultado é a frase inteira.
- **Datas digitadas** no seletor de documentos: "Entre" e "Fora de" aceitam
  dia, mês e ano digitados (basta o ano).
- **Mesclar projetos compara cadernos e pastas:** um documento movido de
  pasta pode ser aceito como uma mudança de nome, o que vem do outro projeto
  entra na pasta em que estava lá, e cadernos e notas têm seção própria.
  "Selecionar tudo" age só na seção aberta.
- **Progresso da importação:** uma janela mostra cada documento sendo
  importado e, se algum não entrar, diz o motivo e o que tentar.
- **Word, RTF e ODT** passam a ser montados em PDF pelo próprio programa,
  igual no Windows e no Mac, com o texto extraído mais exato. Vale para o que
  for importado daqui em diante; os documentos já importados não mudam.
- **As janelas lembram onde estavam:** a principal, a Consulta destacada e
  as janelas de Códigos, Memos e Diário de bordo reabrem no mesmo lugar e
  tamanho, inclusive num segundo monitor.
- **A Consulta calcula em segundo plano**, sem travar a janela em projetos
  grandes.

### Correções
- **Mesclar projetos não congela mais.** Quando o outro projeto tinha PDFs
  ou documentos do Word, o aviso "Lendo o texto dos PDFs" ficava por cima da
  tela e a escolha do que mesclar não aparecia.
- O Manual e outros links da Ajuda abrem no navegador.

## 0.2.2

### Novidades
- **Versão para Mac** com chip Apple (M1 em diante, macOS 13 ou mais novo),
  como versão de teste. Sem a assinatura paga da Apple: na primeira abertura,
  o programa é liberado uma vez em Ajustes do Sistema → Privacidade e
  Segurança. O R não vem com o instalador: o painel do R leva ao instalador
  oficial e depois instala os pacotes. A versão é compilada e testada em Macs
  do GitHub, que rodam as 13 análises e conferem que dão os mesmos
  resultados do Windows.
- **Diagnóstico do programa** (Iniciar; no Mac também no menu Ajuda): confere
  cada parte do programa (pasta de dados, componente das análises léxicas,
  dicionários, R e os lugares onde foi procurado, pacotes do R, LibreOffice)
  e diz o que fazer. O relatório pode ser copiado ou salvo para enviar a
  quem dá suporte, sem nenhum texto dos projetos.
- Ao abrir um projeto, um aviso mostra quando uma parte do programa não
  iniciou, ou quando o programa fechou de repente na vez anterior. Os erros
  do programa passam a ficar registrados em `logs/labiia_quali.log`.

### Correções
- Uma análise que falha mostra a mensagem de erro inteira, com o botão
  "Ver diagnóstico", e o painel do R distingue "o R não foi encontrado" de
  "o componente das análises não iniciou".

## 0.2.1

### Novidades
- Nova análise léxica: **Rede textual**, a rede de palavras no estilo do Gephi
  do labiia_lex (mesmas palavras, ligações e comunidades), sem Java nem R e
  interativa: aproximar, arrastar, buscar, ver os segmentos de cada palavra,
  esconder comunidades e exportar PNG, SVG, GEXF e CSV. O painel *Estilo e
  rede* (inspirado no Gephi Lite) muda cores, tamanhos, rótulos, fundo,
  filtros, ajustes do ForceAtlas2 e comunidades (recalcular, nomear, juntar).
- **Preparar corpus**, nas análises léxicas: junta o que o dicionário deixa
  separado, em português, inglês e espanhol. São quatro recursos: plurais
  fora do dicionário, variantes de grafia (os métodos do OpenRefine, como no
  labiia_lex), equivalências suas e expressões compostas sugeridas. Cada
  recurso tem revisão. As escolhas ficam no projeto e valem para as 13
  análises, e cada análise pode ser rodada sem elas para comparar. Tudo vem
  desligado: sem a preparação, os resultados não mudam.
- Um botão no fim do trecho selecionado abre o menu de codificação, com
  todos os códigos do livro. Ele substitui o arrastar do trecho até um
  código (mudança do Magnolia 2.1.0-beta.1).
- Com a barra de ferramentas compacta (Preferências), o menu Analisar também
  traz as análises léxicas. Quem vem da 0.1.1 abre com a faixa de opções.

### Correções
- O programa instalado não abre mais uma janela de terminal ao lado da sua.
- A CHD e as outras análises com R voltam a rodar no programa instalado: o
  R não conseguia abrir os scripts por causa da forma do caminho.
- Abrir um projeto depois de outro não perde mais o texto dos PDFs (e dos
  .docx, convertidos em PDF).
- Abrir um projeto com uma Rede textual aberta numa aba ainda não visível
  não deixa mais a janela em branco.

## 0.2.0

O labiia_quali passa para a base nova do Magnolia (2.1.0), que roda sobre o
Tauri, com o núcleo em Rust, no lugar do Electron.

### O que continua igual
- As 12 análises léxicas, com os mesmos resultados da 0.1.1: no corpus de
  entrevistas de referência, as tabelas das 12 análises são idênticas.
- Os projetos: um projeto da 0.1.1 abre na 0.2.0 com as análises léxicas
  salvas, e um projeto salvo na 0.2.0 guarda os resultados no mesmo formato
  (`labiia-lexical/` dentro do `.qdpx`).
- O livro de códigos a partir de Word (.docx e .doc), OpenDocument, RTF e
  Markdown, com a pré-visualização; os exemplos de teste dão os mesmos
  parágrafos e a mesma árvore de códigos.
- O visual: faixa de opções com cores por família, botão Iniciar, barra de
  status, tema Windows claro e escuro, tela inicial com a rede de palavras.
- Características e Atributos no lugar de Etiquetas e Categorias.
- A pasta de dados (`%APPDATA%\labiia_quali`): preferências, projetos
  recentes e o R escolhido continuam valendo.
- Atualização automática desligada.

### O que muda
- O programa é menor e abre mais depressa. O motor léxico roda num
  programa auxiliar Node embutido, que chama o R.
- Novidades do Magnolia 2.x: cadernos de notas de campo, janela de memos,
  exportação de documentos em PDF com os códigos, frequência de palavras
  nos trechos codificados, interface em
  pt-BR e em inglês com troca imediata de idioma.
- Fechar a janela do projeto pergunta antes ("Não" é a resposta padrão),
  salva e encerra o programa.
- O instalador pergunta sobre o R depois de copiar os arquivos, em vez de
  ter uma página própria no assistente. Os parâmetros `/R=` e `/SIMULARSEMR`
  continuam valendo. Não há mais versão portátil.
