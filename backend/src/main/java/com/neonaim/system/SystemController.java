package com.neonaim.system;

import com.neonaim.common.api.ApiResponse;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class SystemController {

	@GetMapping("/health")
	Map<String, String> health() {
		return Map.of("status", "ok", "service", "neon-aim-backend");
	}

	@GetMapping("/v1/system/modules")
	ApiResponse<List<ModuleDescriptor>> modules() {
		return ApiResponse.success(List.of(
				new ModuleDescriptor("auth", "认证与权限", "planned"),
				new ModuleDescriptor("user", "用户与档案", "planned"),
				new ModuleDescriptor("training", "训练与成绩", "planned"),
				new ModuleDescriptor("analytics", "长期统计", "planned"),
				new ModuleDescriptor("leaderboard", "排行榜", "planned"),
				new ModuleDescriptor("achievement", "成就系统", "planned"),
				new ModuleDescriptor("task", "训练任务", "planned"),
				new ModuleDescriptor("ai", "AI 训练分析", "planned")),
				"功能仍在准备中");
	}

	public record ModuleDescriptor(String id, String name, String status) {
	}
}
