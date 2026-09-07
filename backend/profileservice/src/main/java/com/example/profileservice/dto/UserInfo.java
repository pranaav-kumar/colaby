package com.example.profileservice.dto;

import java.util.UUID;

/**
 * Minimal user info resolved from userdetailsservice.
 * Used to enrich responses with human-readable identifiers.
 */
public record UserInfo(
    UUID userId,
    String userName,
    String fullName
) {}
