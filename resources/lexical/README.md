# Recursos das análises léxicas

Arquivos que o labiia_quali usa para preparar o corpus e desenhar os testes
léxicos. Eles vão junto com o programa, fora do arquivo compactado do app,
porque o R precisa lê-los diretamente.

| Pasta | Conteúdo | Origem e licença |
|---|---|---|
| `dictionaries/` | Dicionários de formas, lemas e classes gramaticais (`lexique_pt`, `lexique_en`, `lexique_sp`), expressões compostas e `key.cfg` (classes ativas e suplementares) | IRaMuTeQ, de Pierre Ratinaud (GPL). O dicionário português é a versão revisada usada pelo labiia_lex. O francês do IRaMuTeQ foi construído a partir do Lexique 3 (lexique.org). |
| `stopwords/pt.txt`, `en.txt`, `es.txt` | Palavras vazias do Snowball, as mesmas que o pacote R `stopwords` entrega ao labiia_lex | Projeto Snowball (licença BSD) |
| `stopwords/visual_*.txt`, `allow_*.txt` | Palavras retiradas dos gráficos e nuvens (palavras vazias, marcas de conversa como "né" e "aí") e palavras curtas mantidas ("ia", "sus") | labiia_lex (MIT), exportadas da sua política de stopwords para que o labiia_quali mostre as mesmas palavras |
| `R/` | Scripts R dos testes | Adaptados do labiia_lex e do IRaMuTeQ |

Os dicionários e as listas do Snowball entram na preparação do corpus. Ao
atualizar um deles, aumente `PREPARATION_VERSION` em
`src/main/lexical/corpus/prepare.ts`: assim os corpora já guardados no cache
são preparados de novo com os arquivos novos. As listas `visual_*` e
`allow_*` só valem na hora de mostrar os resultados e não pedem isso.
