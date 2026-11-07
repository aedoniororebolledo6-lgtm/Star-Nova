plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val runNumber = (System.getenv("GITHUB_RUN_NUMBER") ?: "0").toInt()
// Minutos desde 1970: siempre crece, así cada compilación se instala encima de la anterior.
val buildMinutes = (System.currentTimeMillis() / 60000L).toInt()

android {
    namespace = "com.nioro.starnova"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.nioro.starnova"
        minSdk = 26
        targetSdk = 36
        versionCode = buildMinutes
        versionName = "0.1.$runNumber"
        buildConfigField("int", "BUILD", runNumber.toString())
    }

    signingConfigs {
        // La llave NUNCA va en el repositorio (es público). En CI la entrega build.yml por variables de entorno:
        // desde los "Secrets" de GitHub si existen, o desde la caché privada del repositorio.
        val ks = System.getenv("STARNOVA_KEYSTORE")
        if (ks != null && file(ks).exists()) {
            create("release") {
                storeFile = file(ks)
                storePassword = System.getenv("STARNOVA_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("STARNOVA_KEY_ALIAS") ?: "starnova"
                keyPassword = System.getenv("STARNOVA_KEYSTORE_PASSWORD")
            }
        }
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // sin llave (compilación local) se firma con la llave de depuración
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}
