# Correções propostas para o labiia_lex

Documento para um agente de IA aplicar no repositório `C:\Users\cardo\Desktop\labiia_lex`.

## Contexto

Os itens abaixo foram encontrados ao comparar o labiia_lex com o labiia_quali, que é um porte dele, saída por saída. A comparação usou os mesmos corpora:

- `Corpus para testes/Grupos focais - politica`
- `Corpus para testes/entrevistas-democracia-digital`

Cada item traz:

- **O problema:** o que acontece e por que está errado.
- **A evidência:** números observados nesses corpora.
- **Onde:** arquivo, função e linhas aproximadas; as linhas podem ter mudado.
- **Correção:** o que mudar.
- **Aceite:** como provar que ficou certo.

**Regras para quem for aplicar:**

- Corrija um item por vez, com teste automático (pytest) e um commit por item.
- Não mude o comportamento de partes que não estão listadas aqui.
- Vários itens mudam os resultados das análises. Isso é esperado e é o objetivo; registre no changelog o que muda para o pesquisador.
- Antes de começar, gere as saídas atuais dos 12 testes nos dois corpora e guarde-as como "antes". Assim cada correção pode ser comparada com o estado anterior.

**Ordem sugerida:**

| Prioridade | Itens |
|---|---|
| Alta | 1, 2, 3, 4 (mudam a interpretação) |
| Média | 5, 6, 7, 8 |
| Baixa | 9 a 12 |

---

## 1. Similitude: escolha das palavras usa a frequência errada

**Problema.** Quando o vocabulário passa do limite (200 termos no modo fiel ao IRaMuTeQ), os termos são ordenados por frequência para escolher quais ficam.

- Com `use_lemmas=True`, os termos são lemas.
- Mas a frequência é procurada em `corpus.formes.get(token)`, que é o dicionário de **formas**.
- Um lema só "acha" a frequência da forma escrita igual a ele. Quando essa forma não existe, recebe frequência 1.
- Resultado: verbos e outras palavras flexionadas ficam fora da rede, mesmo sendo das mais frequentes. "achar" tem 1.822 ocorrências como lema, mas a forma "achar" aparece só 18 vezes.

**Evidência** (Grupos focais, padrões):

- Ficam de fora: achar (1.822), acreditar (493), entender (529), concordar (286), acontecer (255), pensar (198) e outros.
- Entram palavras com frequência real menor ("conta", 14).
- O vocabulário certo divide só 151 de 200 palavras com o atual. Nos pares em comum, as contagens de coocorrência são idênticas, então o erro está só na escolha.

**Onde.** `src/analysis/similitude/matrix.py`:

- `build_eligible_vocabulary`, por volta das linhas 535 a 548 (`freq_pairs`, `corpus.formes.get(token)`);
- `build_similitude_matrix`, por volta das linhas 620 a 640 (mesmo padrão).

O mesmo erro de origem aparece em `_audit_dropped_tokens` (linhas 680 a 800). Ali `unique_candidates` já usa a frequência certa do lema, então a auditoria e a matriz discordam entre si.

**Correção.** Nas duas funções, ordenar pela frequência da entrada certa:

```python
source = corpus.lems if use_lemmas else corpus.formes
entry = source.get(token)
freq = int(getattr(entry, "freq", 0) or 0)
```

- Desempate estável: manter a ordem original do vocabulário, como hoje.
- `build_eligible_vocabulary` e `build_similitude_matrix` precisam dar exatamente a mesma lista, porque a janela de seleção de palavras depende disso. Melhor ainda: extrair uma função única de ranqueamento e usá-la nos dois lugares.

**Aceite.**

- Teste com um corpus pequeno em que um lema verbal frequente só aparece flexionado ("acho", "achei", "acha"). Com `max_terms` menor que o vocabulário, o lema "achar" precisa entrar.
- No corpus de grupos focais, "achar", "acreditar" e "entender" passam a aparecer no `similitude_vocabulary.csv`.

---

## 2. YAKE: o corpus inteiro vira uma frase só, e a frequência mostrada é falsa

São dois defeitos no mesmo arquivo.

### 2a. Uma frase só

**Problema.** `extract_keyphrases_yake` junta todos os segmentos com `"\n".join(...)` e entrega um único texto ao YAKE.

