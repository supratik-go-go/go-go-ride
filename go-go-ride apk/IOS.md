# Launching on iPhone (later)

The iOS project is ready in the `ios` folder and uses the same code as the Android app.
It has not been built or tested yet, because that needs a Mac.

## You will need

- A Mac with Xcode (or a rented cloud Mac)
- Node.js 22 or newer on that Mac
- An Apple Developer account (US$99 per year)
- A real iPhone for testing

## Build it

1. Copy the project to the Mac, for example `git clone https://github.com/supratik0000/go-go-ride.git`.
2. In a terminal, open the `go-go-ride apk` folder.
3. Install and open:

   ```bash
   npm install
   npm run ios:sync
   npm run ios:open
   ```

4. In Xcode, select the **App** target, open **Signing & Capabilities**, and choose your Apple team.
5. Pick your iPhone at the top and press **Run**.

`.env.production` already points the app at `https://go-goride.com/api`.

## Test on a real iPhone first

- Bus alarms ring with the app closed (iOS allows about 60 reminders at once; the soonest are kept)
- Use my location and Nearby Bus Stops ask for permission and work
- Sign up, log in, search, Via stop, Game and Daily News
- The top and bottom of every screen clear the notch and home bar
- You can go back from every screen (iPhones have no back button)
- Delete account works

## Before sending it to Apple

- Set the version under the **General** tab. Raise the build number for every upload.
- Replace the app icon with a sharper one if you have a 1024x1024 original.
  `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` was enlarged from a 512x512 image.
- In App Store Connect, give the privacy policy link: `https://go-goride.com/privacy`
- Give the reviewer a demo login in the review notes.
- iPhones can't install from the website, so the App Store or TestFlight is the only way to reach users.
- The update popup is Android only. iPhones get updates through the App Store.
