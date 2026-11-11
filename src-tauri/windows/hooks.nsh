; labiia_quali: R for the statistical tests, in the Windows installer.
;
; After the program's files are copied, the installer looks for R
; (installer\r-setup.ps1, the same places the program looks). Five tests
; need it: Word cloud, CHD, Similitude, Emotions and LDA topics.
;  - With R 4.5 or newer it offers to install every CRAN package they need,
;    in a folder of labiia_quali's own.
;  - Without it, it offers to download R 4.6.1 from CRAN (SHA-256 checked,
;    for this user only, no administrator password) and then the packages.
; Either way the program works without R; the tests that need it say so.
;
; Command line (silent installs and tests):
;   /R=install-r | packages | skip   what to do about R (default with /S: skip)
;   /SIMULARSEMR                     behave as if this computer had no R

!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "WordFunc.nsh"

!macro NSIS_HOOK_POSTINSTALL
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/R=" $1
  ${If} ${Errors}
    StrCpy $1 ""
  ${EndIf}
  ClearErrors
  ${GetOptions} $0 "/SIMULARSEMR" $2
  ${If} ${Errors}
    StrCpy $2 ""
  ${Else}
    StrCpy $2 " -SimulateNoR"
  ${EndIf}
  StrCpy $5 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\installer\r-setup.ps1"'

  ${If} $1 == ""
    IfSilent 0 +3
      StrCpy $1 "skip"
      Goto labiia_r_decided
    nsExec::ExecToStack '$5 -Action check$2'
    Pop $3
    Pop $4
    ${WordFind} "$4" "|" "+1" $3
    ${If} $3 == "ok"
      ${WordFind} "$4" "|" "+2" $4
      MessageBox MB_YESNO|MB_ICONQUESTION "R para os testes estatísticos$\r$\n$\r$\nO labiia_quali encontrou o R $4 neste computador.$\r$\n$\r$\nInstalar agora todos os pacotes R dos testes (recomendado)? Precisa de internet e leva de 5 a 15 minutos. Os pacotes vão para uma pasta própria do labiia_quali e não alteram outros projetos em R.$\r$\n$\r$\nSe responder Não, o labiia_quali oferece instalar cada pacote quando um teste precisar dele." IDYES labiia_r_packages
      StrCpy $1 "skip"
      Goto labiia_r_decided
      labiia_r_packages:
      StrCpy $1 "packages"
    ${Else}
      ${If} $3 == "old"
        ${WordFind} "$4" "|" "+2" $4
        StrCpy $3 "Encontramos apenas o R $4, mais antigo que o 4.5, para o qual o CRAN já não oferece todos os pacotes prontos (ele não será removido)."
      ${Else}
        StrCpy $3 "Não encontramos o R neste computador."
      ${EndIf}
      MessageBox MB_YESNO|MB_ICONQUESTION "R para os testes estatísticos$\r$\n$\r$\nO labiia_quali funciona sem o R, mas cinco testes precisam dele: Nuvem de palavras, CHD, Similitude, Emoções e Tópicos LDA. $3$\r$\n$\r$\nBaixar e instalar o R 4.6.1 e todos os pacotes agora (recomendado)? São cerca de 90 MB do site oficial do R (CRAN), só para este usuário, sem senha de administrador.$\r$\n$\r$\nSe responder Não, os testes que usam R avisam que ele falta." IDYES labiia_r_install
      StrCpy $1 "skip"
      Goto labiia_r_decided
      labiia_r_install:
      StrCpy $1 "install-r"
    ${EndIf}
  ${EndIf}
  labiia_r_decided:

  ${If} $1 == "install-r"
  ${OrIf} $1 == "packages"
    SetDetailsView show
    ${If} $1 == "install-r"
      DetailPrint "Instalando o R e os pacotes dos testes estatísticos..."
    ${Else}
      DetailPrint "Instalando os pacotes R dos testes estatísticos..."
    ${EndIf}
    nsExec::ExecToLog '$5 -Action $1$2'
    Pop $0
    ${If} $0 == 2
      StrCpy $3 "Não foi possível baixar o R (verifique a internet). O labiia_quali foi instalado; os testes que usam R pedirão o R depois. Você também pode instalá-lo em https://cran.r-project.org/bin/windows/base/"
    ${ElseIf} $0 == 3
      StrCpy $3 "O R foi baixado, mas a instalação não terminou. O labiia_quali foi instalado; instale o R em https://cran.r-project.org/bin/windows/base/"
    ${ElseIf} $0 == 4
      StrCpy $3 "Alguns pacotes R não foram instalados. O labiia_quali oferece instalá-los quando um teste precisar deles."
    ${ElseIf} $0 == 5
      StrCpy $3 "Nenhum R 4.5 ou mais novo foi encontrado; os pacotes não foram instalados."
    ${ElseIf} $0 != 0
      StrCpy $3 "A etapa do R não terminou corretamente (código $0). O labiia_quali foi instalado."
    ${Else}
      StrCpy $3 ""
    ${EndIf}
    ${If} $3 != ""
      DetailPrint "$3"
      DetailPrint "Registro: $LOCALAPPDATA\labiia_quali\logs\instalador-r.log"
      IfSilent +2
        MessageBox MB_OK|MB_ICONEXCLAMATION "$3$\r$\n$\r$\nRegistro: $LOCALAPPDATA\labiia_quali\logs\instalador-r.log"
    ${Else}
      DetailPrint "R e pacotes prontos."
    ${EndIf}
  ${EndIf}
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
!macroend
