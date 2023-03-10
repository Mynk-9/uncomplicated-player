import { CrossfadeParams } from './uncomplicated-interfaces';
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
    get smoothGainTransition(): {
        enabled: boolean;
        duration: number;
    };
    set smoothGainTransition(params: {
        enabled?: boolean;
        duration?: number;
    });
    get prefetch(): {
        enabled: boolean;
        size?: number;
    };
    set prefetch(params: {
        enabled: boolean;
        size?: number;
    });
    get crossfade(): CrossfadeParams;
    set crossfade(params: Partial<CrossfadeParams>);
    get queue(): UncomplicatedPlayerQueue;
    get logging(): boolean;
    set logging(enableLogging: boolean);
    set logger(func: {
        (log: any[]): void;
    });
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
declare const UncomplicatedPlayer: {
    /**
     * Creates an instance with the provided parameters. Can be only called
     * once before any call of getInstance.
     * @param {AudioContextLatencyCategory} latencyMode defaults to playback
     *              use interactive if being used for interactive audio and
     *              not simple music playing functionality.
     * @returns true if instance created, false if instance was already created
     */
    initInstance: (latencyMode: AudioContextLatencyCategory | undefined, logging: boolean | undefined, logger: (...log: any) => void) => boolean;
    /**
     * Gets the already existing instance of UncomplicatedPlayer or creates
     * new instance if no existing instance is present. New instance
     * created with default parameters. Use initInstance to modify initial
     * params.
     * @returns UncomplicatedPlayer instance
     */
    getInstance: () => UncomplicatedPlayer;
};
export default UncomplicatedPlayer;
