package com.example.projectservice.service;

import java.time.Instant;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.projectservice.dto.DocResponse;
import com.example.projectservice.dto.UpsertDocRequest;
import com.example.projectservice.entity.Project;
import com.example.projectservice.entity.ProjectDoc;
import com.example.projectservice.repository.ProjectDocRepository;

@Service
public class DocService {

    private final ProjectDocRepository docRepository;
    private final ProjectService projectService;

    public DocService(ProjectDocRepository docRepository, ProjectService projectService) {
        this.docRepository = docRepository;
        this.projectService = projectService;
    }

    /**
     * Creator creates or fully replaces the project documentation.
     */
    @Transactional
    public DocResponse upsertDoc(UUID projectId, UUID creatorId, UpsertDocRequest request) {
        Project project = projectService.findProjectOrThrow(projectId);
        projectService.requireCreator(project, creatorId);

        ProjectDoc doc = docRepository.findByProjectId(projectId)
                .orElseGet(() -> {
                    ProjectDoc d = new ProjectDoc();
                    d.setProjectId(projectId);
                    return d;
                });

        doc.setContent(request.content());
        doc.setLastEditedBy(creatorId);
        doc.setUpdatedAt(Instant.now());

        return toResponse(docRepository.save(doc));
    }

    /**
     * Any project member can view the documentation.
     */
    @Transactional(readOnly = true)
    public DocResponse getDoc(UUID projectId, UUID requesterId) {
        projectService.findProjectOrThrow(projectId);
        projectService.requireMember(projectId, requesterId);

        ProjectDoc doc = docRepository.findByProjectId(projectId)
                .orElseGet(() -> {
                    // Return an empty doc shell if no documentation has been written yet
                    ProjectDoc empty = new ProjectDoc();
                    empty.setProjectId(projectId);
                    empty.setContent("");
                    return empty;
                });

        return toResponse(doc);
    }

    // ---- Private helpers ----

    private DocResponse toResponse(ProjectDoc doc) {
        return new DocResponse(
                doc.getId(),
                doc.getProjectId(),
                doc.getContent(),
                doc.getLastEditedBy(),
                doc.getUpdatedAt()
        );
    }
}
