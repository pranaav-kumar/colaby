package com.example.profileservice.entity;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(
    name = "friend_requests",
    uniqueConstraints = @UniqueConstraint(columnNames = {"sender_id", "receiver_id"})
)
@Data
@NoArgsConstructor
@AllArgsConstructor
public class FriendRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** The user who initiated the friend request */
    @Column(name = "sender_id", nullable = false)
    private UUID senderId;

    /** The user who received the friend request */
    @Column(name = "receiver_id", nullable = false)
    private UUID receiverId;

    /**
     * Lifecycle status:
     * PENDING   – request has been sent and not yet acted on
     * ACCEPTED  – receiver accepted the request
     * REJECTED  – receiver rejected the request
     */
    @Column(nullable = false)
    private String status;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    /** Set when the request is accepted or rejected */
    @Column
    private Instant resolvedAt;
}
