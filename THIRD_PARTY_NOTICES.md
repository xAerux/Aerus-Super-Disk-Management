# Third-Party Notices

This file lists the third-party components that ship with Aerus SDM, where their licence texts are found, and which rights are still unresolved. It is not a grant of rights.

## Aerus SDM's own code

Aerus SDM's own source code is licensed under the MIT License. See [LICENSE](LICENSE). Copyright (c) 2026 xAerux.

## Bundled runtime and native components

The file [LICENSES.chromium.html](LICENSES.chromium.html) is shipped with the application and reproduces licence and notice texts for the bundled Electron and Chromium components. It names Electron, Chromium, Node.js, ICU, zlib, FFmpeg, ANGLE, SwiftShader and Khronos/Vulkan components. Exact versions are recorded in that file.

| Component | Files shipped | Licence text |
|---|---|---|
| Electron and Chromium runtime | `resources.pak`, `chrome_100_percent.pak`, `chrome_200_percent.pak`, `locales/*.pak`, `snapshot_blob.bin`, `v8_context_snapshot.bin` | [LICENSES.chromium.html](LICENSES.chromium.html) |
| Node.js runtime (bundled in Electron) | Included in the Electron runtime files above | [LICENSES.chromium.html](LICENSES.chromium.html) |
| ICU data | `icudtl.dat` | [LICENSES.chromium.html](LICENSES.chromium.html) |
| FFmpeg | `ffmpeg.dll` | [LICENSES.chromium.html](LICENSES.chromium.html) |
| ANGLE | `libEGL.dll`, `libGLESv2.dll` | [LICENSES.chromium.html](LICENSES.chromium.html) |
| SwiftShader | `vk_swiftshader.dll`, `vk_swiftshader_icd.json` | [LICENSES.chromium.html](LICENSES.chromium.html) |
| Vulkan loader | `vulkan-1.dll` | [LICENSES.chromium.html](LICENSES.chromium.html) names Khronos and Vulkan components. Coverage of this specific file has not been separately verified. |
| Microsoft D3D compiler | `d3dcompiler_47.dll` | Not named in [LICENSES.chromium.html](LICENSES.chromium.html). Its licence terms have not been verified in this repository. Owner review required. |

## Web fonts (loaded at runtime, not bundled)

The interface loads fonts from Google Fonts when the computer is online. The fonts are not included in this package. Their licences are those published by Google.

## Brand assets with unresolved rights

The interface uses Grok-named assets from `resources/app/payload/static/__grok/`, including `icon-180.png` and the web manifest (`/__grok/manifest.webmanifest`). Other files in that folder, such as `logo-grok.svg`, are shipped as well. No redistribution permission from the rights holder is documented in this repository. These assets are not covered by the MIT License. They are kept for the owner's review and are not claimed as Aeru Creations' property.

## Third-Party Branding & Disclaimer

Aerus SDM is an independent Windows utility developed by Aeru Creations.

Third-party software names, logos, icons, trademarks, and associated branding remain the property of their respective owners.

Aerus SDM is not affiliated with, sponsored by, officially partnered with, or endorsed by Microsoft or other third-party software providers unless explicitly stated otherwise.

The project's MIT License applies to the material covered by that license. Third-party components, trademarks, artwork, and other assets remain subject to their respective licensing terms and permissions.

This disclaimer does not itself grant permission to redistribute third-party assets.
