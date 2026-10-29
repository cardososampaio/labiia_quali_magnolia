# Installs the CRAN packages labiia_quali's statistical tests need, as the
# app's own "install missing packages" does: Windows binaries (no compiler),
# with their Depends/Imports/LinkingTo, into labiia_quali's own library for
# this R version, so other R projects on the computer are not changed.
# Arguments: <library base folder> <packages file, one per line> <log file>
# Exit status: 0 all installed, 4 some failed.

args <- commandArgs(trailingOnly = TRUE)
lib_base <- args[[1]]
pkgs <- trimws(readLines(args[[2]], warn = FALSE, encoding = "UTF-8"))
pkgs <- pkgs[nzchar(pkgs) & !startsWith(pkgs, "#")]

v <- R.version
lib <- file.path(lib_base, paste0(v$major, ".", strsplit(v$minor, ".", fixed = TRUE)[[1]][1]))
dir.create(lib, recursive = TRUE, showWarnings = FALSE)
.libPaths(c(lib, .libPaths()))
Sys.setenv(R_LIBCURL_SSL_REVOKE_BEST_EFFORT = "TRUE")
options(timeout = 600)

mirrors <- c("https://cloud.r-project.org", "https://cran.r-project.org")
type <- if (.Platform$OS.type == "windows") "binary" else getOption("pkgType")
ok <- function(p) suppressWarnings(requireNamespace(p, lib.loc = .libPaths(), quietly = TRUE))

cat(sprintf("Pasta dos pacotes: %s\n", lib)); flush.console()
failed <- character(0)
for (i in seq_along(pkgs)) {
  p <- pkgs[[i]]
  if (ok(p)) {
    cat(sprintf("Pacote %s (%d de %d): já instalado\n", p, i, length(pkgs))); flush.console()
    next
  }
  cat(sprintf("Instalando o pacote %s (%d de %d)...\n", p, i, length(pkgs))); flush.console()
  for (m in mirrors) {
    try(install.packages(p, lib = lib, repos = m, type = type,
                         dependencies = c("Depends", "Imports", "LinkingTo"), quiet = TRUE), silent = TRUE)
    if (ok(p)) break
    cat(sprintf("  nova tentativa de %s por outro endereço do CRAN\n", p)); flush.console()
  }
  if (!ok(p)) failed <- c(failed, p)
}

if (length(failed)) {
  cat(sprintf("Não foi possível instalar: %s. O labiia_quali oferece instalá-los de novo quando um teste precisar.\n", paste(failed, collapse = ", ")))
  quit(save = "no", status = 4)
}
cat("Todos os pacotes R estão instalados.\n")
quit(save = "no", status = 0)
