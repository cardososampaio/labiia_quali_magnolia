profiles <- as.matrix(read.table(file("stdin"), header = FALSE))
norms <- sqrt(rowSums(profiles^2))
cosine <- pmin(tcrossprod(profiles) / outer(norms, norms), 1)
present <- 1 * (profiles > 0)
shared <- tcrossprod(present)
sizes <- outer(rowSums(present), rowSums(present), "+")
jaccard <- shared / (sizes - shared)
dice <- 2 * shared / sizes
tree <- hclust(as.dist(1 - cosine), method = "average")
for (values in list(t(cosine), t(jaccard), t(dice), tree$height, cutree(tree, k = 5))) {
  cat(sprintf("%.17g", values), "\n")
}
