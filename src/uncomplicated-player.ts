import { Players, QueueMutationCallback } from './uncomplicated-interfaces';
import UncomplicatedPlayerQueue from './uncomplicated-player-queue';
interface UncomplicatedPlayer {
    play(): boolean;
    volIncrease(): number;
    volDecrease(): number;
    get queue(): UncomplicatedPlayerQueue;
    get prefetch(): { enabled: boolean; size?: number };
    set prefetch(params: { enabled: boolean; size?: number });
    get logging(): boolean;
    set logging(enableLogging: boolean);
    set logger(func: { (log: string): void });
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

        // logging state and method
        let loggingState: boolean = false;
        let logger: { (log: string): void } = () => {};

        ///////////////////////////////
        ///////////////////////////////
        ////// private functions //////

        // logging utility
        const makeLog = (log: string, ...params: any[]) => {
            if (loggingState) {
                logger(log);
                params.forEach(param => {
                    logger('' + param);
                });
            }
        };

        // create new player
        const createPlayer = (): Players => {
            let newPlayer = {
                sourceNode: audioContext.createMediaElementSource(new Audio()),
                gainNode: audioContext.createGain(),
            };
            newPlayer.sourceNode.connect(newPlayer.gainNode);
            // allow cors
            newPlayer.sourceNode.mediaElement.crossOrigin = 'anonymous';
            // enable prefetch of track
            newPlayer.sourceNode.mediaElement.preload = 'auto';
            newPlayer.gainNode.connect(audioContext.destination);
            newPlayer.gainNode.gain.value = globalGain;

            return newPlayer;
        };

        // init the players
        const initPlayers = () => {
            for (let i = 0; i < playersCount; ++i) players[i] = createPlayer();
        };

        // stops the player(s); pauses the MediaElementAudioSourceNode
        // stops all players if index not provided
        const playerStop = (index?: number) => {
            if (!index) {
                players.forEach(player =>
                    player.sourceNode.mediaElement.pause()
                );
            } else players[index].sourceNode.mediaElement.pause();
        };

        // switch from player1 to player2 according to various configs
        const switchPlayers = (oldIndex: number, newIndex: number) => {
            // TODO: implement crossfading
            if (oldIndex === newIndex) return;
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

            // if queue has nulls then we set blank src to Audio Source node

            nextPlayers.forEach((playerIndex, i) => {
                if (!nextSeek[i])
                    players[playerIndex].sourceNode.mediaElement.src = '';
                else if (
                    players[playerIndex].sourceNode.mediaElement.src !==
                    nextSeek[i].src.toString()
                )
                    players[playerIndex].sourceNode.mediaElement.src =
                        nextSeek[i].src.toString();
            });
            prevPlayers.forEach((playerIndex, i) => {
                if (!prevSeek[i])
                    players[playerIndex].sourceNode.mediaElement.src = '';
                else if (
                    players[playerIndex].sourceNode.mediaElement.src !==
                    prevSeek[i].src.toString()
                )
                    players[playerIndex].sourceNode.mediaElement.src =
                        prevSeek[i].src.toString();
            });
        };

        // adjust players array when prefetch size is changed
        const adjustPlayers = () => {
            if (_prefetchSize === ucpQueue.seekLength) return;

            let diff: number = 2 * ucpQueue.seekLength + 1 - playersCount;

            if (diff > 0) {
                // new players added
                players.push(createPlayer());
                initPlayers();
                updatePrefetch();
            } else {
                // players removed
                // TODO: implement selectively splicing the array to prevent
                //       prefetch updates
                players.splice(players.length - diff, diff);
                updatePrefetch();
            }

            _prefetchSize = ucpQueue.seekLength;
            playersCount = 2 * _prefetchSize + 1;
        };

        // function called every time queue is mutated, makes sure queue and
        // player are on the same page.
        const queueMutationCallback: QueueMutationCallback = (args: any[]) => {
            if (!args) return;

            let oldCurrentIndex: number = _currentPlayer;
            let oldCurrentSrc: string =
                players[_currentPlayer].sourceNode.mediaElement.src;
            let newCurrentIndex: number = oldCurrentIndex;
            let newCurrentSrc: string = oldCurrentSrc;

            switch (args[0]) {
                case 'push':
                case 'pushMany': {
                    // if previously empty, current would have been changed
                    // update current track if it has updated
                    if (
                        ucpQueue.current &&
                        players[_currentPlayer].sourceNode.mediaElement.src !==
                            ucpQueue.current.src.toString()
                    ) {
                        players[_currentPlayer].sourceNode.mediaElement.src =
                            ucpQueue.current.src.toString();
                    }
                    break;
                }
                case 'addNext': {
                    // simply need to update the prefetch
                    break;
                }
                case 'pop':
                case 'remove': {
                    // if current is null then it means that queue is
                    // empty ahead too
                    if (!ucpQueue.current) playerStop();
                    // else just update the prefetch and keep intact current
                    // player index
                    break;
                }
                case 'clear':
                    // stop the playing and clear the current src
                    // and clear the prefetch
                    playerStop();
                    players[_currentPlayer].sourceNode.mediaElement.src = '';
                    break;
                case 'next': {
                    // cycle to next and update prefetch
                    playerCycleNext();
                    newCurrentIndex = _currentPlayer;
                    break;
                }
                case 'prev': {
                    // cycle to next and update prefetch
                    playerCyclePrev();
                    newCurrentIndex = _currentPlayer;
                    break;
                }
                case 'reset': {
                    // update current and update the prefetch
                    if (ucpQueue.current)
                        players[_currentPlayer].sourceNode.mediaElement.src =
                            ucpQueue.current.src.toString();
                    else
                        players[_currentPlayer].sourceNode.mediaElement.src =
                            '';
                    break;
                }
                case 'seekLength':
                case 'setDefaultSeekLength': {
                    // adjust players array and prefetch
                    adjustPlayers();
                    break;
                }
                case 'shuffle':
                    // simply update the prefetch
                    break;
                default:
                    // nothing to do
                    return;
            }

            switchPlayers(oldCurrentIndex, newCurrentIndex);
            updatePrefetch();
        };

        // inits the queue, sets up mutation callback etc.
        const initQueue = () => {
            ucpQueue._mutationCallback = queueMutationCallback;
        };

        ///////////////////////////////
        ///////////////////////////////
        /////////// inits /////////////

        initQueue();
        initPlayers();

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
            get logging(): boolean {
                return loggingState;
            },
            set logging(loggingEnabled: boolean) {
                loggingState = loggingEnabled;
            },
            set logger(func: { (log: string): void }) {
                logger = func;
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
