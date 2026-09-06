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
@Table(name = "project_docs")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ProjectDoc {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** One documentation entry per project */
    @Column(nullable = false, unique = true)
    private UUID projectId;

    @Column(columnDefinition = "TEXT")
    private String content;

    /** Always the project creator — enforced in service layer */
    @Column(nullable = false)
    private UUID lastEditedBy;

    @Column(nullable = false)
    private Instant updatedAt;
}
