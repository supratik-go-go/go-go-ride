import { Capacitor } from '@capacitor/core'

/** True inside the Android (or iOS) app, false in a normal browser. */
export const isNativeApp = () => Capacitor.isNativePlatform()

export const platform = () => Capacitor.getPlatform() // 'android' | 'ios' | 'web'
