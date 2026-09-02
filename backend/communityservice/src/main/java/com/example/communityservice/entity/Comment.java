package com.example.communityservice.entity;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "comments")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Comment {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID postId;

    @Column(nullable = false)
    private UUID authorId;

    /**
     * Null for top-level comments; set to a comment UUID for nested replies.
     */
    private UUID parentCommentId;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String body;

    @Column(nullable = false)
    private int upvotes = 0;

    @Column(nullable = false)
    private int downvotes = 0;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;
}
