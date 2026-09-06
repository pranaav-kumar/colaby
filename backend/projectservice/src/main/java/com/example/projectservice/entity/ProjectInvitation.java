package com.example.projectservice.entity;

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
@Table(name = "project_invitations")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ProjectInvitation {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID projectId;

    /** The user being invited or requesting to join */
    @Column(nullable = false)
    private UUID targetUserId;

    /** Creator userId (for INVITE) or the requesting user (for JOIN_REQUEST) */
    @Column(nullable = false)
    private UUID initiatedBy;

    /** INVITE | JOIN_REQUEST */
    @Column(nullable = false)
    private String type;

    /** PENDING | ACCEPTED | DECLINED */
    @Column(nullable = false)
    private String status;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Column
    private Instant resolvedAt;
}
