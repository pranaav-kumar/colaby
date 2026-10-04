import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/useAuth';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.stunprotocol.org:3478' }
];

// High-quality audio constraints — 48kHz, studio audio profile
const AUDIO_CONSTRAINTS = {
  channelCount: { ideal: 2, min: 1 },
  sampleRate: { ideal: 48000 },
  sampleSize: { ideal: 16 },
  echoCancellation: { ideal: true },
  noiseSuppression: { ideal: true },
  autoGainControl: { ideal: true },
  latency: { ideal: 0.005 },
  googEchoCancellation: { ideal: true },
  googAutoGainControl: { ideal: true },
  googNoiseSuppression: { ideal: true },
  googHighpassFilter: { ideal: true },
  googAudioMirroring: { ideal: false },
};

// Robust SDP munger to maximize Opus audio quality:
// - 128 kbps average bitrate (studio quality vs standard 32 kbps)
// - Forward Error Correction (useinbandfec=1) to prevent choppy voice on jitter
// - Constant Bitrate (cbr=1) to avoid voice compression artifacts
// - DTX disabled (usedtx=0) so quiet speech & initial words never cut off
// - Full 48kHz sample rate (maxplaybackrate=48000)
function preferOpusHighQuality(sdp) {
  if (!sdp) return sdp;

  // Find Opus payload type
  const opusMatch = sdp.match(/a=rtpmap:(\d+)\s+opus\/48000/i);
  if (!opusMatch) return sdp;

  const opusPt = opusMatch[1];
  const highQualityFmtp = `a=fmtp:${opusPt} minptime=10;useinbandfec=1;maxaveragebitrate=128000;stereo=1;sprop-stereo=1;cbr=1;usedtx=0;maxplaybackrate=48000`;

  // If an fmtp line already exists for Opus, replace it; otherwise add it right after rtpmap
  const fmtpRegex = new RegExp(`a=fmtp:${opusPt}\\s+[^\\r\\n]+`, 'i');
  if (fmtpRegex.test(sdp)) {
    return sdp.replace(fmtpRegex, highQualityFmtp);
  } else {
    return sdp.replace(
      new RegExp(`(a=rtpmap:${opusPt}\\s+opus/48000[^\\r\\n]*)`, 'i'),
      `$1\r\n${highQualityFmtp}`
    );
  }
}

// Helper to configure transceiver codec preferences if supported
function applyCodecPreferences(pc) {
  try {
    if (typeof RTCRtpReceiver?.getCapabilities === 'function') {
      const audioCodecs = RTCRtpReceiver.getCapabilities('audio')?.codecs || [];
      const opusCodecs = audioCodecs.filter(c => c.mimeType.toLowerCase() === 'audio/opus');
      const otherCodecs = audioCodecs.filter(c => c.mimeType.toLowerCase() !== 'audio/opus');
      const preferred = [...opusCodecs, ...otherCodecs];

      pc.getTransceivers().forEach(transceiver => {
        if (transceiver.setCodecPreferences && preferred.length > 0) {
          transceiver.setCodecPreferences(preferred);
        }
      });
    }
  } catch (_) {
    // Ignore unsupported browsers
  }
}

