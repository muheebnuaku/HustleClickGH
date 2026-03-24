/**
 * PCMCaptureProcessor — AudioWorklet processor for capturing raw PCM audio.
 *
 * Runs in a dedicated audio rendering thread, completely separate from the
 * JS main thread. This prevents the ScriptProcessorNode main-thread blocking
 * that causes browser tab crashes ("page reloaded because an error occurred")
 * on mobile Chrome/Safari during long recording sessions.
 *
 * Accumulates samples from all input channels (interleaved for stereo) into
 * a ring buffer. When the buffer reaches chunkSize samples, posts a Float32Array
 * to the main thread via the port. The main thread converts to Int16 if needed.
 *
 * Options (passed via AudioWorkletNode processorOptions):
 *   channels  {number} — 1 (mono) or 2 (stereo). Default: 1
 *   chunkSize {number} — samples per message. Default: 4096
 */
class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this._channels = opts.channels || 1;
    this._chunkSize = opts.chunkSize || 4096;
    this._buffer = [];
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;

    const frameCount = input[0].length;

    if (this._channels === 2 && input[1] && input[1].length > 0) {
      // Stereo — interleave L/R samples
      for (let i = 0; i < frameCount; i++) {
        this._buffer.push(input[0][i]);
        this._buffer.push(input[1][i]);
      }
    } else {
      // Mono — left channel only
      for (let i = 0; i < frameCount; i++) {
        this._buffer.push(input[0][i]);
      }
    }

    // Flush complete chunks to the main thread
    while (this._buffer.length >= this._chunkSize) {
      const chunk = new Float32Array(this._buffer.splice(0, this._chunkSize));
      this.port.postMessage(chunk, [chunk.buffer]); // transfer buffer to avoid copy
    }

    return true; // keep processor alive
  }
}

registerProcessor("pcm-capture", PCMCaptureProcessor);
