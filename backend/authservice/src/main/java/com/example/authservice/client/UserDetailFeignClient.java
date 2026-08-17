package com.example.authservice.client;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

import com.example.authservice.dto.CreateUserDetailRequest;

@FeignClient(name = "userdetailsservice")
public interface UserDetailFeignClient {

    @PostMapping("/users/internal/createUser")
    void createUser(@RequestBody CreateUserDetailRequest request);
}
