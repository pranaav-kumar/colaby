package com.example.projectservice.dto;

import java.util.UUID;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * Minimal user info resolved from userdetailsservice.
 * Used to enrich responses with human-readable identifiers.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record UserInfo(
    UUID userId,
    String userName,
    String fullName
) {}