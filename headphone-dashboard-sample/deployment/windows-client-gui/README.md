# Simple Windows client

`OpenKanban.exe` is a generic Windows launcher. The remote admin tool pairs it with a client-specific `client.bundle`; ordinary users keep both files together and only double-click the EXE.

The launcher uses the Windows OpenSSH Client already required by the deployment. On every launch it installs or refreshes the current Windows user's key and configuration, stops a stale recorded tunnel, starts the correct tunnel, waits for the local port, and opens the dashboard. Errors are shown in a Windows message box.

Build both Windows executables locally on 64-bit Windows by running `../windows-admin-gui/build-admin-tool.bat`. The local build embeds the launcher in `EarphoneDashboardAdmin.exe`, so client downloads made by the built admin tool are automatically reduced to:

```text
OpenKanban.exe
client.bundle
README.txt
```

`client.bundle` contains the assigned client's private key and access token. Treat the complete folder as a credential and do not share it. Migration bundles may omit the private key and reuse the key already installed for the same Windows account.

For troubleshooting, the legacy BAT and PowerShell client scripts remain in the server export package.

Do not use GitHub Actions to package these executables. After the local build succeeds, `../windows-admin-gui/publish-release.bat <tag>` verifies and uploads the two EXEs plus `SHA256SUMS.txt` to a GitHub Release.
