package com.example.apigateway.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class FallbackController {

    @RequestMapping("/fallback/auth")
    public ResponseEntity<Map<String, String>> authFallback() {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of("error", "Auth service is temporarily unavailable. Please try again shortly."));
    }

    @RequestMapping("/fallback/users")
    public ResponseEntity<Map<String, String>> userDetailsFallback() {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of("error", "User details service is temporarily unavailable. Please try again shortly."));
    }

    @RequestMapping("/fallback/profiles")
    public ResponseEntity<Map<String, String>> profileFallback() {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of("error", "Profile service is temporarily unavailable. Please try again shortly."));
    }

    @RequestMapping("/fallback/communities")
    public ResponseEntity<Map<String, String>> communityFallback() {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of("error", "Community service is temporarily unavailable. Please try again shortly."));
    }

    @RequestMapping("/fallback/posts")
    public ResponseEntity<Map<String, String>> postsFallback() {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of("error", "Community service is temporarily unavailable. Please try again shortly."));
    }

    @RequestMapping("/fallback/comments")
    public ResponseEntity<Map<String, String>> commentsFallback() {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of("error", "Community service is temporarily unavailable. Please try again shortly."));
    }

    @RequestMapping("/fallback/votes")
    public ResponseEntity<Map<String, String>> votesFallback() {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of("error", "Community service is temporarily unavailable. Please try again shortly."));
    }

    @RequestMapping("/fallback/projects")
    public ResponseEntity<Map<String, String>> projectsFallback() {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of("error", "Project service is temporarily unavailable. Please try again shortly."));
    }
}