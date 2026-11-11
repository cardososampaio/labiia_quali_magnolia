# Emotions with the NRC lexicon (syuzhet): the R script of labiia_lex's
# "Análise de Emoções", with its parameters read from a JSON file instead of
# being written into the script. Run by labiia_quali with:
#   Rscript --vanilla emotions.R params.json
# Reads emotions_corpus_input.txt and writes emotions_bar.png,
# emotions_radar.png, emotions_polarity.png and three CSV tables.
# Packages: syuzhet, fmsb, jsonlite.

lib <- Sys.getenv("LABIIA_R_LIBS")
if (nzchar(lib)) .libPaths(c(lib, .libPaths()))
suppressPackageStartupMessages(library(jsonlite))
p <- fromJSON(commandArgs(trailingOnly = TRUE)[1])

# labiia_quali installs packages itself (with the user's consent), never from inside a run.
.lexi_install_pkg <- function(pkg, ...) stop(paste("Pacote R ausente:", pkg))

# ============================================================
# Emotion Analysis — NRC Lexicon (syuzhet)
# ============================================================

ensure_package <- function(pkg) {
    if (!requireNamespace(pkg, quietly = TRUE)) {
        stop(paste("Pacote R ausente:", pkg))
    }
    suppressPackageStartupMessages(library(pkg, character.only = TRUE))
}

ensure_package("syuzhet")

# ----- parâmetros -----------------------------------------------
corpus_file  <- "emotions_corpus_input.txt"
bar_out      <- "emotions_bar.png"
radar_out    <- "emotions_radar.png"
polarity_out <- "emotions_polarity.png"
stats_out    <- "emotions_stats.csv"
words_out    <- "emotions_words.csv"
words_summary_out <- "emotions_words_summary.csv"
width_px     <- as.integer(p$width)
height_px    <- as.integer(p$height)

# ----- leitura e normalização -----------------------------------
raw_text <- paste(
    readLines(corpus_file, encoding = "UTF-8", warn = FALSE),
    collapse = " "
)
raw_text <- iconv(raw_text, from = "UTF-8", to = "UTF-8", sub = "")

# ----- classificação token a token para rastreabilidade --------
emotion_cols <- c("anger", "anticipation", "disgust", "fear",
                  "joy", "sadness", "surprise", "trust")
export_cols <- c(emotion_cols, "positive", "negative")

raw_tokens <- unlist(strsplit(raw_text, "\\s+"))
norm_tokens <- tolower(gsub("[^[:alpha:]]", "", raw_tokens))
valid_idx <- which(nchar(norm_tokens) > 2)

