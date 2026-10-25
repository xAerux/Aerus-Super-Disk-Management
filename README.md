# Aerus SDM

<img width="1280" height="1109" alt="photo_2026-10-18_15-55-56" src="https://github.com/user-attachments/assets/c81d0392-b4eb-4057-ba48-5b4292f12df0" />

<img width="198" height="156" alt="photo_2026-10-18_21-49-39" src="https://github.com/user-attachments/assets/60ca341d-28e7-4d5e-b343-ee30cb8bbbd0" />

# ⚡ AERUS SDM

### 💻 Your PC. Your Startup. Your Control.

**Created by Aeru Creations**

**Windows Desktop Utility | Version 1.0.0**

Welcome to **Aerus SDM**, a Windows desktop utility for seeing what your computer is doing at startup, what your drives hold, and what is installed where. It runs on your PC, shows you the facts first, and only changes something when you say so. 🚀

---

## ✨ What It Does

- 🔎 **Windows system discovery.** Looks at your PC locally and shows what it finds.
- 🚦 **Startup detection.** Lists the programs that start with Windows, from Run entries (current user and machine, 32-bit and 64-bit) and Startup folders, with their publisher and current state.
- 🎛️ **Startup management.** Turn supported startup entries on or off. Disabling is reversible, and the entry is never deleted.
- 💾 **Storage and drive information.** Shows your drives and how much space each one has used and free.
- 🖥️ **Standalone desktop window.** It opens as its own Windows app, not a browser tab.

Aerus SDM does not advertise features it does not have. If something is not listed above, it is not promised.

---

## 📥 Installation

1. Download **`Aerus-SDM-Setup-v1.0.0.exe`** from the official GitHub Release, once it is published.
2. Double-click the file.
3. Follow the Windows setup steps.
4. Launch **Aerus SDM** from the Desktop or the Start Menu.

THAT'S IT! 🚀

You do not need Node.js, npm, PowerShell, or the source code. The installer includes everything the app needs.

---

## 🔐 Windows Security Warning

The installer is **not code-signed yet**, so Windows may show a security warning when you open it. That is expected for an unsigned program.

- Only download the installer from the official GitHub Release.
- Compare the file's SHA-256 checksum with the one published on the release page before you run it.
- If you do not recognize the source, do not run it.

Do not turn off Windows Defender, SmartScreen, or any other security protection to install Aerus SDM.

---

## 🛡️ Safety and Privacy

- 🏠 **Local only.** Discovery runs on your computer. Aerus SDM does not upload your scan results, startup list, or file information.
- 🧾 **Startup changes are reversible.** Disabling an entry turns off Windows' own startup flag. The entry stays in place, so you can turn it back on. Protected entries are read-only in Aerus SDM.
- 📝 **Changes are logged locally.** Each startup change is recorded in a backup file under your Windows user profile (`%APPDATA%\Aerus SDM`). That file stays on your PC.
- ⚠️ **Think before you disable.** Turning off a startup entry can stop a program from running in the background. Do not disable security software, drivers, or anything you do not recognize. If you are unsure, leave it alone.
- 🌐 **One outside request.** The interface loads its fonts from Google Fonts when you are online.
- 🔒 **Loopback service.** The app's local service listens only on your own computer, not on your network.

---

## 🧠 Why I Built Aerus SDM

Over time, a Windows PC collects games, programs, leftover files, startup entries, and installs spread across several drives. Keeping track of all of it is frustrating, especially with more than one drive and hundreds of programs.

I wanted one place to see what is installed, understand where the space is going, and manage startup without bouncing between a dozen utilities. That is why I built Aerus SDM. 💜

---

## 🐛 Bugs, Feedback and Ideas

Found a bug, or have an idea?

Open an issue in this repository's **Issues** section, and include:

- Your Windows version and the Aerus SDM version
- The steps that lead to the problem

Never post passwords, license keys, or personal file information. 🙏

---

## ⚠️ Known Limitations

Known limitations are listed in [KNOWN_ISSUES.md](KNOWN_ISSUES.md). Results depend on your Windows version and your account's permissions. Some system folders and installation records may not be readable without administrator rights.

---

## ⚖️ Licence and Third-Party Branding

Aerus SDM's own code is licensed under the [MIT License](LICENSE). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for third-party components, notices and asset notes.

**Third-Party Branding & Disclaimer**

Aerus SDM is an independent Windows utility developed by Aeru Creations.

Third-party software names, logos, icons, trademarks, and associated branding remain the property of their respective owners.

Aerus SDM is not affiliated with, sponsored by, officially partnered with, or endorsed by Microsoft or other third-party software providers unless explicitly stated otherwise.

The project's MIT License applies to the material covered by that license. Third-party components, trademarks, artwork, and other assets remain subject to their respective licensing terms and permissions.

This disclaimer does not itself grant permission to redistribute third-party assets.

---

## 💜 Aeru Creations

**Created by Aeru Creations**

Building useful software, AI tools, and desktop applications that put more capability and control into the hands of everyday users. 🚀

*Powerful tools. Cleaner workflows. Your computer, your rules.*

### ⚡ Aerus SDM

**Take control of your digital space.** 💻
