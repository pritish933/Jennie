let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) {
    console.warn("AudioContext not supported");
    return null;
  }

  if (!sharedAudioContext || sharedAudioContext.state === "closed") {
    sharedAudioContext = new AudioContextClass({ sampleRate: 24000 });
  }

  return sharedAudioContext;
}

export function unlockAudio(): void {
  const audioCtx = getAudioContext();
  if (!audioCtx) return;

  audioCtx.resume().catch(() => {});
  const buffer = audioCtx.createBuffer(1, 1, 24000);
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(audioCtx.destination);
  source.start();
}

export async function playPCM(base64Data: string): Promise<void> {
  try {
    const audioCtx = getAudioContext();
    if (!audioCtx) {
      return;
    }

    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }

    const binaryString = atob(base64Data);
    const len = binaryString.length - (binaryString.length % 2);
    if (len < 2) {
      console.warn("Received empty audio data");
      return;
    }

    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const buffer = new Int16Array(bytes.buffer);
    const audioBuffer = audioCtx.createBuffer(1, buffer.length, 24000);
    const channelData = audioBuffer.getChannelData(0);
    for (let i = 0; i < buffer.length; i++) {
      channelData[i] = buffer[i] / 32768.0;
    }

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);
    source.start();

    return new Promise<void>(resolve => {
      source.onended = () => resolve();
    });
  } catch (error) {
    console.error("Error playing audio:", error);
  }
}
