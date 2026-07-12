package com.example.authservice.service;

import com.example.authservice.dto.AuthResponse;
import com.example.authservice.dto.LoginRequest;
import com.example.authservice.dto.SignupRequest;

import org.springframework.stereotype.Service;

import java.util.Optional;

import org.springframework.security.crypto.password.PasswordEncoder;

import com.example.authservice.entity.User;

@Service
public class AuthenticationService {

    private final RefreshTokenService refreshTokenService;
    private final UserService userService;
    private final PasswordEncoder encoder;
    private final JwtService jwtService;

    public AuthenticationService(UserService userService,
                                 PasswordEncoder encoder,
                                 JwtService jwtService, RefreshTokenService refreshTokenService) {
        this.userService = userService;
        this.encoder = encoder;
        this.jwtService = jwtService;
        this.refreshTokenService = refreshTokenService;
    }

    public AuthResponse signup(SignupRequest request) {
        Optional<User> existingUser = userService.getUserByEmail(request.email());

        if (existingUser.isPresent()) {
            throw new RuntimeException("Email already exists");
        }

        User user = new User();
        user.setEmail(request.email());
        user.setPassword(request.password()); // still raw here — hashing happens inside saveUser()

        userService.saveUser(user);

        String accessToken = jwtService.generateAccessToken(user);
        String refreshToken = refreshTokenService.createRefreshToken(user.getEmail());
        return new AuthResponse(accessToken, refreshToken);
    }

    public AuthResponse login(LoginRequest request) {
        User dbUser = userService.getUserByEmail(request.email())
                .orElseThrow(() -> new RuntimeException("Invalid email or password"));

        if (!encoder.matches(request.password(), dbUser.getPassword())) {
            throw new RuntimeException("Invalid email or password");
        }

        String accessToken = jwtService.generateAccessToken(dbUser);
        String refreshToken = refreshTokenService.createRefreshToken(dbUser.getEmail());
        return new AuthResponse(accessToken, refreshToken);
    }
}
