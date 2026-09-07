package com.example.profileservice.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.profileservice.client.UserLookupClient;
import com.example.profileservice.dto.FriendRequestResponse;
import com.example.profileservice.dto.FriendSummary;
import com.example.profileservice.dto.UserInfo;
import com.example.profileservice.entity.FriendRequest;
import com.example.profileservice.entity.Friendship;
import com.example.profileservice.exception.FriendRequestException;
import com.example.profileservice.exception.ResourceNotFoundException;
import com.example.profileservice.repository.FriendRequestRepository;
import com.example.profileservice.repository.FriendshipRepository;

@Service
public class FriendService {

    private final FriendRequestRepository friendRequestRepository;
    private final FriendshipRepository friendshipRepository;
    private final UserLookupClient userLookupClient;

    public FriendService(
            FriendRequestRepository friendRequestRepository,
            FriendshipRepository friendshipRepository,
            UserLookupClient userLookupClient) {
        this.friendRequestRepository = friendRequestRepository;
        this.friendshipRepository = friendshipRepository;
        this.userLookupClient = userLookupClient;
    }

    // ─── Send a friend request ────────────────────────────────────────────────

    @Transactional
    public FriendRequestResponse sendRequest(UUID senderId, UUID receiverId) {
        if (senderId.equals(receiverId)) {
            throw new IllegalArgumentException("You cannot send a friend request to yourself.");
        }

        // Check for an existing request in either direction
        boolean alreadySent = friendRequestRepository
                .findBySenderIdAndReceiverId(senderId, receiverId).isPresent();
        boolean alreadyReceived = friendRequestRepository
                .findBySenderIdAndReceiverId(receiverId, senderId).isPresent();

        if (alreadySent || alreadyReceived) {
            throw new FriendRequestException("A friend request already exists between these users.");
        }

        // Check if they are already friends
        if (friendshipRepository.existsByUserIdAndFriendId(senderId, receiverId)) {
            throw new FriendRequestException("You are already friends with this user.");
        }

        FriendRequest request = new FriendRequest();
        request.setSenderId(senderId);
        request.setReceiverId(receiverId);
        request.setStatus("PENDING");
        request.setCreatedAt(Instant.now());

        FriendRequest saved = friendRequestRepository.save(request);
        return toResponse(saved);
    }

    // ─── Accept a friend request ──────────────────────────────────────────────

    @Transactional
    public FriendRequestResponse acceptRequest(UUID requestId, UUID currentUserId) {
        FriendRequest request = getRequestOrThrow(requestId);

        if (!request.getReceiverId().equals(currentUserId)) {
            throw new SecurityException("Only the receiver can accept this friend request.");
        }
        if (!"PENDING".equals(request.getStatus())) {
            throw new FriendRequestException(
                    "Friend request is already " + request.getStatus().toLowerCase() + ".");
        }

        Instant now = Instant.now();
        request.setStatus("ACCEPTED");
        request.setResolvedAt(now);
        friendRequestRepository.save(request);

        // Insert two symmetric Friendship rows so either user can list their friends easily
        friendshipRepository.save(new Friendship(null, request.getSenderId(), request.getReceiverId(), now));
        friendshipRepository.save(new Friendship(null, request.getReceiverId(), request.getSenderId(), now));

        return toResponse(request);
    }

    // ─── Reject a friend request ──────────────────────────────────────────────

    @Transactional
    public FriendRequestResponse rejectRequest(UUID requestId, UUID currentUserId) {
        FriendRequest request = getRequestOrThrow(requestId);

        if (!request.getReceiverId().equals(currentUserId)) {
            throw new SecurityException("Only the receiver can reject this friend request.");
        }
        if (!"PENDING".equals(request.getStatus())) {
            throw new FriendRequestException(
                    "Friend request is already " + request.getStatus().toLowerCase() + ".");
        }

        request.setStatus("REJECTED");
        request.setResolvedAt(Instant.now());
        friendRequestRepository.save(request);

        return toResponse(request);
    }

    // ─── List incoming pending requests ──────────────────────────────────────

    @Transactional(readOnly = true)
    public List<FriendRequestResponse> getIncomingRequests(UUID receiverId) {
        return friendRequestRepository
                .findAllByReceiverIdAndStatus(receiverId, "PENDING")
                .stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    // ─── List sent pending requests ───────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<FriendRequestResponse> getSentRequests(UUID senderId) {
        return friendRequestRepository
                .findAllBySenderIdAndStatus(senderId, "PENDING")
                .stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    // ─── List friends ─────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<FriendSummary> getFriends(UUID userId) {
        return friendshipRepository.findAllByUserId(userId)
                .stream()
                .map(f -> {
                    UserInfo info = userLookupClient.getUser(f.getFriendId());
                    return new FriendSummary(
                            f.getFriendId(),
                            info != null ? info.userName() : null,
                            info != null ? info.fullName() : null,
                            f.getSince()
                    );
                })
                .collect(Collectors.toList());
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private FriendRequest getRequestOrThrow(UUID requestId) {
        return friendRequestRepository.findById(requestId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Friend request not found: " + requestId));
    }

    private FriendRequestResponse toResponse(FriendRequest r) {
        UserInfo sender = userLookupClient.getUser(r.getSenderId());
        UserInfo receiver = userLookupClient.getUser(r.getReceiverId());
        return new FriendRequestResponse(
                r.getId(),
                r.getSenderId(),
                sender != null ? sender.userName() : null,
                sender != null ? sender.fullName() : null,
                r.getReceiverId(),
                receiver != null ? receiver.userName() : null,
                receiver != null ? receiver.fullName() : null,
                r.getStatus(),
                r.getCreatedAt(),
                r.getResolvedAt()
        );
    }
}