if (length(valid_idx) > 0) {
    token_df <- data.frame(
        token_id = seq_along(valid_idx),
        palavra_original = raw_tokens[valid_idx],
        palavra = norm_tokens[valid_idx],
        stringsAsFactors = FALSE
    )
    words_freq <- sort(table(token_df$palavra), decreasing = TRUE)
    unique_words <- names(words_freq)
    word_nrc <- get_nrc_sentiment(unique_words, language = p$nrc_language)
    word_lookup <- cbind(
        data.frame(
            palavra = unique_words,
            frequencia_token = as.integer(words_freq),
            stringsAsFactors = FALSE
        ),
        word_nrc[, export_cols, drop = FALSE]
    )

    lookup_idx <- match(token_df$palavra, word_lookup$palavra)
    token_scores <- word_lookup[lookup_idx, export_cols, drop = FALSE]
    for (emo_col in export_cols) {
        token_scores[[emo_col]] <- as.integer(token_scores[[emo_col]])
    }

    totals <- colSums(token_scores[, emotion_cols, drop = FALSE])
    polarities <- colSums(token_scores[, c("positive", "negative"), drop = FALSE])
    total_all <- sum(totals)
    total_polarity <- sum(polarities)
    emotion_pct <- if (total_all > 0) round(totals / total_all * 100, 2) else rep(0, length(emotion_cols))
    polarity_pct <- if (total_polarity > 0) round(polarities / total_polarity * 100, 2) else rep(0, 2)

    stats_df <- data.frame(
        emocao = c(names(totals), "positive", "negative"),
        contagem = c(as.integer(totals), as.integer(polarities[c("positive", "negative")])),
        porcentagem = c(emotion_pct, as.numeric(polarity_pct[c("positive", "negative")])),
        stringsAsFactors = FALSE
    )
    write.csv(stats_df, file = stats_out, row.names = FALSE, fileEncoding = "UTF-8")

    classified_rows <- lapply(export_cols, function(emo_col) {
        matched <- token_scores[[emo_col]] > 0
        if (!any(matched)) {
            return(NULL)
        }
        data.frame(
            token_id = token_df$token_id[matched],
            palavra_original = token_df$palavra_original[matched],
            palavra = token_df$palavra[matched],
            tipo = if (emo_col %in% c("positive", "negative")) "sentimento" else "emocao",
            emocao = emo_col,
            stringsAsFactors = FALSE
        )
    })
    classified_rows <- Filter(Negate(is.null), classified_rows)

    if (length(classified_rows) > 0) {
        words_long_df <- do.call(rbind, classified_rows)
        rownames(words_long_df) <- NULL
        words_long_df <- words_long_df[order(words_long_df$token_id, words_long_df$emocao), ]
    } else {
        words_long_df <- data.frame(
            token_id = integer(0),
            palavra_original = character(0),
            palavra = character(0),
            tipo = character(0),
            emocao = character(0),
            stringsAsFactors = FALSE
        )
    }
    write.csv(words_long_df, file = words_out, row.names = FALSE, fileEncoding = "UTF-8")

    words_summary_rows <- lapply(export_cols, function(emo_col) {
        matched_words <- token_df$palavra[token_scores[[emo_col]] > 0]
        matched_words_unique <- sort(unique(matched_words))
        data.frame(
            tipo = if (emo_col %in% c("positive", "negative")) "sentimento" else "emocao",
            emocao = emo_col,
            contagem_tokens = length(matched_words),
            palavras_unicas = length(matched_words_unique),
            palavras_tokens = paste(matched_words, collapse = " | "),
            palavras_unicas_lista = paste(matched_words_unique, collapse = " | "),
            stringsAsFactors = FALSE
        )
    })
    words_summary_df <- do.call(rbind, words_summary_rows)
    rownames(words_summary_df) <- NULL
    write.csv(words_summary_df, file = words_summary_out, row.names = FALSE, fileEncoding = "UTF-8")
} else {
    stats_df <- data.frame(
        emocao = c(emotion_cols, "positive", "negative"),
        contagem = integer(length(emotion_cols) + 2),
        porcentagem = numeric(length(emotion_cols) + 2),
        stringsAsFactors = FALSE
    )
    write.csv(stats_df, file = stats_out, row.names = FALSE, fileEncoding = "UTF-8")
    empty_df <- data.frame(
        token_id = integer(0),
        palavra_original = character(0),
        palavra = character(0),
        tipo = character(0),
        emocao = character(0),
        stringsAsFactors = FALSE
    )
    write.csv(empty_df, file = words_out, row.names = FALSE, fileEncoding = "UTF-8")
    empty_summary_df <- data.frame(
        tipo = character(0),
        emocao = character(0),
        contagem_tokens = integer(0),
        palavras_unicas = integer(0),
        palavras_tokens = character(0),
        palavras_unicas_lista = character(0),
        stringsAsFactors = FALSE
    )
    write.csv(empty_summary_df, file = words_summary_out, row.names = FALSE, fileEncoding = "UTF-8")
}

# ----- gráfico de barras ----------------------------------------
png(bar_out,
    width  = width_px,
    height = height_px,
    res    = 150,
    type   = "cairo")
par(mar = c(7, 5, 4, 4), family = "Arial", col.axis = "#111111", col.lab = "#111111",
    col.main = "#111111", font.lab = 2)  # fonte firme: o padrao Cairo saia palida
