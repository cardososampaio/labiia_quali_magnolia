profiles <- as.matrix(read.table(file("stdin"), header = FALSE))
norms <- sqrt(rowSums(profiles^2))
cosine <- pmin(tcrossprod(profiles) / outer(norms, norms), 1)
present <- 1 * (profiles > 0)
shared <- tcrossprod(present)
sizes <- outer(rowSums(present), rowSums(present), "+")
jaccard <- shared / (sizes - shared)
dice <- 2 * shared / sizes
for (values in list(t(cosine), t(jaccard), t(dice))) {
  cat(sprintf("%.17g", values), "\n")
}
for (method in c("average", "complete")) {
  tree <- hclust(as.dist(1 - cosine), method = method)
  cat(sprintf("%.17g", tree$height), "\n")
  cat(cutree(tree, k = 5), "\n")
}
