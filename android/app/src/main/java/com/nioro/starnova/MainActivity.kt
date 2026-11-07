package com.nioro.starnova

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import java.io.ByteArrayInputStream
import java.io.IOException

/**
 * Star Nova para Android: una WebView que carga el juego desde los "assets" del APK.
 * Los archivos se sirven desde https://appassets.androidplatform.net/ (dominio reservado para esto),
 * así los módulos de JavaScript funcionan igual que en la web y el juego anda sin internet.
 */
class MainActivity : Activity() {
    private lateinit var web: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        web = WebView(this)
        web.setBackgroundColor(Color.parseColor("#F6C9B0"))
        setContentView(web)
        hideBars()
        WebView.setWebContentsDebuggingEnabled(true)
        val s = web.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.mediaPlaybackRequiresUserGesture = false
        s.allowFileAccess = false
        s.setSupportZoom(false)
        web.addJavascriptInterface(Bridge(), "StarNovaAndroid")
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, req: WebResourceRequest): WebResourceResponse? {
                val url = req.url
                if (url.host != HOST) return null
                var path = (url.path ?: "").trimStart('/')
                if (path.isEmpty()) path = "index.html"
                return try {
                    val mime = mimeOf(path)
                    val text = mime.startsWith("text") || mime.contains("javascript") || mime.contains("json") || mime.contains("svg")
                    WebResourceResponse(mime, if (text) "utf-8" else null, assets.open(path)).apply {
                        responseHeaders = mapOf("Cache-Control" to "no-cache", "Access-Control-Allow-Origin" to "*")
                    }
                } catch (e: IOException) {
                    WebResourceResponse("text/plain", "utf-8", 404, "No encontrado", emptyMap(), ByteArrayInputStream(ByteArray(0)))
                }
            }

            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                if (req.url.host == HOST) return false
                // enlaces externos (por ejemplo, descargar una actualización): abrir en el navegador
                try { startActivity(Intent(Intent.ACTION_VIEW, req.url)) } catch (e: Exception) { }
                return true
            }
        }
        val ir = intent?.getStringExtra("ir")
        web.loadUrl("https://$HOST/index.html" + (if (ir != null) "?$ir" else ""))
        if (Build.VERSION.SDK_INT >= 33) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                OnBackInvokedCallback { onBack() })
        }
    }

    private fun onBack() {
        web.evaluateJavascript("(window.__starnova && window.__starnova.game) ? window.__starnova.game.backButton() : 'salir'") { r ->
            if (r != null && r.contains("salir")) finish()
        }
    }

    @Deprecated("Solo para Android 12 o anterior")
    override fun onBackPressed() {
        onBack()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideBars()
    }

    override fun onPause() {
        super.onPause()
        web.evaluateJavascript("window.__starnova && window.__starnova.game && window.__starnova.game.pause(true)", null)
        web.onPause()
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
        hideBars()
    }

    private fun hideBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.let {
                it.hide(WindowInsets.Type.systemBars())
                it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN)
        }
    }

    /** Puente que el juego ve como window.StarNovaAndroid. */
    inner class Bridge {
        @JavascriptInterface fun build(): Int = BuildConfig.BUILD
        @JavascriptInterface fun version(): String = BuildConfig.VERSION_NAME
        @JavascriptInterface fun exit() { runOnUiThread { finish() } }
    }

    companion object {
        const val HOST = "appassets.androidplatform.net"

        fun mimeOf(path: String): String = when (path.substringAfterLast('.', "").lowercase()) {
            "html" -> "text/html"
            "js", "mjs" -> "text/javascript"
            "css" -> "text/css"
            "json" -> "application/json"
            "webmanifest" -> "application/manifest+json"
            "svg" -> "image/svg+xml"
            "png" -> "image/png"
            "jpg", "jpeg" -> "image/jpeg"
            "wasm" -> "application/wasm"
            "mp3" -> "audio/mpeg"
            "ogg" -> "audio/ogg"
            else -> "application/octet-stream"
        }
    }
}
