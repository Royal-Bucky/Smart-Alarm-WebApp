type SoundType = 'alarm' | 'timer' | 'notification' | 'gentle' | 'urgent';

interface SoundConfig {
  frequencies: number[];
  pattern: number[];
  volume: number;
  fadeOut: boolean;
}

class EnhancedAudioManager {
  private audioContext: AudioContext | null = null;
  private sounds: Map<SoundType, HTMLAudioElement> = new Map();
  private isPlaying = false;
  private currentSoundType: SoundType | null = null;
  private loopInterval: NodeJS.Timeout | null = null;
  private fadeOutTimeout: NodeJS.Timeout | null = null;
  private volume = 0.7;

  // Sound configurations for different alarm types
  private soundConfigs: Record<SoundType, SoundConfig> = {
    alarm: {
      frequencies: [800, 600, 800, 600],
      pattern: [300, 100, 300, 100, 300, 700], // tone, pause, tone, pause, tone, long pause
      volume: 0.7,
      fadeOut: false,
    },
    timer: {
      frequencies: [1000, 800, 600],
      pattern: [200, 50, 200, 50, 200, 1000],
      volume: 0.5,
      fadeOut: true,
    },
    notification: {
      frequencies: [600, 800],
      pattern: [150, 50, 150, 1000],
      volume: 0.4,
      fadeOut: true,
    },
    gentle: {
      frequencies: [440, 550, 660],
      pattern: [500, 200, 400, 200, 300, 2000],
      volume: 0.3,
      fadeOut: true,
    },
    urgent: {
      frequencies: [1000, 1200, 1000, 1200, 1000],
      pattern: [100, 50, 100, 50, 100, 50, 100, 50, 100, 300],
      volume: 0.8,
      fadeOut: false,
    },
  };

  constructor() {
    this.initializeAudio();
    this.preloadSounds();
  }