- O texto preparado não tem pontuação, porque o pipeline em R a removeu.
- Sem pontuação, o YAKE enxerga **uma única frase gigante**.
- As medidas de posição e de dispersão por frase perdem o sentido, e as notas desabam para empates.

**Evidência** (Grupos focais): as 14 primeiras expressões saem todas com relevância 1.000.000,000 (nota bruta 0,000000), empatadas.

**Onde.** `src/analysis/keyphrase_yake.py`, por volta das linhas 155 a 172.

**Correção.**

- Cada segmento (UCE) deve chegar ao YAKE como uma frase. Opção simples: terminar cada segmento com ". " antes de juntar, ou seja, `". ".join(...)`, para que o divisor de frases do YAKE os separe.
- Confirmar que o segmentador do yake 0.7.x corta em ". " seguido de palavra minúscula. Se não cortar, usar a API de baixo nível (`DataCore`) com a lista de frases já pronta.
- No labiia_quali usamos a segunda via: um porte do algoritmo que recebe a lista de frases.

### 2b. Frequência inflada

**Problema.** `_count_phrase` devolve `max(count, 1)` **para cada segmento**, e `_count_phrase_in_texts` soma isso por segmento.

- Todo segmento conta pelo menos 1, mesmo sem a expressão.
- A "frequência" vira aproximadamente o número de segmentos mais as ocorrências reais.
- Além disso, a busca é por substring (`str.find`) e não por palavra inteira: "lula" casa dentro de "celular".

**Evidência** (Grupos focais, 3.351 segmentos):

| Expressão | Frequência mostrada | Real |
|---|---|---|
| "cardoso sampaio" | 3.706 | 1.762 |
| "opinião rafael cardoso" | 3.351 | 14 (em 14 segmentos) |

**Onde.** `src/analysis/keyphrase_yake.py`, linhas 228 a 247.

**Correção.**

- Contar ocorrências não sobrepostas da sequência de **palavras** (tokens) em cada segmento, sem o `max(..., 1)` por segmento.
- Se quiser garantir mínimo 1, aplicar no total final.
- Contar também em quantos segmentos a expressão aparece (DocCount), se a tabela tiver essa coluna.

### 2c. Parâmetros ignorados

**Problema.** `windowsSize`, `dedupLim` e `dedupFunc` são passados com esses nomes, mas o yake 0.7.3 instalado espera `window_size`, `dedup_lim` e `dedup_func`. Os valores pedidos são ignorados em silêncio: a janela efetiva fica 1 e o dedup fica 0,9.

**Onde.** Mesma chamada a `yake.KeywordExtractor`, linhas 164 a 171.

**Correção.**

- Passar os nomes certos para a versão instalada, ou detectar a versão.
- Fixar a versão do yake em `requirements.txt` (hoje está `yake>=0.4.8`).
- Atenção: corrigir isso muda os resultados. Decidir com o responsável qual janela usar (o código pedia 2).

**Aceite do item 2.**

- Teste com 3 segmentos curtos: as notas não podem empatar todas.
- A frequência de uma expressão que aparece 2 vezes em 1 segmento precisa ser 2, não 1 + (segmentos − 1).
- "lula" não pode casar dentro de "celular".

---

## 3. Linhas que começam com `****` dentro do texto viram novos textos

**Problema.** O formato do IRaMuTeQ usa `****` no início da linha para abrir um novo texto. Mas transcrições e textos comuns podem ter linhas que começam com asteriscos: negrito do Markdown, separadores, falas destacadas. Esses casos são tratados como cabeçalho de texto, e o efeito é este:

- a fala daquela linha **some** da análise (vira "variáveis");
- o documento é partido em vários "textos";
- os pedaços aparecem como documentos falsos (`Doc_1`, `Doc_2`) no LDA e no Mapa temático;
- o corte de segmentos recomeça ali.

**Evidência** (Grupos focais). O arquivo `0-2sm__CB-T12-BB-0-2sm-13jan25_transcricao.docx.txt` tem as linhas `***** e Cauã?` e `**** e aí queria entender, na visão de vocês, não é?`.

- O corpus fica com 16 textos em vez de 14.
- O LDA modela 16 documentos.

**Onde.**

