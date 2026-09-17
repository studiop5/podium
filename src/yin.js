// +skip
export { Yin } ;
// -skip

class Yin {
  audioContext = null;
  a4Freq = 440;
  currentStream = null;
  currentSource = null;
  highPassFilter = null;
  lastValidFreq = null;
  recentConfidences = [];
  recentFrequencies = [];
  smoothingWindow = 7;
  workletNode = null;
  released = false;
  startId = 0;

  constructor(callback) {
    this.callback = callback;
  }

  init(audioContext) {
    return this.initPromise ||= this.initAux(audioContext);
  }

  async initAux(audioContext) {
    if(this.released) return;
    // Own the detector context so release can terminate even while suspended.
    const sharedContext = audioContext;
    audioContext = this.audioContext = new AudioContext({ sampleRate: sharedContext.sampleRate });
    this.sharedContext = sharedContext;
    this.contextStateListener = () => {
      if(this.released) return;
      const change = sharedContext.state === 'running' ? audioContext.resume() : audioContext.suspend();
      change.catch(error => console.warn("YIN audio state change failed", error));
    };
    sharedContext.addEventListener('statechange', this.contextStateListener);
    this.contextStateListener();

    this.highPassFilter = this.audioContext.createBiquadFilter();
    this.highPassFilter.type = 'highpass';
    this.highPassFilter.frequency.value = 40;
    this.highPassFilter.Q.value = 0.7;

    if (!this.audioContext.audioWorklet._yinModulePromise) {
      // Cache the whole load, including fetch, so simultaneous instances share it.
      this.audioContext.audioWorklet._yinModulePromise = (async () => {
        // Load worklet with embedded WASM via blob URL
        let workletCode;
// #include build/yin-worklet.js as workletCode
// +skip
        let workletUrl;
        if (typeof chrome !== 'undefined' && chrome.runtime?.id)
          workletUrl = chrome.runtime.getURL('yin-worklet.js');
        else {
          workletCode = await (await fetch('yin-worklet.js')).text();
          workletUrl = URL.createObjectURL(new Blob([workletCode], { 'type': 'application/javascript' }));
        }
// -skip
// #write       let workletUrl = URL.createObjectURL(new Blob([workletCode], { 'type': 'application/javascript' }));
        try {
          await audioContext.audioWorklet.addModule(workletUrl);
        } finally {
          if(workletUrl.startsWith("blob:")) URL.revokeObjectURL(workletUrl);
        }
      })().catch((err) => {
        audioContext.audioWorklet._yinModulePromise = null;
        throw err;
      });
    }
    await audioContext.audioWorklet._yinModulePromise;
    if(this.released) return;

    this.workletNode = new AudioWorkletNode(this.audioContext, 'yin');
    this.workletNode.port.postMessage({ sampleRate: this.audioContext.sampleRate });

    this.workletNode.port.onmessage = (e) => {
      if(this.released) return;
      if (e.data.silence) {
        // Clear smoothing buffers when silence detected
        this.recentFrequencies.length = 0;
        this.recentConfidences.length = 0;
        this.lastValidFreq = null;
        this.callback({
          freq: '0.00',
          cents: '--',
          confidence: 0,
        });
        return;
      }

      if (e.data.frequency) {
        let confidence = e.data.confidence || 0.15; // Default to good confidence
        let smoothedFreq = this.smoothFrequency(e.data.frequency, confidence);
        let { cents, midi } = this.freqToMidi(smoothedFreq, this.a4Freq);
        this.callback({
          freq: smoothedFreq.toFixed(2),
          cents: cents > 0 ? `+${cents}` : `${cents}`,
          midi: midi,
          confidence: confidence,
        });
      }
    };

    // Connect through a silent gain node to keep the audio graph active without producing sound
    this.silentGain = this.audioContext.createGain();
    this.silentGain.gain.value = 0;
    this.workletNode.connect(this.silentGain);
    this.silentGain.connect(this.audioContext.destination);
  }

  async start() {
    if(this.released) return;
    this.stop();
    let startId = this.startId;
    await this.initPromise;
    if(this.released || startId !== this.startId) return;
    if (this.audioContext.state === 'suspended') await this.audioContext.resume();
    if(this.released || startId !== this.startId) return;
    if (this._keepaliveStream) {
      this._keepaliveStream.getTracks().forEach(t => t.stop());
      this._keepaliveStream = null;
    }
    let stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if(this.released || startId !== this.startId) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    this.currentStream = stream;
    this.currentSource = this.audioContext.createMediaStreamSource(this.currentStream);
    this.currentSource.connect(this.highPassFilter);
    this.highPassFilter.connect(this.workletNode);
  }

