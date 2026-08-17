package com.example.userdetailsservice.entity;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
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
    private int exp;
    private String profileUrl;
    private String bio;
    private String githubUrl;
    @ElementCollection
    private List<String> skills;
    private String linkedinUrl;
    private String portfolioUrl;
    private Boolean openToCollaborate;
    private Instant createdAt;
    private Instant updatedAt;
}
