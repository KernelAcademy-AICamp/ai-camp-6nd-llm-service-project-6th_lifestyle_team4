# Keep kotlinx-serialization metadata
-keepclasseswithmembers class **$Companion {
    *** Companion;
}
-keepclasseswithmembers class * {
    @kotlinx.serialization.Serializable <fields>;
}
-keep,includedescriptorclasses class com.lifestyle.dailyscript.**$$serializer { *; }
-keepclassmembers class com.lifestyle.dailyscript.** {
    *** Companion;
    kotlinx.serialization.KSerializer serializer(...);
}
