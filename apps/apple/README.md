# Content Studio for iPhone, iPad and Mac

A native SwiftUI app for your Content Studio server. It's one codebase that runs on **iPhone, iPad
and Mac**.

It's a client: your photos, the AI pipeline and the database still live on your own Content Studio
server (`apps/web` + `apps/worker`). The app signs in to that server.

## What it does

- **Today:** greeting, safety status, draft cards with **Approve**, **Save for later** and
  **Reject** (with reasons the studio learns from), media-pipeline stats and recent agent runs.
  Approving never publishes.
- **Library:** your media with quality scores and Blurry / Duplicate / Similar / Never-use badges,
  filters, and infinite scroll.
  - **Add from Photos** uses Apple's photo picker, including your iCloud Photos library. You choose
    exactly which items to send, and the app gets no access to the rest of your library.
  - **Add files** uses the Files app on iPhone or Finder on Mac. You can also **drag and drop**
    onto the Library on Mac and iPad.
  - Originals upload as-is (HEIC stays HEIC), streamed from disk so large videos don't fill memory.
- **Media detail:** separate scores, details, similar shots, video playback, and a "Never use this" toggle.
- **Settings:** account, safety summary, sign out (which also revokes the session on the server).

## Requirements

- A Mac with **Xcode 16 or newer**
- iOS / iPadOS 17+, macOS 14+
- A running Content Studio server (see the repo root README)
- To run on your iPhone: a free Apple ID works, but the app must be re-installed every 7 days. A
  paid Apple Developer account ($99/yr) removes that limit and allows TestFlight.

## Build & run

The Xcode project is generated from `project.yml` with [XcodeGen](https://github.com/yonaskolb/XcodeGen),
so the repo doesn't carry a fragile hand-edited `.xcodeproj`.

```bash
brew install xcodegen
cd apps/apple
xcodegen               # creates ContentStudio.xcodeproj
open ContentStudio.xcodeproj
```

In Xcode:

1. Select the **ContentStudio** target, go to **Signing & Capabilities**, and choose your **Team**.
   If Xcode says the bundle ID is taken, change `com.example.contentstudio` to something like
   `com.yourname.contentstudio`.
2. Pick a destination in the toolbar: **My Mac**, an **iPhone simulator**, or your **iPhone** (plugged
   in or on the same Wi-Fi; enable Developer Mode on the phone when prompted).
3. Press **⌘R**.

<details>
<summary>Without XcodeGen</summary>

In Xcode, choose File → New → Project → **Multiplatform → App**, name it *ContentStudio*, and
delete the generated `ContentStudioApp.swift` and `ContentView.swift`. Then drag the `App`,
`Models`, `Services` and `Views` folders and `Assets.xcassets` into the project (✓ Copy items if
needed). In **Info**, add the keys from `ContentStudio/Info.plist`. For the Mac, enable
App Sandbox → Outgoing Connections (Client) and User Selected File (Read Only).
</details>

## Connecting to your server

When the app opens, enter your server address, email and password (the owner account you created with
`pnpm owner:create`).

| Where's the server? | Address to type |
|---|---|
| Same Mac (running the app on that Mac or in the simulator) | `localhost:3000` |
| Your computer, phone on the **same Wi-Fi** | `192.168.x.x:3000`, your computer's local IP (System Settings → Wi-Fi → Details) |
| Away from home | an **https** address: a reverse proxy with TLS, [Tailscale](https://tailscale.com) (`100.x.x.x` works as local), or a hosted deployment |

For Wi-Fi access, start the web server listening on your network:

```bash
pnpm --filter @intstapost/web dev -- -H 0.0.0.0
```

iOS asks once for permission to access devices on your local network; allow it.

Security rules built into the app:

- Plain `http://` is accepted **only** for local-network addresses (localhost, 10.x, 172.16–31.x,
  192.168.x, `.local`, Tailscale 100.64–127.x). Internet servers must use `https://`; the app refuses
  otherwise and iOS App Transport Security enforces the same rule.
- The session token is stored in the **Keychain** (device-only, not synced) and sent as a bearer token.
  Cookies are disabled, and nothing (including image previews) is cached to disk.
- Photos you pick go only to your own server.

## Project layout

```
apps/apple/
  project.yml                      XcodeGen spec (one target, iOS + macOS)
  ContentStudio/
    App/ContentStudioApp.swift     entry point, root + tab navigation
    Models/APIModels.swift         Codable mirrors of the server JSON
    Services/APIClient.swift       HTTP client (bearer auth, streaming multipart upload)
    Services/AppModel.swift        sign-in state, auto sign-out on 401
    Services/KeychainStore.swift   token storage
    Services/ImageCache.swift      in-memory image cache, UIImage/NSImage bridge
    Services/MediaImport.swift     Photos picker / Files → temp file
    Views/                         Today, DraftCard, Library, AssetDetail, Settings, Login, Components
    Info.plist                     ATS local-network exception, local-network prompt
    ContentStudio-macOS.entitlements  Mac App Sandbox (network client, user-selected files)
    Assets.xcassets                app icon + accent colour
```

## Server API used by the app

All endpoints accept `Authorization: Bearer <token>`:

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` | `{email, password}` → `{token, expiresAt, user}` |
| POST | `/api/auth/logout` | revoke this token |
| GET | `/api/me` | user, publishing status, upload limit |
| GET | `/api/today` | greeting, drafts, pipeline stats, recent runs |
| POST | `/api/drafts/{id}/decision` | `{decision: approve \| save_for_later \| reject, reasons?, comment?}` |
| GET | `/api/media?filter=&limit=&before=` | paged library |
| GET / PATCH | `/api/media/{id}` | detail / `{excluded}` |
| POST | `/api/media/upload` | multipart `files` |
| GET | `/api/media/file?key&exp&sig` | signed private media (also needs the token) |

## Verification status

This repo is developed on Linux, where Xcode isn't available, so **the app has not been built or run in
Xcode yet**. What has been checked:

- All Swift files pass the Swift 6.1 parser.
- The models, API client and app state type-check, and were **run against a live server**: login, bad
  password, token revocation, `me`, `today`, streaming upload, paging, detail, preview download,
  exclude/include, and draft decisions all passed.
- The SwiftUI views were reviewed but **not compiled**. If Xcode reports an error on first build,
  it will be in `Views/`; tell me what it says and I'll fix it.
