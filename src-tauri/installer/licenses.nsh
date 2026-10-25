; __FILEDIR__ resolves to this tracked directory, independent of target/architecture.
!define TOOLSIANO_RU_LICENSE "${__FILEDIR__}\LICENSE.ru.txt"

; Called by template.nsi after both MUI languages have been registered.
!macro TOOLSIANO_LICENSE_LANGUAGES
  LicenseLangString ToolsianoLicense ${LANG_ENGLISH} "${LICENSE}"
  LicenseLangString ToolsianoLicense ${LANG_RUSSIAN} "${TOOLSIANO_RU_LICENSE}"
!macroend
