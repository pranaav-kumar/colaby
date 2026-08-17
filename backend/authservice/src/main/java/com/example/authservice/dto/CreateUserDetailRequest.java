package com.example.authservice.dto;

import java.util.UUID;

public record CreateUserDetailRequest(
    UUID userId
) {}
