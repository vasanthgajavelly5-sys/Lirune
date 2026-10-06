!macro customInstall
  WriteRegStr HKCU "Software\Classes\Applications\Lirune Reader.exe" "FriendlyAppName" "Lirune Reader"
  WriteRegStr HKCU "Software\Classes\Applications\Lirune Reader.exe\shell\open\command" "" '"$appExe" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\Lirune Reader.exe\SupportedTypes" ".epub" ""

  WriteRegStr HKCU "Software\Classes\Lirune.epub" "" "EPUB Electronic Publication"
  WriteRegStr HKCU "Software\Classes\Lirune.epub\DefaultIcon" "" '"$appExe",0'
  WriteRegStr HKCU "Software\Classes\Lirune.epub\shell\open\command" "" '"$appExe" "%1"'

  WriteRegStr HKCU "Software\Classes\.epub" "" "Lirune.epub"
  WriteRegStr HKCU "Software\Classes\.epub\OpenWithProgids" "Lirune.epub" ""
  WriteRegStr HKCU "Software\Classes\.epub\OpenWithProgids" "EPUB Electronic Publication" ""
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.epub\OpenWithProgids" "Lirune.epub" ""
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.epub\OpenWithProgids" "EPUB Electronic Publication" ""

  WriteRegStr HKCU "Software\Lirune Reader\Capabilities" "ApplicationDescription" "A calm, private Windows EPUB reader"
  WriteRegStr HKCU "Software\Lirune Reader\Capabilities" "ApplicationName" "Lirune Reader"
  WriteRegStr HKCU "Software\Lirune Reader\Capabilities\FileAssociations" ".epub" "Lirune.epub"
  WriteRegStr HKCU "Software\RegisteredApplications" "Lirune Reader" "Software\Lirune Reader\Capabilities"

  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\Applications\Lirune Reader.exe"
  DeleteRegKey HKCU "Software\Classes\Lirune.epub"
  DeleteRegValue HKCU "Software\Classes\.epub\OpenWithProgids" "Lirune.epub"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.epub\OpenWithProgids" "Lirune.epub"
  DeleteRegKey HKCU "Software\Lirune Reader"
  DeleteRegValue HKCU "Software\RegisteredApplications" "Lirune Reader"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
