# GO-GO Ride — Android App

The GO-GO Ride passenger app for Android, built with [Capacitor](https://capacitorjs.com/).
It is the same React app as `../go-go-ride website code`, packaged as a native app, plus phone-only features:

| Feature | Where |
| --- | --- |
| App icon, name, splash screen from the GO-GO Ride logo | `android/app/src/main/res/` |
| Bus alarms ring on the phone even when the app is closed (local notifications) | `src/native/alarmNotifications.js`, hooked into `src/services/alarmService.js` |
| Android back button walks back through screens, exits from Home | `src/native/NativeBridge.jsx` |
| Navy status bar, signed-in users skip the welcome screen | `src/native/NativeBridge.jsx` |
| Server address set at build time and changeable in the app (Profile → Settings → Server, or "Server settings" on the login screen) | `src/api/client.js`, `src/native/AppSettings.jsx` |
| Location for "Bus stops near you" and tracking | `AndroidManifest.xml` permissions |

App id: `com.gogoride.app` (this is permanent once published on the Play Store — change it in
`capacitor.config.json` and `android/app/build.gradle` *before* the first upload if you want a different one).

## 0. See it on your PC right now (no Android tools needed)

Double-click **`preview-app.bat`**. It starts the API (if needed) and the app screens on port 5174 and opens them in a
phone-sized Chrome/Edge window. Phone-only features (alarm notifications, back button, splash screen) need the real APK.

## 1. One-time setup

1. Install **Android Studio**: <https://developer.android.com/studio>. Open it once and finish the setup wizard
   (it downloads the Android SDK; you accept Google's SDK licence there).
2. Node.js 20+ (already used by the website).

## 2. Build the APK

```bat
build-apk.bat
```

This builds the screens, copies them into the Android project and produces **`GO-GO-Ride.apk`** in this folder.
The first build downloads Gradle and takes several minutes; later builds are quick.

The server address the app uses comes from `.env.production` (`VITE_API_URL`). Pass a different one as an argument:

```bat
build-apk.bat http://192.168.1.9:8000/api
build-apk.bat https://api.yourdomain.com/api
```

## 3. Try it on your phone (same Wi-Fi as this PC)

1. In `D:\Go-Go-Ride`, start the server in phone mode: `start-gogo-ride.bat phone`
   (if Windows Firewall asks, allow Python on **Private** networks). It prints the address to use.
2. Copy `GO-GO-Ride.apk` to the phone and open it; allow "Install unknown apps" when Android asks.
3. If the app says it can't reach the server, open **Server settings** on the login screen and enter
   the address printed by the launcher, e.g. `http://192.168.1.9:8000/api`.
4. Log in with a demo account (passenger `9123456789` / `Rider@123`), set an alarm, and allow notifications.
   For reminders exactly on time, allow **Alarms & reminders** when the app's Settings screen asks.

## 4. Publish on the Play Store

1. **Put the backend online over HTTPS** (e.g. a Hostinger VPS). Phones outside your Wi-Fi cannot reach your PC.
   Add `https://localhost` to `CORS_ORIGINS` in the server's `.env` (already done for this PC).
2. Build against it: `build-apk.bat https://api.yourdomain.com/api`.
3. For release, remove the testing-only settings in `capacitor.config.json` — `"cleartext": true` and
   `"allowMixedContent": true` exist only so the app can talk to a plain-http server on your Wi-Fi.
4. Open the project in Android Studio (`npx cap open android`) → **Build → Generate Signed App Bundle** (.aab).
   Create an upload key and keep it safe: you need the same key for every future update.
5. Raise `versionCode` / `versionName` in `android/app/build.gradle` for every update.
6. In the Play Console you will need: the 512×512 icon (`play-store-icon-512.png`), screenshots, a privacy
   policy URL, the Data safety form (the app stores name, phone, location use, bookings), and — because the
   app uses exact alarms for bus reminders — the exact-alarm permission declaration.

## Day-to-day development

```bat
npm run dev          :: open http://localhost:5173 in a browser (phone-sized window)
npm run cap:sync     :: rebuild + copy into the Android project
npm run cap:open     :: open in Android Studio (run on an emulator or a USB-connected phone)
```

Changes to shared screens should be made in both this folder and `../go-go-ride website code`
(they started as the same code). Native-only code lives in `src/native/`.
