#!/usr/bin/env Rscript
# CHD profiles, antiprofiles and correspondence analyses (IRaMuTeQ's
# ReinertTxtProf stage), as labiia_lex runs it after the classification.
# Arguments: <work dir> <iramuteq scripts dir> <number of classes> <label size>
# The work dir holds n1.csv, Contout.csv, ContSupOut.csv and ContEtOut.csv.

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 4) {
  cat("CHD_R_ERROR: missing arguments
", file = stderr())
  quit(save = "no", status = 1)
}

# labiia_quali: packages live in labiia_quali's own library.
.labiia_lib <- Sys.getenv("LABIIA_R_LIBS")
if (nzchar(.labiia_lib)) .libPaths(c(.labiia_lib, .libPaths()))

setwd(args[[1]])
scripts <- args[[2]]
clnb <- as.integer(args[[3]])
taillecar <- as.numeric(args[[4]])
typegraph <- "png"

source(file.path(scripts, "chdfunct.R"), encoding = "utf8")
n1 <- read.csv2("n1.csv")

read_profile_matrix <- function(path, clnb) {
    if (!file.exists(path) || file.info(path)$size <= 0) {
        return(matrix(0, nrow = 0, ncol = clnb))
    }
    tab <- tryCatch(
        read.csv2(path, header = FALSE, sep = ";", quote = '"', row.names = 1, na.strings = "NA"),
        error = function(e) NULL
    )
    if (is.null(tab)) {
        return(matrix(0, nrow = 0, ncol = clnb))
    }
    mat <- as.matrix(tab)
    if (is.null(dim(mat))) {
        mat <- matrix(mat, nrow = 1)
    }
    mat[is.na(mat)] <- 0
    if (ncol(mat) < clnb) {
        pad <- matrix(0, nrow = nrow(mat), ncol = clnb - ncol(mat))
        mat <- cbind(mat, pad)
    } else if (ncol(mat) > clnb) {
        mat <- mat[, 1:clnb, drop = FALSE]
    }
    mat
}

make_empty_prof <- function(clnb) {
    empty_list <- vector("list", clnb)
    empty_mat <- matrix(numeric(0), nrow = 0, ncol = clnb)
    list(empty_list, empty_mat, empty_mat, empty_list, empty_list)
}

dataact <- read_profile_matrix("Contout.csv", clnb)
datasup <- read_profile_matrix("ContSupOut.csv", clnb)
dataet <- read_profile_matrix("ContEtOut.csv", clnb)

if (nrow(dataact) == 0) {
    stop("Contout sem dados suficientes para gerar perfis CHD.")
}

tablesqrpact <- new.build.prof(as.matrix(dataact), n1, clnb)
tablesqrpsup <- if (nrow(datasup) > 0) {
    new.build.prof(as.matrix(datasup), n1, clnb)
} else {
    make_empty_prof(clnb)
}
tablesqrpet <- if (nrow(dataet) > 0) {
    new.build.prof(as.matrix(dataet), n1, clnb)
} else {
    make_empty_prof(clnb)
}

PrintProfile(
    n1,
    tablesqrpact[4],
    tablesqrpet[4],
    tablesqrpact[5],
    tablesqrpet[5],
    clnb,
    "Profiles.csv",
    "Antiprofile.csv",
    tablesqrpsup[4],
    tablesqrpsup[5]
)

ensure_prof_matrix <- function(x, clnb) {
    mat <- as.matrix(x)
    if (is.null(dim(mat))) {
        mat <- matrix(mat, ncol = 1)
    }
    if (ncol(mat) < clnb) {
        pad <- matrix(0, nrow = nrow(mat), ncol = clnb - ncol(mat))
        mat <- cbind(mat, pad)
    } else if (ncol(mat) > clnb) {
        mat <- mat[, 1:clnb, drop = FALSE]
    }
    colnames(mat) <- paste("classe", 1:clnb, sep = " ")
    mat
}

tablesqrpact[[2]] <- ensure_prof_matrix(tablesqrpact[[2]], clnb)
tablesqrpact[[1]] <- ensure_prof_matrix(tablesqrpact[[1]], clnb)
tablesqrpsup[[2]] <- ensure_prof_matrix(tablesqrpsup[[2]], clnb)
tablesqrpsup[[1]] <- ensure_prof_matrix(tablesqrpsup[[1]], clnb)
tablesqrpet[[2]] <- ensure_prof_matrix(tablesqrpet[[2]], clnb)
tablesqrpet[[1]] <- ensure_prof_matrix(tablesqrpet[[1]], clnb)

chistabletot <- rbind(tablesqrpact[2][[1]], tablesqrpsup[2][[1]])
chistabletot <- rbind(chistabletot, tablesqrpet[2][[1]])
ptabletot <- rbind(tablesqrpact[1][[1]], tablesqrpet[1][[1]])

# Sanitize chi-square table: a class with zero UCEs makes the expected count 0
# and the signed chi-square Inf/NaN. PlotAfc2dCoul then aborts mid-draw and
# leaves a BLANK PNG. Replace non-finite cells with 0 so the plot completes;
# the consistency guard in Python (Fix B) prevents this from masking a real
# classification mismatch.
chistabletot[!is.finite(as.matrix(chistabletot))] <- 0

write.csv2(chistabletot, file = "chistable.csv")
write.csv2(ptabletot, file = "ptable.csv")
gbcluster <- n1
write.csv2(gbcluster, file = "sbyClasseOut.csv")

# The label placement of the AFC plots draws random positions: a fixed seed
# makes the same classification always give the same pictures.
set.seed(42)
if (clnb >= 2) {
    suppressPackageStartupMessages({ library(ca); library(wordcloud) })
    source(file.path(scripts, "Rgraph.R"), encoding = "utf8")

    # Cores das classes da CHD (mesmas de chart_theme.CHD_CLASS_PALETTE).
    # Sobrescreve o rainbow() chamado por make_afc_graph sem alterar Rgraph.R
    # (a resolução do símbolo acontece no ambiente global do script).
    CHD_CLASS_PALETTE <- c("#C0405C", "#45245E", "#966A00", "#0F5E3A", "#0E74B8",
                           "#8A4F2A", "#00707A", "#5B6B00", "#6A3FA0", "#3E5A9C")
    rainbow <- function(n, ...) {
        rep_len(CHD_CLASS_PALETTE, n)
    }

    colnames(dataact) <- paste("classe", 1:clnb, sep = " ")
    colnames(datasup) <- paste("classe", 1:clnb, sep = " ")
    colnames(dataet) <- paste("classe", 1:clnb, sep = " ")
    rowtot <- nrow(dataact) + nrow(datasup) + nrow(dataet)
    afctable <- rbind(as.matrix(dataact), as.matrix(datasup))
    afctable <- rbind(afctable, as.matrix(dataet))
    colnames(afctable) <- paste("classe", 1:clnb, sep = " ")

    if (nrow(afctable) > 1 && ncol(afctable) >= 2) {
        afc <- ca(afctable, suprow = ((nrow(dataact) + 1):rowtot), nd = (ncol(afctable) - 1))
        debsup <- nrow(dataact) + 1
        debet <- nrow(dataact) + nrow(datasup) + 1
        fin <- rowtot
        # Pad to 2D when only 1 AFC dimension (e.g., clnb=2 gives nd=1)
        if (!is.null(afc$rowcoord) && ncol(afc$rowcoord) < 2) {
            afc$rowcoord <- cbind(afc$rowcoord, 0)
            afc$colcoord <- cbind(afc$colcoord, 0)
            if (!is.null(afc$rowcrl)) afc$rowcrl <- cbind(afc$rowcrl, 0)
            if (!is.null(afc$colcrl)) afc$colcrl <- cbind(afc$colcrl, 0)
        }
        afc <- AddCorrelationOk(afc)
        afc <- summary.ca.dm(afc)
        afc_table <- create_afc_table(afc)
        write.csv2(afc_table$facteur, file = "afc_facteur.csv")
        write.csv2(afc_table$colonne, file = "afc_col.csv")
        write.csv2(afc_table$ligne, file = "afc_row.csv")

        write.csv(afc$rowcoord, "row_coords.csv")
        write.csv(afc$colcoord, "col_coords.csv")
        eigenvalues <- afc$sv^2
        variance <- eigenvalues / sum(eigenvalues) * 100
        write.csv(data.frame(eigenvalue = eigenvalues, variance = variance), "eigenvalues.csv", row.names = FALSE)

        xlab <- paste0("Fator 1 (", formatC(variance[1], format = "f", digits = 2, decimal.mark = ","), "%)")
        ylab_pct2 <- if (length(variance) >= 2) variance[2] else 0
        ylab <- paste0("Fator 2 (", formatC(ylab_pct2, format = "f", digits = 2, decimal.mark = ","), "%)")

        PARCEX <- taillecar
        xyminmax <- tryCatch(
            PlotAfc2dCoul(
                afc,
                as.data.frame(chistabletot),
                "AFC2DL.png",
                what = "coord",
                deb = 1,
                fin = (debsup - 1),
                xlab = xlab,
                ylab = ylab,
                width = 2500,
                height = 2500
            ),
            error = function(e) {
                cat("AFC2DL skipped:", e$message, "\n")
                writeLines(as.character(e$message), "afc2dl_error.txt")
                NULL
            }
        )
        # Pontos do AFC2DL para o explorador interativo: mesma selecao
        # (select.chi.classe, 80 por classe), cor (classe de maior qui2) e
        # tamanho (norm.vec 0.8-3) usados por PlotAfc2dCoul em Rgraph.R.
        if (!is.null(xyminmax)) {
            tryCatch({
                pts_chi <- as.matrix(as.data.frame(chistabletot)[1:(debsup - 1), , drop = FALSE])
                pts_coord <- as.matrix(afc$rowcoord)[1:(debsup - 1), , drop = FALSE]
                pts_class <- apply(pts_chi, 1, which.max)
                pts_cex <- norm.vec(apply(pts_chi, 1, max), 0.8, 3)
                pts_keep <- select.chi.classe(pts_chi, 80, active = TRUE)
                pts_palette <- del.yellow(rainbow(ncol(pts_chi)))
                write.csv(
                    data.frame(
                        term = rownames(pts_chi)[pts_keep],
                        x = pts_coord[pts_keep, 1],
                        y = pts_coord[pts_keep, 2],
                        classe = as.integer(pts_class[pts_keep]),
                        chi2 = apply(pts_chi, 1, max)[pts_keep],
                        cex = pts_cex[pts_keep],
                        color = substr(pts_palette[pts_class[pts_keep]], 1, 7)
                    ),
                    "afc2dl_points.csv",
                    row.names = FALSE,
                    fileEncoding = "UTF-8"
                )
            }, error = function(e) cat("afc2dl_points skipped:", e$message, "\n"))
        }
        has_bounds <- !is.null(xyminmax) &&
            !is.null(xyminmax$xminmax) &&
            !is.null(xyminmax$yminmax) &&
            length(xyminmax$xminmax) >= 2 &&
            length(xyminmax$yminmax) >= 2 &&
            all(is.finite(xyminmax$xminmax[1:2])) &&
            all(is.finite(xyminmax$yminmax[1:2]))

        if (debsup <= (debet - 1)) {
            tryCatch({
                if (has_bounds) {
                    PlotAfc2dCoul(afc, as.data.frame(chistabletot), "AFC2DSL.png", what = "coord", deb = debsup, fin = (debet - 1), xlab = xlab, ylab = ylab, xmin = xyminmax$xminmax[1], xmax = xyminmax$xminmax[2], ymin = xyminmax$yminmax[1], ymax = xyminmax$yminmax[2], active = FALSE, width = 2500, height = 2500)
                } else {
                    PlotAfc2dCoul(afc, as.data.frame(chistabletot), "AFC2DSL.png", what = "coord", deb = debsup, fin = (debet - 1), xlab = xlab, ylab = ylab, active = FALSE, width = 2500, height = 2500)
                }
            }, error = function(e) { cat("AFC2DSL skipped:", e$message, "\n"); writeLines(as.character(e$message), "afc2dsl_error.txt") })
        }
        if ((fin - debet) > 2) {
            tryCatch({
                if (has_bounds) {
                    PlotAfc2dCoul(afc, as.data.frame(chistabletot), "AFC2DEL.png", what = "coord", deb = debet, fin = fin, xlab = xlab, ylab = ylab, xmin = xyminmax$xminmax[1], xmax = xyminmax$xminmax[2], ymin = xyminmax$yminmax[1], ymax = xyminmax$yminmax[2], active = FALSE, width = 2500, height = 2500)
                } else {
                    PlotAfc2dCoul(afc, as.data.frame(chistabletot), "AFC2DEL.png", what = "coord", deb = debet, fin = fin, xlab = xlab, ylab = ylab, active = FALSE, width = 2500, height = 2500)
                }
            }, error = function(e) { cat("AFC2DEL skipped:", e$message, "\n"); writeLines(as.character(e$message), "afc2del_error.txt") })
        }
        tryCatch({
            if (has_bounds) {
                PlotAfc2dCoul(afc, as.data.frame(chistabletot), "AFC2DCL.png", col = TRUE, what = "coord", xlab = xlab, ylab = ylab, xmin = xyminmax$xminmax[1], xmax = xyminmax$xminmax[2], ymin = xyminmax$yminmax[1], ymax = xyminmax$yminmax[2], active = FALSE, width = 2500, height = 2500)
            } else {
                PlotAfc2dCoul(afc, as.data.frame(chistabletot), "AFC2DCL.png", col = TRUE, what = "coord", xlab = xlab, ylab = ylab, active = FALSE, width = 2500, height = 2500)
            }
        }, error = function(e) { cat("AFC2DCL skipped:", e$message, "\n"); writeLines(as.character(e$message), "afc2dcl_error.txt") })
    }
}
cat("CHD_PROFILES_OK
")
