# Novidades do labiia_quali

As novidades do Magnolia, em que o labiia_quali se baseia, estão em
[CHANGELOG.md](CHANGELOG.md).

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
- Abrir um projeto com uma Rede textual aberta numa aba ainda não visível
  não deixa mais a janela em branco.
- O programa é menor e abre mais depressa. O motor léxico roda num
  programa auxiliar Node embutido, que chama o R.
- Novidades do Magnolia 2.x: cadernos de notas de campo, janela de memos,
  exportação de documentos em PDF com os códigos, arrastar a seleção até um
  código, frequência de palavras nos trechos codificados, interface em
  pt-BR e em inglês com troca imediata de idioma.
- Um botão no fim do trecho selecionado abre o menu de codificação, com
  todos os códigos do livro. Ele substitui o arrastar do trecho até um
  código (mudança do Magnolia 2.1.0-beta.1).
- Com a barra de ferramentas compacta (Preferências), o menu Analisar também
  traz as análises léxicas. Quem vem da 0.1.1 abre com a faixa de opções.
- Fechar a janela do projeto pergunta antes ("Não" é a resposta padrão),
  salva e encerra o programa.
- O instalador pergunta sobre o R depois de copiar os arquivos, em vez de
  ter uma página própria no assistente. Os parâmetros `/R=` e `/SIMULARSEMR`
  continuam valendo. Não há mais versão portátil.
