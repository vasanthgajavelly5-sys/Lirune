; Lirune Reader — NSIS customization
; Loaded by electron-builder for the normal Windows installer only.
; Keep this file limited to supported Modern UI defines so the standard
; install/uninstall flow, shortcuts, file association and directory selection remain intact.

!ifndef MUI_WELCOMEPAGE_TITLE
  !define MUI_WELCOMEPAGE_TITLE "Welcome to Lirune Reader Setup"
!endif
!ifndef MUI_WELCOMEPAGE_TEXT
  !define MUI_WELCOMEPAGE_TEXT "This installer will guide you through installing Lirune Reader.\r\n\r\nYour EPUB files are not modified by the installer."
!endif
!ifndef MUI_FINISHPAGE_TITLE
  !define MUI_FINISHPAGE_TITLE "Lirune Reader Setup Complete"
!endif
!ifndef MUI_FINISHPAGE_TEXT
  !define MUI_FINISHPAGE_TEXT "Lirune Reader has been installed.\r\n\r\nClick Finish to launch the application."
!endif
!ifndef MUI_DIRECTORYPAGE_TEXT_TOP
  !define MUI_DIRECTORYPAGE_TEXT_TOP "Choose where Lirune Reader should be installed."
!endif
!ifndef MUI_ABORTWARNING
  !define MUI_ABORTWARNING "Are you sure you want to cancel the Lirune Reader setup?"
!endif
!ifndef MUI_UNINSTALLER_ABORTWARNING
  !define MUI_UNINSTALLER_ABORTWARNING "Are you sure you want to cancel uninstalling Lirune Reader?"
!endif
