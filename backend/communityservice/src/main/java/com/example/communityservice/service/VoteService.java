package com.example.communityservice.service;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.communityservice.dto.VoteRequest;
import com.example.communityservice.entity.Comment;
import com.example.communityservice.entity.Post;
import com.example.communityservice.entity.Vote;
import com.example.communityservice.entity.Vote.TargetType;
import com.example.communityservice.entity.Vote.VoteType;
import com.example.communityservice.exception.ResourceNotFoundException;
import com.example.communityservice.repository.CommentRepository;
import com.example.communityservice.repository.PostRepository;
import com.example.communityservice.repository.VoteRepository;

@Service
public class VoteService {

    private final VoteRepository voteRepository;
    private final PostRepository postRepository;
    private final CommentRepository commentRepository;

    public VoteService(VoteRepository voteRepository,
                       PostRepository postRepository,
                       CommentRepository commentRepository) {
        this.voteRepository = voteRepository;
        this.postRepository = postRepository;
        this.commentRepository = commentRepository;
    }

    /**
     * Votes on a post.
     * - If user hasn't voted: adds vote and increments counter.
     * - If user voted same: removes vote (toggle) and decrements counter.
     * - If user voted differently: changes vote and adjusts both counters.
     *
     * @return map with updated upvotes and downvotes
     */
    @Transactional
    public Map<String, Integer> voteOnPost(UUID postId, UUID userId, VoteRequest request) {
        Post post = postRepository.findById(postId)
                .orElseThrow(() -> new ResourceNotFoundException("Post not found"));

        Optional<Vote> existingVote = voteRepository.findByUserIdAndTargetIdAndTargetType(
                userId, postId, TargetType.POST);

        if (existingVote.isPresent()) {
            Vote vote = existingVote.get();
            if (vote.getVoteType() == request.voteType()) {
                // Toggle: remove vote
                removeVoteCountOnPost(post, vote.getVoteType(), -1);
                voteRepository.delete(vote);
            } else {
                // Switch vote
                removeVoteCountOnPost(post, vote.getVoteType(), -1);
                addVoteCountOnPost(post, request.voteType(), 1);
                vote.setVoteType(request.voteType());
                voteRepository.save(vote);
            }
        } else {
            // New vote
            addVoteCountOnPost(post, request.voteType(), 1);
            Vote vote = new Vote(null, userId, postId, TargetType.POST, request.voteType());
            voteRepository.save(vote);
        }

        post = postRepository.save(post);
        return Map.of("upvotes", post.getUpvotes(), "downvotes", post.getDownvotes());
    }

    /**
     * Votes on a comment. Same toggle/switch logic as posts.
     *
     * @return map with updated upvotes and downvotes
     */
    @Transactional
    public Map<String, Integer> voteOnComment(UUID commentId, UUID userId, VoteRequest request) {
        Comment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new ResourceNotFoundException("Comment not found"));

        Optional<Vote> existingVote = voteRepository.findByUserIdAndTargetIdAndTargetType(
                userId, commentId, TargetType.COMMENT);

        if (existingVote.isPresent()) {
            Vote vote = existingVote.get();
            if (vote.getVoteType() == request.voteType()) {
                removeVoteCountOnComment(comment, vote.getVoteType(), -1);
                voteRepository.delete(vote);
            } else {
                removeVoteCountOnComment(comment, vote.getVoteType(), -1);
                addVoteCountOnComment(comment, request.voteType(), 1);
                vote.setVoteType(request.voteType());
                voteRepository.save(vote);
            }
        } else {
            addVoteCountOnComment(comment, request.voteType(), 1);
            Vote vote = new Vote(null, userId, commentId, TargetType.COMMENT, request.voteType());
            voteRepository.save(vote);
        }

        comment = commentRepository.save(comment);
        return Map.of("upvotes", comment.getUpvotes(), "downvotes", comment.getDownvotes());
    }

    // --- Private helpers ---

    private void addVoteCountOnPost(Post post, VoteType type, int delta) {
        if (type == VoteType.UP) post.setUpvotes(post.getUpvotes() + delta);
        else post.setDownvotes(post.getDownvotes() + delta);
    }

    private void removeVoteCountOnPost(Post post, VoteType type, int delta) {
        addVoteCountOnPost(post, type, delta);
    }

    private void addVoteCountOnComment(Comment comment, VoteType type, int delta) {
        if (type == VoteType.UP) comment.setUpvotes(comment.getUpvotes() + delta);
        else comment.setDownvotes(comment.getDownvotes() + delta);
    }

    private void removeVoteCountOnComment(Comment comment, VoteType type, int delta) {
        addVoteCountOnComment(comment, type, delta);
    }
}
