package com.example.communityservice.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.example.communityservice.entity.Community;

public interface CommunityRepository extends JpaRepository<Community, UUID> {

    Optional<Community> findByName(String name);

    boolean existsByName(String name);
}
