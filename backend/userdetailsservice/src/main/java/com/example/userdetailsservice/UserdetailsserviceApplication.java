package com.example.userdetailsservice;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

@SpringBootApplication
@EnableDiscoveryClient
public class UserdetailsserviceApplication {

	public static void main(String[] args) {
		SpringApplication.run(UserdetailsserviceApplication.class, args);
	}

}
