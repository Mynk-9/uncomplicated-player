import { Players, QueueMutationCallback } from './uncomplicated-interfaces';
import UncomplicatedPlayerQueue from './uncomplicated-player-queue';
interface UncomplicatedPlayer {
    play(): boolean;
    volIncrease(): number;
    volDecrease(): number;
    get queue(): UncomplicatedPlayerQueue;
    set prefetch(prefetchVal: boolean);
}

const UncomplicatedPlayer = (() => {
    /// instance of the player
    let instance: UncomplicatedPlayer;

    const init = (
        latencyMode: AudioContextLatencyCategory = 'playback'
    ): UncomplicatedPlayer => {
        ///////////////////////////////
        ///////////////////////////////
        ////// private variables //////

        // setting up audio context
        let AudioContext = window.AudioContext;
        const audioContext = new AudioContext({
            latencyHint: latencyMode,
        });

        // setting up queue
        let ucpQueue = new UncomplicatedPlayerQueue();

        // setting up players
        let playersCount: number = 3;
        let globalGain: number = 1.0;
        let players: Players[] = Array<Players>(playersCount);

        // state variables
        let _prefetch: boolean = true;
        let _prefetchSize: number = 3;

        ///////////////////////////////
        ///////////////////////////////
        ////// private functions //////

        const initPlayers = () => {
            for (let i = 0; i < playersCount; ++i) {
                if (players[i]) continue;
                players[i] = {
                    sourceNode: audioContext.createMediaElementSource(
                        new Audio()
                    ),
                    gainNode: audioContext.createGain(),
                };
                players[i].sourceNode.connect(players[i].gainNode);
                players[i].gainNode.connect(audioContext.destination);
                players[i].gainNode.gain.value = globalGain;
            }
        };

        return {
            play: (): boolean => {
                return true;
            },
            volIncrease: (): number => {
                return 1.0;
            },
            volDecrease: (): number => {
                return 1.0;
            },
            get queue() {
                return ucpQueue;
            },
            set prefetch(prefetchVal: boolean) {
                _prefetch = prefetchVal;
                ucpQueue.seekLength = _prefetchSize;
            },
        };
    };

    return {
        /**
         * Creates an instance with the provided parameters. Can be only called
         * once before any call of getInstance.
         * @param {AudioContextLatencyCategory} latencyMode defaults to playback
         *              use interactive if being used for interactive audio and
         *              not simple music playing functionality.
         * @returns true if instance created, false if instance was already created
         */
        initInstance: (
            latencyMode: AudioContextLatencyCategory = 'playback'
        ): boolean => {
            if (instance) return false;
            instance = init(latencyMode);
            return true;
        },

        /**
         * Gets the already existing instance of UncomplicatedPlayer or creates
         * new instance if no existing instance is present. New instance
         * created with default parameters. Use initInstance to modify initial
         * params.
         * @returns UncomplicatedPlayer instance
         */
        getInstance: (): UncomplicatedPlayer => {
            if (!instance) instance = init();
            return instance;
        },
    };
})();

export default UncomplicatedPlayer;
