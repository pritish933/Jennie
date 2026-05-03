function pickFemaleVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  return (
    voices.find((voice) => /neerja|heera|veena|zira|samantha|karen|susan|female|google uk english female/i.test(voice.name)) ||
    voices.find((voice) => /^(en-IN|hi-IN)/i.test(voice.lang)) ||
    voices.find((voice) => /^en(-|_)/i.test(voice.lang)) ||
    voices[0] ||
    null
  );
}

let speechUnlocked = false;
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

function base64ToBytes(base64Data: string): Uint8Array {
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function createWavBlob(pcmBytes: Uint8Array, sampleRate = 24000): Blob {
  const bytes = pcmBytes.byteLength % 2 === 0 ? pcmBytes : pcmBytes.slice(0, pcmBytes.byteLength - 1);
  const wavBuffer = new ArrayBuffer(44 + bytes.byteLength);
  const view = new DataView(wavBuffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + bytes.byteLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, bytes.byteLength, true);
  new Uint8Array(wavBuffer, 44).set(bytes);

  return new Blob([wavBuffer], { type: "audio/wav" });
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

export function unlockSpeech(): void {
  if (speechUnlocked || !("speechSynthesis" in window)) return;

  speechUnlocked = true;
  const utterance = new SpeechSynthesisUtterance(" ");
  utterance.volume = 0;
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.voice = pickFemaleVoice();
  window.speechSynthesis.speak(utterance);
}

export async function speakText(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window) || !text.trim()) {
      resolve();
      return;
    }

    window.speechSynthesis.cancel();
    let didStart = false;

    const speak = () => {
      if (didStart) return;
      didStart = true;
      window.speechSynthesis.onvoiceschanged = null;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-IN";
      utterance.rate = 1.04;
      utterance.pitch = 1.12;
      utterance.voice = pickFemaleVoice();
      utterance.onend = () => resolve();
      utterance.onerror = (event) => {
        console.error("Browser speech error:", event.error);
        resolve();
      };
      console.log("Speaking with browser speech fallback");
      window.speechSynthesis.speak(utterance);
      window.speechSynthesis.resume();
    };

    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = speak;
      setTimeout(speak, 250);
    } else {
      speak();
    }
  });
}

export async function playPCM(base64Data: string): Promise<void> {
  try {
    const bytes = base64ToBytes(base64Data);
    if (bytes.byteLength < 2) {
      console.warn("Received empty audio data");
      return;
    }

    const wavUrl = URL.createObjectURL(createWavBlob(bytes));
    const audio = new Audio(wavUrl);
    try {
      console.log("Playing Jennie audio via WAV");
      await audio.play();
      await new Promise<void>((resolve) => {
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
      });
      URL.revokeObjectURL(wavUrl);
      return;
    } catch (error) {
      URL.revokeObjectURL(wavUrl);
      console.warn("HTML audio playback failed, trying AudioContext:", error);
    }

    const audioCtx = getAudioContext();
    if (!audioCtx) {
      return;
    }
    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }
    const buffer = new Int16Array(bytes.buffer.slice(0, bytes.byteLength - (bytes.byteLength % 2)));
    const audioBuffer = audioCtx.createBuffer(1, buffer.length, 24000);
    const channelData = audioBuffer.getChannelData(0);
    for (let i = 0; i < buffer.length; i++) {
      channelData[i] = buffer[i] / 32768.0;
    }
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);
    console.log("Playing Jennie audio via AudioContext");
    source.start();
    
    return new Promise<void>(resolve => {
      source.onended = () => resolve();
    });
  } catch (error) {
    console.error("Error playing audio:", error);
  }
}
