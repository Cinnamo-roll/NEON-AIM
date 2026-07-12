package com.neonaim.config;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Info;
import org.springframework.context.annotation.Configuration;

@Configuration
@OpenAPIDefinition(info = @Info(
		title = "NEON AIM API",
		version = "v1",
		description = "NEON AIM 训练、用户、统计与 AI 分析接口"))
public class OpenApiConfiguration {
}
