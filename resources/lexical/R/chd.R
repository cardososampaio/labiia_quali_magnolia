#!/usr/bin/env Rscript
# CHD (Reinert method) with IRaMuTeQ's own R scripts, as labiia_lex's
# generated script runs them: simple classification (classif_mode 1) or
# IRaMuTeQ's double classification on two sizes of context unit (0).
# Arguments: <work dir> <iramuteq scripts dir> <nbt> <mincl> <width> <height> [classif_mode]
# The work dir holds TableUc1.csv (rows x active words, Matrix Market) and
# listuce1.csv (plus TableUc2.csv and listuce2.csv in the double mode); it
# receives n1.csv, clusters.csv, Rdendro.RData, tree.nwk and dendrogramme.png.

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 6) {
  cat("CHD_R_ERROR: missing arguments\n", file = stderr())
  quit(save = "no", status = 1)
}

# labiia_quali: packages live in labiia_quali's own library.
.labiia_lib <- Sys.getenv("LABIIA_R_LIBS")
if (nzchar(.labiia_lib)) .libPaths(c(.labiia_lib, .libPaths()))

setwd(args[[1]])
scripts <- args[[2]]
nbt <- as.integer(args[[3]])
mincl <- as.integer(args[[4]])
width <- as.integer(args[[5]])
height <- as.integer(args[[6]])
classif_mode <- if (length(args) >= 7) as.integer(args[[7]]) else 1
typegraph <- "png"
svd.method <- "irlba"
mode.patate <- FALSE

source(file.path(scripts, "CHD.R"), encoding = "utf8")
source(file.path(scripts, "chdtxt.R"), encoding = "utf8")
source(file.path(scripts, "anacor.R"), encoding = "utf8")
source(file.path(scripts, "Rgraph.R"), encoding = "utf8")

# Class colours of labiia_lex (chart_theme.CHD_CLASS_PALETTE): class k always gets colour k.
CHD_CLASS_PALETTE <- c("#C0405C", "#45245E", "#966A00", "#0F5E3A", "#0E74B8",
                       "#8A4F2A", "#00707A", "#5B6B00", "#6A3FA0", "#3E5A9C")
rainbow <- function(n, ...) {
  rep_len(CHD_CLASS_PALETTE, n)
}

suppressPackageStartupMessages({
  library(Matrix)
  library(ape)
  library(wordcloud)
  library(irlba)
})

data1 <- readMM("TableUc1.csv")
data1 <- as(data1, "dgCMatrix")
row.names(data1) <- 1:nrow(data1)
if (classif_mode == 0) {
  data2 <- readMM("TableUc2.csv")
  data2 <- as(data2, "dgCMatrix")
  row.names(data2) <- 1:nrow(data2)
}

# irlba starts from a random vector: without a fixed seed the branches of the
# same classification are drawn in a different order on each run.
set.seed(42)
nbt.max <- max(1, min(as.integer(nbt), nrow(data1) - 1))
if (classif_mode == 0) nbt.max <- max(1, min(nbt.max, nrow(data2) - 1))
last_err <- NULL
for (nbt.try in seq(nbt.max, 1, by = -1)) {
  chd1.try <- tryCatch(
    CHD(data1, x = nbt.try, mode.patate = mode.patate, svd.method = svd.method, libsvdc.path = NULL),
    error = function(e) e
  )
  if (inherits(chd1.try, "error")) {
    last_err <- chd1.try
    next
  }
  if (classif_mode == 0) {
    chd2.try <- tryCatch(
      CHD(data2, x = nbt.try, mode.patate = mode.patate, svd.method = svd.method, libsvdc.path = NULL),
      error = function(e) e
    )
    if (inherits(chd2.try, "error")) {
      last_err <- chd2.try
      next
    }
    chd2 <- chd2.try
  }
  chd1 <- chd1.try
  nbt <- nbt.try
  last_err <- NULL
  break
}
if (!exists("chd1")) {
  if (!is.null(last_err)) stop(last_err)
  stop("CHD failed")
}

listuce1 <- read.csv2("listuce1.csv")
if (classif_mode == 0) listuce2 <- read.csv2("listuce2.csv")
rm(data1)
if (classif_mode == 0) rm(data2)

# Minimum class size. In the double classification IRaMuTeQ's Rchdtxt computes
# it itself (segments / (2 x classes)) when it receives 0, as IRaMuTeQ does.
mincl.user <- mincl
if (mincl == 0 || mincl > nrow(chd1$n1)) {
  mincl <- max(1, round(nrow(chd1$n1) / (nbt + 1)))
}
uceout <- "uce.csv"
write.csv2(chd1$n1, file = "n1-1.csv")

tree.tot1 <- make_tree_tot(chd1)
branch_ok <- FALSE
if (classif_mode == 0) {
  # Double classification: classes are the pairs of classes of the two tables that match best.
  chd.result <- Rchdtxt(uceout, chd1, chd2 = chd2, mincl = mincl.user, classif_mode = 0, nbt = nbt)
  classeuce1 <- chd.result$cuce1
  tree.cut1 <- make_dendro_cut_tuple(tree.tot1$dendro_tuple, chd.result$coord_ok, classeuce1, 1, nbt)
  branch_ok <- TRUE
} else try({
  terminales <- find.terminales(chd1$n1, chd1$list_mere, chd1$list_fille, mincl)
  if (!(is.character(terminales) && length(terminales) > 0 && terminales[1] == "no clusters")) {
    tree.cut1 <- make.classes(terminales, chd1$n1, tree.tot1$tree.cl, chd1$list_fille)
    if (!is.null(tree.cut1$tree.cl) && !is.null(tree.cut1$n1)) {
      write.csv2(tree.cut1$n1, uceout)
      chd.result <- tree.cut1
      branch_ok <- TRUE
    }
  }
}, silent = TRUE)

if (!branch_ok) {
  chd.result <- Rchdtxt(uceout, chd1, chd2 = chd1, mincl = mincl, classif_mode = 1, nbt = nbt)
  classeuce1 <- chd.result$cuce1
  tree.cut1 <- make_dendro_cut_tuple(tree.tot1$dendro_tuple, chd.result$coord_ok, classeuce1, 1, nbt)
}

classes <- chd.result$n1[, ncol(chd.result$n1)]
write.csv2(chd.result$n1, file = "n1.csv")
write.csv(data.frame(class = as.integer(classes)), file = "clusters.csv")
save(tree.cut1, file = "Rdendro.RData")

open_file_graph("dendrogramme.png", width = width, height = height, svg = FALSE)
plot.dendropr(tree.cut1$tree.cl, classes, type.dendro = "cladogram", histo = TRUE, from.cmd = TRUE)
dev.off()

# Tree shape for the window's dendrogram: Newick of the cut tree.
write.tree(tree.cut1$tree.cl, file = "tree.nwk")
cat("CHD_OK\n")
