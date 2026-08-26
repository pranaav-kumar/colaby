package com.example.userdetailsservice.entity;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonProperty;

import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@AllArgsConstructor
@NoArgsConstructor
@Data
public class UserDetail {
    @Id
    private UUID userId;
    private String fullName;
    private String userName;

    @JsonProperty(access = JsonProperty.Access.READ_ONLY)
    private Integer exp = 0;

    private String profileUrl;
    private String bio;
    private String githubUrl;
    @ElementCollection(fetch = FetchType.EAGER)
    private List<String> skills = new java.util.ArrayList<>();
    private String linkedinUrl;
    private String portfolioUrl;
    private Boolean openToCollaborate;

    @JsonProperty(access = JsonProperty.Access.READ_ONLY)
    private Instant createdAt;

    @JsonProperty(access = JsonProperty.Access.READ_ONLY)
    private Instant updatedAt;
}

