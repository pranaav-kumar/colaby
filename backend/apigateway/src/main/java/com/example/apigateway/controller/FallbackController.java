package com.example.apigateway.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class FallbackController {

    @GetMapping("/fallback/auth")
    public ResponseEntity<String> authFallback() {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body("Auth service is temporarily unavailable. Please try again shortly.");
    }

    @GetMapping("/fallback/users")
    public ResponseEntity<String> userDetailsFallback() {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body("User details service is temporarily unavailable. Please try again shortly.");
    }

    @GetMapping("/fallback/profiles")
    public ResponseEntity<String> profileFallback() {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body("Profile service is temporarily unavailable. Please try again shortly.");
    }
}