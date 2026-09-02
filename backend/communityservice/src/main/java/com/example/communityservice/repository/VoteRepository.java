package com.example.communityservice.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.example.communityservice.entity.Vote;
import com.example.communityservice.entity.Vote.TargetType;

public interface VoteRepository extends JpaRepository<Vote, UUID> {

    Optional<Vote> findByUserIdAndTargetIdAndTargetType(UUID userId, UUID targetId, TargetType targetType);

    List<Vote> findByTargetIdAndTargetType(UUID targetId, TargetType targetType);
}
