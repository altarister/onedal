import callSoundPath from '../assets/sound/call.mp3';
import beepSoundPath from '../assets/sound/99C850485CDEB1111A.mp3';
import emergencySoundPath from '../assets/sound/emergency.mp3';

class SoundManager {
    private callAudio: HTMLAudioElement;
    private beepAudio: HTMLAudioElement;
    private emergencyAudio: HTMLAudioElement;

    // 현재 플레이 상태 추적을 통해 불필요한 DOM 에러 방지
    private isRinging: boolean = false;

    // 상태 변경 구독을 위한 리스너
    private listeners: Set<() => void> = new Set();

    // 볼륨 설정 (0.0 ~ 1.0)
    private volume: number = 0.5;

    constructor() {
        this.callAudio = new Audio(callSoundPath);
        this.callAudio.loop = true;
        this.beepAudio = new Audio(beepSoundPath);
        this.emergencyAudio = new Audio(emergencySoundPath);

        // 저장된 볼륨 설정 불러오기
        const savedVolume = localStorage.getItem('onedal_sound_volume');
        if (savedVolume !== null) {
            const parsed = parseFloat(savedVolume);
            if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
                this.volume = parsed;
            }
        }
        
        // 볼륨 일괄 적용
        this.callAudio.volume = this.volume;
        this.beepAudio.volume = this.volume;
        this.emergencyAudio.volume = this.volume;
    }

    /**
     * 볼륨 설정 변경 및 저장
     */
    public setVolume(value: number) {
        this.volume = Math.max(0, Math.min(1, value));
        this.callAudio.volume = this.volume;
        this.beepAudio.volume = this.volume;
        this.emergencyAudio.volume = this.volume;
        localStorage.setItem('onedal_sound_volume', this.volume.toString());
    }

    /**
     * 현재 볼륨 가져오기
     */
    public getVolume(): number {
        return this.volume;
    }

    /**
     * 현재 벨이 울리고 있는지 여부 반환
     */
    public getIsRinging(): boolean {
        return this.isRinging;
    }

    /**
     * 상태 변경 알림 구독
     */
    public subscribe(listener: () => void) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /**
     * 모든 구독자에게 상태 변경 알림
     */
    private notify() {
        this.listeners.forEach(l => l());
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
                this.notify();
                console.log("[SoundManager] 🎵 콜 알림음 재생 시작");
            }).catch((error) => {
                this.isRinging = false;
                this.notify();
                console.warn("[SoundManager] 알림음 재생 차단됨 (브라우저 정책/상호작용 필요):", error);
            });
        } else {
            this.isRinging = true;
            this.notify();
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
        this.notify();
        console.log("[SoundManager] 🔇 콜 알림음 정지");
    }

    /**
     * 모든 활성 루프 사운드 중단 (사용자 인지/Dismiss)
     */
    public stopAll() {
        this.stopCallRinging();
        // 필요시 다른 루프 사운드(비상 알람 루프 등)도 여기서 중단
    }

    /**
     * 2. 오더 상태 변경 (선빵 수신, 카카오 연산 완료 등) 시 울리는 짧은 비프음
     */
    public async playBeep() {
        try {
            this.beepAudio.currentTime = 0;
            await this.beepAudio.play();
        } catch (e) {
            console.error("[SoundManager] 오류: 비프음 재생 실패", e);
        }
    }

    /**
     * 3. 데스밸리/비상 알림 시 울리는 경고 사이렌
     */
    public async playEmergencyAlarm() {
        try {
            this.emergencyAudio.currentTime = 0;
            await this.emergencyAudio.play();
        } catch (e) {
            console.error("[SoundManager] 오류: 비상 알림음 재생 실패", e);
        }
    }
}

export const soundManager = new SoundManager();
