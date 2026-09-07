package com.example.profileservice.client;

import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import com.example.profileservice.dto.UserInfo;

/**
 * Internal HTTP client that resolves a user UUID to their username/fullName
 * by calling userdetailsservice directly (not through the gateway).
 *
 * If the lookup fails (profile not yet created, service unavailable, etc.)
 * the method returns null gracefully — callers must handle null.
 */
@Component
public class UserLookupClient {

    private static final Logger log = LoggerFactory.getLogger(UserLookupClient.class);

    private final RestClient restClient;

    public UserLookupClient(
            @Value("${userdetailsservice.base-url}") String baseUrl) {
        this.restClient = RestClient.builder()
                .baseUrl(baseUrl)
                .build();
    }

    /**
     * Fetches UserInfo for the given userId.
     * Returns null if the profile does not exist or the call fails.
     */
    public UserInfo getUser(UUID userId) {
        if (userId == null) return null;
        try {
            return restClient.get()
                    .uri("/users/details/{id}", userId)
                    .retrieve()
                    .body(UserInfo.class);
        } catch (Exception e) {
            log.warn("Could not resolve username for userId={}: {}", userId, e.getMessage());
            return null;
        }
    }
}
