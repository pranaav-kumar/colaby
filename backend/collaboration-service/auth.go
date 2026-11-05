package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/base64"
	"encoding/json"
	"errors"
	"hash"
	"strings"
	"time"
)

func parseJWT(token, secret string) (map[string]any, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, errors.New("malformed token")
	}
	decode := base64.RawURLEncoding.DecodeString
	headBytes, e := decode(parts[0])
	if e != nil {
		return nil, e
	}
	var header map[string]any
	if json.Unmarshal(headBytes, &header) != nil {
		return nil, errors.New("invalid header")
	}
	var newHash func() hash.Hash
	switch header["alg"] {
	case "HS256":
		newHash = sha256.New
	case "HS384":
		newHash = sha512.New384
	case "HS512":
		newHash = sha512.New
	default:
		return nil, errors.New("unsupported algorithm")
	}
	mac := hmac.New(newHash, []byte(secret))
	_, _ = mac.Write([]byte(parts[0] + "." + parts[1]))
	sig, e := decode(parts[2])
	if e != nil || !hmac.Equal(sig, mac.Sum(nil)) {
		return nil, errors.New("invalid signature")
	}
	body, e := decode(parts[1])
	if e != nil {
		return nil, e
	}
	var claims map[string]any
	if json.Unmarshal(body, &claims) != nil {
		return nil, errors.New("invalid claims")
	}
	if exp, ok := claims["exp"].(float64); ok && float64(time.Now().Unix()) >= exp {
		return nil, errors.New("token expired")
	}
	if nbf, ok := claims["nbf"].(float64); ok && float64(time.Now().Unix()) < nbf {
		return nil, errors.New("token not active")
	}
	return claims, nil
}
func signTerminalToken(secret, userID, projectID string) string {
	enc := base64.RawURLEncoding.EncodeToString
	header := enc([]byte(`{"alg":"HS384","typ":"JWT"}`))
	claims, _ := json.Marshal(map[string]any{"userId": userID, "projectId": projectID, "scope": "terminal_access", "iat": time.Now().Unix(), "exp": time.Now().Add(24 * time.Hour).Unix()})
	body := enc(claims)
	data := header + "." + body
	mac := hmac.New(sha512.New384, []byte(secret))
	_, _ = mac.Write([]byte(data))
	return data + "." + enc(mac.Sum(nil))
}
