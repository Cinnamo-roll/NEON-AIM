# NEON AIM Backend

## 技术栈

- Java 21
- Spring Boot 4.1
- Spring Security / OAuth2 Resource Server
- Spring Data JPA
- PostgreSQL / Redis
- Flyway
- Spring Modulith
- Springdoc OpenAPI
- Actuator
- JUnit 5 / Testcontainers
- Gradle Kotlin DSL + Gradle Wrapper

## 常用命令

Windows：

```powershell
.\gradlew.bat bootRun
.\gradlew.bat test
.\gradlew.bat build
```

macOS / Linux：

```bash
./gradlew bootRun
./gradlew test
./gradlew build
```

默认使用 `local` Profile 和内存 H2。部署时设置 `SPRING_PROFILES_ACTIVE=prod`，并提供 `.env.example` 中的 PostgreSQL、Redis 和前端来源配置。

`ArchitectureTests` 会验证 Spring Modulith 模块依赖，避免业务增长后出现无约束的跨模块调用。