emo_labels_pt <- unlist(p$emotion_labels)
emo_colors <- c(
    anger = "#e53e3e", anticipation = "#dd6b20", disgust = "#805ad5",
    fear  = "#2b6cb0", joy = "#38a169", sadness = "#4299e1",
    surprise = "#ed64a6", trust = "#d69e2e"
)
bar_vals   <- totals[emotion_cols]
bar_labels <- emo_labels_pt[emotion_cols]
bar_cols   <- emo_colors[emotion_cols]
bar_ylim_max <- max(bar_vals) * 1.28 + 2
bp <- barplot(
    bar_vals,
    names.arg = bar_labels,
    col       = bar_cols,
    border    = "white",
    las       = 2,
    main      = p$title_emotions,
    ylab      = p$ylab_frequency,
    ylim      = c(0, bar_ylim_max),
    cex.names = 1.0,
    cex.axis  = 0.95,
    font.axis = 2
)
text(bp, bar_vals + max(bar_vals) * 0.06 + 1,
     labels = paste0(formatC(emotion_pct[emotion_cols], format = "f", digits = 2), "%"),
     cex = 0.95, font = 2, col = "#111111", xpd = NA)
dev.off()

# ----- gráfico radar (fmsb ou base) ------------------------------
has_fmsb <- requireNamespace("fmsb", quietly = TRUE)
if (!has_fmsb) {
    tryCatch(
        .lexi_install_pkg("fmsb"),
        error = function(e) NULL
    )
    has_fmsb <- requireNamespace("fmsb", quietly = TRUE)
}

png(radar_out,
    width  = width_px,
    height = height_px,
    res    = 150,
    type   = "cairo")
par(mar = c(3, 3, 5, 3))

