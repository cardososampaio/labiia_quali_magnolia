; labiia_quali: R for the statistical tests, added to electron-builder's
; assisted installer (the same installer Magnolia ships).
;
; A page after the folder choice looks for R (build/installer/r-setup.ps1,
; the same places labiia_lex looks). With R 4.5 or newer it offers to install
; every CRAN package the tests need; without it, it explains that five tests
; need R and offers to download and install R 4.6.1 (CRAN, SHA-256 checked,
; for this user only) and the packages, or to go on without R. After the app
; files are copied, the chosen step runs and shows its progress.
;
; Command line (for silent installs and tests):
;   /R=install-r | packages | skip   what to do about R (default with /S: skip)
;   /SIMULARSEMR                     behave as if this computer had no R

!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "WordFunc.nsh"

!ifndef BUILD_UNINSTALLER

Var RStatus
Var RVersion
Var RScriptPath
Var RChoice
Var RSimulate
Var RCheck
Var RRadioInstall
Var RRadioSkip

!macro customInit
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/R=" $RChoice
  ${If} ${Errors}
    StrCpy $RChoice ""
  ${EndIf}
  ClearErrors
  ${GetOptions} $R0 "/SIMULARSEMR" $R1
  ${If} ${Errors}
    StrCpy $RSimulate ""
  ${Else}
    StrCpy $RSimulate " -SimulateNoR"
  ${EndIf}
!macroend

!macro customPageAfterChangeDir
  Page custom RPageCreate RPageLeave
!macroend

Function RPageCreate
  ; The command line already decided (silent installs and tests).
  ${If} $RChoice != ""
    Abort
  ${EndIf}

  InitPluginsDir
  File "/oname=$PLUGINSDIR\r-setup.ps1" "${BUILD_RESOURCES_DIR}\installer\r-setup.ps1"
  nsExec::ExecToStack 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\r-setup.ps1" -Action check$RSimulate'
  Pop $0
  Pop $1
  ${WordFind} "$1" "|" "+1" $RStatus
  ${WordFind} "$1" "|" "+2" $RVersion
  ${WordFind} "$1" "|" "+3" $RScriptPath
  ; WordFind returns the whole text when a field is missing.
  ${If} $RStatus != "ok"
  ${AndIf} $RStatus != "old"
    StrCpy $RStatus "none"
  ${EndIf}

  !insertmacro MUI_HEADER_TEXT "R para os testes estatísticos" "Nuvem de palavras, CHD, Similitude, Emoções e Tópicos LDA usam o R."
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${If} $RStatus == "ok"
    ${NSD_CreateLabel} 0 0 100% 36u "O labiia_quali encontrou o R $RVersion neste computador:$\r$\n$RScriptPath"
    Pop $0
    ${NSD_CreateCheckbox} 0 44u 100% 24u "Instalar agora todos os pacotes R dos testes (recomendado). Precisa de internet e leva de 5 a 15 minutos."
    Pop $RCheck
    ${NSD_Check} $RCheck
    ${NSD_CreateLabel} 0 76u 100% 40u "Os pacotes vão para uma pasta própria do labiia_quali e não alteram outros projetos em R. Se desmarcar, o labiia_quali oferece instalar cada pacote quando um teste precisar dele."
    Pop $0
  ${Else}
    ${If} $RStatus == "old"
      StrCpy $2 "Encontramos apenas o R $RVersion, mais antigo que o 4.5, para o qual o CRAN já não oferece todos os pacotes prontos."
    ${Else}
      StrCpy $2 "Não encontramos o R neste computador."
    ${EndIf}
    ${NSD_CreateLabel} 0 0 100% 44u "O labiia_quali funciona sem o R, mas cinco testes precisam dele: Nuvem de palavras, CHD, Similitude, Emoções e Tópicos LDA. $2"
    Pop $0
    ${NSD_CreateRadioButton} 0 50u 100% 30u "Baixar e instalar o R 4.6.1 e todos os pacotes agora (recomendado). Cerca de 90 MB do site oficial do R (CRAN), só para este usuário, sem senha de administrador."
    Pop $RRadioInstall
    ${NSD_Check} $RRadioInstall
    ${NSD_CreateRadioButton} 0 84u 100% 30u "Não instalar o R agora. Os testes que usam R avisam que ele falta, e o labiia_quali instala os pacotes depois que o R for instalado."
    Pop $RRadioSkip
    ${If} $RStatus == "old"
      ${NSD_CreateLabel} 0 120u 100% 20u "O R $RVersion já instalado não é removido."
      Pop $0
    ${EndIf}
  ${EndIf}
  nsDialogs::Show
FunctionEnd

Function RPageLeave
  ${If} $RStatus == "ok"
    ${NSD_GetState} $RCheck $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $RChoice "packages"
    ${Else}
      StrCpy $RChoice "skip"
    ${EndIf}
  ${Else}
    ${NSD_GetState} $RRadioInstall $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $RChoice "install-r"
    ${Else}
      StrCpy $RChoice "skip"
    ${EndIf}
  ${EndIf}
FunctionEnd

!macro customInstall
  ${If} $RChoice == "install-r"
  ${OrIf} $RChoice == "packages"
    SetDetailsView show
    ${If} $RChoice == "install-r"
      DetailPrint "Instalando o R e os pacotes dos testes estatísticos..."
    ${Else}
      DetailPrint "Instalando os pacotes R dos testes estatísticos..."
    ${EndIf}
    nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\installer\r-setup.ps1" -Action $RChoice'
    Pop $0
    ${If} $0 == 2
      StrCpy $1 "Não foi possível baixar o R (verifique a internet). O labiia_quali foi instalado; os testes que usam R pedirão o R depois. Você também pode instalá-lo em https://cran.r-project.org/bin/windows/base/"
    ${ElseIf} $0 == 3
      StrCpy $1 "O R foi baixado, mas a instalação não terminou. O labiia_quali foi instalado; instale o R em https://cran.r-project.org/bin/windows/base/"
    ${ElseIf} $0 == 4
      StrCpy $1 "Alguns pacotes R não foram instalados. O labiia_quali oferece instalá-los quando um teste precisar deles."
    ${ElseIf} $0 == 5
      StrCpy $1 "Nenhum R 4.5 ou mais novo foi encontrado; os pacotes não foram instalados."
    ${ElseIf} $0 != 0
      StrCpy $1 "A etapa do R não terminou corretamente (código $0). O labiia_quali foi instalado."
    ${Else}
      StrCpy $1 ""
    ${EndIf}
    ${If} $1 != ""
      DetailPrint "$1"
      DetailPrint "Registro: $LOCALAPPDATA\labiia_quali\logs\instalador-r.log"
      IfSilent +2
        MessageBox MB_OK|MB_ICONEXCLAMATION "$1$\r$\n$\r$\nRegistro: $LOCALAPPDATA\labiia_quali\logs\instalador-r.log"
    ${Else}
      DetailPrint "R e pacotes prontos."
    ${EndIf}
  ${EndIf}
!macroend

!endif
