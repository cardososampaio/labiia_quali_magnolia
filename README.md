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
licença de lançamento ainda está em aberto.