  stop() {
    ++this.startId; // invalidate a microphone request that has not completed yet
    if (this.currentSource) {
      this.currentSource.disconnect();
      this.currentSource = null;
    }
    if (this.currentStream) {
      if (/AppleWebKit/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent) && navigator.maxTouchPoints > 1) {
        // iOS: stopping mic tracks resets the audio session, suspending AudioContext.
        // Keep the stream alive to hold the session open; release() stops it when Piano closes.
        this._keepaliveStream = this.currentStream;
      } else {
        this.currentStream.getTracks().forEach(track => track.stop());
      }
      this.currentStream = null;
    }
  }

  release() {
    if(this.released) return;
    this.released = true;
    this.stop();
    if (this._keepaliveStream) {
      this._keepaliveStream.getTracks().forEach(t => t.stop());
      this._keepaliveStream = null;
    }
    this.sharedContext?.removeEventListener('statechange', this.contextStateListener);
    this.sharedContext = this.contextStateListener = null;
    const context = this.audioContext, node = this.workletNode, gain = this.silentGain;
    this.releasePromise = new Promise(resolve => {
      let finished = false, timeout;
      const finish = () => {
        if(finished) return;
        finished = true;
        clearTimeout(timeout);
        if(node) {
          node.port.onmessage = null;
          node.port.close();
          node.disconnect();
        }
        gain?.disconnect();
        const closing = context && context.state !== 'closed' ? context.close() : Promise.resolve();
        closing.catch(error => console.warn("YIN audio cleanup failed", error)).finally(resolve);
      };
      if(!node || context.state === 'closed') return finish();
      // Let process() return false before closing. Only our private, silent context
      // is resumed; shared playback stays untouched. Bound cleanup if resume fails.
      timeout = setTimeout(finish, 1000);
      node.port.onmessage = e => { if(e.data.stopped) finish(); };
      node.port.postMessage({ stop: true });
      context.resume().catch(finish);
    });
    this.highPassFilter?.disconnect();
    this.workletNode = this.highPassFilter = this.silentGain = null;
    this.callback = null;
    this.audioContext = null;
    this.recentFrequencies.length = this.recentConfidences.length = 0;
    this.lastValidFreq = null;
  }

  setA4Frequency(freq) {
    if (freq > 0) {
      this.a4Freq = freq;
    }
  }

  smoothFrequency(freq, confidence) {
    // If frequency changed significantly (more than a semitone), reset smoothing buffer
    if (this.recentFrequencies.length > 0) {
      let lastWeightedAvg = this.getWeightedAverage(this.recentFrequencies, this.recentConfidences);
      let semitoneDiff = Math.abs(12 * Math.log2(freq / lastWeightedAvg));
      if (semitoneDiff > 1.0) {
        // Frequency jumped more than a semitone, reset buffers
        this.recentFrequencies.length = 0;
        this.recentConfidences.length = 0;
      }
    }
    this.recentFrequencies.push(freq);
    this.recentConfidences.push(confidence);
    if (this.recentFrequencies.length > this.smoothingWindow) {
      this.recentFrequencies.shift();
      this.recentConfidences.shift();
    }
    // Use confidence-weighted average (lower confidence = higher weight)
    return this.getWeightedAverage(this.recentFrequencies, this.recentConfidences);
  }

  getWeightedAverage(freqs, confidences) {
    // Lower aperiodicity = higher weight (invert confidence)
    let weightedSum = 0;
    let weightSum = 0;
    for (let i = 0; i < freqs.length; i++) {
      let weight = 1.0 - confidences[i]; // Lower confidence value = higher weight
      weightedSum += freqs[i] * weight;
      weightSum += weight;
    }
    return weightSum > 0 ? weightedSum / weightSum : freqs[freqs.length - 1];
  }

  freqToMidi(freq, a4Freq = 440) {
    let halfSteps = 12 * Math.log2(freq / a4Freq);
    let noteNum = Math.round(halfSteps) + 69;
    let targetFreq = a4Freq * Math.pow(2, (noteNum - 69) / 12);
    let cents = Math.round(1200 * Math.log2(freq / targetFreq));
    return { cents, midi: noteNum };
  }

}
