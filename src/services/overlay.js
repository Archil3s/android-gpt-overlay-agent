import { NativeModules, Platform } from "react-native";

const { OverlayModule } = NativeModules;

export function isOverlaySupported() {
  return Platform.OS === "android" && Boolean(OverlayModule);
}

export async function hasOverlayPermission() {
  assertOverlayAvailable();
  return Boolean(await OverlayModule.hasOverlayPermission());
}

export async function requestOverlayPermission() {
  assertOverlayAvailable();
  OverlayModule.requestOverlayPermission();
}

export async function startOverlayService() {
  assertOverlayAvailable();

  const granted = await hasOverlayPermission();
  if (!granted) {
    requestOverlayPermission();
    return {
      started: false,
      permissionRequired: true,
      message: "Overlay permission is required before the floating bubble can start."
    };
  }

  OverlayModule.startOverlayService();
  return {
    started: true,
    permissionRequired: false,
    message: "Overlay service started."
  };
}

export function stopOverlayService() {
  assertOverlayAvailable();
  OverlayModule.stopOverlayService();
  return {
    stopped: true,
    message: "Overlay service stopped."
  };
}

function assertOverlayAvailable() {
  if (Platform.OS !== "android") {
    throw new Error("Android overlay is only supported on Android.");
  }

  if (!OverlayModule) {
    throw new Error("OverlayModule is not registered. Rebuild the Android app after native changes.");
  }
}
