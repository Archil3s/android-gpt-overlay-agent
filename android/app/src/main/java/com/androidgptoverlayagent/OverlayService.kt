package com.androidgptoverlayagent

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.TextView

class OverlayService : Service() {
  private lateinit var windowManager: WindowManager
  private var bubbleView: TextView? = null
  private var panelView: FrameLayout? = null

  override fun onCreate() {
    super.onCreate()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
      stopSelf()
      return
    }

    windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
    startForegroundIfNeeded()
    showBubble()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun showBubble() {
    val bubble = TextView(this).apply {
      text = "AI"
      textSize = 14f
      typeface = Typeface.MONOSPACE
      setTextColor(Color.parseColor("#080808"))
      setBackgroundColor(Color.parseColor("#00FF88"))
      gravity = Gravity.CENTER
    }

    val params = WindowManager.LayoutParams(
      120,
      120,
      overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
      android.graphics.PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = 40
      y = 240
    }

    var startX = 0
    var startY = 0
    var downX = 0f
    var downY = 0f
    var moved = false

    bubble.setOnTouchListener { _, event ->
      when (event.action) {
        MotionEvent.ACTION_DOWN -> {
          startX = params.x
          startY = params.y
          downX = event.rawX
          downY = event.rawY
          moved = false
          true
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = (event.rawX - downX).toInt()
          val dy = (event.rawY - downY).toInt()
          if (kotlin.math.abs(dx) > 6 || kotlin.math.abs(dy) > 6) moved = true
          params.x = startX + dx
          params.y = startY + dy
          windowManager.updateViewLayout(bubble, params)
          true
        }
        MotionEvent.ACTION_UP -> {
          if (!moved) togglePanel()
          true
        }
        else -> false
      }
    }

    bubbleView = bubble
    windowManager.addView(bubble, params)
  }

  private fun togglePanel() {
    if (panelView != null) {
      removePanel()
      return
    }

    val panel = FrameLayout(this).apply {
      setBackgroundColor(Color.parseColor("#080808"))
      // Attach ReactRootView here for the real ChatPanel when integrating React Native UI.
    }

    val label = TextView(this).apply {
      text = "GPT Overlay Panel"
      typeface = Typeface.MONOSPACE
      textSize = 18f
      setTextColor(Color.parseColor("#00FF88"))
      setPadding(32, 32, 32, 32)
    }
    panel.addView(label)

    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      900,
      overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
      android.graphics.PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.BOTTOM or Gravity.START
      x = 0
      y = 0
    }

    panelView = panel
    windowManager.addView(panel, params)
  }

  private fun removePanel() {
    panelView?.let {
      windowManager.removeView(it)
      panelView = null
    }
  }

  private fun overlayType(): Int {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }
  }

  private fun startForegroundIfNeeded() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    val channelId = "overlay-service"
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(
      NotificationChannel(channelId, "Overlay service", NotificationManager.IMPORTANCE_LOW)
    )

    val notification = Notification.Builder(this, channelId)
      .setContentTitle("GPT Overlay running")
      .setContentText("Floating assistant is active")
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .build()

    startForeground(1001, notification)
  }

  override fun onDestroy() {
    removePanel()
    bubbleView?.let {
      windowManager.removeView(it)
      bubbleView = null
    }
    super.onDestroy()
  }
}
