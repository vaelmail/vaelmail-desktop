Unicode true
ManifestDPIAware true
ManifestDPIAwareness PerMonitorV2

!if "{{compression}}" == "none"
  SetCompress off
!else
  SetCompressor /SOLID "{{compression}}"
!endif

{{#if signed_plugins_path}}
!addplugindir "{{signed_plugins_path}}"
{{/if}}

!include MUI2.nsh
!include FileFunc.nsh
!include x64.nsh
!include WordFunc.nsh
!include "utils.nsh"
!include "FileAssociation.nsh"
!include "Win\COM.nsh"
!include "Win\Propkey.nsh"
!include "Win\RestartManager.nsh"
!include "StrFunc.nsh"
${StrCase}
${StrLoc}

{{#if installer_hooks}}
!include "{{installer_hooks}}"
{{/if}}

!define WEBVIEW2APPGUID "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"

!define MANUFACTURER "{{manufacturer}}"
!define PRODUCTNAME "{{product_name}}"
!define VERSION "{{version}}"
!define VERSIONWITHBUILD "{{version_with_build}}"
!define HOMEPAGE "{{homepage}}"
!define INSTALLMODE "{{install_mode}}"
!define INSTALLERICON "{{installer_icon}}"
!define SIDEBARIMAGE "{{sidebar_image}}"
!define HEADERIMAGE "{{header_image}}"
!define UNINSTALLERICON "{{uninstaller_icon}}"
!define MAINBINARYNAME "{{main_binary_name}}"
!define MAINBINARYSRCPATH "{{main_binary_path}}"
!define BUNDLEID "{{bundle_id}}"
!define COPYRIGHT "{{copyright}}"
!define OUTFILE "{{out_file}}"
!define ARCH "{{arch}}"
!define ADDITIONALPLUGINSPATH "{{additional_plugins_path}}"
!define ALLOWDOWNGRADES "{{allow_downgrades}}"
!define INSTALLWEBVIEW2MODE "{{install_webview2_mode}}"
!define WEBVIEW2INSTALLERARGS "{{webview2_installer_args}}"
!define WEBVIEW2BOOTSTRAPPERPATH "{{webview2_bootstrapper_path}}"
!define WEBVIEW2INSTALLERPATH "{{webview2_installer_path}}"
!define MINIMUMWEBVIEW2VERSION "{{minimum_webview2_version}}"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCTNAME}"
!define MANUKEY "Software\${MANUFACTURER}"
!define MANUPRODUCTKEY "${MANUKEY}\${PRODUCTNAME}"
!define UNINSTALLERSIGNCOMMAND "{{uninstaller_sign_cmd}}"
!define ESTIMATEDSIZE "{{estimated_size}}"

!define RUNKEY "Software\Microsoft\Windows\CurrentVersion\Run"
!define STARTUPAPPROVEDKEY "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"
!define MAILPROGID "VaelMail.mailto"
!define MAILCLIENTKEY "Software\Clients\Mail\${PRODUCTNAME}"
!define DEFAULTAPPS "ms-settings:defaultapps?registeredAppUser=${PRODUCTNAME}"
!define MAINEXE "$INSTDIR\${MAINBINARYNAME}.exe"

Var PassiveMode
Var UpdateMode
Var NoShortcutMode
Var WixMode
Var OldMainBinaryName
Var ReinstallPageCheck

Var OptionStartMenu
Var OptionDesktop
Var OptionAutostart
Var OptionMailApp
Var StartMenuBox
Var DesktopBox
Var AutostartBox
Var MailAppBox

Var RemoveDataBox
Var RemoveData

!macro UnregisterMailApp
  DeleteRegValue HKCU "Software\RegisteredApplications" "${PRODUCTNAME}"
  DeleteRegKey HKCU "${MAILCLIENTKEY}"
  DeleteRegKey HKCU "Software\Classes\${MAILPROGID}"
  ReadRegStr $R7 HKCU "Software\Classes\mailto\shell\open\command" ""
  ${If} $R7 == "$\"${MAINEXE}$\" $\"%1$\""
    DeleteRegKey HKCU "Software\Classes\mailto"
  ${EndIf}
!macroend

Name "${PRODUCTNAME}"
BrandingText "${PRODUCTNAME} ${VERSION}"
OutFile "${OUTFILE}"

!define PLACEHOLDER_INSTALL_DIR "placeholder\${PRODUCTNAME}"
InstallDir "${PLACEHOLDER_INSTALL_DIR}"

VIProductVersion "${VERSIONWITHBUILD}"
VIAddVersionKey "ProductName" "${PRODUCTNAME}"
VIAddVersionKey "FileDescription" "${PRODUCTNAME} Setup"
VIAddVersionKey "LegalCopyright" "${COPYRIGHT}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"

!addplugindir "${ADDITIONALPLUGINSPATH}"

!if "${UNINSTALLERSIGNCOMMAND}" != ""
  !uninstfinalize '${UNINSTALLERSIGNCOMMAND}'
!endif

!if "${INSTALLMODE}" == "perMachine"
  RequestExecutionLevel admin
!else
  RequestExecutionLevel user
!endif

!if "${INSTALLERICON}" != ""
  !define MUI_ICON "${INSTALLERICON}"
!endif
!if "${UNINSTALLERICON}" != ""
  !define MUI_UNICON "${UNINSTALLERICON}"
!else if "${INSTALLERICON}" != ""
  !define MUI_UNICON "${INSTALLERICON}"
!endif

!if "${SIDEBARIMAGE}" != ""
  !define MUI_WELCOMEFINISHPAGE_BITMAP "${SIDEBARIMAGE}"
  !define MUI_UNWELCOMEFINISHPAGE_BITMAP "${SIDEBARIMAGE}"
!endif

!if "${HEADERIMAGE}" != ""
  !define MUI_HEADERIMAGE
  !define MUI_HEADERIMAGE_RIGHT
  !define MUI_HEADERIMAGE_BITMAP "${HEADERIMAGE}"
  !define MUI_HEADERIMAGE_UNBITMAP "${HEADERIMAGE}"
!endif

!define MUI_BGCOLOR "101716"
!define MUI_TEXTCOLOR "E8EDE4"
!define MUI_ABORTWARNING
!define MUI_ABORTWARNING_TEXT "Stop setting up ${PRODUCTNAME}? Nothing has been changed on this computer yet."
!define MUI_UNABORTWARNING
!define MUI_FINISHPAGE_NOAUTOCLOSE
!define MUI_UNFINISHPAGE_NOAUTOCLOSE

!define MUI_LANGDLL_REGISTRY_ROOT "HKCU"
!define MUI_LANGDLL_REGISTRY_KEY "${MANUPRODUCTKEY}"
!define MUI_LANGDLL_REGISTRY_VALUENAME "Installer Language"

!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
!define MUI_WELCOMEPAGE_TITLE "Welcome to ${PRODUCTNAME}"
!define MUI_WELCOMEPAGE_TEXT "Private email on your desktop.$\r$\n$\r$\nThis sets up ${PRODUCTNAME} ${VERSION} for your Windows account. It takes a few seconds and doesn't need administrator rights.$\r$\n$\r$\nYour mail stays on the service and in an encrypted cache, nothing else is collected.$\r$\n$\r$\nClick Next to continue."
!insertmacro MUI_PAGE_WELCOME

Page custom PageReinstall PageLeaveReinstall

!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
!define MUI_PAGE_HEADER_TEXT "Install location"
!define MUI_PAGE_HEADER_SUBTEXT "Where should ${PRODUCTNAME} live?"
!define MUI_DIRECTORYPAGE_TEXT_TOP "${PRODUCTNAME} installs into the folder below. The default works for almost everyone."
!insertmacro MUI_PAGE_DIRECTORY

Page custom PageOptions PageLeaveOptions

!define MUI_PAGE_HEADER_TEXT "Installing"
!define MUI_PAGE_HEADER_SUBTEXT "Copying ${PRODUCTNAME} to this computer."
!define MUI_INSTFILESPAGE_FINISHHEADER_TEXT "Installed"
!define MUI_INSTFILESPAGE_FINISHHEADER_SUBTEXT "${PRODUCTNAME} is ready."
!insertmacro MUI_PAGE_INSTFILES

!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
!define MUI_PAGE_CUSTOMFUNCTION_SHOW FinishShow
!define MUI_FINISHPAGE_TITLE "${PRODUCTNAME} is ready"
!define MUI_FINISHPAGE_TEXT "Sign in with your account number and pick up where you left off. ${PRODUCTNAME} keeps running in the tray when you close it, so new mail still reaches you."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Open ${PRODUCTNAME} now"
!define MUI_FINISHPAGE_RUN_FUNCTION RunMainBinary
!define MUI_FINISHPAGE_SHOWREADME
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Choose ${PRODUCTNAME} in Windows default apps"
!define MUI_FINISHPAGE_SHOWREADME_FUNCTION OpenDefaultApps
!define MUI_FINISHPAGE_LINK "vaelmail.com"
!define MUI_FINISHPAGE_LINK_LOCATION "https://vaelmail.com"
!define MUI_FINISHPAGE_LINK_COLOR "B9D778"
!insertmacro MUI_PAGE_FINISH

!define MUI_PAGE_CUSTOMFUNCTION_PRE un.SkipIfPassive
!define MUI_WELCOMEPAGE_TITLE "Remove ${PRODUCTNAME}"
!define MUI_WELCOMEPAGE_TEXT "This removes ${PRODUCTNAME} from your Windows account.$\r$\n$\r$\nYour mailbox is not affected. Everything stays on the service and you can sign in again from any device.$\r$\n$\r$\nClick Next to continue."
!insertmacro MUI_UNPAGE_WELCOME

UninstPage custom un.PageOptions un.PageLeaveOptions

!define MUI_PAGE_HEADER_TEXT "Removing"
!define MUI_PAGE_HEADER_SUBTEXT "Taking ${PRODUCTNAME} off this computer."
!define MUI_UNINSTFILESPAGE_FINISHHEADER_TEXT "Removed"
!define MUI_UNINSTFILESPAGE_FINISHHEADER_SUBTEXT "${PRODUCTNAME} is no longer installed."
!insertmacro MUI_UNPAGE_INSTFILES

!define MUI_PAGE_CUSTOMFUNCTION_PRE un.SkipIfPassive
!define MUI_FINISHPAGE_TITLE "${PRODUCTNAME} was removed"
!define MUI_FINISHPAGE_TEXT "Thanks for using ${PRODUCTNAME}. Your mail is still waiting at vaelmail.com."
!insertmacro MUI_UNPAGE_FINISH

{{#each languages}}
!insertmacro MUI_LANGUAGE "{{this}}"
LangString choowHowToInstall 0 ""
{{/each}}
!insertmacro MUI_RESERVEFILE_LANGDLL
{{#each language_files}}
  !include "{{this}}"
{{/each}}

Function FindWixInstall
  StrCpy $R6 ""
  StrCpy $0 0
  wix_loop:
    EnumRegKey $1 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall" $0
    StrCmp $1 "" wix_loop_done
    IntOp $0 $0 + 1
    ReadRegStr $R0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1" "DisplayName"
    ReadRegStr $R1 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1" "Publisher"
    StrCmp "$R0$R1" "${PRODUCTNAME}${MANUFACTURER}" 0 wix_loop
    ReadRegStr $R0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1" "UninstallString"
    ${StrCase} $R1 $R0 "L"
    ${StrLoc} $R0 $R1 "msiexec" ">"
    StrCmp $R0 0 0 wix_loop_done
    StrCpy $R6 "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1"
  wix_loop_done:
FunctionEnd

Function PageReinstall
  Call FindWixInstall
  ${If} $R6 != ""
    StrCpy $WixMode 1
    Goto compare_version
  ${EndIf}

  ReadRegStr $R0 SHCTX "${UNINSTKEY}" ""
  ReadRegStr $R1 SHCTX "${UNINSTKEY}" "UninstallString"
  ${IfThen} "$R0$R1" == "" ${|} Abort ${|}

  compare_version:
  ${If} $WixMode = 1
    ReadRegStr $R0 HKLM "$R6" "DisplayVersion"
  ${Else}
    ReadRegStr $R0 SHCTX "${UNINSTKEY}" "DisplayVersion"
  ${EndIf}

  nsis_tauri_utils::SemverCompare "${VERSION}" $R0
  Pop $R0

  ${If} $R0 = 0
    StrCpy $R1 "${PRODUCTNAME} ${VERSION} is already installed. Repair it, or remove it from this computer."
    StrCpy $R2 "Repair ${PRODUCTNAME}"
    StrCpy $R3 "Remove ${PRODUCTNAME}"
    !insertmacro MUI_HEADER_TEXT "Already installed" "Choose what to do with this copy."
  ${ElseIf} $R0 = 1
    StrCpy $R1 "An older ${PRODUCTNAME} is installed. Setup can replace it, your settings and sign-in are kept."
    StrCpy $R2 "Replace the older version (recommended)"
    StrCpy $R3 "Install over it without removing"
    !insertmacro MUI_HEADER_TEXT "Update ${PRODUCTNAME}" "A previous version was found."
  ${ElseIf} $R0 = -1
    StrCpy $R1 "A newer ${PRODUCTNAME} is already installed. Remove it first to go back to ${VERSION}."
    StrCpy $R2 "Remove the newer version first"
    StrCpy $R3 "Keep the newer version"
    !insertmacro MUI_HEADER_TEXT "Newer version found" "Going back is possible but rarely needed."
  ${Else}
    Abort
  ${EndIf}

  ${If} $PassiveMode = 1
    Call PageLeaveReinstall
  ${Else}
    nsDialogs::Create 1018
    Pop $R4
    ${IfThen} $(^RTL) = 1 ${|} nsDialogs::SetRTL $(^RTL) ${|}

    ${NSD_CreateLabel} 0 0 100% 24u $R1
    Pop $R1

    ${NSD_CreateRadioButton} 12u 40u -12u 12u $R2
    Pop $R2
    ${NSD_OnClick} $R2 PageReinstallUpdateSelection

    ${NSD_CreateRadioButton} 12u 58u -12u 12u $R3
    Pop $R3
    !if "${ALLOWDOWNGRADES}" == "false"
      ${IfThen} $R0 = -1 ${|} EnableWindow $R3 0 ${|}
    !endif
    ${NSD_OnClick} $R3 PageReinstallUpdateSelection

    ${If} $ReinstallPageCheck <> 2
      SendMessage $R2 ${BM_SETCHECK} ${BST_CHECKED} 0
    ${Else}
      SendMessage $R3 ${BM_SETCHECK} ${BST_CHECKED} 0
    ${EndIf}

    ${NSD_SetFocus} $R2
    nsDialogs::Show
  ${EndIf}
FunctionEnd

Function PageReinstallUpdateSelection
  ${NSD_GetState} $R2 $R1
  ${If} $R1 == ${BST_CHECKED}
    StrCpy $ReinstallPageCheck 1
  ${Else}
    StrCpy $ReinstallPageCheck 2
  ${EndIf}
FunctionEnd

Function PageLeaveReinstall
  ${NSD_GetState} $R2 $R1

  ${If} $WixMode = 1
    Goto reinst_uninstall
  ${EndIf}

  ${If} $UpdateMode = 1
    Goto reinst_done
  ${EndIf}

  ${If} $R0 = 0
    ${If} $R1 = 1
      Goto reinst_done
    ${Else}
      Goto reinst_uninstall
    ${EndIf}
  ${ElseIf} $R1 = 1
    Goto reinst_uninstall
  ${Else}
    Goto reinst_done
  ${EndIf}

  reinst_uninstall:
    HideWindow
    ClearErrors

    ${If} $WixMode = 1
      ReadRegStr $R1 HKLM "$R6" "UninstallString"
      ExecWait '$R1' $0
    ${Else}
      ReadRegStr $4 SHCTX "${MANUPRODUCTKEY}" ""
      ReadRegStr $R1 SHCTX "${UNINSTKEY}" "UninstallString"
      ${IfThen} $UpdateMode = 1 ${|} StrCpy $R1 "$R1 /UPDATE" ${|}
      ${IfThen} $PassiveMode = 1 ${|} StrCpy $R1 "$R1 /P" ${|}
      StrCpy $R1 "$R1 _?=$4"
      ExecWait '$R1' $0
    ${EndIf}

    BringToFront

    ${IfThen} ${Errors} ${|} StrCpy $0 2 ${|}

    ${If} $0 <> 0
    ${OrIf} ${FileExists} "${MAINEXE}"
      ${If} $WixMode = 1
      ${AndIf} $0 = 1602
        Abort
      ${EndIf}
      ${If} $0 = 1
        Abort
      ${EndIf}
      MessageBox MB_ICONEXCLAMATION "The previous version of ${PRODUCTNAME} could not be removed. Close it and try again."
      Abort
    ${EndIf}

    ${If} $WixMode = 0
    ${AndIf} $4 != ""
      Delete "$4\uninstall.exe"
      RMDir "$4"
    ${EndIf}
  reinst_done:
FunctionEnd

Function LoadOptionDefaults
  StrCpy $OptionStartMenu ${BST_CHECKED}
  StrCpy $OptionDesktop ${BST_CHECKED}
  StrCpy $OptionAutostart ${BST_UNCHECKED}
  StrCpy $OptionMailApp ${BST_CHECKED}
  ReadRegStr $0 HKCU "${RUNKEY}" "${PRODUCTNAME}"
  ${IfThen} $0 != "" ${|} StrCpy $OptionAutostart ${BST_CHECKED} ${|}
  ${If} $UpdateMode = 1
    ReadRegStr $0 HKCU "Software\RegisteredApplications" "${PRODUCTNAME}"
    ${IfThen} $0 == "" ${|} StrCpy $OptionMailApp ${BST_UNCHECKED} ${|}
  ${EndIf}
FunctionEnd

Function PageOptions
  ${If} $PassiveMode = 1
    Abort
  ${EndIf}

  !insertmacro MUI_HEADER_TEXT "Make it yours" "Choose how ${PRODUCTNAME} fits into Windows."

  nsDialogs::Create 1018
  Pop $0
  ${IfThen} $(^RTL) = 1 ${|} nsDialogs::SetRTL $(^RTL) ${|}

  ${NSD_CreateGroupBox} 0 0 100% 48u "Shortcuts"
  Pop $0

  ${NSD_CreateCheckBox} 10u 14u -20u 12u "Add ${PRODUCTNAME} to the Start menu"
  Pop $StartMenuBox
  ${NSD_SetState} $StartMenuBox $OptionStartMenu

  ${NSD_CreateCheckBox} 10u 29u -20u 12u "Put a shortcut on the desktop"
  Pop $DesktopBox
  ${NSD_SetState} $DesktopBox $OptionDesktop

  ${NSD_CreateGroupBox} 0 56u 100% 80u "Windows"
  Pop $0

  ${NSD_CreateCheckBox} 10u 70u -20u 12u "Start ${PRODUCTNAME} when I sign in"
  Pop $AutostartBox
  ${NSD_SetState} $AutostartBox $OptionAutostart

  ${NSD_CreateLabel} 23u 83u -33u 10u "It waits quietly in the tray and tells you about new mail."
  Pop $0

  ${NSD_CreateCheckBox} 10u 99u -20u 12u "Use ${PRODUCTNAME} for email links"
  Pop $MailAppBox
  ${NSD_SetState} $MailAppBox $OptionMailApp

  ${NSD_CreateLabel} 23u 112u -33u 18u "Registers ${PRODUCTNAME} as a mail app. Windows asks you to confirm it once setup is done."
  Pop $0

  nsDialogs::Show
FunctionEnd

Function PageLeaveOptions
  ${NSD_GetState} $StartMenuBox $OptionStartMenu
  ${NSD_GetState} $DesktopBox $OptionDesktop
  ${NSD_GetState} $AutostartBox $OptionAutostart
  ${NSD_GetState} $MailAppBox $OptionMailApp
FunctionEnd

Function FinishShow
  ${If} $OptionMailApp <> ${BST_CHECKED}
    ShowWindow $mui.FinishPage.ShowReadme ${SW_HIDE}
    SendMessage $mui.FinishPage.ShowReadme ${BM_SETCHECK} ${BST_UNCHECKED} 0
  ${EndIf}
FunctionEnd

Function RunMainBinary
  nsis_tauri_utils::RunAsUser "${MAINEXE}" ""
FunctionEnd

Function OpenDefaultApps
  ExecShell "open" "${DEFAULTAPPS}"
FunctionEnd

Function .onInit
  ${GetOptions} $CMDLINE "/P" $PassiveMode
  ${IfNot} ${Errors}
    StrCpy $PassiveMode 1
  ${EndIf}

  ${GetOptions} $CMDLINE "/NS" $NoShortcutMode
  ${IfNot} ${Errors}
    StrCpy $NoShortcutMode 1
  ${EndIf}

  ${GetOptions} $CMDLINE "/UPDATE" $UpdateMode
  ${IfNot} ${Errors}
    StrCpy $UpdateMode 1
  ${EndIf}

  ${If} ${Silent}
    StrCpy $PassiveMode 1
  ${EndIf}

  !insertmacro SetContext

  ${If} $INSTDIR == "${PLACEHOLDER_INSTALL_DIR}"
    !if "${INSTALLMODE}" == "perMachine"
      ${If} ${RunningX64}
        StrCpy $INSTDIR "$PROGRAMFILES64\${PRODUCTNAME}"
      ${Else}
        StrCpy $INSTDIR "$PROGRAMFILES\${PRODUCTNAME}"
      ${EndIf}
    !else
      StrCpy $INSTDIR "$LOCALAPPDATA\Programs\${PRODUCTNAME}"
    !endif
    Call RestorePreviousInstallLocation
  ${EndIf}

  Call LoadOptionDefaults

  ${GetOptions} $CMDLINE "/NODESKTOP" $R9
  ${IfNot} ${Errors}
    StrCpy $OptionDesktop ${BST_UNCHECKED}
  ${EndIf}
  ${GetOptions} $CMDLINE "/AUTOSTART" $R9
  ${IfNot} ${Errors}
    StrCpy $OptionAutostart ${BST_CHECKED}
  ${EndIf}
  ${GetOptions} $CMDLINE "/NOMAILAPP" $R9
  ${IfNot} ${Errors}
    StrCpy $OptionMailApp ${BST_UNCHECKED}
  ${EndIf}

  !if "${ALLOWDOWNGRADES}" == "false"
  ${If} $PassiveMode = 1
  ${OrIf} $UpdateMode = 1
    Call FindWixInstall
    ${If} $R6 != ""
      ReadRegStr $R0 HKLM "$R6" "DisplayVersion"
    ${Else}
      ReadRegStr $R0 SHCTX "${UNINSTKEY}" "DisplayVersion"
    ${EndIf}
    nsis_tauri_utils::SemverCompare "${VERSION}" $R0
    Pop $R0
    ${If} $R0 = -1
      ${IfNot} ${Silent}
        MessageBox MB_ICONSTOP "A newer ${PRODUCTNAME} is already installed."
      ${EndIf}
      Abort
    ${EndIf}
  ${EndIf}
  !endif
FunctionEnd

Section WebView2
  ${If} ${RunningX64}
    ReadRegStr $4 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
  ${Else}
    ReadRegStr $4 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
  ${EndIf}
  ${If} $4 == ""
    ReadRegStr $4 HKCU "SOFTWARE\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
  ${EndIf}

  ${If} $4 == ""
  ${AndIf} $UpdateMode <> 1
    !if "${INSTALLWEBVIEW2MODE}" == "downloadBootstrapper"
      Delete "$TEMP\MicrosoftEdgeWebview2Setup.exe"
      DetailPrint "Downloading the Microsoft Edge WebView2 runtime..."
      NSISdl::download "https://go.microsoft.com/fwlink/p/?LinkId=2124703" "$TEMP\MicrosoftEdgeWebview2Setup.exe"
      Pop $0
      ${If} $0 != "success"
        Abort "The WebView2 runtime could not be downloaded. Check your connection and run setup again."
      ${EndIf}
      StrCpy $6 "$TEMP\MicrosoftEdgeWebview2Setup.exe"
      Goto install_webview2
    !endif

    !if "${INSTALLWEBVIEW2MODE}" == "embedBootstrapper"
      Delete "$TEMP\MicrosoftEdgeWebview2Setup.exe"
      File "/oname=$TEMP\MicrosoftEdgeWebview2Setup.exe" "${WEBVIEW2BOOTSTRAPPERPATH}"
      StrCpy $6 "$TEMP\MicrosoftEdgeWebview2Setup.exe"
      Goto install_webview2
    !endif

    !if "${INSTALLWEBVIEW2MODE}" == "offlineInstaller"
      Delete "$TEMP\MicrosoftEdgeWebView2RuntimeInstaller.exe"
      File "/oname=$TEMP\MicrosoftEdgeWebView2RuntimeInstaller.exe" "${WEBVIEW2INSTALLERPATH}"
      StrCpy $6 "$TEMP\MicrosoftEdgeWebView2RuntimeInstaller.exe"
      Goto install_webview2
    !endif

    Goto webview2_done

    install_webview2:
      DetailPrint "Installing the Microsoft Edge WebView2 runtime..."
      ExecWait "$6 ${WEBVIEW2INSTALLERARGS} /install" $1
      ${If} $1 <> 0
        Abort "The WebView2 runtime could not be installed. ${PRODUCTNAME} needs it to run."
      ${EndIf}
    webview2_done:
  ${EndIf}
SectionEnd

Section Install
  SetOutPath $INSTDIR

  !ifmacrodef NSIS_HOOK_PREINSTALL
    !insertmacro NSIS_HOOK_PREINSTALL
  !endif

  !insertmacro CheckIfAppIsRunning "${MAINEXE}" "${PRODUCTNAME}"

  DetailPrint "Copying ${PRODUCTNAME}..."
  File "${MAINBINARYSRCPATH}"

  {{#each resources_dirs}}
    CreateDirectory "$INSTDIR\\{{this}}"
  {{/each}}
  {{#each resources}}
    File /a "/oname={{this.[1]}}" "{{no-escape @key}}"
  {{/each}}

  {{#each binaries}}
    File /a "/oname={{this}}" "{{no-escape @key}}"
  {{/each}}

  WriteUninstaller "$INSTDIR\uninstall.exe"
  WriteRegStr SHCTX "${MANUPRODUCTKEY}" "" $INSTDIR

  ReadRegStr $OldMainBinaryName SHCTX "${UNINSTKEY}" "MainBinaryName"
  ${If} $OldMainBinaryName != ""
  ${AndIf} $OldMainBinaryName != "${MAINBINARYNAME}.exe"
    Delete "$INSTDIR\$OldMainBinaryName"
  ${EndIf}
  WriteRegStr SHCTX "${UNINSTKEY}" "MainBinaryName" "${MAINBINARYNAME}.exe"

  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayName" "${PRODUCTNAME}"
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayIcon" "$\"${MAINEXE}$\""
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr SHCTX "${UNINSTKEY}" "Publisher" "${MANUFACTURER}"
  WriteRegStr SHCTX "${UNINSTKEY}" "InstallLocation" "$\"$INSTDIR$\""
  WriteRegStr SHCTX "${UNINSTKEY}" "UninstallString" "$\"$INSTDIR\uninstall.exe$\""
  WriteRegDWORD SHCTX "${UNINSTKEY}" "NoModify" "1"
  WriteRegDWORD SHCTX "${UNINSTKEY}" "NoRepair" "1"

  ${GetSize} "$INSTDIR" "/M=uninstall.exe /S=0K /G=0" $0 $1 $2
  IntOp $0 $0 + ${ESTIMATEDSIZE}
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD SHCTX "${UNINSTKEY}" "EstimatedSize" "$0"

  !if "${HOMEPAGE}" != ""
    WriteRegStr SHCTX "${UNINSTKEY}" "URLInfoAbout" "${HOMEPAGE}"
    WriteRegStr SHCTX "${UNINSTKEY}" "URLUpdateInfo" "${HOMEPAGE}"
    WriteRegStr SHCTX "${UNINSTKEY}" "HelpLink" "${HOMEPAGE}"
  !endif

  DetailPrint "Setting up shortcuts..."
  Call UpdateShortcuts

  ${If} $UpdateMode <> 1
    DetailPrint "Applying startup preference..."
    ${If} $OptionAutostart = ${BST_CHECKED}
      WriteRegStr HKCU "${RUNKEY}" "${PRODUCTNAME}" "$\"${MAINEXE}$\" --hidden"
      DeleteRegValue HKCU "${STARTUPAPPROVEDKEY}" "${PRODUCTNAME}"
    ${Else}
      DeleteRegValue HKCU "${RUNKEY}" "${PRODUCTNAME}"
    ${EndIf}
  ${EndIf}

  ${If} $OptionMailApp = ${BST_CHECKED}
    DetailPrint "Registering ${PRODUCTNAME} as a mail app..."
    Call RegisterMailApp
  ${ElseIf} $UpdateMode <> 1
    !insertmacro UnregisterMailApp
  ${EndIf}

  !ifmacrodef NSIS_HOOK_POSTINSTALL
    !insertmacro NSIS_HOOK_POSTINSTALL
  !endif

  ${If} $PassiveMode = 1
    SetAutoClose true
  ${EndIf}
SectionEnd

Function .onInstSuccess
  ${If} $PassiveMode = 1
    ${GetOptions} $CMDLINE "/R" $R0
    ${IfNot} ${Errors}
      ${GetOptions} $CMDLINE "/ARGS" $R0
      nsis_tauri_utils::RunAsUser "${MAINEXE}" "$R0"
    ${EndIf}
  ${EndIf}
FunctionEnd

Function RegisterMailApp
  WriteRegStr HKCU "Software\Classes\${MAILPROGID}" "" "${PRODUCTNAME} mail link"
  WriteRegStr HKCU "Software\Classes\${MAILPROGID}" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\${MAILPROGID}\DefaultIcon" "" "$\"${MAINEXE}$\",0"
  WriteRegStr HKCU "Software\Classes\${MAILPROGID}\shell\open\command" "" "$\"${MAINEXE}$\" $\"%1$\""
  WriteRegStr HKCU "${MAILCLIENTKEY}" "" "${PRODUCTNAME}"
  WriteRegStr HKCU "${MAILCLIENTKEY}\Capabilities" "ApplicationName" "${PRODUCTNAME}"
  WriteRegStr HKCU "${MAILCLIENTKEY}\Capabilities" "ApplicationDescription" "Private email from ${PRODUCTNAME}"
  WriteRegStr HKCU "${MAILCLIENTKEY}\Capabilities" "ApplicationIcon" "$\"${MAINEXE}$\",0"
  WriteRegStr HKCU "${MAILCLIENTKEY}\Capabilities\URLAssociations" "mailto" "${MAILPROGID}"
  WriteRegStr HKCU "Software\RegisteredApplications" "${PRODUCTNAME}" "${MAILCLIENTKEY}\Capabilities"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
FunctionEnd

Function UpdateShortcuts
  ${If} $OldMainBinaryName != ""
  ${AndIf} $OldMainBinaryName != "${MAINBINARYNAME}.exe"
    !insertmacro IsShortcutTarget "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\$OldMainBinaryName"
    Pop $0
    ${If} $0 = 1
      !insertmacro SetShortcutTarget "$SMPROGRAMS\${PRODUCTNAME}.lnk" "${MAINEXE}"
    ${EndIf}
    !insertmacro IsShortcutTarget "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\$OldMainBinaryName"
    Pop $0
    ${If} $0 = 1
      !insertmacro SetShortcutTarget "$DESKTOP\${PRODUCTNAME}.lnk" "${MAINEXE}"
    ${EndIf}
  ${EndIf}

  ${If} $WixMode = 0
    ${If} $UpdateMode = 1
    ${OrIf} $NoShortcutMode = 1
      Return
    ${EndIf}
  ${EndIf}

  ${If} $OptionStartMenu = ${BST_CHECKED}
    CreateShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk" "${MAINEXE}"
    !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  ${Else}
    Delete "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  ${EndIf}

  ${If} $OptionDesktop = ${BST_CHECKED}
    CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "${MAINEXE}"
    !insertmacro SetLnkAppUserModelId "$DESKTOP\${PRODUCTNAME}.lnk"
  ${Else}
    Delete "$DESKTOP\${PRODUCTNAME}.lnk"
  ${EndIf}
FunctionEnd

Function un.onInit
  !insertmacro SetContext
  !insertmacro MUI_UNGETLANGUAGE

  ${GetOptions} $CMDLINE "/P" $PassiveMode
  ${IfNot} ${Errors}
    StrCpy $PassiveMode 1
  ${EndIf}

  ${GetOptions} $CMDLINE "/UPDATE" $UpdateMode
  ${IfNot} ${Errors}
    StrCpy $UpdateMode 1
  ${EndIf}

  ${If} ${Silent}
    StrCpy $PassiveMode 1
  ${EndIf}

  StrCpy $RemoveData ${BST_UNCHECKED}
FunctionEnd

Function un.PageOptions
  ${If} $PassiveMode = 1
    Abort
  ${EndIf}

  !insertmacro MUI_HEADER_TEXT "Your data on this computer" "Decide what happens to it."

  nsDialogs::Create 1018
  Pop $0
  ${IfThen} $(^RTL) = 1 ${|} nsDialogs::SetRTL $(^RTL) ${|}

  ${NSD_CreateLabel} 0 0 100% 30u "${PRODUCTNAME} keeps your settings, the encrypted offline cache and your saved sign-in here. Keep them if you plan to reinstall, they are useless without your account."
  Pop $0

  ${NSD_CreateCheckBox} 0 40u 100% 12u "Also remove my settings, offline cache and saved sign-in"
  Pop $RemoveDataBox
  ${NSD_SetState} $RemoveDataBox $RemoveData

  ${NSD_CreateLabel} 13u 54u -13u 20u "Choose this on a shared computer or when you are done with ${PRODUCTNAME} for good."
  Pop $0

  nsDialogs::Show
FunctionEnd

Function un.PageLeaveOptions
  ${NSD_GetState} $RemoveDataBox $RemoveData
FunctionEnd

Section Uninstall
  !ifmacrodef NSIS_HOOK_PREUNINSTALL
    !insertmacro NSIS_HOOK_PREUNINSTALL
  !endif

  !insertmacro CheckIfAppIsRunning "${MAINEXE}" "${PRODUCTNAME}"

  ${If} $RemoveData = ${BST_CHECKED}
  ${AndIf} $UpdateMode <> 1
    DetailPrint "Forgetting the saved sign-in..."
    SetShellVarContext current
    ExecWait '"${MAINEXE}" --purge-secrets "$APPDATA\${BUNDLEID}"'
    !insertmacro SetContext
  ${EndIf}

  DetailPrint "Removing files..."
  Delete "${MAINEXE}"

  {{#each resources}}
    Delete "$INSTDIR\\{{this.[1]}}"
  {{/each}}

  {{#each binaries}}
    Delete "$INSTDIR\\{{this}}"
  {{/each}}

  Delete "$INSTDIR\uninstall.exe"

  {{#each resources_ancestors}}
  RMDir /REBOOTOK "$INSTDIR\\{{this}}"
  {{/each}}
  RMDir "$INSTDIR"

  ${If} $UpdateMode <> 1
    DetailPrint "Removing shortcuts..."
    !insertmacro DeleteAppUserModelId
    !insertmacro IsShortcutTarget "$SMPROGRAMS\${PRODUCTNAME}.lnk" "${MAINEXE}"
    Pop $0
    ${If} $0 = 1
      !insertmacro UnpinShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk"
      Delete "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    ${EndIf}
    !insertmacro IsShortcutTarget "$DESKTOP\${PRODUCTNAME}.lnk" "${MAINEXE}"
    Pop $0
    ${If} $0 = 1
      !insertmacro UnpinShortcut "$DESKTOP\${PRODUCTNAME}.lnk"
      Delete "$DESKTOP\${PRODUCTNAME}.lnk"
    ${EndIf}

    DetailPrint "Removing Windows integration..."
    DeleteRegValue HKCU "${RUNKEY}" "${PRODUCTNAME}"
    DeleteRegValue HKCU "${STARTUPAPPROVEDKEY}" "${PRODUCTNAME}"
    !insertmacro UnregisterMailApp
  ${EndIf}

  !if "${INSTALLMODE}" == "perMachine"
    DeleteRegKey HKLM "${UNINSTKEY}"
  !else
    DeleteRegKey HKCU "${UNINSTKEY}"
  !endif

  ${If} $RemoveData = ${BST_CHECKED}
  ${AndIf} $UpdateMode <> 1
    DetailPrint "Removing settings and offline cache..."
    DeleteRegKey SHCTX "${MANUPRODUCTKEY}"
    DeleteRegKey /ifempty SHCTX "${MANUKEY}"
    DeleteRegValue HKCU "${MANUPRODUCTKEY}" "Installer Language"
    DeleteRegKey /ifempty HKCU "${MANUPRODUCTKEY}"
    DeleteRegKey /ifempty HKCU "${MANUKEY}"
    SetShellVarContext current
    RmDir /r "$APPDATA\${BUNDLEID}"
    RmDir /r "$LOCALAPPDATA\${BUNDLEID}"
  ${EndIf}

  !ifmacrodef NSIS_HOOK_POSTUNINSTALL
    !insertmacro NSIS_HOOK_POSTUNINSTALL
  !endif

  ${If} $PassiveMode = 1
  ${OrIf} $UpdateMode = 1
    SetAutoClose true
  ${EndIf}
SectionEnd

Function RestorePreviousInstallLocation
  ReadRegStr $4 SHCTX "${MANUPRODUCTKEY}" ""
  StrCmp $4 "" +2 0
    StrCpy $INSTDIR $4
FunctionEnd

Function SkipIfPassive
  ${IfThen} $PassiveMode = 1 ${|} Abort ${|}
FunctionEnd

Function un.SkipIfPassive
  ${IfThen} $PassiveMode = 1 ${|} Abort ${|}
FunctionEnd
