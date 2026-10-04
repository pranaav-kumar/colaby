import { useEffect, useRef } from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';

function RemoteAudio({ stream, isDeafened }) {
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !stream) return undefined;

    audio.srcObject = stream;
    audio.volume = 1;
    const play = () => audio.play().catch((error) => {
      console.warn('[Voice] Could not play remote audio:', error.message);
    });

    stream.getAudioTracks().forEach((track) => track.addEventListener('unmute', play));
    play();
    return () => {
      stream.getAudioTracks().forEach((track) => track.removeEventListener('unmute', play));
      if (audio.srcObject === stream) audio.srcObject = null;
    };
  }, [stream]);

  return <audio ref={audioRef} autoPlay playsInline muted={isDeafened} aria-hidden="true" className="remote-voice-audio" />;
}

export default function RemoteAudioRenderer() {
  const { voiceCall } = useWorkspace();
  if (!voiceCall?.isInCall) return null;

  return voiceCall.participants?.map((participant) => (
    participant.stream
      ? <RemoteAudio key={participant.id} stream={participant.stream} isDeafened={voiceCall.isDeafened} />
      : null
  ));
}
