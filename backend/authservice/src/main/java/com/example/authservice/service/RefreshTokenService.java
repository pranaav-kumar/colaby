package com.example.authservice.service;

import com.example.authservice.repository.RefreshTokenRepository;

import org.springframework.transaction.annotation.Transactional;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.example.authservice.entity.RefreshToken;

@Service
public class RefreshTokenService {

    private final RefreshTokenRepository refreshTokenRepository;

    private final SecureRandom secureRandom = new SecureRandom();

    @Value("${REFRESH_TOKEN_EXPIRY}")
    private Long expiry;

    public RefreshTokenService(RefreshTokenRepository refreshTokenRepository) {
        this.refreshTokenRepository = refreshTokenRepository;
    }

    public String createRefreshToken(UUID userId){
        RefreshToken refreshToken = new RefreshToken();

        String token = generateRandomToken();

        refreshToken.setUserId(userId);
        refreshToken.setExpiryDate(Instant.now().plusMillis(expiry));
        refreshToken.setToken(token);

        refreshTokenRepository.save(refreshToken);
        return token;
    }

    public boolean isValid(String token){
        Optional<RefreshToken> stored = refreshTokenRepository.findByToken(token);
        if(stored.isEmpty()) return false;

        return !Instant.now().isAfter(stored.get().getExpiryDate());
    }

    @Transactional
    public void deleteToken(String token){
        refreshTokenRepository.deleteByToken(token);
    }

    public UUID getUserIdFromToken(String token) {
        return refreshTokenRepository.findByToken(token)
                .map(RefreshToken::getUserId)
                .orElseThrow(() -> new RuntimeException("Refresh token not found"));
    }

    @Transactional
    public void deleteTokensByUserId(UUID userId){
        refreshTokenRepository.deleteByUserId(userId);
    }

    private String generateRandomToken() {
        byte[] randomBytes = new byte[64];
        secureRandom.nextBytes(randomBytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(randomBytes);
    }
}
