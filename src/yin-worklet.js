// YIN Worklet template
let WASM_BASE64 = "__WASM_BASE64_PLACEHOLDER__";

class PitchDetectorWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.wasmModule = null;
    this.bufferSize = 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    this.minSignalThreshold = 0.005; // Raised to avoid detecting background noise
    this.sampleRate = 44100;

    // Decode and instantiate WASM immediately
    // Basic atob polyfill for worklets
    let atob_polyfill = (b64) => {
      let B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
      let o1, o2, o3, h1, h2, h3, h4, bits, i = 0,
        ac = 0,
        dec = "",
        tmp_arr = [];

      if (!b64) {
        return b64;
      }

      b64 += '';

      do { // unpack four hexets into three octets using index points in B64
        h1 = B64.indexOf(b64.charAt(i++));
        h2 = B64.indexOf(b64.charAt(i++));
        h3 = B64.indexOf(b64.charAt(i++));
        h4 = B64.indexOf(b64.charAt(i++));

        bits = h1 << 18 | h2 << 12 | h3 << 6 | h4;

        o1 = bits >> 16 & 0xff;
        o2 = bits >> 8 & 0xff;
        o3 = bits & 0xff;

        if (h3 == 64) {
          tmp_arr[ac++] = String.fromCharCode(o1);
        } else if (h4 == 64) {
          tmp_arr[ac++] = String.fromCharCode(o1, o2);
        } else {
          tmp_arr[ac++] = String.fromCharCode(o1, o2, o3);
        }
      } while (i < b64.length);

      dec = tmp_arr.join('');
      return dec;
    };
    let wasmBytes = Uint8Array.from(atob_polyfill(WASM_BASE64), c => c.charCodeAt(0));
    WebAssembly.instantiate(wasmBytes, {}).then(wasm => {
      this.wasmModule = wasm.instance;
    });

    this.port.onmessage = (e) => {
      if (e.data.sampleRate) {
        this.sampleRate = e.data.sampleRate;
      }
    };
  }

  process(inputs) {
    if (!this.wasmModule) return true;

    let input = inputs[0][0];
    if (!input) return true;

    // Accumulate raw samples into larger buffer
    for (let i = 0; i < input.length; i++) {
      this.buffer[this.bufferIndex++] = input[i];

      // When buffer is full, run YIN with AGC in WASM
      if (this.bufferIndex >= this.bufferSize) {
        // Copy buffer to Wasm memory
        let wasmMemory = new Float32Array(this.wasmModule.exports.memory.buffer);
        wasmMemory.set(this.buffer, 0);

        // Reserve space for confidence output (right after the buffer)
        let confidenceOffset = this.bufferSize;

        // Call YIN pitch detector (returns freq, writes confidence to memory)
        let freq = this.wasmModule.exports.yinf0(
          0,
          this.bufferSize,
          this.sampleRate,
          this.minSignalThreshold,
          confidenceOffset * 4  // Byte offset for confidence
        );

        // Read confidence from memory
        let confidence = wasmMemory[confidenceOffset];

        // Check if signal was rejected (freq == 0 means silence)
        if (freq === 0) {
          this.port.postMessage({ silence: true });
        } else if (freq > 40 && freq < 2000 && confidence < 0.3) {
          // Only accept if confidence is good (aperiodicity < 0.3)
          this.port.postMessage({ frequency: freq, confidence: confidence });
        } else if (confidence >= 0.3) {
          // Low confidence, treat as silence
          this.port.postMessage({ silence: true });
        }

        // Reset buffer with 50% overlap for smoother detection
        this.buffer.copyWithin(0, this.bufferSize / 2);
        this.bufferIndex = this.bufferSize / 2;
      }
    }

    return true;
  }
}

registerProcessor('yin', PitchDetectorWorklet);
