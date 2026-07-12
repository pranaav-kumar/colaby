package com.example.authservice.controller;

import com.example.authservice.service.JwtService;
import com.example.authservice.service.RefreshTokenService;
import com.example.authservice.service.UserService;

import jakarta.validation.Valid;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.authservice.dto.AuthResponse;
import com.example.authservice.dto.RefreshRequest;
import com.example.authservice.entity.User;
import com.example.authservice.service.AuthenticationService;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@RestController
@RequestMapping("/auth")
public class UserController {

    private final JwtService jwtService;
    private final UserService userService;
    private final RefreshTokenService refreshTokenService;
    private final AuthenticationService authService;

    public UserController(AuthenticationService authService, RefreshTokenService refreshTokenService, UserService userService, JwtService jwtService) {
        this.authService = authService;
        this.refreshTokenService = refreshTokenService;
        this.userService = userService;
        this.jwtService = jwtService;
    }

    @PostMapping("/signup")
    public AuthResponse signup(@Valid @RequestBody User user) {
        return authService.signup(user);
    }

    @PostMapping("/login")
    public AuthResponse login(@RequestBody User user) {
        return authService.login(user);
    }

    @PostMapping("/refresh")
    public AuthResponse refresh(@RequestBody RefreshRequest request) {
        String refreshToken = request.refreshToken();

        if (!refreshTokenService.isValid(refreshToken)) {
            throw new RuntimeException("invalid or expired refresh token");
        }

        String email = refreshTokenService.getEmailFromToken(refreshToken);

        User user = userService.getUserByEmail(email)
                .orElseThrow(() -> new RuntimeException("user no longer exists"));

        String accessToken = jwtService.generateAccessToken(user);
        return new AuthResponse(accessToken, refreshToken);
    }


    @PostMapping("/logout")
    public String logout(@RequestBody RefreshRequest request) {
        refreshTokenService.deleteToken(request.refreshToken());
        return "logged out";
}
    
}