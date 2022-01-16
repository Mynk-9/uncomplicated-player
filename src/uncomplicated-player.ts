import { Players, QueueMutationCallback } from './uncomplicated-interfaces';
import UncomplicatedPlayerQueue from './uncomplicated-player-queue';
interface UncomplicatedPlayer {
    play(): boolean;
    volIncrease(): number;
    volDecrease(): number;
    get queue(): UncomplicatedPlayerQueue;
    get prefetch(): { enabled: boolean; size?: number };
    set prefetch(params: { enabled: boolean; size?: number });
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
        let players: Players[] = Array<Players>(playersCount);

        // global players states
        let globalPlay: boolean = false;
        let globalGain: number = 1.0;

        // players cycling variables
        let _currentPlayer = 0;

        // player state variables
        let _prefetch: boolean = true;
        const _defaultPrefetchSize: number = 3;
        let _prefetchSize: number = _defaultPrefetchSize;

        ///////////////////////////////
        ///////////////////////////////
        ////// private functions //////

        // switch from player1 to player2 according to various configs
        const switchPlayers = (oldIndex: number, newIndex: number) => {
            // TODO: implement crossfading
            players[oldIndex].sourceNode.mediaElement.pause();
            players[newIndex].sourceNode.mediaElement.play();
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

        // updates prefetch according to queue mutations
        const updatePrefetch = () => {
            let { next: nextSeek, prev: prevSeek } = ucpQueue.seek;
            let nextPlayers: number[] = getNextPlayers();
            let prevPlayers: number[] = getPrevPlayers();

            nextPlayers.forEach((playerIndex, i) => {
                if (
                    players[playerIndex].sourceNode.mediaElement.src !==
                    nextSeek[i].src.toString()
                )
                    players[playerIndex].sourceNode.mediaElement.src =
                        nextSeek[i].src.toString();
            });
            prevPlayers.forEach((playerIndex, i) => {
                if (
                    players[playerIndex].sourceNode.mediaElement.src !==
                    prevSeek[i].src.toString()
                )
                    players[playerIndex].sourceNode.mediaElement.src =
                        prevSeek[i].src.toString();
            });
        };

        const initPlayers = () => {
            for (let i = 0; i < playersCount; ++i) {
                players[i] = {
                    sourceNode: audioContext.createMediaElementSource(
                        new Audio()
                    ),
                    gainNode: audioContext.createGain(),
                };
                players[i].sourceNode.connect(players[i].gainNode);
                // allow cors
                players[i].sourceNode.mediaElement.crossOrigin = 'anonymous';
                // enable prefetch of track
                players[i].sourceNode.mediaElement.preload = 'auto';
                players[i].gainNode.connect(audioContext.destination);
                players[i].gainNode.gain.value = globalGain;
            }
        };

        const initQueue = () => {
            ucpQueue._mutationCallback = queueMutationCallback;
        };

        const adjustPlayers = () => {
            // TODO: implement to adjust players array when
            // playersCount (= 2 x prefetch_size + 1) is changed
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
            get prefetch(): { enabled: boolean; size?: number } {
                if (_prefetch)
                    return { enabled: _prefetch, size: _prefetchSize };
                return { enabled: false };
            },
            set prefetch(params: { enabled: boolean; size?: number }) {
                _prefetch = params.enabled;
                if (params.enabled && params.size) {
                    _prefetchSize = params.size;
                    ucpQueue.seekLength = params.size;
                } else if (params.enabled) {
                    _prefetchSize = _defaultPrefetchSize;
                    ucpQueue.seekLength = _defaultPrefetchSize;
                }

                adjustPlayers();
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
