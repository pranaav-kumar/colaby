package com.example.userdetailsservice.entity;

import java.time.Instant;
import java.util.List;

import jakarta.persistence.Entity;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@AllArgsConstructor
@NoArgsConstructor
@Data
public class UserDetail {
    private Long userId;
    private String fullName;
    private String userName;
    private int exp;
    private String profileUrl;
    private String email;
    private String bio;
    private String githubUrl;
    private List<String> skills;
    private String linkedinUrl;
    private String portfolioUrl;
    private Boolean openToCollaborate;
    private Instant createdAt;
    private Instant updatedAt;
}
