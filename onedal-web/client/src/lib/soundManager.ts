import callSoundPath from '../assets/sound/call.mp3';

class SoundManager {
    private audioCtx: AudioContext | null = null;
    private callAudio: HTMLAudioElement;

    // 현재 플레이 상태 추적을 통해 불필요한 DOM 에러 방지
    private isRinging: boolean = false;

    // 볼륨 설정 (0.0 ~ 1.0)
    private volume: number = 0.5;

    constructor() {
        this.callAudio = new Audio(callSoundPath);
        this.callAudio.loop = true;

        // 저장된 볼륨 설정 불러오기
        const savedVolume = localStorage.getItem('onedal_sound_volume');
        if (savedVolume !== null) {
            this.volume = parseFloat(savedVolume);
            this.callAudio.volume = this.volume;
        }
    }

    /**
     * 볼륨 설정 변경 및 저장
     */
    public setVolume(value: number) {
        this.volume = Math.max(0, Math.min(1, value));
        this.callAudio.volume = this.volume;
        localStorage.setItem('onedal_sound_volume', this.volume.toString());
    }

    /**
     * 현재 볼륨 가져오기
     */
    public getVolume(): number {
        return this.volume;
    }

    /**
     * 브라우저 정책(오토플레이 방지)에 대응하기 위해
     * 최초 오디오 발생 시점에 Context를 안전하게 초기화/Resume 하는 헬퍼 메서드
     */
    private async ensureAudioContext(): Promise<AudioContext | null> {
        try {
            if (!this.audioCtx) {
                // @ts-ignore : 구형 사파리 대응
                const Ctx = window.AudioContext || window.webkitAudioContext;
                this.audioCtx = new Ctx();
            }
            if (this.audioCtx.state === 'suspended') {
                await this.audioCtx.resume();
            }
            return this.audioCtx;
        } catch (e) {
            console.warn("AudioContext 초기화 불가:", e);
            return null;
        }
    }

    /**
     * 1. 신규 콜 무한 반복 알림음 (call.mp3) 재생
     */
    public playCallRinging() {
        if (this.isRinging) return;
        
        // 브라우저 정책 상 사용자가 문서와 상호작용하기 전에 play() 호출 시 NotAllowedError 가 발생할 수 있음
        const playPromise = this.callAudio.play();
        
        if (playPromise !== undefined) {
            playPromise.then(() => {
                this.isRinging = true;
                console.log("[SoundManager] 🎵 콜 알림음 재생 시작");
            }).catch((error) => {
                this.isRinging = false;
                console.warn("[SoundManager] 알림음 재생 차단됨 (브라우저 정책/상호작용 필요):", error);
            });
        } else {
            this.isRinging = true;
        }
    }

    /**
     * 신규 콜 알림음 정지 및 초기화
     */
    public stopCallRinging() {
        if (!this.isRinging) return; // 이미 꺼져있으면 무시
        
        this.callAudio.pause();
        this.callAudio.currentTime = 0;
        this.isRinging = false;
        console.log("[SoundManager] 🔇 콜 알림음 정지");
    }

    /**
     * 2. 오더 상태 변경 (선빵 수신, 카카오 연산 완료 등) 시 울리는 짧은 비프음
     */
    public async playBeep() {
        const ctx = await this.ensureAudioContext();
        if (!ctx) return;

        try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.type = "sine";
            osc.frequency.value = 880; // A5 톤
            
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.1 * this.volume, ctx.currentTime + 0.05);
            gain.gain.exponentialRampToValueAtTime(Math.max(0.001, 0.001 * this.volume), ctx.currentTime + 0.3);
            gain.gain.setValueAtTime(0, ctx.currentTime + 0.34); // 클릭 노이즈 방지
            
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.35);
            osc.onended = () => { osc.disconnect(); gain.disconnect(); };
        } catch (e) {
            console.error("[SoundManager] 오류: 비프음 발생 실패", e);
        }
    }

    /**
     * 3. 데스밸리/비상 알림 시 울리는 경고 사이렌
     */
    public async playEmergencyAlarm() {
        const ctx = await this.ensureAudioContext();
        if (!ctx) return;

        try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.type = "sawtooth";
            gain.gain.value = 0.4 * this.volume;

            // WebAudio 스케줄링으로 정밀 제어 (setTimeout 제거)
            osc.frequency.setValueAtTime(440, ctx.currentTime);       // 0~200ms: 낮은 음
            osc.frequency.setValueAtTime(880, ctx.currentTime + 0.2); // 200~400ms: 높은 음
            
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.4);
            osc.onended = () => { osc.disconnect(); gain.disconnect(); };
        } catch (e) {
            console.error("[SoundManager] 오류: 비상 알림음 발생 실패", e);
        }
    }
}

export const soundManager = new SoundManager();
