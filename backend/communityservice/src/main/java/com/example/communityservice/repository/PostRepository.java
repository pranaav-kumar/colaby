package com.example.communityservice.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.example.communityservice.entity.Post;

public interface PostRepository extends JpaRepository<Post, UUID> {

    List<Post> findByCommunityIdOrderByCreatedAtDesc(UUID communityId);

    List<Post> findByAuthorIdOrderByCreatedAtDesc(UUID authorId);
}
