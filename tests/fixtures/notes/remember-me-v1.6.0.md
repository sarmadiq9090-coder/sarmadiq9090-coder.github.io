## v1.6.0 (2026-10-30)

Everything since v1.5.0. Your tasks, notes, attachments and settings load unchanged, and the alert keeps the v1.5.0 snooze choices until you change them.

### Highlights

- **Report a problem** from the app, with a pre-filled GitHub issue that never includes your tasks, notes or file names (issue #19). [#63]
- **Your own snooze choices** for the alert's six "Remind me again" buttons, and **Reschedule** after three snoozes (issue #20). [#64]
- **Snooze previews, clear overdue wording and "Done. Next: …"** so you can see where a reminder goes before and after you act on it (issue #21). [#64]

### Added

- **Report a problem:** crashes and uncaught errors are now written to the local log, and after a crash or repeated errors Remember Me offers **Report this problem**. It opens a pre-filled GitHub issue in your browser with the app and Windows versions, language, theme and the last 30 log lines, with paths removed and never any task, note or file content. Nothing is sent until you submit the issue yourself. You can also report a problem at any time from **Settings → About**, the flag button at the top of the main window, or the notification-area menu (issue #19). [#63]
- **Your own snooze choices:** **Settings → Reminders and background → Snooze choices** sets the six "Remind me again" buttons of the alert, still on keys 1–6. Each can be a number of minutes, hours or days, today or tomorrow at a set time, the same time next week, or **Pick a time**. The defaults are the v1.5.0 choices, and **Restore the default choices** brings them back (issue #20). [#64]
- **Reschedule** in the alert: after three snoozes, the nudge has a button that opens the task in the main window with its date and time ready to change (issue #20). [#64]
- **Snooze previews:** hovering or focusing a snooze button shows where it leads, such as "→ Today 6:00 PM", in your language's 12- or 24-hour clock with Western digits. Screen readers hear it too (issue #21). [#64]
- **Clear overdue wording** on task rows, such as "Overdue by 2 hours", in every language (issue #21). [#64]
- Completing a repeating task says when it comes back: **"Done. Next: …"**, with Undo (issue #21). [#64]
- A website at <https://sarmadiq9090-coder.github.io/Remember-Me/>, in English and Arabic, with the download, screenshots, install steps and how to check the download. It has no scripts, trackers or files from other hosts. [#47]
- Packages for Scoop and Chocolatey, next to the winget manifests: each release build makes their files, for publishing in those package managers (see `docs/distribution`). [#46] [#61]

### Changed

- The first snooze button reads "10 minutes" instead of "10 min", and a snooze choice for a time today before 17:00 shows that time, such as "Today 3:00 PM". [#64]
- Copies that the installer didn't put in place, such as the portable build or a Scoop install, don't offer automatic updates: **Settings → Updates** says updates work in the installed app only, and the one-time update card isn't shown. Installs from the installer, also through winget or Chocolatey, keep updating as before. [#46]

### For contributors

- [TRANSLATING.md](TRANSLATING.md) explains how to review or fix a language, with a **Translation review** issue form; the issue chooser links to Discussions, the privacy notice and the website. [#48]
- `tools/chocolatey-pack.mjs` builds the Chocolatey `.nupkg` without `choco`, byte for byte the same from the same source. [#61]
- eslint, playwright, electron-updater and @electron/fuses updated to their latest patch releases, and the remaining GitHub Actions pinned to commit SHAs. [#45]

### Upgrading

- v1.5.0 updates itself if you allowed automatic updates. Otherwise, install v1.6.0 over it; your data stays where it is.

