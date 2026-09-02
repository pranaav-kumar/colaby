package com.example.communityservice.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.example.communityservice.entity.Comment;

public interface CommentRepository extends JpaRepository<Comment, UUID> {

    /** All top-level comments for a post (no parent). */
    List<Comment> findByPostIdAndParentCommentIdIsNullOrderByCreatedAtAsc(UUID postId);

    /** All direct replies to a given comment. */
    List<Comment> findByParentCommentIdOrderByCreatedAtAsc(UUID parentCommentId);

    /** All comments for a post (for bulk deletion when a post is deleted). */
    List<Comment> findByPostId(UUID postId);
}
