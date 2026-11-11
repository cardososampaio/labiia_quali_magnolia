# Word cloud (ggwordcloud), the drawing of labiia_lex's "Nuvem de palavras".
# Run by labiia_quali with: Rscript --vanilla wordcloud.R params.json
# Reads words.csv (word;freq, most frequent first) from the working folder
# and writes wordcloud.png and wordcloud_render_meta.json.
# Packages: ggplot2, ggwordcloud, RColorBrewer, jsonlite, png.

lib <- Sys.getenv("LABIIA_R_LIBS")
if (nzchar(lib)) .libPaths(c(lib, .libPaths()))

suppressPackageStartupMessages(library(jsonlite))
suppressPackageStartupMessages(library(ggplot2))
suppressPackageStartupMessages(library(ggwordcloud))
suppressPackageStartupMessages(library(RColorBrewer))

args <- commandArgs(trailingOnly = TRUE)
p <- fromJSON(args[1])

max_words           <- as.integer(p$max_words)
min_freq            <- as.integer(p$min_freq)
scale_max           <- as.numeric(p$scale_max)
rotation_percentage <- as.numeric(p$rotation_percentage)
shape               <- as.character(p$shape)
eccentricity        <- as.numeric(p$eccentricity)
colors_palette      <- as.character(p$colors)
width               <- as.integer(p$width)
height              <- as.integer(p$height)
grid_size           <- as.integer(p$grid_size)
max_steps           <- as.integer(p$max_steps)
meta_file           <- "wordcloud_render_meta.json"
fileout             <- "wordcloud.png"

words_df <- read.csv("words.csv", header = TRUE, sep = ";", check.names = FALSE,
                     stringsAsFactors = FALSE, fileEncoding = "UTF-8", quote = "")
words_df <- words_df[words_df$freq >= min_freq, ]
words_df <- words_df[order(-words_df$freq), ]
if (nrow(words_df) > max_words) words_df <- words_df[seq_len(max_words), ]
if (nrow(words_df) == 0) {
  writeLines(toJSON(list(ok = FALSE, error = "no-words"), auto_unbox = TRUE), meta_file, useBytes = TRUE)
  quit(status = 3)
}

allowed_shapes <- c("cardioid", "diamond", "square", "triangle", "triangle-forward",
                    "triangle-upright", "pentagon", "star")
if (!(shape %in% allowed_shapes)) shape <- "square"

complex_shapes <- setdiff(allowed_shapes, "square")
if (shape %in% complex_shapes) {
  max_words_eff <- min(max_words, 260)
  if (nrow(words_df) > max_words_eff) words_df <- words_df[seq_len(max_words_eff), ]
  scale_max <- min(scale_max, 18)
  grid_size <- max(1L, min(as.integer(grid_size), 2L))
  max_steps <- max(as.integer(max_steps), 30L)
}

# Colours by rank bins, for a coherent gradient from the most frequent words.
n <- nrow(words_df)
palette_size <- max(3, min(brewer.pal.info[colors_palette, "maxcolors"], 8))
rank_idx <- rank(-words_df$freq, ties.method = "first")
bin_edges <- seq(0.5, n + 0.5, length.out = palette_size + 1)
color_bins <- as.integer(cut(rank_idx, breaks = bin_edges, labels = FALSE, include.lowest = TRUE))
color_bins[is.na(color_bins)] <- palette_size
words_df$color_group <- factor(color_bins, levels = seq_len(palette_size))

# A fixed share of vertical words, drawn with a fixed seed so the same corpus gives the same cloud.
set.seed(42)
words_df$angle <- 0
n_vertical <- as.integer(round(max(0, min(1, rotation_percentage)) * n))
if (n_vertical > 0) {
  vertical_idx <- sample.int(n, size = min(n_vertical, n), replace = FALSE)
  words_df$angle[vertical_idx] <- 90
}

p_plot <- ggplot(words_df, aes(label = word, size = freq, color = color_group, angle = angle)) +
  geom_text_wordcloud_area(eccentricity = eccentricity, shape = shape,
                           rm_outside = TRUE, use_richtext = FALSE,
                           seed = 42, grid_size = grid_size, max_steps = max_steps) +
  scale_size_area(max_size = scale_max) +
  scale_color_brewer(palette = colors_palette, direction = 1, drop = FALSE) +
  theme_void() +
  theme(plot.background = element_rect(fill = "white", color = NA),
        legend.position = "none",
        plot.margin = unit(c(6, 6, 6, 6), "pt")) +
  coord_equal(expand = FALSE, clip = "on")

ggsave(fileout, plot = p_plot, width = width / 300, height = height / 300,
       dpi = 360, units = "in", bg = "white")

# Crop the white border ggwordcloud leaves around the cloud, keeping a
# 24-pixel margin (the same rule labiia_lex applies after drawing).
img <- png::readPNG(fileout)
nonwhite <- (img[, , 1] < 1) | (img[, , 2] < 1) | (img[, , 3] < 1)
rows <- which(rowSums(nonwhite) > 0)
cols <- which(colSums(nonwhite) > 0)
if (length(rows) > 0 && length(cols) > 0) {
  pad <- 24
  top <- max(1, min(rows) - pad); bottom <- min(nrow(nonwhite), max(rows) + pad)
  left <- max(1, min(cols) - pad); right <- min(ncol(nonwhite), max(cols) + pad)
  png::writePNG(img[top:bottom, left:right, , drop = FALSE], fileout)
}

writeLines(toJSON(list(
  ok = TRUE,
  render_engine = "ggwordcloud",
  ggwordcloud_version = as.character(utils::packageVersion("ggwordcloud")),
  shape_effective = shape,
  words_drawn = nrow(words_df),
  eccentricity = eccentricity
), auto_unbox = TRUE, pretty = TRUE), meta_file, useBytes = TRUE)
cat("OK\n")
