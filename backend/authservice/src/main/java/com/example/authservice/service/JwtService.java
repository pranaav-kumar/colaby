package com.example.authservice.service;

import java.util.Date;
import java.util.UUID;

import javax.crypto.SecretKey;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

import com.example.authservice.entity.User;

@Service
public class JwtService {

    @Value("${SECRETKEY}")
    private String key;

    private SecretKey getSigningKey(){
        return Keys.hmacShaKeyFor(key.getBytes());
    }

    public String generateAccessToken(User user){
        return Jwts.builder()
            .subject(user.getId().toString())
            .issuedAt(new Date())
            .expiration(new Date(System.currentTimeMillis()+(60*1000*15)))
            .signWith(getSigningKey())
            .compact();
    }
        
    public Boolean isValid(String token){
        try{
            extractUserId(token);
            return true;
        }
        catch(Exception e){
            return false;
        }
    }

    public UUID extractUserId(String token){
        String subject = Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload()
                .getSubject();
        return UUID.fromString(subject);
    }
}
