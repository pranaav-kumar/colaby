package com.example.userdetailsservice.dto;

import java.util.UUID;

public record CreateUserDetailRequest(
    UUID userId
) {}
