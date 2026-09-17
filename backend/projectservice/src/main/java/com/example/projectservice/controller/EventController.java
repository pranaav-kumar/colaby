package com.example.projectservice.controller;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.projectservice.dto.CreateEventRequest;
import com.example.projectservice.dto.EventResponse;
import com.example.projectservice.service.EventService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/projects/{projectId}/events")
public class EventController {

    private final EventService eventService;

    public EventController(EventService eventService) {
        this.eventService = eventService;
    }

    /** Creator schedules a new event */
    @PostMapping
    public ResponseEntity<EventResponse> createEvent(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID projectId,
            @Valid @RequestBody CreateEventRequest request) {
        UUID creatorId = UUID.fromString(userIdHeader);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(eventService.createEvent(projectId, creatorId, request));
    }

    /** Any project member retrieves events visible to them */
    @GetMapping
    public List<EventResponse> getEvents(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID projectId) {
        return eventService.getEventsForUser(projectId, UUID.fromString(userIdHeader));
    }

    /** Creator deletes an event */
    @DeleteMapping("/{eventId}")
    public ResponseEntity<Void> deleteEvent(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID projectId,
            @PathVariable UUID eventId) {
        eventService.deleteEvent(projectId, eventId, UUID.fromString(userIdHeader));
        return ResponseEntity.noContent().build();
    }
}
