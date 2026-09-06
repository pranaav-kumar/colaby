package com.example.projectservice.dto;

public record UpdateProjectRequest(
        String name,
        String description,
        String githubRepoUrl,
        String techStack,
        String status
) {}
