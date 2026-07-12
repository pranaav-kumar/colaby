package com.example.authservice.service;

import com.example.authservice.repository.RefreshTokenRepository;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.example.authservice.entity.RefreshToken;

@Service
public class RefreshTokenService {

    private final RefreshTokenRepository refreshTokenRepository;

    private final SecureRandom secureRandom = new SecureRandom();

    @Value("${REFRESH_TOKEN_EXPIRY}")
    private Long expiry;

    RefreshTokenService(RefreshTokenRepository refreshTokenRepository) {
        this.refreshTokenRepository = refreshTokenRepository;
    }

    public String createRefreshToken(String email){
        RefreshToken refreshToken = new RefreshToken();

        String token = generateRandomToken();

        refreshToken.setEmail(email);
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

    public void deleteToken(String token){
        refreshTokenRepository.deleteByToken(token);
    }

    public String getEmailFromToken(String token) {
        return refreshTokenRepository.findByToken(token)
                .map(RefreshToken::getEmail)
                .orElseThrow(() -> new RuntimeException("Refresh token not found"));
    }
    private String generateRandomToken() {
        byte[] randomBytes = new byte[64];
        secureRandom.nextBytes(randomBytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(randomBytes);
    }
}