- `Rscripts/text_pipeline.R`, por volta da linha 381: `is_header <- ... startsWith(trimmed_all, "****")`.
- `src/core/corpus_builder.py`, `build_corpus_from_text`: `if line.startswith("****")`, e o mesmo para `-*`.
- Na importação de pastas e arquivos (`src/importers/`), onde o app escreve os cabeçalhos `**** *doc_...`.

**Correção.** Separar o cabeçalho que o **app** gera do texto que o **usuário** escreveu:

1. Na importação de arquivos comuns (txt, docx, pdf…), neutralizar no conteúdo as linhas que começam com `****` ou `-*` antes de montar o corpus. Por exemplo, remover os asteriscos iniciais ou prefixar um espaço sem significado, preservando o texto da fala.
2. Só tratar como cabeçalho a linha que segue o formato do IRaMuTeQ: `****` seguido de espaço e de variáveis `*nome_valor`. Regex sugerida: `^\*{4}(\s+\*\S+)*\s*$`. Linhas como `**** e aí queria entender` não passam.
3. Arquivos já no formato IRaMuTeQ, importados como corpus IRaMuTeQ, continuam funcionando como hoje.

**Aceite.**

- Teste com um texto que contém `**** e aí queria entender`: o corpus tem 1 texto, e as palavras "queria" e "entender" estão nos segmentos.
- Um corpus IRaMuTeQ legítimo (`**** *doc_a *grupo_x`) continua abrindo 1 texto por cabeçalho.

---

## 4. Quebras de linha escritas como "\n" viram palavras falsas

**Problema.** Alguns textos extraídos trazem a sequência literal barra invertida + n em vez de uma quebra de linha.

- O pipeline em R remove a barra e deixa o "n" grudado na palavra seguinte.
- Surgem palavras falsas: "nrafael", "npalestrante", "nnão", "neu", "nolha".
- `normalize_literal_escapes` já existe, mas é chamada só em `corpus_builder.py`, **depois** do pipeline em R. Quando ela roda, a barra já sumiu e não há o que reparar.
- O reparo posterior (`repair_fused_n_prefix`) corrige só parte dos casos e só no texto do segmento, não na contagem usada para cortar.

**Evidência** (entrevistas-democracia-digital):

- "npalestrante" aparece 218 vezes, "nrafael" 53 e "n" sozinho 113.
- O vocabulário da CHD tem 1.170 termos; sem o defeito, seriam 1.159.

**Onde.**

- `src/core/r_text_pipeline.py`, `RTextPipeline.run` (antes de montar o `payload`);
- `src/core/corpus_builder.py`, linha 42;
- `src/core/lexicon.py`, linha 505 (`normalize_literal_escapes`).

**Correção.** Chamar `normalize_literal_escapes(text)` **antes** de enviar o texto ao pipeline em R, em `RTextPipeline.run` ou em quem a chama. A chamada em `corpus_builder.py` pode ficar como segurança.

**Aceite.**

- Teste com o texto `"cristiano ferri\\nestá falando"`: o texto preparado contém "está" e não "nestá".
- No corpus de entrevistas, "npalestrante" e "nrafael" não aparecem no `formes.csv` da CHD.

---

## 5. Dendrograma "enhanced" da CHD desenha uma árvore que a CHD não construiu

**Problema.**

- A figura principal da CHD (dendrograma com as palavras de cada classe) é desenhada com uma árvore **refeita** por agrupamento de Ward sobre os perfis de qui-quadrado das classes.
- Essa árvore pode juntar classes que a CHD separou logo no início, e vice-versa.
- O leitor interpreta a proximidade entre classes a partir de uma árvore que não é a da classificação.

**Onde.** `src/analysis/chd_reinert.py`: `_build_newick_from_profiles` (por volta da linha 2601) e os pontos que o usam (por volta das linhas 1911 e 2534), em `_generate_enhanced_dendrogram*`.

**Correção.**

- Desenhar a árvore real do IRaMuTeQ. O objeto `tree.cut1$tree.cl` já está salvo em `Rdendro.RData` pelo script nativo.
- Exportar em Newick no próprio script R com `ape::write.tree(tree.cut1$tree.cl, file = "tree.nwk")` e usar essa árvore na figura.
- Manter o Ward só como plano B, quando `tree.nwk` não existir, e registrar o aviso.

