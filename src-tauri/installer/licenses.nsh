; __FILEDIR__ resolves to this tracked directory, independent of target/architecture.
!define TOOLSIANO_RU_LICENSE "${__FILEDIR__}\LICENSE.ru.txt"

; Called by template.nsi after both MUI languages have been registered.
!macro TOOLSIANO_LICENSE_LANGUAGES
  LicenseLangString ToolsianoLicense ${LANG_ENGLISH} "${LICENSE}"
  LicenseLangString ToolsianoLicense ${LANG_RUSSIAN} "${TOOLSIANO_RU_LICENSE}"
!macroend

; Persist only the initial installer choice. App preferences take priority on later launches.
!macro NSIS_HOOK_POSTINSTALL
  Push $0
  Push $1
  IfFileExists "$INSTDIR\toolsiano-language.txt" toolsiano_language_done
  StrCpy $1 "en"
  ${If} $LANGUAGE == ${LANG_RUSSIAN}
    StrCpy $1 "ru"
  ${EndIf}
  ClearErrors
  FileOpen $0 "$INSTDIR\toolsiano-language.txt" w
  IfErrors toolsiano_language_done
  FileWrite $0 "$1"
  FileClose $0
  toolsiano_language_done:
  Pop $1
  Pop $0
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Delete "$INSTDIR\toolsiano-language.txt"
!macroend
