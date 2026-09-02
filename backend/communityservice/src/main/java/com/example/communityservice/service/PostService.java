package com.example.communityservice.service;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.communityservice.dto.CreatePostRequest;
import com.example.communityservice.dto.PostResponse;
import com.example.communityservice.entity.Post;
import com.example.communityservice.entity.Vote;
import com.example.communityservice.entity.Vote.TargetType;
import com.example.communityservice.exception.ForbiddenException;
import com.example.communityservice.exception.ResourceNotFoundException;
import com.example.communityservice.repository.CommentRepository;
import com.example.communityservice.repository.CommunityMemberRepository;
import com.example.communityservice.repository.CommunityRepository;
import com.example.communityservice.repository.PostRepository;
import com.example.communityservice.repository.VoteRepository;

@Service
public class PostService {

    private final PostRepository postRepository;
    private final CommunityRepository communityRepository;
    private final CommunityMemberRepository communityMemberRepository;
    private final CommentRepository commentRepository;
    private final VoteRepository voteRepository;

    public PostService(PostRepository postRepository,
                       CommunityRepository communityRepository,
                       CommunityMemberRepository communityMemberRepository,
                       CommentRepository commentRepository,
                       VoteRepository voteRepository) {
        this.postRepository = postRepository;
        this.communityRepository = communityRepository;
        this.communityMemberRepository = communityMemberRepository;
        this.commentRepository = commentRepository;
        this.voteRepository = voteRepository;
    }

    @Transactional
    public PostResponse createPost(UUID communityId, UUID authorId, CreatePostRequest request) {
        if (!communityRepository.existsById(communityId)) {
            throw new ResourceNotFoundException("Community not found");
        }
        if (!communityMemberRepository.existsByIdUserIdAndIdCommunityId(authorId, communityId)) {
            throw new ForbiddenException("You must be a member of the community to post");
        }
        if (request.title() == null || request.title().isBlank()) {
            throw new IllegalArgumentException("Post title cannot be blank");
        }

        Post post = new Post();
        post.setCommunityId(communityId);
        post.setAuthorId(authorId);
        post.setTitle(request.title().trim());
        post.setBody(request.body());
        post.setUpvotes(0);
        post.setDownvotes(0);
        post.setCreatedAt(Instant.now());
        post.setUpdatedAt(Instant.now());

        post = postRepository.save(post);
        return toResponse(post, authorId);
    }

    @Transactional(readOnly = true)
    public PostResponse getPostById(UUID postId, UUID userId) {
        Post post = postRepository.findById(postId)
                .orElseThrow(() -> new ResourceNotFoundException("Post not found"));
        return toResponse(post, userId);
    }

    @Transactional(readOnly = true)
    public List<PostResponse> getPostsByCommunity(UUID communityId, UUID userId) {
        if (!communityRepository.existsById(communityId)) {
            throw new ResourceNotFoundException("Community not found");
        }
        return postRepository.findByCommunityIdOrderByCreatedAtDesc(communityId)
                .stream()
                .map(p -> toResponse(p, userId))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<PostResponse> getMyPosts(UUID authorId) {
        return postRepository.findByAuthorIdOrderByCreatedAtDesc(authorId)
                .stream()
                .map(p -> toResponse(p, authorId))
                .toList();
    }

    @Transactional
    public void deletePost(UUID postId, UUID userId) {
        Post post = postRepository.findById(postId)
                .orElseThrow(() -> new ResourceNotFoundException("Post not found"));
        if (!post.getAuthorId().equals(userId)) {
            throw new ForbiddenException("You can only delete your own posts");
        }
        // Delete associated comments and votes first
        commentRepository.deleteAll(commentRepository.findByPostId(postId));
        voteRepository.deleteAll(voteRepository.findByTargetIdAndTargetType(postId, TargetType.POST));
        postRepository.delete(post);
    }

    private PostResponse toResponse(Post post, UUID userId) {
        String communityName = communityRepository.findById(post.getCommunityId())
                .map(c -> c.getName())
                .orElse("Unknown");
        int commentCount = commentRepository.findByPostId(post.getId()).size();
        String userVote = getUserVote(userId, post.getId(), TargetType.POST);

        return new PostResponse(
                post.getId(),
                post.getCommunityId(),
                communityName,
                post.getAuthorId(),
                post.getTitle(),
                post.getBody(),
                post.getUpvotes(),
                post.getDownvotes(),
                commentCount,
                userVote,
                post.getCreatedAt(),
                post.getUpdatedAt()
        );
    }

    private String getUserVote(UUID userId, UUID targetId, TargetType targetType) {
        if (userId == null) return null;
        Optional<Vote> vote = voteRepository.findByUserIdAndTargetIdAndTargetType(userId, targetId, targetType);
        return vote.map(v -> v.getVoteType().name()).orElse(null);
    }
}