if (has_fmsb) {
    library(fmsb)
    radar_pct_vals <- emotion_pct[emotion_cols]
    radar_vals <- as.data.frame(t(radar_pct_vals))
    colnames(radar_vals) <- bar_labels
    max_val <- max(5, ceiling(max(radar_pct_vals) / 5) * 5)
    radar_df <- rbind(
        rep(max_val, length(emotion_cols)),  # max
        rep(0, length(emotion_cols)),        # min
        radar_vals
    )
    radarchart(
        radar_df,
        axistype  = 0,
        pcol      = "#3182ce",
        pfcol     = adjustcolor("#3182ce", alpha.f = 0.35),
        plwd      = 2,
        vlabels   = rep("", length(emotion_cols)),
        cglcol    = "#cccccc",
        cglty     = 1,
        axislabcol = "#555555",
        vlcex     = 0.85,
        title     = p$title_radar
    )
    angles <- seq(pi / 2, pi / 2 + 2 * pi, length.out = length(emotion_cols) + 1)[1:length(emotion_cols)]
    for (i in seq_along(emotion_cols)) {
        axis_x <- cos(angles[i])
        axis_y <- sin(angles[i])
        tangent_x <- -sin(angles[i])
        tangent_y <- cos(angles[i])
        x_adj <- if (axis_x > 0.25) 0 else if (axis_x < -0.25) 1 else 0.5
        name_y_adj <- if (axis_y > 0.45) 0 else if (axis_y < -0.45) 1 else 0.5
        pct_y_adj <- if (axis_y > 0.45) 1 else if (axis_y < -0.45) 0 else 0.5
        pct_offset <- if (abs(axis_x) > 0.75) 0.22 else if (abs(axis_y) > 0.75) 0.08 else 0.14
        pct_cex <- if (abs(axis_x) > 0.75) 0.78 else 0.82
        text(
            x = axis_x * 1.34,
            y = axis_y * 1.34,
            labels = bar_labels[i],
            cex = 0.95,
            col = "#111111",
            adj = c(x_adj, name_y_adj),
            xpd = NA
        )
        text(
            x = axis_x * 1.10 + tangent_x * pct_offset,
            y = axis_y * 1.10 + tangent_y * pct_offset,
            labels = paste0(formatC(radar_pct_vals[i], format = "f", digits = 2), "%"),
            cex = pct_cex,
            col = "#333333",
            adj = c(x_adj, pct_y_adj),
            xpd = NA
        )
    }
} else {
    # Fallback: spider simples em base-R
    angles <- seq(0, 2 * pi, length.out = length(emotion_cols) + 1)
    radar_pct_vals <- emotion_pct[emotion_cols]
    max_val <- max(5, ceiling(max(radar_pct_vals) / 5) * 5)
    r      <- c(radar_pct_vals, radar_pct_vals[1]) / max_val
    xs <- cos(angles) * r
    ys <- sin(angles) * r
    plot(0, 0, type = "n", xlim = c(-1.52, 1.52), ylim = c(-1.52, 1.52),
         asp = 1, axes = FALSE, xlab = "", ylab = "",
         main = p$title_radar)
    for (g in seq_len(5)) {
        grid_r <- g / 5
        lines(cos(angles) * grid_r, sin(angles) * grid_r, col = "#d5d5d5", lty = 1)
    }
    polygon(xs, ys, col = adjustcolor("#3182ce", 0.3), border = "#3182ce", lwd = 2)
    for (i in seq_along(emotion_cols)) {
        axis_x <- cos(angles[i])
        axis_y <- sin(angles[i])
        tangent_x <- -sin(angles[i])
        tangent_y <- cos(angles[i])
        x_adj <- if (axis_x > 0.25) 0 else if (axis_x < -0.25) 1 else 0.5
        name_y_adj <- if (axis_y > 0.45) 0 else if (axis_y < -0.45) 1 else 0.5
        pct_y_adj <- if (axis_y > 0.45) 1 else if (axis_y < -0.45) 0 else 0.5
        pct_offset <- if (abs(axis_x) > 0.75) 0.22 else if (abs(axis_y) > 0.75) 0.08 else 0.14
        pct_cex <- if (abs(axis_x) > 0.75) 0.78 else 0.82
        text(
            axis_x * 1.30,
            axis_y * 1.30,
            bar_labels[i],
            cex = 0.95,
            col = "#111111",
            adj = c(x_adj, name_y_adj),
            xpd = NA
        )
        text(
            axis_x * 1.08 + tangent_x * pct_offset,
            axis_y * 1.08 + tangent_y * pct_offset,
            paste0(formatC(radar_pct_vals[i], format = "f", digits = 2), "%"),
            cex = pct_cex,
            col = "#333333",
            adj = c(x_adj, pct_y_adj),
            xpd = NA
        )
    }
}
dev.off()

# ----- gráfico de polaridade ------------------------------------
png(polarity_out,
    width  = width_px,
    height = height_px,
    res    = 150,
    type   = "cairo")
par(mar = c(7, 5, 4, 4), family = "Arial", col.axis = "#111111", col.lab = "#111111",
    col.main = "#111111", font.lab = 2)  # fonte firme: o padrao Cairo saia palida
polarity_labels_pt <- unlist(p$polarity_labels)
polarity_colors <- c(positive = "#2f855a", negative = "#c53030")
polarity_vals <- polarities[c("positive", "negative")]
polarity_pct_vals <- as.numeric(polarity_pct[c("positive", "negative")])
polarity_ylim_max <- max(polarity_vals) * 1.28 + 2
bp_polarity <- barplot(
    polarity_vals,
    names.arg = polarity_labels_pt[c("positive", "negative")],
    col       = polarity_colors[c("positive", "negative")],
    border    = "white",
    las       = 2,
    main      = p$title_polarity,
    ylab      = p$ylab_frequency,
    ylim      = c(0, polarity_ylim_max),
    cex.names = 1.05,
    cex.axis  = 0.95,
    font.axis = 2
)
text(
    bp_polarity,
    polarity_vals + max(polarity_vals) * 0.06 + 1,
    labels = paste0(formatC(polarity_pct_vals, format = "f", digits = 2), "%"),
    cex = 1.0,
    font = 2,
    col = "#111111",
    xpd = NA
)
dev.off()

cat("OK\n")
