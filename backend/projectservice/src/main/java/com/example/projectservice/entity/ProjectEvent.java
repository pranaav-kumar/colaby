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
@Table(name = "project_events")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ProjectEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID projectId;

    @Column(nullable = false)
    private UUID createdBy;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(nullable = false)
    private Instant startTime;

    @Column(nullable = false)
    private Instant endTime;

    /** ALL | SPECIFIC */
    @Column(nullable = false)
    private String visibility;

    /**
     * Comma-separated UUIDs of participants when visibility=SPECIFIC.
     * Null when visibility=ALL.
     */
    @Column(columnDefinition = "TEXT")
    private String participantIds;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;
}
