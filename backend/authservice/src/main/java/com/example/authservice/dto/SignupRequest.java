package com.example.authservice.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;

public record SignupRequest(@Email String email, @Size(min = 8) String password) {}
