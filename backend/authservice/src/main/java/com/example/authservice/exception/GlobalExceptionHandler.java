package com.example.authservice.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    // Duplicate email, invalid token, etc.
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleIllegalArgument(IllegalArgumentException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", ex.getMessage()));
    }

    // Validation errors (@Email, @Size) on request DTOs
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> handleValidation(MethodArgumentNotValidException ex) {
        String msg = ex.getBindingResult().getFieldErrors().stream()
                .map(fe -> fe.getField() + ": " + fe.getDefaultMessage())
                .findFirst()
                .orElse("Validation failed");
        return ResponseEntity.badRequest().body(Map.of("error", msg));
    }

    // Invalid credentials
    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<Map<String, String>> handleRuntime(RuntimeException ex) {
        // Don't leak internal error details — map specific messages to safe HTTP responses
        String msg = ex.getMessage();
        if (msg != null && msg.contains("Invalid email or password")) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", msg));
        }
        if (msg != null && msg.contains("invalid or expired refresh token")) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", msg));
        }
        // Generic fallback — don't expose internal stack traces
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", "An unexpected error occurred"));
    }
}
