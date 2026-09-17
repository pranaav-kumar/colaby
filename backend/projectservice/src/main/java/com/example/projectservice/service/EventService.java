package com.example.projectservice.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.projectservice.client.UserLookupClient;
import com.example.projectservice.dto.CreateEventRequest;
import com.example.projectservice.dto.EventResponse;
import com.example.projectservice.dto.UserInfo;
import com.example.projectservice.entity.ProjectEvent;
import com.example.projectservice.exception.ForbiddenException;
import com.example.projectservice.exception.ResourceNotFoundException;
import com.example.projectservice.repository.ProjectEventRepository;

@Service
public class EventService {

    private final ProjectEventRepository eventRepository;
    private final ProjectService projectService;
    private final UserLookupClient userLookupClient;

    public EventService(ProjectEventRepository eventRepository,
                        ProjectService projectService,
                        UserLookupClient userLookupClient) {
        this.eventRepository = eventRepository;
        this.projectService = projectService;
        this.userLookupClient = userLookupClient;
    }

    /**
     * Creator schedules a new event for the project.
     */
    @Transactional
    public EventResponse createEvent(UUID projectId, UUID creatorId, CreateEventRequest request) {
        var project = projectService.findProjectOrThrow(projectId);
        projectService.requireCreator(project, creatorId);

        if (request.endTime().isBefore(request.startTime())) {
            throw new IllegalArgumentException("End time must be after start time");
        }

        if ("SPECIFIC".equals(request.visibility())) {
            if (request.participantIds() == null || request.participantIds().isEmpty()) {
                throw new IllegalArgumentException("At least one participant is required for SPECIFIC visibility");
            }
            // Validate each participant is a project member
            for (UUID pid : request.participantIds()) {
                projectService.requireMember(projectId, pid);
            }
        }

        String participantStr = null;
        if ("SPECIFIC".equals(request.visibility()) && request.participantIds() != null) {
            participantStr = request.participantIds().stream()
                    .map(UUID::toString)
                    .collect(Collectors.joining(","));
        }

        ProjectEvent event = new ProjectEvent();
        event.setProjectId(projectId);
        event.setCreatedBy(creatorId);
        event.setTitle(request.title().trim());
        event.setDescription(request.description());
        event.setStartTime(request.startTime());
        event.setEndTime(request.endTime());
        event.setVisibility(request.visibility());
        event.setParticipantIds(participantStr);
        event.setCreatedAt(Instant.now());

        return toResponse(eventRepository.save(event));
    }

    /**
     * Returns events visible to the requesting user.
     * Creator sees all events; members see ALL-visibility events plus
     * SPECIFIC events where they are listed as a participant.
     */
    @Transactional(readOnly = true)
    public List<EventResponse> getEventsForUser(UUID projectId, UUID userId) {
        var project = projectService.findProjectOrThrow(projectId);
        projectService.requireMember(projectId, userId);

        boolean isCreator = project.getCreatedBy().equals(userId);
        List<ProjectEvent> all = eventRepository.findByProjectId(projectId);

        return all.stream()
                .filter(e -> isCreator || isVisibleTo(e, userId))
                .map(this::toResponse)
                .toList();
    }

    /**
     * Creator deletes an event.
     */
    @Transactional
    public void deleteEvent(UUID projectId, UUID eventId, UUID creatorId) {
        var project = projectService.findProjectOrThrow(projectId);
        projectService.requireCreator(project, creatorId);

        ProjectEvent event = eventRepository.findById(eventId)
                .orElseThrow(() -> new ResourceNotFoundException("Event not found: " + eventId));
        if (!event.getProjectId().equals(projectId)) {
            throw new ResourceNotFoundException("Event not found in this project");
        }
        eventRepository.delete(event);
    }

    // ---- Private helpers ----

    private boolean isVisibleTo(ProjectEvent event, UUID userId) {
        if ("ALL".equals(event.getVisibility())) return true;
        if (event.getParticipantIds() == null || event.getParticipantIds().isBlank()) return false;
        return Arrays.stream(event.getParticipantIds().split(","))
                .map(String::trim)
                .anyMatch(pid -> pid.equalsIgnoreCase(userId.toString()));
    }

    private List<UUID> parseParticipantIds(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        return Arrays.stream(raw.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(UUID::fromString)
                .collect(Collectors.toList());
    }

    private EventResponse toResponse(ProjectEvent event) {
        UserInfo creator = userLookupClient.getUser(event.getCreatedBy());
        List<UUID> pids = parseParticipantIds(event.getParticipantIds());

        List<String> participantNames = new ArrayList<>();
        for (UUID pid : pids) {
            UserInfo info = userLookupClient.getUser(pid);
            if (info != null) {
                String name = info.fullName() != null ? info.fullName() : info.userName();
                participantNames.add(name != null ? name : pid.toString().substring(0, 8) + "...");
            } else {
                participantNames.add(pid.toString().substring(0, 8) + "...");
            }
        }

        return new EventResponse(
                event.getId(),
                event.getProjectId(),
                event.getCreatedBy(),
                creator != null ? creator.userName() : null,
                creator != null ? creator.fullName() : null,
                event.getTitle(),
                event.getDescription(),
                event.getStartTime(),
                event.getEndTime(),
                event.getVisibility(),
                pids,
                participantNames,
                event.getCreatedAt()
        );
    }
}
