import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { updateProject, extractProjectError } from '../../api/projectApi';

// Helper: Parse owner & repo from various GitHub URL formats
export function parseGitHubUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const cleaned = url.trim().replace(/\.git$/i, '');
  // Match https://github.com/owner/repo or github.com/owner/repo or owner/repo
  const match = cleaned.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+)/i)
    || cleaned.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (match) {
    return { owner: match[1], repo: match[2] };
  }
  return null;
}

// Preset badge colors for commit pills matching reference screenshot
const BADGE_PALETTES = [
  { bg: 'rgba(249, 115, 22, 0.22)', border: '#f97316', text: '#fdba74' }, // Orange
  { bg: 'rgba(6, 182, 212, 0.22)',  border: '#06b6d4', text: '#67e8f9' }, // Cyan
  { bg: 'rgba(234, 179, 8, 0.22)',  border: '#eab308', text: '#fde047' }, // Yellow
  { bg: 'rgba(168, 85, 247, 0.22)', border: '#a855f7', text: '#d8b4fe' }, // Purple
  { bg: 'rgba(16, 185, 129, 0.22)', border: '#10b981', text: '#6ee7b7' }, // Emerald
  { bg: 'rgba(236, 72, 153, 0.22)', border: '#ec4899', text: '#f472b6' }, // Pink
  { bg: 'rgba(59, 130, 246, 0.22)', border: '#3b82f6', text: '#93c5fd' }, // Blue
];

const CARD_WIDTH = 260;
const CARD_HEIGHT = 160;
const X_SPACING = 320;
const Y_SPACING = 210;

