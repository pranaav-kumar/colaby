package com.example.projectservice.dto;

import java.util.UUID;

public record InternalProjectResponse(UUID projectId, String githubRepoUrl) {}