  private initializeAudio() {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      console.log('✅ Web Audio API initialized');
    } catch (error) {
      console.warn('⚠️ Web Audio API not supported, using HTML5 Audio fallback');
    }
  }

  private preloadSounds() {
    // Generate and preload all sound types
    Object.keys(this.soundConfigs).forEach(soundType => {
      const config = this.soundConfigs[soundType as SoundType];
      const audioData = this.generateSound(soundType as SoundType, config);
      const audio = new Audio(audioData);
      audio.preload = 'auto';
      audio.volume = config.volume * this.volume;
      this.sounds.set(soundType as SoundType, audio);
    });
  }

  private generateSound(type: SoundType, config: SoundConfig): string {
    const sampleRate = 44100;
    const totalDuration = config.pattern.reduce((sum, duration) => sum + duration, 0) / 1000;
    const samples = Math.floor(sampleRate * totalDuration);
    const buffer = new ArrayBuffer(samples * 2);
    const view = new DataView(buffer);

    let currentSample = 0;
    let freqIndex = 0;

    for (let i = 0; i < config.pattern.length; i += 2) {
      const toneDuration = config.pattern[i] / 1000;
      const pauseDuration = (config.pattern[i + 1] || 0) / 1000;
      const frequency = config.frequencies[freqIndex % config.frequencies.length];
      
      // Generate tone
      const toneSamples = Math.floor(sampleRate * toneDuration);
      for (let j = 0; j < toneSamples && currentSample < samples; j++, currentSample++) {
        const t = j / sampleRate;
        let sample = Math.sin(2 * Math.PI * frequency * t) * config.volume;

        // Apply envelope
        const fadeInTime = 0.01;
        const fadeOutTime = config.fadeOut ? Math.min(0.1, toneDuration * 0.3) : 0.01;
        
        if (t < fadeInTime) {
          sample *= t / fadeInTime;
        } else if (t > toneDuration - fadeOutTime) {
          sample *= (toneDuration - t) / fadeOutTime;
        }

        // Add slight harmonic for richer sound
        sample += Math.sin(2 * Math.PI * frequency * 2 * t) * config.volume * 0.1;

        const intSample = Math.floor(sample * 32767);
        view.setInt16(currentSample * 2, intSample, true);
      }

      // Generate pause (silence)
      const pauseSamples = Math.floor(sampleRate * pauseDuration);
      for (let j = 0; j < pauseSamples && currentSample < samples; j++, currentSample++) {
        view.setInt16(currentSample * 2, 0, true);
      }

      freqIndex++;
    }

    return this.createAudioDataURL(buffer, sampleRate);
  }

  private createAudioDataURL(buffer: ArrayBuffer, sampleRate: number): string {
    const wavHeader = this.createWavHeader(buffer.byteLength, sampleRate);
    const wavBuffer = new ArrayBuffer(wavHeader.byteLength + buffer.byteLength);
    const wavView = new Uint8Array(wavBuffer);
    
    wavView.set(new Uint8Array(wavHeader), 0);
    wavView.set(new Uint8Array(buffer), wavHeader.byteLength);

    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  }

  private createWavHeader(dataLength: number, sampleRate: number): ArrayBuffer {
    const buffer = new ArrayBuffer(44);
    const view = new DataView(buffer);

    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    return buffer;
  }

  public playSound(type: SoundType = 'alarm', options: { loop?: boolean; fadeOutAfter?: number } = {}): void {
    if (this.isPlaying) {
      this.stopSound();
    }

    const sound = this.sounds.get(type);
    if (!sound) {
      console.error(`Sound type '${type}' not found`);
      return;
    }

    this.isPlaying = true;
    this.currentSoundType = type;

    // Resume audio context if suspended
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    const playSound = () => {
      if (!this.isPlaying || !sound) return;
      
      sound.currentTime = 0;
      sound.play().catch(error => {
        console.error('Error playing sound:', error);
      });
    };

    // Play immediately
    playSound();

    // Set up loop if requested
    if (options.loop !== false) {
      const config = this.soundConfigs[type];
      const loopInterval = config.pattern.reduce((sum, duration) => sum + duration, 0);
      
      this.loopInterval = setInterval(playSound, loopInterval);
    }

    // Set up auto fade-out if specified
    if (options.fadeOutAfter) {
      this.fadeOutTimeout = setTimeout(() => {
        this.fadeOutAndStop();
      }, options.fadeOutAfter);
    }
  }

  public playAlarm(): void {
    this.playSound('alarm', { loop: true });
  }

  public playTimer(): void {
    this.playSound('timer', { loop: false, fadeOutAfter: 5000 });
  }

  public playNotification(): void {
    this.playSound('notification', { loop: false });
  }

  public playGentleAlarm(): void {
    this.playSound('gentle', { loop: true, fadeOutAfter: 30000 });
  }

  public playUrgentAlarm(): void {
    this.playSound('urgent', { loop: true });
  }

  private fadeOutAndStop(): void {
    if (!this.isPlaying || !this.currentSoundType) return;

    const sound = this.sounds.get(this.currentSoundType);
    if (!sound) return;

    const fadeSteps = 20;
    const fadeInterval = 100;
    const originalVolume = sound.volume;
    let currentStep = 0;

    const fadeInterval_id = setInterval(() => {
      currentStep++;
      const newVolume = originalVolume * (1 - currentStep / fadeSteps);
      sound.volume = Math.max(0, newVolume);

      if (currentStep >= fadeSteps) {
        clearInterval(fadeInterval_id);
        this.stopSound();
        sound.volume = originalVolume; // Reset volume for next play
      }
    }, fadeInterval);
  }

  public stopSound(): void {
    this.isPlaying = false;
    this.currentSoundType = null;

    // Clear intervals and timeouts
    if (this.loopInterval) {
      clearInterval(this.loopInterval);
      this.loopInterval = null;
    }

    if (this.fadeOutTimeout) {
      clearTimeout(this.fadeOutTimeout);
      this.fadeOutTimeout = null;
    }

    // Stop all sounds
    this.sounds.forEach(sound => {
      sound.pause();
      sound.currentTime = 0;
    });
  }

  // Legacy methods for compatibility
  public stopAlarm(): void {
    this.stopSound();
  }

  public isAlarmPlaying(): boolean {
    return this.isPlaying;
  }

  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    
    // Update all preloaded sounds
    this.sounds.forEach((sound, type) => {
      const config = this.soundConfigs[type];
      sound.volume = config.volume * this.volume;
    });
  }

  public getVolume(): number {
    return this.volume;
  }

  public getCurrentSoundType(): SoundType | null {
    return this.currentSoundType;
  }

  public async requestAudioPermission(): Promise<boolean> {
    try {
      if (this.audioContext && this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Test play a very quiet sound to ensure permission
      const testSound = this.sounds.get('notification');
      if (testSound) {
        const originalVolume = testSound.volume;
        testSound.volume = 0.01;
        await testSound.play();
        testSound.pause();
        testSound.currentTime = 0;
        testSound.volume = originalVolume;
      }

      return true;
    } catch (error) {
      console.error('Failed to request audio permission:', error);
      return false;
    }
  }

  // Additional utility methods
  public previewSound(type: SoundType): void {
    this.playSound(type, { loop: false });
    setTimeout(() => this.stopSound(), 2000);
  }

  public getSoundTypes(): SoundType[] {
    return Object.keys(this.soundConfigs) as SoundType[];
  }

  public dispose(): void {
    this.stopSound();
    
    // Clean up audio context
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }

    // Clean up sound URLs
    this.sounds.forEach(sound => {
      if (sound.src.startsWith('blob:')) {
        URL.revokeObjectURL(sound.src);
      }
    });
    
    this.sounds.clear();
  }
}

// Export singleton instance
export const audioManager = new EnhancedAudioManager();

// Export types
export type { SoundType };