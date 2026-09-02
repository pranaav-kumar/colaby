package com.example.communityservice.entity;

import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "community_members")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class CommunityMember {

    @EmbeddedId
    private CommunityMemberId id;

    @Column(nullable = false, updatable = false)
    private Instant joinedAt;

    @Embeddable
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CommunityMemberId implements Serializable {
        private UUID userId;
        private UUID communityId;
    }
}
