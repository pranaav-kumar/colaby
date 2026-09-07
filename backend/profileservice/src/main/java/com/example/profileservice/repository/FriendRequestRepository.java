package com.example.profileservice.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.example.profileservice.entity.FriendRequest;

public interface FriendRequestRepository extends JpaRepository<FriendRequest, UUID> {

    /** Find a specific request between sender and receiver (any status) */
    Optional<FriendRequest> findBySenderIdAndReceiverId(UUID senderId, UUID receiverId);

    /** All pending requests aimed at this user (to show in their inbox) */
    List<FriendRequest> findAllByReceiverIdAndStatus(UUID receiverId, String status);

    /** All pending requests this user has sent out */
    List<FriendRequest> findAllBySenderIdAndStatus(UUID senderId, String status);
}
