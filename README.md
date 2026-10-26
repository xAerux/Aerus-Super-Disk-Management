# Aerus SDM
Part of the Aeru Creations toolset — see EZ AI for the full hub.
<img width="1280" height="1109" alt="photo_2026-10-18_15-55-56" src="https://github.com/user-attachments/assets/c81d0392-b4eb-4057-ba48-5b4292f12df0" />

<img width="198" height="156" alt="photo_2026-10-18_21-49-39" src="https://github.com/user-attachments/assets/60ca341d-28e7-4d5e-b343-ee30cb8bbbd0" />

# ⚡ AERUS SDM
### 💻 Your PC. Your Startup. Your Control.

**A Windows System Management Utility by Aeru Creations**

![Version](https://img.shields.io/badge/Version-1.0.0-00CED1?style=for-the-badge)
![Platform](https://img.shields.io/badge/Platform-Windows-0078D4?style=for-the-badge&logo=windows)
![License](https://img.shields.io/badge/License-MIT-gold?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Released-brightgreen?style=for-the-badge)

---

## 🚀 Welcome to Aerus SDM!

Ever wondered just how much stuff Windows has running behind the scenes?

Or opened Task Manager and thought:

**"Why the hell does all this stuff start with my computer?"** 😂

Yeah. Same.

That's one of the reasons I created **Aerus SDM**.

A standalone Windows utility designed to make understanding your PC, exploring your system, and managing startup applications a whole lot easier.

No complicated commands. No digging through the Windows Registry just to figure out what's launching.

**One application. More visibility. More control.**

Built for people who like knowing what's happening inside their computers. ⚡

---

## 📸 A Look Inside Aerus SDM

*See the application in action!*

<!-- Keep your existing two Aerus SDM screenshot Markdown lines here. -->

---

## ✨ Features

| Feature | What It Does |
|---|---|
| 🖥️ **System Discovery** | Explore supported information about your Windows computer. |
| 🚀 **Startup Manager** | Discover startup applications and inspect their current settings. |
| ⚡ **Startup Controls** | Enable or disable supported Windows startup entries. |
| 💾 **Storage Information** | View available drive and storage information. |
| 🔍 **Startup Inspection** | Inspect startup entries from supported Registry locations and Startup folders. |
| 🛡️ **Reversible Changes** | Keep supported startup entries available for re-enabling, with local change records. |

### 💡 Built for Real Windows Management

Aerus SDM isn't just a pretty interface.

It works with Windows startup information to help you inspect and manage supported entries without manually editing the Registry yourself.

When you disable a supported Run-key startup entry, Aerus SDM uses Windows' `StartupApproved` state rather than deleting the original Run value.

That means you can turn supported entries back on later.

**No unnecessary Registry deletion. No pretending every startup entry is disposable.**

---

## 📦 Download Aerus SDM — v1.0.0

### <escape>⚡ Ready to take control?</escape>

**Official Windows Installer:**

### [📥 Aerus-SDM-Setup-v1.0.0.exe](https://github.com/xAerux/Aerus-Super-Disk-Management/blob/main/Aerus-SDM-Setup-v1.0.0.exe)

### Installation

1. 📥 Open the installer link above and select **Download raw file** on GitHub.
2. 🖱️ Double-click `Aerus-SDM-Setup-v1.0.0.exe`.
3. ⚙️ Follow the setup instructions.
4. 🚀 Launch **Aerus SDM** and explore your system!

**THAT'S IT!** 🎉

The standalone installer does not require you to manually configure Node.js, npm, or development tools.

**Windows users:** This installer is currently unsigned, so Windows may display an unknown-publisher or SmartScreen warning. Only run applications from sources you trust, and don't disable your security protections to install software.

---

## 🚀 Your Startup. Your Rules.

Over time, Windows computers collect startup entries from software installations, utilities, game launchers, communication apps, and more.

Some are useful.

Some you only need occasionally.

And some leave you wondering why they're even there. 😂

Aerus SDM makes supported startup entries easier to inspect and manage.

### How Startup Management Works

- 🔍 Discover supported startup entries.
- 🖥️ Inspect their reported status.
- ⚡ Enable or disable supported entries.
- 🔄 Re-enable entries when needed.
- 💾 Keep local records of supported startup changes.

Changes to startup settings generally affect future launches or sign-ins. Disabling an entry does not automatically close an application that's already running or uninstall it.

**⚠️ Important:** Some startup entries belong to antivirus tools, device utilities, accessibility software, and other important programs. Research anything unfamiliar before disabling it.

---

## 🔐 Privacy, Safety & Local Operation

Your computer belongs to you. Your system information should be handled responsibly.

Aerus SDM performs its supported system inspection and startup-management operations locally.

Startup-change records are maintained in the user's Windows application-data directory.

**Backup record location:**

`%APPDATA%\Aerus SDM\startup-toggle-backups.json`

### What You Should Know

- 🔒 Startup-management operations work with local Windows configuration.
- 💾 Supported startup changes are recorded locally.
- 🛠️ Some operations may depend on Windows permissions.
- 🔄 Supported startup changes can be reversed.
- 🌐 The interface may request Google Fonts over the internet.
- ⚠️ Aerus SDM is not a substitute for system backups or Windows recovery tools.

No software can guarantee that every Windows configuration will behave identically. Use care when making system changes.

---

## 🖥️ Designed for Windows

Aerus SDM is a dedicated Windows desktop application.

Built using web-based desktop technology, it provides a familiar interface while interacting with supported Windows system functionality.

You don't need to live inside Command Prompt or Registry Editor to explore the features it provides.

**A desktop utility should feel like a desktop utility.** 😎

---

## 🐛 Bugs, Feedback & Suggestions

I'm an independent developer, and I'm always improving my projects.

Found a bug?

Have an idea?

Know a Windows feature that deserves a better interface?

I'd love to hear about it!

**[💬 Visit the GitHub Issues page](https://github.com/xAerux/Aerus-Super-Disk-Management/issues)**

Please avoid posting passwords, authentication tokens, or private system information in public issue reports.

You can also review the project's [known issues](./KNOWN_ISSUES.md).

---

## 🛠️ Development & Future Improvements

Aerus SDM is part of a growing collection of software projects created under **Aeru Creations**.

Future development may explore:

- 🖥️ Expanded Windows system information
- 💾 Additional storage-management insights
- 🔍 Improved startup inspection
- 🛡️ More safety and recovery options
- ⚡ Interface and performance improvements
- 🚀 New troubleshooting and productivity features

These are ideas for future development, not features promised in v1.0.0.

---

## ⚖️ Open Source & Licensing

**Aerus SDM is released under the MIT License.**

You're welcome to inspect, study, modify, and redistribute MIT-covered source code in accordance with its license terms.

**[📄 View MIT LICENSE](./LICENSE)**

Copyright © 2026 xAerux.

### Third-Party Software & Branding

Aerus SDM incorporates third-party software components that retain their respective licenses and attribution requirements.

The bundled Electron and Chromium technology, along with associated components, is documented in the included third-party license materials.

**[📚 Third-Party Notices](./THIRD_PARTY_NOTICES.md)**

Third-party trademarks, logos, names, and artwork remain the property of their respective owners.

Aerus SDM is an independently developed project and is not affiliated with, sponsored by, or endorsed by Microsoft, Google, xAI, or other third-party providers unless explicitly stated otherwise.

The MIT License for Aerus SDM's own code does not grant additional rights to third-party trademarks, assets, or separately licensed software.

---

## ❤️ About Aeru Creations

I'm an independent creator with a passion for technology, software development, troubleshooting, and building things that are actually useful.

I've spent years working with computers, fixing problems, experimenting with software, and finding ways to make technology work better.

And now?

I'm building my own tools. 😂

Some projects start with a massive idea.

Others start because something about Windows annoys me enough that I decide to build an application for it.

**Aerus SDM is one of those projects.**

The goal isn't to reinvent Windows.

It's to make some of its tools and information easier to access, understand, and manage.

And this is only the beginning. 🚀

### ⚡ IMAGINE IT. I PRODUCE IT.

**AERU CREATIONS**

*Software. Technology. Creativity.*

---

### ⭐ Enjoying Aerus SDM?

If you find it useful, consider giving the repository a **Star ⭐** on GitHub!

It helps support the project and lets me know people are enjoying what I'm building.

**Thanks for checking out Aerus SDM!** ⚡❤️

*Built with curiosity, determination, and probably way too much caffeine.* 😂
