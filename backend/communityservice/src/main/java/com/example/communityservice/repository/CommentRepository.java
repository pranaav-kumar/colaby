package com.example.communityservice.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.example.communityservice.entity.Comment;

public interface CommentRepository extends JpaRepository<Comment, UUID> {

    /** Bounded comment tree for a post, ordered parent-before-child by creation time. */
    List<Comment> findTop1000ByPostIdOrderByCreatedAtAsc(UUID postId);

    /** Bounded direct replies used while deleting a comment tree. */
    List<Comment> findTop1001ByParentCommentIdOrderByCreatedAtAsc(UUID parentCommentId);

    long countByPostId(UUID postId);

    @Modifying
    @Query("delete from Comment c where c.postId = :postId")
    int deleteAllByPostId(@Param("postId") UUID postId);
}
