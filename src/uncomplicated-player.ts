import { Players, QueueMutationCallback } from './uncomplicated-interfaces';
import UncomplicatedPlayerQueue from './uncomplicated-player-queue';
interface UncomplicatedPlayer {
    play(): boolean;
    volIncrease(): number;
    volDecrease(): number;
    get queue(): UncomplicatedPlayerQueue;
    set prefetch(prefetchVal: boolean);
}

/**
 * Player mechanism:
 * We use multiple MediaElementAudioSourceNode in an array and cycle over them
 * for tracks. Array size is determined my prefetch size which in turn
 * determines seek length of the queue.
 * This prefetch array helps in smoother audio transitions when switching
 * tracks as all the tracks in the array have their source set and hence a
 * buffer of data ready.
 * When we go next on the player, essentially the current player index is
 * updated with +1 mod length of track. And the other indexes are adjusted
 * accordingly.
 *
 * Explanation with diagram:
 *
 *  track1, track2, track3                  track4, track2, track3
 * [node_1, node_2, node_3]     next       [node_1, node_2, node_3]
 *    0       1       2       ------->        0       1        2
 *  prev     curr    next                    next    prev     curr
 *
 * Here we essentially changed the source of node_1 from track1 to track4 and
 * change our curr/next/prev indexes.
 * In this player, we expand this logic to involve more than 3 nodes.
 */

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
        let playersCount: number = 7; // = 2 x prefetch_size + 1
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

        // return array of next players
        const getNextPlayers = (): number[] => {
            let indexes: number[] = [];
            for (let i = 1; i <= _prefetchSize; ++i) {
                indexes.push(
                    _currentPlayer + i < playersCount
                        ? _currentPlayer + i
                        : (_currentPlayer + i) % playersCount
                );
            }
            return indexes;
        };
        // get array of prev players
        const getPrevPlayers = (): number[] => {
            let indexes: number[] = [];
            for (let i = 1; i <= _prefetchSize; ++i) {
                indexes.push(
                    _currentPlayer - i >= 0
                        ? _currentPlayer - i
                        : _currentPlayer - i + playersCount
                );
            }
            return indexes;
        };
        // players cycle forward
        const playerCycleNext = () => {
            _currentPlayer =
                _currentPlayer < playersCount - 1 ? _currentPlayer + 1 : 0;
        };
        // players cycle back
        const playerCyclePrev = () => {
            _currentPlayer =
                _currentPlayer > 0 ? _currentPlayer - 1 : playersCount - 1;
        };

        ///////////////////////////////
        ///////////////////////////////
        ////// public functions ///////

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