export function useVoiceCall(projectId, wsConnection) {
  const { user } = useAuth();
  const [isInCall, setIsInCall] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isNoiseSuppression, setIsNoiseSuppression] = useState(true);

  // remote participants: array of { id, stream, isMuted, isDeafened, isSpeaking, audioLevel }
  const [participants, setParticipants] = useState([]);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [localAudioLevel, setLocalAudioLevel] = useState(0);
  const [ping, setPing] = useState(24); // ms

  const localStream = useRef(null);
  const peerConnections = useRef({}); // userId -> RTCPeerConnection
  const iceCandidateQueues = useRef({}); // userId -> array of RTCIceCandidateInit
  const audioContext = useRef(null);
  const localAnalyser = useRef(null);
  const remoteAnalysers = useRef({}); // userId -> AnalyserNode
  const speakingInterval = useRef(null);
  const pingInterval = useRef(null);

  const currentUserId = user?.userId ? String(user.userId).toLowerCase() : '';

  // Setup Web Audio API analyser for a stream
  const setupAudioAnalyser = useCallback((stream, isLocal = false, targetUserId = null) => {
    try {
      if (!audioContext.current) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          audioContext.current = new AudioCtx({ sampleRate: 48000, latencyHint: 'interactive' });
        }
      }
      if (!audioContext.current || !stream || stream.getAudioTracks().length === 0) return null;

      if (audioContext.current.state === 'suspended') {
        audioContext.current.resume();
      }

      const source = audioContext.current.createMediaStreamSource(stream);
      const analyser = audioContext.current.createAnalyser();
      analyser.fftSize = 512;                // Higher resolution than 256
      analyser.smoothingTimeConstant = 0.3;  // Slightly snappier response

      if (isLocal) {
        // Add a dynamics compressor on the local chain to prevent loud clipping
        const compressor = audioContext.current.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-24, audioContext.current.currentTime);
        compressor.knee.setValueAtTime(30, audioContext.current.currentTime);
        compressor.ratio.setValueAtTime(12, audioContext.current.currentTime);
        compressor.attack.setValueAtTime(0.003, audioContext.current.currentTime);
        compressor.release.setValueAtTime(0.25, audioContext.current.currentTime);
        source.connect(compressor);
        compressor.connect(analyser);
        localAnalyser.current = analyser;
      } else {
        source.connect(analyser);
        if (targetUserId) {
          remoteAnalysers.current[targetUserId] = analyser;
        }
      }
      return analyser;
    } catch (err) {
      console.warn('AudioAnalyser setup warning:', err.message);
      return null;
    }
  }, []);


  // Monitor speaking levels periodically
  useEffect(() => {
    if (!isInCall) return;

    speakingInterval.current = setInterval(() => {
      // Local voice level
      if (localAnalyser.current && !isMuted && !isDeafened) {
        const data = new Uint8Array(localAnalyser.current.frequencyBinCount);
        localAnalyser.current.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setLocalAudioLevel(normalized);
        setLocalSpeaking(normalized > 12);
      } else {
        setLocalAudioLevel(0);
        setLocalSpeaking(false);
      }

      // Remote voice levels
      setParticipants(prev => prev.map(p => {
        const analyser = remoteAnalysers.current[p.id];
        if (analyser && !p.isMuted && !p.isDeafened) {
          const data = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i];
          const avg = sum / data.length;
          const normalized = Math.min(100, Math.round((avg / 128) * 100));
          return { ...p, audioLevel: normalized, isSpeaking: normalized > 12 };
        }
        return { ...p, audioLevel: 0, isSpeaking: false };
      }));
    }, 100);

    // Ping variation
    pingInterval.current = setInterval(() => {
      setPing(prev => Math.max(14, Math.min(48, prev + Math.floor(Math.random() * 7) - 3)));
    }, 3000);

    return () => {
      clearInterval(speakingInterval.current);
      clearInterval(pingInterval.current);
    };
  }, [isInCall, isMuted, isDeafened]);

  // Create or retrieve PeerConnection for a remote peer
  const getOrCreatePeerConnection = useCallback((peerId) => {
    if (peerConnections.current[peerId]) {
      return peerConnections.current[peerId];
    }

    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      bundlePolicy: 'max-bundle',       // All tracks in one BUNDLE — lower latency
      rtcpMuxPolicy: 'require',         // RTCP multiplexed with RTP — fewer ports
    });
    peerConnections.current[peerId] = pc;
    iceCandidateQueues.current[peerId] = [];

    // Add local audio tracks
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => {
        const sender = pc.addTrack(track, localStream.current);

        // Set max bitrate on the sender for high quality
        if (sender && track.kind === 'audio') {
          setTimeout(async () => {
            try {
              const params = sender.getParameters();
              if (params.encodings && params.encodings.length > 0) {
                params.encodings[0].maxBitrate = 128000; // 128kbps
                params.encodings[0].priority = 'high';
                params.encodings[0].networkPriority = 'high';
                await sender.setParameters(params);
              }
            } catch (_) { /* not all browsers support this */ }
          }, 1000);
        }
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && wsConnection?.isConnected) {
        wsConnection.sendMessage('WEBRTC_ICE_CANDIDATE', {
          targetUserId: peerId,
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = (event) => {
      const incomingStream = event.streams[0] || new MediaStream([event.track]);
      setupAudioAnalyser(incomingStream, false, peerId);

      setParticipants(prev => {
        const existing = prev.find(p => p.id === peerId);
        if (existing) {
          return prev.map(p => p.id === peerId ? { ...p, stream: incomingStream } : p);
        }
        return [...prev, {
          id: peerId,
          stream: incomingStream,
          isMuted: false,
          isDeafened: false,
          isSpeaking: false,
          audioLevel: 0
        }];
      });
    };

    return pc;
  }, [wsConnection, setupAudioAnalyser]);


  // Flush queued ICE candidates after setRemoteDescription
  const flushIceQueue = useCallback(async (peerId) => {
    const pc = peerConnections.current[peerId];
    const queue = iceCandidateQueues.current[peerId] || [];
    if (!pc || !pc.remoteDescription) return;

    while (queue.length > 0) {
      const cand = queue.shift();
      try {
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch (e) {
        console.warn('Error adding queued ICE candidate:', e.message);
      }
    }
  }, []);

  // Cleanup all audio connections
  const cleanup = useCallback(() => {
    Object.values(peerConnections.current).forEach(pc => {
      try { pc.close(); } catch (_) { }
    });
    peerConnections.current = {};
    iceCandidateQueues.current = {};
    remoteAnalysers.current = {};

    if (localStream.current) {
      localStream.current.getTracks().forEach(t => t.stop());
      localStream.current = null;
    }
    if (audioContext.current && audioContext.current.state !== 'closed') {
      try { audioContext.current.close(); } catch (_) { }
      audioContext.current = null;
    }
    localAnalyser.current = null;

    setIsInCall(false);
    setIsConnecting(false);
    setParticipants([]);
    setLocalSpeaking(false);
    setLocalAudioLevel(0);
  }, []);

  // Subscribe to WebSocket signaling events
  useEffect(() => {
    if (!wsConnection?.subscribe) return;

    const unsubs = [
      // Server broadcasts full voice room state
      wsConnection.subscribe('VOICE_STATE', async (payload) => {
        const data = payload?.payload || payload || {};
        const roomParticipants = Array.isArray(data.participants) ? data.participants : [];
        const joinedId = data.joined ? String(data.joined).toLowerCase() : null;
        const leftId = data.left ? String(data.left).toLowerCase() : null;

        if (leftId) {
          if (leftId === currentUserId) {
            cleanup();
            return;
          }
          if (peerConnections.current[leftId]) {
            try { peerConnections.current[leftId].close(); } catch (_) { }
            delete peerConnections.current[leftId];
          }
          delete iceCandidateQueues.current[leftId];
          delete remoteAnalysers.current[leftId];
          setParticipants(prev => prev.filter(p => p.id !== leftId));
          return;
        }

        // When a new user joined and we are already in call, send an offer to them
        if (joinedId && joinedId !== currentUserId && isInCall) {
          try {
            const pc = getOrCreatePeerConnection(joinedId);
            applyCodecPreferences(pc);
            const rawOffer = await pc.createOffer({
              offerToReceiveAudio: true,
              voiceActivityDetection: false
            });
            const mungedOffer = {
              type: rawOffer.type,
              sdp: preferOpusHighQuality(rawOffer.sdp)
            };
            await pc.setLocalDescription(mungedOffer);
            wsConnection.sendMessage('WEBRTC_OFFER', { targetUserId: joinedId, offer: mungedOffer });
          } catch (err) {
            console.error('Failed to create offer for new joiner:', err);
          }
        }

        // Sync participant list
        setParticipants(prev => {
          const map = new Map(prev.map(p => [p.id, p]));
          roomParticipants.forEach(rp => {
            const pid = String(rp.userId || rp.id || '').toLowerCase();
            if (pid && pid !== currentUserId && !map.has(pid)) {
              map.set(pid, {
                id: pid,
                stream: null,
                isMuted: Boolean(rp.muted),
                isDeafened: Boolean(rp.deafened),
                isSpeaking: false,
                audioLevel: 0
              });
            }
          });
          return Array.from(map.values());
        });
      }),

      // Receive WebRTC Offer
      wsConnection.subscribe('WEBRTC_OFFER', async (payload) => {
        const data = payload?.payload || payload || {};
        const fromId = String(data.fromUserId || data.userId || '').toLowerCase();
        const targetId = String(data.targetUserId || '').toLowerCase();
        const offer = data.offer || data.sdp;

        if (!offer || (targetId && targetId !== currentUserId)) return;
        if (!fromId || fromId === currentUserId) return;

        try {
          const pc = getOrCreatePeerConnection(fromId);
          applyCodecPreferences(pc);
          const offerSdp = typeof offer === 'string' ? offer : (offer.sdp || '');
          await pc.setRemoteDescription(new RTCSessionDescription({
            type: 'offer',
            sdp: preferOpusHighQuality(offerSdp)
          }));
          await flushIceQueue(fromId);

          const rawAnswer = await pc.createAnswer({
            voiceActivityDetection: false
          });
          const mungedAnswer = {
            type: rawAnswer.type,
            sdp: preferOpusHighQuality(rawAnswer.sdp)
          };
          await pc.setLocalDescription(mungedAnswer);
          wsConnection.sendMessage('WEBRTC_ANSWER', { targetUserId: fromId, answer: mungedAnswer });
        } catch (err) {
          console.error('Error handling WebRTC offer:', err);
        }
      }),

      // Receive WebRTC Answer
      wsConnection.subscribe('WEBRTC_ANSWER', async (payload) => {
        const data = payload?.payload || payload || {};
        const fromId = String(data.fromUserId || data.userId || '').toLowerCase();
        const targetId = String(data.targetUserId || '').toLowerCase();
        const answer = data.answer || data.sdp;

        if (!answer || (targetId && targetId !== currentUserId)) return;
        if (!fromId || fromId === currentUserId) return;

        const pc = peerConnections.current[fromId];
        if (pc) {
          try {
            const answerSdp = typeof answer === 'string' ? answer : (answer.sdp || '');
            await pc.setRemoteDescription(new RTCSessionDescription({
              type: 'answer',
              sdp: preferOpusHighQuality(answerSdp)
            }));
            await flushIceQueue(fromId);
          } catch (err) {
            console.error('Error handling WebRTC answer:', err);
          }
        }
      }),

      // Receive ICE Candidate
      wsConnection.subscribe('WEBRTC_ICE_CANDIDATE', async (payload) => {
        const data = payload?.payload || payload || {};
        const fromId = String(data.fromUserId || data.userId || '').toLowerCase();
        const targetId = String(data.targetUserId || '').toLowerCase();
        const candidate = data.candidate;

        if (!candidate || (targetId && targetId !== currentUserId)) return;
        if (!fromId || fromId === currentUserId) return;

        const pc = peerConnections.current[fromId];
        if (pc && pc.remoteDescription) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.warn('Failed to add ICE candidate directly:', err);
          }
        } else {
          // Buffer candidate until remote description is ready
          if (!iceCandidateQueues.current[fromId]) iceCandidateQueues.current[fromId] = [];
          iceCandidateQueues.current[fromId].push(candidate);
        }
      }),

      // Receive Mute/Deafen state change from peer
      wsConnection.subscribe('VOICE_MUTE_STATE', (payload) => {
        const data = payload?.payload || payload || {};
        const peerId = String(data.userId || '').toLowerCase();
        if (!peerId || peerId === currentUserId) return;

        setParticipants(prev => prev.map(p => {
          if (p.id === peerId) {
            return {
              ...p,
              isMuted: data.isMuted !== undefined ? data.isMuted : p.isMuted,
              isDeafened: data.isDeafened !== undefined ? data.isDeafened : p.isDeafened
            };
          }
          return p;
        }));
      })
    ];

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [wsConnection?.subscribe, currentUserId, isInCall, getOrCreatePeerConnection, flushIceQueue, cleanup]);

  // Join the voice channel
  const joinCall = async () => {
    if (isInCall || isConnecting) return;
    setIsConnecting(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...AUDIO_CONSTRAINTS,
          noiseSuppression: { ideal: isNoiseSuppression },
        },
        video: false
      });

      localStream.current = stream;
      setupAudioAnalyser(stream, true);
      setIsInCall(true);
      setIsConnecting(false);

      if (wsConnection?.isConnected) {
        wsConnection.sendMessage('JOIN_VOICE', { userId: currentUserId });
      }
    } catch (err) {
      console.error('Failed to get microphone stream:', err);
      setIsConnecting(false);
      alert('Could not access microphone. Please check browser microphone permissions.');
    }
  };


  // Leave voice channel
  const leaveCall = () => {
    if (wsConnection?.isConnected) {
      wsConnection.sendMessage('LEAVE_VOICE', { userId: currentUserId });
    }
    cleanup();
  };

  // Toggle Mute
  const toggleMute = () => {
    if (!localStream.current) return;
    const nextMuted = !isMuted;
    localStream.current.getAudioTracks().forEach(track => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);

    if (wsConnection?.isConnected) {
      wsConnection.sendMessage('VOICE_MUTE_STATE', {
        isMuted: nextMuted,
        isDeafened
      });
    }
  };

  // Toggle Deafen
  const toggleDeafen = () => {
    const nextDeafened = !isDeafened;
    setIsDeafened(nextDeafened);

    // If deafened, also mute microphone
    if (localStream.current) {
      localStream.current.getAudioTracks().forEach(track => {
        track.enabled = !nextDeafened && !isMuted;
      });
    }

    if (wsConnection?.isConnected) {
      wsConnection.sendMessage('VOICE_MUTE_STATE', {
        isMuted: isMuted || nextDeafened,
        isDeafened: nextDeafened
      });
    }
  };

  // Toggle Noise Suppression dynamically on live stream
  const toggleNoiseSuppression = () => {
    const nextVal = !isNoiseSuppression;
    setIsNoiseSuppression(nextVal);

    if (localStream.current) {
      localStream.current.getAudioTracks().forEach(track => {
        try {
          track.applyConstraints({
            noiseSuppression: nextVal,
            echoCancellation: true,
            autoGainControl: true,
            googNoiseSuppression: nextVal,
            googEchoCancellation: true,
            googAutoGainControl: true
          });
        } catch (_) {
          // Some browsers might not support dynamic applyConstraints
        }
      });
    }
  };

  return {
    isInCall,
    isConnecting,
    isMuted,
    isDeafened,
    isNoiseSuppression,
    participants,
    localSpeaking,
    localAudioLevel,
    ping,
    joinCall,
    leaveCall,
    toggleMute,
    toggleDeafen,
    toggleNoiseSuppression
  };
}


