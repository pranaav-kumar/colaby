package com.example.authservice.service;

import java.util.Date;

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

    public String generateToken(User user){
        return Jwts.builder()
            .subject(user.getEmail())
            .issuedAt(new Date())
            .expiration(new Date(System.currentTimeMillis()+(60*1000*15)))
            .signWith(getSigningKey())
            .compact();
    }
}
