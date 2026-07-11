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
            .subject(user.getEmail()) //subject just as the email for now as we have only one rle for not this isnt a problem, but when we have multip[le roles we should change this
            .issuedAt(new Date())
            .expiration(new Date(System.currentTimeMillis()+(60*1000*15)))
            .signWith(getSigningKey())
            .compact();
    }
        
    public Boolean isValid(String token){
        try{
            extractEmail(token);
            return true;
        }
        catch(Exception e){
            return false;
        }
    }

    public String extractEmail(String token){
        return Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload()
                .getSubject();
    }
}