export default function VersionControlGraph({ project, onUpdateProject }) {
  const [githubUrl, setGithubUrl] = useState(project?.githubRepoUrl || '');
  const [parsedRepo, setParsedRepo] = useState(() => parseGitHubUrl(project?.githubRepoUrl));
  const [githubToken, setGithubToken] = useState(() => localStorage.getItem('colaby_gh_token') || '');
  const [showTokenModal, setShowTokenModal] = useState(false);

  // Connect prompt state
  const [connectUrlInput, setConnectUrlInput] = useState('');
  const [connectSaving, setConnectSaving] = useState(false);
  const [connectError, setConnectError] = useState('');

  // Fetch state
  const [commits, setCommits] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Pan & Zoom state
  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState({ x: 200, y: 80 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef(null);

  // Inspector state
  const [selectedCommit, setSelectedCommit] = useState(null);

  // Keep parsedRepo in sync if project prop changes
  useEffect(() => {
    if (project?.githubRepoUrl) {
      setGithubUrl(project.githubRepoUrl);
      setParsedRepo(parseGitHubUrl(project.githubRepoUrl));
    }
  }, [project?.githubRepoUrl]);

  // Fetch commits & branches from GitHub REST API
  const fetchRepoData = useCallback(async (owner, repo, token) => {
    if (!owner || !repo) return;
    setLoading(true);
    setFetchError('');
    try {
      const headers = {
        Accept: 'application/vnd.github.v3+json',
      };
      if (token && token.trim()) {
        headers.Authorization = `Bearer ${token.trim()}`;
      }

      // 1. Fetch branches
      let branchList = [];
      try {
        const branchRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=30`, { headers });
        if (branchRes.ok) {
          branchList = await branchRes.json();
          setBranches(branchList);
        }
      } catch (err) {
        console.warn('Could not fetch branches:', err);
      }

      // 2. Fetch commits
      const commitUrl = `https://api.github.com/repos/${owner}/${repo}/commits?per_page=60`;
      const res = await fetch(commitUrl, { headers });

      if (res.status === 404) {
        throw new Error(`Repository "${owner}/${repo}" not found or is private. If it is private, add a GitHub Personal Access Token.`);
      }
      if (res.status === 403) {
        const rateLimitRemaining = res.headers.get('x-ratelimit-remaining');
        if (rateLimitRemaining === '0') {
          throw new Error('GitHub API rate limit exceeded (60 req/hr unauthenticated). Please add a GitHub Personal Access Token to continue.');
        }
        throw new Error('Access forbidden to this repository. You may need a GitHub Personal Access Token.');
      }
      if (!res.ok) {
        throw new Error(`GitHub API error: HTTP ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      if (!Array.isArray(data)) {
        throw new Error('Unexpected response format from GitHub API');
      }

      // Match branch heads to commits
      const branchMap = {};
      branchList.forEach((b) => {
        if (b?.commit?.sha) {
          if (!branchMap[b.commit.sha]) branchMap[b.commit.sha] = [];
          branchMap[b.commit.sha].push(b.name);
        }
      });

      // Enhance commits with badge metadata
      const enriched = data.map((c, idx) => {
        const sha = c.sha;
        const shortSha = sha.slice(0, 7);
        const msg = c.commit?.message || 'No commit message';
        const [firstLine, ...rest] = msg.split('\n');
        const author = c.commit?.author?.name || c.author?.login || 'Unknown';
        const date = c.commit?.author?.date || '';
        const parents = (c.parents || []).map((p) => p.sha);
        const isMerge = parents.length > 1;
        const branchNames = branchMap[sha] || [];

        // Synthesize pills/tags for commit card (matching reference screenshot badges)
        const pills = [];
        if (branchNames.length > 0) {
          branchNames.forEach((bn) => pills.push({ text: bn, type: 'branch' }));
        } else if (idx === 0) {
          pills.push({ text: 'HEAD', type: 'head' });
        }
        pills.push({ text: shortSha, type: 'sha' });
        if (isMerge) {
          pills.push({ text: 'merge', type: 'merge' });
        }
        if (c.commit?.verification?.verified) {
          pills.push({ text: 'verified', type: 'verified' });
        }
        // Author pill
        const authorPill = author.length > 12 ? author.slice(0, 10) + '..' : author;
        pills.push({ text: authorPill, type: 'author' });

        return {
          sha,
          shortSha,
          title: firstLine,
          body: rest.join('\n').trim(),
          author,
          authorLogin: c.author?.login,
          avatarUrl: c.author?.avatar_url,
          date,
          parents,
          isMerge,
          branchNames,
          pills,
          htmlUrl: c.html_url,
        };
      });

      setCommits(enriched);
      if (enriched.length > 0) {
        // Center pan approximately
        setPan({ x: 220, y: 60 });
      }
    } catch (err) {
      setFetchError(err.message || 'Failed to fetch GitHub commits');
      setCommits([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch when parsedRepo or token changes
  useEffect(() => {
    if (parsedRepo?.owner && parsedRepo?.repo) {
      fetchRepoData(parsedRepo.owner, parsedRepo.repo, githubToken);
    }
  }, [parsedRepo, githubToken, fetchRepoData]);

  // Handle saving new GitHub URL to project
  async function handleSaveRepoUrl(e) {
    e.preventDefault();
    setConnectError('');
    const parsed = parseGitHubUrl(connectUrlInput);
    if (!parsed) {
      setConnectError('Please enter a valid GitHub repository URL (e.g., https://github.com/owner/repo or owner/repo).');
      return;
    }

    setConnectSaving(true);
    try {
      const normalizedUrl = `https://github.com/${parsed.owner}/${parsed.repo}`;
      const response = await updateProject(project.id || project.projectId, {
        name: project.name,
        githubRepoUrl: normalizedUrl,
      });

      if (onUpdateProject) {
        onUpdateProject(response.data);
      }
      setGithubUrl(normalizedUrl);
      setParsedRepo(parsed);
      setConnectUrlInput('');
    } catch (err) {
      setConnectError(extractProjectError(err) || 'Failed to update project GitHub URL');
    } finally {
      setConnectSaving(false);
    }
  }

  // Handle saving personal access token
  function handleSaveToken(token) {
    const trimmed = token.trim();
    setGithubToken(trimmed);
    if (trimmed) {
      localStorage.setItem('colaby_gh_token', trimmed);
    } else {
      localStorage.removeItem('colaby_gh_token');
    }
    setShowTokenModal(false);
    if (parsedRepo) {
      fetchRepoData(parsedRepo.owner, parsedRepo.repo, trimmed);
    }
  }

  // Filter commits by search or branch
  const filteredCommits = useMemo(() => {
    if (!searchQuery.trim()) return commits;
    const q = searchQuery.toLowerCase();
    return commits.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.author.toLowerCase().includes(q) ||
        c.sha.toLowerCase().includes(q)
    );
  }, [commits, searchQuery]);

  // DAG Layout Engine: Compute topological positions (X, Y) and curved edges
  const { nodes, edges, graphBounds } = useMemo(() => {
    if (filteredCommits.length === 0) {
      return { nodes: [], edges: [], graphBounds: { minX: 0, maxX: 800, minY: 0, maxY: 600 } };
    }

    // Map sha -> commit
    const commitMap = new Map();
    filteredCommits.forEach((c) => commitMap.set(c.sha, c));

    // Assign lane and row
    const nodePositions = new Map();
    const activeLanes = []; // array of current active branch tracks

    filteredCommits.forEach((commit, rowIndex) => {
      // Determine lane: check if this commit is a parent of an existing active lane
      let laneIndex = activeLanes.indexOf(commit.sha);
      if (laneIndex === -1) {
        // Find first empty lane or create new lane
        laneIndex = activeLanes.indexOf(null);
        if (laneIndex === -1) {
          laneIndex = activeLanes.length;
          activeLanes.push(commit.sha);
        } else {
          activeLanes[laneIndex] = commit.sha;
        }
      }

      // Position: top-to-bottom flow matching reference image
      // X is based on lane, Y is based on topological depth/rowIndex
      const x = laneIndex * X_SPACING + 60;
      const y = rowIndex * Y_SPACING + 40;

      nodePositions.set(commit.sha, {
        ...commit,
        x,
        y,
        lane: laneIndex,
        color: BADGE_PALETTES[laneIndex % BADGE_PALETTES.length],
      });

      // Update lanes for parent commits
      if (commit.parents && commit.parents.length > 0) {
        // Main parent takes over this lane
        activeLanes[laneIndex] = commit.parents[0];
        // Merge parents get new lanes if not already active
        for (let i = 1; i < commit.parents.length; i++) {
          const parentSha = commit.parents[i];
          if (!activeLanes.includes(parentSha)) {
            const emptyIndex = activeLanes.indexOf(null);
            if (emptyIndex === -1) {
              activeLanes.push(parentSha);
            } else {
              activeLanes[emptyIndex] = parentSha;
            }
          }
        }
      } else {
        // Root commit: free lane
        activeLanes[laneIndex] = null;
      }
    });

    const nodeList = Array.from(nodePositions.values());

    // Generate curved Bezier connection paths
    const edgeList = [];
    nodeList.forEach((sourceNode) => {
      (sourceNode.parents || []).forEach((parentSha) => {
        const targetNode = nodePositions.get(parentSha);
        if (targetNode) {
          // Source (child/newer commit) -> Target (parent/older commit)
          // Curves flow smoothly from bottom of child to top of parent
          const startX = sourceNode.x + CARD_WIDTH / 2;
          const startY = sourceNode.y + CARD_HEIGHT;
          const endX = targetNode.x + CARD_WIDTH / 2;
          const endY = targetNode.y;

          // Cubic Bezier curve control points
          const deltaY = endY - startY;
          const cp1X = startX;
          const cp1Y = startY + Math.max(deltaY * 0.45, 30);
          const cp2X = endX;
          const cp2Y = endY - Math.max(deltaY * 0.45, 30);

          const path = `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`;

          edgeList.push({
            id: `${sourceNode.sha}->${targetNode.sha}`,
            sourceSha: sourceNode.sha,
            targetSha: targetNode.sha,
            path,
            color: sourceNode.color.border,
            isMerge: sourceNode.isMerge,
          });
        }
      });
    });

    // Compute bounding box
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodeList.forEach((n) => {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x + CARD_WIDTH);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y + CARD_HEIGHT);
    });

    return {
      nodes: nodeList,
      edges: edgeList,
      graphBounds: {
        minX: minX === Infinity ? 0 : minX - 100,
        maxX: maxX === -Infinity ? 800 : maxX + 100,
        minY: minY === Infinity ? 0 : minY - 60,
        maxY: maxY === -Infinity ? 600 : maxY + 120,
      },
    };
  }, [filteredCommits]);

  // Pan interaction
  const handleMouseDown = (e) => {
    // Only drag on canvas background (button 0 = left click)
    if (e.button !== 0) return;
    if (e.target.closest('.vcs-node-card') || e.target.closest('.vcs-ui-overlay')) return;
    setIsPanning(true);
    panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e) => {
    if (!isPanning) return;
    setPan({
      x: e.clientX - panStartRef.current.x,
      y: e.clientY - panStartRef.current.y,
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Non-passive wheel handler: Pan graph vertically/horizontally on normal scroll, zoom on Ctrl+scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e) => {
      // If scrolling inside drawer or modal, let them scroll their content
      if (e.target.closest('.vcs-commit-drawer') || e.target.closest('.vcs-modal-card')) {
        return;
      }

      // Always block parent/page scrolling
      e.preventDefault();
      e.stopPropagation();

      if (e.ctrlKey || e.metaKey) {
        // Zoom on Ctrl+wheel or pinch gesture
        const zoomFactor = 1.08;
        const direction = e.deltaY < 0 ? 1 : -1;

        setZoom((prevZoom) => {
          let newZoom = direction > 0 ? prevZoom * zoomFactor : prevZoom / zoomFactor;
          newZoom = Math.min(Math.max(newZoom, 0.25), 2.5);

          const rect = container.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;
          const scaleChange = newZoom / prevZoom;

          setPan((prevPan) => ({
            x: mouseX - (mouseX - prevPan.x) * scaleChange,
            y: mouseY - (mouseY - prevPan.y) * scaleChange,
          }));

          return newZoom;
        });
      } else {
        // Normal scroll: smoothly pan the graph vertically & horizontally
        const deltaX = e.shiftKey ? e.deltaY : e.deltaX;
        const deltaY = e.shiftKey ? 0 : e.deltaY;

        setPan((prev) => ({
          x: prev.x - deltaX,
          y: prev.y - deltaY,
        }));
      }
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', onWheel);
    };
  }, []);

  // Zoom control buttons
  const handleZoomIn = () => setZoom((z) => Math.min(z * 1.2, 2.5));
  const handleZoomOut = () => setZoom((z) => Math.max(z / 1.2, 0.25));
  const handleFitToView = () => {
    if (!containerRef.current || nodes.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const graphWidth = graphBounds.maxX - graphBounds.minX;
    const graphHeight = graphBounds.maxY - graphBounds.minY;
    const scaleX = (rect.width - 120) / graphWidth;
    const scaleY = (rect.height - 120) / graphHeight;
    const targetZoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.3), 1.2);
    setZoom(targetZoom);
    setPan({
      x: (rect.width - graphWidth * targetZoom) / 2 - graphBounds.minX * targetZoom,
      y: (rect.height - graphHeight * targetZoom) / 2 - graphBounds.minY * targetZoom,
    });
  };
  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 200, y: 80 });
  };

  // Minimap viewport box computation
  const minimapDimensions = { width: 180, height: 120 };
  const minimapScale = useMemo(() => {
    const gw = Math.max(graphBounds.maxX - graphBounds.minX, 600);
    const gh = Math.max(graphBounds.maxY - graphBounds.minY, 400);
    return Math.min(minimapDimensions.width / gw, minimapDimensions.height / gh);
  }, [graphBounds]);

  const minimapViewport = useMemo(() => {
    if (!containerRef.current) return { x: 0, y: 0, w: 0, h: 0 };
    const cw = containerRef.current.clientWidth || 800;
    const ch = containerRef.current.clientHeight || 600;

    // Invert pan and zoom to graph coordinates
    const viewLeft = (-pan.x) / zoom;
    const viewTop = (-pan.y) / zoom;
    const viewWidth = cw / zoom;
    const viewHeight = ch / zoom;

    const x = (viewLeft - graphBounds.minX) * minimapScale;
    const y = (viewTop - graphBounds.minY) * minimapScale;
    const w = viewWidth * minimapScale;
    const h = viewHeight * minimapScale;

    return {
      x: Math.max(0, x),
      y: Math.max(0, y),
      w: Math.min(minimapDimensions.width, Math.max(16, w)),
      h: Math.min(minimapDimensions.height, Math.max(12, h)),
    };
  }, [pan, zoom, graphBounds, minimapScale]);

  // ─── IF NO GITHUB URL: Prompt Card View ──────────────────────────────────
  if (!parsedRepo) {
    return (
      <div className="vcs-connect-container">
        <div className="vcs-connect-card">
          <div className="vcs-connect-icon-wrapper">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="vcs-gh-icon">
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
            </svg>
          </div>

          <h2 className="vcs-connect-title">Connect GitHub Repository</h2>
          <p className="vcs-connect-subtitle">
            To view the interactive version control graph and explore branches, commits, and merges,
            please link a GitHub repository to this project.
          </p>

          {connectError && (
            <div className="message message-error vcs-connect-alert">{connectError}</div>
          )}

          <form onSubmit={handleSaveRepoUrl} className="vcs-connect-form">
            <div className="input-group">
              <label htmlFor="vcs-github-url" className="input-label">
                GitHub Repository URL or <code style={{ color: 'var(--color-primary, #6366f1)' }}>owner/repo</code>
              </label>
              <input
                id="vcs-github-url"
                type="text"
                className="input-field"
                placeholder="e.g. https://github.com/facebook/react or pranaav-kumar/colaby"
                value={connectUrlInput}
                onChange={(e) => setConnectUrlInput(e.target.value)}
                disabled={connectSaving}
                autoFocus
              />
            </div>

            <div className="vcs-connect-actions">
              <button
                type="submit"
                className="btn-primary"
                disabled={connectSaving || !connectUrlInput.trim()}
                id="vcs-connect-submit-btn"
              >
                {connectSaving ? (
                  <>
                    <span className="spinner" style={{ width: 16, height: 16, marginRight: 8 }} />
                    Connecting...
                  </>
                ) : (
                  'Connect Repository'
                )}
              </button>
            </div>
          </form>

          <div className="vcs-connect-hint">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: '-2px', marginRight: 6 }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            Public repositories work automatically. Private repositories can be unlocked using a GitHub Personal Access Token.
          </div>
        </div>
      </div>
    );
  }

  // ─── MAIN GRAPH VIEW ────────────────────────────────────────────────────
  return (
    <div className="vcs-workspace-container">
      {/* Top VCS Toolbar */}
      <header className="vcs-topbar vcs-ui-overlay">
        <div className="vcs-topbar-left">
          {/* Repo Link */}
          <a
            href={`https://github.com/${parsedRepo.owner}/${parsedRepo.repo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="vcs-repo-badge"
            title="Open repository in GitHub"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            <span className="vcs-repo-name">{parsedRepo.owner} / <strong>{parsedRepo.repo}</strong></span>
          </a>

          {/* Commit counter */}
          <span className="vcs-stat-pill">
            <span className="vcs-stat-dot" />
            {commits.length} {commits.length === 1 ? 'commit' : 'commits'}
          </span>
        </div>

        <div className="vcs-topbar-right">
          {/* Search filter */}
          <div className="vcs-search-box">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search commits or authors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="vcs-search-input"
            />
            {searchQuery && (
              <button className="vcs-clear-search-btn" onClick={() => setSearchQuery('')}>×</button>
            )}
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            className="vcs-btn-secondary"
            onClick={() => fetchRepoData(parsedRepo.owner, parsedRepo.repo, githubToken)}
            disabled={loading}
            title="Refresh commit graph"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loading ? 'vcs-spin' : ''}>
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>

          {/* GitHub Token Setup */}
          <button
            type="button"
            className="vcs-btn-secondary"
            onClick={() => setShowTokenModal(true)}
            title="Configure GitHub Personal Access Token"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>{githubToken ? 'Token Active' : 'Set Token'}</span>
          </button>

          {/* Change Repo */}
          <button
            type="button"
            className="vcs-btn-secondary"
            onClick={() => {
              setConnectUrlInput(githubUrl);
              setParsedRepo(null);
            }}
            title="Change linked GitHub repository"
          >
            <span>Change Repo</span>
          </button>
        </div>
      </header>

      {/* Main Pan/Zoom Canvas */}
      <div
        ref={containerRef}
        className={`vcs-canvas-viewport ${isPanning ? 'is-panning' : ''}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {/* Error or Loading Overlay */}
        {loading && commits.length === 0 && (
          <div className="vcs-loading-overlay">
            <div className="spinner" style={{ width: 32, height: 32 }} />
            <p>Fetching GitHub commit tree for {parsedRepo.owner}/{parsedRepo.repo}...</p>
          </div>
        )}

        {fetchError && (
          <div className="vcs-error-banner">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{fetchError}</span>
            <button className="vcs-error-dismiss-btn" onClick={() => setShowTokenModal(true)}>
              Configure Token
            </button>
          </div>
        )}

        {/* Transformed Stage */}
        <div
          className="vcs-stage"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
          {/* SVG Connection Layer */}
          <svg className="vcs-edges-svg">
            <defs>
              <linearGradient id="edgeGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#f97316" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.8" />
              </linearGradient>
            </defs>
            {edges.map((edge) => {
              const isHighlighted =
                selectedCommit &&
                (selectedCommit.sha === edge.sourceSha || selectedCommit.sha === edge.targetSha);
              return (
                <path
                  key={edge.id}
                  d={edge.path}
                  fill="none"
                  stroke={isHighlighted ? '#38bdf8' : edge.color}
                  strokeWidth={isHighlighted ? 3 : 2}
                  strokeOpacity={isHighlighted ? 1 : 0.65}
                  strokeDasharray={edge.isMerge ? '5,5' : 'none'}
                  className="vcs-edge-path"
                />
              );
            })}
          </svg>

          {/* Commit Nodes (matching user reference screenshot) */}
          <div className="vcs-nodes-layer">
            {nodes.map((node) => {
              const isSelected = selectedCommit?.sha === node.sha;
              return (
                <div
                  key={node.sha}
                  className={`vcs-node-card ${isSelected ? 'is-selected' : ''}`}
                  style={{
                    left: `${node.x}px`,
                    top: `${node.y}px`,
                    width: `${CARD_WIDTH}px`,
                    height: `${CARD_HEIGHT}px`,
                    borderColor: isSelected ? '#38bdf8' : node.color.border,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCommit(node);
                  }}
                >
                  {/* Top: Commit Title */}
                  <div className="vcs-node-header">
                    <h4 className="vcs-node-title" title={node.title}>
                      {node.title}
                    </h4>
                    <span className="vcs-node-author" title={`Author: ${node.author}`}>
                      {node.author}
                    </span>
                  </div>

                  {/* Middle: Colorful Badge Pills Grid */}
                  <div className="vcs-node-pills-grid">
                    {node.pills.map((pill, pIdx) => {
                      const palette = BADGE_PALETTES[pIdx % BADGE_PALETTES.length];
                      return (
                        <span
                          key={pIdx}
                          className="vcs-pill"
                          style={{
                            backgroundColor: palette.bg,
                            borderColor: palette.border,
                            color: palette.text,
                          }}
                        >
                          {pill.text}
                        </span>
                      );
                    })}
                  </div>

                  {/* Bottom: ISO timestamp */}
                  <div className="vcs-node-footer">
                    <span className="vcs-node-date">
                      {node.date ? node.date.replace('.000', '') : 'Recent'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Floating Bottom-Left Zoom Controls */}
      <div className="vcs-zoom-controls vcs-ui-overlay">
        <button
          type="button"
          className="vcs-zoom-btn"
          onClick={handleZoomIn}
          title="Zoom In (+)"
          id="vcs-zoom-in-btn"
        >
          +
        </button>
        <button
          type="button"
          className="vcs-zoom-btn"
          onClick={handleZoomOut}
          title="Zoom Out (-)"
          id="vcs-zoom-out-btn"
        >
          −
        </button>
        <button
          type="button"
          className="vcs-zoom-btn vcs-fit-btn"
          onClick={handleFitToView}
          title="Fit to screen"
        >
          Fit
        </button>
        <button
          type="button"
          className="vcs-zoom-btn vcs-reset-btn"
          onClick={handleResetZoom}
          title="Reset Zoom (100%)"
        >
          {Math.round(zoom * 100)}%
        </button>
      </div>

      {/* Floating Bottom-Right Minimap (Matching Reference Image) */}
      {nodes.length > 0 && (
        <div className="vcs-minimap-container vcs-ui-overlay">
          <div
            className="vcs-minimap-canvas"
            style={{ width: minimapDimensions.width, height: minimapDimensions.height }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const clickY = e.clientY - rect.top;
              // Center pan around clicked point
              if (containerRef.current) {
                const cw = containerRef.current.clientWidth;
                const ch = containerRef.current.clientHeight;
                const targetGraphX = graphBounds.minX + clickX / minimapScale;
                const targetGraphY = graphBounds.minY + clickY / minimapScale;
                setPan({
                  x: cw / 2 - targetGraphX * zoom,
                  y: ch / 2 - targetGraphY * zoom,
                });
              }
            }}
          >
            {/* Miniature nodes */}
            {nodes.map((n) => {
              const mx = (n.x - graphBounds.minX) * minimapScale;
              const my = (n.y - graphBounds.minY) * minimapScale;
              const mw = CARD_WIDTH * minimapScale;
              const mh = CARD_HEIGHT * minimapScale;
              return (
                <div
                  key={n.sha}
                  className="vcs-minimap-node"
                  style={{
                    left: `${mx}px`,
                    top: `${my}px`,
                    width: `${Math.max(mw, 4)}px`,
                    height: `${Math.max(mh, 3)}px`,
                    backgroundColor: n.color.border,
                  }}
                />
              );
            })}

            {/* Viewport Box */}
            <div
              className="vcs-minimap-viewport"
              style={{
                left: `${minimapViewport.x}px`,
                top: `${minimapViewport.y}px`,
                width: `${minimapViewport.w}px`,
                height: `${minimapViewport.h}px`,
              }}
            />
          </div>
          <div className="vcs-minimap-label">Minimap</div>
        </div>
      )}

      {/* Selected Commit Details Drawer */}
      {selectedCommit && (
        <aside className="vcs-commit-drawer vcs-ui-overlay">
          <div className="vcs-drawer-header">
            <h3 className="vcs-drawer-title">Commit Details</h3>
            <button
              className="vcs-drawer-close"
              onClick={() => setSelectedCommit(null)}
              title="Close drawer"
            >
              ×
            </button>
          </div>

          <div className="vcs-drawer-body">
            <div className="vcs-drawer-section">
              <label className="vcs-drawer-label">Message</label>
              <h4 className="vcs-drawer-commit-msg">{selectedCommit.title}</h4>
              {selectedCommit.body && (
                <pre className="vcs-drawer-commit-body">{selectedCommit.body}</pre>
              )}
            </div>

            <div className="vcs-drawer-section">
              <label className="vcs-drawer-label">Author</label>
              <div className="vcs-drawer-author-row">
                {selectedCommit.avatarUrl && (
                  <img
                    src={selectedCommit.avatarUrl}
                    alt={selectedCommit.author}
                    className="vcs-drawer-avatar"
                  />
                )}
                <div>
                  <div className="vcs-drawer-author-name">{selectedCommit.author}</div>
                  {selectedCommit.authorLogin && (
                    <div className="vcs-drawer-author-login">@{selectedCommit.authorLogin}</div>
                  )}
                </div>
              </div>
            </div>

            <div className="vcs-drawer-section">
              <label className="vcs-drawer-label">Date</label>
              <div className="vcs-drawer-val">
                {new Date(selectedCommit.date).toLocaleString()}
              </div>
            </div>

            <div className="vcs-drawer-section">
              <label className="vcs-drawer-label">SHA</label>
              <div className="vcs-drawer-sha-row">
                <code>{selectedCommit.sha}</code>
                <button
                  type="button"
                  className="vcs-copy-btn"
                  onClick={() => navigator.clipboard.writeText(selectedCommit.sha)}
                  title="Copy SHA"
                >
                  Copy
                </button>
              </div>
            </div>

            {selectedCommit.parents && selectedCommit.parents.length > 0 && (
              <div className="vcs-drawer-section">
                <label className="vcs-drawer-label">Parent Commits</label>
                <div className="vcs-drawer-parents">
                  {selectedCommit.parents.map((pSha) => (
                    <button
                      key={pSha}
                      className="vcs-parent-link"
                      onClick={() => {
                        const target = nodes.find((n) => n.sha === pSha);
                        if (target) {
                          setSelectedCommit(target);
                          if (containerRef.current) {
                            const cw = containerRef.current.clientWidth;
                            const ch = containerRef.current.clientHeight;
                            setPan({
                              x: cw / 2 - (target.x + CARD_WIDTH / 2) * zoom,
                              y: ch / 2 - (target.y + CARD_HEIGHT / 2) * zoom,
                            });
                          }
                        }
                      }}
                    >
                      {pSha.slice(0, 7)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="vcs-drawer-actions">
              <a
                href={selectedCommit.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary"
                style={{ textAlign: 'center', textDecoration: 'none' }}
              >
                View on GitHub ↗
              </a>
            </div>
          </div>
        </aside>
      )}

      {/* GitHub Token Modal */}
      {showTokenModal && (
        <div className="vcs-modal-backdrop" onClick={() => setShowTokenModal(false)}>
          <div className="vcs-modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="vcs-modal-title">GitHub Personal Access Token</h3>
            <p className="vcs-modal-desc">
              GitHub allows 60 free API calls/hr per IP. If you exceed the rate limit or are viewing
              a private repository, supply a Personal Access Token (classic with <code>repo</code> read scope, or fine-grained).
              It is stored only in your browser&apos;s local storage.
            </p>

            <div className="input-group">
              <label htmlFor="gh-token-input" className="input-label">Personal Access Token (optional)</label>
              <input
                id="gh-token-input"
                type="password"
                className="input-field"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                defaultValue={githubToken}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveToken(e.target.value);
                  }
                }}
              />
            </div>

            <div className="vcs-modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleSaveToken('')}
              >
                Clear Token
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={(e) => {
                  const input = e.target.closest('.vcs-modal-card').querySelector('#gh-token-input');
                  handleSaveToken(input.value);
                }}
              >
                Save Token
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
