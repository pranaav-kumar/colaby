package com.example.authservice.service;

import com.example.authservice.client.UserDetailFeignClient;
import com.example.authservice.dto.AuthResponse;
import com.example.authservice.dto.CreateUserDetailRequest;
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
    private final UserDetailFeignClient userDetailFeignClient;

    public AuthenticationService(UserService userService,
                                 PasswordEncoder encoder,
                                 JwtService jwtService,
                                 RefreshTokenService refreshTokenService,
                                 UserDetailFeignClient userDetailFeignClient) {
        this.userService = userService;
        this.encoder = encoder;
        this.jwtService = jwtService;
        this.refreshTokenService = refreshTokenService;
        this.userDetailFeignClient = userDetailFeignClient;
    }

    public AuthResponse signup(SignupRequest request) {
        Optional<User> existingUser = userService.getUserByEmail(request.email());

        if (existingUser.isPresent()) {
            throw new RuntimeException("Email already exists");
        }

        User user = new User();
        user.setEmail(request.email());
        user.setPassword(request.password()); // still raw here — hashing happens inside saveUser()

        User savedUser = userService.saveUser(user);

        // Create user detail in userdetailsservice with the same UUID
        userDetailFeignClient.createUser(new CreateUserDetailRequest(savedUser.getId()));

        String accessToken = jwtService.generateAccessToken(savedUser);
        String refreshToken = refreshTokenService.createRefreshToken(savedUser.getId());
        return new AuthResponse(accessToken, refreshToken);
    }

    public AuthResponse login(LoginRequest request) {
        User dbUser = userService.getUserByEmail(request.email())
                .orElseThrow(() -> new RuntimeException("Invalid email or password"));

        if (!encoder.matches(request.password(), dbUser.getPassword())) {
            throw new RuntimeException("Invalid email or password");
        }

        String accessToken = jwtService.generateAccessToken(dbUser);
        // Delete old refresh tokens for this user to prevent accumulation
        refreshTokenService.deleteTokensByUserId(dbUser.getId());
        String refreshToken = refreshTokenService.createRefreshToken(dbUser.getId());
        return new AuthResponse(accessToken, refreshToken);
    }
}