**Aceite.** Num corpus em que a primeira divisão da CHD separa a classe 3 de {1, 2, 4}, o dendrograma desenhado mostra a classe 3 sozinha num ramo.

---

## 6. Resultados que mudam a cada execução (falta de semente fixa)

**Problema.** O mesmo corpus dá figuras ou numerações diferentes a cada execução.

- **CHD:** `irlba` começa de um vetor sorteado. A partição costuma ser a mesma, mas a ordem dos ramos e a **numeração das classes** mudam entre execuções. Isso é confuso ao comparar relatórios.
- **Posição dos rótulos na AFC:** também é sorteada.
- **Similitude:** o layout da rede é sorteado.

**Onde.**

- Template `chd_native` em `src/core/r_script_generator.py`, antes do laço que chama `CHD(...)`;
- template `chd_reinert_profiles` (AFC);
- script de desenho da similitude (`similitude_render.R` ou equivalente).

**Correção.** `set.seed(42)` logo antes das chamadas sorteadas, em cada script gerado.

**Aceite.** Rodar a CHD duas vezes no mesmo corpus dá `n1.csv` e `dendrogramme.png` idênticos byte a byte. O mesmo vale para a imagem da similitude.

---

## 7. Classificação dupla da CHD

São dois defeitos.

### 7a. Erro no script do IRaMuTeQ

**Problema.** Em `chdtxt.R`, função `getfille`, o valor 0 (que marca "classe sem filhas") é lido como índice de classe. `nlf[[0]]` dá erro, e a classificação dupla para.

**Correção.** Na `getfille`, só descer quando `cl > 0 && cl <= length(nlf)`.

### 7b. Modo duplo do labiia_lex não segue o método

**Problema.** O modo duplo próprio do labiia_lex (`_run_double_mode`) não segue o método do IRaMuTeQ: usa Ward e truncamento.

**Correção.** A dupla do IRaMuTeQ é esta:

- monta as unidades de contexto (`make_uc`) para os dois tamanhos (`tailleuc1` = 12 e `tailleuc2` = 14 palavras ativas);
- gera `TableUc1`/`TableUc2` e `listuce1`/`listuce2`;
- roda `CHD()` nas duas tabelas;
- chama `Rchdtxt(..., classif_mode = 0, mincl = <valor do usuário, 0 = automático>)`.

Não passar um `mincl` pré-calculado: com 0, o `Rchdtxt` calcula sozinho.

**Aceite.** Num corpus médio, o modo duplo termina sem erro e as classes saem do cruzamento das duas classificações. Isso se confere no `n1.csv` e na contagem por classe.

---

## 8. Sentimento e Emoções não leem palavras apagadas na preparação

**Problema.** O pipeline em R apaga as stopwords do Snowball antes de qualquer análise. O Sentimento (OpLexicon) e as Emoções (NRC/syuzhet) leem o texto já sem elas. Algumas dessas palavras têm polaridade ou emoção nos léxicos e deixam de ser contadas.

**Evidência** (Grupos focais).

Sentimento:

| | Positivo | Negativo | Neutro |
|---|---|---|---|
| Hoje | 31,7% | 25,7% | 42,6% |
| Lendo todas as palavras | 32,4% | 24,0% | 43,6% |

As palavras que faltam hoje são "mesmo" (neutra, 573 vezes) e "são" (positiva, 415).

Emoções: tristeza passa de 3.414 para 3.532.

**Onde.**

- `src/analysis/sentiment_extra.py`, que usa `tokenize_text(record.text, ...)` sobre o texto preparado;
- `src/analysis/emotions.py`, que usa `corpus.get_uces()`.

**Correção** (decisão de método; confirmar com o responsável).

- Os métodos de léxico pedem que o texto seja lido como foi escrito; o léxico decide o que pontuar.
- Opção A: guardar, junto de cada UCE, o texto antes da remoção de stopwords, e usá-lo nesses dois testes.
- Opção B, mais simples: reprocessar o texto bruto do corpus só para esses testes.
- Manter o corte de segmentos como está.

**Aceite.** Com o texto "isso é mesmo bom", o Sentimento conta "mesmo" e "bom" (OpLexicon).

