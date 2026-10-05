package com.example.communityservice.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.example.communityservice.entity.Post;

public interface PostRepository extends JpaRepository<Post, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Post p where p.id = :postId")
    Optional<Post> findByIdForUpdate(@Param("postId") UUID postId);

    List<Post> findByCommunityIdOrderByCreatedAtDesc(UUID communityId);

    List<Post> findByAuthorIdOrderByCreatedAtDesc(UUID authorId);
}
