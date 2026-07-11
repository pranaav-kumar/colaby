package com.example.authservice.service;

import org.springframework.stereotype.Service;

import java.util.Optional;

import org.springframework.security.crypto.password.PasswordEncoder;

import com.example.authservice.entity.User;

@Service
public class AuthenticationService {

    private final UserService userService;
    private final PasswordEncoder encoder;
    private final JwtService jwtService;

    public AuthenticationService(UserService userService,
                                 PasswordEncoder encoder,
                                 JwtService jwtService) {
        this.userService = userService;
        this.encoder = encoder;
        this.jwtService = jwtService;
    }

    public String signup(User user) {

        Optional<User> existingUser = userService.getUserByEmail(user.getEmail());

        if (existingUser.isPresent()) {
            throw new RuntimeException("Email already exists");
        }

        userService.saveUser(user);
        return jwtService.generateToken(user);
    }

    public String login(User user) {
        User dbUser = userService.getUserByEmail(user.getEmail())
                .orElseThrow(() -> new RuntimeException("Invalid email or password"));

        if (!encoder.matches(user.getPassword(), dbUser.getPassword())) {
            throw new RuntimeException("Invalid email or password");
        }

        return jwtService.generateToken(dbUser);
    }
}