---

## 9. Nomes dos documentos

**Problema.** O LDA (heatmap documento × tópico, `lda_doc_topic.csv`) e o Mapa temático (`thematic_documents.csv`) mostram "Doc_0", "Doc_1"… em vez do nome do arquivo.

**Onde.** `src/analysis/lda_analysis.py`, linha 303 (`f"Doc_{did}"`), e o equivalente no mapa temático. O rótulo vem de `bundle.doc_id_to_label`, que fica vazio quando o texto não tem a variável de título.

**Correção.** Na importação, guardar o nome do arquivo de origem em cada UCI (por exemplo, na própria linha `**** *doc_<nome>`, que já é escrita) e preencher `doc_id_to_label` com ele, sem a extensão.

**Aceite.** O heatmap do LDA no corpus de grupos focais mostra os nomes dos arquivos.

---

## 10. Padrão do Mapa temático diferente entre a janela e o motor

**Problema.**

- A janela (`src/ui/dialogs/semantic_analysis_dialogs.py`, por volta da linha 422) usa `top_edges = 160`.
- O motor (`src/analysis/thematic_map_analysis.py`, linha 38) usa `top_edges = 400`.
- Quem roda pelo despacho ou por script obtém outro mapa que quem roda pela janela.

**Correção.** Um único valor padrão, definido num só lugar (por exemplo, `iramuteq_defaults.py` ou a dataclass de parâmetros) e lido pelos dois.

**Aceite.** `dispatch_analysis("thematic_map", corpus, out, {})` e a janela com valores padrão geram o mesmo `expression_edges.csv`.

---

## 11. Corte do vocabulário limitado descarta a frequência acima do empate

**Problema.** `TextProcessor._limit_vocabulary` repete a regra do IRaMuTeQ (`make_actives_nb`): quando há empate na posição do limite, o grupo empatado sai. A busca do ponto de corte, porém, faz assim:

- começa em `lim = effs[limit-1] + 1`;
- usa `effs.index(lim)`.

Quando existe algum termo com essa frequência imediatamente acima, o corte cai **antes** dele e descarta também esse grupo. Exemplo com frequências [4, 3, 2, 2] e limite 3: fica só o termo de frequência 4. O esperado seria ficar com 4 e 3.

Sem empate, mantém `limit - 1` termos, e não `limit`.

**Onde.** `src/core/text_processor.py`, por volta das linhas 386 a 428.

**Correção** (confirmar com o responsável se a intenção é repetir o IRaMuTeQ ao pé da letra).

- O ponto de corte deveria ser o primeiro índice com frequência igual à do empate, ou seja, manter tudo o que é estritamente maior.
- Sem empate, `stop = limit`.
- Se a decisão for manter a fidelidade ao IRaMuTeQ, documentar isso no código.

**Aceite.** Frequências [4, 3, 2, 2] com limite 3 resultam em [4, 3].

---

## 12. Valor salvo da janela da CHD vira o novo "padrão" sem aviso

**Problema.**

- A janela da CHD guarda o último valor usado (`config.json`, `analysis_defaults.chd` e `last_analysis_params.chd`) e o reapresenta como padrão.
- No computador do usuário, a frequência mínima da CHD ficou em 5 sem que ele percebesse.
- Ele comparou resultados achando que estava no padrão (2, efetivo 3).

**Correção.**

- Botão "Restaurar padrões" na janela.
- Destacar os campos cujo valor difere do padrão de fábrica (por exemplo, com um asterisco ou outra cor).

**Aceite.** Com `min_freq = 5` salvo, a janela mostra o campo destacado e "Restaurar padrões" volta para o valor de fábrica.

---

## Como verificar o conjunto

1. Para cada item, um teste automático pequeno, como descrito em "Aceite".
2. Ao final, rodar os 12 testes nos dois corpora de `Corpus para testes` e comparar com as saídas "antes":
   - CHD, Bigramas, Trigramas, Word Tree, Associações e Nuvem só podem mudar pelos itens 3, 4, 6 e 7;
   - Similitude, YAKE, Sentimento, Emoções e LDA mudam pelos itens 1, 2, 8 e 9.
3. Registrar no changelog, em linguagem para pesquisadores, quais resultados mudam e por quê.
