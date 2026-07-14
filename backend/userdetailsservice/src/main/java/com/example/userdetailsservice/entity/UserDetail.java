package com.example.userdetailsservice.entity;

import jakarta.persistence.Entity;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@AllArgsConstructor
@NoArgsConstructor
@Data
public class UserDetail {
    private String fullName;
    private String userName;
    private int exp;
    private String profileUrl;
    private String email;
    private String bio;
    private String githubUrl;
    
}
