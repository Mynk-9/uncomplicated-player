import {
    Players,
    QueueMutationCallback,
    CrossfadeParams,
    UncomplicatedConfig,
} from './uncomplicated-interfaces';
import UncomplicatedPlayerQueue from './uncomplicated-player-queue';

interface UncomplicatedPlayer {
    get playState(): boolean;
    play(): void;
    pause(): void;

    volIncrease(): number;
    volDecrease(): number;
    get volume(): number;
    set volume(volume: number);
    get gainDelta(): number;
    set gainDelta(delta: number);
    get enableGainBoost(): boolean;
    set enableGainBoost(enable: boolean);
    get smoothGainTransition(): { enabled: boolean; duration: number };
    set smoothGainTransition(params: { enabled?: boolean; duration?: number });

    get prefetch(): { enabled: boolean; size?: number };
    set prefetch(params: { enabled: boolean; size?: number });

    get crossfade(): CrossfadeParams;
    set crossfade(params: Partial<CrossfadeParams>);

    get queue(): UncomplicatedPlayerQueue;
    get logging(): boolean;
    set logging(enableLogging: boolean);
    set logger(func: { (log: any[]): void });
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
 *
 * Audio Nodes connection:
 * MediaElementAudioSourceNode --> crossfade node (GainNode)
 *                                           |
 *                                           V
 *       Audio Destination     <--    volume node (GainNode)
 */

/**
 * Uncomplicated player.
 */
const UncomplicatedPlayer = (() => {
    /// instance of the player
    let instance: UncomplicatedPlayer;

    const init = (
        latencyMode: AudioContextLatencyCategory = 'playback',
        __logging = false,
        __logger: { (...log: any): void } = Function
    ): UncomplicatedPlayer => {
        ///////////////////////////////
        ///////////////////////////////
        ////// private variables //////

        // setting up audio context
        const AudioContext = window.AudioContext;
        const audioContext = new AudioContext({
            latencyHint: latencyMode,
        });

        // setting up queue
        const ucpQueue = new UncomplicatedPlayerQueue();

        // players cycling variables
        let _currentPlayer = 0;

        // config setup
        const defaultConfig: UncomplicatedConfig = {
            globalPlay: false,
            globalGain: 1.0,

            gainDelta: 0.1,
            allowGainBoost: false,
            smoothGainTransition: false,
            smoothGainTransitionDuration: 100,

            prefetch: true,
            prefetchSize: 3,

            crossfade: true,
            crossfadeQueue: true,
            crossfadePlaylist: true,
            crossfadeManualSwitch: true,
            crossfadeDuration: 1000,

            loggingState: __logging,
            logger: __logger,
        };
        const config: UncomplicatedConfig = { ...defaultConfig };

        // setting up players
        let playersCount: number = 2 * defaultConfig.prefetchSize + 1;
        const players: Players[] = Array<Players>(playersCount);

        ///////////////////////////////
        ///////////////////////////////
        ////// private functions //////

        // logging utility
        const makeLog = (...logs: any[]) => {
            if (config.loggingState) {
                config.logger('ucp: ', ...logs);
            }
        };

        // create new player
        const createPlayer = (): Players => {
            const newPlayer: Players = {
                sourceNode: audioContext.createMediaElementSource(new Audio()),
                crossfadeNode: audioContext.createGain(),
                gainNode: audioContext.createGain(),
                state: 0,
            };

            // connect source node to crossfade gain node
            newPlayer.sourceNode.connect(newPlayer.crossfadeNode);
            // connect crossfade gain node to main gain node
            newPlayer.crossfadeNode.connect(newPlayer.gainNode);
            // connect gain to destination
            newPlayer.gainNode.connect(audioContext.destination);
            // initially set gain equal to 0
            newPlayer.gainNode.gain.value = 0;

            // allow cors in media element
            newPlayer.sourceNode.mediaElement.crossOrigin = 'anonymous';
            // enable prefetch of track
            newPlayer.sourceNode.mediaElement.preload = 'auto';

            makeLog('createPlayer');

            return newPlayer;
        };

        // init the players
        const initPlayers = () => {
            for (let i = 0; i < playersCount; ++i) players[i] = createPlayer();
            makeLog(`initPlayers - ${0}-${playersCount}`);
        };

        // stops the player(s); pauses the MediaElementAudioSourceNode
        // stops all players if index not provided
        const playerStop = (index?: number) => {
            if (!index) {
                players.forEach(player => {
                    player.sourceNode.mediaElement.pause();
                    player.sourceNode.mediaElement.currentTime = 0;
                });
                makeLog('playerStop - all');
            } else {
                players[index].sourceNode.mediaElement.pause();
                players[index].sourceNode.mediaElement.currentTime = 0;
                makeLog(`playerStop - ${index}`);
            }
        };

        /**
         * Exponentially transition gain to the given value.
         * @param {Players} player player
         * @param {Number} targetGain target gain value
         * @param {Number} duration milliseconds
         * @returns Promise which resolves after the operation is done
         */
        const exponentialGainTransition = (
            gainNode: GainNode,
            targetGain: number,
            duration: number
        ): Promise<void> => {
            if (duration === 0) {
                gainNode.gain.value = targetGain;
                return new Promise(resolvePromise => {
                    resolvePromise();
                });
            }

            const timeConst = duration / 1000 / 5;
            gainNode.gain.cancelAndHoldAtTime(audioContext.currentTime);
            gainNode.gain.setTargetAtTime(
                targetGain,
                audioContext.currentTime,
                timeConst
            );

            return new Promise(resolvePromise => {
                setTimeout(() => resolvePromise(), duration);
            });
        };

        // adjust gain: if smooth gain transition is enabled then smoothly
        // transition the gain of current player and instantly change gain
        // of other players
        const adjustGain = () => {
            if (config.smoothGainTransition) {
                players.forEach((player, i) => {
                    if (_currentPlayer !== i)
                        player.gainNode.gain.value = config.globalGain;
                });
                exponentialGainTransition(
                    players[_currentPlayer].gainNode,
                    config.globalGain,
                    config.smoothGainTransitionDuration
                );
            } else {
                players.forEach(
                    player => (player.gainNode.gain.value = config.globalGain)
                );
            }
        };

        // pauses the player according to the configs
        const playerPause = (player: Players, fade: boolean) => {
            player.state++;
            const playerState = player.state;
            exponentialGainTransition(
                player.crossfadeNode,
                0,
                fade ? config.crossfadeDuration : 0
            )
                .then(() => {
                    // confirm if player state is not changed meanwhile
                    if (player.state === playerState) {
                        player.sourceNode.mediaElement.pause();
                        player.crossfadeNode.gain.cancelAndHoldAtTime(
                            audioContext.currentTime
                        );
                        player.crossfadeNode.gain.value = 0;
                    }
                })
                .catch(() =>
                    makeLog(`Error at pausing player ${_currentPlayer}`)
                );
        };

        // plays the player according to the configs
        const playerPlay = (player: Players, fade: boolean) => {
            player.state++;
            const playerState = player.state;
            makeLog('playerPlay - src -', player.sourceNode.mediaElement.src);
            player.sourceNode.mediaElement.play();
            exponentialGainTransition(
                player.crossfadeNode,
                config.globalGain,
                fade ? config.crossfadeDuration : 0
            )
                .then(() => {
                    // confirm if player state is not changed meanwhile
                    if (player.state === playerState) {
                        player.crossfadeNode.gain.cancelAndHoldAtTime(
                            audioContext.currentTime
                        );
                        player.gainNode.gain.value = config.globalGain;
                    }
                })
                .catch(() =>
                    makeLog(`Error at playing player ${_currentPlayer}`)
                );
        };

        // switch from player1 to player2 while playing
        const switchPlayers = (
            oldIndex: number,
            newIndex: number,
            fade: boolean
        ) => {
            if (oldIndex === newIndex) return;
            players[newIndex].crossfadeNode.gain.value = 0;
            playerPause(players[oldIndex], fade);
            playerPlay(players[newIndex], fade);
            makeLog(`switchPlayers - ${oldIndex}<>${newIndex}`);
        };

        // return array of next players
        const getNextPlayers = (): number[] => {
            const indexes: number[] = [];
            for (let i = 1; i <= config.prefetchSize; ++i) {
                indexes.push(
                    _currentPlayer + i < playersCount
                        ? _currentPlayer + i
                        : (_currentPlayer + i) % playersCount
                );
            }
            makeLog(`getNextPlayers - `, indexes);
            return indexes;
        };

        // get array of prev players
        const getPrevPlayers = (): number[] => {
            const indexes: number[] = [];
            for (let i = 1; i <= config.prefetchSize; ++i) {
                indexes.push(
                    _currentPlayer - i >= 0
                        ? _currentPlayer - i
                        : _currentPlayer - i + playersCount
                );
            }
            indexes.reverse();
            makeLog('getPrevPlayers - ', indexes);
            return indexes;
        };

        // players cycle forward
        const playerCycleNext = () => {
            _currentPlayer =
                _currentPlayer < playersCount - 1 ? _currentPlayer + 1 : 0;
            makeLog(`playerCycleNext - current-${_currentPlayer}`);
        };

        // players cycle backward
        const playerCyclePrev = () => {
            _currentPlayer =
                _currentPlayer > 0 ? _currentPlayer - 1 : playersCount - 1;
            makeLog(`playerCyclePrev - current-${_currentPlayer}`);
        };

        // updates prefetch according to queue mutations
        const updatePrefetch = () => {
            const { next: nextSeek, prev: prevSeek } = ucpQueue.seek;
            makeLog('updatePrefetch - seek -', { nextSeek, prevSeek });
            const nextPlayers: number[] = getNextPlayers();
            const prevPlayers: number[] = getPrevPlayers();

            // if queue has nulls then we set blank src to Audio Source node

            nextPlayers.forEach((playerIndex, i) => {
                if (!nextSeek[i])
                    players[playerIndex].sourceNode.mediaElement.src = '';
                else if (
                    players[playerIndex].sourceNode.mediaElement.src !==
                    nextSeek[i].src.toString()
                ) {
                    makeLog(
                        'updatePrefetch - next - ',
                        playerIndex,
                        players[playerIndex].sourceNode.mediaElement.src,
                        nextSeek[i].src.toString()
                    );
                    players[playerIndex].sourceNode.mediaElement.src =
                        nextSeek[i].src.toString();
                }
            });
            prevPlayers.forEach((playerIndex, i) => {
                if (!prevSeek[i])
                    players[playerIndex].sourceNode.mediaElement.src = '';
                else if (
                    players[playerIndex].sourceNode.mediaElement.src !==
                    prevSeek[i].src.toString()
                ) {
                    makeLog(
                        'updatePrefetch - prev - ',
                        playerIndex,
                        players[playerIndex].sourceNode.mediaElement.src,
                        prevSeek[i].src.toString()
                    );
                    players[playerIndex].sourceNode.mediaElement.src =
                        prevSeek[i].src.toString();
                }
            });

            makeLog('updatePrefetch');
        };

        // adjust players array when prefetch size is changed
        const adjustPlayers = () => {
            if (config.prefetchSize === ucpQueue.seekLength) return;

            let diff: number = 2 * ucpQueue.seekLength + 1 - playersCount;

            if (diff > 0) {
                // new players added
                players.push(createPlayer());
                initPlayers();
                updatePrefetch();
            } else {
                // selectively splice players so that prefetch updates can be prevented
                // make sure diff is positive
                diff = Math.abs(diff);

                const leftRange = [0, 0];
                let rightRange = [0, 0];

                // splice right range first so that _currentPlayer is relevant
                // while splicing left range
                rightRange[0] = _currentPlayer + ucpQueue.seekLength + 1;
                rightRange[1] = rightRange[0] + diff;
                rightRange = rightRange.map(idx =>
                    idx >= playersCount ? playersCount : idx
                );
                players.splice(rightRange[0], rightRange[1] - rightRange[0]);

                // recalculate diff
                diff = Math.abs(2 * ucpQueue.seekLength + 1 - players.length);

                // splice left range now
                leftRange[1] = _currentPlayer - ucpQueue.seekLength - 1;
                leftRange[0] = leftRange[1] - diff + 1;
                if (leftRange[0] < 0) {
                    players.splice(leftRange[0], diff);
                    leftRange[0] = 0;
                }
                players.splice(leftRange[0], leftRange[1] - leftRange[0] + 1);
            }

            config.prefetchSize = ucpQueue.seekLength;
            playersCount = 2 * config.prefetchSize + 1;

            makeLog(`adjustPlayers - ${players.length}`);
        };

        // function called every time queue is mutated, makes sure queue and
        // player are on the same page.
        const queueMutationCallback: QueueMutationCallback = (args: any[]) => {
            if (!args) return;

            const oldCurrentIndex: number = _currentPlayer;
            let newCurrentIndex: number = oldCurrentIndex;
            let fade = false;

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
                    makeLog('Mutation callback - push/pushMany');
                    break;
                }
                case 'addNext': {
                    // simply need to update the prefetch
                    makeLog('Mutation callback - addNext');
                    break;
                }
                case 'pop':
                case 'remove': {
                    // if current is null then it means that queue is
                    // empty ahead too
                    if (!ucpQueue.current) playerStop();
                    // else just update the prefetch and keep intact current
                    // player index
                    makeLog('Mutation callback - pop/remove');
                    break;
                }
                case 'clear':
                    // stop the playing and clear the current src
                    // and clear the prefetch
                    // prefetch gets cleared with updatePrefetch function
                    playerStop();
                    players[_currentPlayer].sourceNode.mediaElement.src = '';
                    makeLog('Mutation callback - clear');
                    break;
                case 'next': {
                    // cycle to next and update prefetch
                    playerCycleNext();
                    newCurrentIndex = _currentPlayer;
                    fade = config.crossfade && config.crossfadeManualSwitch;
                    makeLog('Mutation callback - next');
                    break;
                }
                case 'prev': {
                    // cycle to next and update prefetch
                    playerCyclePrev();
                    newCurrentIndex = _currentPlayer;
                    fade = config.crossfade && config.crossfadeManualSwitch;
                    makeLog('Mutation callback - prev');
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
                    makeLog('Mutation callback - reset');
                    break;
                }
                case 'seekLength':
                case 'setDefaultSeekLength': {
                    // adjust players array and prefetch
                    adjustPlayers();
                    makeLog(
                        'Mutation callback - set seekLength - num or default'
                    );
                    break;
                }
                case 'shuffle':
                    // simply update the prefetch
                    makeLog('Mutation callback - shuffle');
                    break;
                default:
                    // nothing to do
                    makeLog('Mutation callback - illegal operation');
                    return;
            }

            // player switch and prefetch update
            if (config.globalPlay)
                switchPlayers(oldCurrentIndex, newCurrentIndex, fade);
            updatePrefetch();
        };

        // inits the queue, sets up mutation callback etc.
        const initQueue = () => {
            ucpQueue._mutationCallback = queueMutationCallback;
            makeLog('initQueue');
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
            get playState(): boolean {
                return config.globalPlay;
            },

            /// Play the current track
            play: (): void => {
                config.globalPlay = true;
                if (audioContext.state === 'suspended') {
                    audioContext.resume().then(() => {
                        playerPlay(
                            players[_currentPlayer],
                            config.crossfade && config.crossfadeManualSwitch
                        );
                        makeLog(`play player - ${_currentPlayer}`);
                    });
                } else {
                    playerPlay(
                        players[_currentPlayer],
                        config.crossfade && config.crossfadeManualSwitch
                    );
                    makeLog(`play player - ${_currentPlayer}`);
                }
            },

            /// Pause the current track
            pause: (): void => {
                config.globalPlay = false;
                playerPause(
                    players[_currentPlayer],
                    config.crossfade && config.crossfadeManualSwitch
                );
                makeLog(`pause player - ${_currentPlayer}`);
            },

            /// Increase the volume with the provided delta.
            /// Initial value of delta is 0.1
            volIncrease: (): number => {
                makeLog('volIncrease: delta: ', config.gainDelta);
                config.globalGain += config.gainDelta;
                if (!config.allowGainBoost && config.globalGain > 1.0)
                    config.globalGain = 1.0;
                adjustGain();
                return config.globalGain;
            },

            /// Decrease the volume with the provided delta.
            /// Initial value of delta is 0.1
            volDecrease: (): number => {
                makeLog('volDecrease: delta: ', config.gainDelta);
                config.globalGain -= config.gainDelta;
                if (config.globalGain < 0) config.globalGain = 0;
                adjustGain();
                return config.globalGain;
            },

            /// Get the audio volume
            get volume() {
                return config.globalGain;
            },

            /// Set the audio volume
            /// Allowed values: 0.0-1.0 when gain boost disabled
            ///                 0.0-inf when gain boost enabled
            set volume(volume: number) {
                if (volume < 0.0) config.globalGain = 0.0;
                else if (volume > 1.0 && !config.allowGainBoost)
                    config.globalGain = 1.0;
                else config.globalGain = volume;
                adjustGain();
                makeLog(
                    'set volume: ' +
                        'input: ' +
                        volume +
                        ' set: ' +
                        config.globalGain
                );
            },

            /// Get gain delta
            get gainDelta(): number {
                return config.gainDelta;
            },

            /// Set gain delta. Reverts to default value 0.1 if provided value
            /// not in range (0, 1)
            set gainDelta(delta: number) {
                if (0.0 < delta && delta < 1.0) config.gainDelta = delta;
                else config.gainDelta = defaultConfig.gainDelta;
                makeLog('set gain delta:', config.gainDelta);
            },

            /// Get gain boost enabled state
            get enableGainBoost(): boolean {
                return config.allowGainBoost;
            },

            /// Set gain boost enabled state
            set enableGainBoost(enable: boolean) {
                config.allowGainBoost = enable;
                makeLog('set gain boost:', enable ? 'enable' : 'disable');
            },

            /// Get smooth gain transition enabled state and duration
            get smoothGainTransition(): { enabled: boolean; duration: number } {
                return {
                    enabled: config.smoothGainTransition,
                    duration: config.smoothGainTransitionDuration,
                };
            },

            /// Set smooth gain transition enabled state and duration.
            /// smooth gain transition is disabled if provided value is 0
            /// smooth gain transition is reset to default 100ms if value < 0
            set smoothGainTransition(params: {
                enabled?: boolean;
                duration?: number;
            }) {
                if (params.enabled == null)
                    params.enabled = config.smoothGainTransition;
                if (params.duration == null)
                    params.duration =
                        config.smoothGainTransitionDuration ||
                        defaultConfig.smoothGainTransitionDuration;

                if (params.duration === 0) params.enabled = false;
                if (params.duration < 0)
                    params.duration =
                        defaultConfig.smoothGainTransitionDuration;

                config.smoothGainTransition = params.enabled;
                config.smoothGainTransitionDuration = params.duration;

                makeLog(
                    'set smooth gain transition:',
                    config.smoothGainTransition ? 'enabled' : 'disabled',
                    'duration:',
                    config.smoothGainTransitionDuration
                );
            },

            /// Gets the queue object being used by the player to be used
            /// for the various operations available on the queue.
            get queue() {
                return ucpQueue;
            },

            /// Get current prefetch config
            get prefetch(): { enabled: boolean; size?: number } {
                if (config.prefetch)
                    return {
                        enabled: config.prefetch,
                        size: config.prefetchSize,
                    };
                return { enabled: false };
            },

            /// Set prefetch config. Prefetch size is the number of tracks
            /// before and after the current track that the player will fetch
            /// from the source url.
            set prefetch(params: { enabled: boolean; size?: number }) {
                config.prefetch = params.enabled;
                if (params.enabled && params.size) {
                    config.prefetchSize = params.size;
                    ucpQueue.seekLength = params.size;
                } else if (params.enabled) {
                    config.prefetchSize = defaultConfig.prefetchSize;
                    ucpQueue.seekLength = defaultConfig.prefetchSize;
                }

                makeLog('set prefetch');

                adjustPlayers();
            },

            /// Get crossfade state
            get crossfade(): CrossfadeParams {
                return {
                    crossfade: config.crossfade,
                    crossfadeQueue: config.crossfadeQueue,
                    crossfadePlaylist: config.crossfadePlaylist,
                    crossfadeManualSwitch: config.crossfadeManualSwitch,
                    crossfadeDuration: config.crossfadeDuration,
                };
            },

            /// Set crossfade params
            /// Crossfade duration in milliseconds
            /// Disable crossfade if duration is zero
            /// Reset to default value 1000ms if duration < 0
            set crossfade(crossfadeParams: Partial<CrossfadeParams>) {
                // new config = params override current config
                const params: CrossfadeParams = {
                    ...this.crossfade, // using getter defined above
                    ...crossfadeParams,
                };

                if (params.crossfadeDuration === 0) {
                    // disable crossfade instead of duration 0
                    params.crossfadeDuration = config.crossfadeDuration;
                    params.crossfade = false;
                } else if (
                    params.crossfadeDuration &&
                    params.crossfadeDuration < 0
                ) {
                    // if crossfade duration is negative
                    params.crossfadeDuration = defaultConfig.crossfadeDuration;
                }

                config.crossfade = params.crossfade;
                config.crossfadeQueue = params.crossfadeQueue;
                config.crossfadePlaylist = params.crossfadePlaylist;
                config.crossfadeManualSwitch = params.crossfadeManualSwitch;
                config.crossfadeDuration = params.crossfadeDuration;

                makeLog('set crossfade config:', this.crossfade);
            },

            /// Get logging enabled/disabled state.
            get logging(): boolean {
                return config.loggingState;
            },

            /// Set logging enabled/disabled state.
            set logging(loggingEnabled: boolean) {
                config.loggingState = loggingEnabled;
            },

            /// Provide a different logging function than the stock one.
            /// Function should take a string as parameter.
            set logger(func: { (...log: any): void }) {
                config.logger = func;
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
            latencyMode: AudioContextLatencyCategory = 'playback',
            logging = false,
            logger: { (...log: any): void }
        ): boolean => {
            if (instance) return false;
            instance = init(latencyMode, logging, logger);
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
