# Notas dos lançamentos

Cada arquivo `vX.Y.Z.md` é o texto do lançamento dessa versão no GitHub.
O fluxo `.github/workflows/release-assets.yml` cria o lançamento com ele e,
ao publicar uma versão, reaplica o texto de todos os arquivos daqui aos
lançamentos que já existem. Assim, um aviso acrescentado a uma versão antiga
(por exemplo, "use a versão seguinte") chega à página dela.
