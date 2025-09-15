import { useParams } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import io from "socket.io-client";

export default function Room() {
  const { roomID } = useParams();
  const [roomResponse, setRoomResponse] = useState(false);
  const [socket, setSocket] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioChunks, setAudioChunks] = useState([]);
  const mediaRecorderRef = useRef(null);
  const canvasRef = useRef(null);
  const playheadRef = useRef(null);
  const requestRef = useRef(null);

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const realtimeAnimationRef = useRef(null);
  const currentAudioRef = useRef(null);

  useEffect(() => {
    const newSocket = io("http://localhost:3000", { withCredentials: true });
    setSocket(newSocket);
    return () => newSocket.disconnect();
  }, []);

  useEffect(() => {
    async function verifyRoom() {
      const response = await fetch("http://localhost:3000/getroom/" + roomID, {
        credentials: "include",
        method: "GET",
      });
      if (response.ok) {
        setRoomResponse(true);
        socket?.emit("join_room", roomID);
        console.log(`Attempting to join socket room: ${roomID}`);
      } else {
        setRoomResponse(false);
      }
    }
    verifyRoom();
  }, [socket, roomID]);

  // Utility: prepare canvas for high-DPI and return ctx + CSS dims
  const prepareCanvas = (canvas) => {
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    // fallback to attributes if no CSS sizing
    const cssWidth = rect.width || canvas.width;
    const cssHeight = rect.height || canvas.height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    // map drawing commands to CSS pixels
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, cssWidth, cssHeight };
  };

  // Draw the combined waveform (decoded audio blob -> downsampled envelope -> draw)
  const drawCombinedWaveform = async (blob) => {
    if (!canvasRef.current || !audioContextRef.current) return;
    const { ctx, cssWidth, cssHeight } = prepareCanvas(canvasRef.current);

    ctx.clearRect(0, 0, cssWidth, cssHeight);

    // try to decode; if decode fails (small partial chunk), bail silently
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);

      const channelCount = audioBuffer.numberOfChannels;
      const rawLength = audioBuffer.length;
      // build mono by averaging channels
      const mono = new Float32Array(rawLength);
      for (let ch = 0; ch < channelCount; ch++) {
        const chData = audioBuffer.getChannelData(ch);
        for (let i = 0; i < rawLength; i++) mono[i] += chData[i];
      }
      if (channelCount > 1) {
        for (let i = 0; i < rawLength; i++) mono[i] /= channelCount;
      }

      // choose display samples equal to canvas width (1 sample per CSS pixel)
      const displaySamples = Math.max(1, Math.floor(cssWidth));
      const blockSize = Math.max(1, Math.floor(rawLength / displaySamples));
      const filtered = new Float32Array(displaySamples);

      // compute RMS per block (better energy estimate)
      for (let i = 0; i < displaySamples; i++) {
        const start = i * blockSize;
        const end = Math.min(start + blockSize, rawLength);
        let sumSquares = 0;
        const actualLen = end - start;
        for (let j = start; j < end; j++) {
          const s = mono[j];
          sumSquares += s * s;
        }
        filtered[i] = Math.sqrt(sumSquares / Math.max(1, actualLen));
      }

      // draw filled waveform (centered)
      ctx.fillStyle = "#4287f5";
      const centerY = cssHeight / 2;
      const pxPerSample = cssWidth / displaySamples;
      for (let i = 0; i < displaySamples; i++) {
        const x = i * pxPerSample;
        const y = filtered[i] * centerY;
        // ensure at least 1px wide so it appears
        const w = Math.max(1, Math.ceil(pxPerSample));
        ctx.fillRect(x, centerY - y, w, y * 2);
      }
    } catch (err) {
      // decoding failures are common for tiny partial webm chunks — ignore
      // console.debug("decode failed (probably small chunk):", err);
    }
  };

  // Real-time drawing using AnalyserNode (shows the live mic waveform while recording)
  const drawRealtime = () => {
    const canvas = canvasRef.current;
    if (!canvas || !analyserRef.current) return;
    const { ctx, cssWidth, cssHeight } = prepareCanvas(canvas);

    const analyser = analyserRef.current;
    const data = dataArrayRef.current;
    const bufferLength = analyser.fftSize;
    analyser.getFloatTimeDomainData(data);

    ctx.clearRect(0, 0, cssWidth, cssHeight);

    // Optionally, draw the "background" combined waveform first if available:
    // (we won't draw it here to keep the realtime fast)

    // draw time-domain waveform as polyline
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#ff4d4d"; // live signal color
    ctx.beginPath();
    const sliceWidth = cssWidth / bufferLength;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const v = data[i]; // -1..1
      const y = (1 - (v + 1) / 2) * cssHeight; // map -1..1 -> 0..cssHeight
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.stroke();

    realtimeAnimationRef.current = requestAnimationFrame(drawRealtime);
  };

  // Start recording: set up MediaRecorder and analyser for realtime visualization
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // create or reuse AudioContext
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      // resume (user gesture)
      if (audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume();
      }

      // set up analyser node for realtime
      const sourceNode = audioContextRef.current.createMediaStreamSource(stream);
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 2048;
      sourceNode.connect(analyser);
      analyserRef.current = analyser;
      sourceNodeRef.current = sourceNode;
      dataArrayRef.current = new Float32Array(analyser.fftSize);

      // create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      setAudioChunks([]); // reset stored chunks

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          // 1) Send binary to socket (keep same logic you had)
          event.data.arrayBuffer().then((buffer) => {
            const first = audioChunks.length === 0;
            if (socket) {
              socket.emit("send_audio_chunk", { roomID, chunk: buffer, first });
            }
          });

          // 2) Update local chunks and draw combined waveform for accumulated chunks
          setAudioChunks((prev) => {
            const newChunks = [...prev, event.data];
            // Draw combined waveform from the accumulated chunks (may fail on tiny partial chunks)
            const combined = new Blob(newChunks, { type: "audio/webm; codecs=opus" });
            // call but don't await
            drawCombinedWaveform(combined);
            return newChunks;
          });
        }
      };

      mediaRecorder.onerror = (err) => console.error("MediaRecorder error", err);

      // Start with small timeslice so ondataavailable fires repeatedly
      mediaRecorder.start(250); // 250ms chunks
      setIsRecording(true);

      // Start realtime visualizer
      if (realtimeAnimationRef.current) cancelAnimationFrame(realtimeAnimationRef.current);
      drawRealtime();
    } catch (err) {
      console.error("Mic access error:", err);
    }
  };

  // Stop recording: stop mediaRecorder and stop realtime animation + disconnect nodes
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);

    // stop realtime animation
    if (realtimeAnimationRef.current) {
      cancelAnimationFrame(realtimeAnimationRef.current);
      realtimeAnimationRef.current = null;
    }
    // disconnect audio graph (but keep AudioContext for reuse)
    if (sourceNodeRef.current && analyserRef.current) {
      try {
        sourceNodeRef.current.disconnect();
        analyserRef.current.disconnect();
      } catch (err) {}
      sourceNodeRef.current = null;
      analyserRef.current = null;
    }

    // draw final combined waveform one last time from accumulated chunks
    if (audioChunks.length > 0) {
      const combined = new Blob(audioChunks, { type: "audio/webm; codecs=opus" });
      drawCombinedWaveform(combined);
    }
  };



  const playRecording = () => {
  if (audioChunks.length === 0) return;
  
  // Stop any currently playing audio and animations
  if (currentAudioRef.current) {
    currentAudioRef.current.pause();
    currentAudioRef.current = null;
  }
  if (requestRef.current) {
    cancelAnimationFrame(requestRef.current);
    requestRef.current = null;
  }
  

  
  const blob = new Blob(audioChunks, { type: "audio/webm; codecs=opus" });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  currentAudioRef.current = audio;

  // Start animation when audio can play
  audio.oncanplaythrough = () => {
    // Double-check we have a valid duration
    if (audio.duration && isFinite(audio.duration)) {
      animatePlayhead(audio.duration);
      audio.play().catch(err => console.error("Audio play failed:", err));
    } else {
      console.warn("Audio duration not available:", audio.duration);
    }
  };
  
  // Fallback: if oncanplaythrough doesn't fire, try onloadedmetadata
  audio.onloadedmetadata = () => {
    if (audio.duration && isFinite(audio.duration) && !requestRef.current) {
      animatePlayhead(audio.duration);
    }
  };
  
  // Handle audio end
  audio.onended = () => {
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = null;
    }
    // Reset playhead to start
    if (playheadRef.current) {
      playheadRef.current.style.left = '0px';
    }
  };
  
  // Start loading the audio
  audio.load();
};

  // When receiving audio from the socket: convert to Blob and add to audioChunks
  useEffect(() => {
    if (!socket) return;

    const handler = (data) => {
      // data.chunk is expected to be an ArrayBuffer (server forwarded binary)
      const chunkBuf = data.chunk;
      const incomingBlob = new Blob([chunkBuf], { type: "audio/webm; codecs=opus" });

      setAudioChunks((prev) => {
        const newChunks = data.first ? [incomingBlob] : [...prev, incomingBlob];
        // try to draw combined waveform for remote chunks
        const combined = new Blob(newChunks, { type: "audio/webm; codecs=opus" });
        drawCombinedWaveform(combined);
        return newChunks;
      });
    };

    socket.on("receive_audio_chunk", handler);
    return () => socket.off("receive_audio_chunk", handler);
  }, [socket]);

  // Clicking the canvas seeks to a position in the combined audio
  const handleCanvasClick = (e) => {
    if (!canvasRef.current || audioChunks.length === 0) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = clickX / rect.width;
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    const blob = new Blob(audioChunks, { type: "audio/webm; codecs=opus" });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudioRef.current = audio;
    audio.onloadedmetadata = () => {
      audio.currentTime = audio.duration * ratio;
      // stop previous animation
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      animatePlayhead(audio.duration - audio.currentTime);
      audio.play();
    };
  };

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (realtimeAnimationRef.current) cancelAnimationFrame(realtimeAnimationRef.current);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        // don't close necessarily — but could suspend
        audioContextRef.current.suspend().catch(() => {});
      }
    };
  }, []);

  return (
    <div className="p-4">
      {roomResponse ? (
        <>
          <div>
            <h2 className="mb-4 font-bold">RoomID: {roomID}</h2>
            <button
              onClick={startRecording}
              disabled={isRecording}
              className="mr-2 px-4 py-2 bg-green-500 text-white rounded"
            >
              Start Recording
            </button>
            <button
              onClick={stopRecording}
              disabled={!isRecording}
              className="mr-2 px-4 py-2 bg-red-500 text-white rounded"
            >
              Stop Recording
            </button>
            <button
              onClick={playRecording}
              disabled={audioChunks.length === 0}
              className="px-4 py-2 bg-blue-500 text-white rounded"
            >
              Play My Recording
            </button>
          </div>

          <div style={{ position: "relative", marginTop: "1rem" }}>
            <canvas
              ref={canvasRef}
              width={800}
              height={200}
              className="border mt-4"
              onClick={handleCanvasClick}
              style={{ width: 800, height: 200,background:'lightgray' }}
            />
      
          </div>
        </>
      ) : (
        "Room not found"
      )}
    </div>
  );
}
