# JSch instantiates signature/cipher/KEX implementations via Class.forName from config strings.
-keep class com.jcraft.jsch.** { *; }
# Bouncy Castle's lightweight API backs JSch's Ed25519 on Android (no JCE EdEC on-device).
-keep class org.bouncycastle.** { *; }
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod
