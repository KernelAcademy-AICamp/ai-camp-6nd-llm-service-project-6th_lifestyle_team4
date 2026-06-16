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

# --- R8 full mode 방어 규칙 (AGP 9 / serialization 1.7.3 / supabase 3 / ktor 3) ---
# 직렬화에 필요한 제네릭·애너테이션 메타데이터 보존
-keepattributes RuntimeVisibleAnnotations,AnnotationDefault,Signature,InnerClasses,EnclosingMethod

# Supabase-kt 내부 직렬화 모델·세션 (로그인 세션 복원이 직렬화에 의존)
-keep,includedescriptorclasses class io.github.jan.supabase.**$$serializer { *; }
-keepclassmembers class io.github.jan.supabase.** {
    *** Companion;
    kotlinx.serialization.KSerializer serializer(...);
}

# Ktor: consumer 규칙에 포함되지만 선택적 의존성 경고 억제
-dontwarn io.ktor.**
-dontwarn org.slf4j.**
