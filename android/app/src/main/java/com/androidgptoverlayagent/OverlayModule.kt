package com.androidgptoverlayagent

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class OverlayModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "OverlayModule"

  @ReactMethod
  fun hasOverlayPermission(promise: Promise) {
    try {
      val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        Settings.canDrawOverlays(reactContext)
      } else {
        true
      }
      promise.resolve(granted)
    } catch (error: Exception) {
      promise.reject("OVERLAY_PERMISSION_CHECK_FAILED", error)
    }
  }

  @ReactMethod
  fun requestOverlayPermission() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return

    val intent = Intent(
      Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
      Uri.parse("package:${reactContext.packageName}")
    )
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    reactContext.startActivity(intent)
  }

  @ReactMethod
  fun startOverlayService() {
    val intent = Intent(reactContext, OverlayService::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      reactContext.startForegroundService(intent)
    } else {
      reactContext.startService(intent)
    }
  }

  @ReactMethod
  fun stopOverlayService() {
    val intent = Intent(reactContext, OverlayService::class.java)
    reactContext.stopService(intent)
  }
}
