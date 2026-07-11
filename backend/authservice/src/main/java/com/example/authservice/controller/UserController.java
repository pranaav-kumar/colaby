package com.example.authservice.controller;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.authservice.entity.User;
import com.example.authservice.service.AuthenticationService;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@RestController
@RequestMapping("/auth")
public class UserController {

    private final AuthenticationService authService;

    public UserController(AuthenticationService authService) {
        this.authService = authService;
    }

    @PostMapping("/signup")
    public String signup(@RequestBody User user) {
        return authService.signup(user);
    }

    @PostMapping("/login")
    public String login(@RequestBody User user) {
        return authService.login(user);
    }
}