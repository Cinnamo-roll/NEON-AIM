package com.neonaim;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.annotation.EnableCaching;

@EnableCaching
@SpringBootApplication
public class NeonAimBackendApplication {

	public static void main(String[] args) {
		SpringApplication.run(NeonAimBackendApplication.class, args);
	}

}
